/**
 * Stage 4 — AI dispatch: activation gate, language context, typing indicator,
 * per-turn dedup (QH-01), `processAgentMessage` and outbound delivery.
 *
 * Hard rules:
 *   - AI failures NEVER bubble out — the webhook always returns 200 to uazapi
 *     so it doesn't retry-storm us; the error is reported via `ai_error` in
 *     the JSON body and structured logs.
 *   - Outbound failures NEVER bubble out either — they show up as
 *     `outbound.errors` in the response so we can detect them in logs.
 */

import { NextResponse } from 'next/server'
import { database } from '@/server/services/database'
import { logger } from '@/server/services/logger'
import {
  processAgentMessage,
  type AgentRuntimeResponse,
} from '@/server/ai-module/ai-agents/agent-runtime.service'
import {
  sendAgentResponse,
  type OutboundDatabase,
} from '@/server/communication/services/outbound.service'
import { deriveDispatchKey } from '@/server/communication/services/outbound-dispatch.pure'
import { enqueueOutboundRetry } from '@/server/communication/services/outbound-retry.queue'
import { sendTypingIndicator } from '@/server/communication/services/typing-indicator.service'
import {
  detectMessageLanguage,
  prependLanguageContext,
} from '@/server/communication/services/language-detection.service'
import * as uazapiSender from '@/server/communication/services/uazapi-sender.service'
import { markBotMessage } from '@/server/communication/services/bot-echo-guard.service'
import { checkAndMarkProcessed } from '@/server/ai-module/ai-agents/infra/idempotency.service'
import { evaluateActivationGate } from '@/lib/webhook/activation-gate'
import { maskPhone } from '@/lib/webhook/mask'
import type { AgentRuntimeSettings } from '@/lib/agent-runtime-settings'
import type { InboundPipelineResult } from '@/server/communication/services/inbound-pipeline.service'
import type { ConnectionRuntimeFields, WebhookSession } from './types'

const FALLBACK_UAZAPI_BASE_URL =
  process.env.UAZAPI_BASE_URL ?? 'https://api.uazapi.com'

// ── Gates ─────────────────────────────────────────────────────────────────────

/**
 * Whether AI dispatch is permitted for this session.
 * Skips when AI is explicitly disabled or while a temporary block is active.
 */
export function canDispatchAi(session: {
  aiEnabled: boolean
  aiBlockedUntil: Date | string | null | undefined
}): boolean {
  if (session.aiEnabled !== true) return false
  if (session.aiBlockedUntil) {
    const blockedUntil =
      session.aiBlockedUntil instanceof Date
        ? session.aiBlockedUntil
        : new Date(session.aiBlockedUntil)
    if (!Number.isNaN(blockedUntil.getTime()) && blockedUntil.getTime() > Date.now()) {
      return false
    }
  }
  return true
}

/**
 * Loads the agent's activation-mode config (Orayon). Multi-tenant: scoped by
 * organizationId so a leaked agentId can't read another org's config.
 * Defensive: any failure / unknown column falls back to legacy 'all' behavior.
 */
