/**
 * hard-caps.service.ts — QH-03
 *
 * Hard cap de custo USD por sessão de chat.
 *
 * Comportamento:
 *   - Limite default: DEFAULT_SESSION_COST_CAP_USD (2.00 USD), configurável via
 *     env SESSION_COST_CAP_USD ou override por parâmetro.
 *   - Fast-path O(1): lê contador Redis `wa:cost:{sessionId}` (Float, acumulado
 *     externamente pelo caller após cada turno).
 *   - Fallback: se Redis falhar, usa `currentCostUsd` passado pelo caller.
 *   - Fail-open: qualquer erro interno retorna `exceeded: false` — nunca
 *     derruba o agente por bug no gate de custo.
 *
 * O CALLER é responsável por:
 *   1. Chamar `checkSessionCostCap` ANTES da chamada LLM em `prepareAgentCall`.
 *   2. Se `exceeded === true`: setar ChatSession.aiBlockedUntil / aiBlockReason
 *      e retornar sem invocar o LLM.
 *   3. Após cada turno bem-sucedido: incrementar o contador Redis com
 *      `INCRBYFLOAT wa:cost:{sessionId} <turno_cost>` (TTL: 7 dias).
 */

import { z } from 'zod'
import { getRedis } from '@/server/services/redis'
import { logger } from '@/server/services/logger'

// ── Constantes ────────────────────────────────────────────────────────────────

/** Limite padrão de custo por sessão (USD). Sobrescrito por SESSION_COST_CAP_USD. */
export const DEFAULT_SESSION_COST_CAP_USD = 2.00

/** TTL do contador Redis: 7 dias (sessões inativas não persistem para sempre). */
const REDIS_KEY_TTL_SECONDS = 7 * 24 * 60 * 60

/** Prefixo da chave Redis de custo acumulado por sessão. */
export const REDIS_COST_KEY_PREFIX = 'wa:cost:'

// ── Input schema ──────────────────────────────────────────────────────────────

export const CheckSessionCostCapInputSchema = z.object({
  sessionId: z.string().min(1),
  organizationId: z.string().min(1),
  /** Custo acumulado que o caller já conhece (fallback quando Redis falha). */
  currentCostUsd: z.number().nonnegative(),
  /**
   * Override de limite para esta chamada. Se omitido, usa DEFAULT ou env
   * SESSION_COST_CAP_USD.
   */
  limitUsd: z.number().positive().optional(),
})

export type CheckSessionCostCapInput = z.infer<typeof CheckSessionCostCapInputSchema>

// ── Output type ───────────────────────────────────────────────────────────────

export interface SessionCostCapResult {
  exceeded: boolean
  limitUsd: number
  /** Presente apenas quando exceeded === true. */
  reason?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveLimit(override?: number): number {
  if (override !== undefined) return override
  const fromEnv = parseFloat(process.env.SESSION_COST_CAP_USD ?? '')
  if (!isNaN(fromEnv) && fromEnv > 0) return fromEnv
  return DEFAULT_SESSION_COST_CAP_USD
}

function redisKey(sessionId: string): string {
  return `${REDIS_COST_KEY_PREFIX}${sessionId}`
}

// ── Exported helpers para o caller ───────────────────────────────────────────

/**
 * Incrementa o acumulador Redis após um turno bem-sucedido.
 * Garante TTL renovado a cada incremento.
 * Fail-silent — logs warning mas nunca lança.
 */
export async function incrementSessionCost(
  sessionId: string,
  turnCostUsd: number,
): Promise<void> {
  if (turnCostUsd <= 0) return
  try {
    const redis = getRedis()
    const key = redisKey(sessionId)
    await redis.incrbyfloat(key, turnCostUsd)
    await redis.expire(key, REDIS_KEY_TTL_SECONDS)
  } catch (err) {
    logger.warn(`[HardCaps] incrementSessionCost failed (ignored): ${String(err)}`)
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Verifica se a sessão ultrapassou o hard cap de custo USD.
 *
 * Ordem de prioridade da leitura de custo:
 *   1. Redis fast-path: `wa:cost:{sessionId}` — atualizado pelo caller após
 *      cada turno via `incrementSessionCost`.
 *   2. `currentCostUsd` do input — fallback quando Redis não responde.
 *
 * Fail-open: exceção interna → `{ exceeded: false, limitUsd }`.
 */
export async function checkSessionCostCap(
  input: CheckSessionCostCapInput,
): Promise<SessionCostCapResult> {
  const parsed = CheckSessionCostCapInputSchema.safeParse(input)
  if (!parsed.success) {
    logger.warn(`[HardCaps] invalid input: ${parsed.error.message}`)
    return { exceeded: false, limitUsd: resolveLimit(input.limitUsd) }
  }

  const { sessionId, organizationId, currentCostUsd, limitUsd: limitOverride } =
    parsed.data
  const limitUsd = resolveLimit(limitOverride)

  try {
    // Fast-path: tenta ler o acumulador Redis
    let effectiveCost = currentCostUsd

    try {
      const redis = getRedis()
      const raw = await redis.get(redisKey(sessionId))
      if (raw !== null) {
        const parsed = parseFloat(raw)
        if (!isNaN(parsed)) {
          effectiveCost = parsed
        }
      }
    } catch (redisErr) {
      // Redis indisponível → usa currentCostUsd passado pelo caller (fail-open)
      logger.warn(
        `[HardCaps] Redis unavailable for session ${sessionId} (org ${organizationId}), falling back to currentCostUsd`,
      )
    }

    if (effectiveCost >= limitUsd) {
      const reason =
        `Sessão bloqueada: custo acumulado $${effectiveCost.toFixed(4)} atingiu o limite de $${limitUsd.toFixed(2)}.`

      logger.warn(
        `[HardCaps] Cost cap exceeded — session=${sessionId} org=${organizationId} cost=${effectiveCost} limit=${limitUsd}`,
      )

      return { exceeded: true, limitUsd, reason }
    }

    return { exceeded: false, limitUsd }
  } catch (err) {
    // Fail-open: bug interno nunca bloqueia o agente
    logger.warn(
      `[HardCaps] checkSessionCostCap unexpected error (fail-open): ${String(err)}`,
    )
    return { exceeded: false, limitUsd }
  }
}
