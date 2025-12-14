/**
 * Logs Controller
 *
 * API endpoints for log management and AI analysis
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { loggerService } from '@/lib/logs/logger.service'
import { aiLogAnalyzer } from '@/lib/logs/ai-analyzer.service'
import { authProcedure } from '@/features/auth/procedures/auth.procedure'
import { LogLevel } from '@prisma/client'

const logLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'])

export const logsController = igniter.controller({
  name: 'logs',
  path: '/logs',
  description: 'Log management and AI analysis (admin only)',
  actions: {
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
    // AI ANALYZE LOGS
    // ==========================================
    analyze: igniter.mutation({
      name: 'AI Analyze Logs',
      description: 'Analyze logs using AI',
      path: '/analyze',
      method: 'POST',
      body: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        source: z.string().optional(),
        level: logLevelSchema.optional(),
        limit: z.number().min(1).max(1000).default(500),
      }).optional(),
      use: [authProcedure({ required: true })],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user
        if (!user || user.role !== 'admin') {
          return response.forbidden('Acesso negado')
        }

        const body = request.body || {}
        const result = await aiLogAnalyzer.analyzeLogs({
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined,
          source: body.source,
          level: body.level as LogLevel | undefined,
          limit: body.limit || 500,
        })

        return response.success({ data: result })
      },
    }),

    // ==========================================
    // ANALYZE SINGLE ERROR
    // ==========================================
    analyzeError: igniter.mutation({
      name: 'Analyze Error',
      description: 'AI analysis of a specific error',
      path: '/analyze/:id',
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user
        if (!user || user.role !== 'admin') {
          return response.forbidden('Acesso negado')
        }

        const { id } = request.params as { id: string }

        try {
          const result = await aiLogAnalyzer.analyzeError(id)
          return response.success({ data: result })
        } catch (error: any) {
          return response.notFound(error.message)
        }
      },
    }),

    // ==========================================
    // GET RECENT ANALYSES
    // ==========================================
    recentAnalyses: igniter.query({
      name: 'Get Recent Analyses',
      description: 'Get recent AI analyses',
      path: '/analyses',
      method: 'GET',
      query: z.object({
        limit: z.coerce.number().min(1).max(50).default(10),
      }).optional(),
      use: [authProcedure({ required: true })],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user
        if (!user || user.role !== 'admin') {
          return response.forbidden('Acesso negado')
        }

        const limit = request.query?.limit || 10
        const analyses = await aiLogAnalyzer.getRecentAnalyses(limit)

        return response.success({ data: analyses })
      },
    }),

    // ==========================================
    // CREATE LOG ENTRY (for testing/manual logging)
    // ==========================================
    create: igniter.mutation({
      name: 'Create Log',
      description: 'Create a log entry manually',
      path: '/',
      method: 'POST',
      body: z.object({
        level: logLevelSchema,
        message: z.string().min(1),
        source: z.string().min(1),
        action: z.string().optional(),
        details: z.string().optional(),
        metadata: z.record(z.any()).optional(),
        tags: z.array(z.string()).optional(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user
        if (!user || user.role !== 'admin') {
          return response.forbidden('Acesso negado')
        }

        const { level, message, source, action, details, metadata, tags } = request.body

        const log = await loggerService.log(level as LogLevel, message, {
          source,
          action,
          details,
          metadata,
          tags,
          context: {
            userId: user.id,
          },
        })

        return response.success({ data: log })
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
  },
})
