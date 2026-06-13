/**
 * outbound-resume.queue — UNIDADE 4 do FSM outbound durável. Varre dispatches
 * "presos" (crash deixou em 'sending'/'partial' e ninguém os retomou) e re-roda
 * o envio com a MESMA dispatchKey — o que PULA os blocos já checkpointados,
 * fechando a anti-duplicação ponta-a-ponta mesmo quando o retry por rate-limit
 * (outbound-retry.queue) nunca chega a acontecer (ex.: o processo morreu no meio
 * do loop de envio, sem rate-limit envolvido).
 *
 * Por que existe além do outbound-retry.queue: o retry só é enfileirado quando o
 * turno estoura o limite de INSTÂNCIA. Um crash silencioso no meio do loop
 * (rede, OOM, deploy) deixa a linha em 'sending'/'partial' SEM nenhum job de
 * retry agendado. Este cron resgata esses órfãos: reclama por dispatchKey, o
 * claim do service vê o checkpoint e retoma sem reenviar o que já saiu.
 *
 * Camadas:
 *   - runOutboundResumeBatch(deps, opts) → HANDLER PURO testável. Recebe `now`
 *     por PARÂMETRO (NUNCA Date.now no núcleo) e injeta findStuck/resend. Filtra
 *     com isStuckDispatch (outbound-dispatch.pure) e re-roda resend por item.
 *     fail-open: erro num item NÃO derruba o batch (acumula em errors).
 *   - registerOutboundResumeWorker(redisUrl) → Worker que no boot monta as deps
 *     reais (lazy import de database + sendAgentResponse + uazapiSender +
 *     markBotMessage) e chama runOutboundResumeBatch.
 *   - registerOutboundResumeSchedule(redisUrl) → BullMQ repeat (cron fixo, a cada
 *     2min) espelhando registerJourneyEventsPurgeSchedule.
 *
 * DISPARO END-TO-END: o resume real precisa de DB + Redis reais (E2E/deploy). O
 * que é UNIT-testável aqui é runOutboundResumeBatch com deps mockadas + a seleção
 * isStuckDispatch — exatamente o que o .test.ts cobre.
 *
 * org-scoped: cada linha carrega organizationId; o resend reconstrói o
 * OutboundRequest com o organizationId da própria linha (toda query do service
 * filtra por org). Sem FK relacional no modelo (padrão do módulo).
 *
 * Convenção de nome de fila: separador '-' (bullmq@5 REJEITA ':'). Ver jobs/index.ts.
 */

import { Queue, Worker } from 'bullmq'
import { parseRedisUrl } from '@/lib/redis/parse-redis-url'
import { isStuckDispatch } from './outbound-dispatch.pure'
import type { OutboundRequest, OutboundDatabase } from './outbound.types'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

// NOTA: bullmq@5 REJEITA ':' em nome de fila — usar '-' (não ':'). Ver jobs/index.ts.
export const OUTBOUND_RESUME_QUEUE = 'quayer-outbound-resume'
export const OUTBOUND_RESUME_JOB_NAME = 'outbound-resume-batch'

/** Schedule FIXO (sem env): a cada 2min. Resgate de órfãos não precisa de granularidade fina. */
const OUTBOUND_RESUME_CRON = '*/2 * * * *'

/**
 * Idade mínima (ms) sem update para considerar um dispatch "preso". Default 2min
 * — alinhado ao período do cron: uma linha em 'sending' há mais de 2min quase
 * certamente é de um turno morto (o envio normal de poucos blocos leva segundos),
 * NÃO de um turno ainda em andamento. Evita corrida com um envio em curso.
 */
const DEFAULT_STALE_MS = 2 * 60 * 1000

/** Max de dispatches por batch (cap de carga por run do cron). */
const DEFAULT_LIMIT = 50

// ---------------------------------------------------------------------------
// Contrato do handler puro
// ---------------------------------------------------------------------------

/**
 * Linha mínima de um dispatch preso, lida do DB (sem PII além do telefone, que já
 * é necessário para reenviar). `status`/`updatedAt` alimentam isStuckDispatch; os
 * demais campos reconstroem o OutboundRequest do resend.
 */
export interface StuckDispatchRow {
  readonly dispatchKey: string
  readonly organizationId: string
  readonly sessionId: string
  readonly connectionId: string
  readonly contactPhone: string
  readonly agentText: string
  readonly status: string
  readonly updatedAt: Date
}

