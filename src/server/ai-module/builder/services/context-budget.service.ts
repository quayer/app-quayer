/**
 * Context Budget Service
 *
 * Manages conversation context window budget for the Builder meta-agent.
 * When the conversation history grows beyond the token threshold, old
 * messages are compacted into a summary via an LLM call, keeping only
 * the most recent messages intact.
 *
 * Pattern reference: Claude Code autoCompact.ts:62-265
 *
 * Story: US-016 (Wave 2) — Builder Architecture PRD.
 */

import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Message {
  role: string
  content: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default context window threshold (80% of ~160k context). */
const DEFAULT_THRESHOLD = 128_000

/** How many recent messages to keep intact during compaction. */
const DEFAULT_KEEP_LAST = 5

/** Model used for the summarization call. */
const DEFAULT_COMPACT_MODEL = 'gpt-4o-mini'

/** Circuit-breaker: max consecutive compaction failures before hard error. */
const MAX_CONSECUTIVE_FAILURES = 3

/** Consolidation system prompt for the summarization LLM call. */
const CONSOLIDATION_PROMPT =
  'Você é um assistente que organiza e consolida conversas. Resuma as mensagens antigas preservando: decisões tomadas, informações do projeto, ferramentas já configuradas, estado atual do agente. Retorne APENAS o resumo em markdown, máximo 500 palavras.'

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Thrown when the circuit breaker trips — compaction failed too many
 * consecutive times and the conversation can no longer fit in context.
 */
export class ContextBudgetExhaustedError extends Error {
  constructor(message = 'Context budget exhausted after repeated compaction failures') {
    super(message)
    this.name = 'ContextBudgetExhaustedError'
  }
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Simple heuristic token estimator.
 *
 * Uses the ~4 chars per token approximation. ~20% imprecise but
 * acceptable for budget-checking purposes in v1.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ---------------------------------------------------------------------------
// Threshold check
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the total estimated tokens across all messages
 * exceeds the given threshold.
 *
 * @param messages  Array of messages (only `content` is inspected).
 * @param threshold Token budget ceiling (defaults to 128 000).
 */
export function shouldCompact(
  messages: Array<{ content: string }>,
  threshold: number = DEFAULT_THRESHOLD,
): boolean {
  let total = 0
  for (const msg of messages) {
    total += estimateTokens(msg.content)
    // Short-circuit: no need to keep summing once we're over.
    if (total > threshold) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Compaction
// ---------------------------------------------------------------------------

/** Tracks consecutive failures for the circuit breaker. */
let consecutiveFailures = 0

/**
 * Compacts older messages into a summary using an LLM call, keeping
 * the most recent N messages intact.
 *
 * If the LLM call fails `MAX_CONSECUTIVE_FAILURES` times in a row,
 * a `ContextBudgetExhaustedError` is thrown so the caller can present
 * a user-friendly "start a new project" message.
 *
 * @param messages  Full ordered conversation history.
 * @param options.model    Model ID for the summarization call.
 * @param options.keepLast How many recent messages to preserve.
 * @returns An object with the `summary` text and the `compactedMessages`
 *          array (summary as a system message + the kept recent messages).
 */
export async function compactMessages(
  messages: Message[],
  options?: { model?: string; keepLast?: number },
): Promise<{ summary: string; compactedMessages: Message[] }> {
  const model = options?.model ?? DEFAULT_COMPACT_MODEL
  const keepLast = options?.keepLast ?? DEFAULT_KEEP_LAST

  // Split: old messages to summarize vs recent messages to keep.
  const splitIndex = Math.max(0, messages.length - keepLast)
  const oldMessages = messages.slice(0, splitIndex)
  const recentMessages = messages.slice(splitIndex)

  // Nothing to compact — all messages fit in the "keep" window.
  if (oldMessages.length === 0) {
    return {
      summary: '',
      compactedMessages: recentMessages,
    }
  }

  // Build the text block to summarize.
  const oldBlock = oldMessages
    .map((m) => `[${m.role}] ${m.content}`)
    .join('\n')

  try {
    const openai = createOpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    const result = await generateText({
      model: openai(model),
      system: CONSOLIDATION_PROMPT,
      prompt: oldBlock,
      maxOutputTokens: 2000,
    })

    const summary = result.text.trim()

    // Reset circuit breaker on success.
    consecutiveFailures = 0

    const compactedMessages: Message[] = [
      { role: 'system', content: `# Resumo da conversa anterior\n\n${summary}` },
      ...recentMessages,
    ]

    return { summary, compactedMessages }
  } catch (error: unknown) {
    consecutiveFailures++

    console.error(
      `[context-budget] compactMessages failed (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`,
      error,
    )

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      // Reset so a future conversation doesn't inherit the counter.
      consecutiveFailures = 0
      throw new ContextBudgetExhaustedError()
    }

    // Rethrow the original error so the caller can retry or degrade.
    throw error
  }
}
