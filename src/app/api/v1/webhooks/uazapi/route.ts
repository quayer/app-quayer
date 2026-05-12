/**
 * UAZapi inbound webhook.
 *
 * Receives WhatsApp messages from uazapi instances, runs the inbound pipeline
 * (text normalize → Whisper/Vision → buffer concat), persists ChatSession +
 * Message, dispatches the AI runtime and sends the response back to the
 * customer via outbound service.
 *
 * Pipeline:
 *   1. Validate `X-Webhook-Secret` against `UAZAPI_WEBHOOK_SECRET`.
 *   2. Parse uazapi payload.
 *   3. Resolve owning `Connection` by `uazapiInstanceId` or `uazapiToken`.
 *   4. Bot-echo guard for OUT messages (skip if our own bot just sent it).
 *   5. Inbound pipeline: normalize + Whisper + Vision + buffer.
 *      → If `shouldDispatchAi=false` (buffer waiting), respond 200 with
 *        `{ ok: true, waiting: true, reason }` and bail out.
 *   6. Upsert `ChatSession` keyed by (contactPhone, connectionId, organizationId).
 *   7. Persist `Message` using the `enrichedContent` from the pipeline.
 *   8. Fire typing indicator (fire-and-forget) when INBOUND and AI is gated on.
 *   9. Dispatch `processAgentMessage` (INBOUND only, gated by config).
 *  10. On AI success: `sendAgentResponse` to push the reply back to the
 *      contact's WhatsApp. Outbound failures NEVER abort the webhook.
 *
 * Hard rules:
 *   - Missing `UAZAPI_WEBHOOK_SECRET` returns 503 — refuse to operate as an
 *     open inbox if the deployment forgot to configure the secret.
 *   - AI failures NEVER bubble out — webhook always returns 200 to uazapi so it
 *     doesn't retry-storm us; the error is reported via `ai_error` in the JSON
 *     body and structured logs.
 *   - Outbound failures NEVER bubble out either — they show up as
 *     `outbound.errors` in the response so we can detect them in logs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { database } from '@/server/services/database'
import { isBotEcho, markBotMessage } from '@/server/communication/services/bot-echo-guard.service'
import { processAgentMessage } from '@/server/ai-module/ai-agents/agent-runtime.service'
import { processInboundMessage } from '@/server/communication/services/inbound-pipeline.service'
import { sendAgentResponse } from '@/server/communication/services/outbound.service'
import { sendTypingIndicator } from '@/server/communication/services/typing-indicator.service'
import * as uazapiSender from '@/server/communication/services/uazapi-sender.service'
import { getRedis } from '@/server/services/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── Types ─────────────────────────────────────────────────────────────────────

interface UazapiData {
  id?: string
  from?: string
  fromMe?: boolean
  direction?: 'IN' | 'OUT' | string
  type?: string
  body?: string
  media_url?: string
  media_mimetype?: string
  timestamp?: number
}

interface UazapiPayload {
  event?: string
  instance?: string
  token?: string
  data?: UazapiData
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}

const FALLBACK_UAZAPI_BASE_URL =
  process.env.UAZAPI_BASE_URL ?? 'https://api.uazapi.com'

/**
 * Map uazapi message types to Prisma `MessageType` enum (lowercase canonical).
 */
