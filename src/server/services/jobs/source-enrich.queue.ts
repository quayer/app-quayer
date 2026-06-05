/**
 * source-enrich.queue — fila BullMQ que processa a ASYNC enrichment de fontes
 * "cole seu site/IG" do Builder (Orayon Uplift, fase W4 source-ingestion).
 *
 * Fluxo (spec §5):
 *   chat.routes.ts cria os KnowledgeSource (status por URL) inline no turno do
 *   SSE → ENFILEIRA aqui (nunca processa inline) → o worker chama
 *   `runSourceEnrich` (source-enrich.job.ts, outro agente) que faz
 *   ingestSource() (extract→chunk→embed→pgvector) + síntese padrão
 *   niche-researcher e ESCREVE SÓ valores PROPOSTOS em
 *   builderState.sourceIngestion.proposed. Os campos owned/confirmados só
 *   flipam quando o usuário clica "Aceitar" no card source_progress.
 *
 * Este arquivo (Leaf) é só a CAMADA DE FILA:
 *   - SOURCE_ENRICH_QUEUE  → nome da fila ('quayer:source-enrich')
 *   - enqueueSourceEnrich  → producer (dev: fallback síncrono atrás de flag)
 *   - registerSourceEnrichWorker → registra o Worker (entrypoint dedicado)
 *
 * O HANDLER (`runSourceEnrich`) vive em ./source-enrich.job.ts (outro agente).
 * Importamos lazy (dynamic import) e por TIPO — definimos aqui o
 * `RunSourceEnrich` esperado para o worker ficar tipado mesmo antes do job
 * existir. O job deve exportar exatamente `runSourceEnrich: RunSourceEnrich`.
 *
 * Convenção: queues sempre prefixadas com "quayer:" no Redis (isola de outros
 * apps no mesmo cluster). parseRedisUrl + wiring copiados de ./index.ts.
 */

import type { ConnectionOptions } from 'bullmq'
import { Queue, Worker } from 'bullmq'
import {
  withTrace,
  getTraceId,
  newTraceId,
} from '@/server/ai-module/ai-agents/infra/trace-context.service'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const SOURCE_ENRICH_QUEUE = 'quayer:source-enrich'
export const SOURCE_ENRICH_JOB_NAME = 'source-enrich-run'

/**
 * Flag de dev: quando ligada, `enqueueSourceEnrich` NÃO enfileira — chama o
 * handler direto (síncrono), útil em dev onde nenhum worker dedicado está de
 * pé. Em homol/prod fica desligada e o trabalho roda sempre no worker async.
 *
 * Aceita '1' | 'true' (case-insensitive). Default: desligada.
 */
const SYNC_FALLBACK_ENV = 'SOURCE_ENRICH_SYNC'

function syncFallbackEnabled(): boolean {
  const raw = (process.env[SYNC_FALLBACK_ENV] ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true'
}

// ---------------------------------------------------------------------------
// Contrato do payload + handler
// ---------------------------------------------------------------------------

/**
 * Payload de um job de enrichment. Carrega só IDs (nunca objetos grandes):
 *   - As fontes JÁ existem como KnowledgeSource (criadas inline no turno SSE);
 *     `sourceIds` aponta para elas, o worker recarrega do DB.
 *   - `organizationId` guarda multi-tenant: o handler revalida a posse de cada
 *     KnowledgeSource e filtra TODA query por org (ingestSource já tem
 *     expectedOrganizationId; a síntese + escrita do builderState também).
 *   - `conversationId` é onde o proposal é escrito
 *     (builderState.sourceIngestion.proposed).
 *   - `userId` permite resolver a BYOK org key (mesmo padrão niche-researcher).
 *
 * Mantido como interface simples (serializável p/ Redis) — o job dono define o
 * Zod de validação na ponta dele.
 */
export interface SourceEnrichJobPayload {
  readonly organizationId: string
  readonly userId: string
  readonly projectId: string
  readonly conversationId: string
  /** IDs dos KnowledgeSource já criados (status pending) a enriquecer. */
  readonly sourceIds: string[]
}

/**
 * Resultado mínimo do handler (espelha o shape de IngestResult agregado +
 * flag de síntese). O job dono pode estender, mas DEVE ser atribuível a isto
 * para o worker tipar o retorno.
 */
export interface SourceEnrichResult {
  /** Total de fontes processadas no job. */
  processed: number
  /** Quantas chegaram a status ready (ingestão ok). */
  ingested: number
  /** Quantas falharam (ingestão/extração). */
  errors: number
  /** True se a síntese gerou um proposal escrito no builderState. */
  proposalWritten: boolean
}

/**
 * Assinatura ESPERADA do handler exportado por ./source-enrich.job.ts.
 * O job dono implementa `export const runSourceEnrich: RunSourceEnrich`.
 * Definida aqui para o worker ficar tipado mesmo antes do job existir
 * (dependência por TIPO, não por valor — import lazy resolve o valor).
 */
export type RunSourceEnrich = (
  payload: SourceEnrichJobPayload,
  traceId?: string,
) => Promise<SourceEnrichResult>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * parseRedisUrl — idêntico ao de ./index.ts (session-close). Mantemos cópia
 * local para a fila não depender do módulo de registry (evita acoplamento e
 * imports circulares no entrypoint de workers).
 */
function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url)
  const password = u.password ? decodeURIComponent(u.password) : undefined
  return {
    host: u.hostname,
    port: Number(u.port || '6379'),
    password,
    db: u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : undefined,
  }
}

