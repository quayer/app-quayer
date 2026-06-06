/**
 * outbound-retry.queue — QH-02 (follow-through): reenfileiramento da resposta
 * do agente quando o envio é barrado pelo RATE LIMIT DE INSTÂNCIA (60 msgs/min
 * por connectionId).
 *
 * Problema que fecha: hoje, ao estourar o limite de instância, `sendAgentResponse`
 * retorna `rateLimited:true` e DESCARTA a resposta — o lead fica sem resposta.
 * Aqui agendamos um retry com `delay = retryAfterMs` (o token bucket refila ~1
 * token/seg, então em ~1s o envio passa). Cap de tentativas em `MAX_RETRY_ATTEMPTS`;
 * ao esgotar, `sendAgentResponse` manda para a dead-letter existente (visibilidade
 * de ops) em vez de reenfileirar pra sempre.
 *
 * IMPORTANTE — só o limite de INSTÂNCIA é retentado. Os limites de CONTATO/ORG
 * (outbound-rate-limit) são throttles de produto deliberados (não floodar um
 * contato) — reentregar contraria o propósito, então continuam como drop-by-design.
 *
 * Camada de fila (Leaf), espelha source-enrich.queue:
 *   - OUTBOUND_RETRY_QUEUE      → nome da fila ('quayer:outbound-retry')
 *   - enqueueOutboundRetry      → producer (delay; dev: fallback síncrono via flag)
 *   - registerOutboundRetryWorker → registra o Worker (entrypoint dedicado)
 *
 * Boot: o Worker só roda quando o entrypoint dedicado de workers (ex:
 * scripts/start-workers.ts) chamar registerAllWorkers — NUNCA no runtime Next.
 * Até lá, em dev, use OUTBOUND_RETRY_SYNC=1 para processar inline.
 *
 * As deps reais do envio (database, uazapi sender, markBotMessage, sendAgentResponse)
 * são importadas LAZY dentro do processamento — assim o producer (chamado do
 * runtime Next) não arrasta o caminho de envio inteiro pro bundle.
 */

import type { ConnectionOptions } from 'bullmq'
import { Queue, Worker } from 'bullmq'
import type { OutboundRequest } from './outbound.service'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const OUTBOUND_RETRY_QUEUE = 'quayer:outbound-retry'
export const OUTBOUND_RETRY_JOB_NAME = 'outbound-retry-send'

/**
 * Flag de dev: quando ligada, `enqueueOutboundRetry` NÃO usa Redis/BullMQ —
 * agenda o reenvio inline via setTimeout (processo dev é long-lived). Em
 * homol/prod fica desligada e o retry roda sempre no worker dedicado.
 * Aceita '1' | 'true' (case-insensitive). Default: desligada.
 */
const SYNC_FALLBACK_ENV = 'OUTBOUND_RETRY_SYNC'

