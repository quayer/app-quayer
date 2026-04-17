/**
 * Builder Chat — Compact If Needed
 *
 * Thin wrapper around `shouldCompact` + `compactMessages` from the
 * context-budget service. Lets the caller (the sendChatMessage route)
 * decide the HTTP response when compaction is exhausted, by returning
 * a discriminated `{ exhausted: true }` instead of rethrowing.
 *
 * Extracted from builder.controller.ts (US-016 plumbing inside
 * sendChatMessage) as part of the chat refactor.
 */

import {
  shouldCompact,
  compactMessages,
  ContextBudgetExhaustedError,
} from '../../services/context-budget.service'

export interface CompactableMessage {
  role: string
  content: string
}

export type CompactOutcome =
  | {
      compacted: false
      messages: CompactableMessage[]
      exhausted?: false
    }
  | {
      compacted: true
      messages: CompactableMessage[]
      summary: string
      exhausted?: false
    }
  | {
      compacted: false
      messages: CompactableMessage[]
      exhausted: true
      error: 'exhausted'
    }

/**
 * Inspects the message history; if it exceeds the token budget it
 * compacts older messages into a summary and returns the trimmed array.
 *
 * Error contract:
 *   - `ContextBudgetExhaustedError` → returns `exhausted: true` so the
 *     route can answer with a user-facing "conversa muito longa" error.
 *   - Any other error → logged, original (uncompacted) history returned
 *     so the turn can still proceed (degraded but functional).
 */
export async function compactIfNeeded(
  _conversationId: string,
  messages: CompactableMessage[],
): Promise<CompactOutcome> {
  if (!shouldCompact(messages)) {
    return { compacted: false, messages }
  }

  try {
    const { summary, compactedMessages } = await compactMessages(messages)
    return {
      compacted: true,
      messages: compactedMessages,
      summary,
    }
  } catch (err: unknown) {
    if (err instanceof ContextBudgetExhaustedError) {
      return {
        compacted: false,
        messages,
        exhausted: true,
        error: 'exhausted',
      }
    }
    console.warn(
      '[compactIfNeeded] compactMessages failed, proceeding with full history:',
      err,
    )
    return { compacted: false, messages }
  }
}
