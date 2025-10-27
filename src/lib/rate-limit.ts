/**
 * Rate Limiting Library
 *
 * Implements in-memory rate limiting for API endpoints
 * Uses Redis for production (when REDIS_URL is set)
 */

import { redis } from '@/services/redis'

interface RateLimitConfig {
  limit: number // Max requests
  window: string // Time window: '1s', '1m', '1h', '1d'
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  reset: Date
}

/**
 * Parse time window string to milliseconds
 */
function parseWindow(window: string): number {
  const unit = window.slice(-1)
  const value = parseInt(window.slice(0, -1))

  const units: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  }

  if (!units[unit]) {
    throw new Error(`Invalid window unit: ${unit}. Use: s, m, h, d`)
  }

  return value * units[unit]
}

/**
 * In-memory store (fallback when Redis is not available)
 */
const memoryStore = new Map<
  string,
  { count: number; resetAt: number }
>()

/**
 * Clean up expired entries every 5 minutes
 */
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of memoryStore.entries()) {
    if (value.resetAt < now) {
      memoryStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

/**
 * Check rate limit for a key
 *
 * @param key - Unique identifier (userId, orgId, IP, etc)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 *
 * @example
 * ```ts
 * // Limit: 100 requests per minute
 * const result = await rateLimit.check(userId, {
 *   limit: 100,
 *   window: '1m'
 * })
 *
 * if (!result.allowed) {
 *   throw new Error('Rate limit exceeded')
 * }
 * ```
 */
export async function check(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const windowMs = parseWindow(config.window)
  const now = Date.now()
  const resetAt = now + windowMs

  // Try Redis first
  if (redis) {
    try {
      const rateLimitKey = `ratelimit:${key}`

      // Get current count
      const current = await redis.get(rateLimitKey)
      const count = current ? parseInt(current) : 0

      if (count >= config.limit) {
        // Limit exceeded
        const ttl = await redis.ttl(rateLimitKey)
        const reset = new Date(now + ttl * 1000)

        return {
          allowed: false,
          remaining: 0,
          reset,
        }
      }

      // Increment counter
      const newCount = count + 1
      await redis.set(rateLimitKey, newCount.toString(), {
        px: windowMs,
        nx: count === 0, // Only set TTL on first request
      })

      return {
        allowed: true,
        remaining: config.limit - newCount,
        reset: new Date(resetAt),
      }
    } catch (error) {
      console.error('Redis rate limit error, falling back to memory:', error)
      // Fall through to memory store
    }
  }

  // Fallback to memory store
  const entry = memoryStore.get(key)

  if (!entry || entry.resetAt < now) {
    // New window
    memoryStore.set(key, { count: 1, resetAt })
    return {
      allowed: true,
      remaining: config.limit - 1,
      reset: new Date(resetAt),
    }
  }

  if (entry.count >= config.limit) {
    // Limit exceeded
    return {
      allowed: false,
      remaining: 0,
      reset: new Date(entry.resetAt),
    }
  }

  // Increment counter
  entry.count++
  return {
    allowed: true,
    remaining: config.limit - entry.count,
    reset: new Date(entry.resetAt),
  }
}

/**
 * Reset rate limit for a key
 * Useful for testing or admin overrides
 */
export async function reset(key: string): Promise<void> {
  if (redis) {
    await redis.del(`ratelimit:${key}`)
  }
  memoryStore.delete(key)
}

/**
 * Get current rate limit status without incrementing
 */
export async function status(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const windowMs = parseWindow(config.window)
  const now = Date.now()

  if (redis) {
    try {
      const rateLimitKey = `ratelimit:${key}`
      const current = await redis.get(rateLimitKey)
      const count = current ? parseInt(current) : 0
      const ttl = await redis.ttl(rateLimitKey)
      const resetAt = now + ttl * 1000

      return {
        allowed: count < config.limit,
        remaining: Math.max(0, config.limit - count),
        reset: new Date(resetAt),
      }
    } catch (error) {
      console.error('Redis error:', error)
    }
  }

  // Memory store
  const entry = memoryStore.get(key)

  if (!entry || entry.resetAt < now) {
    return {
      allowed: true,
      remaining: config.limit,
      reset: new Date(now + windowMs),
    }
  }

  return {
    allowed: entry.count < config.limit,
    remaining: Math.max(0, config.limit - entry.count),
    reset: new Date(entry.resetAt),
  }
}

// Export as default for easier imports
export default { check, reset, status }
