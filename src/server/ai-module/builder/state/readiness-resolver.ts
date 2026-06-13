/**
 * Builder Module — getReadiness resolver (Orayon Uplift, W2 foundation)
 *
 * The ONLY IO boundary of the step-engine. Loads the persisted `builderState`
 * for a conversation, resolves the live deploy signals (active plan, BYOK
 * provider count, WhatsApp instance presence, prompt length, latest version,
 * plus the v2 channel-connection/deployment signals), then branches by
 * `journeyVersion` and defers to the matching PURE engine for the decision.
 *
 * Hot path (runs pre-stream every turn). Kept cheap: one batched include for
 * the conversation/project/agent plus a handful of indexed counts — no N+1.
 *
 * Every business query is filtered by `organizationId`. Sentinels are resolved
 * server-side; nothing here trusts a flag coming from a request body.
 *
 * Journey v2 (jornada-builder-v2): for `journeyVersion: 2` projects the resolver
 * runs `nextPendingStepV2` and populates the additive `journey` payload; the v1
 * fields stay byte-equivalent for v1 projects. A kill-switch env
 * (`BUILDER_V2_FORCE_RENDER_V1`, T87/NFR-08) forces the v1 engine even for v2
 * projects — render-only degrade, ZERO state writes (this layer is read-only).
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (getReadiness — live signals);
 * specs/jornada-builder-v2/plan.md §3.1 (T14 signals + T17 branch + T87 kill-switch).
 */

import { database } from '@/server/services/database'
import { logger } from '@/server/services/logger'
import { parseBuilderState } from '../cards/builder-state'
import { nextPendingStep, MIN_PROMPT_LENGTH } from './next-pending-step'
import { nextPendingStepV2, type StepEngineContextV2 } from './journey-v2'
import type { Readiness } from './readiness.types'

/**
 * Kill-switch (T87 / NFR-08, plan §3.1). When truthy, forces the v1 engine
 * (`nextPendingStep`) even for `journeyVersion: 2` projects — degrades ONLY the
 * render (the v2 sentinels are v1-compatible; v2-only steps simply stay hidden),
 * with ZERO writes to persisted state. Unsetting it restores v2 on the next
 * request. Accepts '1' | 'true' (case-insensitive); default OFF.
 *
 * Documented in `.env.example` + `docs/infra/SECRETS.md`.
 */
const FORCE_RENDER_V1_ENV = 'BUILDER_V2_FORCE_RENDER_V1'

function forceRenderV1Enabled(): boolean {
  const raw = (process.env[FORCE_RENDER_V1_ENV] ?? '').trim().toLowerCase()
  return raw === '1' || raw === 'true'
}

/**
 * Optional live signals the caller can pass in that are not derivable from the
 * org-scoped DB. Currently none — every signal is resolved here. Kept as an
 * extension point for future turn/preview-supplied overrides.
 */
export type GetReadinessOverrides = Record<string, never>

/**
 * Resolve the full `Readiness` for a Builder conversation.
 *
 * @param conversationId  BuilderProjectConversation.id
 * @param organizationId  Caller's active org — EVERY query is scoped to it.
 * @param overrides       Caller-supplied live signals (reserved; none today).
 * @throws when the conversation is not found for this org (caller treats as 404).
 */
