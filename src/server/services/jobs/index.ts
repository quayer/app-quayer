/**
 * Job registry — BullMQ queues/workers do Quayer.
 *
 * Hoje:
 *   - session-close: encerra ChatSession sem atividade recente e dispara
 *     o resumo de longo prazo (aiAgentContext.summary).
 *   - source-enrich: enriquecimento ASYNC das fontes "cole seu site/IG" do
 *     Builder (Orayon Uplift W4) — ingestSource() (extract→chunk→embed→pgvector)
 *     + síntese padrão niche-researcher que escreve SÓ valores PROPOSTOS em
 *     builderState.sourceIngestion.proposed. A fila/worker vivem em
 *     ./source-enrich.queue; aqui só re-exportamos o registrar para o boot.
 *
 * Como agendar:
 *   - BullMQ "repeat" via registerSessionCloseQueueSchedule (chamado uma
 *     vez no boot do worker dedicado, ex: scripts/start-workers.ts).
 *   - Cron externo (Vercel Cron / GitHub Actions) pode importar
 *     `runSessionCloseBatch` direto e rodar sem BullMQ, é puro service.
 *   - source-enrich não é cron: é enfileirado on-demand pelo Builder
 *     (enqueueSourceEnrich) — o boot só precisa subir o Worker.
 *
 * Convenção: queues sempre prefixadas com "quayer:" no Redis para isolar
 * de outros apps no mesmo cluster.
 */

import { Queue, Worker } from 'bullmq'

import { parseRedisUrl } from '@/lib/redis/parse-redis-url'
import { database } from '@/server/services/database'

import {
  runSessionCloseBatch,
  type SessionCloseBatchResult,
  type SessionCloseJobConfig,
} from './session-close.job'
import {
  registerSourceEnrichWorker,
  SOURCE_ENRICH_QUEUE,
  SOURCE_ENRICH_JOB_NAME,
} from './source-enrich.queue'
import {
  registerOutboundRetryWorker,
  OUTBOUND_RETRY_QUEUE,
  OUTBOUND_RETRY_JOB_NAME,
} from '@/server/communication/services/outbound-retry.queue'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

// NOTA: bullmq@5 REJEITA ':' em nome de fila ("Queue name cannot contain :").
// Por isso usamos '-' como separador (não ':'). O isolamento "quayer" continua
// pelo prefixo do nome. NÃO reintroduzir ':' aqui.
export const SESSION_CLOSE_QUEUE = 'quayer-session-close'
export const SESSION_CLOSE_JOB_NAME = 'session-close-batch'

/** Default schedule: a cada 10min. Override via SESSION_CLOSE_CRON. */
const DEFAULT_CRON = '*/10 * * * *'

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const REGISTERED_JOBS = {
  sessionClose: {
    queue: SESSION_CLOSE_QUEUE,
    jobName: SESSION_CLOSE_JOB_NAME,
    // Handler puro: utilizável por cron externo (Vercel / GH Actions) sem BullMQ.
    handler: runSessionCloseBatch,
  },
  sourceEnrich: {
    queue: SOURCE_ENRICH_QUEUE,
    jobName: SOURCE_ENRICH_JOB_NAME,
    // On-demand (não-cron): o handler (runSourceEnrich) é lazy-importado pelo
    // Worker em ./source-enrich.queue p/ não puxar as deps do job no runtime
    // Next que importa este registry. Boot registra via registerWorker abaixo.
    registerWorker: registerSourceEnrichWorker,
  },
  outboundRetry: {
    queue: OUTBOUND_RETRY_QUEUE,
    jobName: OUTBOUND_RETRY_JOB_NAME,
    // QH-02: on-demand (enfileirado por sendAgentResponse ao estourar o limite
    // de instância). O Worker lazy-importa o caminho de envio. Boot via
    // registerWorker abaixo.
    registerWorker: registerOutboundRetryWorker,
  },
} as const

/**
 * Registra o worker que processa a fila session-close.
 * Deve ser chamado pelo entrypoint dedicado de workers (não pelo Next runtime).
 */
export function registerSessionCloseWorker(
  redisUrl: string,
  config: SessionCloseJobConfig = {},
): Worker<unknown, SessionCloseBatchResult> {
  const connection = parseRedisUrl(redisUrl)

  return new Worker<unknown, SessionCloseBatchResult>(
    SESSION_CLOSE_QUEUE,
    async () => {
      return runSessionCloseBatch(database, config)
    },
    { connection },
  )
}

/**
 * Agenda o job repetido (cron). Idempotente: chamar várias vezes não duplica.
 */
export async function registerSessionCloseQueueSchedule(
  redisUrl: string,
  options: { cron?: string } = {},
): Promise<Queue> {
  const connection = parseRedisUrl(redisUrl)
  const queue = new Queue(SESSION_CLOSE_QUEUE, { connection })

  await queue.add(
    SESSION_CLOSE_JOB_NAME,
    {},
    {
      repeat: { pattern: options.cron ?? process.env.SESSION_CLOSE_CRON ?? DEFAULT_CRON },
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 24 * 3600, count: 50 },
    },
  )

  return queue
}

// ---------------------------------------------------------------------------
// Boot — sobe todos os workers registrados
// ---------------------------------------------------------------------------

/**
 * Sobe TODOS os workers do registry com uma única chamada. É o ponto que o
 * entrypoint dedicado de workers (ex: scripts/start-workers.ts) deve chamar no
 * boot — nunca o runtime Next. Mantém a lista de workers num só lugar para que
 * adicionar um job novo signifique só estender este array.
 *
 * Retorna os Workers criados (tipados como Worker genérico) para o caller poder
 * fazer graceful shutdown (close()) no SIGTERM.
 */
export function registerAllWorkers(redisUrl: string): Worker[] {
  return [
    registerSessionCloseWorker(redisUrl),
    // source-enrich: on-demand (enfileirado pelo Builder), worker-only.
    registerSourceEnrichWorker(redisUrl),
    // outbound-retry (QH-02): on-demand (enfileirado pelo outbound ao estourar
    // o limite de instância), worker-only.
    registerOutboundRetryWorker(redisUrl),
  ]
}

// Re-exporta o handler puro para uso por crons externos (Vercel / GH Actions)
// que não querem subir BullMQ.
export { runSessionCloseBatch } from './session-close.job'

// Re-exporta a camada de fila do source-enrich (producer + worker registrar +
// constantes) a partir do registry central para o boot importar de um só lugar.
export {
  registerSourceEnrichWorker,
  enqueueSourceEnrich,
  SOURCE_ENRICH_QUEUE,
  SOURCE_ENRICH_JOB_NAME,
  type SourceEnrichJobPayload,
  type SourceEnrichResult,
} from './source-enrich.queue'

// QH-02: re-exporta a camada de fila do outbound-retry (producer + worker
// registrar + constantes) para o boot importar de um só lugar.
export {
  registerOutboundRetryWorker,
  enqueueOutboundRetry,
  OUTBOUND_RETRY_QUEUE,
  OUTBOUND_RETRY_JOB_NAME,
  type OutboundRetryJobPayload,
} from '@/server/communication/services/outbound-retry.queue'
