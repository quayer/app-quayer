/**
 * Logs — Ingest Routes
 * Actions: create
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { loggerService } from '@/lib/logs/logger.service'
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure'
import { LogLevel } from '@prisma/client'

const logLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'])

export const ingestRoutes = {
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
}
