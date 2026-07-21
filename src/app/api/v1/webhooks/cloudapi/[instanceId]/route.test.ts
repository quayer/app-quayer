/**
 * Cloud API per-instance webhook — unit tests (FASE A / FIX 1).
 *
 * Cobre a verificação de assinatura X-Hub-Signature-256 no POST (HMAC-SHA256
 * sobre o RAW body com o app secret da plataforma, CLOUDAPI_APP_SECRET) e a
 * remoção do verify token default hardcoded no GET.
 *
 * Política (documentada no FASE-A-REPORT):
 *  - CLOUDAPI_APP_SECRET configurado → assinatura inválida/ausente = 401.
 *  - CLOUDAPI_APP_SECRET ausente → aceita, mas loga warning estruturado com
 *    connectionId (escolha conservadora para não derrubar tenants).
 *  - GET sem verify token configurado (conexão E env) → 403.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createHmac } from 'crypto'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/server/services/database', () => ({
  database: {
    connection: { findFirst: vi.fn() },
  },
}))

vi.mock('@/server/services/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

vi.mock('@/lib/rate-limit/rate-limiter', () => ({
  webhookRateLimiter: {
    check: vi.fn(async () => ({
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60_000,
    })),
  },
}))

vi.mock('@/server/core/auth/_shared/helpers', () => ({
  getClientIdentifier: vi.fn(() => '203.0.113.10'),
}))

vi.mock('@/lib/webhook', () => ({
  validateWebhookPayload: vi.fn(() => ({ success: true, errors: [] })),
  createWebhookTrace: vi.fn(() => ({ traceId: 'trace-1' })),
}))

vi.mock('@/lib/providers', () => ({
  orchestrator: {
    normalizeWebhook: vi.fn(async () => ({
      event: 'message.received',
      instanceId: 'raw',
      timestamp: new Date(),
      data: { from: '5511999998888' },
    })),
  },
}))

vi.mock('@/lib/webhook/processor', () => ({
  processWebhookEvent: vi.fn(async () => undefined),
}))

vi.mock('@/lib/crypto', () => ({
  decrypt: vi.fn((v: string) => {
    if (v.startsWith('enc:')) return v.slice(4)
    throw new Error('decrypt failed')
  }),
  encrypt: vi.fn((v: string) => `enc:${v}`),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

const INSTANCE_ID = '11111111-2222-3333-4444-555555555555'
const BASE_URL = `https://homol.quayer.com/api/v1/webhooks/cloudapi/${INSTANCE_ID}`
const APP_SECRET = 'meta-app-secret-abc'

const FAKE_INSTANCE = {
  id: INSTANCE_ID,
  name: 'Conexão Teste',
  organizationId: 'org-1',
  cloudApiPhoneNumberId: 'phone-1',
  cloudApiVerifyToken: null as string | null,
}

const PAYLOAD = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ id: 'waba-1', changes: [] }],
})

function sign(payload: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
}

function makePost(opts: { body?: string; signature?: string | null } = {}): NextRequest {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.signature) headers['x-hub-signature-256'] = opts.signature
  return new NextRequest(BASE_URL, {
    method: 'POST',
    headers,
    body: opts.body ?? PAYLOAD,
  })
}

function makeGet(params: Record<string, string>): NextRequest {
  const url = new URL(BASE_URL)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url, { method: 'GET' })
}

const routeParams = { params: Promise.resolve({ instanceId: INSTANCE_ID }) }

// ── Setup ─────────────────────────────────────────────────────────────────────

const ORIGINAL_ENV = { ...process.env }

beforeEach(async () => {
  vi.clearAllMocks()
  vi.resetModules()
  process.env = { ...ORIGINAL_ENV }
  delete process.env.CLOUDAPI_APP_SECRET
  delete process.env.CLOUDAPI_WEBHOOK_VERIFY_TOKEN

  const { database } = await import('@/server/services/database')
  ;(database.connection.findFirst as any).mockResolvedValue({ ...FAKE_INSTANCE })
})

// ── POST: verificação de assinatura ──────────────────────────────────────────

describe('Cloud API webhook POST — assinatura X-Hub-Signature-256', () => {
  it('aceita (200) quando CLOUDAPI_APP_SECRET está configurado e a assinatura é válida', async () => {
    process.env.CLOUDAPI_APP_SECRET = APP_SECRET
    const { processWebhookEvent } = await import('@/lib/webhook/processor')

    const { POST } = await import('./route')
    const res = await POST(
      makePost({ signature: sign(PAYLOAD, APP_SECRET) }),
      routeParams,
    )

    expect(res.status).toBe(200)
    expect(processWebhookEvent).toHaveBeenCalledTimes(1)
  })

  it('rejeita com 401 quando a assinatura é inválida — e NÃO processa o evento', async () => {
    process.env.CLOUDAPI_APP_SECRET = APP_SECRET
    const { processWebhookEvent } = await import('@/lib/webhook/processor')

    const { POST } = await import('./route')
    const res = await POST(
      makePost({ signature: sign(PAYLOAD, 'outro-secret-errado') }),
      routeParams,
    )

    expect(res.status).toBe(401)
    expect(processWebhookEvent).not.toHaveBeenCalled()
  })

  it('rejeita com 401 quando a assinatura está AUSENTE e o secret está configurado', async () => {
    process.env.CLOUDAPI_APP_SECRET = APP_SECRET
    const { processWebhookEvent } = await import('@/lib/webhook/processor')

    const { POST } = await import('./route')
    const res = await POST(makePost({ signature: null }), routeParams)

    expect(res.status).toBe(401)
    expect(processWebhookEvent).not.toHaveBeenCalled()
  })

  it('a verificação usa o RAW body: payload adulterado com assinatura do original = 401', async () => {
    process.env.CLOUDAPI_APP_SECRET = APP_SECRET

    const tampered = PAYLOAD.replace('waba-1', 'waba-EVIL')
    const { POST } = await import('./route')
    const res = await POST(
      makePost({ body: tampered, signature: sign(PAYLOAD, APP_SECRET) }),
      routeParams,
    )

    expect(res.status).toBe(401)
  })

  it('sem CLOUDAPI_APP_SECRET: aceita (200) MAS loga warning estruturado com connectionId', async () => {
    const { logger } = await import('@/server/services/logger')
    const { processWebhookEvent } = await import('@/lib/webhook/processor')

    const { POST } = await import('./route')
    const res = await POST(makePost({ signature: null }), routeParams)

    expect(res.status).toBe(200)
    expect(processWebhookEvent).toHaveBeenCalledTimes(1)

    const warnCall = (logger.warn as any).mock.calls.find(
      (c: any[]) =>
        typeof c[0] === 'string' &&
        c[0].includes('WITHOUT signature verification'),
    )
    expect(warnCall).toBeDefined()
    expect(warnCall[1]).toMatchObject({ connectionId: INSTANCE_ID })
  })
})

// ── GET: verify token sem default hardcoded ──────────────────────────────────

describe('Cloud API webhook GET — verify token', () => {
  it('retorna 403 quando NENHUM verify token está configurado (conexão e env vazios)', async () => {
    const { GET } = await import('./route')
    const res = await GET(
      makeGet({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'quayer-cloudapi-verify', // antigo default hardcoded
        'hub.challenge': 'challenge-123',
      }),
      routeParams,
    )

    expect(res.status).toBe(403)
  })

  it('aceita o challenge quando o token bate com CLOUDAPI_WEBHOOK_VERIFY_TOKEN (env)', async () => {
    process.env.CLOUDAPI_WEBHOOK_VERIFY_TOKEN = 'env-token-xyz'

    const { GET } = await import('./route')
    const res = await GET(
      makeGet({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'env-token-xyz',
        'hub.challenge': 'challenge-123',
      }),
      routeParams,
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('challenge-123')
  })

  it('prefere o verify token da conexão (armazenado criptografado) ao env', async () => {
    process.env.CLOUDAPI_WEBHOOK_VERIFY_TOKEN = 'env-token-xyz'
    const { database } = await import('@/server/services/database')
    ;(database.connection.findFirst as any).mockResolvedValue({
      ...FAKE_INSTANCE,
      cloudApiVerifyToken: 'enc:token-da-conexao',
    })

    const { GET } = await import('./route')
    const res = await GET(
      makeGet({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'token-da-conexao',
        'hub.challenge': 'ch-9',
      }),
      routeParams,
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ch-9')
  })

  it('retorna 403 para token errado mesmo com env configurado', async () => {
    process.env.CLOUDAPI_WEBHOOK_VERIFY_TOKEN = 'env-token-xyz'

    const { GET } = await import('./route')
    const res = await GET(
      makeGet({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'token-errado',
        'hub.challenge': 'challenge-123',
      }),
      routeParams,
    )

    expect(res.status).toBe(403)
  })
})
