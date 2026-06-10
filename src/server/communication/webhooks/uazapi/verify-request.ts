/**
 * Stage 1 — request verification: shared-secret validation, JSON parse,
 * message-shape validation and inbound rate limiting.
 *
 * Rate limiting reuses the project-wide Redis sliding-window infra
 * (`src/lib/rate-limit/rate-limiter.ts`):
 *
 *   - Global ceiling: `webhookRateLimiter` (1000 req/min, shared webhook
 *     bucket) keyed by a fixed `uazapi:inbound` identifier — protects the
 *     instance from a webhook flood regardless of origin.
 *   - Per-contact: 60 req/10s keyed by `instance:contactPhone` — generous for
 *     real WhatsApp traffic, blocks a single contact retry-storm from burning
 *     LLM/STT budget.
 *
 * Both limiters fail-open when Redis is down (webhooks must never drop real
 * customer messages on an infra blip). A 429 is returned BEFORE any pipeline
 * or AI processing happens.
 */

import { NextRequest, NextResponse } from 'next/server'
import { RateLimiter, webhookRateLimiter } from '@/lib/rate-limit/rate-limiter'
import { maskPhone } from '@/lib/webhook/mask'
import { logger } from '@/server/services/logger'
import type {
  InboundMessageShape,
  UazapiPayload,
} from './types'

// ── Response helpers ──────────────────────────────────────────────────────────

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 })
}

function tooManyRequests(retryAfterSeconds: number | undefined): NextResponse {
  const retryAfter = retryAfterSeconds ?? 10
  return NextResponse.json(
    { error: 'rate_limited', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  )
}

// ── Secret validation ─────────────────────────────────────────────────────────

/**
 * Validates the shared secret. Returns an error response (401/503) or `null`
 * when the request is authorized.
 *
 * Missing `UAZAPI_WEBHOOK_SECRET` returns 503 — refuse to operate as an open
 * inbox if the deployment forgot to configure the secret. The secret is
 * accepted via header OR `?secret=` query param: UAZAPI does not guarantee
 * custom-header delivery on registered webhooks, so the registered URL
 * carries the secret in the query (see `buildUazapiWebhookUrl`).
 */
export function verifySecret(req: NextRequest): NextResponse | null {
  const configuredSecret = process.env.UAZAPI_WEBHOOK_SECRET
  if (!configuredSecret) {
    return NextResponse.json(
      { error: 'webhook secret not configured' },
      { status: 503 },
    )
  }

  const provided =
    req.headers.get('x-webhook-secret') ?? req.nextUrl.searchParams.get('secret')
  if (!provided || provided !== configuredSecret) {
    return unauthorized()
  }
  return null
}

// ── Payload parse + shape validation ─────────────────────────────────────────

/** Parses the JSON body. Returns the payload or a 400 response. */
export async function parsePayload(
  req: NextRequest,
): Promise<{ payload: UazapiPayload } | { response: NextResponse }> {
  try {
    return { payload: (await req.json()) as UazapiPayload }
  } catch {
    return { response: badRequest('invalid json') }
  }
}

/**
 * Validates the message-shaped fields (`data.from` / `data.id`) and derives
 * the normalized identity. Lifecycle events must be handled BEFORE this.
 */
export function validateMessageShape(
  payload: UazapiPayload,
): InboundMessageShape | { response: NextResponse } {
  const data = payload?.data
  if (!data || typeof data !== 'object') {
    return { response: badRequest('missing data') }
  }
  if (!data.from || typeof data.from !== 'string') {
    return { response: badRequest('missing data.from') }
  }
  if (!data.id || typeof data.id !== 'string') {
    return { response: badRequest('missing data.id') }
  }

  return {
    externalMessageId: data.id,
    contactPhone: data.from,
    direction: data.direction === 'OUT' || data.fromMe === true ? 'OUT' : 'IN',
  }
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

const GLOBAL_RATE_LIMIT_KEY = 'uazapi:inbound'

/**
 * Per-contact limiter: 60 requests / 10 seconds keyed by instance+phone.
 * Generous enough for legit bursts (voice fragments, buffer concat) while
 * capping a single contact/broker retry-storm.
 */
const contactRateLimiter = new RateLimiter({
  limit: 60,
  window: 10,
  prefix: 'ratelimit:webhooks:uazapi:contact',
})

/** Global ceiling across all uazapi webhook traffic. */
export async function checkGlobalRateLimit(): Promise<NextResponse | null> {
  const result = await webhookRateLimiter.check(GLOBAL_RATE_LIMIT_KEY)
  if (result.success) {
    return null
  }
  logger.warn('[uazapi-webhook] global rate limit exceeded', {
    limit: result.limit,
    retryAfter: result.retryAfter,
  })
  return tooManyRequests(result.retryAfter)
}

/** Per-contact rate limit. Returns a 429 response or `null` when allowed. */
export async function checkContactRateLimit(
  payload: UazapiPayload,
  contactPhone: string,
): Promise<NextResponse | null> {
  // Instance id is a routing identifier (not a secret) — safe in the key.
  // NEVER use/log `payload.token` here.
  const instanceKey = payload.instance ?? 'unknown-instance'
  const result = await contactRateLimiter.check(`${instanceKey}:${contactPhone}`)
  if (result.success) {
    return null
  }
  logger.warn('[uazapi-webhook] contact rate limit exceeded', {
    contactPhone: maskPhone(contactPhone),
    instance: payload.instance ?? null,
    limit: result.limit,
    retryAfter: result.retryAfter,
  })
  return tooManyRequests(result.retryAfter)
}