export async function loadActivationConfig(
  agentConfigId: string,
  organizationId: string,
): Promise<{ activationMode: string | null; activationKeywords: string[] | null }> {
  try {
    const cfg = await database.aIAgentConfig.findFirst({
      where: { id: agentConfigId, organizationId },
      select: { activationMode: true, activationKeywords: true },
    })
    return {
      activationMode: cfg?.activationMode ?? null,
      activationKeywords: cfg?.activationKeywords ?? null,
    }
  } catch (err) {
    logger.warn('[uazapi-webhook] activation config lookup failed, defaulting to all', {
      agentConfigId,
      error: err instanceof Error ? err.message : String(err),
    })
    return { activationMode: null, activationKeywords: null }
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export interface DispatchAiInput {
  agentConfigId: string
  session: WebhookSession
  messageId: string
  connectionId: string
  organizationId: string
  contactPhone: string
  externalMessageId: string
  enrichedContent: string
  pipelineResult: InboundPipelineResult | null
  runtimeFields: ConnectionRuntimeFields
  runtimeSettings: AgentRuntimeSettings
  traceId: string
}

/**
 * Runs the full AI turn for an INBOUND message and returns the webhook
 * response. Callers must have already checked `canDispatchAi` and resolved a
 * non-null agent.
 */
export async function dispatchAiAndRespond(input: DispatchAiInput): Promise<NextResponse> {
  const {
    agentConfigId,
    session,
    messageId,
    connectionId,
    organizationId,
    contactPhone,
    externalMessageId,
    enrichedContent,
    pipelineResult,
    runtimeFields,
    runtimeSettings,
    traceId,
  } = input

  // Activation-mode gate (Orayon). The Message is already persisted; here we
  // only decide whether to RUN the AI. Default mode 'all' keeps legacy
  // behavior (always dispatch). Blocked modes skip the dispatch entirely and
  // return ok:true so uazapi doesn't retry.
  const activation = await loadActivationConfig(agentConfigId, organizationId)
  const gate = evaluateActivationGate(
    {
      activationMode: activation.activationMode,
      activationKeywords: activation.activationKeywords,
    },
    { tags: session.tags ?? null },
    enrichedContent,
  )
  if (!gate.allowed) {
    logger.info('[uazapi-webhook] activation gate blocked dispatch', {
      mode: gate.mode,
      reason: gate.reason,
      sessionId: session.id,
      traceId,
    })
    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      messageId,
      ai_skipped: gate.reason ?? 'ACTIVATION_BLOCKED',
      activationMode: gate.mode,
    })
  }

  const detectedLanguage = runtimeSettings.languageDetectionEnabled
    ? pipelineResult?.detectedLanguage ??
      detectMessageLanguage(enrichedContent)?.code ??
      null
    : null
  const messageContent = runtimeSettings.languageDetectionEnabled
    ? prependLanguageContext(enrichedContent, detectedLanguage)
    : enrichedContent

  // Fire typing indicator (don't await) before dispatching the AI.
  // Intentionally non-blocking, but failures are logged with context —
  // never a silent catch.
  if (runtimeSettings.typingIndicatorEnabled && runtimeFields.uazapiToken) {
    const baseUrl = runtimeFields.uazapiBaseUrl ?? FALLBACK_UAZAPI_BASE_URL
    sendTypingIndicator(runtimeFields.uazapiToken, baseUrl, contactPhone).catch(
      (err: unknown) =>
        logger.warn('[uazapi-webhook] typing indicator failed (non-fatal)', {
          connectionId,
          traceId,
          contactPhone: maskPhone(contactPhone),
          error: err instanceof Error ? err.message : String(err),
        }),
    )
  }

  // QH-01: Dedup por waMessageId (token bucket Redis, complementar ao dedup de
  // fingerprint do stage de inbound). O gate usa a chave
  // `wa:dedup:{connectionId}:{waMessageId}` com TTL 24h — atômico SET NX.
  // Fail-open: Redis down → isDuplicate=false.
  const dedupResult = await checkAndMarkProcessed({
    connectionId,
    waMessageId: externalMessageId,
  })
  if (dedupResult.isDuplicate) {
    logger.debug('[uazapi-webhook] QH-01: waMessageId duplicado — drop silencioso', {
      waMessageId: externalMessageId,
      connectionId,
      traceId,
    })
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
  }

  try {
    const result = await processAgentMessage({
      agentConfigId,
      sessionId: session.id,
      contactId: contactPhone,
      connectionId,
      organizationId,
      messageContent,
      traceId,
      // Idempotência durável de turno: o id da msg inbound do uazapi.
      inboundMessageId: externalMessageId,
      // Custo de serviço externo do turno (STT do áudio inbound, se houve).
      extServiceCosts: pipelineResult?.sttCostUsd
        ? { stt: pipelineResult.sttCostUsd }
        : undefined,
    })

    const typedResult = result as AgentRuntimeResponse | null
    const aiText = typedResult?.text ?? null

    // Per-turn cost/token attribution for the OUTBOUND Message (these schema
    // columns existed but were always NULL — the runtime computed and threw
    // them away). Now persisted so "why did it respond X, at what cost" is
    // answerable per message.
    const aiMeta = typedResult
      ? {
          model: typedResult.model,
          provider: typedResult.provider,
          agentId: agentConfigId,
          inputTokens: typedResult.usage?.inputTokens,
          outputTokens: typedResult.usage?.outputTokens,
          inputCost: typedResult.cost?.inputCost,
          outputCost: typedResult.cost?.outputCost,
          totalCost: typedResult.cost?.totalCost,
          latencyMs: typedResult.latencyMs,
        }
      : undefined

    // Outbound — push reply back to WhatsApp. Failures are isolated.
    let outbound: { blocksSent: number; errors: string[]; persisted?: boolean } | undefined
    if (aiText && aiText.trim().length > 0) {
      try {
        const outboundResult = await sendAgentResponse(
          {
            connectionId,
            sessionId: session.id,
            organizationId,
            contactPhone,
            agentText: aiText,
            tts: runtimeSettings.tts,
            aiMeta,
            // FSM outbound durável: ancora o checkpoint por bloco neste turno.
            // O retry via outbound-retry.queue reenfileira o OutboundRequest
            // inteiro (dispatchKey junto), então o reprocessamento PULA blocos já
            // enviados = fim da duplicação. externalMessageId = waMessageId inbound
            // (mesmo id usado como inboundMessageId do turno).
            dispatchKey: deriveDispatchKey(session.id, externalMessageId),
          },
          {
            // Documented structural-subset cast: `OutboundDatabase` is a loose
            // mirror of the PrismaClient surface (Record-typed args), so the
            // concrete client isn't directly assignable.
            database: database as unknown as OutboundDatabase,
            sender: uazapiSender,
            markBotMessage,
            // QH-02: ao estourar o limite de instância, agenda retry com delay
            // (em vez de descartar a resposta). Worker dedicado reprocessa.
            // QH-13: propaga o traceId no hop do BullMQ para correlação
            // cross-worker (mesmo padrão de source-enrich).
            scheduleRetry: (payload, delayMs) =>
              enqueueOutboundRetry(payload, { delayMs, traceId }),
          },
        )
        outbound = {
          blocksSent: outboundResult.blocksSent,
          errors: outboundResult.errors,
          persisted: outboundResult.persisted,
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn('[uazapi-webhook] outbound failed (non-fatal)', {
          connectionId,
          sessionId: session.id,
          traceId,
          error: message,
        })
        outbound = { blocksSent: 0, errors: [message], persisted: false }
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      messageId,
      ai_response: aiText,
      ...(outbound ? { outbound } : {}),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error('[uazapi-webhook] AI dispatch failed', {
      connectionId,
      sessionId: session.id,
      traceId,
      error: message,
    })
    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      messageId,
      ai_error: message,
    })
  }
}
