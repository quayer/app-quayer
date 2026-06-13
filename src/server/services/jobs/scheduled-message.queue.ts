/**
 * scheduled-message.queue — CAMADA DE FILA (producer) do envio PROATIVO atrasado
 * (TPRO-01 / specs/builder-proatividade): a tool `create_followup` cria um
 * `ScheduledMessage` no DB e ENFILEIRA aqui com `delay = scheduledAt - now` para
 * que, no horário, o worker do F2b o entregue.
 *
 * ⚠️ ESCOPO (F2a): este arquivo é SÓ o PRODUCER + o tipo do payload. O WORKER de
 * ENVIO ainda NÃO existe — ele é F2b e depende do FSM-outbound durável +
 * `sendAgentResponse` + do gate forte de elegibilidade (`canSendProactive`) no
 * momento do envio. NÃO registramos worker aqui; ver o TODO em jobs/index.ts.
 *
 * Por que o gate forte fica no ENVIO (F2b), não no agendamento:
 *   Entre o `create_followup` e o horário do disparo o estado muda (o cliente
 *   pode responder, optar por sair, um humano pode assumir, a sessão fecha).
 *   A decisão compliance-crítica (`proactive-eligibility.pure.ts`) precisa ser
 *   reavaliada com dados FRESCOS no instante do envio. Agendar é barato e
 *   reversível (`status='cancelled'`); enviar é irreversível.
 *
 * Camada de fila (Leaf), espelha source-enrich.queue / outbound-retry.queue:
 *   - SCHEDULED_MESSAGE_QUEUE  → nome da fila ('quayer-scheduled-message')
 *   - enqueueScheduledMessage  → producer (delay; dev: fallback síncrono via flag)
 *   - (worker → F2b)
 *
 * O payload carrega só IDs/campos serializáveis (nunca objetos grandes): o
 * worker do F2b recarrega o `ScheduledMessage` do DB pelo `id` e reavalia
 * elegibilidade com estado fresco. `organizationId` guarda o multi-tenant.
 *
 * Convenção: queues sempre prefixadas com "quayer-" no Redis (isola de outros
 * apps no mesmo cluster). bullmq@5 REJEITA ':' em nome de fila — usar '-'.
 */

import { Queue } from 'bullmq'
import { parseRedisUrl } from '@/lib/redis/parse-redis-url'
import {
  withTrace,
  newTraceId,
} from '@/server/ai-module/ai-agents/infra/trace-context.service'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

// NOTA: bullmq@5 REJEITA ':' em nome de fila ("Queue name cannot contain :").
// Usar '-' como separador (não ':'). O isolamento "quayer" é pelo prefixo.
export const SCHEDULED_MESSAGE_QUEUE = 'quayer-scheduled-message'
export const SCHEDULED_MESSAGE_JOB_NAME = 'scheduled-message-send'

/**
 * Flag de dev: quando ligada, `enqueueScheduledMessage` NÃO usa Redis/BullMQ.
 * Como o WORKER de envio é F2b (ainda não existe), em dev o fallback síncrono
 * apenas AGENDA um no-op via setTimeout que loga — não há envio a executar.
 * Em homol/prod fica desligada e o job vai pro Redis aguardar o worker do F2b.
 * Aceita '1' | 'true' (case-insensitive). Default: desligada.
 */
const SYNC_FALLBACK_ENV = 'SCHEDULED_MESSAGE_SYNC'

