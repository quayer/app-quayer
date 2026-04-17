/**
 * Agent Runtime Service
 *
 * Core service that executes AI agent responses using Vercel AI SDK.
 * Handles: context building, LLM calling, tool execution loop, cost tracking.
 *
 * Dependencies (to be installed):
 *   npm install ai @ai-sdk/openai @ai-sdk/anthropic
 */

import { generateText, streamText, stepCountIs, type ToolSet } from 'ai'
import { database } from '@/server/services/database'
import { getModel } from './services/provider-factory'
import { getRedis } from '@/server/services/redis'
import { getEnabledBuiltinTools, type ToolExecutionContext } from './tools/builtin-tools'
import { getCustomTools } from './tools/custom-tools'
import { BUILDER_RESERVED_NAME } from '@/server/ai-module/builder/builder.constants'
import { buildBuilderToolset } from '@/server/ai-module/builder/tools'
import { normalizeForAI } from '@/server/communication/services/message-normalizer.service'

// ── Types ────────────────────────────────────────────────────────────────────

export interface AgentRuntimeResponse {
  text: string
  toolCalls: Array<{
    toolName: string
    args: Record<string, unknown>
    result: unknown
  }>
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  cost: {
    inputCost: number
    outputCost: number
    totalCost: number
  }
  latencyMs: number
  model: string
  provider: string
  promptVersionId?: string
}

export interface ProcessAgentMessageParams {
  agentConfigId: string
  sessionId: string
  contactId: string
  connectionId: string
  organizationId: string
  messageContent: string
  /** Bring-your-own-key: override the default provider API key */
  apiKey?: string
}

// ── Cost Table ───────────────────────────────────────────────────────────────
// Approximate cost per 1M tokens (March 2026 pricing)

const COST_TABLE: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-haiku-3-5-20241022': { input: 0.8, output: 4.0 },
  'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
}

const FALLBACK_RATES = { input: 5.0, output: 15.0 }

// ── US-036: Context Budget Error ────────────────────────────────────────────

export class ContextBudgetExhaustedError extends Error {
  constructor(totalTokens: number, maxTokens: number) {
    super(
      `Context budget exhausted: estimated ${totalTokens} tokens exceeds max ${maxTokens}`
    )
    this.name = 'ContextBudgetExhaustedError'
  }
}

// ── US-036: Token Estimation ────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ── US-043: Provider Cooldown Map ───────────────────────────────────────────

const PROVIDER_COOLDOWNS = new Map<string, number>()
const COOLDOWN_DURATION_MS = 5 * 60 * 1000 // 5 minutes

function calculateCost(model: string, inputTokens: number, outputTokens: number) {
  const rates = COST_TABLE[model] || FALLBACK_RATES
  const inputCost = (inputTokens / 1_000_000) * rates.input
  const outputCost = (outputTokens / 1_000_000) * rates.output
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  }
}

// ── Provider Factory ─────────────────────────────────────────────────────────
// Imported from ./services/provider-factory.ts (shared with Builder tools)

// ── Context Builders ─────────────────────────────────────────────────────────

/**
 * Fetch the most recent messages from the session to build conversation history.
 * Maps message direction to the appropriate AI SDK role.
 */
async function buildConversationContext(sessionId: string, memoryWindow: number) {
  const messages = await database.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'asc' },
    take: memoryWindow,
    select: {
      content: true,
      direction: true,
      author: true,
      type: true,
      createdAt: true,
      transcription: true,
      locationName: true,
      latitude: true,
      longitude: true,
      geoAddress: true,
      geoNeighborhood: true,
      geoCity: true,
      geoState: true,
      geoPostalCode: true,
      fileName: true,
      mediaType: true,
    },
  })

  return messages.map((msg) => ({
    role: (msg.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: normalizeForAI(msg),
  }))
}

/**
 * Resolve which prompt version to use for the agent.
 *
 * Priority:
 *   1. A/B test — when two or more prompt versions have status TESTING,
 *      the session ID hash deterministically picks a variant.
 *   2. ACTIVE version — the latest active prompt version.
 *   3. Fallback — returns null so the caller uses the agent's own systemPrompt.
 */
