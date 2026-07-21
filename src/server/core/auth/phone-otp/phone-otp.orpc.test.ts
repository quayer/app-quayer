/**
 * Auth/Phone-OTP (oRPC) — teste in-process do lote 4b.
 *
 * Cobre: honestidade de entrega (UAZAPI falha -> 400, nunca sent:true),
 * signup gate só para telefone novo, resposta indistinguível para telefone
 * não cadastrado, consumo atômico, phoneVerified na primeira verificação e
 * o caminho completo de login com cookies. sendWhatsAppOTP mockado (UAZAPI).
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'
process.env.JWT_REFRESH_SECRET = 'orpc-spike-test-refresh-0123456789-abcdefgh'
process.env.JWT_2FA_CHALLENGE_SECRET = 'orpc-spike-test-2fa-chall-0123456789-abcde'

vi.mock('@/server/services/database', () => ({
  database: {
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    customRole: { findUnique: vi.fn() },
    verificationCode: { deleteMany: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    refreshToken: { create: vi.fn(), update: vi.fn() },
    deviceSession: { create: vi.fn(), findMany: vi.fn() },
    notification: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('@/server/services/redis', () => ({ getRedis: vi.fn() }))
vi.mock('@/lib/geocoding/ip-geolocation', () => ({
  getIpGeolocation: vi.fn().mockResolvedValue({ countryCode: 'XX', country: 'Unknown', city: null }),
}))
vi.mock('@/lib/uaz/whatsapp-otp', () => ({
  normalizePhone: vi.fn((p: string) => p.replace(/\D/g, '')),
  sendWhatsAppOTP: vi.fn(),
}))

import { database } from '@/server/services/database'
import { sendWhatsAppOTP } from '@/lib/uaz/whatsapp-otp'
import { POST } from '@/app/api/orpc/[[...rest]]/route'

const db = database as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const sendOtp = sendWhatsAppOTP as unknown as ReturnType<typeof vi.fn>

const BASE = 'http://localhost:3000/api/orpc'
const CSRF = 'csrf-token-de-teste-0123456789'
const PHONE = '+55 (11) 91234-5678'
const NORMALIZED = '5511912345678'

function phoneUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'u@example.com',
    name: 'Usuária',
    isActive: true,
    role: 'user',
    currentOrgId: 'org-1',
    onboardingCompleted: true,
    twoFactorEnabled: false,
    phoneVerified: true,
    preferences: null,
    organizations: [
      { organizationId: 'org-1', role: 'owner', isActive: true, organization: { id: 'org-1' } },
    ],
    ...overrides,
  }
}

function post(path: string, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  })
}

function csrfHeaders(): Record<string, string> {
  return { 'x-csrf-token': CSRF, cookie: `csrf_token=${CSRF}` }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.deviceSession.findMany.mockResolvedValue([])
  db.deviceSession.create.mockResolvedValue({})
  db.refreshToken.create.mockResolvedValue({ id: 'rt-1' })
  db.refreshToken.update.mockResolvedValue({})
})

describe('oRPC — POST /auth/login-otp-phone', () => {
  it('envia OTP via WhatsApp (UAZAPI) com delete+create do código', async () => {
    db.user.findFirst.mockResolvedValue(phoneUser())
    db.verificationCode.deleteMany.mockResolvedValue({})
    db.verificationCode.create.mockResolvedValue({})
    sendOtp.mockResolvedValue(true)

    const res = await POST(post('/auth/login-otp-phone', { phone: PHONE }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { sent: true }, error: null })

    // Um código ativo por telefone: apaga os anteriores antes de criar
    expect(db.verificationCode.deleteMany).toHaveBeenCalledWith({
      where: { identifier: NORMALIZED, type: 'WHATSAPP_OTP' },
    })
    expect(sendOtp).toHaveBeenCalledWith(NORMALIZED, expect.any(String))
  })

  it('falha da UAZAPI responde 400 — nunca um sent:true mentiroso', async () => {
    db.user.findFirst.mockResolvedValue(phoneUser())
    db.verificationCode.deleteMany.mockResolvedValue({})
    db.verificationCode.create.mockResolvedValue({})
    sendOtp.mockResolvedValue(false)

    const res = await POST(post('/auth/login-otp-phone', { phone: PHONE }))

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('Não foi possível enviar o código')
  })

  it('bloqueia com 400 quando 2FA ativo e OTP por telefone desabilitado', async () => {
    db.user.findFirst.mockResolvedValue(
      phoneUser({ twoFactorEnabled: true, preferences: { otpPhoneDisabled: true } }),
    )

    const res = await POST(post('/auth/login-otp-phone', { phone: PHONE }))

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('OTP por telefone desabilitado')
    expect(sendOtp).not.toHaveBeenCalled()
  })
})

describe('oRPC — POST /auth/verify-login-otp-phone', () => {
  it('exige CSRF (403)', async () => {
    const res = await POST(post('/auth/verify-login-otp-phone', { phone: PHONE, code: '123456' }))
    expect(res.status).toBe(403)
  })

  it('telefone não cadastrado responde o mesmo "Código inválido" (não vaza)', async () => {
    db.user.findFirst.mockResolvedValue(null)

    const res = await POST(
      post('/auth/verify-login-otp-phone', { phone: PHONE, code: '123456' }, csrfHeaders()),
    )

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('Código inválido')
    expect(db.verificationCode.updateMany).not.toHaveBeenCalled()
  })

  it('sucesso: consome, marca phoneVerified na 1ª vez e emite sessão', async () => {
    db.user.findFirst.mockResolvedValue(phoneUser({ phoneVerified: false }))
    db.verificationCode.updateMany.mockResolvedValue({ count: 1 })
    db.user.update.mockResolvedValue({})

    const res = await POST(
      post('/auth/verify-login-otp-phone', { phone: PHONE, code: '123456' }, csrfHeaders()),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      user: expect.objectContaining({ id: 'user-1', organizationRole: 'owner' }),
    })

    expect(db.verificationCode.updateMany).toHaveBeenCalledWith({
      where: {
        identifier: NORMALIZED,
        code: '123456',
        type: 'WHATSAPP_OTP',
        used: false,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { used: true },
    })
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { phoneVerified: true },
    })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(true)

    const auditActions = db.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    )
    expect(auditActions).toEqual(expect.arrayContaining(['user.login', 'auth.login']))
  })

  it('usuário com 2FA recebe challenge sem sessão', async () => {
    db.user.findFirst.mockResolvedValue(phoneUser({ twoFactorEnabled: true }))
    db.verificationCode.updateMany.mockResolvedValue({ count: 1 })

    const res = await POST(
      post('/auth/verify-login-otp-phone', { phone: PHONE, code: '123456' }, csrfHeaders()),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({ requiresTwoFactor: true, challengeId: expect.any(String) })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(false)
  })
})
