/**
 * Providers BYOK (oRPC) — teste in-process do controller portado.
 *
 * O providersRepository e a criptografia (@/lib/crypto) rodam REAIS — só o
 * Prisma é mockado. Cobre: list com lastFour derivado de key criptografada
 * de verdade, validação manual de provider (mensagem/status do original),
 * PATCH com body+param fundidos, 404s dos deletes e a precedência da rota
 * estática /providers/keys/{id} sobre /providers/{provider}.
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'
process.env.ENCRYPTION_KEY = 'orpc-providers-test-encryption-key-32ch'

vi.mock('@/server/services/database', () => ({
  database: {
    user: { findUnique: vi.fn() },
    customRole: { findUnique: vi.fn() },
    organizationProvider: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { database } from '@/server/services/database'
import { encrypt } from '@/lib/crypto'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST, PATCH, DELETE } from '@/orpc/serve'

const db = database as unknown as {
  user: { findUnique: ReturnType<typeof vi.fn> }
  organizationProvider: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    aggregate: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
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
})

describe('oRPC — GET /providers (listProviders)', () => {
  it('retorna os 5 providers com lastFour derivado de key REALMENTE criptografada', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.organizationProvider.findMany.mockResolvedValue([
      {
        provider: 'openai',
        credentials: { apiKey: encrypt('sk-test-key-abcd1234') },
        updatedAt: new Date('2026-07-21T12:00:00Z'),
      },
    ])

    const res = await GET(
      new Request(`${BASE}/providers`, { headers: { authorization: bearer() } }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: Array<{ provider: string; isConfigured: boolean; lastFour: string | null }>
      error: null
    }
    expect(body.error).toBeNull()
    expect(body.data).toHaveLength(5)

    const openai = body.data.find((p) => p.provider === 'openai')
    // decrypt real da key gravada: últimos 4 chars do plaintext
    expect(openai).toMatchObject({ isConfigured: true, lastFour: '1234' })

    const anthropic = body.data.find((p) => p.provider === 'anthropic')
    expect(anthropic).toMatchObject({ isConfigured: false, lastFour: null })
  })

  it('retorna 401 sem token', async () => {
    const res = await GET(new Request(`${BASE}/providers`))
    expect(res.status).toBe(401)
  })
})

describe('oRPC — PATCH /providers/{provider} (upsertProvider)', () => {
  it('faz upsert com body+param fundidos e envelope preservado', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.organizationProvider.upsert.mockResolvedValue({
      provider: 'anthropic',
      credentials: { apiKey: encrypt('sk-ant-key-xyz-9876') },
      updatedAt: new Date('2026-07-21T12:00:00Z'),
    })

    const res = await PATCH(
      new Request(`${BASE}/providers/anthropic`, {
        method: 'PATCH',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: 'sk-ant-key-xyz-9876' }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { provider: string; lastFour: string } }
    expect(body.data.provider).toBe('anthropic')
    expect(body.data.lastFour).toBe('9876')
    // A key persistida vai CRIPTOGRAFADA (nunca plaintext)
    const upsertArg = db.organizationProvider.upsert.mock.calls[0][0]
    expect(upsertArg.create.credentials.apiKey).not.toContain('sk-ant')
  })

  it('rejeita provider não suportado com a mensagem do original', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())

    const res = await PATCH(
      new Request(`${BASE}/providers/hugface`, {
        method: 'PATCH',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: 'k-1234567890123456' }),
      }),
    )

    expect(res.status).toBe(400)
    const body = (await res.json()) as { message?: string }
    expect(JSON.stringify(body)).toContain('Unsupported provider: hugface')
    expect(db.organizationProvider.upsert).not.toHaveBeenCalled()
  })

  it('valida apiKey curta com 400 (zod do original)', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())

    const res = await PATCH(
      new Request(`${BASE}/providers/openai`, {
        method: 'PATCH',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: 'curta' }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

describe('oRPC — DELETE /providers/{provider} (deleteProvider)', () => {
  it('remove e responde { success: true } no envelope', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.organizationProvider.findFirst.mockResolvedValue({ id: 'op-1' })
    db.organizationProvider.delete.mockResolvedValue({ id: 'op-1' })

    const res = await DELETE(
      new Request(`${BASE}/providers/openai`, {
        method: 'DELETE',
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { success: true }, error: null })
    expect(db.organizationProvider.delete).toHaveBeenCalledWith({ where: { id: 'op-1' } })
  })

  it('retorna 404 quando não configurado', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.organizationProvider.findFirst.mockResolvedValue(null)

    const res = await DELETE(
      new Request(`${BASE}/providers/openai`, {
        method: 'DELETE',
        headers: { authorization: bearer() },
      }),
    )
    expect(res.status).toBe(404)
    expect(db.organizationProvider.delete).not.toHaveBeenCalled()
  })
})

describe('oRPC — multi-key: /providers/{provider}/keys e /providers/keys/{id}', () => {
  it('POST cria primeira chave como primary com priority 0', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.organizationProvider.aggregate.mockResolvedValue({ _count: 0, _max: { priority: null } })
    db.organizationProvider.create.mockResolvedValue({
      id: 'op-9',
      name: 'Chave prod',
      credentials: { apiKey: encrypt('sk-nova-key-5678') },
      isPrimary: true,
      priority: 0,
      updatedAt: new Date('2026-07-21T12:00:00Z'),
    })

    const res = await POST(
      new Request(`${BASE}/providers/openai/keys`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ apiKey: 'sk-nova-key-5678', name: 'Chave prod' }),
      }),
    )

    expect(res.status).toBe(200)
    const createArg = db.organizationProvider.create.mock.calls[0][0]
    expect(createArg.data).toMatchObject({ isPrimary: true, priority: 0, provider: 'openai' })
  })

  it('GET lista chaves do provider', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.organizationProvider.findMany.mockResolvedValue([
      {
        id: 'op-1',
        name: 'Padrão',
        credentials: { apiKey: encrypt('sk-aaaa-bbbb-cc11') },
        isPrimary: true,
        isActive: true,
        priority: 0,
        updatedAt: new Date('2026-07-21T12:00:00Z'),
      },
    ])

    const res = await GET(
      new Request(`${BASE}/providers/openai/keys`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Array<{ id: string }> ; error: null }
    expect(body.data[0].id).toBe('op-1')
  })

  it('DELETE /providers/keys/{id} casa a rota estática (não vira provider="keys")', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.organizationProvider.findFirst.mockResolvedValue({ id: 'op-7' })
    db.organizationProvider.delete.mockResolvedValue({ id: 'op-7' })

    const res = await DELETE(
      new Request(`${BASE}/providers/keys/op-7`, {
        method: 'DELETE',
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { success: true }, error: null })
    // Prova da precedência: a query é a do deleteKeyById (por id+org),
    // não a do deleteProvider (por provider+org).
    expect(db.organizationProvider.findFirst).toHaveBeenCalledWith({
      where: { id: 'op-7', organizationId: 'org-1' },
      select: { id: true },
    })
  })

  it('DELETE /providers/keys/{id} retorna 404 para chave inexistente', async () => {
    db.user.findUnique.mockResolvedValue(authedUser())
    db.organizationProvider.findFirst.mockResolvedValue(null)

    const res = await DELETE(
      new Request(`${BASE}/providers/keys/op-inexistente`, {
        method: 'DELETE',
        headers: { authorization: bearer() },
      }),
    )
    expect(res.status).toBe(404)
  })
})
