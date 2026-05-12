/**
 * Messages — List Routes
 *
 * Actions:
 *   - list          GET /                (mensagens de uma sessão)
 *   - getById       GET /:id             (mensagem por ID, filtrada por org)
 *   - listSessions  GET /sessions        (sessões da org com filtros opcionais)
 *
 * Todas as actions:
 *   - Exigem autenticação via authProcedure({ required: true })
 *   - Filtram por organizationId do user atual (multi-tenant isolation)
 */

import { igniter } from '@/igniter'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure'

const PAGINATION_DEFAULTS = {
  limit: 50,
  offset: 0,
}

export const listRoutes = {
  // ==========================================
  // LIST MESSAGES (by sessionId)
  // ==========================================
  list: igniter.query({
    name: 'List Messages',
    description: 'Lista mensagens de uma sessão de chat, filtradas pela organization do usuário.',
    path: '/',
    method: 'GET',
    query: z
      .object({
        sessionId: z.string().min(1, 'sessionId é obrigatório'),
        limit: z.coerce.number().min(1).max(100).default(PAGINATION_DEFAULTS.limit),
        offset: z.coerce.number().min(0).default(PAGINATION_DEFAULTS.offset),
      })
      .optional(),
    use: [authProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user
      const orgId = (user as { currentOrgId?: string | null } | undefined)?.currentOrgId
      if (!orgId) {
        return response.badRequest('missing currentOrgId')
      }

      const query = request.query as
        | { sessionId?: string; limit?: number; offset?: number }
        | undefined

      const sessionId = query?.sessionId
      if (!sessionId) {
        return response.badRequest('sessionId é obrigatório')
      }

      const limit = Math.min(query?.limit ?? PAGINATION_DEFAULTS.limit, 100)
      const offset = query?.offset ?? PAGINATION_DEFAULTS.offset

      // 1) Verifica posse: sessão pertence à org do usuário
      const session = await database.chatSession.findFirst({
        where: { id: sessionId, organizationId: orgId },
        select: { id: true },
      })

      if (!session) {
        return response.notFound('Sessão não encontrada')
      }

      // 2) Busca mensagens em ordem cronológica
      const messages = await database.message.findMany({
        where: { sessionId },
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'asc' },
      })

      return response.success({ data: messages })
    },
  }),

  // ==========================================
  // GET MESSAGE BY ID
  // ==========================================
  getById: igniter.query({
    name: 'Get Message by ID',
    description: 'Retorna uma mensagem pelo ID, isolada pela organization do usuário.',
    path: '/:id' as const,
    method: 'GET',
    use: [authProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user
      const orgId = (user as { currentOrgId?: string | null } | undefined)?.currentOrgId
      if (!orgId) {
        return response.badRequest('missing currentOrgId')
      }

      const params = request.params as { id?: string } | undefined
      const id = params?.id
      if (!id) {
        return response.badRequest('id é obrigatório')
      }

      const message = await database.message.findFirst({
        where: {
          id,
          session: { organizationId: orgId },
        },
      })

      if (!message) {
        return response.notFound('Mensagem não encontrada')
      }

      return response.success({ data: message })
    },
  }),

  // ==========================================
  // LIST SESSIONS (by current org)
  // ==========================================
  listSessions: igniter.query({
    name: 'List Chat Sessions',
    description: 'Lista sessões de chat da organization do usuário, com filtro opcional de status.',
    path: '/sessions',
    method: 'GET',
    query: z
      .object({
        status: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).default(PAGINATION_DEFAULTS.limit),
        offset: z.coerce.number().min(0).default(PAGINATION_DEFAULTS.offset),
      })
      .optional(),
    use: [authProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user
      const orgId = (user as { currentOrgId?: string | null } | undefined)?.currentOrgId
      if (!orgId) {
        return response.badRequest('missing currentOrgId')
      }

      const query = request.query as
        | { status?: string; limit?: number; offset?: number }
        | undefined

      const limit = Math.min(query?.limit ?? PAGINATION_DEFAULTS.limit, 100)
      const offset = query?.offset ?? PAGINATION_DEFAULTS.offset

      const where: Record<string, unknown> = { organizationId: orgId }
      if (query?.status) {
        where.status = query.status
      }

      const sessions = await database.chatSession.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { lastMessageAt: 'desc' },
      })

      return response.success({ data: sessions })
    },
  }),
}