async function getActivePrompt(agentConfigId: string, sessionId?: string) {
  // Check for A/B test (TESTING versions)
  const testingVersions = await database.agentPromptVersion.findMany({
    where: {
      agentConfigId,
      status: 'TESTING',
    },
    orderBy: { version: 'asc' },
  })

  if (testingVersions.length >= 2 && sessionId) {
    // Deterministic variant assignment based on session ID character code sum
    const hash = sessionId
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0)
    const variant = hash % testingVersions.length
    return testingVersions[variant]
  }

  // Default: get the latest ACTIVE version
  const activeVersion = await database.agentPromptVersion.findFirst({
    where: {
      agentConfigId,
      status: 'ACTIVE',
    },
    orderBy: { version: 'desc' },
  })

  return activeVersion ?? null
}

// ── Shared Setup ─────────────────────────────────────────────────────────────

type PreparedAgentCall = {
  agentConfig: Awaited<ReturnType<typeof database.aIAgentConfig.findUnique>>
  promptVersion: Awaited<ReturnType<typeof getActivePrompt>>
  conversationHistory: Awaited<ReturnType<typeof buildConversationContext>>
  tools: ToolSet
  model: ReturnType<typeof getModel>
  systemPrompt: string
  startTime: number
}

/**
 * Shared setup for both `processAgentMessage` and `processAgentMessageStream`.
 * Loads agent config, resolves active prompt, builds conversation history,
 * wires built-in tools, and instantiates the Vercel AI SDK model.
 */
async function prepareAgentCall(
  params: ProcessAgentMessageParams
): Promise<PreparedAgentCall> {
  const startTime = Date.now()

  // 1. Load agent config
  const agentConfig = await database.aIAgentConfig.findUnique({
    where: { id: params.agentConfigId },
  })

  if (!agentConfig || !agentConfig.isActive) {
    throw new Error(
      `Agent config ${params.agentConfigId} not found or inactive`
    )
  }

  // 2. Get active prompt (supports A/B testing)
  const promptVersion = await getActivePrompt(agentConfig.id, params.sessionId)
  let systemPrompt =
    promptVersion?.systemPrompt || agentConfig.systemPrompt || ''

  // 3. Build conversation context from recent session messages
  const conversationHistory = await buildConversationContext(
    params.sessionId,
    agentConfig.memoryWindow
  )

  // 4. Get enabled tools with execution context
  const toolContext: ToolExecutionContext = {
    sessionId: params.sessionId,
    contactId: params.contactId,
    connectionId: params.connectionId,
    organizationId: params.organizationId,
    agentConfigId: agentConfig.id,
  }
  const tools: ToolSet = {
    ...getEnabledBuiltinTools(agentConfig.enabledTools, toolContext),
    ...(await getCustomTools(agentConfig.enabledTools, toolContext)),
  }

  // 4b. Builder meta-agent hook: when the active agent is the reserved Builder,
  // merge in the 7 Builder tool factories so the meta-agent can actually act
  // on the platform (create agents, attach tools, launch instances, etc.).
  if (agentConfig.name === BUILDER_RESERVED_NAME) {
    const conv = await database.builderProjectConversation.findUnique({
      where: { id: params.sessionId },
      select: { projectId: true },
    })
    if (!conv) {
      throw new Error(
        `Builder conversation ${params.sessionId} not found — cannot resolve projectId for Builder toolset`
      )
    }
    Object.assign(
      tools,
      buildBuilderToolset({
        projectId: conv.projectId,
        organizationId: params.organizationId,
        userId: params.contactId,
      })
    )
  }

  // 5. Get LLM model instance
  const model = getModel(agentConfig.provider, agentConfig.model, params.apiKey)

  // ── US-036: Token budget tracker ──────────────────────────────────────
  const systemTokens = estimateTokens(systemPrompt)
  const messagesTokens = conversationHistory.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    0
  )
  const toolDefinitionsEstimate = 300
  const totalEstimatedTokens = systemTokens + messagesTokens + toolDefinitionsEstimate
  const maxTokens = agentConfig.maxTokens || 4096

  if (totalEstimatedTokens > maxTokens) {
    throw new ContextBudgetExhaustedError(totalEstimatedTokens, maxTokens)
  }

  if (totalEstimatedTokens > maxTokens * 0.80) {
    systemPrompt += '\n\n[SISTEMA: Contexto próximo do limite. Seja conciso nas próximas respostas.]'
  }

  // ── US-036: Context window guard ──────────────────────────────────────
  if (estimateTokens(systemPrompt) < 500) {
    console.warn(
      '[AgentRuntime] System prompt suspiciously short (<500 estimated tokens). Using fallback.'
    )
    systemPrompt =
      'Desculpe, estou com dificuldades no momento. Um atendente vai te ajudar em breve.'
  }

  return {
    agentConfig,
    promptVersion,
    conversationHistory,
    tools,
    model,
    systemPrompt,
    startTime,
  }
}

