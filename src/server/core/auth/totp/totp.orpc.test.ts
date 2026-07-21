/**
 * Auth/TOTP (oRPC) — teste in-process do lote 4c.
 *
 * Criptografia REAL de ponta a ponta: o secret vai criptografado ao banco
 * (AES via @/lib/crypto), os códigos TOTP dos testes são gerados com otpauth
 * contra o MESMO secret, e os recovery/email codes usam bcrypt real.
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as OTPAuth from 'otpauth'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'
process.env.JWT_REFRESH_SECRET = 'orpc-spike-test-refresh-0123456789-abcdefgh'
process.env.JWT_2FA_CHALLENGE_SECRET = 'orpc-spike-test-2fa-chall-0123456789-abcde'
process.env.ENCRYPTION_KEY = 'orpc-totp-test-encryption-key-32chars-ok'

vi.mock('@/server/services/database', () => ({
  database: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    customRole: { findUnique: vi.fn() },
    totpDevice: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    recoveryCode: {
      count: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    verificationCode: { create: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
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
vi.mock('@/lib/email', () => ({
  emailService: {
    send: vi.fn().mockResolvedValue(undefined),
    sendLoginCodeEmail: vi.fn(),
    sendWelcomeSignupEmail: vi.fn(),
    sendWelcomeEmail: vi.fn(),
  },
}))

import { database } from '@/server/services/database'
import { emailService } from '@/lib/email'
import { encrypt } from '@/lib/crypto'
import { hashPassword } from '@/lib/auth/bcrypt'
import { sign2faChallenge } from '@/server/core/auth/_shared/helpers'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST } from '@/orpc/serve'

const db = database as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const email = emailService as unknown as Record<string, ReturnType<typeof vi.fn>>

const BASE = 'http://localhost:3000/api/v1'
const CSRF = 'csrf-token-de-teste-0123456789'

// Secret TOTP compartilhado pelos testes; no "banco" fica criptografado.
const TOTP_SECRET = new OTPAuth.Secret({ size: 20 })
const ENCRYPTED_SECRET = encrypt(TOTP_SECRET.base32)

function currentTotpCode(): string {
  return new OTPAuth.TOTP({
    issuer: 'Quayer',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: TOTP_SECRET,
  }).generate()
}

function authedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'u@example.com',
    name: 'Usuária',
    isActive: true,
    role: 'user',
    currentOrgId: 'org-1',
    onboardingCompleted: true,
    twoFactorEnabled: true,
    organizations: [
      { organizationId: 'org-1', role: 'owner', isActive: true, organization: { id: 'org-1' } },
    ],
    ...overrides,
  }
}

function bearer(): string {
  const token = signAccessToken({
    userId: 'user-1',
    email: 'u@example.com',
    role: 'user',
    currentOrgId: 'org-1',
  } as Parameters<typeof signAccessToken>[0])
  return `Bearer ${token}`
}

function csrfHeaders(): Record<string, string> {
  return {
    authorization: bearer(),
    'content-type': 'application/json',
    'x-csrf-token': CSRF,
    cookie: `csrf_token=${CSRF}`,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.deviceSession.findMany.mockResolvedValue([])
  db.deviceSession.create.mockResolvedValue({})
  db.refreshToken.create.mockResolvedValue({ id: 'rt-1' })
  db.refreshToken.update.mockResolvedValue({})
})

describe('oRPC — POST /auth/totp/setup', () => {
  it('cria device pendente com secret CRIPTOGRAFADO e responde QR + chave manual', async () => {
    db.user.findUnique.mockResolvedValue(authedUser({ twoFactorEnabled: false }))
    db.totpDevice.create.mockResolvedValue({ id: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b41' })

    const res = await POST(
      new Request(`${BASE}/auth/totp/setup`, { method: 'POST', headers: csrfHeaders() }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, string> }
    expect(body.data.qrCode).toMatch(/^data:image\/png;base64,/)
    expect(body.data.otpauthUrl).toContain('otpauth://totp/')
    expect(body.data.manualEntryKey).toMatch(/^[A-Z2-7]+$/)

    // O secret persistido NUNCA é o base32 puro
    const createArg = db.totpDevice.create.mock.calls[0][0] as { data: { secret: string } }
    expect(createArg.data.secret).not.toBe(body.data.manualEntryKey)
    expect(createArg.data.secret.length).toBeGreaterThan(32)
  })
})

describe('oRPC — POST /auth/totp/verify (ativação)', () => {
  it('código válido ativa o device, liga o 2FA e retorna 8 recovery codes', async () => {
    db.user.findUnique.mockResolvedValue(authedUser({ twoFactorEnabled: false }))
    db.totpDevice.findFirst.mockResolvedValue({ id: 'dev-1', secret: ENCRYPTED_SECRET })
    db.totpDevice.update.mockResolvedValue({})
    db.user.update.mockResolvedValue({})
    db.recoveryCode.deleteMany.mockResolvedValue({})
    db.recoveryCode.createMany.mockResolvedValue({})

    const res = await POST(
      new Request(`${BASE}/auth/totp/verify`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({
          code: currentTotpCode(),
          deviceId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b41',
        }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { recoveryCodes: string[] } }
    expect(body.data.recoveryCodes).toHaveLength(8)

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { twoFactorEnabled: true },
    })
    // Recovery codes vão HASHEADOS ao banco
    const createManyArg = db.recoveryCode.createMany.mock.calls[0][0] as {
      data: Array<{ code: string }>
    }
    expect(createManyArg.data).toHaveLength(8)
    expect(createManyArg.data[0].code).not.toBe(body.data.recoveryCodes[0])
  })

  it('código inválido responde 400 sem ativar', async () => {
    db.user.findUnique.mockResolvedValue(authedUser({ twoFactorEnabled: false }))
    db.totpDevice.findFirst.mockResolvedValue({ id: 'dev-1', secret: ENCRYPTED_SECRET })

    const res = await POST(
      new Request(`${BASE}/auth/totp/verify`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({
          code: '000000',
          deviceId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b41',
        }),
      }),
    )

    expect(res.status).toBe(400)
    expect(db.user.update).not.toHaveBeenCalled()
  })
})

describe('oRPC — GET /auth/totp/devices', () => {
  it('lista devices ativos + contagem de recovery codes restantes', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.totpDevice.findMany.mockResolvedValue([{ id: 'dev-1', name: 'App', createdAt: new Date() }])
    db.recoveryCode.count.mockResolvedValue(6)

    const res = await GET(
      new Request(`${BASE}/auth/totp/devices`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      twoFactorEnabled: true,
      recoveryCodesRemaining: 6,
    })
  })
})

describe('oRPC — POST /auth/2fa/verify (login 2º fator)', () => {
  it('challenge inválido responde 401', async () => {
    const res = await POST(
      new Request(`${BASE}/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, cookie: `csrf_token=${CSRF}` },
        body: JSON.stringify({ challengeId: 'challenge-falso', code: '123456' }),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('TOTP válido completa o login com sessão e audit totp-2fa', async () => {
    const challengeId = sign2faChallenge('user-1')
    db.user.findUnique.mockResolvedValue(authedUser())
    db.totpDevice.findFirst.mockResolvedValue({ id: 'dev-1', secret: ENCRYPTED_SECRET })

    const res = await POST(
      new Request(`${BASE}/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, cookie: `csrf_token=${CSRF}` },
        body: JSON.stringify({ challengeId, code: currentTotpCode() }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      user: expect.objectContaining({ id: 'user-1', organizationRole: 'owner' }),
    })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(true)

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'auth.login',
        metadata: { method: 'totp-2fa', usedRecoveryCode: false },
      }),
    })
  })

  it('recovery code válido autentica e é marcado como usado (one-time)', async () => {
    const challengeId = sign2faChallenge('user-1')
    const recovery = 'ABCD123456'
    db.user.findUnique.mockResolvedValue(authedUser())
    db.totpDevice.findFirst.mockResolvedValue({ id: 'dev-1', secret: ENCRYPTED_SECRET })
    db.recoveryCode.findMany.mockResolvedValue([
      { id: 'rc-1', code: await hashPassword(recovery) },
    ])
    db.recoveryCode.update.mockResolvedValue({})

    const res = await POST(
      new Request(`${BASE}/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, cookie: `csrf_token=${CSRF}` },
        body: JSON.stringify({ challengeId, code: recovery }),
      }),
    )

    expect(res.status).toBe(200)
    expect(db.recoveryCode.update).toHaveBeenCalledWith({
      where: { id: 'rc-1' },
      data: { usedAt: expect.any(Date) },
    })
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: { method: 'totp-2fa', usedRecoveryCode: true },
      }),
    })
  })

  it('código errado responde 401 (e não emite sessão)', async () => {
    const challengeId = sign2faChallenge('user-1')
    db.user.findUnique.mockResolvedValue(authedUser())
    db.totpDevice.findFirst.mockResolvedValue({ id: 'dev-1', secret: ENCRYPTED_SECRET })
    db.recoveryCode.findMany.mockResolvedValue([])

    const res = await POST(
      new Request(`${BASE}/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': CSRF, cookie: `csrf_token=${CSRF}` },
        body: JSON.stringify({ challengeId, code: '000000' }),
      }),
    )

    expect(res.status).toBe(401)
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(false)
  })
})

describe('oRPC — desativação em dois fatores', () => {
  it('disable-request exige TOTP válido antes de enviar o email', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.totpDevice.findFirst.mockResolvedValue({ id: 'dev-1', secret: ENCRYPTED_SECRET })

    const res = await POST(
      new Request(`${BASE}/auth/totp/disable-request`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ totpCode: '000000' }),
      }),
    )

    expect(res.status).toBe(400)
    expect(email.send).not.toHaveBeenCalled()
  })

  it('disable com email code + TOTP válidos desativa e limpa tudo', async () => {
    const emailCode = '654321'
    db.user.findUnique.mockResolvedValue(authedUser())
    db.verificationCode.findFirst.mockResolvedValue({
      id: 'vc-1',
      code: await hashPassword(emailCode),
      expiresAt: new Date(Date.now() + 60_000),
    })
    db.totpDevice.findFirst.mockResolvedValue({ id: 'dev-1', secret: ENCRYPTED_SECRET })
    db.totpDevice.deleteMany.mockResolvedValue({})
    db.recoveryCode.deleteMany.mockResolvedValue({})
    db.verificationCode.updateMany.mockResolvedValue({})
    db.user.update.mockResolvedValue({})

    const res = await POST(
      new Request(`${BASE}/auth/totp/disable`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ emailCode, totpCode: currentTotpCode() }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { message: '2FA disabled successfully' }, error: null })
    expect(db.totpDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(db.recoveryCode.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { twoFactorEnabled: false },
    })
  })
})
