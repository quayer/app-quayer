/**
 * Agent Runtime — sync runtime (processAgentMessage)
 *
 * Caminho síncrono usado pelo webhook WhatsApp: contact lock (QH-04),
 * idempotência durável de turno, cooldown/fallback (US-043), loop de tools,
 * custo (QH-03) e persistência de decisão (AgentRuntimeDecision). Extraído de
 * `agent-runtime.service.ts` no split estrutural — comportamento idêntico.
 */

import {
  generateText,
  stepCountIs,
} from 'ai'
import { getModel } from '../services/provider-factory'
import {
  recordRuntimeDecision,
  claimRuntimeTurn,
  computeDecisionIdempotencyKey,
  EMPTY_DECISION_META,
} from '../services/runtime-decision.service'
import { getRedis } from '@/server/services/redis'
import { persistTurn } from '../services/memory-integration.service'
import { retryWithFallback } from '../services/retry-with-fallback.service'
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
  buildContextBudgetFallbackResponse,
  type AgentRuntimeResponse,
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
  // ── QH-04: Contact lock — serializa turnos do mesmo contato ──────────────
  // Adquire antes de prepareAgentCall para cobrir todo o turno (incluindo I/O).
  // fail-open: se Redis indisponível, acquired=true e segue sem serialização.
  const lockResult = await acquireContactLock({
    organizationId: params.organizationId,
    contactPhone: params.contactId, // contactId IS the phone (see callers)
    ttlMs: 90_000,
  })
  if (!lockResult.acquired) {
    console.log(
      `[AgentRuntime] QH-04: lock não adquirido para contactId=${params.contactId} — descartando turno`,
    )
    // Return an empty response — caller (webhook) treats this as a no-op.
    return {
      text: '',
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      cost: { inputCost: 0, outputCost: 0, totalCost: 0 },
      latencyMs: 0,
      model: '',
      provider: '',
    }
  }

  try {
  // QH-13: log traceId no início do turno para correlação cross-worker.
  if (params.traceId) {
    console.info('[AgentRuntime] turno iniciado', {
      traceId: params.traceId,
      sessionId: params.sessionId,
      organizationId: params.organizationId,
    })
  }

  // RT-04: prepareAgentCall pode lançar ContextBudgetExhaustedError quando o
  // contexto estimado não cabe no budget. Sem captura, isso vira 500 no webhook
  // (cliente sem resposta, sem telemetria). Capturamos AQUI — antes de entrar no
  // bloco de execução do LLM — para devolver um fallback gracioso e registrar a
  // decisão exatamente uma vez. (Outros erros de setup continuam propagando.)
  let prepared: PreparedAgentCall
  try {
    prepared = await prepareAgentCall(params)
  } catch (error: unknown) {
    if (error instanceof ContextBudgetExhaustedError) {
      console.warn(
        `[AgentRuntime] RT-04: context budget exhausted (sync) — fallback gracioso:`,
        error.message,
      )
      void recordRuntimeDecision({
        ...EMPTY_DECISION_META,
        organizationId: params.organizationId,
        sessionId: params.sessionId,
        agentConfigId: params.agentConfigId,
        executionMode: 'sync',
        modelPrimary: '',
        providerPrimary: '',
        modelUsed: '',
        providerUsed: '',
        status: 'fallback',
        errorMessage: error.message,
      })
      return buildContextBudgetFallbackResponse()
    }
    throw error
  }

  const {
    agentConfig,
    promptVersion,
    conversationHistory,
    tools,
    model,
    systemPrompt,
    startTime,
    apiKey: resolvedApiKey,
    decisionMeta,
    routedModel,
    routedProvider,
  } = prepared

  // agentConfig is guaranteed non-null here (prepareAgentCall throws otherwise)
  if (!agentConfig) {
    throw new Error('Agent config missing after prepareAgentCall')
  }

  // ── Idempotência durável de turno ────────────────────────────────────────
  // Reivindica ANTES do LLM. Se o MESMO turno (sessão + msg inbound + config) já
  // foi concluído por uma entrega anterior, short-circuita SEM reenviar — backstop
  // durável (DB) para quando o dedup Redis do inbound falha-open (Redis down).
  // Só ativa no caminho de webhook (inboundMessageId presente). Fail-open dentro
  // de claimRuntimeTurn: erro de DB → processa.
  const decisionKey = computeDecisionIdempotencyKey(
    params.sessionId,
    params.inboundMessageId,
    decisionMeta.configHash,
  )
  if (decisionKey) {
    const claimed = await claimRuntimeTurn({
      decisionIdempotencyKey: decisionKey,
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      agentConfigId: agentConfig.id,
      executionMode: 'sync',
      modelPrimary: agentConfig.model,
      providerPrimary: agentConfig.provider,
    })
    if (!claimed) {
      // Turno duplicado já concluído — no-op (o caller-webhook trata text vazio
      // como skip, exatamente como no lock-não-adquirido acima).
      return {
        text: '',
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        cost: { inputCost: 0, outputCost: 0, totalCost: 0 },
        latencyMs: 0,
        model: '',
        provider: '',
      }
    }
  }

  // US-043 / RT-05: Check if primary provider is in cooldown (Redis-backed).
  const fallbackModel = (agentConfig as Record<string, unknown>).fallbackModel as string | undefined
  const providerKey = `${agentConfig.provider}:${agentConfig.model}`
  const isInCooldown = await isProviderInCooldown(providerKey)

  // Choose which model to use (skip primary if in cooldown and fallback exists).
  // QH-05: start from the router-resolved model (may be mini), not agentConfig.model.
  let activeModel = model
  let activeModelName = routedModel
  let activeProvider = routedProvider
  let usedFallback = false

  if (isInCooldown && fallbackModel) {
    console.log(`[AgentRuntime] Primary model ${agentConfig.model} in cooldown, using fallback ${fallbackModel}`)
    activeModel = getModel(agentConfig.provider, fallbackModel, resolvedApiKey ?? params.apiKey)
    activeModelName = fallbackModel
    activeProvider = agentConfig.provider
    usedFallback = true
  }

  // 6. Call LLM with automatic tool-calling loop + US-043 fallback
  // RT-10: token-budget StopCondition junto do stepCountIs (piso aplicado).
  const callGenerateText = async (llmModel: ReturnType<typeof getModel>) => {
    return generateText({
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
      // Anthropic prompt caching: marks the system prompt as cacheable
      // (ephemeral TTL ~5min). Cuts input cost by 70-90% on long conversations
      // when the same system prompt is reused within the TTL window.
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
  }

  try {
    // US-043 (refactored): retryWithFallback wraps the primary generateText
    // call with exponential backoff and an automatic fallback model after half
    // the attempts. Uses the legacy `isRetriableError` classifier (HTTP 429,
    // 5xx, timeout/aborted) to preserve existing behavior visible from tests.
    const retryResult = await retryWithFallback(
      () => callGenerateText(activeModel),
      !usedFallback && fallbackModel
        ? () => {
            const fb = getModel(agentConfig.provider, fallbackModel, resolvedApiKey ?? params.apiKey)
            activeModel = fb
            activeModelName = fallbackModel
            usedFallback = true
            return callGenerateText(fb)
          }
        : null,
      {
        maxAttempts: 3,
        baseDelayMs: 500,
        maxDelayMs: 5000,
        isRetriable: isRetriableError,
        // QH-06: circuit breaker por provider/modelo.
        circuitBreaker: {
          primaryProvider: routedProvider,
          primaryModel: routedModel,
          fallbackProvider: agentConfig.provider,
          fallbackModel: fallbackModel,
        },
      },
    )

    if (retryResult.error) {
      throw retryResult.error
    }

    if (retryResult.usedFallback) {
      // Trip the cooldown so subsequent calls skip the primary for 5min.
      // Fire-and-forget (fail-open): nunca bloqueia o turno por erro de Redis.
      void setProviderCooldown(providerKey)
      console.log(
        `[AgentRuntime] Used fallback model ${fallbackModel} (attempts=${retryResult.attemptsUsed})`,
      )
    }

    const result = retryResult.data!

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

    // 8b. Persist turn na short-memory Redis (US-029 wire-up).
    // Fire-and-forget — erros são logados pelo próprio service.
    try {
      const redis = getRedis()
      void persistTurn(
        redis,
        params.sessionId,
        params.messageContent,
        result.text || '',
        params.organizationId,
      )
    } catch (err) {
      console.warn('[AgentRuntime] persistTurn skipped:', err)
    }

    // QH-03: Acumula custo no Redis após turno bem-sucedido (fire-and-forget).
    void incrementSessionCost(params.sessionId, cost.totalCost)

    // 8c. Observabilidade por turno (fire-and-forget — nunca derruba o agente).
    void recordRuntimeDecision({
      ...decisionMeta,
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      agentConfigId: agentConfig.id,
      executionMode: 'sync',
      modelPrimary: agentConfig.model,
      providerPrimary: agentConfig.provider,
      modelUsed: activeModelName,
      providerUsed: activeProvider,
      fallbackTriggered: usedFallback,
      fallbackReason: usedFallback ? 'cooldown_or_retry' : null,
      toolsCalled: toolCalls.map((t) => t.toolName),
      toolIterations: result.steps?.length ?? 0,
      inputTokens,
      outputTokens,
      cachedTokens:
        (result.usage as { cachedInputTokens?: number } | undefined)
          ?.cachedInputTokens ?? 0,
      totalTokens: inputTokens + outputTokens,
      totalCost: cost.totalCost,
      latencyMs,
      status: 'success',
      decisionIdempotencyKey: decisionKey,
      extServiceCosts: params.extServiceCosts,
    })

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
      provider: activeProvider,
      promptVersionId: promptVersion?.id,
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown LLM error'
    console.error(
      `[AgentRuntime] LLM call failed for agent "${agentConfig.name}":`,
      message
    )
    void recordRuntimeDecision({
      ...decisionMeta,
      organizationId: params.organizationId,
      sessionId: params.sessionId,
      agentConfigId: agentConfig.id,
      executionMode: 'sync',
      modelPrimary: agentConfig.model,
      providerPrimary: agentConfig.provider,
      modelUsed: activeModelName,
      providerUsed: activeProvider,
      fallbackTriggered: usedFallback,
      latencyMs: Date.now() - startTime,
      status: 'error',
      errorMessage: message,
      decisionIdempotencyKey: decisionKey,
      extServiceCosts: params.extServiceCosts,
    })
    throw error
  }
  } finally {
    // QH-04: sempre libera o lock — even on error/cap-exceeded.
    await releaseContactLock({
      organizationId: params.organizationId,
      contactPhone: params.contactId,
      token: lockResult.token ?? '',
    })
  }
}
