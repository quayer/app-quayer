/**
 * Builder Chat — porta mecânica para oRPC (lote B2 do builder).
 *
 * Origem: ./chat.routes.ts (4 actions; 3 migradas).
 *   listMessages  GET  /builder/projects/:id/chat/messages
 *   getReadiness  GET  /builder/projects/:id/readiness
 *   compact       POST /builder/projects/:id/chat/compact
 *
 * NÃO MIGRA (SSE — fica no Igniter até a fase 4):
 *   sendMessage   POST /builder/projects/:id/chat/message (buildSseResponse)
 *
 * Guards do original preservados: auth -> org -> conversa por projectId ->
 * posse por organizationId (403). Validação de UUID passa para .input()
 * (status 400 preservado; corpo de erro no shape oRPC — delta aceito).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { compactIfNeeded } from './handlers/compact-if-needed'
import { getReadiness } from '../state/readiness-resolver'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const projectIdParam = { id: z.string().uuid('projectId inválido') }
const authed = base.use(authOrApiKey)

/**
 * Guard comum do chat: carrega a conversa do projeto e valida a posse pela
 * org ativa (espelho 1:1 dos guards de chat.routes.ts).
 */
async function loadConversationForOrg(
  projectId: string,
  orgId: string,
): Promise<{ id: string }> {
  const conversation = await database.builderProjectConversation.findUnique({
    where: { projectId },
    select: { id: true, organizationId: true },
  })
  if (!conversation) {
    throw new ORPCError('NOT_FOUND', { message: 'Conversa não encontrada' })
  }
  if (conversation.organizationId !== orgId) {
    throw new ORPCError('FORBIDDEN', { message: 'Acesso negado a esta conversa' })
  }
  return { id: conversation.id }
}

// ==========================================
// LIST MESSAGES — GET /builder/projects/{id}/chat/messages
// ==========================================
export const listMessages = authed
  .route({
    method: 'GET',
    path: '/builder/projects/{id}/chat/messages',
    summary: 'List Builder Chat Messages',
  })
  .input(
    z.object({
      ...projectIdParam,
      limit: z.coerce.number().int().min(1).max(200).optional(),
      cursor: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const conversation = await loadConversationForOrg(input.id, orgId)

    const limit = input.limit ?? 50

    const messages = await database.builderProjectMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    })

    const hasMore = messages.length > limit
    const page = hasMore ? messages.slice(0, limit) : messages
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null

    return ok({ success: true, data: page, nextCursor })
  })

// ==========================================
// READINESS — GET /builder/projects/{id}/readiness
// ==========================================
export const getReadinessAction = authed
  .route({
    method: 'GET',
    path: '/builder/projects/{id}/readiness',
    summary: 'Get Builder Project Readiness',
  })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const conversation = await loadConversationForOrg(input.id, orgId)

    const readiness = await getReadiness(conversation.id, orgId)

    return ok({ success: true, data: readiness })
  })

// ==========================================
// COMPACT — POST /builder/projects/{id}/chat/compact
// ==========================================
export const compact = authed
  .route({
    method: 'POST',
    path: '/builder/projects/{id}/chat/compact',
    summary: 'Compact Builder Chat History',
  })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const conversation = await loadConversationForOrg(input.id, orgId)

    const rows = await database.builderProjectMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    })

    const outcome = await compactIfNeeded(
      conversation.id,
      rows.map((m) => ({ role: m.role as string, content: m.content })),
    )

    if (outcome.exhausted) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Conversa ficou muito longa. Crie um novo projeto para continuar.',
      })
    }

    return ok({
      success: true,
      compacted: outcome.compacted,
      messages: outcome.messages.length,
    })
  })

export const chatActions = {
  listMessages,
  getReadiness: getReadinessAction,
  compact,
}