/** Resultado de re-rodar o envio de UM dispatch. */
export interface ResumeResendResult {
  readonly blocksSent: number
  readonly errors: string[]
}

/**
 * Deps injetadas no handler puro. `now` NÃO entra aqui — é passado por opção em
 * runOutboundResumeBatch (o caller real fornece `new Date()`; os testes fornecem
 * um Date fixo). Mantém o núcleo determinístico.
 */
export interface OutboundResumeDeps {
  /**
   * Carrega os candidatos a resume. No boot real:
   *   database.outboundDispatch.findMany({
   *     where: { status: { in: ['sending', 'partial'] } },
   *     orderBy: { updatedAt: 'asc' },
   *     take: limit,
   *   })
   * O filtro fino por idade (staleMs) é aplicado AQUI no handler via
   * isStuckDispatch — o DB só pré-seleciona por status para não escanear tudo.
   */
  findStuck: (args: { limit: number }) => Promise<StuckDispatchRow[]>
  /**
   * Re-executa o envio de um dispatch. No boot real: chama sendAgentResponse com
   * a MESMA dispatchKey reconstruída (claim vê o checkpoint → pula blocos já
   * enviados), injetando database/sender/markBotMessage reais.
   */
  resend: (req: OutboundRequest) => Promise<ResumeResendResult>
}

export interface OutboundResumeBatchOptions {
  /** Idade mínima sem update p/ considerar preso. Default DEFAULT_STALE_MS. */
  staleMs?: number
  /** Relógio injetado (determinismo). Default `new Date()`. */
  now?: Date
  /** Cap de linhas por batch. Default DEFAULT_LIMIT. */
  limit?: number
}

export interface OutboundResumeBatchResult {
  /** Quantas linhas o findStuck retornou (antes do filtro de idade). */
  scanned: number
  /** Quantas passaram em isStuckDispatch E o resend completou sem lançar. */
  resumed: number
  /** Quantas passaram no filtro mas o resend lançou (fail-open: não derrubou o batch). */
  failed: number
  /** Mensagens de erro acumuladas (uma por item falho). */
  errors: string[]
}

// ---------------------------------------------------------------------------
// Handler puro
// ---------------------------------------------------------------------------

/**
 * Reconstrói o OutboundRequest de um dispatch preso. A dispatchKey é re-anexada
 * para o claim do service reconhecer o checkpoint e PULAR blocos já enviados.
 */
function reqFromStuck(row: StuckDispatchRow): OutboundRequest {
  return {
    connectionId: row.connectionId,
    sessionId: row.sessionId,
    organizationId: row.organizationId,
    contactPhone: row.contactPhone,
    agentText: row.agentText,
    dispatchKey: row.dispatchKey,
  }
}

/**
 * Processa um batch de resume. Para cada candidato:
 *   1. Filtra com isStuckDispatch(row, now, staleMs) — só órfãos de verdade.
 *   2. Re-roda resend (que reusa a dispatchKey → pula checkpointados).
 *
 * fail-open por item: um resend que lança NÃO aborta o loop — acumula em
 * `errors` e o próximo segue normal. O handler nunca lança (defensivo no topo
 * também) — o cron não pode cair por um item ruim.
 *
 * Métricas:
 *   - scanned: total retornado por findStuck (antes do filtro de idade)
 *   - resumed: resend completou sem lançar
 *   - failed: passou no filtro mas resend lançou
 */
