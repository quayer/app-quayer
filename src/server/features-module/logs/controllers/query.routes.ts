/**
 * Logs — Query Routes
 * Actions: list, stats, sources
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { loggerService } from '@/lib/logs/logger.service'
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure'
import { LogLevel } from '@prisma/client'

const logLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'])

export const queryRoutes = {
  // ==========================================
  // QUERY LOGS
  // ==========================================
  list: igniter.query({
    name: 'List Logs',
    description: 'List logs with filters',
    path: '/',
    method: 'GET',
    query: z.object({
      level: logLevelSchema.optional(),
      source: z.string().optional(),
      userId: z.string().optional(),
      organizationId: z.string().optional(),
      search: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      limit: z.coerce.number().min(1).max(500).default(100),
      offset: z.coerce.number().min(0).default(0),
    }).optional(),
    use: [authProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user
      if (!user || user.role !== 'admin') {
        return response.forbidden('Acesso negado. Apenas administradores.')
      }

      const query = request.query || {}
      const result = await loggerService.query({
        level: query.level as LogLevel | undefined,
        source: query.source,
        userId: query.userId,
        organizationId: query.organizationId,
        search: query.search,
        startDate: query.startDate ? new Date(query.startDate) : undefined,
        endDate: query.endDate ? new Date(query.endDate) : undefined,
        limit: query.limit || 100,
        offset: query.offset || 0,
      })

      return response.success({ data: result })
    },
  }),

  // ==========================================
  // GET LOG STATS
  // ==========================================
  stats: igniter.query({
    name: 'Get Log Stats',
    description: 'Get log statistics',
    path: '/stats',
    method: 'GET',
    query: z.object({
      period: z.enum(['hour', 'day', 'week']).default('day'),
    }).optional(),
    use: [authProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user
      if (!user || user.role !== 'admin') {
        return response.forbidden('Acesso negado')
      }

      const period = (request.query?.period || 'day') as 'hour' | 'day' | 'week'
      const stats = await loggerService.getStats(period)

      return response.success({ data: stats })
    },
  }),

  // ==========================================
  // GET SOURCES
  // ==========================================
  sources: igniter.query({
    name: 'Get Log Sources',
    description: 'Get list of log sources',
    path: '/sources',
    method: 'GET',
    use: [authProcedure({ required: true })],
    handler: async ({ context, response }) => {
      const user = context.auth?.session?.user
      if (!user || user.role !== 'admin') {
        return response.forbidden('Acesso negado')
      }

      // Common sources
      const sources = [
        'auth',
        'api',
        'webhook',
        'whatsapp',
        'database',
        'ai',
        'system',
        'cron',
        'email',
        'n8n',
      ]

      return response.success({ data: sources })
    },
  }),
}
