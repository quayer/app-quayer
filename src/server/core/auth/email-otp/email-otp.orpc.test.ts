/**
 * Auth/Email-OTP (oRPC) — teste in-process do lote 2.
 *
 * Cobre os dois branches do loginOTP (signup automático p/ email novo e
 * login p/ conhecido, ambos com cookie mlpoll), o gate OTP_EMAIL_DISABLED,
 * CSRF nas verificações, o caminho completo do verifyLoginOTP (consumo
 * atômico + finalizeLogin com cookies reais + audit), o gate 2FA, a
 * resposta enumeração-safe do signupOTP e a criação de org+user do
 * verifySignupOTP.
 *
 * JWT/CSRF/finalizeLogin/issueSession REAIS; Prisma/redis/geo/email mockados.
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'
process.env.JWT_REFRESH_SECRET = 'orpc-spike-test-refresh-0123456789-abcdefgh'
process.env.JWT_MAGIC_LINK_SECRET = 'orpc-spike-test-magiclink-0123456789-abcde'
process.env.JWT_2FA_CHALLENGE_SECRET = 'orpc-spike-test-2fa-chall-0123456789-abcde'

vi.mock('@/server/services/database', () => ({
  database: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    customRole: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn(), create: vi.fn() },
    tempUser: { upsert: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
    verificationCode: { create: vi.fn(), updateMany: vi.fn() },
    refreshToken: { create: vi.fn(), update: vi.fn() },
    deviceSession: { create: vi.fn(), findMany: vi.fn() },
    notification: { create: vi.fn() },
    verifiedDomain: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('@/server/services/redis', () => ({ getRedis: vi.fn() }))
vi.mock('@/lib/geocoding/ip-geolocation', () => ({
  getIpGeolocation: vi.fn().mockResolvedValue({ countryCode: 'XX', country: 'Unknown', city: null }),
}))
vi.mock('@/lib/email', () => ({
  emailService: {
    sendLoginCodeEmail: vi.fn().mockResolvedValue(undefined),
    sendWelcomeSignupEmail: vi.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  },
}))

import { database } from '@/server/services/database'
import { emailService } from '@/lib/email'
import { POST } from '@/orpc/serve'

const db = database as unknown as Record<
  string,
  Record<string, ReturnType<typeof vi.fn>>
>
const email = emailService as unknown as Record<string, ReturnType<typeof vi.fn>>

const BASE = 'http://localhost:3000/api/v1'
const CSRF = 'csrf-token-de-teste-0123456789'

function knownUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'u@example.com',
    name: 'Usuária',
    isActive: true,
    role: 'user',
    currentOrgId: 'org-1',
    onboardingCompleted: true,
    twoFactorEnabled: false,
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
  db.verifiedDomain.findMany.mockResolvedValue([])
  db.deviceSession.findMany.mockResolvedValue([])
  db.refreshToken.create.mockResolvedValue({ id: 'rt-1' })
  db.refreshToken.update.mockResolvedValue({})
})

describe('oRPC — POST /auth/login-otp', () => {
  it('email desconhecido entra no branch de signup automático (cookie mlpoll + isNewUser)', async () => {
    db.user.findUnique.mockResolvedValue(null)
    db.tempUser.upsert.mockResolvedValue({})
    db.verificationCode.create.mockResolvedValue({ id: 'vc-signup-1' })

    const res = await POST(post('/auth/login-otp', { email: 'novo@example.com' }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown>; error: null }
    expect(body.data).toMatchObject({
      sent: true,
      isNewUser: true,
      magicLinkSessionId: 'vc-signup-1',
    })

    expect(db.tempUser.upsert).toHaveBeenCalled()
    expect(email.sendWelcomeSignupEmail).toHaveBeenCalled()

    const mlpoll = res.headers.getSetCookie().find((c) => c.startsWith('mlpoll='))
    expect(mlpoll).toBeDefined()
    expect(mlpoll).toContain('Path=/api/v1/auth/check-magic-link-status')
    expect(mlpoll).toContain('Max-Age=600')
    expect(mlpoll).toContain('HttpOnly')
  })

  it('email conhecido recebe código de login (cookie mlpoll + magicLinkSessionId)', async () => {
    db.user.findUnique.mockResolvedValue(knownUser())
    db.verificationCode.create.mockResolvedValue({ id: 'vc-login-1' })

    const res = await POST(post('/auth/login-otp', { email: 'u@example.com' }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({ sent: true, magicLinkSessionId: 'vc-login-1' })
    expect(body.data.isNewUser).toBeUndefined()

    expect(email.sendLoginCodeEmail).toHaveBeenCalledWith(
      'u@example.com',
      'Usuária',
      expect.any(String),
      expect.stringContaining('/login/verify-magic?token='),
      10,
    )
    expect(res.headers.getSetCookie().some((c) => c.startsWith('mlpoll='))).toBe(true)
  })

  it('nega com 403 OTP_EMAIL_DISABLED quando 2FA ativo e OTP por email desativado', async () => {
    db.user.findUnique.mockResolvedValue(
      knownUser({ twoFactorEnabled: true, preferences: { otpEmailDisabled: true } }),
    )

    const res = await POST(post('/auth/login-otp', { email: 'u@example.com' }))

    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).toContain('OTP_EMAIL_DISABLED')
    expect(db.verificationCode.create).not.toHaveBeenCalled()
  })
})

describe('oRPC — POST /auth/verify-login-otp', () => {
  it('exige CSRF (403 sem o par double-submit)', async () => {
    const res = await POST(
      post('/auth/verify-login-otp', { email: 'u@example.com', code: '123456' }),
    )
    expect(res.status).toBe(403)
    expect(db.user.findUnique).not.toHaveBeenCalled()
  })

  it('código errado responde 400 (consumo atômico count=0)', async () => {
    db.user.findUnique.mockResolvedValue(knownUser())
    db.verificationCode.updateMany.mockResolvedValue({ count: 0 })

    const res = await POST(
      post('/auth/verify-login-otp', { email: 'u@example.com', code: '000000' }, csrfHeaders()),
    )

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('Invalid or expired code')
  })

  it('sucesso: consome o código, emite sessão com cookies e grava os 2 audits', async () => {
    db.user.findUnique.mockResolvedValue(knownUser())
    db.verificationCode.updateMany.mockResolvedValue({ count: 1 })
    db.deviceSession.create.mockResolvedValue({})

    const res = await POST(
      post('/auth/verify-login-otp', { email: 'u@example.com', code: '123456' }, csrfHeaders()),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown>; error: null }
    expect(body.data).toMatchObject({
      needsOnboarding: false,
      user: expect.objectContaining({
        id: 'user-1',
        email: 'u@example.com',
        currentOrgId: 'org-1',
        organizationRole: 'owner',
      }),
    })

    // Sessão completa: accessToken + refreshToken + rotação de CSRF
    const cookies = res.headers.getSetCookie()
    expect(cookies.some((c) => c.startsWith('accessToken='))).toBe(true)
    expect(cookies.some((c) => c.startsWith('refreshToken='))).toBe(true)
    expect(cookies.some((c) => c.startsWith('csrf_token='))).toBe(true)

    // Audit em dobro (user.login + auth.login), como no original
    const auditActions = db.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    )
    expect(auditActions).toEqual(expect.arrayContaining(['user.login', 'auth.login']))
  })

  it('usuário com 2FA recebe challenge em vez de sessão', async () => {
    db.user.findUnique.mockResolvedValue(knownUser({ twoFactorEnabled: true }))
    db.verificationCode.updateMany.mockResolvedValue({ count: 1 })

    const res = await POST(
      post('/auth/verify-login-otp', { email: 'u@example.com', code: '123456' }, csrfHeaders()),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      requiresTwoFactor: true,
      challengeId: expect.any(String),
      user: { id: 'user-1', email: 'u@example.com' },
    })
    // Sessão NÃO emitida antes do 2º fator
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(false)
  })
})

describe('oRPC — POST /auth/signup-otp', () => {
  it('email já cadastrado responde enumeração-safe sem enviar email', async () => {
    db.user.findUnique.mockResolvedValue(knownUser())

    const res = await POST(
      post('/auth/signup-otp', { email: 'u@example.com', name: 'Usuária' }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { sent: boolean; message: string } }
    expect(body.data.sent).toBe(true)
    expect(body.data.message).toContain('Se este email não estiver cadastrado')
    expect(email.sendWelcomeSignupEmail).not.toHaveBeenCalled()
  })

  it('email novo cria TempUser + VerificationCode e envia welcome', async () => {
    db.user.findUnique.mockResolvedValue(null)
    db.tempUser.upsert.mockResolvedValue({})
    db.verificationCode.create.mockResolvedValue({ id: 'vc-s1' })

    const res = await POST(
      post('/auth/signup-otp', { email: 'novo@example.com', name: 'Novo User' }),
    )

    expect(res.status).toBe(200)
    expect(db.tempUser.upsert).toHaveBeenCalled()
    expect(email.sendWelcomeSignupEmail).toHaveBeenCalledWith(
      'novo@example.com',
      'Novo User',
      expect.any(String),
      expect.stringContaining('/signup/verify-magic?token='),
      10,
    )
  })
})

describe('oRPC — POST /auth/verify-signup-otp', () => {
  it('cria organização + usuário master e emite sessão completa', async () => {
    db.tempUser.findUnique.mockResolvedValue({
      email: 'novo@example.com',
      name: 'Novo User',
      code: '123456',
      expiresAt: new Date(Date.now() + 60_000),
    })
    db.user.findUnique.mockResolvedValue(null)
    db.user.count.mockResolvedValue(5)
    db.organization.create.mockResolvedValue({ id: 'org-9' })
    db.user.create.mockResolvedValue({
      id: 'user-9',
      email: 'novo@example.com',
      name: 'Novo User',
      role: 'user',
      onboardingCompleted: true,
    })
    db.tempUser.delete.mockResolvedValue({})

    const res = await POST(
      post('/auth/verify-signup-otp', { email: 'novo@example.com', code: '123456' }, csrfHeaders()),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      user: expect.objectContaining({
        id: 'user-9',
        currentOrgId: 'org-9',
        organizationRole: 'master',
      }),
    })

    // user não é o 1º -> role user; vínculo master com a org criada
    const createArg = db.user.create.mock.calls[0][0] as {
      data: { role: string; organizations: { create: { role: string } } }
    }
    expect(createArg.data.role).toBe('user')
    expect(createArg.data.organizations.create.role).toBe('master')

    expect(db.tempUser.delete).toHaveBeenCalledWith({ where: { email: 'novo@example.com' } })
    expect(email.sendWelcomeEmail).toHaveBeenCalled()
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(true)

    const auditActions = db.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    )
    expect(auditActions).toEqual(expect.arrayContaining(['user.signup', 'auth.signup']))
  })

  it('código inválido responde 400', async () => {
    db.tempUser.findUnique.mockResolvedValue({
      email: 'novo@example.com',
      name: 'Novo User',
      code: '999999',
      expiresAt: new Date(Date.now() + 60_000),
    })

    const res = await POST(
      post('/auth/verify-signup-otp', { email: 'novo@example.com', code: '123456' }, csrfHeaders()),
    )

    expect(res.status).toBe(400)
    expect(db.organization.create).not.toHaveBeenCalled()
  })
})

describe('oRPC — POST /auth/verify-email', () => {
  it('email já verificado responde 400', async () => {
    db.user.findUnique.mockResolvedValue(knownUser({ emailVerified: new Date() }))

    const res = await POST(
      post('/auth/verify-email', { email: 'u@example.com', code: '123456' }, csrfHeaders()),
    )

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('Email already verified')
  })

  it('sucesso: marca verificado, emite sessão 30d e audita', async () => {
    db.user.findUnique.mockResolvedValue(knownUser({ emailVerified: null }))
    db.verificationCode.updateMany.mockResolvedValue({ count: 1 })
    db.user.update.mockResolvedValue({})

    const res = await POST(
      post('/auth/verify-email', { email: 'u@example.com', code: '123456' }, csrfHeaders()),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({ verified: true, user: expect.objectContaining({ id: 'user-1' }) })

    expect(db.user.update).toHaveBeenCalledWith({
      where: { email: 'u@example.com' },
      data: { emailVerified: expect.any(Date) },
    })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(true)
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'user.email_verified', userId: 'user-1' }),
    })
  })
})
