/**
 * Auth/Magic-Link (oRPC) — teste in-process do lote 3a.
 *
 * Cobre o binding C-3 do polling (mlpoll + SHA-256 timing-safe), os estados
 * do polling (pendente/expirado/verificado), o gate 2FA da aba original e o
 * verifyMagicLink com JWT REAL (consumo atômico + login path completo).
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'crypto'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'
process.env.JWT_REFRESH_SECRET = 'orpc-spike-test-refresh-0123456789-abcdefgh'
process.env.JWT_MAGIC_LINK_SECRET = 'orpc-spike-test-magiclink-0123456789-abcde'
process.env.JWT_2FA_CHALLENGE_SECRET = 'orpc-spike-test-2fa-chall-0123456789-abcde'

vi.mock('@/server/services/database', () => ({
  database: {
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
    customRole: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn(), create: vi.fn() },
    tempUser: { findUnique: vi.fn(), delete: vi.fn() },
    verificationCode: { findUnique: vi.fn(), updateMany: vi.fn() },
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
import { signMagicLinkToken } from '@/lib/auth/jwt'
import { POST } from '@/app/api/orpc/[[...rest]]/route'

const db = database as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>

const BASE = 'http://localhost:3000/api/orpc'
const MLPOLL_SECRET = 'segredo-polling-0123456789abcdef'
const MLPOLL_HASH = crypto.createHash('sha256').update(MLPOLL_SECRET).digest('hex')

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
    organizations: [
      { organizationId: 'org-1', role: 'owner', isActive: true, organization: { id: 'org-1' } },
    ],
    ...overrides,
  }
}

function post(path: string, body: unknown, cookie?: string) {
  return new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  db.verifiedDomain.findMany.mockResolvedValue([])
  db.deviceSession.findMany.mockResolvedValue([])
  db.deviceSession.create.mockResolvedValue({})
  db.refreshToken.create.mockResolvedValue({ id: 'rt-1' })
  db.refreshToken.update.mockResolvedValue({})
})

describe('oRPC — POST /auth/check-magic-link-status', () => {
  it('403 sem o cookie mlpoll (binding de aba)', async () => {
    const res = await POST(post('/auth/check-magic-link-status', { sessionId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b31' }))
    expect(res.status).toBe(403)
    expect(db.verificationCode.findUnique).not.toHaveBeenCalled()
  })

  it('segredo errado responde 403 (timing-safe contra o hash)', async () => {
    db.verificationCode.findUnique.mockResolvedValue({
      id: 'vc-1',
      token: MLPOLL_HASH,
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
      identifier: 'u@example.com',
    })

    const res = await POST(
      post('/auth/check-magic-link-status', { sessionId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b31' }, 'mlpoll=segredo-errado'),
    )
    expect(res.status).toBe(403)
  })

  it('ainda não clicado -> { verified: false, expired: false }', async () => {
    db.verificationCode.findUnique.mockResolvedValue({
      id: 'vc-1',
      token: MLPOLL_HASH,
      used: false,
      expiresAt: new Date(Date.now() + 60_000),
      identifier: 'u@example.com',
    })

    const res = await POST(
      post('/auth/check-magic-link-status', { sessionId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b31' }, `mlpoll=${MLPOLL_SECRET}`),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { verified: false, expired: false }, error: null })
  })

  it('verificado em outra aba -> autentica esta aba com cookies + shape completo', async () => {
    db.verificationCode.findUnique.mockResolvedValue({
      id: 'vc-1',
      token: MLPOLL_HASH,
      used: true,
      expiresAt: new Date(Date.now() + 60_000),
      identifier: 'u@example.com',
    })
    db.user.findUnique.mockResolvedValue(knownUser())

    const res = await POST(
      post('/auth/check-magic-link-status', { sessionId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b31' }, `mlpoll=${MLPOLL_SECRET}`),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      verified: true,
      redirectPath: '/',
      user: expect.objectContaining({ id: 'user-1', organizationRole: 'owner' }),
    })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(true)
  })

  it('2FA ativo -> challenge em vez de sessão (aba original não contorna 2FA)', async () => {
    db.verificationCode.findUnique.mockResolvedValue({
      id: 'vc-1',
      token: MLPOLL_HASH,
      used: true,
      expiresAt: new Date(Date.now() + 60_000),
      identifier: 'u@example.com',
    })
    db.user.findUnique.mockResolvedValue(knownUser({ twoFactorEnabled: true }))

    const res = await POST(
      post('/auth/check-magic-link-status', { sessionId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b31' }, `mlpoll=${MLPOLL_SECRET}`),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      verified: true,
      requiresTwoFactor: true,
      challengeId: expect.any(String),
    })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(false)
  })
})

describe('oRPC — POST /auth/verify-magic-link', () => {
  it('token inválido responde 400', async () => {
    const res = await POST(post('/auth/verify-magic-link', { token: 'jwt-invalido' }))
    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('Invalid or expired magic link')
  })

  it('login path: consome atômico, emite sessão e audita auth.login', async () => {
    const token = signMagicLinkToken({ email: 'u@example.com', tokenId: 'vc-9', type: 'login' })
    db.verificationCode.updateMany.mockResolvedValue({ count: 1 })
    db.user.findUnique.mockResolvedValue(knownUser())

    const res = await POST(post('/auth/verify-magic-link', { token }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      needsOnboarding: false,
      user: expect.objectContaining({ id: 'user-1', organizationRole: 'owner' }),
    })

    // Consumo atômico pelo tokenId do JWT
    expect(db.verificationCode.updateMany).toHaveBeenCalledWith({
      where: { id: 'vc-9', used: false, expiresAt: { gt: expect.any(Date) } },
      data: { used: true },
    })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(true)

    const auditActions = db.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    )
    expect(auditActions).toContain('auth.login')
  })

  it('link já usado responde 400 sem emitir sessão', async () => {
    const token = signMagicLinkToken({ email: 'u@example.com', tokenId: 'vc-9', type: 'login' })
    db.verificationCode.updateMany.mockResolvedValue({ count: 0 })
    db.verificationCode.findUnique.mockResolvedValue({
      used: true,
      expiresAt: new Date(Date.now() + 60_000),
    })

    const res = await POST(post('/auth/verify-magic-link', { token }))

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('Magic link already used or expired')
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(false)
  })

  it('signup path: cria org + user master a partir do TempUser', async () => {
    const token = signMagicLinkToken({
      email: 'novo@example.com',
      tokenId: 'vc-s9',
      type: 'signup',
      name: 'Novo User',
    })
    db.verificationCode.updateMany.mockResolvedValue({ count: 1 })
    db.user.findUnique.mockResolvedValue(null)
    db.tempUser.findUnique.mockResolvedValue({
      email: 'novo@example.com',
      name: 'Novo User',
      code: '123456',
      expiresAt: new Date(Date.now() + 60_000),
    })
    db.user.count.mockResolvedValue(3)
    db.organization.create.mockResolvedValue({ id: 'org-9' })
    db.user.create.mockResolvedValue({
      id: 'user-9',
      email: 'novo@example.com',
      name: 'Novo User',
      role: 'user',
      onboardingCompleted: true,
    })
    db.tempUser.delete.mockResolvedValue({})

    const res = await POST(post('/auth/verify-magic-link', { token }))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      user: expect.objectContaining({
        id: 'user-9',
        currentOrgId: 'org-9',
        organizationRole: 'master',
      }),
    })
    expect(db.tempUser.delete).toHaveBeenCalledWith({ where: { email: 'novo@example.com' } })
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(true)
  })
})
