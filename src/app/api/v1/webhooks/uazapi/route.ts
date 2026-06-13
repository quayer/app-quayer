/**
 * UAZapi inbound webhook — thin orchestrator.
 *
 * Receives WhatsApp messages from uazapi instances and chains the testable
 * pipeline stages in `src/server/communication/webhooks/uazapi/`:
 *
 *   1. verify-request    → secret (header or `?secret=`), JSON parse, shape
 *                          validation and rate limits (global + per-contact;
 *                          429 short-circuits before any AI processing).
 *   2. resolve-connection → connection-lifecycle events (QR paired /
 *                          disconnected), Connection lookup by
 *                          uazapiInstanceId/uazapiToken, opportunistic status
 *                          promotion (awaited, IN only) and active-agent
 *                          resolution (AgentDeployment → Connection fallback).
 *   3. process-inbound   → idempotent dedup (Redis SET NX, IN only), bot-echo
 *                          guard for OUT, enrichment pipeline (normalize →
 *                          Whisper/Vision → buffer; `waiting:true` when the
 *                          buffer holds fragments), ChatSession upsert,
 *                          operator commands/takeover, Message persistence.
 *   4. dispatch-ai       → activation gate, typing indicator, QH-01 dedup,
 *                          `processAgentMessage` and outbound delivery.
 *
 * Hard rules (enforced in the stages):
 *   - Missing `UAZAPI_WEBHOOK_SECRET` returns 503 — refuse to operate as an
 *     open inbox if the deployment forgot to configure the secret.
 *   - AI/outbound failures NEVER bubble out — the webhook always returns 200
 *     to uazapi so it doesn't retry-storm us (`ai_error` / `outbound.errors`).
 *   - Logs never carry full contact phones (masked via `maskPhone`) or tokens.
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/server/services/logger'
import { maskPhone } from '@/lib/webhook/mask'
import { loadAgentRuntimeSettingsForAgent } from '@/server/communication/services/agent-runtime-settings.service'
import { newTraceId } from '@/server/ai-module/ai-agents/infra/trace-context.service'
import {
  verifySecret,
  parsePayload,
  validateMessageShape,
  checkGlobalRateLimit,
  checkContactRateLimit,
} from '@/server/communication/webhooks/uazapi/verify-request'
import {
  isConnectionLifecycleEvent,
  promoteConnectionFromEvent,
  resolveConnection,
  promoteConnectionOnInbound,
  resolveAgentIdForConnection,
} from '@/server/communication/webhooks/uazapi/resolve-connection'
import {
  isDuplicateInboundDelivery,
  resolveMessageAuthor,
  runInboundPipeline,
  upsertChatSession,
  handleOperatorMessage,
  persistMessage,
} from '@/server/communication/webhooks/uazapi/process-inbound'
import {
  canDispatchAi,
  dispatchAiAndRespond,
} from '@/server/communication/webhooks/uazapi/dispatch-ai'
import { extractConnectionRuntimeFields } from '@/server/communication/webhooks/uazapi/types'
import { cancelPendingProactiveOnInbound } from '@/server/ai-module/ai-agents/proactive/cancel-on-inbound'
import { database } from '@/server/services/database'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 1) Secret validation + payload parse + rate-limit ceiling.
  const secretError = verifySecret(req)
  if (secretError) return secretError

  const parsed = await parsePayload(req)
  if ('response' in parsed) return parsed.response
  const { payload } = parsed

  const globalLimited = await checkGlobalRateLimit()
  if (globalLimited) return globalLimited

  // 2) Connection lifecycle events (QR paired, disconnected) carry no message
  // (no data.from), so handle them BEFORE the message-shape checks below.
  if (isConnectionLifecycleEvent(payload)) {
    const connectionUpdated = await promoteConnectionFromEvent(payload)
    return NextResponse.json(
      { ok: true, event: payload.event, connectionUpdated },
      { status: 200 },
    )
  }

  const shape = validateMessageShape(payload)
  if ('response' in shape) return shape.response
  const { externalMessageId, contactPhone, direction } = shape

  const contactLimited = await checkContactRateLimit(payload, contactPhone)
  if (contactLimited) return contactLimited

  // 3) Idempotent dedup (IN only) — short-circuit retries before any work.
  if (direction === 'IN' && (await isDuplicateInboundDelivery(payload, externalMessageId))) {
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 })
  }

  // QH-13: traceId única por requisição para correlação cross-worker.
  const traceId = newTraceId()
  logger.info('[uazapi-webhook] request recebido', {
    traceId,
    externalMessageId,
    contactPhone: maskPhone(contactPhone),
    direction,
  })

  // 4) Resolve Connection + active agent + runtime settings.
  const resolved = await resolveConnection(payload)
  if ('response' in resolved) return resolved.response
  const { connection, organizationId } = resolved

  if (direction === 'IN') {
    await promoteConnectionOnInbound(connection, traceId)
  }

  const runtimeFields = extractConnectionRuntimeFields(connection)
  const agentConfigId = await resolveAgentIdForConnection(
    connection.id,
    organizationId,
    runtimeFields.aiAgentId,
  )
  const runtimeSettings = await loadAgentRuntimeSettingsForAgent(
    agentConfigId,
    organizationId,
  )

  // 5) Bot-echo guard (OUT only) → author resolution.
  const authorResult = await resolveMessageAuthor(payload, direction, organizationId)
  if (authorResult.skip) {
    return NextResponse.json({ skip: 'bot_echo' }, { status: 200 })
  }
  const { author } = authorResult

  // 6) Inbound enrichment pipeline (may short-circuit while buffering).
  const inbound = await runInboundPipeline({
    payload,
    direction,
    organizationId,
    runtimeFields,
    runtimeSettings,
    contactPhone,
    traceId,
  })
  if ('response' in inbound) return inbound.response
  const { enrichedContent, pipelineResult } = inbound

  // F2b: cancel-on-inbound. Aqui o inbound é GENUÍNO do cliente — pós-dedup
  // (passo 3), não-echo (passo 5: IN ⇒ author=CUSTOMER), org + telefone
  // resolvidos e o pipeline NÃO entrou em buffer (não houve short-circuit). Um
  // follow-up proativo pendente perde o sentido quando o cliente responde →
  // cancelamos os ScheduledMessage 'pending' do par (org, telefone). FAIL-OPEN:
  // qualquer erro só loga — cancelar NUNCA pode quebrar o atendimento ao cliente.
  if (direction === 'IN') {
    try {
      await cancelPendingProactiveOnInbound(database, {
        organizationId,
        contactPhone,
      })
    } catch (err) {
      logger.warn('[uazapi-webhook] cancel-on-inbound falhou (não-fatal)', {
        traceId,
        contactPhone: maskPhone(contactPhone),
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // 7) ChatSession upsert + operator takeover/commands + Message persistence.
  const session = await upsertChatSession({
    contactPhone,
    connectionId: connection.id,
    organizationId,
  })

  const operatorCommand = await handleOperatorMessage({
    direction,
    author,
    enrichedContent,
    session,
  })

  const messageId = await persistMessage({
    session,
    contactPhone,
    connectionId: connection.id,
    externalMessageId,
    direction,
    author,
    enrichedContent,
    data: payload.data ?? {},
  })

  // Operator command processed → ack and stop (OUT never dispatches AI).
  if (operatorCommand) {
    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      messageId,
      operatorCommand: operatorCommand.kind,
    })
  }

  // 8) AI dispatch — INBOUND only, gated by aiEnabled / aiBlockedUntil / agent.
  if (direction === 'IN' && agentConfigId && canDispatchAi(session)) {
    return dispatchAiAndRespond({
      agentConfigId,
      session,
      messageId,
      connectionId: connection.id,
      organizationId,
      contactPhone,
      externalMessageId,
      enrichedContent,
      pipelineResult,
      runtimeFields,
      runtimeSettings,
      traceId,
    })
  }

  return NextResponse.json({
    ok: true,
    sessionId: session.id,
    messageId,
  })
}
