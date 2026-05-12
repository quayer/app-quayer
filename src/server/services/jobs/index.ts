/**
 * Job registry — BullMQ queues/workers do Quayer.
 *
 * Hoje:
 *   - session-close: encerra ChatSession sem atividade recente e dispara
 *     o resumo de longo prazo (aiAgentContext.summary).
 *
 * Como agendar:
 *   - BullMQ "repeat" via registerSessionCloseQueueSchedule (chamado uma
 *     vez no boot do worker dedicado, ex: scripts/start-workers.ts).
 *   - Cron externo (Vercel Cron / GitHub Actions) pode importar
 *     `runSessionCloseBatch` direto e rodar sem BullMQ, é puro service.
 *
 * Convenção: queues sempre prefixadas com "quayer:" no Redis para isolar
 * de outros apps no mesmo cluster.
 */

import type { ConnectionOptions } from 'bullmq'
import { Queue, Worker } from 'bullmq'

import { database } from '@/server/services/database'

import {
  runSessionCloseBatch,
  type SessionCloseBatchResult,
  type SessionCloseJobConfig,
} from './session-close.job'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const SESSION_CLOSE_QUEUE = 'quayer:session-close'
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
    handler: runSessionCloseBatch,
  },
} as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseRedisUrl(url: string): ConnectionOptions {
  // BullMQ aceita objeto IORedis-compatível. Repassar como url-string em
  // alguns wrappers cobra parse manual; usamos o IORedis options diretamente
  // para evitar surpresas.
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

// Re-exporta o handler puro para uso por crons externos (Vercel / GH Actions)
// que não querem subir BullMQ.
export { runSessionCloseBatch } from './session-close.job'
