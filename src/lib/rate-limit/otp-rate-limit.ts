import { getRedis } from '@/server/services/redis'

export interface OtpRateLimitResult {
  success: boolean
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter: number
}

export async function checkOtpRateLimit(identifier: string, ip: string | null): Promise<OtpRateLimitResult> {
  const redis = getRedis()
  const key = `otp:rate:${identifier}:${ip ?? 'unknown'}`
  const max = 5
  const window = 60 * 10 // 10 minutes

  try {
    const count = await redis.incr(key)
    if (count === 1) await redis.expire(key, window)
    const ttl = await redis.ttl(key)
    const allowed = count <= max
    return { success: allowed, allowed, remaining: Math.max(0, max - count), resetAt: Date.now() + ttl * 1000, retryAfter: allowed ? 0 : ttl }
  } catch {
    return { success: true, allowed: true, remaining: max, resetAt: Date.now() + window * 1000, retryAfter: 0 }
  }
}
