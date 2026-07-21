/**
 * oRPC SPIKE — porta mecânica do controller `messages` (Igniter.js -> oRPC)
 *
 * Origem: src/server/communication/messages/list.routes.ts
 *
 * Preservação de URL (critério 1 do gate):
 *   Igniter monta: basePath '/api/v1' + controller.path '/messages' + action.path
 *     list          GET /api/v1/messages
 *     getById       GET /api/v1/messages/:id
 *     listSessions  GET /api/v1/messages/sessions
 *   oRPC declara o path COMPLETO relativo ao prefixo do handler via
 *   `.route({ method, path })` — o prefixo é dado no mount (route handler).
 *   Com prefix '/api/v1' os paths finais são idênticos aos originais.
 *   (No spike o mount usa prefix '/api/orpc' para não conflitar com o
 *   Igniter que ainda serve /api/v1 — a tabela de rotas é a mesma.)
 *   Diferença sintática: path param é `{id}` (OpenAPI) em vez de `:id`.
 *
 * Validação (critério 3): schemas Zod copiados 1:1 — zod@3.25 implementa
 * Standard Schema, que o oRPC consome nativamente via `.input()`.
 *
 * Handlers: chamam os MESMOS serviços (database/Prisma) com as MESMAS queries.
 * Diferença: em vez de `response.badRequest/notFound/success`, usa-se
 * `throw new ORPCError(...)` e retorno direto do objeto (o status 200 é
 * implícito; o shape do body é o retorno do handler).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { ok } from './envelope'
import { requireAuth } from './auth.middleware'
import { base } from './base'

const PAGINATION_DEFAULTS = {
  limit: 50,
  offset: 0,
}

/** Builder autenticado — equivale a `use: [authProcedure({ required: true })]`. */
const authed = base.use(requireAuth)

/** Mesma leitura de orgId feita pelos handlers originais. */
function orgIdOf(user: unknown): string | null {
  return (user as { currentOrgId?: string | null } | undefined)?.currentOrgId ?? null
}

// ==========================================
// LIST MESSAGES (by sessionId) — GET /messages
// ==========================================
export const list = authed
  .route({
    method: 'GET',
    path: '/messages',
    summary: 'List Messages',
    description: 'Lista mensagens de uma sessão de chat, filtradas pela organization do usuário.',
  })
  .input(
    // Schema copiado 1:1 do original (query). No original era `.optional()`,
    // mas o handler retornava 400 sem sessionId — aqui o Zod já garante isso
    // (sessionId obrigatório), comportamento HTTP idêntico (400).
    z.object({
      sessionId: z.string().min(1, 'sessionId é obrigatório'),
      limit: z.coerce.number().min(1).max(100).default(PAGINATION_DEFAULTS.limit),
      offset: z.coerce.number().min(0).default(PAGINATION_DEFAULTS.offset),
    }),
  )
  .handler(async ({ input, context }) => {
    const orgId = orgIdOf(context.auth.session.user)
    if (!orgId) {
      throw new ORPCError('BAD_REQUEST', { message: 'missing currentOrgId' })
    }

    const limit = Math.min(input.limit, 100)
    const offset = input.offset

    // 1) Verifica posse: sessão pertence à org do usuário
    const session = await database.chatSession.findFirst({
      where: { id: input.sessionId, organizationId: orgId },
      select: { id: true },
    })

    if (!session) {
      throw new ORPCError('NOT_FOUND', { message: 'Sessão não encontrada' })
    }

    // 2) Busca mensagens em ordem cronológica
    const messages = await database.message.findMany({
      where: { sessionId: input.sessionId },
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'asc' },
    })

    return ok({ data: messages })
  })

// ==========================================
// GET MESSAGE BY ID — GET /messages/{id}
// ==========================================
export const getById = authed
  .route({
    method: 'GET',
    path: '/messages/{id}',
    summary: 'Get Message by ID',
    description: 'Retorna uma mensagem pelo ID, isolada pela organization do usuário.',
  })
  .input(z.object({ id: z.string().min(1, 'id é obrigatório') }))
  .handler(async ({ input, context }) => {
    const orgId = orgIdOf(context.auth.session.user)
    if (!orgId) {
      throw new ORPCError('BAD_REQUEST', { message: 'missing currentOrgId' })
    }

    const message = await database.message.findFirst({
      where: {
        id: input.id,
        session: { organizationId: orgId },
      },
    })

    if (!message) {
      throw new ORPCError('NOT_FOUND', { message: 'Mensagem não encontrada' })
    }

    return ok({ data: message })
  })

// ==========================================
// LIST SESSIONS (by current org) — GET /messages/sessions
// ==========================================
export const listSessions = authed
  .route({
    method: 'GET',
    path: '/messages/sessions',
    summary: 'List Chat Sessions',
    description: 'Lista sessões de chat da organization do usuário, com filtro opcional de status.',
  })
  .input(
    z.object({
      status: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(PAGINATION_DEFAULTS.limit),
      offset: z.coerce.number().min(0).default(PAGINATION_DEFAULTS.offset),
    }),
  )
  .handler(async ({ input, context }) => {
    const orgId = orgIdOf(context.auth.session.user)
    if (!orgId) {
      throw new ORPCError('BAD_REQUEST', { message: 'missing currentOrgId' })
    }

    const limit = Math.min(input.limit, 100)
    const offset = input.offset

    const where: Record<string, unknown> = { organizationId: orgId }
    if (input.status) {
      where.status = input.status
    }

    const sessions = await database.chatSession.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { lastMessageAt: 'desc' },
    })

    return ok({ data: sessions })
  })

/**
 * Router — equivale ao igniter.router({ controllers: { messages: ... } }).
 * A chave `messages` espelha o namespace do client (api.messages.list.useQuery
 * no Igniter -> orpc.messages.list.queryOptions no oRPC/TanStack).
 */
export const spikeRouter = {
  messages: {
    list,
    getById,
    listSessions,
  },
}