/**
 * Specifier do job dono. Construído como expressão (não literal) de propósito:
 * o handler `runSourceEnrich` é arquivo de OUTRO agente e pode não existir
 * ainda quando esta fila compila (Leaf primeiro). Um `import('./source-enrich.job')`
 * literal faria o tsc resolver estaticamente e quebrar o build standalone.
 * O caminho é relativo e resolve em runtime para ./source-enrich.job.
 *
 * DEVIATION (documentada): import por TIPO (RunSourceEnrich) + specifier
 * computado. Quando o job landar, o valor resolve normalmente; o contrato de
 * tipo já está fixado aqui.
 */
const SOURCE_ENRICH_JOB_SPECIFIER = ['.', 'source-enrich.job'].join('/')

/**
 * Carrega `runSourceEnrich` do job dono via import dinâmico (lazy). Mantém a
 * fila desacoplada do arquivo do job — se o job ainda não existir, lança um
 * erro claro em vez de quebrar o boot do módulo de fila.
 */
async function loadRunSourceEnrich(): Promise<RunSourceEnrich> {
  const mod = (await import(SOURCE_ENRICH_JOB_SPECIFIER)) as {
    runSourceEnrich?: RunSourceEnrich
  }
  if (typeof mod.runSourceEnrich !== 'function') {
    throw new Error(
      "source-enrich.job não exporta 'runSourceEnrich' (handler ainda não implementado?)",
    )
  }
  return mod.runSourceEnrich
}

// ---------------------------------------------------------------------------
// Producer
// ---------------------------------------------------------------------------

/**
 * Enfileira um job de enrichment. NUNCA roda inline no turno do SSE em
 * homol/prod — sempre via Redis/BullMQ.
 *
 * Fallback de dev (SOURCE_ENRICH_SYNC=1): chama `runSourceEnrich` direto e
 * retorna o resultado, sem tocar no Redis. Útil quando nenhum worker dedicado
 * está de pé. Como o caller (rota SSE) NÃO deve bloquear, disparamos o handler
 * em background (fire-and-forget) e logamos falhas — o card mostra o progresso
 * a partir do status do KnowledgeSource + builderState, não do retorno aqui.
 */
export async function enqueueSourceEnrich(
  payload: SourceEnrichJobPayload,
  options: { redisUrl?: string; traceId?: string } = {},
): Promise<void> {
  // QH-13: anexa o traceId ao payload via withTrace (fail-open: gera um novo se ausente).
  const traceId = options.traceId ?? newTraceId()
  const tracedPayload = withTrace(
    traceId,
    {
      organizationId: payload.organizationId,
      conversationId: payload.conversationId,
    },
    payload as unknown as Record<string, unknown>,
  ) as unknown as SourceEnrichJobPayload & { _trace: unknown }

  if (syncFallbackEnabled()) {
    // DEV: roda direto, em background, sem Redis.
    void loadRunSourceEnrich()
      .then((run) => run(payload, traceId))
      .catch((err) => {
        console.error(
          '[source-enrich.queue] sync fallback falhou:',
          (err as Error)?.message ?? err,
        )
      })
    return
  }

  const redisUrl = options.redisUrl ?? process.env.REDIS_URL
  if (!redisUrl) {
    // Sem Redis e sem flag de sync: não há como processar. Falha-segura — não
    // derruba o turno do SSE; o card fica em "pending" e pode ser reenfileirado.
    console.warn(
      '[source-enrich.queue] REDIS_URL ausente e SOURCE_ENRICH_SYNC desligado — ' +
        'enrichment NÃO enfileirado. Defina REDIS_URL ou SOURCE_ENRICH_SYNC=1 (dev).',
    )
    return
  }

  const connection = parseRedisUrl(redisUrl)
  const queue = new Queue<SourceEnrichJobPayload>(SOURCE_ENRICH_QUEUE, {
    connection,
  })

  try {
    await queue.add(SOURCE_ENRICH_JOB_NAME, tracedPayload, {
      // Mesma política de retenção do session-close.
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 24 * 3600, count: 50 },
    })
  } finally {
    // Producer efêmero: fecha a conexão para não vazar sockets quando chamado
    // de dentro do runtime Next (uma conexão por turno).
    await queue.close().catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// Worker registrar
// ---------------------------------------------------------------------------

/**
 * Registra o Worker que consome a fila source-enrich. Deve ser chamado pelo
 * entrypoint dedicado de workers (ex: scripts/start-workers.ts), NUNCA pelo
 * runtime Next. Resolve o handler lazy no primeiro job (e a cada job — o
 * dynamic import é cacheado pelo loader, custo desprezível).
 */
export function registerSourceEnrichWorker(
  redisUrl: string,
): Worker<SourceEnrichJobPayload, SourceEnrichResult> {
  const connection = parseRedisUrl(redisUrl)

  return new Worker<SourceEnrichJobPayload, SourceEnrichResult>(
    SOURCE_ENRICH_QUEUE,
    async (job) => {
      // QH-13: extrai traceId do carrier _trace para correlação de logs.
      const traceId = getTraceId(job.data as unknown as Record<string, unknown>)
      console.info('[source-enrich.worker] job iniciado', {
        jobId: job.id,
        traceId,
        organizationId: job.data.organizationId,
        conversationId: job.data.conversationId,
      })
      const run = await loadRunSourceEnrich()
      return run(job.data, traceId)
    },
    { connection },
  )
}
