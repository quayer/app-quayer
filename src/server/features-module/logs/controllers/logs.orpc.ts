/**
 * Logs — porta mecânica do controller para oRPC (Igniter -> oRPC).
 *
 * Origem: ./query.routes.ts + ./ingest.routes.ts + ./analysis.routes.ts
 * (7 actions REST). O logs-sse.controller.ts (GET /logs/stream) NÃO entra:
 * SSE fica no Igniter até o cutover, quando vira route handler Next puro na
 * mesma URL (decisão do PLANO — event iterator só na fase 4 com
 * @caravela/realtime).
 *
 * Preservação de URL (basePath /api/v1 + controller /logs + action):
 *   list            GET  /api/v1/logs
 *   stats           GET  /api/v1/logs/stats
 *   sources         GET  /api/v1/logs/sources
 *   create          POST /api/v1/logs
 *   analyze         POST /api/v1/logs/analyze
 *   analyzeError    POST /api/v1/logs/analyze/:id
 *   recentAnalyses  GET  /api/v1/logs/analyses
 *
 * Fidelidade: todas admin-only — o gate `user.role !== 'admin'` responde 403
 * (response.forbidden) com as MESMAS mensagens; loggerService e aiLogAnalyzer
 * REUSADOS; shapes de sucesso via ok() (envelope Igniter { data, error }).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import type { User } from '@prisma/client'
import type { LogLevel } from '@prisma/client'
import { loggerService } from '@/lib/logs/logger.service'
import { aiLogAnalyzer } from '@/lib/logs/ai-analyzer.service'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { requireAuth } from '@/orpc/auth.middleware'

const logLevelSchema = z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'])

/** Mesmo gate admin dos 7 handlers originais (403 com a mensagem exata). */
function requireAdmin(
  context: { auth: { session: { user: User | null } } },
  message = 'Acesso negado',
): User {
  const user = context.auth.session.user
  if (!user || user.role !== 'admin') {
    throw new ORPCError('FORBIDDEN', { message })
  }
  return user
}

/** Builder autenticado — equivale a `use: [authProcedure({ required: true })]`. */
const authed = base.use(requireAuth)

// ──────────────────────────────────────────────────────────────────────────
// LIST — GET /logs
// ──────────────────────────────────────────────────────────────────────────
export const list = authed
  .route({ method: 'GET', path: '/logs', summary: 'List Logs', description: 'List logs with filters' })
  .input(
    z
      .object({
        level: logLevelSchema.optional(),
        source: z.string().optional(),
        userId: z.string().optional(),
        organizationId: z.string().optional(),
        search: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.coerce.number().min(1).max(500).default(100),
        offset: z.coerce.number().min(0).default(0),
      })
      .optional(),
  )
  .handler(async ({ input, context }) => {
    requireAdmin(context, 'Acesso negado. Apenas administradores.')

    const query = input ?? ({} as NonNullable<typeof input>)
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

    return ok({ data: result })
  })

// ──────────────────────────────────────────────────────────────────────────
// STATS — GET /logs/stats
// ──────────────────────────────────────────────────────────────────────────
export const stats = authed
  .route({ method: 'GET', path: '/logs/stats', summary: 'Get Log Stats', description: 'Get log statistics' })
  .input(z.object({ period: z.enum(['hour', 'day', 'week']).default('day') }).optional())
  .handler(async ({ input, context }) => {
    requireAdmin(context)

    const period = input?.period || 'day'
    const result = await loggerService.getStats(period)

    return ok({ data: result })
  })

// ──────────────────────────────────────────────────────────────────────────
// SOURCES — GET /logs/sources
// ──────────────────────────────────────────────────────────────────────────
export const sources = authed
  .route({ method: 'GET', path: '/logs/sources', summary: 'Get Log Sources', description: 'Get list of log sources' })
  .handler(async ({ context }) => {
    requireAdmin(context)

    // Common sources — lista estática copiada 1:1
    const sourcesList = [
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

    return ok({ data: sourcesList })
  })

// ──────────────────────────────────────────────────────────────────────────
// CREATE — POST /logs
// ──────────────────────────────────────────────────────────────────────────
export const create = authed
  .route({ method: 'POST', path: '/logs', summary: 'Create Log', description: 'Create a log entry manually' })
  .input(
    z.object({
      level: logLevelSchema,
      message: z.string().min(1),
      source: z.string().min(1),
      action: z.string().optional(),
      details: z.string().optional(),
      metadata: z.record(z.any()).optional(),
      tags: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const user = requireAdmin(context)

    const { level, message, source, action, details, metadata, tags } = input

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

    return ok({ data: log })
  })

// ──────────────────────────────────────────────────────────────────────────
// ANALYZE — POST /logs/analyze (body opcional no original)
// ──────────────────────────────────────────────────────────────────────────
export const analyze = authed
  .route({ method: 'POST', path: '/logs/analyze', summary: 'AI Analyze Logs', description: 'Analyze logs using AI' })
  .input(
    z
      .object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        source: z.string().optional(),
        level: logLevelSchema.optional(),
        limit: z.number().min(1).max(1000).default(500),
      })
      .optional(),
  )
  .handler(async ({ input, context }) => {
    requireAdmin(context)

    const body = input ?? ({} as NonNullable<typeof input>)
    const result = await aiLogAnalyzer.analyzeLogs({
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      source: body.source,
      level: body.level as LogLevel | undefined,
      limit: body.limit || 500,
    })

    return ok({ data: result })
  })

// ──────────────────────────────────────────────────────────────────────────
// ANALYZE ERROR — POST /logs/analyze/{id}
// ──────────────────────────────────────────────────────────────────────────
export const analyzeError = authed
  .route({
    method: 'POST',
    path: '/logs/analyze/{id}',
    summary: 'Analyze Error',
    description: 'AI analysis of a specific error',
  })
  .input(z.object({ id: z.string() }))
  .handler(async ({ input, context }) => {
    requireAdmin(context)

    try {
      const result = await aiLogAnalyzer.analyzeError(input.id)
      return ok({ data: result })
    } catch (error) {
      // Original: catch -> response.notFound(error.message)
      const message = error instanceof Error ? error.message : 'Not Found'
      throw new ORPCError('NOT_FOUND', { message })
    }
  })

// ──────────────────────────────────────────────────────────────────────────
// RECENT ANALYSES — GET /logs/analyses
// ──────────────────────────────────────────────────────────────────────────
export const recentAnalyses = authed
  .route({
    method: 'GET',
    path: '/logs/analyses',
    summary: 'Get Recent Analyses',
    description: 'Get recent AI analyses',
  })
  .input(z.object({ limit: z.coerce.number().min(1).max(50).default(10) }).optional())
  .handler(async ({ input, context }) => {
    requireAdmin(context)

    const limit = input?.limit || 10
    const analyses = await aiLogAnalyzer.getRecentAnalyses(limit)

    return ok({ data: analyses })
  })

/** Namespace espelhando o controller (api.logs.* no client Igniter). */
export const logs = {
  list,
  stats,
  sources,
  create,
  analyze,
  analyzeError,
  recentAnalyses,
}