/**
 * Fire-and-forget metrics update shared by both sync and streaming runtimes.
 * Logs errors but never throws — metrics updates are non-critical.
 */
function updateRuntimeMetrics(
  agentConfig: NonNullable<PreparedAgentCall['agentConfig']>,
  promptVersion: PreparedAgentCall['promptVersion'],
  inputTokens: number,
  outputTokens: number,
  cost: { totalCost: number },
  latencyMs: number,
  toolCalls: Array<{ toolName: string }>
) {
  const updateAgentMetrics = database.aIAgentConfig.update({
    where: { id: agentConfig.id },
    data: {
      totalInputTokens: { increment: inputTokens },
      totalOutputTokens: { increment: outputTokens },
      totalCost: { increment: cost.totalCost },
      totalCalls: { increment: 1 },
    },
  })

  const updatePromptMetrics = promptVersion
    ? database.agentPromptVersion.update({
        where: { id: promptVersion.id },
        data: {
          totalMessages: { increment: 1 },
          totalCost: { increment: cost.totalCost },
          avgResponseTime: {
            set:
              promptVersion.totalMessages > 0
                ? (promptVersion.avgResponseTime *
                    promptVersion.totalMessages +
                    latencyMs) /
                  (promptVersion.totalMessages + 1)
                : latencyMs,
          },
          totalTransfers: {
            increment: toolCalls.some(
              (tc) => tc.toolName === 'transfer_to_human'
            )
              ? 1
              : 0,
          },
        },
      })
    : Promise.resolve()

  Promise.all([updateAgentMetrics, updatePromptMetrics]).catch((err) => {
    console.error('[AgentRuntime] Failed to update metrics:', err.message)
  })
}

// ── Main Runtime ─────────────────────────────────────────────────────────────

/**
 * Process an incoming message through the AI agent and return the response.
 *
 * Flow:
 *   1. Load agent config from DB
 *   2. Resolve active prompt version (supports A/B testing)
 *   3. Build conversation history from session messages
 *   4. Resolve enabled built-in tools
 *   5. Call LLM via Vercel AI SDK (with tool loop, maxSteps=5)
 *   6. Track cost and update agent + prompt version metrics
 *   7. Return structured response
 */
