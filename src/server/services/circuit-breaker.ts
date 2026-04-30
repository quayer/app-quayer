/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures when Redis or other services are unavailable.
 * Provides graceful degradation and automatic recovery.
 */

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  threshold?: number
  /** Time in ms to wait before attempting recovery */
  timeout?: number
  /** Name for logging */
  name?: string
}

export class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state: CircuitState = 'closed'
  private successCount = 0

  private readonly threshold: number
  private readonly timeout: number
  private readonly name: string

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.threshold ?? 5
    this.timeout = options.timeout ?? 60000 // 1 minute default
    this.name = options.name ?? 'default'
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    // Check if circuit should transition from open to half-open
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open'
        this.successCount = 0
        console.log(`[CircuitBreaker:${this.name}] Transitioning to half-open`)
      } else {
        console.warn(`[CircuitBreaker:${this.name}] Circuit is OPEN, using fallback`)
        if (fallback) return fallback()
        throw new Error(`Circuit breaker is open for ${this.name}`)
      }
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      if (fallback) {
        console.warn(`[CircuitBreaker:${this.name}] Operation failed, using fallback`)
        return fallback()
      }
      throw error
    }
  }

  /**
   * Get current circuit state
   */
  getState(): { state: CircuitState; failures: number; lastFailure: Date | null } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailure: this.lastFailureTime > 0 ? new Date(this.lastFailureTime) : null,
    }
  }

  /**
   * Manually reset the circuit
   */
  reset(): void {
    this.failures = 0
    this.state = 'closed'
    this.successCount = 0
    console.log(`[CircuitBreaker:${this.name}] Circuit manually reset`)
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++
      // Require 3 successful operations before closing
      if (this.successCount >= 3) {
        this.state = 'closed'
        this.failures = 0
        console.log(`[CircuitBreaker:${this.name}] Circuit CLOSED after recovery`)
      }
    } else {
      this.failures = 0
    }
  }

  private onFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()

    if (this.state === 'half-open') {
      // Any failure in half-open immediately opens circuit
      this.state = 'open'
      console.warn(`[CircuitBreaker:${this.name}] Circuit OPENED (half-open failure)`)
    } else if (this.failures >= this.threshold) {
      this.state = 'open'
      console.warn(`[CircuitBreaker:${this.name}] Circuit OPENED (threshold: ${this.threshold} reached)`)
    }
  }
}

/**
 * Retry with Exponential Backoff
 * For transient failures that may recover
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number
    baseDelay?: number
    maxDelay?: number
    jitterFactor?: number
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    jitterFactor = 0.2,
  } = options

  let lastError: Error = new Error('Operation failed')

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      if (attempt < maxRetries) {
        // Calculate delay with exponential backoff
        let delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)

        // Add jitter to prevent thundering herd
        if (jitterFactor > 0) {
          const jitter = delay * jitterFactor * (Math.random() * 2 - 1)
          delay = Math.max(0, delay + jitter)
        }

        console.warn(
          `[Retry] Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${Math.round(delay)}ms`
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

/**
 * Cache with Fallback Pattern
 * Get from cache with automatic fallback to source
 */
export async function getCachedOrFetch<T>(
  cacheGet: () => Promise<T | null>,
  cachePut: (data: T) => Promise<void>,
  fetchFn: () => Promise<T>,
  options: {
    circuitBreaker?: CircuitBreaker
    logPrefix?: string
  } = {}
): Promise<T> {
  const { circuitBreaker, logPrefix = 'Cache' } = options

  // Try cache with circuit breaker
  try {
    const operation = async () => {
      const cached = await cacheGet()
      if (cached !== null) {
        return { data: cached, fromCache: true }
      }
      return null
    }

    const cacheResult = circuitBreaker
      ? await circuitBreaker.execute(operation, async () => null)
      : await operation()

    if (cacheResult?.fromCache) {
      return cacheResult.data
    }
  } catch (error) {
    console.warn(`[${logPrefix}] Cache read failed, fetching from source`)
  }

  // Fetch from source
  const data = await fetchFn()

  // Try to cache (fire and forget with circuit breaker)
  try {
    const cacheOperation = () => cachePut(data)

    if (circuitBreaker) {
      circuitBreaker.execute(cacheOperation).catch(() => {
        // Ignore cache write failures
      })
    } else {
      cacheOperation().catch(() => {
        // Ignore cache write failures
      })
    }
  } catch {
    // Ignore cache write failures
  }

  return data
}

// Pre-configured circuit breakers for common services
export const storeCircuitBreaker = new CircuitBreaker({
  name: 'store',
  threshold: 5,
  timeout: 60000,
})

export const externalApiCircuitBreaker = new CircuitBreaker({
  name: 'external-api',
  threshold: 3,
  timeout: 30000,
})
