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
 *   - journey-events-purge: cron de retenção (NFR-10) — apaga
 *     builder_journey_events > 180 dias. Schedule FIXO (sem env), mesmo padrão
 *     BullMQ repeat do session-close.
 *   - scheduled-message (TPRO-01 / F2b): envio PROATIVO atrasado — on-demand,
 *     enfileirado pela tool create_followup. O worker reavalia elegibilidade
 *     com estado FRESCO (canSendProactive) e entrega via sendAgentResponse
 *     (FSM-durável). Worker em ai-module/ai-agents/proactive/
 *     scheduled-message-send.ts; producer em ./scheduled-message.queue.
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
  runJourneyEventsPurge,
  type JourneyEventsPurgeResult,
} from './journey-events-purge.job'
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
import {
  registerOutboundResumeWorker,
  registerOutboundResumeSchedule,
  OUTBOUND_RESUME_QUEUE,
  OUTBOUND_RESUME_JOB_NAME,
} from '@/server/communication/services/outbound-resume.queue'
import {
  SCHEDULED_MESSAGE_QUEUE,
  SCHEDULED_MESSAGE_JOB_NAME,
} from './scheduled-message.queue'
import { registerScheduledMessageWorker } from '@/server/ai-module/ai-agents/proactive/scheduled-message-send'

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

