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
import { isBotEchoAny, markBotMessage } from '@/server/communication/services/bot-echo-guard.service'
import {
  processAgentMessage,
  type AgentRuntimeResponse,
} from '@/server/ai-module/ai-agents/agent-runtime.service'
import { processInboundMessage } from '@/server/communication/services/inbound-pipeline.service'
import { sendAgentResponse } from '@/server/communication/services/outbound.service'
import { sendTypingIndicator } from '@/server/communication/services/typing-indicator.service'
import { loadAgentRuntimeSettingsForAgent } from '@/server/communication/services/agent-runtime-settings.service'
import {
  detectMessageLanguage,
  prependLanguageContext,
} from '@/server/communication/services/language-detection.service'
import * as uazapiSender from '@/server/communication/services/uazapi-sender.service'
import { getRedis } from '@/server/services/redis'
import {
  isDuplicateInbound,
  pauseAiForOperatorTakeover,
} from '@/lib/webhook/inbound-resilience'
import { evaluateActivationGate } from '@/lib/webhook/activation-gate'

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

function addAlias(target: string[], value: unknown): void {
  if (typeof value === 'string' && value.length > 0 && !target.includes(value)) {
    target.push(value)
  }
}

function collectBotEchoAliases(payload: UazapiPayload): string[] {
  const data = payload.data
  const aliases: string[] = []
  const roots: Array<Record<string, unknown> | undefined> = [
    data as unknown as Record<string, unknown> | undefined,
    payload as unknown as Record<string, unknown>,
  ]

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

async function resolveAgentIdForConnection(
  connectionId: string,
  organizationId: string,
  fallbackAgentId?: string | null,
): Promise<string | null> {
  let activeDeployment: { agentConfigId: string } | null | undefined
  try {
    activeDeployment = await (database as unknown as {
      agentDeployment?: {
        findFirst?: (args: unknown) => Promise<{ agentConfigId: string } | null>
      }
    }).agentDeployment?.findFirst?.({
      where: {
        connectionId,
        status: 'ACTIVE',
        agentConfig: { organizationId },
      },
      orderBy: { updatedAt: 'desc' },
      select: { agentConfigId: true },
    })
  } catch (err) {
    console.warn(
      '[uazapi-webhook] agent deployment lookup failed, using fallback:',
      err instanceof Error ? err.message : String(err),
    )
  }

  return activeDeployment?.agentConfigId ?? fallbackAgentId ?? null
}

/**
 * Loads the agent's activation-mode config (Orayon). Multi-tenant: scoped by
 * organizationId so a leaked agentId can't read another org's config.
 * Defensive: any failure / unknown column falls back to legacy 'all' behavior.
 */
async function loadActivationConfig(
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
    console.warn(
      '[uazapi-webhook] activation config lookup failed, defaulting to all:',
      err instanceof Error ? err.message : String(err),
    )
    return { activationMode: null, activationKeywords: null }
  }
}

/**
 * Reads a connected/disconnected signal from a UAZAPI connection-lifecycle
 * event and updates the owning Connection.status. This closes the gap where an
 * instance paired via QR stayed `DISCONNECTED` forever (the QR path never had a
 * status-promotion handler).
 *
 * Best-effort + defensive: UAZAPI's event shape differs across versions, so we
 * probe several common fields (status/state/connection/connected/loggedIn).
 * ⚠️ Confirm the exact field names against the live broker in the E2E wave.
 */
