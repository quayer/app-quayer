/**
 * Agent Runtime — shared types
 *
 * Tipos públicos do runtime (resposta, params, eventos de stream) + erro de
 * budget (US-036) e fallback gracioso (RT-04). Extraído de
 * `agent-runtime.service.ts` no split estrutural — comportamento idêntico.
 */

import type { ToolSet } from 'ai'
import type { database } from '@/server/services/database'
import type { getModel } from '../services/provider-factory'
import type { RuntimeDecisionMeta } from '../services/runtime-decision.service'
import type {
  buildConversationContext,
  getActivePrompt,
} from './context-builders'

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
  /** QH-13: traceId propagado do webhook para correlação de logs cross-worker. */
  traceId?: string
  /**
   * Id da mensagem inbound do provider (waMessageId). Quando presente, ativa a
   * idempotência durável de turno — um 2º dispatch do mesmo turno é
   * short-circuitado. Ausente em playground/builder (sem retry de webhook).
   */
  inboundMessageId?: string
  /**
   * Custo de serviços externos já incorridos ANTES do turno (ex.: STT do áudio
   * inbound: `{ stt: 0.0086 }`). Persistido em AgentRuntimeDecision.extServiceCosts.
   */
  extServiceCosts?: Record<string, number>
}

// ── US-036: Context Budget Error ────────────────────────────────────────────

export class ContextBudgetExhaustedError extends Error {
  constructor(totalTokens: number, maxTokens: number) {
    super(
      `Context budget exhausted: estimated ${totalTokens} tokens exceeds max ${maxTokens}`
    )
    this.name = 'ContextBudgetExhaustedError'
  }
}

// ── RT-04: Graceful fallback for ContextBudgetExhaustedError ────────────────
//
// Texto neutro entregue ao cliente quando o contexto não cabe no budget. Garante
// que o lead receba ALGUMA resposta (em vez de um 500 silencioso no webhook) e
// sinaliza, de forma natural, que um humano pode assumir.

export const CONTEXT_BUDGET_FALLBACK_TEXT =
  'Desculpe, nossa conversa ficou um pouco longa e preciso de um instante para me reorganizar. Pode reenviar sua última mensagem de forma resumida? Se preferir, um atendente pode te ajudar.'

export function buildContextBudgetFallbackResponse(): AgentRuntimeResponse {
  return {
    text: CONTEXT_BUDGET_FALLBACK_TEXT,
    toolCalls: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    cost: { inputCost: 0, outputCost: 0, totalCost: 0 },
    latencyMs: 0,
    model: '',
    provider: '',
  }
}

// ── Shared Setup ─────────────────────────────────────────────────────────────

export type PreparedAgentCall = {
  agentConfig: Awaited<ReturnType<typeof database.aIAgentConfig.findUnique>>
  promptVersion: Awaited<ReturnType<typeof getActivePrompt>>
  conversationHistory: Awaited<ReturnType<typeof buildConversationContext>>
  tools: ToolSet
  model: ReturnType<typeof getModel>
  systemPrompt: string
  startTime: number
  /** Resolved BYOK key (or undefined → provider env fallback). */
  apiKey?: string
  /** Decisões coletadas no setup (RAG/skills/memória) p/ observabilidade. */
  decisionMeta: RuntimeDecisionMeta
  /** QH-05: provider resolvido pelo model router (pode ser mini). */
  routedProvider: string
  /** QH-05: modelo resolvido pelo model router (pode ser mini). */
  routedModel: string
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