export async function processAgentMessage(
  params: ProcessAgentMessageParams
): Promise<AgentRuntimeResponse> {
  const {
    agentConfig,
    promptVersion,
    conversationHistory,
    tools,
    model,
    systemPrompt,
    startTime,
  } = await prepareAgentCall(params)

  // agentConfig is guaranteed non-null here (prepareAgentCall throws otherwise)
  if (!agentConfig) {
    throw new Error('Agent config missing after prepareAgentCall')
  }

  // US-043: Check if primary provider is in cooldown
  const fallbackModel = (agentConfig as Record<string, unknown>).fallbackModel as string | undefined
  const providerKey = `${agentConfig.provider}:${agentConfig.model}`
  const cooldownUntil = PROVIDER_COOLDOWNS.get(providerKey) ?? 0
  const isInCooldown = Date.now() < cooldownUntil

  // Choose which model to use (skip primary if in cooldown and fallback exists)
  let activeModel = model
  let activeModelName = agentConfig.model
  let usedFallback = false

  if (isInCooldown && fallbackModel) {
    console.log(`[AgentRuntime] Primary model ${agentConfig.model} in cooldown, using fallback ${fallbackModel}`)
    activeModel = getModel(agentConfig.provider, fallbackModel, params.apiKey)
    activeModelName = fallbackModel
    usedFallback = true
  }

  // 6. Call LLM with automatic tool-calling loop + US-043 fallback
  const callGenerateText = async (llmModel: ReturnType<typeof getModel>) => {
    return generateText({
      model: llmModel,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: params.messageContent },
      ],
      tools,
      stopWhen: stepCountIs(5),
      temperature: agentConfig.temperature,
      maxOutputTokens: agentConfig.maxTokens,
    })
  }

  try {
    let result: Awaited<ReturnType<typeof generateText>>

    try {
      result = await callGenerateText(activeModel)
    } catch (primaryError: unknown) {
      // US-043: On retriable error, try fallback model
      if (!usedFallback && fallbackModel && isRetriableError(primaryError)) {
        console.log(
          `[AgentRuntime] Primary model failed, falling back to ${fallbackModel}`
        )
        PROVIDER_COOLDOWNS.set(providerKey, Date.now() + COOLDOWN_DURATION_MS)
        const fallback = getModel(agentConfig.provider, fallbackModel, params.apiKey)
        activeModelName = fallbackModel
        usedFallback = true
        result = await callGenerateText(fallback)
      } else {
        throw primaryError
      }
    }

    const latencyMs = Date.now() - startTime
    const inputTokens = result.usage?.inputTokens ?? 0
    const outputTokens = result.usage?.outputTokens ?? 0
    const cost = calculateCost(activeModelName, inputTokens, outputTokens)

    // 7. Extract tool calls from multi-step execution
    const toolCalls =
      result.steps
        ?.filter((step) => step.toolCalls && step.toolCalls.length > 0)
        .flatMap((step) =>
          step.toolCalls.map((tc) => ({
            toolName: tc.toolName,
            args: tc.input as Record<string, unknown>,
            result: step.toolResults?.find(
              (tr) => tr.toolCallId === tc.toolCallId
            )?.output,
          }))
        ) ?? []

    // 8. Update metrics (fire-and-forget, non-blocking)
    updateRuntimeMetrics(
      agentConfig,
      promptVersion,
      inputTokens,
      outputTokens,
      cost,
      latencyMs,
      toolCalls
    )

    return {
      text: result.text || '',
      toolCalls,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      cost,
      latencyMs,
      model: activeModelName,
      provider: agentConfig.provider,
      promptVersionId: promptVersion?.id,
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown LLM error'
    console.error(
      `[AgentRuntime] LLM call failed for agent "${agentConfig.name}":`,
      message
    )
    throw error
  }
}

// ── Streaming Runtime ────────────────────────────────────────────────────────

/**
 * Event yielded by `processAgentMessageStream` — a trimmed, stable shape
 * derived from `TextStreamPart` in the Vercel AI SDK. Only the subset
 * relevant to the Quayer Builder chat is exposed.
 */
export type AgentStreamEvent =
  | { type: 'text-delta'; text: string }
  | {
      type: 'tool-call'
      toolName: string
      args: Record<string, unknown>
    }
  | {
      type: 'tool-result'
      toolName: string
      result: unknown
    }
  | {
      type: 'finish'
      usage: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
      }
      cost: {
        inputCost: number
        outputCost: number
        totalCost: number
      }
      latencyMs: number
      model: string
      provider: string
      toolCalls: Array<{
        toolName: string
        args: Record<string, unknown>
        result: unknown
      }>
    }
  | { type: 'error'; message: string }

/**
 * Streaming variant of `processAgentMessage` used by the Quayer Builder chat.
 *
 * Yields text deltas, tool calls, tool results, a final `finish` event with
 * aggregated usage/cost/toolCalls, and any `error` that surfaces from the
 * underlying `streamText()` call.
 *
 * Shares setup (agent config load, prompt resolution, history build, tool
 * wiring, model instantiation) with `processAgentMessage` via
 * `prepareAgentCall`. Metrics are updated fire-and-forget right before the
 * `finish` event is yielded, matching the non-streaming path.
 */