function syncFallbackEnabled(): boolean {
  const raw = (process.env[SYNC_FALLBACK_ENV] ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true'
}

// ---------------------------------------------------------------------------
// Contrato do payload
// ---------------------------------------------------------------------------

/**
 * Payload de um envio proativo agendado. Só IDs/campos serializáveis — o worker
 * do F2b recarrega o `ScheduledMessage` por `id` e reavalia elegibilidade com
 * estado FRESCO antes de enviar (o snapshot aqui é só para logs/correlação).
 *
 * Mantido como interface simples (serializável p/ Redis). Espelha os campos
 * autoritativos do modelo `ScheduledMessage` que o worker precisa para resolver
 * destino (connectionId/contactPhone), tenant (organizationId) e sessão.
 */
export interface ScheduledMessageJobPayload {
  /** ScheduledMessage.id — chave para o worker recarregar o registro fresco. */
  readonly scheduledMessageId: string
  /** Multi-tenant (NFR-01): o worker filtra TODA query por org. */
  readonly organizationId: string
  /** Connection.id (instância WhatsApp) por onde o envio sairá. */
  readonly connectionId: string
  /** Telefone do contato em E.164-BR normalizado (não há modelo Contact). */
  readonly contactPhone: string
  /** ChatSession.id de origem, quando há (null = follow-up sem sessão viva). */
  readonly sessionId?: string | null
  /** Instante alvo do envio (ISO) — só para logs; o delay já foi aplicado. */
  readonly scheduledAt: string
  /** Motivo do follow-up (auditoria/observabilidade). */
  readonly reason: string
}

// ---------------------------------------------------------------------------
// Producer
// ---------------------------------------------------------------------------

export interface EnqueueScheduledMessageResult {
  enqueued: boolean
  transport: 'bullmq' | 'sync' | 'none'
  reason?: 'missing_redis'
}

/**
 * Enfileira um envio proativo com `delay = delayMs` (atraso até `scheduledAt`).
 * NUNCA roda inline no turno do agente em homol/prod — sempre via Redis/BullMQ.
 *
 * Fail-safe (NFR-PRO-2): não derruba o turno do agente. Sem Redis e sem a flag
 * de sync, retorna `{enqueued:false, reason:'missing_redis'}` (o caller decide
 * o que fazer) em vez de lançar — o `ScheduledMessage` já está persistido
 * (status='pending') e pode ser reenfileirado por uma varredura posterior.
 *
 * Fallback de dev (SCHEDULED_MESSAGE_SYNC=1): como o worker de ENVIO é F2b
 * (ainda não existe), apenas agenda um no-op via setTimeout que loga — não há
 * caminho de envio a executar aqui. Não toca no Redis.
 */
export async function enqueueScheduledMessage(
  payload: ScheduledMessageJobPayload,
  options: { delayMs: number; redisUrl?: string; traceId?: string } = {
    delayMs: 0,
  },
): Promise<EnqueueScheduledMessageResult> {
  const delayMs = Math.max(0, Math.floor(options.delayMs))

  // QH-13: anexa o traceId ao payload via withTrace (fail-open: gera novo se
  // ausente). Mantém a correlação cross-worker no hop do BullMQ.
  const traceId = options.traceId ?? newTraceId()
  const tracedPayload = withTrace(
    traceId,
    {
      organizationId: payload.organizationId,
      connectionId: payload.connectionId,
      scheduledMessageId: payload.scheduledMessageId,
    },
    payload as unknown as Record<string, unknown>,
  ) as unknown as ScheduledMessageJobPayload

  if (syncFallbackEnabled()) {
    // DEV: o worker de envio é F2b — aqui só logamos o disparo no horário.
    setTimeout(() => {
      console.info(
        '[scheduled-message.queue] sync fallback (sem worker de envio — F2b):',
        {
          traceId,
          scheduledMessageId: payload.scheduledMessageId,
          reason: payload.reason,
        },
      )
    }, delayMs)
    return { enqueued: true, transport: 'sync' }
  }

  const redisUrl = options.redisUrl ?? process.env.REDIS_URL
  if (!redisUrl) {
    // Fail-safe: não derruba o turno do agente. O ScheduledMessage já está
    // persistido (pending) e pode ser reenfileirado por varredura posterior.
    console.warn(
      '[scheduled-message.queue] REDIS_URL ausente e SCHEDULED_MESSAGE_SYNC ' +
        'desligado — envio NÃO enfileirado. Defina REDIS_URL ou ' +
        'SCHEDULED_MESSAGE_SYNC=1 (dev).',
    )
    return { enqueued: false, transport: 'none', reason: 'missing_redis' }
  }

  const connection = parseRedisUrl(redisUrl)
  const queue = new Queue<ScheduledMessageJobPayload>(SCHEDULED_MESSAGE_QUEUE, {
    connection,
  })

  try {
    await queue.add(SCHEDULED_MESSAGE_JOB_NAME, tracedPayload, {
      // jobId determinístico: idempotência — reenfileirar o mesmo
      // ScheduledMessage não cria duplicatas (BullMQ ignora jobId repetido).
      jobId: payload.scheduledMessageId,
      delay: delayMs,
      // Mesma política de retenção das demais filas do registry.
      removeOnComplete: { age: 3600, count: 100 },
      removeOnFail: { age: 24 * 3600, count: 50 },
    })
    return { enqueued: true, transport: 'bullmq' }
  } finally {
    // Producer efêmero: fecha a conexão para não vazar sockets quando chamado
    // de dentro do runtime Next (uma conexão por turno).
    await queue.close().catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// Worker registrar → F2b (JÁ EXISTE)
// ---------------------------------------------------------------------------

// F2b ENTREGUE: o worker de ENVIO agora existe em
// src/server/ai-module/ai-agents/proactive/scheduled-message-send.ts
// (registerScheduledMessageWorker) e JÁ está fiado no boot via
// registerAllWorkers + REGISTERED_JOBS.scheduledMessage em jobs/index.ts.
//
// O worker: recarrega o ScheduledMessage por id (status='pending', skip
// idempotente caso contrário), reavalia elegibilidade com estado FRESCO
// (canSendProactive: opt-out, janela 24h, supressão, anti-spam), envia via
// sendAgentResponse com dispatchKey (FSM-outbound durável — 2ª camada de
// idempotência) e marca status='sent'/'cancelled'/'failed'. É fail-safe (nunca
// relança), então um job ruim não derruba a fila.
//
// Mantido aqui SÓ o producer (acima) — o registrar do worker fica no módulo de
// envio para que o runtime Next que importa este producer NÃO puxe as deps do
// envio (database/outbound/agent-runtime).
//
// Validação end-to-end (disparo real + geração de texto via LLM com o agente da
// sessão + tratamento HSM fora da janela 24h, hoje canceled 'outside_window_no_
// template' por falta de catálogo de templates aprovados) fica para teste no
// harness local / deploy — não é coberta pelos unit tests do worker.
