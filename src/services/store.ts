import { createRedisStoreAdapter } from '@igniter-js/adapter-redis'
import { redis } from '@/services/redis'
import { metrics } from '@/services/metrics'
import { storeCircuitBreaker, getCachedOrFetch } from '@/services/circuit-breaker'

/**
 * Store adapter for data persistence.
 * ✅ v0.4.0: Circuit breaker integration
 * ✅ v0.4.0: Metrics collection
 * ✅ v0.4.0: Resilient cache operations
 *
 * @remarks
 * Provides a unified interface for data storage operations using Redis.
 * Includes circuit breaker protection and automatic fallback.
 *
 * @see https://github.com/felipebarcelospro/igniter-js/tree/main/packages/adapter-redis
 */
export const store = createRedisStoreAdapter(redis)

/**
 * Resilient cache get with circuit breaker and metrics
 */
export async function resilientCacheGet<T>(key: string): Promise<T | null> {
  const start = Date.now()

  try {
    const result = await storeCircuitBreaker.execute(
      async () => store.get<T>(key),
      async () => null // Fallback: return null (cache miss)
    )

    const duration = Date.now() - start
    metrics.recordCacheOperation('get', key, result !== null, duration)

    return result
  } catch (error) {
    metrics.recordCacheError('get', key, (error as Error).message)
    return null
  }
}

/**
 * Resilient cache set with circuit breaker and metrics
 */
export async function resilientCacheSet<T>(
  key: string,
  value: T,
  options?: { ttl?: number }
): Promise<boolean> {
  const start = Date.now()

  try {
    await storeCircuitBreaker.execute(
      async () => store.set(key, value, options),
      async () => { /* Fallback: do nothing */ }
    )

    const duration = Date.now() - start
    metrics.recordCacheOperation('set', key, true, duration)

    return true
  } catch (error) {
    metrics.recordCacheError('set', key, (error as Error).message)
    return false
  }
}

/**
 * Resilient cache delete with circuit breaker and metrics
 */
export async function resilientCacheDel(key: string): Promise<boolean> {
  const start = Date.now()

  try {
    await storeCircuitBreaker.execute(
      async () => store.del(key),
      async () => { /* Fallback: do nothing */ }
    )

    const duration = Date.now() - start
    metrics.recordCacheOperation('delete', key, true, duration)

    return true
  } catch (error) {
    metrics.recordCacheError('delete', key, (error as Error).message)
    return false
  }
}

/**
 * Get from cache with automatic fallback to fetch function
 * Includes circuit breaker protection
 */
export async function getOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options?: { ttl?: number }
): Promise<T> {
  return getCachedOrFetch<T>(
    () => resilientCacheGet<T>(key),
    (data) => resilientCacheSet(key, data, options).then(() => {}),
    fetchFn,
    { circuitBreaker: storeCircuitBreaker, logPrefix: 'Store' }
  )
}
