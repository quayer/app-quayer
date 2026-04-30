/**
 * Builder Chat — Persist Message Handlers
 *
 * Centralized writes to `BuilderProjectMessage`. The original
 * `sendChatMessage` controller scattered 3+ create calls inline; this
 * module groups them by role so the streaming orchestrator stays thin.
 *
 * All functions swallow persistence errors (logging them) — the chat
 * UX should never be blocked by an audit-only DB failure. Failures are
 * still observable via logs.
 */

import { database } from '@/server/services/database'
import type { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type JsonValue = Prisma.InputJsonValue

// ---------------------------------------------------------------------------
// Metadata size guard
// ---------------------------------------------------------------------------

const MAX_JSON_BYTES = 256 * 1024

function capJson(data: unknown, label: string): unknown {
  const s = JSON.stringify(data)
  if (s.length > MAX_JSON_BYTES) {
    console.warn(`[Builder] ${label} truncated — was ${s.length} bytes`)
    return { _truncated: true, originalSize: s.length }
  }
  return data
}

export interface PersistUserMessageArgs {
  conversationId: string
  content: string
  metadata?: JsonValue
}

export interface PersistAssistantMessageArgs {
  conversationId: string
  content: string
  toolCalls?: JsonValue
  toolResults?: JsonValue
  metadata?: JsonValue
}

export interface PersistErrorMessageArgs {
  conversationId: string
  content: string
}

export interface PersistSystemBannerArgs {
  conversationId: string
  content: string
  metadata?: JsonValue
}

export interface PersistResult {
  id: string | null
  persisted: boolean
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

export async function persistUserMessage(
  args: PersistUserMessageArgs,
): Promise<PersistResult> {
  try {
    const row = await database.builderProjectMessage.create({
      data: {
        conversationId: args.conversationId,
        role: 'user',
        content: args.content,
        metadata: args.metadata !== undefined ? capJson(args.metadata, 'user.metadata') as JsonValue : undefined,
      },
      select: { id: true },
    })
    return { id: row.id, persisted: true }
  } catch (err: unknown) {
    console.error('[persistMessage.user] Failed to persist user message:', err)
    return { id: null, persisted: false }
  }
}

export async function persistAssistantMessage(
  args: PersistAssistantMessageArgs,
): Promise<PersistResult> {
  try {
    const row = await database.builderProjectMessage.create({
      data: {
        conversationId: args.conversationId,
        role: 'assistant',
        content: args.content,
        toolCalls: args.toolCalls !== undefined ? capJson(args.toolCalls, 'assistant.toolCalls') as JsonValue : undefined,
        toolResults: args.toolResults,
        metadata: args.metadata !== undefined ? capJson(args.metadata, 'assistant.metadata') as JsonValue : undefined,
      },
      select: { id: true },
    })
    return { id: row.id, persisted: true }
  } catch (err: unknown) {
    console.error(
      '[persistMessage.assistant] Failed to persist assistant message:',
      err,
    )
    return { id: null, persisted: false }
  }
}

/**
 * Writes an error surface as a `system_banner` message — never as a
 * fake user/assistant turn. Matches the original sendChatMessage behavior.
 */
export async function persistErrorMessage(
  args: PersistErrorMessageArgs,
): Promise<PersistResult> {
  try {
    const row = await database.builderProjectMessage.create({
      data: {
        conversationId: args.conversationId,
        role: 'system_banner',
        content: args.content,
      },
      select: { id: true },
    })
    return { id: row.id, persisted: true }
  } catch (err: unknown) {
    console.error(
      '[persistMessage.error] Failed to persist error banner:',
      err,
    )
    return { id: null, persisted: false }
  }
}

export async function persistSystemBanner(
  args: PersistSystemBannerArgs,
): Promise<PersistResult> {
  try {
    const row = await database.builderProjectMessage.create({
      data: {
        conversationId: args.conversationId,
        role: 'system_banner',
        content: args.content,
        metadata: args.metadata !== undefined ? capJson(args.metadata, 'system_banner.metadata') as JsonValue : undefined,
      },
      select: { id: true },
    })
    return { id: row.id, persisted: true }
  } catch (err: unknown) {
    console.error(
      '[persistMessage.systemBanner] Failed to persist system banner:',
      err,
    )
    return { id: null, persisted: false }
  }
}
