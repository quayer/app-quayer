/**
 * Agent Runtime — streaming runtime (processAgentMessageStream)
 *
 * Variante streaming usada pelo chat do Quayer Builder: contact lock (QH-04),
 * cooldown/fallback (US-043), loop de tools via fullStream, custo (QH-03) e
 * persistência de decisão (AgentRuntimeDecision). Extraído de
 * `agent-runtime.service.ts` no split estrutural — comportamento idêntico.
 */

import {
  streamText,
  stepCountIs,
} from 'ai'
import { getModel } from '../services/provider-factory'
import {
  recordRuntimeDecision,
  EMPTY_DECISION_META,
} from '../services/runtime-decision.service'
import {
  incrementSessionCost,
} from '../infra/hard-caps.service'
// ── QH-04: Contact lock ───────────────────────────────────────────────────────
import {
  acquireContactLock,
  releaseContactLock,
} from '../infra/contact-lock.service'
import {
  ContextBudgetExhaustedError,
  CONTEXT_BUDGET_FALLBACK_TEXT,
  type AgentStreamEvent,
  type ProcessAgentMessageParams,
  type PreparedAgentCall,
} from './runtime.types'
import { prepareAgentCall } from './prepare-agent-call'
import { updateRuntimeMetrics } from './runtime-metrics'
import { calculateCost } from './cost'
import { budgetTokensFor, createBudgetStopCondition } from './tool-loop'
import {
  isProviderInCooldown,
  setProviderCooldown,
  isRetriableError,
} from './provider-failover'

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
  // ── QH-04: Contact lock ───────────────────────────────────────────────────
  const streamLockResult = await acquireContactLock({
    organizationId: params.organizationId,
    contactPhone: params.contactId,
    ttlMs: 90_000,
  })
  if (!streamLockResult.acquired) {
    console.log(
      `[AgentRuntime] QH-04: lock não adquirido (stream) para contactId=${params.contactId} — descartando turno`,
    )
    return
  }

  try {
  let prepared: PreparedAgentCall
  try {
    prepared = await prepareAgentCall(params)
  } catch (error: unknown) {
    // RT-04: budget estourado no setup → fallback gracioso (texto neutro +
    // finish) em vez de só um 'error'. Garante que o cliente receba ALGUMA
    // resposta e registra a decisão de runtime exatamente uma vez.
    if (error instanceof ContextBudgetExhaustedError) {
      console.warn(
        `[AgentRuntime] RT-04: context budget exhausted (stream) — fallback gracioso:`,
        error.message,
      )
      void recordRuntimeDecision({
        ...EMPTY_DECISION_META,
        organizationId: params.organizationId,
        sessionId: params.sessionId,
        agentConfigId: params.agentConfigId,
        executionMode: 'stream',
        modelPrimary: '',
        providerPrimary: '',
        modelUsed: '',
        providerUsed: '',
        status: 'fallback',
        errorMessage: error.message,
      })
      yield { type: 'text-delta', text: CONTEXT_BUDGET_FALLBACK_TEXT }
      yield {
        type: 'finish',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { inputCost: 0, outputCost: 0, totalCost: 0 },
        latencyMs: 0,
        model: '',
        provider: '',
        toolCalls: [],
      }
      return
    }
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
    decisionMeta,
    routedModel: preparedRoutedModel,
    routedProvider: preparedRoutedProvider,
  } = prepared

  if (!agentConfig) {
    yield { type: 'error', message: 'Agent config missing after prepareAgentCall' }
    return
  }

  // US-043 / RT-05: Check cooldown for streaming path (Redis-backed).
  const streamFallbackModel = (agentConfig as Record<string, unknown>).fallbackModel as string | undefined
  const streamProviderKey = `${agentConfig.provider}:${agentConfig.model}`
  const streamIsInCooldown = await isProviderInCooldown(streamProviderKey)

  // QH-05: start from the router-resolved model (may be mini).
  let streamActiveModel = model
  let streamActiveModelName = preparedRoutedModel
  // QH-05: track the routed provider for providerUsed in recordRuntimeDecision.
  let streamActiveProvider = preparedRoutedProvider

  if (streamIsInCooldown && streamFallbackModel) {
    console.log(`[AgentRuntime] Primary model ${agentConfig.model} in cooldown (stream), using fallback ${streamFallbackModel}`)
    streamActiveModel = getModel(agentConfig.provider, streamFallbackModel, prepared.apiKey ?? params.apiKey)
    streamActiveModelName = streamFallbackModel
    streamActiveProvider = agentConfig.provider
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

    // RT-10: token-budget StopCondition junto do stepCountIs (piso aplicado).
    const callStreamText = (llmModel: ReturnType<typeof getModel>) =>
      streamText({
        model: llmModel,
        system: systemPrompt,
        messages: [
          ...conversationHistory,
          { role: 'user', content: params.messageContent },
        ],
        tools,
        stopWhen: [
          stepCountIs(5),
          createBudgetStopCondition(budgetTokensFor(agentConfig.maxTokens)),
        ],
        temperature: agentConfig.temperature,
        maxOutputTokens: agentConfig.maxTokens,
        ...(agentConfig.provider === 'anthropic'
          ? {
              providerOptions: {
                anthropic: {
                  cacheControl: { type: 'ephemeral' as const },
                },
              },
            }
          : {}),
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
        void setProviderCooldown(streamProviderKey)
        streamActiveModel = getModel(agentConfig.provider, streamFallbackModel, prepared.apiKey ?? params.apiKey)
        streamActiveModelName = streamFallbackModel
        streamActiveProvider = agentConfig.provider
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

    // QH-03: Acumula custo no Redis após turno bem-sucedido (fire-and-forget).
    void incrementSessionCost(params.sessionId, cost.totalCost)

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

    void recordRuntimeDecision({
      ...decisionMeta,
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      agentConfigId: agentConfig.id,
      executionMode: 'stream',
      modelPrimary: agentConfig.model,
      providerPrimary: agentConfig.provider,
      modelUsed: streamActiveModelName,
      providerUsed: streamActiveProvider,
      fallbackTriggered: streamActiveModelName !== agentConfig.model,
      toolsCalled: aggregatedToolCalls.map((t) => t.toolName),
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      totalCost: cost.totalCost,
      latencyMs,
      status: 'success',
    })

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
      provider: streamActiveProvider,
      toolCalls: aggregatedToolCalls,
    }
  } catch (error: unknown) {
    // US-043: On retriable stream error, attempt fallback
    if (!streamIsInCooldown && streamFallbackModel && isRetriableError(error)) {
      console.log(
        `[AgentRuntime] Primary model failed mid-stream, falling back to ${streamFallbackModel}`
      )
      void setProviderCooldown(streamProviderKey)
      yield { type: 'error', message: `Primary model failed, retrying with fallback model ${streamFallbackModel}` }
    } else {
      const message =
        error instanceof Error ? error.message : 'Unknown LLM stream error'
      console.error(
        `[AgentRuntime] LLM stream failed for agent "${agentConfig.name}":`,
        message
      )
      void recordRuntimeDecision({
        ...decisionMeta,
        organizationId: params.organizationId,
        sessionId: params.sessionId,
        agentConfigId: agentConfig.id,
        executionMode: 'stream',
        modelPrimary: agentConfig.model,
        providerPrimary: agentConfig.provider,
        modelUsed: streamActiveModelName,
        providerUsed: streamActiveProvider,
        latencyMs: Date.now() - startTime,
        status: 'error',
        errorMessage: message,
      })
      yield { type: 'error', message }
    }
  }
  } finally {
    // QH-04: sempre libera o lock após o turno (mesmo em erro/return precoce).
    await releaseContactLock({
      organizationId: params.organizationId,
      contactPhone: params.contactId,
      token: streamLockResult.token ?? '',
    })
  }
}
