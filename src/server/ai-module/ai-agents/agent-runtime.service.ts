/**
 * Agent Runtime Service
 *
 * Core service that executes AI agent responses using Vercel AI SDK.
 * Handles: context building, LLM calling, tool execution loop, cost tracking.
 *
 * Dependencies (to be installed):
 *   npm install ai @ai-sdk/openai @ai-sdk/anthropic
 */

import { generateText, streamText, stepCountIs } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { database } from '@/server/services/database'
import { getEnabledBuiltinTools, type ToolExecutionContext } from './tools/builtin-tools'

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

/**
 * Build a Vercel AI SDK model instance for the given provider.
 * Supports OpenAI, Anthropic, and Groq (OpenAI-compatible).
 */
function getModel(provider: string, model: string, apiKey?: string) {
  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
      })
      return anthropic(model)
    }

    case 'groq': {
      const groq = createOpenAI({
        apiKey: apiKey || process.env.GROQ_API_KEY,
        baseURL: 'https://api.groq.com/openai/v1',
      })
      return groq(model)
    }

    case 'openai':
    default: {
      const openai = createOpenAI({
        apiKey: apiKey || process.env.OPENAI_API_KEY,
      })
      return openai(model)
    }
  }
}

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
    },
  })

  return messages.map((msg) => ({
    role: (msg.direction === 'INBOUND' ? 'user' : 'assistant') as 'user' | 'assistant',
    content: msg.content || `[${msg.type}]`,
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
  tools: ReturnType<typeof getEnabledBuiltinTools>
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
  const systemPrompt =
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
  }
  const tools = getEnabledBuiltinTools(agentConfig.enabledTools, toolContext)

  // 5. Get LLM model instance
  const model = getModel(agentConfig.provider, agentConfig.model, params.apiKey)

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

  // 6. Call LLM with automatic tool-calling loop
  try {
    const result = await generateText({
      model,
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

    const latencyMs = Date.now() - startTime
    const inputTokens = result.usage?.inputTokens ?? 0
    const outputTokens = result.usage?.outputTokens ?? 0
    const cost = calculateCost(agentConfig.model, inputTokens, outputTokens)

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
      model: agentConfig.model,
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
    const result = streamText({
      model,
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
    const cost = calculateCost(agentConfig.model, inputTokens, outputTokens)

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
      model: agentConfig.model,
      provider: agentConfig.provider,
      toolCalls: aggregatedToolCalls,
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown LLM stream error'
    console.error(
      `[AgentRuntime] LLM stream failed for agent "${agentConfig.name}":`,
      message
    )
    yield { type: 'error', message }
  }
}
