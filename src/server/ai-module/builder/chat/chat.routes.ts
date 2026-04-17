/**
 * Builder Chat Routes — SSE send, paginated list, manual compact.
 * All heavy lifting lives in ./handlers/*; these are thin orchestrators.
 * `sendMessage` must mirror builder.controller.ts#sendChatMessage on the wire.
 */

import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { database } from '@/server/services/database'
import { z } from 'zod'

import { sendChatMessageInputSchema } from '../builder.schemas'
import { BUILDER_RESERVED_NAME } from '../builder.constants'

import { persistUserMessage } from './handlers/persist-message'
import { compactIfNeeded } from './handlers/compact-if-needed'
import { buildSseResponse } from './sse-stream'

// Local utilities
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().uuid().optional(),
})

interface AuthedUser {
  id: string
  currentOrgId?: string | null
}

function getUser(context: unknown): AuthedUser | null {
  const ctx = context as {
    auth?: { session?: { user?: AuthedUser } }
  } | null
  return ctx?.auth?.session?.user ?? null
}

// sendMessage — SSE streaming
const sendMessage = igniter.mutation({
  name: 'Send Builder Chat Message',
  description:
    'Send a user message to the Builder meta-agent and stream the response via SSE (text-delta, tool-call, tool-result, finish, error).',
  path: '/projects/:id/chat/message' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: sendChatMessageInputSchema,
  handler: async ({ request, context, response }) => {
    const user = getUser(context)
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }

    const { id: projectId } = request.params as { id: string }
    if (!projectId || !UUID_REGEX.test(projectId)) {
      return response.badRequest('projectId inválido')
    }

    const { content } = request.body

    const conversation = await database.builderProjectConversation.findUnique({
      where: { projectId },
      include: { project: true },
    })
    if (!conversation) {
      return response.notFound('Conversa do Builder não encontrada')
    }
    if (conversation.organizationId !== user.currentOrgId) {
      return response.forbidden('Acesso negado a esta conversa')
    }

    const builderAgent = await database.aIAgentConfig.findFirst({
      where: {
        organizationId: user.currentOrgId,
        name: BUILDER_RESERVED_NAME,
      },
    })
    if (!builderAgent) {
      return response.badRequest(
        'Builder AI not initialized for this organization. Contact admin to run the register-builder-agent script.',
      )
    }

    // Persist the user message before streaming.
    await persistUserMessage({
      conversationId: conversation.id,
      content,
    })

    return buildSseResponse({
      agentConfigId: builderAgent.id,
      conversationId: conversation.id,
      organizationId: user.currentOrgId,
      userId: user.id,
      userMessage: content,
      stateSummary: conversation.stateSummary,
    })
  },
})

// listMessages — paginated history
const listMessages = igniter.query({
  name: 'List Builder Chat Messages',
  description:
    'Paginated list of BuilderProjectMessage rows for a given project, newest-first.',
  path: '/projects/:id/chat/messages' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = getUser(context)
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }

    const { id: projectId } = request.params as { id: string }
    if (!projectId || !UUID_REGEX.test(projectId)) {
      return response.badRequest('projectId inválido')
    }

    const query = listMessagesQuerySchema.parse(request.query ?? {})
    const limit = query.limit ?? 50

    const conversation = await database.builderProjectConversation.findUnique({
      where: { projectId },
      select: { id: true, organizationId: true },
    })
    if (!conversation) return response.notFound('Conversa não encontrada')
    if (conversation.organizationId !== user.currentOrgId) {
      return response.forbidden('Acesso negado a esta conversa')
    }

    const messages = await database.builderProjectMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor
        ? { cursor: { id: query.cursor }, skip: 1 }
        : {}),
    })

    const hasMore = messages.length > limit
    const page = hasMore ? messages.slice(0, limit) : messages
    const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null

    return response.json({
      success: true,
      data: page,
      nextCursor,
    })
  },
})

// compact — manual compaction trigger
const compact = igniter.mutation({
  name: 'Compact Builder Chat History',
  description:
    'Manually trigger a context-budget compaction pass for this project conversation.',
  path: '/projects/:id/chat/compact' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({}).optional(),
  handler: async ({ request, context, response }) => {
    const user = getUser(context)
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }

    const { id: projectId } = request.params as { id: string }
    if (!projectId || !UUID_REGEX.test(projectId)) {
      return response.badRequest('projectId inválido')
    }

    const conversation = await database.builderProjectConversation.findUnique({
      where: { projectId },
      select: { id: true, organizationId: true },
    })
    if (!conversation) return response.notFound('Conversa não encontrada')
    if (conversation.organizationId !== user.currentOrgId) {
      return response.forbidden('Acesso negado a esta conversa')
    }

    const rows = await database.builderProjectMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    })

    const outcome = await compactIfNeeded(conversation.id, rows.map((m) => ({
      role: m.role as string,
      content: m.content,
    })))

    if (outcome.exhausted) {
      return response.badRequest(
        'Conversa ficou muito longa. Crie um novo projeto para continuar.',
      )
    }

    return response.json({
      success: true,
      compacted: outcome.compacted,
      messages: outcome.messages.length,
    })
  },
})

// Export composition
export const chatRoutes = {
  sendMessage,
  listMessages,
  compact,
}
