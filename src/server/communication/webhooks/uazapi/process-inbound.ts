/**
 * Stage 3 — inbound processing: idempotent dedup, bot-echo guard, enrichment
 * pipeline (normalize → Whisper/Vision → buffer), ChatSession upsert, operator
 * commands/takeover and Message persistence.
 */

import { NextResponse } from 'next/server'
import type { MessageType, Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import { getRedis } from '@/server/services/redis'
import { logger } from '@/server/services/logger'
import { isBotEchoAny } from '@/server/communication/services/bot-echo-guard.service'
import {
  processInboundMessage,
  type InboundPipelineResult,
} from '@/server/communication/services/inbound-pipeline.service'
import {
  isDuplicateInbound,
  pauseAiForOperatorTakeover,
} from '@/lib/webhook/inbound-resilience'
import {
  parseOperatorCommand,
  applyOperatorCommand,
  type OperatorCommand,
} from '@/lib/webhook/operator-commands'
import { maskPhone } from '@/lib/webhook/mask'
import type { AgentRuntimeSettings } from '@/lib/agent-runtime-settings'
import type {
  ConnectionRuntimeFields,
  MessageAuthorFlag,
  MessageDirectionFlag,
  UazapiData,
  UazapiPayload,
  WebhookSession,
} from './types'

// ── Redis (fail-open) ─────────────────────────────────────────────────────────

function safeGetRedis(): ReturnType<typeof getRedis> | null {
  try {
    return getRedis()
  } catch {
    return null
  }
}

// ── Idempotent dedup ──────────────────────────────────────────────────────────

/**
 * Idempotent dedup (Orayon: sha256(instance:messageId)). UAZapi and the
 * brokers in front of it retry-storm webhooks; without this gate the same
 * physical INBOUND message is processed twice → duplicate AI reply + double
 * LLM/STT cost. Claim the fingerprint in Redis (SET NX EX 24h); first writer
 * wins, any later delivery is flagged as a duplicate and short-circuits BEFORE
 * the pipeline/dispatch. Callers gate this to IN only — OUT echoes/operator
 * messages are already deduped by the bot-echo guard / are cheap to re-stamp.
 * Fail-open: if Redis is down `isDuplicateInbound` returns false and we
 * process normally.
 */
export async function isDuplicateInboundDelivery(
  payload: UazapiPayload,
  externalMessageId: string,
): Promise<boolean> {
  const instanceForDedup = payload.instance ?? payload.token ?? ''
  return isDuplicateInbound(safeGetRedis(), instanceForDedup, externalMessageId)
}

// ── Bot-echo guard ────────────────────────────────────────────────────────────

function addAlias(target: string[], value: unknown): void {
  if (typeof value === 'string' && value.length > 0 && !target.includes(value)) {
    target.push(value)
  }
}

export function collectBotEchoAliases(payload: UazapiPayload): string[] {
  const data = payload.data
  const aliases: string[] = []
  const roots: Array<Record<string, unknown> | undefined> = [data, payload]

  for (const root of roots) {
    if (!root) continue
    addAlias(aliases, root.id)
    addAlias(aliases, root.source_id)
    addAlias(aliases, root.sourceId)
    addAlias(aliases, root.message_id)
    addAlias(aliases, root.messageId)
    addAlias(aliases, root.provider_message_id)
    addAlias(aliases, root.providerMessageId)
    addAlias(aliases, root.external_message_id)
    addAlias(aliases, root.externalMessageId)
    addAlias(aliases, root.chatwoot_message_id)
    addAlias(aliases, root.chatwootMessageId)

    const key = root.key as { id?: unknown } | undefined
    addAlias(aliases, key?.id)
  }

  return aliases
}

/**
 * Bot-echo guard (OUT only). If we sent it ourselves, skip everything.
 * An OUT message that is NOT an echo means an operator typed it — count it as
 * a human AGENT.
 */
export async function resolveMessageAuthor(
  payload: UazapiPayload,
  direction: MessageDirectionFlag,
  organizationId: string,
): Promise<{ skip: true } | { skip: false; author: MessageAuthorFlag }> {
  if (direction !== 'OUT') {
    return { skip: false, author: 'CUSTOMER' }
  }
  const echoAliases = collectBotEchoAliases(payload)
  const echo = await isBotEchoAny(organizationId, echoAliases)
  if (echo === true) {
    return { skip: true }
  }
  return { skip: false, author: 'AGENT' }
}

// ── Enrichment pipeline ───────────────────────────────────────────────────────

export type InboundPipelineOutcome =
  | { response: NextResponse }
  | { enrichedContent: string; pipelineResult: InboundPipelineResult | null }

/**
 * Inbound pipeline (only for INBOUND messages — OUT operator messages bypass
 * enrichment/buffer entirely and are persisted as-is). When the buffer is
 * still waiting for fragments (or the webhook is invalid) returns a 200
 * short-circuit response with `{ ok, waiting, reason }`.
 *
 * Pipeline failures degrade to the raw body — never block a customer message.
 */
export async function runInboundPipeline(input: {
  payload: UazapiPayload
  direction: MessageDirectionFlag
  organizationId: string
  runtimeFields: ConnectionRuntimeFields
  runtimeSettings: AgentRuntimeSettings
  contactPhone: string
  traceId: string
}): Promise<InboundPipelineOutcome> {
  const {
    payload,
    direction,
    organizationId,
    runtimeFields,
    runtimeSettings,
    contactPhone,
    traceId,
  } = input

  let enrichedContent = payload.data?.body ?? ''
  let pipelineResult: InboundPipelineResult | null = null

  if (direction === 'IN') {
    const openaiApiKey =
      runtimeFields.openaiApiKey ?? process.env.OPENAI_API_KEY ?? undefined

    try {
      pipelineResult = await processInboundMessage({
        payload,
        redis: safeGetRedis(),
        openaiApiKey,
        // Org dona da conexão → resolve a chave Deepgram (BYOK) como STT principal.
        organizationId,
        bufferEnabled: runtimeSettings.messageBuffer.enabled,
        bufferTimeoutSeconds: Math.round(runtimeSettings.messageBuffer.timeoutMs / 1000),
        whisperEnabled: runtimeSettings.media.audioTranscriptionEnabled,
        imageVisionEnabled: runtimeSettings.media.imageUnderstandingEnabled,
        documentVisionEnabled: runtimeSettings.media.documentUnderstandingEnabled,
        videoUnderstandingEnabled: runtimeSettings.media.videoUnderstandingEnabled,
      })
    } catch (err) {
      logger.warn('[uazapi-webhook] inbound pipeline failed, continuing with raw body', {
        traceId,
        contactPhone: maskPhone(contactPhone),
        error: err instanceof Error ? err.message : String(err),
      })
      pipelineResult = null
    }

    if (pipelineResult) {
      if (!pipelineResult.shouldDispatchAi) {
        // Buffer waiting for more fragments OR invalid webhook — short-circuit.
        return {
          response: NextResponse.json({
            ok: true,
            waiting: true,
            reason: pipelineResult.reason ?? 'WAITING',
          }),
        }
      }
      if (pipelineResult.enrichedContent) {
        enrichedContent = pipelineResult.enrichedContent
      }
    }
  }

  return { enrichedContent, pipelineResult }
}

// ── ChatSession upsert ────────────────────────────────────────────────────────

/**
 * Upserts the ChatSession keyed by (contactPhone, connectionId,
 * organizationId). Reuses any existing session that is not CLOSED; otherwise
 * creates a new ACTIVE one.
 */
export async function upsertChatSession(input: {
  contactPhone: string
  connectionId: string
  organizationId: string
}): Promise<WebhookSession> {
  const { contactPhone, connectionId, organizationId } = input

  const existingSession = await database.chatSession.findFirst({
    where: {
      contactPhone,
      connectionId,
      organizationId,
      // SessionStatus enum: QUEUED/ACTIVE/PAUSED/CLOSED. The handler also
      // tolerates an 'OPEN' status (used by mocks/future schema) by simply
      // filtering out anything CLOSED-like.
      NOT: { status: { in: ['CLOSED'] } },
    },
  })

  if (existingSession && existingSession.status !== 'CLOSED') {
    return existingSession
  }

  return database.chatSession.create({
    data: {
      contactPhone,
      connectionId,
      organizationId,
      // SessionStatus enum is QUEUED/ACTIVE/PAUSED/CLOSED. Was wrongly set to
      // 'OPEN' (not in the enum → Postgres enum violation at runtime).
      status: 'ACTIVE',
      aiEnabled: true,
      lastMessageAt: new Date(),
    },
  })
}

// ── Operator takeover / commands ──────────────────────────────────────────────

/**
 * Narrow, type-safe adapter over the Prisma client for the operator-command
 * helpers (their interfaces accept a loose `data` record by design — the
 * single cast below is scoped to this adapter instead of casting the whole
 * client).
 */
const sessionUpdateDb = {
  chatSession: {
    update: (args: { where: { id: string }; data: Record<string, unknown> }) =>
      database.chatSession.update({
        where: args.where,
        data: args.data as Prisma.ChatSessionUpdateInput,
      }),
  },
}

/**
 * Operator takeover (Orayon: human assumes → pause AI). Reaching here with
 * direction=OUT means it is NOT a bot echo (the guard returned early for
 * echoes) → a human operator replied straight from the WhatsApp app. Pause
 * the AI *until the session closes* by setting `aiEnabled=false` (the same
 * field `canDispatchAi` checks) so the bot doesn't talk over the human for
 * the rest of the conversation. The AI resumes automatically when the session
 * closes and the contact opens a new one.
 *
 * Operator commands: if the OUT/AGENT message is a `@comando` (the whole
 * text), apply the action instead of the generic takeover pause — the command
 * itself governs aiEnabled (e.g. @fechar closes, @ia hands back, @blacklist
 * tags).
 *
 * Best-effort + defensive: failures never abort the webhook.
 */
export async function handleOperatorMessage(input: {
  direction: MessageDirectionFlag
  author: MessageAuthorFlag
  enrichedContent: string
  session: WebhookSession
}): Promise<OperatorCommand | null> {
  const { direction, author, enrichedContent, session } = input
  if (direction !== 'OUT' || author !== 'AGENT') {
    return null
  }

  const operatorCommand = parseOperatorCommand(enrichedContent)
  if (operatorCommand) {
    await applyOperatorCommand(
      sessionUpdateDb,
      session.id,
      operatorCommand,
      session.tags ?? [],
    )
  } else {
    await pauseAiForOperatorTakeover(sessionUpdateDb, session.id)
  }
  return operatorCommand
}

// ── Message persistence ───────────────────────────────────────────────────────

const ALLOWED_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'text',
  'image',
  'video',
  'audio',
  'voice',
  'document',
  'location',
  'contact',
  'sticker',
  'poll',
  'list',
  'buttons',
])