function syncFallbackEnabled(): boolean {
  const raw = (process.env[SYNC_FALLBACK_ENV] ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true'
}

// ---------------------------------------------------------------------------
// Contrato do payload
// ---------------------------------------------------------------------------

/**
 * Payload de um retry. É o próprio OutboundRequest (já 100% serializável —
 * strings + objetos tts/aiMeta simples) com `attempt` OBRIGATÓRIO: o gate de
 * rate-limit em sendAgentResponse usa `attempt` para decidir reenfileirar vs
 * mandar pra dead-letter.
 */
export type OutboundRetryJobPayload = OutboundRequest & { attempt: number }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** parseRedisUrl — idêntico ao de jobs/index.ts e source-enrich.queue (cópia
 *  local para a fila não acoplar ao registry / evitar imports circulares). */
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
 * Reconstrói as deps reais e re-executa `sendAgentResponse`. Usado tanto pelo
 * Worker quanto pelo fallback síncrono. Lazy-import de TODAS as deps de envio
 * para não puxá-las ao bundle do runtime Next (que importa o producer).
 *
 * `scheduleRetry` é re-injetado apontando para `enqueueOutboundRetry`: se o
 * retry ainda estourar o limite, ele reenfileira (attempt+1) até o cap — a
 * decisão reenfileirar-vs-deadletter vive 100% em sendAgentResponse.
 */
async function runOutboundRetry(
  payload: OutboundRetryJobPayload,
  opts: { redisUrl?: string } = {},
): Promise<void> {
  const [{ sendAgentResponse }, { database }, senderMod, { markBotMessage }] =
    await Promise.all([
      import('./outbound.service'),
      import('@/server/services/database'),
      import('./uazapi-sender.service'),
      import('./bot-echo-guard.service'),
    ])

  const result = await sendAgentResponse(payload, {
    database: database as never,
    sender: senderMod,
    markBotMessage,
    scheduleRetry: (p, delayMs) =>
      enqueueOutboundRetry(p, { delayMs, redisUrl: opts.redisUrl }),
  })

  console.info('[outbound-retry] processado', {
    attempt: payload.attempt,
    blocksSent: result.blocksSent,
    rateLimited: result.rateLimited ?? false,
    retryScheduled: result.retryScheduled ?? false,
  })
}

// ---------------------------------------------------------------------------
// Producer
// ---------------------------------------------------------------------------

/**
 * Agenda um retry do envio com `delay = delayMs`. NUNCA roda inline no turno
 * em homol/prod — sempre via Redis/BullMQ.
 *
 * Contrato de falha (importante): LANÇA quando não consegue genuinamente agendar
 * (REDIS_URL ausente, URL malformada, BullMQ indisponível). O caller
 * (`sendAgentResponse`) já captura erros de `scheduleRetry` e roteia a resposta
 * à DEAD-LETTER — assim nunca reportamos `retryScheduled=true` para algo que não
 * foi agendado (perda silenciosa seria pior). O turno do agente segue protegido:
 * quem chama captura o erro; este producer não pode derrubar o turno por conta
 * própria, mas DEVE sinalizar a falha para a decisão retry-vs-deadletter acontecer.
 *
 * Fallback de dev (OUTBOUND_RETRY_SYNC=1): agenda via setTimeout no próprio
 * processo, sem tocar no Redis (sucesso, não lança).
 */
export async function enqueueOutboundRetry(
  payload: OutboundRetryJobPayload,
  options: { delayMs: number; redisUrl?: string },
): Promise<void> {
  const delayMs = Math.max(0, Math.floor(options.delayMs))

  if (syncFallbackEnabled()) {
    // DEV: reagenda no próprio processo (fire-and-forget). Erros só logam.
    setTimeout(() => {
      void runOutboundRetry(payload).catch((err) => {
        console.error(
          '[outbound-retry] sync fallback falhou:',
          err instanceof Error ? err.message : String(err),
        )
      })
    }, delayMs)
    return
  }

  const redisUrl = options.redisUrl ?? process.env.REDIS_URL
  if (!redisUrl) {
    // Não há como agendar. LANÇA (em vez de silenciar) para o caller rotear à
    // dead-letter — evita `retryScheduled=true` com perda silenciosa.
    throw new Error(
      '[outbound-retry] REDIS_URL ausente e OUTBOUND_RETRY_SYNC desligado — retry não agendável',
    )
  }

  // parseRedisUrl / new Queue / queue.add podem lançar — deixamos PROPAGAR ao
  // caller (que faz dead-letter). O `finally` fecha a conexão SE ela chegou a
  // abrir (`queue` pode ficar undefined se a construção falhar) — guard evita
  // ReferenceError no finally. Producer efêmero: 1 conexão por turno.
  let queue: Queue<OutboundRetryJobPayload> | undefined
  try {
    const connection = parseRedisUrl(redisUrl)
    queue = new Queue<OutboundRetryJobPayload>(OUTBOUND_RETRY_QUEUE, { connection })
    await queue.add(OUTBOUND_RETRY_JOB_NAME, payload, {
      delay: delayMs,
      // Mesma política de retenção das demais filas do registry.
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 24 * 3600, count: 50 },
    })
  } finally {
    if (queue) await queue.close().catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// Worker registrar
// ---------------------------------------------------------------------------

/**
 * Registra o Worker que consome a fila de retry. Deve ser chamado pelo
 * entrypoint dedicado de workers (ex: scripts/start-workers.ts), NUNCA pelo
 * runtime Next.
 */
export function registerOutboundRetryWorker(
  redisUrl: string,
): Worker<OutboundRetryJobPayload, void> {
  const connection = parseRedisUrl(redisUrl)

  return new Worker<OutboundRetryJobPayload, void>(
    OUTBOUND_RETRY_QUEUE,
    async (job) => {
      console.info('[outbound-retry.worker] job iniciado', {
        jobId: job.id,
        attempt: job.data.attempt,
        organizationId: job.data.organizationId,
      })
      await runOutboundRetry(job.data, { redisUrl })
    },
    { connection },
  )
}
