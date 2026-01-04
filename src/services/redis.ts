import { Redis } from 'ioredis'

/**
 * Redis client instance for caching, session storage, and pub/sub.
 *
 * @remarks
 * Used for caching, session management, and real-time messaging.
 * Uses lazy initialization to avoid connection errors during build time.
 *
 * @see https://github.com/luin/ioredis
 */

// Check if we're in a build environment (Next.js build phase)
const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build'

let _redis: Redis | null = null

/**
 * Get the Redis client instance (lazy initialization)
 * Only creates the connection when first accessed at runtime
 */
export function getRedis(): Redis {
  if (isBuildTime) {
    // During build, throw to prevent connection attempts
    throw new Error('Redis is not available during build time')
  }

  if (!_redis) {
    _redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    })
  }
  return _redis
}

/**
 * Redis client with lazy initialization via Proxy
 * Prevents connection during build/import time
 */
export const redis = new Proxy({} as Redis, {
  get(target, prop) {
    // Avoid triggering Redis connection for type checks
    if (prop === 'then' || prop === Symbol.toStringTag || prop === Symbol.iterator) {
      return undefined
    }
    // During build, return no-op functions to prevent errors
    if (isBuildTime) {
      return () => Promise.resolve(null)
    }
    return Reflect.get(getRedis(), prop)
  },
  has() {
    return !isBuildTime
  },
})