export async function getReadiness(
  conversationId: string,
  organizationId: string,
  _overrides: GetReadinessOverrides = {},
): Promise<Readiness> {
  // 1. One batched load: conversation → project → bound agent. Scoped by org.
  const conversation = await database.builderProjectConversation.findFirst({
    where: { id: conversationId, organizationId },
    select: {
      builderState: true,
      project: {
        select: {
          id: true,
          name: true,
          aiAgentId: true,
          aiAgent: {
            select: {
              id: true,
              systemPrompt: true,
            },
          },
        },
      },
    },
  })

  if (!conversation) {
    throw new Error(
      `BuilderProjectConversation ${conversationId} não encontrada para a organização`,
    )
  }

  const agent = conversation.project.aiAgent
  const agentId = conversation.project.aiAgentId
  const projectId = conversation.project.id

  // The project's channel(s) are bound through the agent's ACTIVE
  // `AgentDeployment` (the canonical project↔connection link — `Connection.projectId`
  // FKs the LEGACY `Project` table, so it is never the BuilderProject id; see
  // attach-to-agent.ts / channel.routes.ts:getProjectChannel). The v2 channel-connect
  // steps need status-aware counts, so we count Connections reachable via a
  // deployment of THIS project's agent. PAUSED still means "linked but not
  // serving runtime" and is enough for the connection step; ACTIVE is only
  // required after publication. No agent yet → no connected channel.
  const projectAgentConnection = (channel: 'WHATSAPP' | 'INSTAGRAM') => ({
    organizationId,
    channel,
    status: 'CONNECTED' as const,
    agentDeployments: {
      some: {
        status: { in: ['ACTIVE' as const, 'PAUSED' as const] },
        agentConfig: { id: agentId ?? undefined, organizationId },
      },
    },
  })

  // 2. Live signals — cheap, indexed counts/lookups, all org-scoped. Run in
  //    parallel so the hot path stays a single round-trip-ish latency.
  const [
    org,
    byokProviderCount,
    whatsAppInstanceCount,
    latestVersion,
    liveDeploymentCount,
    connectedWhatsAppCount,
    connectedInstagramCount,
  ] = await Promise.all([
    // Plan: organization.billingType !== 'free' clears the plan blocker.
    database.organization.findFirst({
      where: { id: organizationId },
      select: { billingType: true },
    }),
    // BYOK: active AI providers for this org.
    database.organizationProvider.count({
      where: { organizationId, category: 'AI', isActive: true },
    }),
    // WhatsApp instance PRESENCE (v1 channel blocker): any WHATSAPP Connection
    // for this org — status-agnostic on purpose (NFR-03: the v1 blocker keeps
    // its old, looser signal). The v2 step uses the status-aware count below.
    database.connection.count({
      where: { organizationId, channel: 'WHATSAPP' },
    }),
    // Latest prompt version for the bound agent (null when no agent/version).
    agentId
      ? database.builderPromptVersion.findFirst({
          where: { aiAgentId: agentId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        })
      : Promise.resolve(null),
    // v2 (T14): a `live` BuilderDeployment for this project (terminal step).
    database.builderDeployment.count({
      where: { projectId, status: 'live', project: { organizationId } },
    }),
    // v2 (T14): a status-CONNECTED WhatsApp Connection bound to this project's
    // agent. NOT `whatsAppInstanceCount` — that counts presence and would
    // auto-complete on a freshly generated QR before pairing.
    agentId
      ? database.connection.count({ where: projectAgentConnection('WHATSAPP') })
      : Promise.resolve(0),
    // v2 (T14): same status-aware pattern for Instagram (isDone of the
    // conditional `instagram_connect` step; IG status transition is the gate
    // T82 caveat).
    agentId
      ? database.connection.count({ where: projectAgentConnection('INSTAGRAM') })
      : Promise.resolve(0),
  ])

  const ctx: StepEngineContextV2 = {
    hasActivePlan: !!org && org.billingType !== 'free',
    byokProviderCount,
    hasWhatsAppInstance: whatsAppInstanceCount > 0,
    agentExists: !!agentId,
    promptLength: agent?.systemPrompt?.length ?? 0,
    latestVersionNumber: latestVersion?.versionNumber ?? null,
    hasLiveDeployment: liveDeploymentCount > 0,
    hasConnectedWhatsAppInstance: connectedWhatsAppCount > 0,
    hasConnectedInstagramInstance: connectedInstagramCount > 0,
  }

  // 3. parseBuilderState never throws — null/garbage/partial backfills to DEFAULT.
  const state = parseBuilderState(conversation.builderState)

  // 3b. Seed project.name from the DB BuilderProject.name when the builderState
  //     hasn't captured one yet. The name is derived from the brief at creation
  //     and lives on the project row, NOT in builderState — without this the
  //     step-engine's first step asks "Qual o nome do projeto?" for a project
  //     that already has a name. Accept-source can later overwrite it with the
  //     synthesized businessName (apply-card-submit maps businessName→project.name).
  if (!state.project.name || state.project.name.trim().length === 0) {
    const dbName = conversation.project.name?.trim()
    if (dbName) {
      state.project = { ...state.project, name: dbName }
    }
  }

  // 4. Pure decision — branch by per-project journey version (T17). v2 runs the
  //    phased engine and attaches the additive `journey` payload; v1 (and the
  //    kill-switch render-only degrade, T87) run the legacy engine and emit NO
  //    `journey`. The v1 fields (step/steps/completenessPct/isDeployReady/
  //    blockers/fieldOwnership) are ALWAYS populated either way. Branching is
  //    READ-ONLY: nothing here writes persisted state, so the kill-switch is a
  //    pure render degrade.
  const renderV2 = state.journeyVersion === 2 && !forceRenderV1Enabled()

  if (state.journeyVersion === 2 && !renderV2) {
    logger.info('[journey-v2] kill-switch active — forcing v1 render', {
      env: FORCE_RENDER_V1_ENV,
    })
  } else if (renderV2) {
    logger.info('[journey-v2] resolving v2 journey', {
      activeStepHint: 'phased',
    })
  }

  const readiness = renderV2
    ? nextPendingStepV2(state, ctx)
    : nextPendingStep(state, ctx)

  // Attach the resolved state so the FE active-step card pre-fills with
  // already-confirmed values (the pure engines omit it).
  return {
    ...readiness,
    builderState: state,
    liveSignals: {
      hasConnectedWhatsAppInstance: ctx.hasConnectedWhatsAppInstance,
      hasConnectedInstagramInstance: ctx.hasConnectedInstagramInstance,
      hasLiveDeployment: ctx.hasLiveDeployment,
    },
  }
}

// Re-export so the prompt-length floor used here stays discoverable from the
// resolver module without importing the pure engine directly.
export { MIN_PROMPT_LENGTH }
