/**
 * Builder Module — Card-submit route (Orayon Uplift, W2 — Stage 2)
 *
 * `POST /builder/projects/:id/cards/:cardKey/submit`
 *
 * The card-action protocol: instead of the FE posting a synthetic user message
 * that the LLM re-parses by regex, the card POSTs a typed payload here. We:
 *   1. Authenticate + scope by tenant (mirrors chat.routes.ts guards).
 *   2. Validate path params + body (discriminated on cardKey).
 *   3. Apply deterministic state + flip the sentinel (applyCardSubmit).
 *   4. Stream the ACK turn over the SAME SSE wire as chat (buildSseResponse),
 *      seeding it with the `cardInstruction` system note.
 *
 * Composed into builder.controller.ts by Stage 3 (this file does NOT touch it).
 * The SSE consumer side (`cardInstruction` in StreamAgentResponseParams) is also
 * wired by Stage 3 — here it is passed as an optional, forward-compatible field.
 */

import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { database } from '@/server/services/database'

import { ensureBuilderAgent } from '../services/ensure-builder-agent'
import { buildSseResponse } from '../chat/sse-stream'
import type { StreamAgentResponseParams } from '../chat/handlers/stream-agent-response'
import { getReadiness } from '../state/readiness-resolver'
import type { Readiness } from '../state/readiness.types'

import { applyCardSubmit } from './handlers/apply-card-submit'
import {
  cardSubmitParamsSchema,
  cardSubmitBodySchema,
} from './card-submit.schemas'

// ---------------------------------------------------------------------------
// Local utilities (mirror chat.routes.ts)
// ---------------------------------------------------------------------------

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

/**
 * Forward-compatible view of the SSE params: Stage 3 adds `cardInstruction` to
 * `StreamAgentResponseParams`. Until then we augment the type locally so this
 * route stays type-safe WITHOUT editing stream-agent-response.ts / sse-stream.ts.
 * The runtime simply carries the extra field; the consumer ignores it until wired.
 */
type SseParamsWithCardInstruction = StreamAgentResponseParams & {
  cardInstruction?: string
}

// ---------------------------------------------------------------------------
// submitCard — applies card state, then streams the ACK turn over SSE
// ---------------------------------------------------------------------------

const submitCard = igniter.mutation({
  name: 'Submit Builder Card',
  description:
    'Apply a card payload deterministically to the conversation builderState (flips the matching *_confirmed sentinel) and stream the agent ACK turn via SSE. Replaces the legacy approval-by-regex flow.',
  path: '/projects/:id/cards/:cardKey/submit' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: cardSubmitBodySchema,
  handler: async ({ request, context, response }) => {
    const user = getUser(context)
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }

    // Validate path params (UUID id + registered cardKey).
    const parsedParams = cardSubmitParamsSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return response.badRequest('Parâmetros de card inválidos')
    }
    const { id: projectId, cardKey } = parsedParams.data

    // Re-parse the body through the schema so defaults are applied and the type
    // resolves to the OUTPUT shape (toolKeys/capabilityKeys non-optional).
    const parsedBody = cardSubmitBodySchema.safeParse(request.body)
    if (!parsedBody.success) {
      return response.badRequest('Corpo do card inválido')
    }
    const body = parsedBody.data

    // Guard: the path cardKey must match the body discriminator (no spoofing
    // a channel payload at the agent_approval URL).
    if (body.cardKey !== cardKey) {
      return response.badRequest('cardKey do corpo não confere com a rota')
    }

    // Deterministic state application (tenant-scoped + server-side re-validation).
    const applied = await applyCardSubmit({
      projectId,
      organizationId: user.currentOrgId,
      body,
    })

    if (!applied.ok) {
      switch (applied.reason) {
        case 'not_found':
          return response.notFound(applied.message)
        case 'forbidden':
          return response.forbidden(applied.message)
        default:
          return response.badRequest(applied.message)
      }
    }

    // Lazy-init the Builder meta-agent (idempotent), same as chat.sendMessage.
    const builderAgent = await ensureBuilderAgent(user.currentOrgId)

    // Re-read minimal conversation fields for the ACK turn (stateSummary banner).
    const conversation = await database.builderProjectConversation.findUnique({
      where: { id: applied.conversationId },
      select: { stateSummary: true },
    })

    // Deterministic step-engine snapshot for the per-turn journey banner. Resolved
    // FRESH here — the *_confirmed sentinel was already persisted by applyCardSubmit,
    // so this reflects the post-write state and yields a '# PRÓXIMO PASSO'.
    // Tolerant: a readiness failure must NEVER break the ACK stream — fall back to
    // `undefined`, which makes buildJourneyBanner degrade gracefully.
    let readiness: Readiness | undefined
    try {
      readiness = await getReadiness(applied.conversationId, user.currentOrgId)
    } catch (err) {
      console.warn('[cardSubmit] getReadiness failed:', err)
      readiness = undefined
    }

    // Stream the ACK turn over the SAME SSE pipeline as chat. The cardInstruction
    // seeds the turn; Stage 3 wires the consumer to inject it as a system note.
    const sseParams: SseParamsWithCardInstruction = {
      agentConfigId: builderAgent.id,
      conversationId: applied.conversationId,
      organizationId: user.currentOrgId,
      userId: user.id,
      projectId,
      userMessage: applied.cardInstruction,
      cardInstruction: applied.cardInstruction,
      stateSummary: conversation?.stateSummary ?? null,
      readiness,
    }

    return buildSseResponse(sseParams)
  },
})

// ---------------------------------------------------------------------------
// Export composition (spread into builder.controller by Stage 3)
// ---------------------------------------------------------------------------

export const cardSubmitRoutes = {
  submitCard,
}
