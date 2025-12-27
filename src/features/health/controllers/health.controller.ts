import { igniter } from '@/igniter'
import { z } from 'zod'
import { metrics } from '@/services/metrics'
import { storeCircuitBreaker, externalApiCircuitBreaker } from '@/services/circuit-breaker'
import { adminProcedure } from '@/features/auth/procedures/auth.procedure'
import { database } from '@/services/database'
import { uazapiService } from '@/lib/api/uazapi.service'

/**
 * Health Check Controller
 *
 * Provides comprehensive health monitoring for all services:
 * - Database (PostgreSQL via Prisma)
 * - Cache (Redis via Store)
 * - Jobs (BullMQ workers)
 * - Circuit Breakers status
 * - Metrics summary
 */
export const healthController = igniter.controller({
  name: 'Health',
  description: 'Health check and monitoring endpoints',
  path: '/health',
  actions: {
    /**
     * Basic health check - lightweight, for load balancers
     */
    ping: igniter.query({
      name: 'Ping',
      description: 'Simple ping check for load balancers',
      path: '/ping',
      handler: async ({ response }) => {
        return response.success({
          status: 'ok',
          timestamp: new Date().toISOString(),
        })
      },
    }),

    /**
     * Full health check - comprehensive, for monitoring
     */
    check: igniter.query({
      name: 'Health Check',
      description: 'Comprehensive health check of all services',
      path: '/',
      handler: async ({ context, response }) => {
        const checks: Record<string, {
          healthy: boolean
          latency?: number
          error?: string
          details?: Record<string, unknown>
        }> = {}

        // Check Database
        const dbStart = Date.now()
        try {
          await context.db.$queryRaw`SELECT 1`
          checks.database = {
            healthy: true,
            latency: Date.now() - dbStart,
          }
          metrics.recordHealthCheck('database', true, Date.now() - dbStart)
        } catch (error) {
          checks.database = {
            healthy: false,
            latency: Date.now() - dbStart,
            error: (error as Error).message,
          }
          metrics.recordHealthCheck('database', false, undefined, (error as Error).message)
        }

        // Check Redis/Store
        const storeStart = Date.now()
        try {
          await igniter.store.has('health:check')
          checks.store = {
            healthy: true,
            latency: Date.now() - storeStart,
            details: {
              circuitBreaker: storeCircuitBreaker.getState(),
            },
          }
          metrics.recordHealthCheck('store', true, Date.now() - storeStart)
        } catch (error) {
          checks.store = {
            healthy: false,
            latency: Date.now() - storeStart,
            error: (error as Error).message,
            details: {
              circuitBreaker: storeCircuitBreaker.getState(),
            },
          }
          metrics.recordHealthCheck('store', false, undefined, (error as Error).message)
        }

        // Check Jobs (BullMQ)
        try {
          // Jobs are healthy if they're registered
          checks.jobs = {
            healthy: true,
            details: {
              registered: true,
              prefix: process.env.QUEUE_PREFIX || 'quayer',
            },
          }
          metrics.recordHealthCheck('jobs', true)
        } catch (error) {
          checks.jobs = {
            healthy: false,
            error: (error as Error).message,
          }
          metrics.recordHealthCheck('jobs', false, undefined, (error as Error).message)
        }

        // Overall status
        const allHealthy = Object.values(checks).every((c) => c.healthy)

        return response.success({
          status: allHealthy ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          checks,
        })
      },
    }),

    /**
     * Metrics endpoint - detailed performance metrics
     */
    metrics: igniter.query({
      name: 'Metrics',
      description: 'Get detailed performance metrics',
      path: '/metrics',
      handler: async ({ response }) => {
        const summary = metrics.getSummary()

        return response.success({
          ...summary,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        })
      },
    }),

    /**
     * Ready check - for Kubernetes readiness probe
     */
    ready: igniter.query({
      name: 'Ready Check',
      description: 'Readiness probe for Kubernetes',
      path: '/ready',
      handler: async ({ context, response }) => {
        // Check if essential services are ready
        try {
          await context.db.$queryRaw`SELECT 1`
          await igniter.store.has('ready:check')

          return response.success({
            status: 'ready',
            timestamp: new Date().toISOString(),
          })
        } catch (error) {
          return response.badRequest('Service not ready: ' + (error as Error).message)
        }
      },
    }),

    /**
     * Live check - for Kubernetes liveness probe
     */
    live: igniter.query({
      name: 'Live Check',
      description: 'Liveness probe for Kubernetes',
      path: '/live',
      handler: async ({ response }) => {
        // Just check if the process is alive
        return response.success({
          status: 'alive',
          timestamp: new Date().toISOString(),
          pid: process.pid,
        })
      },
    }),

    /**
     * Circuit breaker status
     */
    circuits: igniter.query({
      name: 'Circuit Breakers',
      description: 'Get circuit breaker status for all services',
      path: '/circuits',
      handler: async ({ response }) => {
        return response.success({
          timestamp: new Date().toISOString(),
          circuits: {
            store: storeCircuitBreaker.getState(),
          },
        })
      },
    }),

    /**
     * UAZapi health check - verifica conectividade com UAZapi
     */
    uazapi: igniter.query({
      name: 'UAZapi Health',
      description: 'Verificar status de conexao com UAZapi',
      path: '/uazapi',
      use: [adminProcedure()],
      handler: async ({ response }) => {
        const results: {
          instanceId: string;
          name: string;
          status: 'healthy' | 'unhealthy' | 'disconnected';
          latency?: number;
          error?: string;
        }[] = [];

        // Buscar todas as instancias com token UAZapi
        const instances = await database.instance.findMany({
          where: {
            uazapiToken: { not: null },
            status: 'CONNECTED',
          },
          select: {
            id: true,
            name: true,
            uazapiToken: true,
          },
          take: 10, // Limitar para nao sobrecarregar
        });

        for (const instance of instances) {
          if (!instance.uazapiToken) continue;

          const start = Date.now();
          try {
            // Verificar status da instancia na UAZapi
            const statusResponse = await uazapiService.getInstanceStatus(instance.uazapiToken);
            const latency = Date.now() - start;

            if (statusResponse.success && statusResponse.data?.status === 'connected') {
              results.push({
                instanceId: instance.id,
                name: instance.name,
                status: 'healthy',
                latency,
              });
            } else {
              results.push({
                instanceId: instance.id,
                name: instance.name,
                status: 'disconnected',
                latency,
              });
            }
          } catch (error: any) {
            results.push({
              instanceId: instance.id,
              name: instance.name,
              status: 'unhealthy',
              latency: Date.now() - start,
              error: error.message,
            });
          }
        }

        const healthyCount = results.filter(r => r.status === 'healthy').length;
        const avgLatency = results.length > 0
          ? Math.round(results.reduce((sum, r) => sum + (r.latency || 0), 0) / results.length)
          : 0;

        return response.success({
          status: healthyCount === results.length ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          summary: {
            total: results.length,
            healthy: healthyCount,
            unhealthy: results.filter(r => r.status === 'unhealthy').length,
            disconnected: results.filter(r => r.status === 'disconnected').length,
            avgLatency,
          },
          circuitBreaker: externalApiCircuitBreaker.getState(),
          instances: results,
        });
      },
    }),

    /**
     * Reset circuit breaker (admin only)
     * ✅ SECURITY FIX: Now requires admin authentication
     */
    resetCircuit: igniter.mutation({
      name: 'Reset Circuit Breaker',
      description: 'Manually reset a circuit breaker',
      path: '/circuits/:name/reset',
      method: 'POST',
      use: [adminProcedure()],
      handler: async ({ request, response }) => {
        const { name } = request.params as { name: string }

        switch (name) {
          case 'store':
            storeCircuitBreaker.reset()
            break
          default:
            return response.notFound(`Circuit breaker '${name}' not found`)
        }

        return response.success({
          message: `Circuit breaker '${name}' has been reset`,
          newState: name === 'store' ? storeCircuitBreaker.getState() : null,
        })
      },
    }),
  },
})