export async function runOutboundResumeBatch(
  deps: OutboundResumeDeps,
  options: OutboundResumeBatchOptions = {},
): Promise<OutboundResumeBatchResult> {
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS
  const now = options.now ?? new Date()
  const limit = options.limit ?? DEFAULT_LIMIT

  const errors: string[] = []
  let scanned = 0
  let resumed = 0
  let failed = 0

  let rows: StuckDispatchRow[]
  try {
    rows = await deps.findStuck({ limit })
  } catch (err) {
    // findStuck falhou: não há nada a resumir neste run. fail-open — o cron
    // tenta de novo no próximo tick.
    console.error(
      '[outbound-resume] findStuck falhou (batch abortado, sem itens):',
      err instanceof Error ? err.message : String(err),
    )
    return { scanned: 0, resumed: 0, failed: 0, errors: [String(err)] }
  }

  scanned = rows.length

  for (const row of rows) {
    // Filtro fino por idade: o DB pré-seleciona por status; aqui exigimos a
    // janela de staleMs para não correr com um turno ainda em andamento.
    if (!isStuckDispatch({ status: row.status, updatedAt: row.updatedAt }, now, staleMs)) {
      continue
    }

    try {
      const result = await deps.resend(reqFromStuck(row))
      resumed += 1
      if (result.errors.length > 0) {
        // O resend completou (não lançou) mas reportou erros de bloco — registramos
        // p/ observabilidade sem contar como `failed` (o turno foi retomado).
        console.warn('[outbound-resume] resume com erros de bloco', {
          dispatchKey: row.dispatchKey,
          blocksSent: result.blocksSent,
          errors: result.errors,
        })
      }
    } catch (err) {
      // fail-open: erro num item não derruba o batch.
      failed += 1
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${row.dispatchKey}: ${msg}`)
      console.error('[outbound-resume] resend lançou (item pulado):', {
        dispatchKey: row.dispatchKey,
        error: msg,
      })
    }
  }

  return { scanned, resumed, failed, errors }
}

// ---------------------------------------------------------------------------
// Boot — deps reais
// ---------------------------------------------------------------------------

/**
 * Monta as deps reais do resume via lazy import (igual ao padrão das outras
 * filas: o producer/registry não arrasta o caminho de envio pro bundle do Next).
 *   - findStuck: outboundDispatch.findMany filtrando status ∈ {sending,partial},
 *     orderBy updatedAt asc, take limit.
 *   - resend: sendAgentResponse com a MESMA dispatchKey (pula checkpointados),
 *     injetando database/sender/markBotMessage reais.
 */
async function buildRealDeps(): Promise<OutboundResumeDeps> {
  const [{ sendAgentResponse }, { database }, senderMod, { markBotMessage }] =
    await Promise.all([
      import('./outbound.service'),
      import('@/server/services/database'),
      import('./uazapi-sender.service'),
      import('./bot-echo-guard.service'),
    ])

  const findStuck: OutboundResumeDeps['findStuck'] = async ({ limit }) => {
    const rows = await database.outboundDispatch.findMany({
      where: { status: { in: ['sending', 'partial'] } },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      select: {
        dispatchKey: true,
        organizationId: true,
        sessionId: true,
        connectionId: true,
        contactPhone: true,
        agentText: true,
        status: true,
        updatedAt: true,
      },
    })
    return rows as StuckDispatchRow[]
  }

  const resend: OutboundResumeDeps['resend'] = async (req) => {
    const result = await sendAgentResponse(req, {
      // Cast documentado: OutboundDatabase é um espelho frouxo do PrismaClient
      // (args Record-typed), então o client concreto não é diretamente atribuível
      // — mesmo padrão de dispatch-ai.ts.
      database: database as unknown as OutboundDatabase,
      sender: senderMod,
      markBotMessage,
    })
    return { blocksSent: result.blocksSent, errors: result.errors }
  }

  return { findStuck, resend }
}

// ---------------------------------------------------------------------------
// Worker registrar
// ---------------------------------------------------------------------------

/**
 * Registra o Worker que consome a fila outbound-resume. Deve ser chamado pelo
 * entrypoint dedicado de workers (ex: scripts/start-workers.ts), NUNCA pelo
 * runtime Next. No boot monta as deps reais (lazy) e chama runOutboundResumeBatch
 * com `now = new Date()`.
 */
export function registerOutboundResumeWorker(
  redisUrl: string,
): Worker<unknown, OutboundResumeBatchResult> {
  const connection = parseRedisUrl(redisUrl)

  return new Worker<unknown, OutboundResumeBatchResult>(
    OUTBOUND_RESUME_QUEUE,
    async () => {
      const deps = await buildRealDeps()
      const result = await runOutboundResumeBatch(deps, { now: new Date() })
      console.info('[outbound-resume.worker] batch processado', result)
      return result
    },
    { connection },
  )
}

// ---------------------------------------------------------------------------
// Schedule (cron)
// ---------------------------------------------------------------------------

/**
 * Agenda o resume recorrente (cron FIXO, sem env). Idempotente: chamar várias
 * vezes não duplica o repeatable job. Espelha registerJourneyEventsPurgeSchedule.
 */
export async function registerOutboundResumeSchedule(
  redisUrl: string,
): Promise<Queue> {
  const connection = parseRedisUrl(redisUrl)
  const queue = new Queue(OUTBOUND_RESUME_QUEUE, { connection })

  await queue.add(
    OUTBOUND_RESUME_JOB_NAME,
    {},
    {
      repeat: { pattern: OUTBOUND_RESUME_CRON },
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 24 * 3600, count: 50 },
    },
  )

  return queue
}
