/**
 * QH-02 — Rate limit de saída (token bucket Redis)
 *
 * Token bucket atômico via script Lua. Três escopos independentes:
 *   - instance  : 60 msgs/min  por connectionId
 *   - contact   : 1 msg/2s     por contactPhone
 *   - org       : 1000 msgs/h  por organizationId
 *
 * Fail-open: qualquer erro de Redis retorna { allowed: true, retryAfterMs: 0 }.
 * Nunca lança exceção.
 */

import { z } from 'zod'
import { getRedis } from '@/server/services/redis'

// ── Limites configuráveis por constante ─────────────────────────────────────

export const RATE_LIMITS = {
  /** Máximo de mensagens por janela de tempo (por escopo). */
  instance: { maxTokens: 60, windowMs: 60_000 },   // 60/min
  contact:  { maxTokens: 1,  windowMs: 2_000 },     // 0.5/s (1 a cada 2s)
  org:      { maxTokens: 1000, windowMs: 3_600_000 }, // 1000/h
} as const

// ── Input Zod schema ─────────────────────────────────────────────────────────

const CheckRateLimitInputSchema = z.object({
  /** Escopo do bucket. */
  scope: z.enum(['instance', 'contact', 'org']),
  /**
   * Chave discriminante dentro do escopo.
   * - instance → connectionId
   * - contact  → contactPhone (ou qualquer identificador único do contato)
   * - org      → organizationId
   */
  key: z.string().min(1),
})

export type CheckRateLimitInput = z.infer<typeof CheckRateLimitInputSchema>

export interface RateLimitResult {
  allowed: boolean
  /** Tempo sugerido de espera antes de retentar (0 quando allowed=true). */
  retryAfterMs: number
}

// ── Script Lua — token bucket atômico ───────────────────────────────────────
//
// KEYS[1]  = chave Redis do bucket  (ex: "rl:instance:conn-abc")
// ARGV[1]  = maxTokens             (capacidade total do bucket)
// ARGV[2]  = windowMs              (duração da janela em ms)
// ARGV[3]  = nowMs                 (timestamp atual em ms — injetado pelo caller)
//
// Retorna: [allowed (0|1), retryAfterMs]
//
// Algoritmo:
//   1. GET o estado do bucket {tokens, lastRefillMs}
//   2. Calcular quantos tokens foram reabastecidos desde lastRefill
//   3. Adicionar tokens reabastecidos (clamped a maxTokens)
//   4. Se tokens >= 1 → consome 1 token, salva estado, retorna [1, 0]
//   5. Caso contrário → retorna [0, msAteProximoToken]
//   6. Expira a chave em windowMs*2 para auto-limpeza

const TOKEN_BUCKET_LUA = `
local key       = KEYS[1]
local maxTokens = tonumber(ARGV[1])
local windowMs  = tonumber(ARGV[2])
local nowMs     = tonumber(ARGV[3])

local raw = redis.call('GET', key)
local tokens, lastRefill

if raw then
  local parts = {}
  for p in string.gmatch(raw, '([^:]+)') do
    parts[#parts + 1] = p
  end
  tokens     = tonumber(parts[1])
  lastRefill = tonumber(parts[2])
else
  tokens     = maxTokens
  lastRefill = nowMs
end

-- Reabastecer tokens proporcionalmente ao tempo decorrido
local elapsed   = nowMs - lastRefill
local refillRate = maxTokens / windowMs  -- tokens por ms
local refilled  = elapsed * refillRate
tokens = math.min(maxTokens, tokens + refilled)
lastRefill = nowMs

local allowed, retryAfterMs

if tokens >= 1 then
  tokens     = tokens - 1
  allowed    = 1
  retryAfterMs = 0
else
  allowed    = 0
  -- Quantos ms faltam para 1 token estar disponível
  local msPerToken = windowMs / maxTokens
  retryAfterMs = math.ceil(msPerToken * (1 - tokens))
end

-- Persiste estado como "tokens:lastRefill" com TTL = 2x windowMs
local ttlSec = math.ceil((windowMs * 2) / 1000)
redis.call('SET', key, string.format('%.6f:%d', tokens, lastRefill), 'EX', ttlSec)

return {allowed, retryAfterMs}
`

// ── Fallback INCR+EXPIRE (Redis sem suporte a EVAL) ──────────────────────────

async function checkWithIncrFallback(
  redisKey: string,
  maxTokens: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redis = getRedis()
  const countRaw = await redis.incr(redisKey)
  if (countRaw === 1) {
    // Primeira chamada na janela — define TTL
    await redis.pexpire(redisKey, windowMs)
  }
  const allowed = countRaw <= maxTokens
  const retryAfterMs = allowed ? 0 : windowMs
  return { allowed, retryAfterMs }
}

// ── Função principal ─────────────────────────────────────────────────────────

/**
 * Verifica e consome 1 token do bucket correspondente ao escopo+chave.
 *
 * @param input - { scope, key } — validado via Zod
 * @returns { allowed, retryAfterMs }
 *
 * Fail-open: qualquer erro de Redis retorna allowed=true, retryAfterMs=0.
 */
export async function checkRateLimit(
  input: CheckRateLimitInput,
): Promise<RateLimitResult> {
  // Validação de input
  const parsed = CheckRateLimitInputSchema.safeParse(input)
  if (!parsed.success) {
    // Input inválido → fail-open (nunca lança)
    return { allowed: true, retryAfterMs: 0 }
  }

  const { scope, key } = parsed.data
  const { maxTokens, windowMs } = RATE_LIMITS[scope]
  const redisKey = `rl:${scope}:${key}`

  try {
    const redis = getRedis()
    const nowMs = Date.now()

    const result = (await redis.eval(
      TOKEN_BUCKET_LUA,
      1,
      redisKey,
      String(maxTokens),
      String(windowMs),
      String(nowMs),
    )) as [number, number]

    const allowed = result[0] === 1
    const retryAfterMs = Number(result[1]) || 0
    return { allowed, retryAfterMs }
  } catch (luaErr: unknown) {
    // Lua não suportado ou erro genérico de Redis → tenta INCR+EXPIRE
    const errMsg = luaErr instanceof Error ? luaErr.message : String(luaErr)
    const isLuaUnsupported =
      errMsg.includes('ERR') && errMsg.toLowerCase().includes('script')

    if (isLuaUnsupported) {
      try {
        return await checkWithIncrFallback(redisKey, maxTokens, windowMs)
      } catch {
        // Fail-open
        return { allowed: true, retryAfterMs: 0 }
      }
    }

    // Falha de conexão ou outro erro Redis → fail-open
    return { allowed: true, retryAfterMs: 0 }
  }
}
