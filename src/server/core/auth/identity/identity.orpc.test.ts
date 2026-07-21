/**
 * Auth/Identity (oRPC) — teste in-process do lote 4a.
 *
 * Cobre: gate admin do listUsers, guarda de único método de login no unlink,
 * gate 2FA das preferências OTP, shapes do /me e a validação por magic bytes
 * do upload de avatar (storage mockado).
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'

vi.mock('@/server/services/database', () => ({
  database: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    customRole: { findUnique: vi.fn() },
    userIdentity: { findMany: vi.fn(), count: vi.fn(), delete: vi.fn() },
    passkeyCredential: { count: vi.fn() },
    userPreferences: { findUnique: vi.fn(), upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))
vi.mock('@/server/services/redis', () => ({ getRedis: vi.fn() }))
vi.mock('@/lib/geocoding/ip-geolocation', () => ({ getIpGeolocation: vi.fn() }))
vi.mock('@/server/services/storage', () => ({
  BUCKETS: { PROFILES: 'profiles' },
  storage: {
    isAvailable: vi.fn().mockReturnValue(true),
    upload: vi.fn(),
    getSignedUrl: vi.fn(),
  },
}))

import { database } from '@/server/services/database'
import { storage } from '@/server/services/storage'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST, PATCH, DELETE } from '@/app/api/orpc/[[...rest]]/route'

const db = database as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const storageMock = storage as unknown as Record<string, ReturnType<typeof vi.fn>>

const BASE = 'http://localhost:3000/api/orpc'
const CSRF = 'csrf-token-de-teste-0123456789'

// PNG 1x1 válido (magic bytes 89 50 4E 47 0D 0A 1A 0A)
const PNG_BASE64 = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]).toString('base64')

function authedUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'u@example.com',
    name: 'Usuária',
    isActive: true,
    role: 'user',
    currentOrgId: 'org-1',
    isAgency: false,
    avatarUrl: null,
    emailVerified: new Date('2026-01-01'),
    preferences: null,
    organizations: [
      {
        organizationId: 'org-1',
        role: 'owner',
        isActive: true,
        organization: { id: 'org-1', name: 'Org', slug: 'org' },
      },
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
  storageMock.isAvailable.mockReturnValue(true)
})

describe('oRPC — GET /auth/users (listUsers, admin only)', () => {
  it('nega não-admin com 403', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())

    const res = await GET(
      new Request(`${BASE}/auth/users`, { headers: csrfHeaders() }),
    )
    expect(res.status).toBe(403)
    expect(db.user.findMany).not.toHaveBeenCalled()
  })

  it('admin lista usuários da org com envelope', async () => {
    db.user.findUnique.mockResolvedValue(authedUser({ role: 'admin' }))
    db.user.findMany.mockResolvedValue([{ id: 'user-2', email: 'x@example.com' }])

    const res = await GET(
      new Request(`${BASE}/auth/users`, { headers: csrfHeaders() }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: [{ id: 'user-2', email: 'x@example.com' }],
      error: null,
    })
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizations: { some: { organizationId: 'org-1' } } },
      }),
    )
  })
})

describe('oRPC — linked accounts', () => {
  it('lista identidades com connectedAt serializado', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.userIdentity.findMany.mockResolvedValue([
      { provider: 'google', identifier: 'u@example.com', connectedAt: new Date('2026-01-02T00:00:00Z') },
    ])

    const res = await GET(
      new Request(`${BASE}/auth/me/linked-accounts`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: [
        { provider: 'google', identifier: 'u@example.com', connectedAt: '2026-01-02T00:00:00.000Z' },
      ],
      error: null,
    })
  })

  it('bloqueia unlink do único método de login (400)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser({ password: null }))
    db.userIdentity.count.mockResolvedValue(1)
    db.passkeyCredential.count.mockResolvedValue(0)

    const res = await DELETE(
      new Request(`${BASE}/auth/me/linked-accounts/google`, {
        method: 'DELETE',
        headers: csrfHeaders(),
      }),
    )

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('único método de login')
    expect(db.userIdentity.delete).not.toHaveBeenCalled()
  })

  it('desvincula quando há outros métodos e audita', async () => {
    db.user.findUnique.mockResolvedValue(authedUser({ password: 'hash' }))
    db.userIdentity.count.mockResolvedValue(1)
    db.passkeyCredential.count.mockResolvedValue(1)
    db.userIdentity.delete.mockResolvedValue({})

    const res = await DELETE(
      new Request(`${BASE}/auth/me/linked-accounts/google`, {
        method: 'DELETE',
        headers: csrfHeaders(),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { unlinked: true }, error: null })
    expect(db.userIdentity.delete).toHaveBeenCalledWith({
      where: { userId_provider: { userId: 'user-1', provider: 'google' } },
    })
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'user.identity.unlink' }),
    })
  })

  it('provider fora do enum responde 400 com a mensagem do original', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())

    const res = await DELETE(
      new Request(`${BASE}/auth/me/linked-accounts/facebook`, {
        method: 'DELETE',
        headers: csrfHeaders(),
      }),
    )

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('Provider inválido')
  })
})

describe('oRPC — OTP preferences', () => {
  it('GET responde defaults quando não há preferências', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.userPreferences.findUnique.mockResolvedValue(null)

    const res = await GET(
      new Request(`${BASE}/auth/me/otp-preferences`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { otpEmailDisabled: false, otpPhoneDisabled: false },
      error: null,
    })
  })

  it('PATCH nega desabilitar OTP sem 2FA ativo (anti-lockout, 403)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser({ twoFactorEnabled: false }))

    const res = await PATCH(
      new Request(`${BASE}/auth/me/otp-preferences`, {
        method: 'PATCH',
        headers: csrfHeaders(),
        body: JSON.stringify({ otpEmailDisabled: true }),
      }),
    )

    expect(res.status).toBe(403)
    expect(db.userPreferences.upsert).not.toHaveBeenCalled()
  })

  it('PATCH grava upsert quando 2FA ativo', async () => {
    db.user.findUnique.mockResolvedValue(authedUser({ twoFactorEnabled: true }))
    db.userPreferences.upsert.mockResolvedValue({})

    const res = await PATCH(
      new Request(`${BASE}/auth/me/otp-preferences`, {
        method: 'PATCH',
        headers: csrfHeaders(),
        body: JSON.stringify({ otpEmailDisabled: true }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { updated: true }, error: null })
    expect(db.userPreferences.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        create: { userId: 'user-1', otpEmailDisabled: true },
      }),
    )
  })
})

describe('oRPC — GET/PATCH /auth/me (profile)', () => {
  it('GET /auth/me responde o shape completo do perfil', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())

    const res = await GET(
      new Request(`${BASE}/auth/me`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      id: 'user-1',
      email: 'u@example.com',
      currentOrgId: 'org-1',
      avatarUrl: null,
      organizations: [{ id: 'org-1', name: 'Org', slug: 'org', role: 'owner' }],
    })
  })

  it('PATCH /auth/me persiste só o name e ecoa language/timezone', async () => {
    db.user.findUnique.mockResolvedValue(authedUser({ name: 'Novo Nome' }))
    db.user.update.mockResolvedValue({})

    const res = await PATCH(
      new Request(`${BASE}/auth/me`, {
        method: 'PATCH',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Novo Nome', language: 'pt-BR', timezone: 'America/Sao_Paulo' }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      name: 'Novo Nome',
      language: 'pt-BR',
      timezone: 'America/Sao_Paulo',
    })
    // Só name vai ao banco (TODO(schema) herdado do original)
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Novo Nome' },
    })
  })
})

describe('oRPC — POST /auth/me/avatar (upload)', () => {
  it('rejeita conteúdo que não é imagem suportada (magic bytes)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())

    const res = await POST(
      new Request(`${BASE}/auth/me/avatar`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({
          fileBase64: Buffer.from('<html>payload</html>').toString('base64'),
          fileName: 'avatar.png',
          mimeType: 'image/png',
        }),
      }),
    )

    expect(res.status).toBe(400)
    expect(storageMock.upload).not.toHaveBeenCalled()
  })

  it('rejeita mimeType declarado divergente do conteúdo real', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())

    const res = await POST(
      new Request(`${BASE}/auth/me/avatar`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({
          fileBase64: PNG_BASE64,
          fileName: 'avatar.jpg',
          mimeType: 'image/jpeg',
        }),
      }),
    )

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('não corresponde ao conteúdo real')
  })

  it('faz upload, gera URL assinada e persiste avatarUrl', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.user.update.mockResolvedValue({})
    storageMock.upload.mockResolvedValue({ path: 'avatars/user-1-x.png' })
    storageMock.getSignedUrl.mockResolvedValue('https://cdn.example.com/signed/avatar.png')

    const res = await POST(
      new Request(`${BASE}/auth/me/avatar`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({
          fileBase64: PNG_BASE64,
          fileName: 'avatar.png',
          mimeType: 'image/png',
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { avatarUrl: 'https://cdn.example.com/signed/avatar.png' },
      error: null,
    })
    expect(storageMock.upload).toHaveBeenCalledWith(
      'profiles',
      expect.stringMatching(/^avatars\/user-1-\d+\.png$/),
      expect.any(Buffer),
      { contentType: 'image/png', upsert: true },
    )
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { avatarUrl: 'https://cdn.example.com/signed/avatar.png' },
    })
  })

  it('responde 503 quando o storage não está configurado', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    storageMock.isAvailable.mockReturnValue(false)

    const res = await POST(
      new Request(`${BASE}/auth/me/avatar`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({
          fileBase64: PNG_BASE64,
          fileName: 'avatar.png',
          mimeType: 'image/png',
        }),
      }),
    )

    expect(res.status).toBe(503)
  })
})
