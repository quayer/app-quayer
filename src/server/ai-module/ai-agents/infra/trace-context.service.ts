/**
 * Trace Context Service — QH-13
 *
 * Helpers PUROS para propagação de traceId cross-worker:
 *   webhook → job BullMQ payload → consumer/runtime.
 *
 * Fluxo:
 *   1. No entrypoint do webhook (route.ts), chamar `newTraceId()` ANTES de
 *      enfileirar qualquer job. O traceId é criado uma vez e viaja junto com
 *      o payload BullMQ (via `withTrace`).
 *   2. O producer usa `withTrace(traceId, meta)` para anexar `_trace` ao
 *      payload (objeto plain, serializável p/ Redis).
 *   3. O consumer/runtime chama `getTraceId(job.data)` para extrair o id e
 *      injeta em todos os logs estruturados do turno.
 *
 * Design:
 *   - Zero dependências externas (só Node.js built-in crypto + logger).
 *   - Fail-open: `getTraceId` nunca lança; retorna undefined se ausente/inválido.
 *   - Sem estado global: cada chamada é autônoma (testável sem setup).
 *   - O campo carrier é `_trace` dentro do payload BullMQ — prefixo underscore
 *     sinaliza metadado de infra, nunca de negócio.
 *
 * Formato do traceId: UUID v4 padrão (8-4-4-4-12 hexadecimal, 36 chars).
 * Estável entre chamadas para o mesmo turno; único entre turnos.
 *
 * Referência: docs/backlog/QUAYER_HARDENING_BACKLOG.md — QH-13
 *
 * @module infra/trace-context.service
 */

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { logger } from '@/server/services/logger'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Campo carrier dentro do payload BullMQ. */
const TRACE_CARRIER_KEY = '_trace'

/** Regex para validar o formato UUID v4 (36 chars, grupos 8-4-4-4-12). */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// ── Schemas ───────────────────────────────────────────────────────────────────

/**
 * Shape do carrier `_trace` dentro do payload.
 * `id`  — traceId UUID v4
 * `ts`  — timestamp ISO da criação (para latência de fila)
 * `meta`— metadados adicionais (sessionId, contactPhone, etc.) — opcional
 */
const TraceCarrierSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  ts: z.string().datetime(),
  meta: z.record(z.unknown()).optional(),
})

type TraceCarrier = z.infer<typeof TraceCarrierSchema>

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Gera um novo traceId UUID v4 estável para o turno atual.
 * Deve ser chamado UMA VEZ no entrypoint (webhook/route handler) e propagado
 * downstream via `withTrace`.
 */
export function newTraceId(): string {
  return randomUUID()
}

/**
 * Retorna `true` se a string tem formato UUID v4 válido.
 * Usado internamente e em testes para asserções de formato.
 */
export function isValidTraceId(id: string): boolean {
  return UUID_REGEX.test(id)
}

/**
 * Anexa o traceId + meta ao payload do job BullMQ.
 *
 * Uso (producer):
 * ```ts
 * const traceId = newTraceId()
 * const payload = withTrace(traceId, { sessionId, contactPhone }, basePayload)
 * await queue.add(JOB_NAME, payload)
 * ```
 *
 * O carrier `_trace` é adicionado ao objeto retornado SEM mutar o input.
 * O campo `meta` permite carregar contexto adicional para correlação de logs
 * (sessionId, connectionId, contactPhone) sem inflar o payload de negócio.
 *
 * @param traceId  UUID gerado por `newTraceId()`
 * @param meta     Metadados adicionais (serializáveis p/ Redis)
 * @param payload  Payload base do job (spread: o retorno herda todos os campos)
 */
export function withTrace<T extends Record<string, unknown>>(
  traceId: string,
  meta: Record<string, unknown>,
  payload: T,
): T & { [TRACE_CARRIER_KEY]: TraceCarrier } {
  const carrier: TraceCarrier = {
    id: traceId,
    ts: new Date().toISOString(),
    meta,
  }

  const enriched = {
    ...payload,
    [TRACE_CARRIER_KEY]: carrier,
  } as T & { [TRACE_CARRIER_KEY]: TraceCarrier }

  logger.info('[trace-context] traceId anexado ao payload', {
    traceId,
    ...meta,
  })

  return enriched
}

/**
 * Extrai o traceId do payload BullMQ.
 * Fail-open: retorna `undefined` se o campo não existir ou estiver malformado.
 * Nunca lança — o consumer nunca deve falhar por ausência de trace.
 *
 * Uso (consumer/runtime):
 * ```ts
 * const traceId = getTraceId(job.data)
 * logger.info('[runtime] turno iniciado', { traceId, sessionId })
 * ```
 *
 * @param payload  job.data vindo do BullMQ Worker
 */
export function getTraceId(payload: Record<string, unknown>): string | undefined {
  try {
    const raw = payload[TRACE_CARRIER_KEY]
    if (!raw || typeof raw !== 'object') return undefined

    const parsed = TraceCarrierSchema.safeParse(raw)
    if (!parsed.success) return undefined

    return parsed.data.id
  } catch {
    return undefined
  }
}

/**
 * Extrai o carrier `_trace` completo (id + ts + meta).
 * Útil quando o consumer precisa propagar `meta` para spans OTel ou logs.
 * Retorna `undefined` no mesmo fail-open que `getTraceId`.
 */
export function getTraceCarrier(
  payload: Record<string, unknown>,
): TraceCarrier | undefined {
  try {
    const raw = payload[TRACE_CARRIER_KEY]
    if (!raw || typeof raw !== 'object') return undefined

    const parsed = TraceCarrierSchema.safeParse(raw)
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}
