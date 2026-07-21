/**
 * Auth/Session (oRPC) — teste in-process do lote session.
 *
 * PRIMEIRA prova da mecânica de cookies no oRPC: os Set-Cookie escritos
 * pelos helpers REAIS do app (setAuthCookies/clearAuthCookies/setCsrfCookie)
 * via cookieWriter + ResponseHeadersPlugin são assertados no response final
 * (res.headers.getSetCookie()).
 *
 * JWT real (sign/verify com os utilitários do app); Prisma/redis/geo mockados.
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'
process.env.JWT_REFRESH_SECRET = 'orpc-spike-test-refresh-0123456789-abcdefgh'

vi.mock('@/server/services/database', () => ({
  database: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    customRole: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    refreshToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('@/server/services/redis', () => ({ getRedis: vi.fn() }))
vi.mock('@/lib/geocoding/ip-geolocation', () => ({ getIpGeolocation: vi.fn() }))

import { database } from '@/server/services/database'
import { signAccessToken, signRefreshToken } from '@/lib/auth/jwt'
import { GET, POST } from '@/app/api/orpc/[[...rest]]/route'

const db = database as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  organization: { findUnique: ReturnType<typeof vi.fn> }
  refreshToken: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  auditLog: { create: ReturnType<typeof vi.fn> }
}

const BASE = 'http://localhost:3000/api/orpc'
const CSRF = 'csrf-token-de-teste-0123456789'

function authedUser() {
  return {
    id: 'user-1',
    email: 'u@example.com',
    isActive: true,
    role: 'user',
    currentOrgId: 'org-1',
    onboardingCompleted: true,
    organizations: [
      { organizationId: 'org-2', role: 'owner', isActive: true, organization: { id: 'org-2' } },
    ],
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

function refreshCookie(tokenId = 'rt-1'): string {
  return `refreshToken=${signRefreshToken({ userId: 'user-1', tokenId } as Parameters<typeof signRefreshToken>[0])}`
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('oRPC — GET /auth/csrf', () => {
  it('gera token, grava o cookie csrf_token e responde o envelope', async () => {
    const res = await GET(new Request(`${BASE}/auth/csrf`))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { token: string }; error: null }
    expect(body.error).toBeNull()
    expect(body.data.token).toMatch(/^[0-9a-f]{64}$/)

    const cookies = res.headers.getSetCookie()
    const csrfCookie = cookies.find((c) => c.startsWith('csrf_token='))
    expect(csrfCookie).toBeDefined()
    // Mesmos atributos do setCsrfCookie original (httpOnly: false p/ double-submit)
    expect(csrfCookie).toContain(`csrf_token=${body.data.token}`)
    expect(csrfCookie).toContain('SameSite=Strict')
    expect(csrfCookie).toContain('Max-Age=86400')
    expect(csrfCookie).not.toContain('HttpOnly')
  })
})

describe('oRPC — POST /auth/refresh', () => {
  it('renova o access token via cookie e rotaciona o CSRF', async () => {
    db.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400_000),
      user: authedUser(),
    })

    const res = await POST(
      new Request(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { cookie: refreshCookie(), 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { message: 'Token refreshed' }, error: null })

    const cookies = res.headers.getSetCookie()
    const access = cookies.find((c) => c.startsWith('accessToken='))
    expect(access).toBeDefined()
    expect(access).toContain('Max-Age=900')
    expect(access).toContain('HttpOnly')
    expect(access).toContain('SameSite=Lax')
    expect(access).toContain('Path=/')
    // setAuthCookies rotaciona o CSRF junto
    expect(cookies.some((c) => c.startsWith('csrf_token='))).toBe(true)
  })

  it('aceita refreshToken no body como fallback (sem cookie)', async () => {
    db.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400_000),
      user: authedUser(),
    })

    const token = refreshCookie().slice('refreshToken='.length)
    const res = await POST(
      new Request(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: token }),
      }),
    )

    expect(res.status).toBe(200)
  })

  it('retorna 401 sem refresh token', async () => {
    const res = await POST(
      new Request(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(401)
  })

  it('retorna 401 para token revogado', async () => {
    db.refreshToken.findUnique.mockResolvedValue({
      id: 'rt-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400_000),
      user: authedUser(),
    })

    const res = await POST(
      new Request(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { cookie: refreshCookie(), 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(401)
  })
})

describe('oRPC — POST /auth/logout', () => {
  it('exige CSRF (403 sem o par double-submit)', async () => {
    const res = await POST(
      new Request(`${BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('revoga o refresh token, limpa cookies e audita', async () => {
    db.refreshToken.update.mockResolvedValue({})

    const res = await POST(
      new Request(`${BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': CSRF,
          cookie: `${refreshCookie()}; csrf_token=${CSRF}`,
        },
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { message: 'Logged out successfully' }, error: null })

    expect(db.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-1' },
      data: { revokedAt: expect.any(Date) },
    })

    const cookies = res.headers.getSetCookie()
    const cleared = cookies.filter((c) => c.includes('Max-Age=0'))
    expect(cleared.some((c) => c.startsWith('accessToken='))).toBe(true)
    expect(
      cleared.some((c) => c.startsWith('refreshToken=') && c.includes('Path=/api/v1/auth/refresh')),
    ).toBe(true)

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'auth.logout', userId: 'user-1' }),
    })
  })

  it('everywhere: true revoga todos os tokens do usuário', async () => {
    db.refreshToken.updateMany.mockResolvedValue({ count: 3 })

    const res = await POST(
      new Request(`${BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': CSRF,
          cookie: `${refreshCookie()}; csrf_token=${CSRF}`,
        },
        body: JSON.stringify({ everywhere: true }),
      }),
    )

    expect(res.status).toBe(200)
    expect(db.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
    expect(db.refreshToken.update).not.toHaveBeenCalled()
  })
})

describe('oRPC — POST /auth/switch-organization', () => {
  function switchRequest(orgId: string) {
    return new Request(`${BASE}/auth/switch-organization`, {
      method: 'POST',
      headers: {
        authorization: bearer(),
        'content-type': 'application/json',
        'x-csrf-token': CSRF,
        cookie: `${refreshCookie()}; csrf_token=${CSRF}`,
      },
      body: JSON.stringify({ organizationId: orgId }),
    })
  }

  it('troca a org, rotaciona o refresh token e grava os 3 cookies', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.user.update.mockResolvedValue({})
    db.refreshToken.update.mockResolvedValue({})
    db.refreshToken.create.mockResolvedValue({ id: 'rt-new' })

    const orgId = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b22'
    const user = authedUser()
    user.organizations[0].organizationId = orgId
    db.user.findUnique.mockResolvedValue(user)

    const res = await POST(switchRequest(orgId))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { currentOrgId: orgId, organizationRole: 'owner' },
      error: null,
    })

    // currentOrgId atualizado + rotação: revoga atual, cria e regrava o novo
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { currentOrgId: orgId },
    })
    expect(db.refreshToken.create).toHaveBeenCalled()
    expect(db.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'rt-new' },
      data: { token: expect.any(String) },
    })

    const cookies = res.headers.getSetCookie()
    expect(cookies.some((c) => c.startsWith('accessToken=') && c.includes('Max-Age=900'))).toBe(true)
    expect(
      cookies.some(
        (c) =>
          c.startsWith('refreshToken=') &&
          c.includes('Path=/api/v1/auth/refresh') &&
          c.includes('Max-Age=604800') &&
          c.includes('SameSite=Strict'),
      ),
    ).toBe(true)
    expect(cookies.some((c) => c.startsWith('csrf_token='))).toBe(true)

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'auth.switch_organization',
        userId: 'user-1',
        organizationId: orgId,
      }),
    })
  })

  it('nega org de que o usuário não é membro (403, não-admin)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())

    const res = await POST(switchRequest('3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b99'))

    expect(res.status).toBe(403)
    expect(db.user.update).not.toHaveBeenCalled()
  })
})
