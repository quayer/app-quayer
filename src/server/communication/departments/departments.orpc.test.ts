/**
 * Departments (oRPC) — teste in-process do controller portado.
 *
 * Cobre os dois modos de auth (JWT e API Key), envelope Igniter preservado,
 * isolamento multi-tenant, upsert de membro, caminho degradado (delegate
 * DepartmentMember ausente -> 200 com warning / 503 nas mutations) e a rota
 * DELETE com dois path params.
 *
 * Padrão do harness: só infraestrutura mockada (Prisma + apiKeysRepository);
 * JWT/roteamento/validação reais, request atravessa o route handler Next.
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'

vi.mock('@/server/services/database', () => ({
  database: {
    user: { findUnique: vi.fn() },
    customRole: { findUnique: vi.fn() },
    department: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    userOrganization: { findFirst: vi.fn() },
    departmentMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))
vi.mock('@/server/core/api-keys/api-keys.repository', () => ({
  apiKeysRepository: {
    validateKey: vi.fn(),
    updateLastUsed: vi.fn().mockResolvedValue(undefined),
  },
}))

import { database } from '@/server/services/database'
import { apiKeysRepository } from '@/server/core/api-keys/api-keys.repository'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST, DELETE } from '@/orpc/serve'

const db = database as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> }
  department: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  userOrganization: { findFirst: ReturnType<typeof vi.fn> }
  departmentMember: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
}
const apiKeys = apiKeysRepository as unknown as {
  validateKey: ReturnType<typeof vi.fn>
  updateLastUsed: ReturnType<typeof vi.fn>
}

const BASE = 'http://localhost:3000/api/v1'

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

beforeEach(() => {
  vi.clearAllMocks()
  apiKeys.updateLastUsed.mockResolvedValue(undefined)
})

describe('oRPC — GET /departments (list)', () => {
  it('retorna 200 com envelope Igniter e query org-scoped', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.department.findMany.mockResolvedValue([{ id: 'dep-1', slug: 'suporte' }])

    const res = await GET(
      new Request(`${BASE}/departments?type=support&limit=10`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { data: [{ id: 'dep-1', slug: 'suporte' }] },
      error: null,
    })
    expect(db.department.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', type: 'support' },
      take: 10,
      skip: 0,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
  })

  it('funciona sem query params (defaults do original)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.department.findMany.mockResolvedValue([])

    const res = await GET(
      new Request(`${BASE}/departments`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(200)
    expect(db.department.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      take: 50,
      skip: 0,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    })
  })

  it('autentica via API Key e escopa pela org da key (não do user)', async () => {
    apiKeys.validateKey.mockResolvedValue({
      valid: true,
      apiKey: { id: 'key-1', userId: 'user-1', organizationId: 'org-da-key', scopes: ['admin'] },
    })
    db.user.findUnique.mockResolvedValue({ ...authedUser(), currentOrgId: 'org-do-user' })
    db.department.findMany.mockResolvedValue([])

    const res = await GET(
      new Request(`${BASE}/departments`, { headers: { 'x-api-key': 'sk-live-abc' } }),
    )

    expect(res.status).toBe(200)
    expect(apiKeys.validateKey).toHaveBeenCalledWith('sk-live-abc')
    expect(db.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-da-key' } }),
    )
  })

  it('retorna 401 com API Key inválida', async () => {
    apiKeys.validateKey.mockResolvedValue({ valid: false })

    const res = await GET(
      new Request(`${BASE}/departments`, { headers: { 'x-api-key': 'sk-ruim' } }),
    )
    expect(res.status).toBe(401)
    expect(db.department.findMany).not.toHaveBeenCalled()
  })

  it('retorna 401 sem nenhuma credencial', async () => {
    const res = await GET(new Request(`${BASE}/departments`))
    expect(res.status).toBe(401)
  })
})

describe('oRPC — POST /departments (create)', () => {
  it('cria com 201 e envelope Igniter preservados', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.department.findFirst.mockResolvedValue(null)
    db.department.create.mockResolvedValue({ id: 'dep-9', slug: 'vendas' })

    const res = await POST(
      new Request(`${BASE}/departments`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Vendas', slug: 'vendas' }),
      }),
    )

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      data: { data: { id: 'dep-9', slug: 'vendas' } },
      error: null,
    })
    // Defaults do schema aplicados (type support, isActive true)
    expect(db.department.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        name: 'Vendas',
        slug: 'vendas',
        description: undefined,
        type: 'support',
        isActive: true,
      },
    })
  })

  it('rejeita slug duplicado com 400', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.department.findFirst.mockResolvedValue({ id: 'dep-1' })

    const res = await POST(
      new Request(`${BASE}/departments`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Suporte', slug: 'suporte' }),
      }),
    )

    expect(res.status).toBe(400)
    expect(db.department.create).not.toHaveBeenCalled()
  })
})

describe('oRPC — GET /departments/{id}/members (listMembers)', () => {
  it('retorna membros na ordem da roleta com envelope', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.department.findFirst.mockResolvedValue({ id: 'dep-1' })
    db.departmentMember.findMany.mockResolvedValue([{ id: 'm-1', position: 0 }])

    const res = await GET(
      new Request(`${BASE}/departments/dep-1/members`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { data: [{ id: 'm-1', position: 0 }] }, error: null })
    expect(db.departmentMember.findMany).toHaveBeenCalledWith({
      where: { departmentId: 'dep-1', organizationId: 'org-1' },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    })
  })

  it('retorna 404 para departamento de outra org', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.department.findFirst.mockResolvedValue(null)

    const res = await GET(
      new Request(`${BASE}/departments/dep-alheio/members`, {
        headers: { authorization: bearer() },
      }),
    )
    expect(res.status).toBe(404)
  })

  it('degrada para 200 + warning quando o delegate não existe (migration não landou)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.department.findFirst.mockResolvedValue({ id: 'dep-1' })
    const saved = (database as unknown as Record<string, unknown>).departmentMember
    delete (database as unknown as Record<string, unknown>).departmentMember
    try {
      const res = await GET(
        new Request(`${BASE}/departments/dep-1/members`, {
          headers: { authorization: bearer() },
        }),
      )
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        data: { success: true, data: [], warning: 'DepartmentMember table not available' },
        error: null,
      })
    } finally {
      ;(database as unknown as Record<string, unknown>).departmentMember = saved
    }
  })
})

describe('oRPC — POST /departments/{id}/members (addMember)', () => {
  function okMocks() {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.department.findFirst.mockResolvedValue({ id: 'dep-1' })
    db.userOrganization.findFirst.mockResolvedValue({ id: 'uo-1' })
  }

  it('cria membro novo com 201 (path param + body fundidos no input)', async () => {
    okMocks()
    db.departmentMember.findUnique.mockResolvedValue(null)
    db.departmentMember.create.mockResolvedValue({ id: 'm-1', position: 2 })

    const res = await POST(
      new Request(`${BASE}/departments/dep-1/members`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b11',
          position: 2,
        }),
      }),
    )

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { data: { id: 'm-1', position: 2 } }, error: null })
    expect(db.departmentMember.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        departmentId: 'dep-1',
        userId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b11',
        position: 2,
        isActive: true,
      },
    })
  })

  it('faz upsert (update) quando o membro já existe', async () => {
    okMocks()
    db.departmentMember.findUnique.mockResolvedValue({ id: 'm-1' })
    db.departmentMember.update.mockResolvedValue({ id: 'm-1', position: 5 })

    const res = await POST(
      new Request(`${BASE}/departments/dep-1/members`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({
          userId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b11',
          position: 5,
          isActive: false,
        }),
      }),
    )

    expect(res.status).toBe(201)
    expect(db.departmentMember.update).toHaveBeenCalledWith({
      where: {
        departmentId_userId: {
          departmentId: 'dep-1',
          userId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b11',
        },
      },
      data: { position: 5, isActive: false },
    })
    expect(db.departmentMember.create).not.toHaveBeenCalled()
  })

  it('rejeita atendente de outra org com 400 (multi-tenant)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.department.findFirst.mockResolvedValue({ id: 'dep-1' })
    db.userOrganization.findFirst.mockResolvedValue(null)

    const res = await POST(
      new Request(`${BASE}/departments/dep-1/members`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ userId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b11' }),
      }),
    )
    expect(res.status).toBe(400)
    expect(db.departmentMember.create).not.toHaveBeenCalled()
  })

  it('retorna 503 quando o delegate não existe', async () => {
    okMocks()
    const saved = (database as unknown as Record<string, unknown>).departmentMember
    delete (database as unknown as Record<string, unknown>).departmentMember
    try {
      const res = await POST(
        new Request(`${BASE}/departments/dep-1/members`, {
          method: 'POST',
          headers: { authorization: bearer(), 'content-type': 'application/json' },
          body: JSON.stringify({ userId: '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b11' }),
        }),
      )
      expect(res.status).toBe(503)
    } finally {
      ;(database as unknown as Record<string, unknown>).departmentMember = saved
    }
  })
})

describe('oRPC — DELETE /departments/{id}/members/{userId} (removeMember)', () => {
  it('remove com sucesso preservando o shape { success: true }', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.department.findFirst.mockResolvedValue({ id: 'dep-1' })
    db.departmentMember.findUnique.mockResolvedValue({ id: 'm-1', organizationId: 'org-1' })
    db.departmentMember.delete.mockResolvedValue({ id: 'm-1' })

    const res = await DELETE(
      new Request(`${BASE}/departments/dep-1/members/user-9`, {
        method: 'DELETE',
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { success: true }, error: null })
    expect(db.departmentMember.delete).toHaveBeenCalledWith({
      where: { departmentId_userId: { departmentId: 'dep-1', userId: 'user-9' } },
    })
  })

  it('retorna 404 quando o membro pertence a outra org', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.department.findFirst.mockResolvedValue({ id: 'dep-1' })
    db.departmentMember.findUnique.mockResolvedValue({ id: 'm-1', organizationId: 'org-2' })

    const res = await DELETE(
      new Request(`${BASE}/departments/dep-1/members/user-9`, {
        method: 'DELETE',
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(404)
    expect(db.departmentMember.delete).not.toHaveBeenCalled()
  })
})
