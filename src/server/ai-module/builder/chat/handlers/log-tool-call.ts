/**
 * Builder Chat — Tool Call Audit Log
 *
 * Writes Builder tool-call lifecycle events to `BuilderToolCall` so the
 * admin console can show per-tool latency, token spend, and failure
 * rate. All DB calls are wrapped in try/catch so a missing migration
 * (the table is new, and rollout may lag) never blocks a chat turn —
 * the feature degrades silently and logs to stderr.
 */

import { database } from '@/server/services/database'
import type { Prisma } from '@prisma/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JsonInput = Prisma.InputJsonValue

export interface LogToolCallStartArgs {
  messageId: string
  toolName: string
  input: JsonInput
}

export interface LogToolCallCompleteArgs {
  toolCallId?: string | null
  messageId: string
  toolName: string
  input: JsonInput
  output: JsonInput
  tokensIn?: number
  tokensOut?: number
  latencyMs?: number
}

export interface LogToolCallErrorArgs {
  toolCallId?: string | null
  messageId: string
  toolName: string
  input: JsonInput
  errorMessage: string
  latencyMs?: number
}

export interface LogToolCallResult {
  id: string | null
  persisted: boolean
}

// ---------------------------------------------------------------------------
// Writers
// ---------------------------------------------------------------------------

export async function logToolCallStart(
  args: LogToolCallStartArgs,
): Promise<LogToolCallResult> {
  try {
     
    const model = (database as any).builderToolCall
    if (!model) {
      return { id: null, persisted: false }
    }
    const row = await model.create({
      data: {
        messageId: args.messageId,
        toolName: args.toolName,
        input: args.input,
        status: 'pending',
      },
      select: { id: true },
    })
    return { id: row.id, persisted: true }
  } catch (err: unknown) {
    console.warn('[logToolCall.start] swallowed error:', err)
    return { id: null, persisted: false }
  }
}

export async function logToolCallComplete(
  args: LogToolCallCompleteArgs,
): Promise<LogToolCallResult> {
  try {
     
    const model = (database as any).builderToolCall
    if (!model) {
      return { id: null, persisted: false }
    }

    if (args.toolCallId) {
      const row = await model.update({
        where: { id: args.toolCallId },
        data: {
          output: args.output,
          status: 'success',
          tokensIn: args.tokensIn,
          tokensOut: args.tokensOut,
          latencyMs: args.latencyMs,
        },
        select: { id: true },
      })
      return { id: row.id, persisted: true }
    }

    const row = await model.create({
      data: {
        messageId: args.messageId,
        toolName: args.toolName,
        input: args.input,
        output: args.output,
        status: 'success',
        tokensIn: args.tokensIn,
        tokensOut: args.tokensOut,
        latencyMs: args.latencyMs,
      },
      select: { id: true },
    })
    return { id: row.id, persisted: true }
  } catch (err: unknown) {
    console.warn('[logToolCall.complete] swallowed error:', err)
    return { id: null, persisted: false }
  }
}

export async function logToolCallError(
  args: LogToolCallErrorArgs,
): Promise<LogToolCallResult> {
  try {
     
    const model = (database as any).builderToolCall
    if (!model) {
      return { id: null, persisted: false }
    }

    if (args.toolCallId) {
      const row = await model.update({
        where: { id: args.toolCallId },
        data: {
          status: 'error',
          errorMessage: args.errorMessage,
          latencyMs: args.latencyMs,
        },
        select: { id: true },
      })
      return { id: row.id, persisted: true }
    }

    const row = await model.create({
      data: {
        messageId: args.messageId,
        toolName: args.toolName,
        input: args.input,
        status: 'error',
        errorMessage: args.errorMessage,
        latencyMs: args.latencyMs,
      },
      select: { id: true },
    })
    return { id: row.id, persisted: true }
  } catch (err: unknown) {
    console.warn('[logToolCall.error] swallowed error:', err)
    return { id: null, persisted: false }
  }
}
