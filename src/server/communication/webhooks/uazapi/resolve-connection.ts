/**
 * Stage 2 — connection resolution: UAZAPI lifecycle events (QR paired /
 * disconnected), Connection lookup by instance/token, opportunistic status
 * promotion and active-agent resolution.
 */

import { NextResponse } from 'next/server'
import type { Connection, Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import { logger } from '@/server/services/logger'
import { trackJourneyEvent } from '@/server/services/journey-events'
import {
  applyConfirmation,
  parseBuilderState,
} from '@/server/ai-module/builder/cards/builder-state'
import { badRequest } from './verify-request'
import type { UazapiPayload } from './types'

// ── Lifecycle events ──────────────────────────────────────────────────────────

/**
 * Whether the payload is a connection-lifecycle event (QR paired,
 * disconnected, …). These carry no message (`data.from`), so they must be
 * detected BEFORE the message-shape validation.
 *
 * 'presence' is contact online/offline, NOT channel state — it never matches
 * here, so it can't promote the connection status.
 */
export function isConnectionLifecycleEvent(payload: UazapiPayload): boolean {
  const eventName = (payload.event ?? '').toLowerCase()
  const hasMessageFrom = !!(
    payload.data &&
    typeof payload.data === 'object' &&
    typeof payload.data.from === 'string'
  )
  return !hasMessageFrom && /connect|status|state|logged|pair/.test(eventName)
}

/**
 * FR-30 — Side-effects of a Connection flipping to CONNECTED (Jornada v2, T35).
 * Fired ONCE per observed transition (both the lifecycle-event path and the
 * opportunistic-inbound path converge here):
 *
 *   (a) funnel telemetry `channel_connected` (fire-and-forget, NO PII — emitted
 *       with no metadata, so no phone/contact can ever leak); and
 *   (b) flips the monotonicity sentinel-mirror `whatsappConnectedOnce` in the
 *       project's builderState, so the `whatsapp_connect` step never reopens if
 *       the live connection later drops (degradation becomes a warning, T100).
 *
 * The project is resolved ORG-SCOPED via the canonical Connection↔project link
 * — the ACTIVE `AgentDeployment` → `agentConfig` → `BuilderProject.aiAgentId`
 * (Connection.projectId points at the LEGACY `Project` table, not BuilderProject
 * — see provision-whatsapp.routes.ts / attach-to-agent.ts). A Connection with no
 * resolvable project flips nothing.
 *
 * FAIL-OPEN by contract: the whole body is wrapped so a DB error in the
 * project lookup / sentinel write — or in telemetry — NEVER aborts the webhook.
 */
async function onConnectionConnected(
  connectionId: string,
  organizationId: string,
): Promise<void> {
  try {
    const deployment = await database.agentDeployment.findFirst({
      where: {
        connectionId,
        status: 'ACTIVE',
        agentConfig: { organizationId },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        agentConfig: { select: { builderProject: { select: { id: true } } } },
      },
    })
    const projectId = deployment?.agentConfig?.builderProject?.id
    if (!projectId) return

    // (a) Funnel telemetry — itself fire-and-forget (never throws). No PII.
    const conversation = await database.builderProjectConversation.findUnique({
      where: { projectId },
      select: { id: true, organizationId: true, builderState: true },
    })
    if (!conversation || conversation.organizationId !== organizationId) return

    const state = parseBuilderState(conversation.builderState)

    await trackJourneyEvent({
      organizationId,
      projectId,
      journeyVersion: state.journeyVersion,
      event: 'channel_connected',
    })

    // (b) Monotonicity sentinel — flip once; skip the write if already true.
    if (state.confirmations.whatsappConnectedOnce) return
    const next = applyConfirmation(state, 'whatsappConnectedOnce')
    await database.builderProjectConversation.updateMany({
      where: { id: conversation.id, organizationId },
      data: { builderState: next as unknown as Prisma.InputJsonValue },
    })
  } catch (err) {
    logger.warn('[uazapi-webhook] channel_connected side-effects failed (fail-open)', {
      connectionId,
      error: err instanceof Error ? err.message : String(err),
    })
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
export async function promoteConnectionFromEvent(
  payload: UazapiPayload,
): Promise<boolean> {
  const orClauses: Prisma.ConnectionWhereInput[] = []
  if (payload.instance) orClauses.push({ uazapiInstanceId: payload.instance })
  if (payload.token) orClauses.push({ uazapiToken: payload.token })
  if (orClauses.length === 0) return false

  const conn = await database.connection.findFirst({
    where: { OR: orClauses },
    select: { id: true, status: true, organizationId: true },
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
    // FR-30 (T35): a transition INTO CONNECTED fires the funnel event + flips
    // the monotonicity sentinel — fail-open, never aborts the webhook.
    if (nextStatus === 'CONNECTED' && conn.organizationId) {
      await onConnectionConnected(conn.id, conn.organizationId)
    }
    return true
  } catch (err) {
    logger.warn('[uazapi-webhook] connection status update failed', {
      connectionId: conn.id,
      nextStatus,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

// ── Connection lookup ─────────────────────────────────────────────────────────

export interface ResolvedConnection {
  connection: Connection
  organizationId: string
}

/**
 * Resolves the owning Connection by `uazapiInstanceId` OR `uazapiToken`.
 * Returns an error response (400/404/500) when resolution fails.
 */
export async function resolveConnection(
  payload: UazapiPayload,
): Promise<ResolvedConnection | { response: NextResponse }> {
  const orClauses: Prisma.ConnectionWhereInput[] = []
  if (payload.instance) orClauses.push({ uazapiInstanceId: payload.instance })
  if (payload.token) orClauses.push({ uazapiToken: payload.token })
  if (orClauses.length === 0) {
    return { response: badRequest('missing instance or token') }
  }

  const connection = await database.connection.findFirst({
    where: { OR: orClauses },
  })

  if (!connection) {
    return {
      response: NextResponse.json({ error: 'connection not found' }, { status: 404 }),
    }
  }

  const organizationId = connection.organizationId
  if (!organizationId) {
    return {
      response: NextResponse.json(
        { error: 'connection without organizationId' },
        { status: 500 },
      ),
    }
  }

  return { connection, organizationId }
}

/**
 * Opportunistic status promotion: inbound traffic from the customer is a
 * strong signal the channel is live, so flip a stale DISCONNECTED. Callers
 * gate this to IN only — an OUTBOUND echo is a weaker signal and shouldn't
 * mask a logout.
 *
 * Awaited (no fire-and-forget) so the write either lands or is logged with
 * full context before the message proceeds — failures never abort the webhook.
 */
export async function promoteConnectionOnInbound(
  connection: Pick<Connection, 'id' | 'status' | 'organizationId'>,
  traceId: string,
): Promise<void> {
  if (!connection.status || connection.status === 'CONNECTED') {
    return
  }
  try {
    await database.connection.update({
      where: { id: connection.id },
      data: { status: 'CONNECTED' },
    })
    // FR-30 (T35): same CONNECTED-transition point as the lifecycle path —
    // fire the funnel event + flip the monotonicity sentinel (fail-open).
    if (connection.organizationId) {
      await onConnectionConnected(connection.id, connection.organizationId)
    }
  } catch (err) {
    logger.warn('[uazapi-webhook] opportunistic status promotion failed', {
      connectionId: connection.id,
      traceId,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ── Agent resolution ──────────────────────────────────────────────────────────

/**
 * Resolves the active agent for a connection via the most recent ACTIVE
 * `AgentDeployment` (scoped to the org), falling back to the loose
 * `Connection.aiAgentId` when no deployment exists or the lookup fails.
 */
export async function resolveAgentIdForConnection(
  connectionId: string,
  organizationId: string,
  fallbackAgentId?: string | null,
): Promise<string | null> {
  let activeDeployment: { agentConfigId: string } | null = null
  try {
    activeDeployment = await database.agentDeployment.findFirst({
      where: {
        connectionId,
        status: 'ACTIVE',
        agentConfig: { organizationId },
      },
      orderBy: { updatedAt: 'desc' },
      select: { agentConfigId: true },
    })
  } catch (err) {
    logger.warn('[uazapi-webhook] agent deployment lookup failed, using fallback', {
      connectionId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  return activeDeployment?.agentConfigId ?? fallbackAgentId ?? null
}
