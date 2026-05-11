/**
 * Logs — Analysis Routes
 * Actions: analyze, analyzeError, recentAnalyses
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { aiLogAnalyzer } from '@/lib/logs/ai-analyzer.service'
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure'
import { LogLevel } from '@prisma/client'

const logLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'])

export const analysisRoutes = {
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
}
