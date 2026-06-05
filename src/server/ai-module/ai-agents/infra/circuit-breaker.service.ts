/**
 * Circuit Breaker por provider/modelo — QH-06
 *
 * State machine Redis: CLOSED → OPEN → HALF_OPEN → CLOSED.
 * 5 falhas/60s → OPEN (300s) → HALF_OPEN → CLOSED (sucesso) / OPEN (falha).
 * Keys: circuit:{provider}:{model}:failures | :opened_at
 * Fail-open: erro Redis → { allowed: true, state: 'closed' }. Nunca lança.
 *
 * @module infra/circuit-breaker.service
 */

import { z } from 'zod'
import { getRedis } from '@/server/services/redis'
import { logger } from '@/server/services/logger'

// ── Constantes ────────────────────────────────────────────────────────────────

/** Número de falhas consecutivas para abrir o circuit. */
export const FAILURE_THRESHOLD = 5

/** Janela de observação de falhas (segundos). */
export const FAILURE_WINDOW_SECONDS = 60

/** Duração do estado OPEN antes de migrar para HALF_OPEN (segundos). */
export const OPEN_DURATION_SECONDS = 300

// ── Input Schema ──────────────────────────────────────────────────────────────

const ProviderModelInputSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
})

type ProviderModelInput = z.infer<typeof ProviderModelInputSchema>

// ── Output Types ──────────────────────────────────────────────────────────────

export type CircuitState = 'closed' | 'open' | 'half_open'

export interface CanAttemptResult {
  allowed: boolean
  state: CircuitState
}

// ── Key Helpers ───────────────────────────────────────────────────────────────

function failuresKey(provider: string, model: string): string {
  return `circuit:${provider}:${model}:failures`
}

function openedAtKey(provider: string, model: string): string {
  return `circuit:${provider}:${model}:opened_at`
}

// ── Fail-open sentinel ────────────────────────────────────────────────────────

const FAIL_OPEN: CanAttemptResult = { allowed: true, state: 'closed' }

function logRedisError(fn: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err)
  logger.warn(`[circuit-breaker] ${fn} Redis error — fail-open: ${msg}`)
}

// ── Resolve current circuit state (pure logic, no side-effects) ───────────────

async function resolveState(
  provider: string,
  model: string,
  nowSec: number,
): Promise<CircuitState> {
  const redis = getRedis()

  const openedAtRaw = await redis.get(openedAtKey(provider, model))
  if (openedAtRaw === null) {
    return 'closed'
  }

  const openedAt = parseInt(openedAtRaw, 10)
  const elapsed = nowSec - openedAt

  if (elapsed < OPEN_DURATION_SECONDS) {
    return 'open'
  }

  return 'half_open'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verifica se uma tentativa ao provider/modelo é permitida.
 *
 * - CLOSED  → allowed: true
 * - OPEN    → allowed: false (janela ainda não expirou)
 * - HALF_OPEN → allowed: true (1 tentativa de prova)
 * - Fail-open: erro Redis → { allowed: true, state: 'closed' }
 */
export async function canAttempt(
  input: ProviderModelInput,
): Promise<CanAttemptResult> {
  const parsed = ProviderModelInputSchema.safeParse(input)
  if (!parsed.success) {
    logger.warn('[circuit-breaker] canAttempt: input inválido — fail-open')
    return FAIL_OPEN
  }

  const { provider, model } = parsed.data

  try {
    const nowSec = Math.floor(Date.now() / 1000)
    const state = await resolveState(provider, model, nowSec)

    if (state === 'open') {
      return { allowed: false, state: 'open' }
    }

    return { allowed: true, state }
  } catch (err) {
    logRedisError('canAttempt', err)
    return FAIL_OPEN
  }
}

/**
 * Registra sucesso: reseta falhas e fecha o circuit.
 * Operacional tanto em CLOSED quanto HALF_OPEN.
 * Fail-silent se Redis falhar.
 */
export async function recordSuccess(
  input: ProviderModelInput,
): Promise<void> {
  const parsed = ProviderModelInputSchema.safeParse(input)
  if (!parsed.success) return

  const { provider, model } = parsed.data

  try {
    const redis = getRedis()
    await redis.del(failuresKey(provider, model), openedAtKey(provider, model))
  } catch (err) {
    logRedisError('recordSuccess', err)
  }
}

/**
 * Registra falha:
 *   - CLOSED: incrementa contador na janela de 60s.
 *     Se atingir FAILURE_THRESHOLD → OPEN.
 *   - HALF_OPEN: reabre o circuit imediatamente (OPEN).
 * Fail-silent se Redis falhar.
 */
export async function recordFailure(
  input: ProviderModelInput,
): Promise<void> {
  const parsed = ProviderModelInputSchema.safeParse(input)
  if (!parsed.success) return

  const { provider, model } = parsed.data

  try {
    const redis = getRedis()
    const nowSec = Math.floor(Date.now() / 1000)
    const state = await resolveState(provider, model, nowSec)

    if (state === 'half_open') {
      // Prova falhou → reabre
      await redis.set(openedAtKey(provider, model), String(nowSec))
      await redis.del(failuresKey(provider, model))
      logger.warn(
        `[circuit-breaker] HALF_OPEN probe failed — reopening: ${provider}/${model}`,
      )
      return
    }

    // CLOSED: incrementa contador de falhas na janela
    const fKey = failuresKey(provider, model)
    const count = await redis.incr(fKey)
    if (count === 1) {
      // Primeira falha da janela — define TTL
      await redis.expire(fKey, FAILURE_WINDOW_SECONDS)
    }

    if (count >= FAILURE_THRESHOLD) {
      await redis.set(openedAtKey(provider, model), String(nowSec))
      await redis.del(fKey)
      logger.warn(
        `[circuit-breaker] OPEN after ${count} failures: ${provider}/${model}`,
      )
    }
  } catch (err) {
    logRedisError('recordFailure', err)
  }
}
