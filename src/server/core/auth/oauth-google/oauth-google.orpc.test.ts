/**
 * Auth/OAuth-Google (oRPC) — teste in-process do lote 3b.
 *
 * Cobre: state CSRF (cookie gravado no init, mismatch 403, invalidação
 * one-shot), email não verificado, login path (userIdentity.upsert +
 * finalizeLogin + cookies) e signup path (org + user master + audits).
 * O módulo @/lib/auth/google-oauth é mockado (chamadas externas ao Google).
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
    user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn() },
    customRole: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn(), create: vi.fn() },
    userIdentity: { upsert: vi.fn() },
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
    sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
    sendLoginCodeEmail: vi.fn(),
    sendWelcomeSignupEmail: vi.fn(),
  },
}))
vi.mock('@/lib/auth/google-oauth', () => ({
  getGoogleAuthUrl: vi.fn(
    (state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  ),
  getGoogleTokens: vi.fn(),
  getGoogleUserInfo: vi.fn(),
}))

import { database } from '@/server/services/database'
import { getGoogleTokens, getGoogleUserInfo } from '@/lib/auth/google-oauth'
import { emailService } from '@/lib/email'
import { GET, POST } from '@/app/api/orpc/[[...rest]]/route'

const db = database as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const googleTokens = getGoogleTokens as unknown as ReturnType<typeof vi.fn>
const googleUserInfo = getGoogleUserInfo as unknown as ReturnType<typeof vi.fn>
const email = emailService as unknown as Record<string, ReturnType<typeof vi.fn>>

const BASE = 'http://localhost:3000/api/orpc'
const STATE = 'a'.repeat(64)

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
    ...overrides,
  }
}

function callback(body: Record<string, unknown>, cookieState = STATE) {
  return new Request(`${BASE}/auth/google/callback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `oauth_google_state=${cookieState}`,
    },
    body: JSON.stringify({ code: 'auth-code-1', state: STATE, ...body }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  db.verifiedDomain.findMany.mockResolvedValue([])
  db.deviceSession.findMany.mockResolvedValue([])
  db.deviceSession.create.mockResolvedValue({})
  db.refreshToken.create.mockResolvedValue({ id: 'rt-1' })
  db.refreshToken.update.mockResolvedValue({})
  db.userIdentity.upsert.mockResolvedValue({})
})

describe('oRPC — GET /auth/google (init)', () => {
  it('responde authUrl com o state e grava o cookie oauth_google_state', async () => {
    const res = await GET(new Request(`${BASE}/auth/google`))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { authUrl: string }; error: null }
    expect(body.data.authUrl).toContain('accounts.google.com')

    const stateInUrl = new URL(body.data.authUrl).searchParams.get('state')
    expect(stateInUrl).toMatch(/^[0-9a-f]{64}$/)

    const stateCookie = res.headers.getSetCookie().find((c) => c.startsWith('oauth_google_state='))
    expect(stateCookie).toBeDefined()
    expect(stateCookie).toContain(`oauth_google_state=${stateInUrl}`)
    expect(stateCookie).toContain('HttpOnly')
    expect(stateCookie).toContain('Max-Age=600')
    expect(stateCookie).toContain('SameSite=Lax')
  })
})

describe('oRPC — POST /auth/google/callback', () => {
  it('state divergente do cookie responde 403 (Login-CSRF)', async () => {
    const res = await POST(callback({}, 'b'.repeat(64)))

    expect(res.status).toBe(403)
    expect(JSON.stringify(await res.json())).toContain('Invalid OAuth state')
    expect(googleTokens).not.toHaveBeenCalled()
  })

  it('email não verificado (consumer) responde 400', async () => {
    googleTokens.mockResolvedValue({ access_token: 'gat-1' })
    googleUserInfo.mockResolvedValue({
      email: 'u@example.com',
      name: 'Usuária',
      sub: 'google-sub-1',
      verified_email: false,
    })

    const res = await POST(callback({}))

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('Google email not verified')
  })

  it('login de usuário existente: upsert da identidade + sessão + invalidação do state', async () => {
    googleTokens.mockResolvedValue({ access_token: 'gat-1' })
    googleUserInfo.mockResolvedValue({
      email: 'u@example.com',
      name: 'Usuária',
      sub: 'google-sub-1',
      verified_email: true,
    })
    db.user.findUnique.mockResolvedValue(knownUser())

    const res = await POST(callback({}))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      needsOnboarding: false,
      user: expect.objectContaining({ id: 'user-1', currentOrgId: 'org-1' }),
    })

    expect(db.userIdentity.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerUserId: { provider: 'google', providerUserId: 'google-sub-1' },
        },
      }),
    )

    const cookies = res.headers.getSetCookie()
    expect(cookies.some((c) => c.startsWith('accessToken='))).toBe(true)
    // State one-shot: invalidado com Max-Age=0
    expect(
      cookies.some((c) => c.startsWith('oauth_google_state=') && c.includes('Max-Age=0')),
    ).toBe(true)

    const auditActions = db.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    )
    expect(auditActions).toEqual(expect.arrayContaining(['user.login', 'auth.login']))
  })

  it('signup de usuário novo: cria org + user master, welcome email e audits de signup', async () => {
    googleTokens.mockResolvedValue({ access_token: 'gat-1' })
    googleUserInfo.mockResolvedValue({
      email: 'novo@example.com',
      name: 'Novo User',
      sub: 'google-sub-9',
      verified_email: true,
    })
    db.user.findUnique.mockResolvedValue(null)
    db.user.count.mockResolvedValue(4)
    db.organization.create.mockResolvedValue({ id: 'org-9' })
    db.user.create.mockResolvedValue(
      knownUser({ id: 'user-9', email: 'novo@example.com', name: 'Novo User', currentOrgId: 'org-9' }),
    )

    const res = await POST(callback({}))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      user: expect.objectContaining({ id: 'user-9', currentOrgId: 'org-9' }),
    })

    const createArg = db.user.create.mock.calls[0][0] as {
      data: { organizations: { create: { role: string } } }
    }
    expect(createArg.data.organizations.create.role).toBe('master')
    expect(email.sendWelcomeEmail).toHaveBeenCalled()
    expect(res.headers.getSetCookie().some((c) => c.startsWith('accessToken='))).toBe(true)

    const auditActions = db.auditLog.create.mock.calls.map(
      (c) => (c[0] as { data: { action: string } }).data.action,
    )
    expect(auditActions).toEqual(expect.arrayContaining(['user.signup', 'auth.signup']))
  })
})
