/**
 * Builder Chat — Stream Agent Response
 *
 * Thin wrapper around `processAgentMessageStream` that:
 *   1. Builds the short conversation-history window from BuilderProjectMessage.
 *   2. Runs the context-budget compaction (delegated to `compactIfNeeded`).
 *   3. Constructs the state-summary banner + augmented message content.
 *   4. Streams AgentStreamEvents back to the caller.
 *   5. Accumulates text deltas and persists the assistant message on 'finish'.
 *   6. Fires `updateStateSummary` fire-and-forget on 'finish'.
 *
 * Extracted from the 250-line sendChatMessage controller as part of the
 * chat refactor. Behavior mirrors the original loop exactly — this is a
 * refactor, not a rewrite.
 */

import { database } from '@/server/services/database'
import {
  processAgentMessageStream,
  type AgentStreamEvent,
} from '@/server/ai-module/ai-agents/agent-runtime.service'
import { updateStateSummary } from '../../services/context-summary.service'
import { compactIfNeeded } from './compact-if-needed'
import { persistAssistantMessage, persistErrorMessage } from './persist-message'
import { logToolCallComplete } from './log-tool-call'
import { credentialResolver } from '@/lib/providers/credential-resolver.service'
import type { Prisma } from '@prisma/client'

/**
 * Hard ceiling for total LLM spend within a single Builder creation
 * conversation (mirrors Orayon's MAX_SESSION_COST_USD). Without this, a
 * looping/expensive creation chat could burn money unbounded — the previous
 * only guard was context-size, not cost.
 */
const MAX_SESSION_COST_USD = 5.0

/**
 * Sums the per-turn LLM cost already spent on this conversation by reading the
 * `metadata.cost.totalCost` stamped on each assistant message. Best-effort.
 */
