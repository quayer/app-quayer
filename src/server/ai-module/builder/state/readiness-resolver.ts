/**
 * Builder Module — getReadiness resolver (Orayon Uplift, W2 foundation)
 *
 * The ONLY IO boundary of the step-engine. Loads the persisted `builderState`
 * for a conversation, resolves the live deploy signals (active plan, BYOK
 * provider count, WhatsApp instance presence, prompt length, latest version),
 * then defers to the PURE `nextPendingStep` for the actual decision.
 *
 * Hot path (runs pre-stream every turn). Kept cheap: one batched include for
 * the conversation/project/agent plus a handful of indexed counts — no N+1.
 *
 * Every business query is filtered by `organizationId`. Sentinels are resolved
 * server-side; nothing here trusts a flag coming from a request body.
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (getReadiness — live signals).
 */

import { database } from '@/server/services/database'
import { parseBuilderState } from '../cards/builder-state'
import { nextPendingStep, MIN_PROMPT_LENGTH } from './next-pending-step'
import type { Readiness, StepEngineContext } from './readiness.types'

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

  // 2. Live signals — cheap, indexed counts/lookups, all org-scoped. Run in
  //    parallel so the hot path stays a single round-trip-ish latency.
  const [org, byokProviderCount, whatsAppInstanceCount, latestVersion] =
    await Promise.all([
      // Plan: organization.billingType !== 'free' clears the plan blocker.
      database.organization.findFirst({
        where: { id: organizationId },
        select: { billingType: true },
      }),
      // BYOK: active AI providers for this org.
      database.organizationProvider.count({
        where: { organizationId, category: 'AI', isActive: true },
      }),
      // WhatsApp instance presence: any WHATSAPP Connection for this org.
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
    ])

  const ctx: StepEngineContext = {
    hasActivePlan: !!org && org.billingType !== 'free',
    byokProviderCount,
    hasWhatsAppInstance: whatsAppInstanceCount > 0,
    agentExists: !!agentId,
    promptLength: agent?.systemPrompt?.length ?? 0,
    latestVersionNumber: latestVersion?.versionNumber ?? null,
  }

  // 3. parseBuilderState never throws — null/garbage/partial backfills to DEFAULT.
  const state = parseBuilderState(conversation.builderState)

  // 4. Pure decision + attach the resolved state so the FE active-step card
  //    pre-fills with already-confirmed values (the pure engine omits it).
  return { ...nextPendingStep(state, ctx), builderState: state }
}

// Re-export so the prompt-length floor used here stays discoverable from the
// resolver module without importing the pure engine directly.
export { MIN_PROMPT_LENGTH }
