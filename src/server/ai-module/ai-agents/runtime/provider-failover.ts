/**
 * Agent Runtime — provider failover helpers
 *
 * Cooldown distribuído por provider/modelo (US-043 / RT-05, Redis-backed) e
 * classificação de erros retriáveis (US-043). Extraído de
 * `agent-runtime.service.ts` no split estrutural — comportamento idêntico.
 */

import { getRedis } from '@/server/services/redis'

// ── US-043 / RT-05: Provider Cooldown (Redis, distribuído) ──────────────────
//
// O estado de cooldown vive no Redis (não mais num Map em memória): assim ele
// sobrevive a restarts e é compartilhado entre réplicas do worker. A chave
// tem TTL = janela de cooldown, então o "destravamento" é automático (não
// precisamos guardar/comparar timestamps).
//
// FAIL-OPEN: se o Redis cair, comportamo-nos como SEM cooldown — `isProvider
// InCooldown` retorna false e `setProviderCooldown` vira no-op. Nunca lança;
// um turno jamais é bloqueado por indisponibilidade do Redis.

const COOLDOWN_DURATION_MS = 5 * 60 * 1000 // 5 minutes
const COOLDOWN_TTL_SECONDS = Math.ceil(COOLDOWN_DURATION_MS / 1000)

/** Chave Redis do cooldown de um provider/modelo (providerKey = `${provider}:${model}`). */
function cooldownKey(providerKey: string): string {
  return `runtime:breaker:cooldown:${providerKey}`
}

/**
 * true se o provider/modelo está em cooldown (chave presente no Redis).
 * Fail-open: qualquer erro de Redis → false (sem cooldown).
 */
export async function isProviderInCooldown(providerKey: string): Promise<boolean> {
  try {
    const redis = getRedis()
    const exists = await redis.exists(cooldownKey(providerKey))
    return exists === 1
  } catch (err) {
    console.warn('[AgentRuntime] cooldown check failed (fail-open):', err)
    return false
  }
}

/**
 * Marca o provider/modelo em cooldown por COOLDOWN_TTL_SECONDS.
 * Fire-and-forget / fail-open: erro de Redis é só logado, nunca propagado.
 */
export async function setProviderCooldown(providerKey: string): Promise<void> {
  try {
    const redis = getRedis()
    await redis.set(cooldownKey(providerKey), '1', 'EX', COOLDOWN_TTL_SECONDS)
  } catch (err) {
    console.warn('[AgentRuntime] cooldown set failed (ignored):', err)
  }
}

// ── US-043: Retriable Error Detection ───────────────────────────────────────

/**
 * Determines if an LLM error is retriable (429, 5xx, or timeout).
 */
export function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()

  // Check for timeout
  if (message.includes('timeout') || message.includes('timed out') || message.includes('aborted')) {
    return true
  }

  // Check for status code in error message or properties
  const statusMatch = message.match(/\b(429|5\d{2})\b/)
  if (statusMatch) return true

  // Check for common status property on error objects
  const statusCode = (error as unknown as Record<string, unknown>).status ??
    (error as unknown as Record<string, unknown>).statusCode
  if (typeof statusCode === 'number') {
    return statusCode === 429 || (statusCode >= 500 && statusCode < 600)
  }

  return false
}
