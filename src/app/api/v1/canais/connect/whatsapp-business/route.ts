/**
 * POST /api/v1/canais/connect/whatsapp-business
 *
 * Org-level WhatsApp Business (UAZAPI) provisioning for the /canais channel
 * selector modal. Mirrors the builder's provision-whatsapp.routes.ts saga but
 * is scoped to organizationId ONLY (NO projectId): provisions a UAZAPI
 * instance, registers the inbound webhook (best-effort), persists the
 * Connection and returns { connectionId, qrCode } for the modal QR panel.
 *
 * Auth: validates the JWT directly (cookie `accessToken` or Bearer header),
 * exactly like src/app/api/transcribe/route.ts — middleware excludes /api.
 * Multi-tenant: every write is scoped by currentOrgId from the token.
 *
 * NOTE: does NOT reuse /api/v1/instances/* (legacy) nor the builder controller
 * (which requires a projectId). `uazapiToken` is stored plaintext to stay
 * compatible with the webhook resolver (where: { uazapiToken }).
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken, extractTokenFromHeader } from '@/lib/auth/jwt'
import { getDatabase } from '@/server/services/database'
import { uazapiService, buildUazapiWebhookUrl } from '@/lib/api/uazapi.service'

export const runtime = 'nodejs'

const SHARE_TOKEN_TTL_SECONDS = 15 * 60

/** Resolves { userId, orgId } from the request JWT, or null if unauthenticated. */
function authFromRequest(
  request: NextRequest,
): { userId: string; orgId: string | null } | null {
  const cookieToken = request.cookies.get('accessToken')?.value
  const headerToken = extractTokenFromHeader(request.headers.get('authorization') ?? '')
  const token = cookieToken ?? headerToken
  if (!token) return null
  const payload = verifyAccessToken(token)
  if (!payload) return null
  return { userId: payload.userId, orgId: payload.currentOrgId ?? null }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = authFromRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!auth.orgId) {
    return NextResponse.json({ error: 'no_organization_selected' }, { status: 400 })
  }

  // Optional human label for the new Connection.
  let name = 'WhatsApp Business'
  try {
    const body = (await request.json()) as { name?: unknown } | null
    if (body && typeof body.name === 'string' && body.name.trim()) {
      name = body.name.trim().slice(0, 100)
    }
  } catch {
    // No / invalid JSON body — fall back to the default label.
  }

  const db = getDatabase()

  // 1) Provision the remote instance on the UAZAPI broker.
  const created = await uazapiService.createInstance(name)
  if (!created.success || !created.data?.token) {
    return NextResponse.json(
      { error: created.error || 'uazapi_provision_failed' },
      { status: 502 },
    )
  }
  const uazapiToken = created.data.token
  const uazapiInstanceId = (created.data.instance?.id as string | undefined) ?? null

  // 2) Register the inbound webhook (best-effort — never aborts the flow).
  const webhookUrl = buildUazapiWebhookUrl()
  if (webhookUrl) {
    try {
      await uazapiService.setWebhook(uazapiToken, webhookUrl)
    } catch (err) {
      console.warn('[canais/whatsapp-business] setWebhook falhou (não-fatal):', err)
    }
  } else {
    console.warn(
      '[canais/whatsapp-business] NEXT_PUBLIC_APP_URL/UAZAPI_WEBHOOK_SECRET ausentes — webhook não registrado',
    )
  }

  const shareToken = `share_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
  const shareTokenExpiresAt = new Date(Date.now() + SHARE_TOKEN_TTL_SECONDS * 1000)

  // 3) Persist the org-level Connection (NO projectId).
  const connection = await db.connection.create({
    data: {
      name,
      channel: 'WHATSAPP',
      provider: 'WHATSAPP_WEB',
      status: 'DISCONNECTED',
      organizationId: auth.orgId,
      shareToken,
      shareTokenExpiresAt,
      uazapiToken,
      uazapiInstanceId,
    },
    select: { id: true, uazapiToken: true },
  })

  // 4) Generate the pairing QR (best-effort).
  let qrCode: string | null = null
  if (connection.uazapiToken) {
    try {
      const qr = await uazapiService.generateQR(connection.uazapiToken)
      if (qr.success && qr.data?.qrcode) qrCode = qr.data.qrcode
    } catch {
      qrCode = null
    }
  }

  return NextResponse.json({
    data: {
      connectionId: connection.id,
      qrCode,
    },
  })
}
