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
import { ensureBuilderAgent } from '../services/ensure-builder-agent'

import { persistUserMessage } from './handlers/persist-message'
import { compactIfNeeded } from './handlers/compact-if-needed'
import { buildSseResponse } from './sse-stream'
import { getReadiness } from '../state/readiness-resolver'
import type { Readiness } from '../state/readiness.types'

import { extractSourceRefs } from '../sources/url-extractor'
import type { ProjectRow } from '../knowledge/knowledge-helpers'
import { ingestSourceRefs } from '../sources/ingest-source-refs'

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

// ---------------------------------------------------------------------------
// Source-ingestion hook (Orayon Uplift §5 — "cole seu site/IG")
// ---------------------------------------------------------------------------
//
// When a chat turn pastes a site/Instagram link, we auto-seed the source
// pipeline (create KnowledgeSource rows → seed builderState.sourceIngestion →
// enqueue ONE async quayer:source-enrich job). All of that lives in the shared
// `ingestSourceRefs` helper (also used by the explicit POST /sources/ingest
// route), which seeds builderState through the race-safe atomic patch. The
// actual extraction/synthesis runs on the WORKER (or the dev sync-fallback),
// NEVER inline in this SSE turn.
//
// This helper is invoked FIRE-AND-FORGET from sendMessage (`void kickoff…`) so a
// slow/failed seed can never block or break the response stream.

/** Cap how many refs we auto-ingest from a single chat turn (DoS guard). */
const MAX_SOURCE_REFS_PER_TURN = 10

/**
 * Detect pasted site/IG refs in the user message and, if any, kick off the
 * shared source-ingestion pipeline. Org-scoped on EVERY query (inside the
 * helper). Never blocks the caller — designed to be fired with `void` and an
 * attached `.catch`.
 */
async function kickoffSourceIngestion(args: {
  project: ProjectRow
  conversationId: string
  organizationId: string
  userId: string
  content: string
}): Promise<void> {
  const { project, conversationId, organizationId, userId, content } = args

  const refs = extractSourceRefs(content).slice(0, MAX_SOURCE_REFS_PER_TURN)
  if (refs.length === 0) return

  await ingestSourceRefs({
    project,
    conversationId,
    organizationId,
    userId,
    refs,
  })
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

    const { content, skipUserPersist } = request.body

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

    // Lazy-init: cria o meta-agente do Builder na 1ª mensagem se ainda não
    // existir (idempotente). Remove a necessidade do script manual por org.
    const builderAgent = await ensureBuilderAgent(user.currentOrgId)

    // Only persist when the message is new. The auto-trigger path (skipUserPersist=true)
    // arrives here with a message already saved by createWithInitialMessage.
    if (!skipUserPersist) {
      await persistUserMessage({
        conversationId: conversation.id,
        content,
      })
    }

    // Source-ingestion hook ("cole seu site/IG"). If this turn pasted a link,
    // auto-create the KnowledgeSource rows, seed builderState.sourceIngestion,
    // and enqueue the async quayer:source-enrich job — FIRE-AND-FORGET so the
    // ingestion seed/enqueue NEVER blocks (or breaks) the SSE stream. The actual
    // extract→chunk→embed→synthesize work runs on the worker, never inline here.
    void kickoffSourceIngestion({
      project: {
        id: conversation.project.id,
        aiAgentId: conversation.project.aiAgentId,
        metadata: conversation.project.metadata,
      },
      conversationId: conversation.id,
      organizationId: user.currentOrgId,
      userId: user.id,
      content,
    }).catch((err) => {
      console.warn('[chatRoutes.sendMessage] source-ingestion hook failed:', err)
    })

    // Deterministic step-engine snapshot for the per-turn journey banner.
    // Tolerant: a readiness failure must NEVER break the chat stream — fall
    // back to `undefined`, which makes buildJourneyBanner degrade gracefully.
    let readiness: Readiness | undefined
    try {
      readiness = await getReadiness(conversation.id, user.currentOrgId)
    } catch (err) {
      console.warn('[chatRoutes.sendMessage] getReadiness failed:', err)
      readiness = undefined
    }

    return buildSseResponse({
      agentConfigId: builderAgent.id,
      conversationId: conversation.id,
      organizationId: user.currentOrgId,
      userId: user.id,
      projectId,
      userMessage: content,
      stateSummary: conversation.stateSummary,
      readiness,
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

// getReadiness — deterministic step-engine snapshot for a project
const getReadinessAction = igniter.query({
  name: 'Get Builder Project Readiness',
  description:
    'Resolve the deterministic step-engine Readiness for a Builder project: next step, completeness, typed deploy blockers, and field ownership. Drives the UI progress view (single source of truth with the prompt banner).',
  path: '/projects/:id/readiness' as const,
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

    const conversation = await database.builderProjectConversation.findUnique({
      where: { projectId },
      select: { id: true, organizationId: true },
    })
    if (!conversation) return response.notFound('Conversa não encontrada')
    if (conversation.organizationId !== user.currentOrgId) {
      return response.forbidden('Acesso negado a esta conversa')
    }

    const readiness = await getReadiness(conversation.id, user.currentOrgId)

    return response.json({
      success: true,
      data: readiness,
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
  getReadiness: getReadinessAction,
  compact,
}
