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
  applyKnowledgeAck,
  applyMediaAck,
  applyProactive,
} from './handlers/apply/journey-v2'
import { applyRefinementRun } from './handlers/apply/refinement'
import { parseBuilderState } from './builder-state'
import {
  cardSubmitParamsSchema,
  cardSubmitRouteBodySchema,
  cardSubmitAckEnvelopeSchema,
  SILENT_ALLOWED_CARD_KEYS,
  type CardSubmitBody,
  type IntegrationProposalPayload,
  type IntegrationCredentialsPayload,
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
    'Apply a card payload deterministically to the conversation builderState (flips the matching *_confirmed sentinel). In the default `conversational` ackMode it then streams the agent ACK turn via SSE; in `silent` ackMode (allowlisted Capabilities toggles only) it returns plain JSON with no LLM turn. Replaces the legacy approval-by-regex flow.',
  path: '/projects/:id/cards/:cardKey/submit' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  // Wider than the apply-card-submit union: also accepts the knowledge/media acks
  // (T31), which the route dispatches to their own handlers (never the entrypoint).
  body: cardSubmitRouteBodySchema,
  handler: async ({ request, context, response }) => {
    const user = getUser(context)
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }
    const organizationId = user.currentOrgId

    // Validate path params (UUID id + registered cardKey).
    const parsedParams = cardSubmitParamsSchema.safeParse(request.params)
    if (!parsedParams.success) {
      return response.badRequest('Parâmetros de card inválidos')
    }
    const { id: projectId, cardKey } = parsedParams.data

    // Re-parse the body through the schema so defaults are applied and the type
    // resolves to the OUTPUT shape (toolKeys/capabilityKeys non-optional). The
    // route schema is wider (includes knowledge/media acks — T31).
    const parsedBody = cardSubmitRouteBodySchema.safeParse(request.body)
    if (!parsedBody.success) {
      return response.badRequest('Corpo do card inválido')
    }
    const body = parsedBody.data

    // `ackMode` is a top-level field (not part of any card discriminator), parsed
    // independently so the per-card schemas stay untouched (T90). Default applied.
    const ackEnvelope = cardSubmitAckEnvelopeSchema.safeParse(request.body)
    const ackMode = ackEnvelope.success ? ackEnvelope.data.ackMode : 'conversational'

    // Guard: the path cardKey must match the body discriminator (no spoofing
    // a channel payload at the agent_approval URL).
    if (body.cardKey !== cardKey) {
      return response.badRequest('cardKey do corpo não confere com a rota')
    }

    // FR-29 — `silent` is accepted ONLY for the Capabilities-toggle allowlist; any
    // journey card with `silent` is a 400 (the conversational ACK is part of the
    // journey contract and cannot be skipped). Enforced BEFORE any state write.
    const isSilent = ackMode === 'silent'
    if (isSilent && !SILENT_ALLOWED_CARD_KEYS.has(cardKey)) {
      return response.badRequest(
        'ackMode "silent" não é permitido para este card',
      )
    }

    // Deterministic state application (tenant-scoped + server-side re-validation).
    // knowledge/media acks (T31) own their own write in journey-v2.ts and are NOT
    // part of the apply-card-submit union, so route them directly here.
    const applied =
      body.cardKey === 'knowledge'
        ? await applyKnowledgeAck({ projectId, organizationId })
        : body.cardKey === 'media'
          ? await applyMediaAck({ projectId, organizationId })
          : body.cardKey === 'refinement'
            ? await applyRefinementRun({ projectId, organizationId })
          : body.cardKey === 'proactive'
            ? await applyProactive({
                projectId,
                organizationId,
                payload: {
                  followUp: body.followUp,
                  reminders: body.reminders,
                  importantDates: body.importantDates,
                },
              })
          : await applyCardSubmit({
              projectId,
              organizationId,
              // Narrowed: the two non-union acks (knowledge/media) were handled
              // above. What remains is the apply-card-submit `CardSubmitBody` OR
              // the two Integration Builder cards (W2, T24) which `applyCardSubmit`
              // dispatches to their own handler before the union switch.
              body: body as
                | CardSubmitBody
                | IntegrationProposalPayload
                | IntegrationCredentialsPayload,
              // Acting user — stamped as createdById/requestedById by the
              // integration card handlers (no-op for journey/Revisar cards).
              userId: user.id,
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

    // FR-29 silent path: the flip already persisted via the SAME applyCardSubmit
    // path; respond with plain JSON (current builderState) — NO ensureBuilderAgent,
    // NO buildSseResponse, zero LLM turn. The client renders a cheap local system
    // line ("✓ Preços ativados") instead of consuming an SSE stream.
    if (isSilent) {
      const conversation = await database.builderProjectConversation.findUnique({
        where: { id: applied.conversationId },
        select: { builderState: true },
      })
      return response.json({
        success: true,
        data: {
          ok: true,
          builderState: parseBuilderState(conversation?.builderState),
        },
      })
    }

    // Lazy-init the Builder meta-agent (idempotent), same as chat.sendMessage.
    const builderAgent = await ensureBuilderAgent(organizationId)

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
      readiness = await getReadiness(applied.conversationId, organizationId)
    } catch (err) {
      console.warn('[cardSubmit] getReadiness failed:', err)
      readiness = undefined
    }

    // Stream the ACK turn over the SAME SSE pipeline as chat. The cardInstruction
    // seeds the turn; Stage 3 wires the consumer to inject it as a system note.
    const sseParams: SseParamsWithCardInstruction = {
      agentConfigId: builderAgent.id,
      conversationId: applied.conversationId,
      organizationId,
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
