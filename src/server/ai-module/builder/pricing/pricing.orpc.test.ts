/**
 * Builder Pricing (oRPC) — teste in-process do lote B5.
 *
 * Cobre: catálogo vazio ({list:null,items:[]}), addItem convertendo reais →
 * centavos + aliases lowercase, e deleteItem com isolamento por org (404).
 *
 * Rodar:
 *   npx vitest run --config src/orpc/vitest.config.orpc.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

process.env.JWT_SECRET = 'orpc-spike-test-secret-0123456789-abcdefghij'

const mockDb = vi.hoisted(() => {
  const fn = () => vi.fn()
  return {
    user: { findUnique: fn() },
    customRole: { findUnique: fn() },
    builderProject: { findFirst: fn() },
    aIAgentConfig: { findUnique: fn(), update: fn() },
    priceList: { findFirst: fn(), upsert: fn() },
    priceItem: { findMany: fn(), findFirst: fn(), create: fn(), delete: fn() },
  }
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock('@/server/ai-module/builder/refinement/refinement-state', () => ({
  invalidateProjectRefinement: vi.fn(),
}))

import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST, DELETE } from '@/app/api/orpc/[[...rest]]/route'

const BASE = 'http://localhost:3000/api/orpc'
const PROJECT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b51'
const ITEM_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b58'

function bearer(): string {
  const token = signAccessToken({
    userId: 'user-1',
    email: 'u@example.com',
    role: 'user',
    currentOrgId: 'org-1',
  } as Parameters<typeof signAccessToken>[0])
  return `Bearer ${token}`
}

function jsonHeaders(): Record<string, string> {
  return { authorization: bearer(), 'content-type': 'application/json' }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockDb.user.findUnique.mockResolvedValue({
    id: 'user-1',
    email: 'u@example.com',
    isActive: true,
    role: 'user',
    currentOrgId: 'org-1',
    organizations: [],
  })
})

describe('oRPC — builder pricing', () => {
  it('GET pricing/{projectId} sem lista devolve {list:null, items:[]}', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({ id: PROJECT_ID, aiAgentId: null })
    mockDb.priceList.findFirst.mockResolvedValue(null)

    const res = await GET(
      new Request(`${BASE}/builder/pricing/${PROJECT_ID}`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { list: null, items: [] },
      error: null,
    })
  })

  it('POST pricing/{projectId}/item converte reais → centavos e aliases → lowercase', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({ id: PROJECT_ID, aiAgentId: 'ag-1' })
    mockDb.aIAgentConfig.findUnique.mockResolvedValue({ priceListId: 'list-1' })
    mockDb.priceItem.create.mockResolvedValue({ id: ITEM_ID })

    const res = await POST(
      new Request(`${BASE}/builder/pricing/${PROJECT_ID}/item`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({
          name: 'Corte Feminino',
          price: 89.9,
          aliases: ['CORTE', 'Cabelo'],
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { itemId: ITEM_ID }, error: null })
    expect(mockDb.priceItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          priceListId: 'list-1',
          priceCents: 8990,
          aliases: ['corte', 'cabelo'],
        }),
      }),
    )
  })

  it('DELETE item de outra org responde 404 (isolamento via priceList.organizationId)', async () => {
    mockDb.priceItem.findFirst.mockResolvedValue(null)

    const res = await DELETE(
      new Request(`${BASE}/builder/pricing/${PROJECT_ID}/item/${ITEM_ID}`, {
        method: 'DELETE',
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(404)
    expect(mockDb.priceItem.delete).not.toHaveBeenCalled()
    expect(mockDb.priceItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ITEM_ID, priceList: { organizationId: 'org-1' } },
      }),
    )
  })
})