function mapMessageType(raw: string | undefined): string {
  const t = (raw ?? 'text').toLowerCase()
  // The Prisma enum uses lowercase ('text', 'image', 'audio', ...).
  // Anything we don't know falls back to 'text' to avoid enum violations.
  const allowed = new Set([
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
  return allowed.has(t) ? t : 'text'
}

/**
 * Whether AI dispatch is permitted for this session.
 * Skips when AI is explicitly disabled or while a temporary block is active.
 */
function canDispatchAi(session: {
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

function noop(): void {
  /* swallow */
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1) Secret validation — refuse to operate without configured secret.
  const configuredSecret = process.env.UAZAPI_WEBHOOK_SECRET
  if (!configuredSecret) {
    return NextResponse.json(
      { error: 'webhook secret not configured' },
      { status: 503 },
    )
  }
  const provided = req.headers.get('x-webhook-secret')
  if (!provided || provided !== configuredSecret) {
    return unauthorized()
  }

  // 2) Parse payload.
  let payload: UazapiPayload
  try {
    payload = (await req.json()) as UazapiPayload
  } catch {
    return badRequest('invalid json')
  }

  const data = payload?.data
  if (!data || typeof data !== 'object') {
    return badRequest('missing data')
  }
  if (!data.from || typeof data.from !== 'string') {
    return badRequest('missing data.from')
  }
  if (!data.id || typeof data.id !== 'string') {
    return badRequest('missing data.id')
  }

  const externalMessageId = data.id
  const contactPhone = data.from
  const direction: 'IN' | 'OUT' =
    data.direction === 'OUT' || data.fromMe === true ? 'OUT' : 'IN'

  // 3) Resolve Connection by uazapiInstanceId OR uazapiToken.
  const orClauses: Array<Record<string, string>> = []
  if (payload.instance) orClauses.push({ uazapiInstanceId: payload.instance })
  if (payload.token) orClauses.push({ uazapiToken: payload.token })
  if (orClauses.length === 0) {
    return badRequest('missing instance or token')
  }

  const connection = await database.connection.findFirst({
    where: { OR: orClauses },
  })

  if (!connection) {
    return NextResponse.json(
      { error: 'connection not found' },
      { status: 404 },
    )
  }

  const organizationId = connection.organizationId
  if (!organizationId) {
    return NextResponse.json(
      { error: 'connection without organizationId' },
      { status: 500 },
    )
  }

  // Loose-typed access for fields that are not yet first-class in the schema.
  const connectionLoose = connection as unknown as {
    aiAgentId?: string | null
    openaiApiKey?: string | null
    uazapiBaseUrl?: string | null
    uazapiToken?: string | null
  }
  const connectionAiAgentId = connectionLoose.aiAgentId ?? null

  // 4) Bot-echo guard (OUT only). If we sent it, skip everything.
  let author: 'CUSTOMER' | 'AGENT' = 'CUSTOMER'
  if (direction === 'OUT') {
    const echo = await isBotEcho(organizationId, externalMessageId)
    if (echo === true) {
      return NextResponse.json({ skip: 'bot_echo' }, { status: 200 })
    }
    // Operator typed it in the dashboard — count as human agent.
    author = 'AGENT'
  }

  // 5) Inbound pipeline (only for INBOUND messages — OUT operator messages
  // bypass enrichment/buffer entirely and are persisted as-is).
  let enrichedContent = data.body ?? ''
  if (direction === 'IN') {
    let redisClient: ReturnType<typeof getRedis> | null = null
    try {
      redisClient = getRedis()
    } catch {
      redisClient = null
    }

    const openaiApiKey =
      connectionLoose.openaiApiKey ?? process.env.OPENAI_API_KEY ?? undefined

    let pipelineResult
    try {
      pipelineResult = await processInboundMessage({
        payload,
        redis: redisClient,
        openaiApiKey,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn('[uazapi-webhook] inbound pipeline failed, continuing with raw body:', message)
      pipelineResult = null
    }

    if (pipelineResult) {
      if (!pipelineResult.shouldDispatchAi) {
        // Buffer waiting for more fragments OR invalid webhook — short-circuit.
        return NextResponse.json({
          ok: true,
          waiting: true,
          reason: pipelineResult.reason ?? 'WAITING',
        })
      }
      if (pipelineResult.enrichedContent) {
        enrichedContent = pipelineResult.enrichedContent
      }
    }
  }

  // 6) Upsert ChatSession.
  // Reuse any existing session that is not CLOSED; otherwise create a new one.
  const existingSession = await database.chatSession.findFirst({
    where: {
      contactPhone,
      connectionId: connection.id,
      organizationId,
      // SessionStatus enum: QUEUED/ACTIVE/PAUSED/CLOSED. The handler also
      // tolerates an 'OPEN' status (used by mocks/future schema) by simply
      // filtering out anything CLOSED-like.
      NOT: { status: { in: ['CLOSED'] as never } },
    },
  })

  type SessionLite = {
    id: string
    aiEnabled: boolean
    aiBlockedUntil: Date | string | null | undefined
    status?: string
  }

  let session: SessionLite
  if (existingSession && (existingSession as unknown as SessionLite).status !== 'CLOSED') {
    session = existingSession as unknown as SessionLite
  } else {
    const created = await database.chatSession.create({
      data: {
        contactPhone,
        connectionId: connection.id,
        organizationId,
        // 'OPEN' isn't in the Prisma enum yet — cast to satisfy types until the
        // schema lands. Functionally equivalent to ACTIVE for the runtime.
        status: 'OPEN' as never,
        aiEnabled: true,
        lastMessageAt: new Date(),
      } as never,
    })
    session = created as unknown as SessionLite
  }

  // 7) Create Message row (using enrichedContent — e.g. Whisper transcription).
  const created = await database.message.create({
    data: {
      sessionId: session.id,
      contactPhone,
      connectionId: connection.id,
      waMessageId: externalMessageId,
      direction: direction === 'IN' ? 'INBOUND' : 'OUTBOUND',
      type: mapMessageType(data.type) as never,
      author: author as never,
      content: enrichedContent,
      mediaUrl: data.media_url ?? null,
      mimeType: data.media_mimetype ?? null,
    } as never,
  })

  const messageId = (created as unknown as { id: string }).id

  // 8) AI dispatch — INBOUND only, gated by aiEnabled / aiBlockedUntil / agent config.
  if (direction === 'IN' && connectionAiAgentId && canDispatchAi(session)) {
    // Fire typing indicator (don't await) before dispatching the AI.
    if (connectionLoose.uazapiToken) {
      const baseUrl = connectionLoose.uazapiBaseUrl ?? FALLBACK_UAZAPI_BASE_URL
      sendTypingIndicator(connectionLoose.uazapiToken, baseUrl, contactPhone).catch(noop)
    }

    try {
      const result = await processAgentMessage({
        agentConfigId: connectionAiAgentId,
        sessionId: session.id,
        contactId: contactPhone,
        connectionId: connection.id,
        organizationId,
        messageContent: enrichedContent,
      })

      const aiText = (result as { text?: string } | null)?.text ?? null

      // 9) Outbound — push reply back to WhatsApp. Failures are isolated.
      let outbound: { blocksSent: number; errors: string[]; persisted?: boolean } | undefined
      if (aiText && aiText.trim().length > 0) {
        try {
          const outboundResult = await sendAgentResponse(
            {
              connectionId: connection.id,
              sessionId: session.id,
              organizationId,
              contactPhone,
              agentText: aiText,
            },
            {
              database: database as never,
              sender: uazapiSender,
              markBotMessage,
            },
          )
          outbound = {
            blocksSent: outboundResult.blocksSent,
            errors: outboundResult.errors,
            persisted: outboundResult.persisted,
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.warn('[uazapi-webhook] outbound failed (non-fatal):', message)
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
      console.error('[uazapi-webhook] AI dispatch failed:', message)
      return NextResponse.json({
        ok: true,
        sessionId: session.id,
        messageId,
        ai_error: message,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    sessionId: session.id,
    messageId,
  })
}
