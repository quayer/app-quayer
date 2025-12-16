/**
 * Metrics Service
 *
 * Centralized metrics collection for jobs, store, and API operations.
 * Provides observability and monitoring capabilities.
 */

export interface JobMetric {
  jobName: string
  jobId: string
  status: 'started' | 'completed' | 'failed'
  executionTime?: number
  attemptsMade?: number
  error?: string
  timestamp: Date
}

export interface StoreMetric {
  operation: 'get' | 'set' | 'delete' | 'has'
  key: string
  hit: boolean
  duration: number
  timestamp: Date
}

export interface HealthStatus {
  service: string
  healthy: boolean
  latency?: number
  error?: string
  timestamp: Date
}

/**
 * Metrics Collector
 * In-memory metrics with optional persistence to Redis
 */
class MetricsCollector {
  private jobMetrics: JobMetric[] = []
  private storeMetrics: StoreMetric[] = []
  private healthChecks: Map<string, HealthStatus> = new Map()

  // Counters
  private jobsStarted = 0
  private jobsCompleted = 0
  private jobsFailed = 0
  private cacheHits = 0
  private cacheMisses = 0
  private cacheErrors = 0

  // Configuration
  private maxMetrics = 1000 // Keep last 1000 metrics in memory

  /**
   * Record job start
   */
  recordJobStart(jobName: string, jobId: string): void {
    this.jobsStarted++
    this.addJobMetric({
      jobName,
      jobId,
      status: 'started',
      timestamp: new Date(),
    })
    console.log(`[Metrics] Job started: ${jobName} (${jobId})`)
  }

  /**
   * Record job completion
   */
  recordJobComplete(
    jobName: string,
    jobId: string,
    executionTime: number,
    attemptsMade: number
  ): void {
    this.jobsCompleted++
    this.addJobMetric({
      jobName,
      jobId,
      status: 'completed',
      executionTime,
      attemptsMade,
      timestamp: new Date(),
    })
    console.log(`[Metrics] Job completed: ${jobName} (${jobId}) in ${executionTime}ms`)
  }

  /**
   * Record job failure
   */
  recordJobFailed(
    jobName: string,
    jobId: string,
    error: string,
    attemptsMade: number,
    isFinalAttempt: boolean
  ): void {
    this.jobsFailed++
    this.addJobMetric({
      jobName,
      jobId,
      status: 'failed',
      attemptsMade,
      error,
      timestamp: new Date(),
    })
    const finalMsg = isFinalAttempt ? ' (FINAL ATTEMPT)' : ''
    console.error(`[Metrics] Job failed: ${jobName} (${jobId}) - ${error}${finalMsg}`)
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(
    operation: 'get' | 'set' | 'delete' | 'has',
    key: string,
    hit: boolean,
    duration: number
  ): void {
    if (operation === 'get') {
      if (hit) {
        this.cacheHits++
      } else {
        this.cacheMisses++
      }
    }

    this.addStoreMetric({
      operation,
      key,
      hit,
      duration,
      timestamp: new Date(),
    })
  }

  /**
   * Record cache error
   */
  recordCacheError(operation: string, key: string, error: string): void {
    this.cacheErrors++
    console.error(`[Metrics] Cache error: ${operation} ${key} - ${error}`)
  }

  /**
   * Record health check result
   */
  recordHealthCheck(service: string, healthy: boolean, latency?: number, error?: string): void {
    this.healthChecks.set(service, {
      service,
      healthy,
      latency,
      error,
      timestamp: new Date(),
    })
  }

  /**
   * Get job statistics
   */
  getJobStats(): {
    started: number
    completed: number
    failed: number
    successRate: string
    recentJobs: JobMetric[]
  } {
    const total = this.jobsCompleted + this.jobsFailed
    const successRate = total > 0
      ? ((this.jobsCompleted / total) * 100).toFixed(2)
      : '100.00'

    return {
      started: this.jobsStarted,
      completed: this.jobsCompleted,
      failed: this.jobsFailed,
      successRate: `${successRate}%`,
      recentJobs: this.jobMetrics.slice(-10),
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    hits: number
    misses: number
    errors: number
    hitRate: string
    recentOperations: StoreMetric[]
  } {
    const total = this.cacheHits + this.cacheMisses
    const hitRate = total > 0
      ? ((this.cacheHits / total) * 100).toFixed(2)
      : '0.00'

    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      errors: this.cacheErrors,
      hitRate: `${hitRate}%`,
      recentOperations: this.storeMetrics.slice(-10),
    }
  }

  /**
   * Get all health check statuses
   */
  getHealthStatus(): Record<string, HealthStatus> {
    return Object.fromEntries(this.healthChecks)
  }

  /**
   * Get complete metrics summary
   */
  getSummary(): {
    jobs: ReturnType<typeof this.getJobStats>
    cache: ReturnType<typeof this.getCacheStats>
    health: Record<string, HealthStatus>
    timestamp: Date
  } {
    return {
      jobs: this.getJobStats(),
      cache: this.getCacheStats(),
      health: this.getHealthStatus(),
      timestamp: new Date(),
    }
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.jobMetrics = []
    this.storeMetrics = []
    this.healthChecks.clear()
    this.jobsStarted = 0
    this.jobsCompleted = 0
    this.jobsFailed = 0
    this.cacheHits = 0
    this.cacheMisses = 0
    this.cacheErrors = 0
  }

  private addJobMetric(metric: JobMetric): void {
    this.jobMetrics.push(metric)
    if (this.jobMetrics.length > this.maxMetrics) {
      this.jobMetrics = this.jobMetrics.slice(-this.maxMetrics)
    }
  }

  private addStoreMetric(metric: StoreMetric): void {
    this.storeMetrics.push(metric)
    if (this.storeMetrics.length > this.maxMetrics) {
      this.storeMetrics = this.storeMetrics.slice(-this.maxMetrics)
    }
  }
}

// Singleton instance
export const metrics = new MetricsCollector()

/**
 * Job lifecycle hooks factory
 * Creates standardized hooks for any job
 */
export function createJobHooks(jobName: string) {
  return {
    onStart: async ({ job }: { job: { id: string } }) => {
      metrics.recordJobStart(jobName, job.id)
    },
    onSuccess: async ({
      job,
      executionTime
    }: {
      job: { id: string; attemptsMade: number }
      executionTime: number
    }) => {
      metrics.recordJobComplete(jobName, job.id, executionTime, job.attemptsMade)
    },
    onFailure: async ({
      job,
      error,
      isFinalAttempt
    }: {
      job: { id: string; attemptsMade: number }
      error: Error
      isFinalAttempt: boolean
    }) => {
      metrics.recordJobFailed(
        jobName,
        job.id,
        error.message,
        job.attemptsMade,
        isFinalAttempt
      )
    },
  }
}
