/**
 * Stage 2 — connection resolution: UAZAPI lifecycle events (QR paired /
 * disconnected), Connection lookup by instance/token, opportunistic status
 * promotion and active-agent resolution.
 */

import { NextResponse } from 'next/server'
import type { Connection, Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import { logger } from '@/server/services/logger'
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
  connection: Pick<Connection, 'id' | 'status'>,
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
