/**
 * WhatsApp canary inbox webhook.
 *
 * Receives messages from a dedicated uazapi canary instance and stores the
 * latest message per sender phone in Redis with a short TTL. The synthetic
 * monitor reads from GET /api/_canary/whatsapp-inbox/latest?phone=... to
 * complete the phone-OTP roundtrip without ever holding state in-process.
 *
 * Security:
 *   - Header `X-Canary-Secret` MUST equal `CANARY_WEBHOOK_SECRET`. Without
 *     the secret configured we 503 (refuse to operate in default state) so
 *     this endpoint is never accidentally an open inbox in production.
 *   - Only digits + plus sign are accepted in phone keys to avoid Redis key
 *     injection.
 *
 * Storage:
 *   - Key: canary:wa:inbox:{phone}
 *   - Value: { body, receivedAt, instance, messageId }
 *   - TTL: 5 minutes
 *
 * This endpoint is OFF by default. To turn on in homol/prod, configure:
 *   CANARY_WEBHOOK_SECRET=<random-32-char-hex>
 *   ENABLE_CANARY_INBOX=true
 * and point the uazapi canary instance's setWebhook to:
 *   https://homol.quayer.com/api/_canary/whatsapp-inbox
 * with the X-Canary-Secret header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getRedis } from '@/server/services/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const KEY_PREFIX = 'canary:wa:inbox:'
const TTL_SECONDS = 300

function isEnabled(): boolean {
  return process.env.ENABLE_CANARY_INBOX === 'true' && !!process.env.CANARY_WEBHOOK_SECRET
}

function sanitizePhone(phone: string): string | null {
  // Only allow + and digits. uazapi sends raw numbers like "5511999998888".
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length < 8 || cleaned.length > 20) return null
  return cleaned
}

function extractOtp(body: string): string | null {
  const m = body.match(/\b(\d{4,8})\b/)
  return m ? m[1]! : null
}

interface UazapiWebhookPayload {
  instance?: string
  event?: string
  data?: {
    id?: string
    from?: string
    body?: string
    type?: string
    timestamp?: number
  }
}

export async function POST(req: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json(
      { error: 'canary inbox disabled' },
      { status: 503 },
    )
  }

  const provided = req.headers.get('x-canary-secret')
  if (provided !== process.env.CANARY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let payload: UazapiWebhookPayload
  try {
    payload = (await req.json()) as UazapiWebhookPayload
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  if (payload.event !== 'message' || !payload.data) {
    // Other events (delivery status, group changes, etc.) are silently OK.
    return NextResponse.json({ accepted: true, stored: false })
  }

  const fromRaw = payload.data.from
  if (!fromRaw || typeof fromRaw !== 'string') {
    return NextResponse.json({ error: 'missing from' }, { status: 400 })
  }

  const phone = sanitizePhone(fromRaw)
  if (!phone) {
    return NextResponse.json({ error: 'invalid phone' }, { status: 400 })
  }

  const body = typeof payload.data.body === 'string' ? payload.data.body : ''
  const record = {
    body,
    otp: extractOtp(body),
    receivedAt: new Date().toISOString(),
    instance: payload.instance ?? 'unknown',
    messageId: payload.data.id ?? 'unknown',
  }

  try {
    const redis = getRedis()
    await redis.setex(`${KEY_PREFIX}${phone}`, TTL_SECONDS, JSON.stringify(record))
  } catch (err) {
    console.error('[canary-inbox] redis write failed:', err)
    return NextResponse.json({ error: 'storage failed' }, { status: 502 })
  }

  return NextResponse.json({ accepted: true, stored: true })
}

export async function GET(req: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json(
      { error: 'canary inbox disabled' },
      { status: 503 },
    )
  }

  const provided = req.headers.get('x-canary-secret')
  if (provided !== process.env.CANARY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const phoneParam = url.searchParams.get('phone')
  if (!phoneParam) {
    return NextResponse.json({ error: 'phone param required' }, { status: 400 })
  }

  const phone = sanitizePhone(phoneParam)
  if (!phone) {
    return NextResponse.json({ error: 'invalid phone' }, { status: 400 })
  }

  try {
    const redis = getRedis()
    const raw = await redis.get(`${KEY_PREFIX}${phone}`)
    if (!raw) {
      return NextResponse.json({ found: false }, { status: 404 })
    }
    const record = JSON.parse(raw) as Record<string, unknown>
    return NextResponse.json({ found: true, ...record })
  } catch (err) {
    console.error('[canary-inbox] redis read failed:', err)
    return NextResponse.json({ error: 'storage failed' }, { status: 502 })
  }
}