async function promoteConnectionFromEvent(payload: UazapiPayload): Promise<boolean> {
  const orClauses: Array<Record<string, string>> = []
  if (payload.instance) orClauses.push({ uazapiInstanceId: payload.instance })
  if (payload.token) orClauses.push({ uazapiToken: payload.token })
  if (orClauses.length === 0) return false

  const conn = await database.connection.findFirst({
    where: { OR: orClauses },
    select: { id: true, status: true },
  })
  if (!conn) return false

  const raw = (payload.data ?? payload) as Record<string, unknown>
  const signal = String(
    raw.status ??
      raw.state ??
      raw.connection ??
      (raw.connected === true || raw.loggedIn === true ? 'connected' : ''),
  ).toLowerCase()

  let nextStatus: 'CONNECTED' | 'DISCONNECTED' | null = null
  if (/disconnect|close|offline|logout|unpair/.test(signal)) {
    nextStatus = 'DISCONNECTED'
  } else if (/connecting|pairing|qr|scanning/.test(signal)) {
    // Estado em progresso — NÃO promove (evita CONNECTED prematuro).
    nextStatus = null
  } else if (/connected|open|online|logged|paired/.test(signal)) {
    nextStatus = 'CONNECTED'
  }
  if (!nextStatus || conn.status === nextStatus) return false

  try {
    await database.connection.update({
      where: { id: conn.id },
      data: { status: nextStatus },
    })
    return true
  } catch (err) {
    console.warn('[uazapi-webhook] connection status update failed:', err)
    return false
  }
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
  // Accept the secret via header OR `?secret=` query param. UAZAPI does not
  // guarantee custom-header delivery on registered webhooks, so the registered
  // URL carries the secret in the query (see buildUazapiWebhookUrl).
  const provided =
    req.headers.get('x-webhook-secret') ?? req.nextUrl.searchParams.get('secret')
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

  // 2.5) Connection lifecycle events (QR paired, disconnected) carry no message
  // (no data.from), so handle them BEFORE the message-shape checks below.
  const eventName = (payload.event ?? '').toLowerCase()
  const hasMessageFrom = !!(
    payload.data &&
    typeof payload.data === 'object' &&
    typeof payload.data.from === 'string'
  )
  if (
    // 'presence' is contact online/offline, NOT channel state — excluded so it
    // never promotes the connection status.
    !hasMessageFrom &&
    /connect|status|state|logged|pair/.test(eventName)
  ) {
    const connectionUpdated = await promoteConnectionFromEvent(payload)
    return NextResponse.json(
      { ok: true, event: payload.event, connectionUpdated },
      { status: 200 },
    )
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

  // 2.6) Idempotent dedup (Orayon: sha256(instance:messageId)). UAZapi and the
  // brokers in front of it retry-storm webhooks; without this gate the same
  // physical INBOUND message is processed twice → duplicate AI reply + double
  // LLM/STT cost. Claim the fingerprint in Redis (SET NX EX 24h); first writer
  // wins, any later delivery is flagged as a duplicate and short-circuits BEFORE
  // the pipeline/dispatch. Gated to IN only — OUT echoes/operator messages are
  // already deduped by the bot-echo guard / are cheap to re-stamp. Fail-open:
  // if Redis is down `isDuplicateInbound` returns false and we process normally.
  if (direction === 'IN') {
    let dedupRedis: ReturnType<typeof getRedis> | null = null
    try {
      dedupRedis = getRedis()
    } catch {
      dedupRedis = null
    }
    const instanceForDedup = payload.instance ?? payload.token ?? ''
    const duplicate = await isDuplicateInbound(
      dedupRedis,
      instanceForDedup,
      externalMessageId,
    )
    if (duplicate) {
      return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
    }
  }

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

  // Opportunistic status promotion: inbound traffic from the customer is a
  // strong signal the channel is live, so flip a stale DISCONNECTED. Gated to
  // IN only — an OUTBOUND echo is a weaker signal and shouldn't mask a logout.
  // Fire-and-forget — never blocks the message.
  const connectionStatus = (connection as { status?: string }).status
  if (direction === 'IN' && connectionStatus && connectionStatus !== 'CONNECTED') {
    database.connection
      .update({ where: { id: connection.id }, data: { status: 'CONNECTED' } })
      .catch((err: unknown) =>
        console.warn('[uazapi-webhook] opportunistic status promotion failed:', err),
      )
  }

  // Loose-typed access for fields that are not yet first-class in the schema.
  const connectionLoose = connection as unknown as {
    aiAgentId?: string | null
    openaiApiKey?: string | null
    uazapiBaseUrl?: string | null
    uazapiToken?: string | null
  }
  const connectionAiAgentId = await resolveAgentIdForConnection(
    connection.id,
    organizationId,
    connectionLoose.aiAgentId,
  )
  const runtimeSettings = await loadAgentRuntimeSettingsForAgent(
    connectionAiAgentId,
    organizationId,
  )

  // 4) Bot-echo guard (OUT only). If we sent it, skip everything.
  let author: 'CUSTOMER' | 'AGENT' = 'CUSTOMER'
  if (direction === 'OUT') {
    const echoAliases = collectBotEchoAliases(payload)
    const echo = await isBotEchoAny(organizationId, echoAliases)
    if (echo === true) {
      return NextResponse.json({ skip: 'bot_echo' }, { status: 200 })
    }
    // Operator typed it in the dashboard — count as human agent.
    author = 'AGENT'
  }

  // 5) Inbound pipeline (only for INBOUND messages — OUT operator messages
  // bypass enrichment/buffer entirely and are persisted as-is).
  let enrichedContent = data.body ?? ''
  let pipelineResult: Awaited<ReturnType<typeof processInboundMessage>> | null = null
  if (direction === 'IN') {
    let redisClient: ReturnType<typeof getRedis> | null = null
    try {
      redisClient = getRedis()
    } catch {
      redisClient = null
    }

    const openaiApiKey =
      connectionLoose.openaiApiKey ?? process.env.OPENAI_API_KEY ?? undefined

    try {
      pipelineResult = await processInboundMessage({
        payload,
        redis: redisClient,
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
    tags?: string[] | null
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
        // SessionStatus enum is QUEUED/ACTIVE/PAUSED/CLOSED. Was wrongly set to
        // 'OPEN' (not in the enum → Postgres enum violation at runtime).
        status: 'ACTIVE',
        aiEnabled: true,
        lastMessageAt: new Date(),
      } as never,
    })
    session = created as unknown as SessionLite
  }

  // 6.5) Operator takeover (Orayon: human assumes → pause AI). Reaching here
  // with direction=OUT means it is NOT a bot echo (the guard above returned
  // early for echoes) → a human operator replied straight from the WhatsApp
  // app. Pause the AI for a 15min cooldown by stamping `aiBlockedUntil` (the
  // same field `canDispatchAi` checks) so the bot doesn't talk over the human.
  // Best-effort + defensive: failures never abort the webhook. We use the
  // existing session here (humans only reply to existing conversations); if a
  // brand-new session was just created we still pause it — harmless and matches
  // "human is now driving this contact".
  if (direction === 'OUT' && author === 'AGENT') {
    await pauseAiForOperatorTakeover(
      database as unknown as Parameters<typeof pauseAiForOperatorTakeover>[0],
      session.id,
    )
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
    // 8.0) Activation-mode gate (Orayon). The Message is already persisted
    // (step 7); here we only decide whether to RUN the AI. Default mode 'all'
    // keeps legacy behavior (always dispatch). Blocked modes skip the dispatch
    // entirely and return ok:true so uazapi doesn't retry.
    const activation = await loadActivationConfig(connectionAiAgentId, organizationId)
    const gate = evaluateActivationGate(
      { activationMode: activation.activationMode, activationKeywords: activation.activationKeywords },
      { tags: session.tags ?? null },
      enrichedContent,
    )
    if (!gate.allowed) {
      console.info(
        `[uazapi-webhook] activation gate blocked dispatch: mode=${gate.mode} reason=${gate.reason} session=${session.id}`,
      )
      return NextResponse.json({
        ok: true,
        sessionId: session.id,
        messageId,
        ai_skipped: gate.reason ?? 'ACTIVATION_BLOCKED',
        activationMode: gate.mode,
      })
    }

    const detectedLanguage =
      runtimeSettings.languageDetectionEnabled
        ? pipelineResult?.detectedLanguage ??
          detectMessageLanguage(enrichedContent)?.code ??
          null
        : null
    const messageContent = runtimeSettings.languageDetectionEnabled
      ? prependLanguageContext(enrichedContent, detectedLanguage)
      : enrichedContent

    // Fire typing indicator (don't await) before dispatching the AI.
    if (runtimeSettings.typingIndicatorEnabled && connectionLoose.uazapiToken) {
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
        messageContent,
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
            agentId: connectionAiAgentId,
            inputTokens: typedResult.usage?.inputTokens,
            outputTokens: typedResult.usage?.outputTokens,
            inputCost: typedResult.cost?.inputCost,
            outputCost: typedResult.cost?.outputCost,
            totalCost: typedResult.cost?.totalCost,
            latencyMs: typedResult.latencyMs,
          }
        : undefined

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
              tts: runtimeSettings.tts,
              aiMeta,
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
