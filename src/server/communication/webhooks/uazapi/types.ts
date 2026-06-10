/**
 * Shared types for the UAZapi inbound-webhook pipeline.
 *
 * The webhook handler in `src/app/api/v1/webhooks/uazapi/route.ts` is a thin
 * orchestrator over the stage modules in this folder:
 *
 *   verify-request.ts    → secret validation, payload parse, rate limits
 *   resolve-connection.ts → lifecycle events + Connection/agent resolution
 *   process-inbound.ts   → dedup, bot-echo, enrichment pipeline, persistence
 *   dispatch-ai.ts       → activation gate, AI runtime dispatch, outbound
 *
 * Every stage is a plain async function with explicit inputs/outputs so each
 * one can be unit-tested in isolation. The context below is what flows
 * between them.
 */

import type { ChatSession, Connection } from '@prisma/client'

// ── Raw payload shapes ────────────────────────────────────────────────────────

// Type aliases (not interfaces) on purpose: object-literal type aliases get an
// implicit index signature, so stages can read them as `Record<string, unknown>`
// for defensive probing without `as unknown as` casts.
export type UazapiData = {
  id?: string
  from?: string
  fromMe?: boolean
  direction?: 'IN' | 'OUT' | string
  type?: string
  body?: string
  media_url?: string
  media_mimetype?: string
  timestamp?: number
  source_id?: string
  sourceId?: string
  message_id?: string
  messageId?: string
  provider_message_id?: string
  providerMessageId?: string
  external_message_id?: string
  externalMessageId?: string
  key?: {
    id?: string
  }
}

export type UazapiPayload = {
  event?: string
  instance?: string
  token?: string
  data?: UazapiData
}

// ── Normalized message identity ───────────────────────────────────────────────

export type MessageDirectionFlag = 'IN' | 'OUT'
export type MessageAuthorFlag = 'CUSTOMER' | 'AGENT'

/** Identity extracted from a valid message-shaped payload. */
export interface InboundMessageShape {
  externalMessageId: string
  contactPhone: string
  direction: MessageDirectionFlag
}

// ── Connection runtime fields ─────────────────────────────────────────────────

/**
 * Sensitive/loose runtime fields read off the Connection row.
 *
 * `uazapiToken` is a first-class schema column (typed by Prisma). The other
 * three (`aiAgentId`, `openaiApiKey`, `uazapiBaseUrl`) are NOT in
 * `prisma/schema.prisma` yet — some deployments carry them as extra columns
 * (legacy/forward-compat), so they are read through a runtime type guard
 * instead of a blind `as unknown as` cast.
 */
export interface ConnectionRuntimeFields {
  aiAgentId: string | null
  openaiApiKey: string | null
  uazapiBaseUrl: string | null
  uazapiToken: string | null
}

/** Runtime type guard: reads an optional string property off an unknown object. */
function readLooseString(source: unknown, key: string): string | null {
  if (typeof source !== 'object' || source === null) {
    return null
  }
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Extracts the runtime fields from a Connection. Schema-backed fields come
 * from the Prisma type; the loose ones go through `readLooseString` so a
 * missing column degrades to `null` (and its env/deployment fallback) instead
 * of an unsound cast.
 */
export function extractConnectionRuntimeFields(
  connection: Connection,
): ConnectionRuntimeFields {
  return {
    aiAgentId: readLooseString(connection, 'aiAgentId'),
    openaiApiKey: readLooseString(connection, 'openaiApiKey'),
    uazapiBaseUrl: readLooseString(connection, 'uazapiBaseUrl'),
    uazapiToken: connection.uazapiToken ?? null,
  }
}

// ── Session ───────────────────────────────────────────────────────────────────

/**
 * Narrow session shape the webhook needs. Structurally satisfied by the Prisma
 * `ChatSession` — `status` is widened to `string` because the handler also
 * tolerates an 'OPEN' status used by mocks/future schema.
 */
export type WebhookSession = Pick<ChatSession, 'id' | 'aiEnabled' | 'tags'> & {
  aiBlockedUntil: Date | string | null
  status?: string
}