export async function* processAgentMessageStream(
  params: ProcessAgentMessageParams
): AsyncGenerator<AgentStreamEvent, void, unknown> {
  let prepared: PreparedAgentCall
  try {
    prepared = await prepareAgentCall(params)
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown agent setup error'
    yield { type: 'error', message }
    return
  }

  const {
    agentConfig,
    promptVersion,
    conversationHistory,
    tools,
    model,
    systemPrompt,
    startTime,
  } = prepared

  if (!agentConfig) {
    yield { type: 'error', message: 'Agent config missing after prepareAgentCall' }
    return
  }

  // US-043: Check cooldown for streaming path
  const streamFallbackModel = (agentConfig as Record<string, unknown>).fallbackModel as string | undefined
  const streamProviderKey = `${agentConfig.provider}:${agentConfig.model}`
  const streamCooldownUntil = PROVIDER_COOLDOWNS.get(streamProviderKey) ?? 0
  const streamIsInCooldown = Date.now() < streamCooldownUntil

  let streamActiveModel = model
  let streamActiveModelName = agentConfig.model

  if (streamIsInCooldown && streamFallbackModel) {
    console.log(`[AgentRuntime] Primary model ${agentConfig.model} in cooldown (stream), using fallback ${streamFallbackModel}`)
    streamActiveModel = getModel(agentConfig.provider, streamFallbackModel, params.apiKey)
    streamActiveModelName = streamFallbackModel
  }

  // Aggregators collected from the stream to build the final `finish` event.
  const toolCallArgsById = new Map<string, Record<string, unknown>>()
  const toolCallNameById = new Map<string, string>()
  const aggregatedToolCalls: Array<{
    toolName: string
    args: Record<string, unknown>
    result: unknown
  }> = []
  let inputTokens = 0
  let outputTokens = 0

  try {
    let result: ReturnType<typeof streamText>

    const callStreamText = (llmModel: ReturnType<typeof getModel>) =>
      streamText({
        model: llmModel,
        system: systemPrompt,
        messages: [
          ...conversationHistory,
          { role: 'user', content: params.messageContent },
        ],
        tools,
        stopWhen: stepCountIs(5),
        temperature: agentConfig.temperature,
        maxOutputTokens: agentConfig.maxTokens,
      })

    try {
      result = callStreamText(streamActiveModel)
      // Eagerly test the stream by awaiting a property — if the model is down,
      // this may throw before we iterate. We rely on the for-await below to
      // surface errors for models that fail mid-stream.
    } catch (primaryError: unknown) {
      if (!streamIsInCooldown && streamFallbackModel && isRetriableError(primaryError)) {
        console.log(
          `[AgentRuntime] Primary model failed (stream), falling back to ${streamFallbackModel}`
        )
        PROVIDER_COOLDOWNS.set(streamProviderKey, Date.now() + COOLDOWN_DURATION_MS)
        streamActiveModel = getModel(agentConfig.provider, streamFallbackModel, params.apiKey)
        streamActiveModelName = streamFallbackModel
        result = callStreamText(streamActiveModel)
      } else {
        throw primaryError
      }
    }

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          if (part.text) {
            yield { type: 'text-delta', text: part.text }
          }
          break
        }
        case 'tool-call': {
          const args = (part.input ?? {}) as Record<string, unknown>
          toolCallArgsById.set(part.toolCallId, args)
          toolCallNameById.set(part.toolCallId, part.toolName)
          yield { type: 'tool-call', toolName: part.toolName, args }
          break
        }
        case 'tool-result': {
          const args = toolCallArgsById.get(part.toolCallId) ?? {}
          const toolName =
            toolCallNameById.get(part.toolCallId) ?? part.toolName
          const output = (part as { output?: unknown }).output
          aggregatedToolCalls.push({ toolName, args, result: output })
          yield { type: 'tool-result', toolName, result: output }
          break
        }
        case 'finish': {
          inputTokens = part.totalUsage?.inputTokens ?? 0
          outputTokens = part.totalUsage?.outputTokens ?? 0
          break
        }
        case 'error': {
          const message =
            part.error instanceof Error
              ? part.error.message
              : typeof part.error === 'string'
                ? part.error
                : 'Unknown stream error'
          yield { type: 'error', message }
          return
        }
        default:
          // Ignore events not relevant to the Builder chat (text-start,
          // text-end, reasoning-*, tool-input-*, source, file, start,
          // start-step, finish-step, abort, raw, tool-error, ...).
          break
      }
    }

    const latencyMs = Date.now() - startTime
    const cost = calculateCost(streamActiveModelName, inputTokens, outputTokens)

    // Fire-and-forget metrics update (non-blocking), mirroring the sync path.
    updateRuntimeMetrics(
      agentConfig,
      promptVersion,
      inputTokens,
      outputTokens,
      cost,
      latencyMs,
      aggregatedToolCalls
    )

    yield {
      type: 'finish',
      usage: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      },
      cost,
      latencyMs,
      model: streamActiveModelName,
      provider: agentConfig.provider,
      toolCalls: aggregatedToolCalls,
    }
  } catch (error: unknown) {
    // US-043: On retriable stream error, attempt fallback
    if (!streamIsInCooldown && streamFallbackModel && isRetriableError(error)) {
      console.log(
        `[AgentRuntime] Primary model failed mid-stream, falling back to ${streamFallbackModel}`
      )
      PROVIDER_COOLDOWNS.set(streamProviderKey, Date.now() + COOLDOWN_DURATION_MS)
      yield { type: 'error', message: `Primary model failed, retrying with fallback model ${streamFallbackModel}` }
    } else {
      const message =
        error instanceof Error ? error.message : 'Unknown LLM stream error'
      console.error(
        `[AgentRuntime] LLM stream failed for agent "${agentConfig.name}":`,
        message
      )
      yield { type: 'error', message }
    }
  }
}

