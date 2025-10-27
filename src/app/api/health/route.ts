import { NextResponse } from 'next/server'
import { database as db } from '@/services/database'
import { redis } from '@/services/redis'

/**
 * @endpoint GET /api/health
 * @description Health check endpoint for Docker, Kubernetes, load balancers
 * @returns {object} Health status with service checks
 *
 * Response Example:
 * {
 *   "status": "healthy",
 *   "timestamp": "2025-10-11T12:00:00.000Z",
 *   "uptime": 123456,
 *   "services": {
 *     "database": "up",
 *     "redis": "up"
 *   }
 * }
 */
export async function GET() {
  const startTime = Date.now()

  try {
    // Check database connection
    let databaseStatus = 'down'
    try {
      await db.$queryRaw`SELECT 1`
      databaseStatus = 'up'
    } catch (error) {
      console.error('[Health Check] Database error:', error)
    }

    // Check Redis connection
    let redisStatus = 'down'
    try {
      await redis.ping()
      redisStatus = 'up'
    } catch (error) {
      console.error('[Health Check] Redis error:', error)
    }

    // Calculate response time
    const responseTime = Date.now() - startTime

    // Determine overall status
    const isHealthy = databaseStatus === 'up' && redisStatus === 'up'
    const status = isHealthy ? 'healthy' : 'degraded'
    const statusCode = isHealthy ? 200 : 503

    const healthData = {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      responseTime: `${responseTime}ms`,
      services: {
        database: databaseStatus,
        redis: redisStatus,
      },
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'unknown',
    }

    return NextResponse.json(healthData, { status: statusCode })
  } catch (error) {
    console.error('[Health Check] Critical error:', error)

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    )
  }
}

/**
 * @endpoint HEAD /api/health
 * @description Lightweight health check (no body)
 * @returns {void} 200 if healthy, 503 if unhealthy
 */
export async function HEAD() {
  try {
    await db.$queryRaw`SELECT 1`
    await redis.ping()
    return new NextResponse(null, { status: 200 })
  } catch (error) {
    return new NextResponse(null, { status: 503 })
  }
}