async function getSessionCostUsd(conversationId: string): Promise<number> {
  try {
    const rows = await database.builderProjectMessage.findMany({
      where: { conversationId, role: 'assistant' },
      select: { metadata: true },
    })
    let total = 0
    for (const row of rows) {
      const meta = row.metadata as { cost?: { totalCost?: number } } | null
      const c = meta?.cost?.totalCost
      if (typeof c === 'number' && Number.isFinite(c)) total += c
    }
    return total
  } catch (err) {
    console.warn('[streamAgentResponse] session cost check failed:', err)
    return 0
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StreamAgentResponseParams {
  agentConfigId: string
  conversationId: string
  organizationId: string
  userId: string
  /** BuilderProject ID — enables project-level credential override */
  projectId?: string
  /** The fresh user message content (already persisted). */
  userMessage: string
  /** Optional pre-existing project state summary to include as banner. */
  stateSummary?: string | null
  /** How many recent history rows to pull as conversation context. */
  historyLimit?: number
}

type FinishEvent = Extract<AgentStreamEvent, { type: 'finish' }>

/**
 * Sentinel event emitted when compaction is exhausted. The caller
 * (chat.routes.ts) should convert this into an HTTP 400 instead of an
 * SSE error frame. Not part of `AgentStreamEvent` so it cannot leak
 * onto the wire by accident.
 */
export interface BudgetExhaustedSignal {
  type: '__budget_exhausted__'
  message: string
}

export type StreamYield = AgentStreamEvent | BudgetExhaustedSignal

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildAugmentedMessageContent(params: {
  conversationId: string
  userMessage: string
  stateSummary?: string | null
  historyLimit: number
}): Promise<
  | { ok: true; augmented: string }
  | { ok: false; reason: 'exhausted' }
> {
  const history = await database.builderProjectMessage.findMany({
    where: { conversationId: params.conversationId },
    orderBy: { createdAt: 'desc' },
    take: params.historyLimit,
    select: { role: true, content: true, createdAt: true },
  })
  const orderedHistory = history.reverse()

  const baseHistory = orderedHistory.map((m) => ({
    role: m.role as string,
    content: m.content,
  }))

  const outcome = await compactIfNeeded(params.conversationId, baseHistory)
  if (outcome.exhausted) {
    return { ok: false, reason: 'exhausted' }
  }

  const historyBlock = outcome.messages
    .map((m) => `[${m.role}] ${m.content}`)
    .join('\n')

  const stateBanner = params.stateSummary
    ? `# Current Project State\n${params.stateSummary}\n\n`
    : ''

  const augmented = `${stateBanner}# Conversation so far\n${historyBlock}\n\n# New user message\n${params.userMessage}`

  return { ok: true, augmented }
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export async function* streamAgentResponse(
  params: StreamAgentResponseParams,
): AsyncGenerator<StreamYield, void, unknown> {
  const historyLimit = params.historyLimit ?? 10

  const built = await buildAugmentedMessageContent({
    conversationId: params.conversationId,
    userMessage: params.userMessage,
    stateSummary: params.stateSummary,
    historyLimit,
  })

  if (!built.ok) {
    yield {
      type: '__budget_exhausted__',
      message:
        'Conversa ficou muito longa. Crie um novo projeto para continuar.',
    }
    return
  }

  // Cost ceiling guard — refuse before spending more if the session already
  // crossed the budget (pre-flight, so we never start an over-budget turn).
  const spentUsd = await getSessionCostUsd(params.conversationId)
  if (spentUsd >= MAX_SESSION_COST_USD) {
    yield {
      type: '__budget_exhausted__',
      message: `Limite de custo desta sessão de criação atingido (US$ ${spentUsd.toFixed(
        2,
      )}). Crie um novo projeto para continuar.`,
    }
    return
  }

  // Resolve the agent's AI provider so we can honour the org's BYOK key
  // configured in OrganizationProvider (the integrations page).
  // We need the agentConfig's provider field — load it here with a minimal
  // select so we avoid a second full fetch when the runtime repeats the load.
  // findFirst com filtro de org (não findUnique por id): impede enumerar o
  // provider de agente de outra org. O runtime (prepareAgentCall) revalida a org.
  const agentConfigForProvider = await database.aIAgentConfig.findFirst({
    where: { id: params.agentConfigId, organizationId: params.organizationId },
    select: { provider: true },
  })
  const agentProvider = agentConfigForProvider?.provider ?? 'anthropic'

  const resolvedCredentials = await credentialResolver.resolve(
    'AI',
    agentProvider,
    { organizationId: params.organizationId, projectId: params.projectId },
  )
  const orgApiKey = resolvedCredentials?.credentials?.apiKey as string | undefined

  // Synthetic IDs (Option A) — the Builder chat is NOT a WhatsApp
  // conversation. The runtime tolerates this: buildConversationContext
  // returns [] for unknown sessionIds, and tools get these IDs purely
  // as execution context (they can be treated as opaque strings).
  const streamParams = {
    agentConfigId: params.agentConfigId,
    sessionId: params.conversationId,
    contactId: params.userId,
    connectionId: 'builder-internal',
    organizationId: params.organizationId,
    messageContent: built.augmented,
    apiKey: orgApiKey,
  }

  let accumulatedText = ''
  let finishEvent: FinishEvent | null = null

  try {
    for await (const event of processAgentMessageStream(streamParams)) {
      if (event.type === 'text-delta') {
        accumulatedText += event.text
      }
      if (event.type === 'finish') {
        finishEvent = event
      }

      yield event

      if (event.type === 'finish') {
        const persisted = await persistAssistantMessage({
          conversationId: params.conversationId,
          content: accumulatedText,
          toolCalls: event.toolCalls as unknown as Prisma.InputJsonValue,
          metadata: {
            usage: event.usage,
            cost: event.cost,
            model: event.model,
            provider: event.provider,
            latencyMs: event.latencyMs,
          } as unknown as Prisma.InputJsonValue,
        })

        // Observability: write one BuilderToolCall row per tool the meta-agent
        // invoked, linked to the persisted assistant message. The writer existed
        // but was never wired — this turns the dead table on. Fire-and-forget.
        if (persisted.id && Array.isArray(event.toolCalls)) {
          for (const tc of event.toolCalls as Array<{
            toolName?: string
            args?: unknown
            result?: unknown
          }>) {
            if (!tc?.toolName) continue
            void logToolCallComplete({
              messageId: persisted.id,
              toolName: tc.toolName,
              input: (tc.args ?? {}) as Prisma.InputJsonValue,
              output: (tc.result ?? {}) as Prisma.InputJsonValue,
            })
          }
        }

        // Fire-and-forget state summary refresh.
        void updateStateSummary(params.conversationId, database).catch(
          (err: unknown) => {
            console.error(
              '[streamAgentResponse] updateStateSummary failed:',
              err,
            )
          },
        )
        break
      }

      if (event.type === 'error') {
        await persistErrorMessage({
          conversationId: params.conversationId,
          content: `Error from Builder AI: ${event.message}`,
        })
        break
      }
    }
  } catch (loopErr: unknown) {
    const message =
      loopErr instanceof Error ? loopErr.message : 'Unknown stream error'
    console.error('[streamAgentResponse] Stream loop error:', loopErr)

    yield { type: 'error', message }

    await persistErrorMessage({
      conversationId: params.conversationId,
      content: `Stream error: ${message}`,
    })
  } finally {
    // Reference to keep `finishEvent` from being tree-shaken as unused;
    // also useful as a breakpoint hook for observability.
    void finishEvent
  }
}