// NFR-10 (Jornada v2): purge de builder_journey_events > 180 dias. Intervalo
// FIXO (sem env de override, decisão do plan §9) — diário às 03:00. Limpeza de
// retenção não precisa de granularidade fina; espelha o padrão de schedule do
// session-close (BullMQ repeat).
export const JOURNEY_EVENTS_PURGE_QUEUE = 'quayer-journey-events-purge'
export const JOURNEY_EVENTS_PURGE_JOB_NAME = 'journey-events-purge'
const JOURNEY_EVENTS_PURGE_CRON = '0 3 * * *'

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
  outboundResume: {
    queue: OUTBOUND_RESUME_QUEUE,
    jobName: OUTBOUND_RESUME_JOB_NAME,
    // FSM outbound durável (Unidade 4): cron de resgate de dispatches presos
    // ('sending'/'partial' após crash, sem retry agendado). Re-roda o envio com
    // a mesma dispatchKey → pula blocos já checkpointados (anti-duplicação). O
    // Worker lazy-importa o caminho de envio; o schedule é registrado por
    // registerOutboundResumeSchedule (cron fixo a cada 2min).
    registerWorker: registerOutboundResumeWorker,
  },
  journeyEventsPurge: {
    queue: JOURNEY_EVENTS_PURGE_QUEUE,
    jobName: JOURNEY_EVENTS_PURGE_JOB_NAME,
    // NFR-10: cron de retenção. Handler puro (utilizável por cron externo sem
    // BullMQ, igual ao session-close).
    handler: runJourneyEventsPurge,
  },
  scheduledMessage: {
    queue: SCHEDULED_MESSAGE_QUEUE,
    jobName: SCHEDULED_MESSAGE_JOB_NAME,
    // TPRO-01: on-demand — enfileirado pela tool create_followup com delay até
    // scheduledAt. O worker de ENVIO (F2b) já existe em
    // ai-module/ai-agents/proactive/scheduled-message-send.ts: recarrega o
    // ScheduledMessage por id (status='pending'), reavalia elegibilidade com
    // estado FRESCO (canSendProactive: opt-out, janela 24h, supressão,
    // anti-spam), envia via sendAgentResponse (FSM-durável, dispatchKey) e marca
    // status='sent'/'cancelled'/'failed'. O Worker lazy-importa o caminho de
    // envio. Boot via registerWorker abaixo.
    registerWorker: registerScheduledMessageWorker,
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

/**
 * Registra o worker que processa a fila journey-events-purge (NFR-10).
 * Deve ser chamado pelo entrypoint dedicado de workers (não pelo Next runtime).
 */
export function registerJourneyEventsPurgeWorker(
  redisUrl: string,
): Worker<unknown, JourneyEventsPurgeResult> {
  const connection = parseRedisUrl(redisUrl)

  return new Worker<unknown, JourneyEventsPurgeResult>(
    JOURNEY_EVENTS_PURGE_QUEUE,
    async () => {
      // runJourneyEventsPurge é fail-open: nunca lança, então o worker não cai.
      return runJourneyEventsPurge(database)
    },
    { connection },
  )
}

/**
 * Agenda o purge recorrente (cron FIXO, sem env). Idempotente: chamar várias
 * vezes não duplica o repeatable job.
 */
export async function registerJourneyEventsPurgeSchedule(
  redisUrl: string,
): Promise<Queue> {
  const connection = parseRedisUrl(redisUrl)
  const queue = new Queue(JOURNEY_EVENTS_PURGE_QUEUE, { connection })

  await queue.add(
    JOURNEY_EVENTS_PURGE_JOB_NAME,
    {},
    {
      repeat: { pattern: JOURNEY_EVENTS_PURGE_CRON },
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
    // journey-events-purge (NFR-10): cron de retenção (> 180 dias). Worker do
    // cron; o schedule é registrado por registerJourneyEventsPurgeSchedule.
    registerJourneyEventsPurgeWorker(redisUrl),
    // outbound-resume (FSM durável, Unidade 4): cron de resgate de dispatches
    // presos. Worker do cron; o schedule é registrado por
    // registerOutboundResumeSchedule.
    registerOutboundResumeWorker(redisUrl),
    // scheduled-message (TPRO-01 / F2b): on-demand — enfileirado pela tool
    // create_followup com delay até scheduledAt. Worker reavalia elegibilidade
    // com estado fresco (canSendProactive) e envia via sendAgentResponse
    // (FSM-durável). O Worker lazy-importa o caminho de envio.
    registerScheduledMessageWorker(redisUrl),
  ]
}

// Re-exporta o handler puro para uso por crons externos (Vercel / GH Actions)
// que não querem subir BullMQ.
export { runSessionCloseBatch } from './session-close.job'

// NFR-10: re-exporta o handler puro do purge para cron externo sem BullMQ.
export { runJourneyEventsPurge } from './journey-events-purge.job'

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

// TPRO-01: re-exporta o producer + constantes + payload da fila de envio
// proativo agendado. create_followup importa o producer daqui ou direto de
// ./scheduled-message.queue.
export {
  enqueueScheduledMessage,
  SCHEDULED_MESSAGE_QUEUE,
  SCHEDULED_MESSAGE_JOB_NAME,
  type ScheduledMessageJobPayload,
  type EnqueueScheduledMessageResult,
} from './scheduled-message.queue'

// TPRO-01 (F2b): re-exporta o worker registrar do envio proativo agendado
// (handler + deps reais + worker vivem em ai-module/ai-agents/proactive/
// scheduled-message-send.ts). Boot importa daqui de um só lugar.
export {
  registerScheduledMessageWorker,
  runScheduledMessageSend,
  type ProactiveSendDeps,
  type ProactiveSendResult,
  type ProactiveScheduledRow,
  type ProactiveEligibilitySnapshot,
} from '@/server/ai-module/ai-agents/proactive/scheduled-message-send'

// FSM outbound durável (Unidade 4): re-exporta a camada de fila do resume
// (handler puro + worker registrar + schedule + constantes) para o boot importar
// de um só lugar. O schedule (registerOutboundResumeSchedule) é chamado uma vez
// no boot do worker dedicado, junto de registerJourneyEventsPurgeSchedule.
export {
  registerOutboundResumeWorker,
  registerOutboundResumeSchedule,
  runOutboundResumeBatch,
  OUTBOUND_RESUME_QUEUE,
  OUTBOUND_RESUME_JOB_NAME,
  type OutboundResumeDeps,
  type OutboundResumeBatchResult,
  type StuckDispatchRow,
} from '@/server/communication/services/outbound-resume.queue'