/**
 * Map uazapi message types to Prisma `MessageType` enum (lowercase canonical).
 * Anything unknown falls back to 'text' to avoid enum violations — the set
 * membership check makes the narrowing cast sound.
 */
export function mapMessageType(raw: string | undefined): MessageType {
  const t = (raw ?? 'text').toLowerCase()
  return (ALLOWED_MESSAGE_TYPES.has(t) ? t : 'text') as MessageType
}

/**
 * Persists the Message row (using `enrichedContent` — e.g. Whisper
 * transcription). Returns the new message id.
 */
export async function persistMessage(input: {
  session: WebhookSession
  contactPhone: string
  connectionId: string
  externalMessageId: string
  direction: MessageDirectionFlag
  author: MessageAuthorFlag
  enrichedContent: string
  data: UazapiData
}): Promise<string> {
  const created = await database.message.create({
    data: {
      sessionId: input.session.id,
      contactPhone: input.contactPhone,
      connectionId: input.connectionId,
      waMessageId: input.externalMessageId,
      direction: input.direction === 'IN' ? 'INBOUND' : 'OUTBOUND',
      type: mapMessageType(input.data.type),
      author: input.author,
      content: input.enrichedContent,
      mediaUrl: input.data.media_url ?? null,
      mimeType: input.data.media_mimetype ?? null,
    },
  })

  return created.id
}
