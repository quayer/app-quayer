/**
 * oRPC — teste in-process do controller deviceSessions portado
 *
 * Invoca os route handlers Next (GET/POST) com objetos Request reais:
 *   - list: 200 com array PURO (shape do response.success(sessions) original)
 *   - 401 sem token
 *   - CSRF: 403 sem token CSRF, bypass com x-api-key, ok com double-submit
 *   - revoke: IDOR 404, idempotência (Already revoked), audit log gravado
 *   - revokeAll: exclusão do device atual via NOT, contagem no shape original
 *
 * JWT assinado com o signAccessToken real; CSRF validado pelos utilitários
 * reais de @/lib/auth/csrf; audit log atravessa o createAuditLog REAL de
 * _shared/helpers (só o Prisma é mockado — padrão dos testes do spike).
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// JWT_SECRET precisa existir ANTES do primeiro uso (lazy init em @/lib/auth/jwt).
process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'

// ---------------------------------------------------------------------------
// Mocks — só infraestrutura (banco, redis, geolocation); nenhuma lógica de
// auth/csrf/audit é mockada.
// ---------------------------------------------------------------------------
vi.mock('@/server/services/database', () => ({
  database: {
    user: { findUnique: vi.fn() },
    customRole: { findUnique: vi.fn() },
    deviceSession: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  },
}))
// helpers.ts (createAuditLog) importa redis e ip-geolocation no top-level —
// mockados para o teste não depender de env/conexões externas.
vi.mock('@/server/services/redis', () => ({ getRedis: vi.fn() }))
vi.mock('@/lib/geocoding/ip-geolocation', () => ({ getIpGeolocation: vi.fn() }))

import { database } from '@/server/services/database'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST } from '@/app/api/orpc/[[...rest]]/route'

const db = database as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> }
  deviceSession: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
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
    currentOrgId: 'org-1',
    organizations: [],
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

/** Headers de mutation com double-submit CSRF válido (header == cookie). */
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
})

describe('oRPC — GET /device-sessions (list)', () => {
  it('retorna 200 com array puro (shape do original preservado)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.deviceSession.findMany.mockResolvedValue([
      { id: 'ds-2', userId: 'user-1', isRevoked: false },
      { id: 'ds-1', userId: 'user-1', isRevoked: false },
    ])

    const res = await GET(
      new Request(`${BASE}/device-sessions`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    // response.success(sessions) enviava o array SEM envelope { data }
    expect(Array.isArray(body)).toBe(true)
    expect(body).toEqual([
      { id: 'ds-2', userId: 'user-1', isRevoked: false },
      { id: 'ds-1', userId: 'user-1', isRevoked: false },
    ])

    // Mesma query Prisma do handler original
    expect(db.deviceSession.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRevoked: false },
      orderBy: { lastActiveAt: 'desc' },
    })
  })

  it('retorna 401 sem token', async () => {
    const res = await GET(new Request(`${BASE}/device-sessions`))
    expect(res.status).toBe(401)
    expect(db.deviceSession.findMany).not.toHaveBeenCalled()
  })
})

describe('oRPC — POST /device-sessions/revoke (CSRF + IDOR + idempotência)', () => {
  it('retorna 403 sem token CSRF (paridade csrfProcedure)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())

    const res = await POST(
      new Request(`${BASE}/device-sessions/revoke`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ deviceSessionId: 'ds-1' }),
      }),
    )

    expect(res.status).toBe(403)
    expect(db.deviceSession.findFirst).not.toHaveBeenCalled()
  })

  it('bypassa CSRF com header x-api-key (allowApiKey default)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.deviceSession.findFirst.mockResolvedValue({
      id: 'ds-1',
      userId: 'user-1',
      isRevoked: false,
    })
    db.deviceSession.update.mockResolvedValue({})

    const res = await POST(
      new Request(`${BASE}/device-sessions/revoke`, {
        method: 'POST',
        headers: {
          authorization: bearer(),
          'content-type': 'application/json',
          'x-api-key': 'qualquer-coisa',
        },
        body: JSON.stringify({ deviceSessionId: 'ds-1' }),
      }),
    )

    expect(res.status).toBe(200)
  })

  it('revoga com CSRF válido, grava audit log e responde o shape original', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.deviceSession.findFirst.mockResolvedValue({
      id: 'ds-1',
      userId: 'user-1',
      isRevoked: false,
    })
    db.deviceSession.update.mockResolvedValue({})

    const res = await POST(
      new Request(`${BASE}/device-sessions/revoke`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ deviceSessionId: 'ds-1' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'Device session revoked' })

    // IDOR guard: busca restrita ao userId do requisitante
    expect(db.deviceSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'ds-1', userId: 'user-1' },
    })
    expect(db.deviceSession.update).toHaveBeenCalledWith({
      where: { id: 'ds-1' },
      data: { isRevoked: true, revokedAt: expect.any(Date) },
    })
    // createAuditLog REAL atravessado até o Prisma mockado
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'auth.device_session.revoke',
        resource: 'auth',
        userId: 'user-1',
        metadata: { deviceSessionId: 'ds-1' },
      }),
    })
  })

  it('retorna 404 quando a sessão é de outro usuário (IDOR guard)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.deviceSession.findFirst.mockResolvedValue(null)

    const res = await POST(
      new Request(`${BASE}/device-sessions/revoke`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ deviceSessionId: 'ds-de-outro-user' }),
      }),
    )

    expect(res.status).toBe(404)
    expect(db.deviceSession.update).not.toHaveBeenCalled()
  })

  it('é idempotente: sessão já revogada responde Already revoked sem update', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.deviceSession.findFirst.mockResolvedValue({
      id: 'ds-1',
      userId: 'user-1',
      isRevoked: true,
    })

    const res = await POST(
      new Request(`${BASE}/device-sessions/revoke`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ deviceSessionId: 'ds-1' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ message: 'Already revoked' })
    expect(db.deviceSession.update).not.toHaveBeenCalled()
    expect(db.auditLog.create).not.toHaveBeenCalled()
  })

  it('retorna 400 com body sem deviceSessionId (validação zod preservada)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())

    const res = await POST(
      new Request(`${BASE}/device-sessions/revoke`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(400)
    expect(db.deviceSession.findFirst).not.toHaveBeenCalled()
  })
})

describe('oRPC — POST /device-sessions/revoke-all', () => {
  it('revoga todas com body {} (o frontend envia {} quando não acha o device atual)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.deviceSession.updateMany.mockResolvedValue({ count: 3 })

    const res = await POST(
      new Request(`${BASE}/device-sessions/revoke-all`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revokedCount: 3 })
    expect(db.deviceSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRevoked: false },
      data: { isRevoked: true, revokedAt: expect.any(Date) },
    })
  })

  it('preserva o device atual via NOT quando currentDeviceSessionId vem no body', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.deviceSession.updateMany.mockResolvedValue({ count: 2 })

    const res = await POST(
      new Request(`${BASE}/device-sessions/revoke-all`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ currentDeviceSessionId: 'ds-atual' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revokedCount: 2 })
    expect(db.deviceSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', isRevoked: false, NOT: { id: 'ds-atual' } },
      data: { isRevoked: true, revokedAt: expect.any(Date) },
    })
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'auth.device_session.revoke_all',
        userId: 'user-1',
        metadata: { count: 2, excludedDeviceSessionId: 'ds-atual' },
      }),
    })
  })
})