// ── Playground Runtime (stateless, no persistence) ──────────────────────────

export interface ProcessPlaygroundStreamParams {
  agentConfigId: string
  organizationId: string
  message: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}

/**
 * Stateless streaming variant for the Playground tab.
 *
 * Differs from `processAgentMessageStream` in two ways:
 *   1. History is passed in-memory — never read from DB.
 *   2. No persistence side effects (no Message, BuilderToolCall, metrics update).
 *
 * Everything else (model selection, system prompt, built-in tools, cooldown
 * fallback) is shared via internal helpers from this file.
 */
export async function* processPlaygroundStream(
  params: ProcessPlaygroundStreamParams
): AsyncGenerator<AgentStreamEvent, void, unknown> {
  const startTime = Date.now()

  // 1. Load agent config
  let agentConfig: Awaited<ReturnType<typeof database.aIAgentConfig.findUnique>>
  try {
    agentConfig = await database.aIAgentConfig.findUnique({
      where: { id: params.agentConfigId },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'DB error loading agent config'
    yield { type: 'error', message }
    return
  }

  if (!agentConfig || !agentConfig.isActive) {
    yield {
      type: 'error',
      message: `Agent config ${params.agentConfigId} not found or inactive`,
    }
    return
  }

  // 2. Resolve active prompt (no A/B — sessionId not available in playground)
  const promptVersion = await getActivePrompt(agentConfig.id)
  let systemPrompt = promptVersion?.systemPrompt || agentConfig.systemPrompt || ''

  // 3. Use caller-supplied history directly (no DB round-trip)
  const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> =
    params.history

  // 4. Wire built-in tools with a synthetic context
  const toolContext: import('./tools/builtin-tools').ToolExecutionContext = {
    sessionId: 'playground',
    contactId: 'playground',
    connectionId: 'playground',
    organizationId: params.organizationId,
    agentConfigId: agentConfig.id,
  }
  const tools: import('ai').ToolSet = {
    ...getEnabledBuiltinTools(agentConfig.enabledTools, toolContext),
    ...(await getCustomTools(agentConfig.enabledTools, toolContext)),
  }

  // 5. Token budget check (reuse same logic, lenient in playground)
  const systemTokens = estimateTokens(systemPrompt)
  const historyTokens = conversationHistory.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0
  )
  const totalEstimatedTokens = systemTokens + historyTokens + 300
  const maxTokens = agentConfig.maxTokens || 4096

  if (totalEstimatedTokens > maxTokens) {
    yield {
      type: 'error',
      message: `Context budget exhausted: estimated ${totalEstimatedTokens} tokens exceeds max ${maxTokens}`,
    }
    return
  }

  if (totalEstimatedTokens > maxTokens * 0.8) {
    systemPrompt +=
      '\n\n[SISTEMA: Contexto próximo do limite. Seja conciso nas próximas respostas.]'
  }

  if (estimateTokens(systemPrompt) < 500) {
    systemPrompt =
      'Desculpe, estou com dificuldades no momento. Um atendente vai te ajudar em breve.'
  }

  // 6. Model selection (same cooldown logic)
  const pgFallbackModel = (agentConfig as Record<string, unknown>).fallbackModel as string | undefined
  const pgProviderKey = `${agentConfig.provider}:${agentConfig.model}`
  const pgCooldownUntil = PROVIDER_COOLDOWNS.get(pgProviderKey) ?? 0
  const pgIsInCooldown = Date.now() < pgCooldownUntil

  let pgActiveModel = getModel(agentConfig.provider, agentConfig.model)
  let pgActiveModelName = agentConfig.model

  if (pgIsInCooldown && pgFallbackModel) {
    pgActiveModel = getModel(agentConfig.provider, pgFallbackModel)
    pgActiveModelName = pgFallbackModel
  }

  // 7. Stream
  const toolCallArgsById = new Map<string, Record<string, unknown>>()
  const toolCallNameById = new Map<string, string>()
  const aggregatedToolCalls: Array<{
    toolName: string
    args: Record<string, unknown>
    result: unknown
  }> = []
  let inputTokens = 0
  let outputTokens = 0

  const callStream = (m: ReturnType<typeof getModel>) =>
    streamText({
      model: m,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: params.message },
      ],
      tools,
      stopWhen: stepCountIs(5),
      temperature: agentConfig!.temperature,
      maxOutputTokens: agentConfig!.maxTokens,
    })

  try {
    let result: ReturnType<typeof streamText>

    try {
      result = callStream(pgActiveModel)
    } catch (primaryErr: unknown) {
      if (!pgIsInCooldown && pgFallbackModel && isRetriableError(primaryErr)) {
        PROVIDER_COOLDOWNS.set(pgProviderKey, Date.now() + COOLDOWN_DURATION_MS)
        pgActiveModel = getModel(agentConfig.provider, pgFallbackModel)
        pgActiveModelName = pgFallbackModel
        result = callStream(pgActiveModel)
      } else {
        throw primaryErr
      }
    }

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta': {
          if (part.text) yield { type: 'text-delta', text: part.text }
          break
        }
        case 'tool-call': {
          const args = (part.input ?? {}) as Record<string, unknown>
          toolCallArgsById.set(part.toolCallId, args)
          toolCallNameById.set(part.toolCallId, part.toolName)
          yield { type: 'tool-call', toolName: part.toolName, args }
          break
        }
        case 'tool-result': {
          const args = toolCallArgsById.get(part.toolCallId) ?? {}
          const toolName = toolCallNameById.get(part.toolCallId) ?? part.toolName
          const output = (part as { output?: unknown }).output
          aggregatedToolCalls.push({ toolName, args, result: output })
          yield { type: 'tool-result', toolName, result: output }
          break
        }
        case 'finish': {
          inputTokens = part.totalUsage?.inputTokens ?? 0
          outputTokens = part.totalUsage?.outputTokens ?? 0
          break
        }
        case 'error': {
          const msg =
            part.error instanceof Error
              ? part.error.message
              : typeof part.error === 'string'
                ? part.error
                : 'Unknown stream error'
          yield { type: 'error', message: msg }
          return
        }
        default:
          break
      }
    }

    const latencyMs = Date.now() - startTime
    const cost = calculateCost(pgActiveModelName, inputTokens, outputTokens)

    yield {
      type: 'finish',
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      cost,
      latencyMs,
      model: pgActiveModelName,
      provider: agentConfig.provider,
      toolCalls: aggregatedToolCalls,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown playground stream error'
    console.error(`[AgentRuntime:playground] LLM stream failed for agent "${agentConfig.name}":`, message)
    yield { type: 'error', message }
  }
}

// ── US-043: Retriable Error Detection ───────────────────────────────────────

/**
 * Determines if an LLM error is retriable (429, 5xx, or timeout).
 */
function isRetriableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()

  // Check for timeout
  if (message.includes('timeout') || message.includes('timed out') || message.includes('aborted')) {
    return true
  }

  // Check for status code in error message or properties
  const statusMatch = message.match(/\b(429|5\d{2})\b/)
  if (statusMatch) return true

  // Check for common status property on error objects
  const statusCode = (error as unknown as Record<string, unknown>).status ??
    (error as unknown as Record<string, unknown>).statusCode
  if (typeof statusCode === 'number') {
    return statusCode === 429 || (statusCode >= 500 && statusCode < 600)
  }

  return false
}
