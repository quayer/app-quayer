/**
 * POST /api/v1/canais/connect/credentials
 *
 * Org-level managed-channel (WhatsApp Cloud API / Instagram) credential save
 * for the /canais channel selector modal. Mirrors the builder's
 * channel-credentials.routes.ts but is scoped to organizationId ONLY (NO
 * projectId): validates the credentials, encrypts the secret columns and
 * creates the Connection, returning { connectionId }.
 *
 * Body: { channel: 'whatsapp_cloud' | 'instagram', ...credentials } — the
 * `channel` discriminator is normalized onto the contract's `kind` so we can
 * reuse the shared Zod schema + pure mappers + crypto helpers.
 *
 * Auth: validates the JWT directly (cookie `accessToken` or Bearer header),
 * exactly like src/app/api/transcribe/route.ts — middleware excludes /api.
 * Security: secret columns are AES-encrypted via lib/crypto before persist.
 *
 * NOTE: does NOT reuse /api/v1/instances/* (legacy) nor the builder controller
 * (which requires a projectId).
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAccessToken, extractTokenFromHeader } from '@/lib/auth/jwt'
import { getDatabase } from '@/server/services/database'
import {
  saveChannelCredentialsSchema,
  toConnectionData,
} from '@/server/ai-module/builder/channel/channel-credentials.contract'
import { encryptSecretColumns } from '@/server/ai-module/builder/channel/channel-credentials.crypto'

export const runtime = 'nodejs'

/** Org-level channels accepted by this endpoint (no `whatsapp_business`/QR). */
const ACCEPTED_CHANNELS = ['whatsapp_cloud', 'instagram'] as const
type AcceptedChannel = (typeof ACCEPTED_CHANNELS)[number]

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

  let raw: Record<string, unknown>
  try {
    raw = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid_json_body' }, { status: 400 })
  }

  // Normalize the `channel` discriminator onto the contract's `kind`.
  const channel = raw.channel
  if (typeof channel !== 'string' || !ACCEPTED_CHANNELS.includes(channel as AcceptedChannel)) {
    return NextResponse.json(
      { error: 'invalid_channel', message: "channel deve ser 'whatsapp_cloud' ou 'instagram'" },
      { status: 400 },
    )
  }
  const { channel: _channel, name: rawName, ...credentials } = raw
  const name = typeof rawName === 'string' && rawName.trim() ? rawName.trim().slice(0, 120) : null

  // Validate against the shared contract schema (discriminated by `kind`).
  const parsed = saveChannelCredentialsSchema.safeParse({ kind: channel, ...credentials })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      { error: 'invalid_credentials', message: first?.message ?? 'Credenciais inválidas' },
      { status: 400 },
    )
  }

  // Pure plaintext mapping → then encrypt secret columns before persist.
  const plaintext = toConnectionData(parsed.data)
  const columns = encryptSecretColumns(plaintext, parsed.data.kind)

  const db = getDatabase()
  try {
    const created = await db.connection.create({
      data: {
        ...columns,
        organizationId: auth.orgId,
        name: name ?? `${channel} channel`,
        status: 'DISCONNECTED',
      } as never,
      select: { id: true },
    })

    return NextResponse.json({ data: { connectionId: created.id } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[canais/credentials] Falha ao salvar credenciais:', err)
    return NextResponse.json(
      { error: 'persist_failed', message },
      { status: 500 },
    )
  }
}
