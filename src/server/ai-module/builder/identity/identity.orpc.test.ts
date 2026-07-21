/**
 * Builder Identity (oRPC) — teste in-process do lote B5.
 *
 * Cobre: GET do card (default quando metadata vazio), PATCH com merge parcial
 * + sync do AIAgentConfig e 404 cross-org.
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
    builderProject: { findFirst: fn(), update: fn() },
    aIAgentConfig: { findUnique: fn(), update: fn() },
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
import { GET, PATCH } from '@/app/api/orpc/[[...rest]]/route'

const BASE = 'http://localhost:3000/api/orpc'
const PROJECT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b51'

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
  mockDb.user.findUnique.mockResolvedValue({
    id: 'user-1',
    email: 'u@example.com',
    isActive: true,
    role: 'user',
    currentOrgId: 'org-1',
    organizations: [],
  })
})

describe('oRPC — builder identity', () => {
  it('GET identity/{projectId} devolve o card (default com metadata vazio)', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({
      id: PROJECT_ID,
      aiAgentId: null,
      metadata: null,
    })

    const res = await GET(
      new Request(`${BASE}/builder/identity/${PROJECT_ID}`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { card: Record<string, unknown> } }
    expect(body.data.card).toBeTruthy()
  })

  it('PATCH identity/{projectId} faz merge parcial e sincroniza o agente', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue({
      id: PROJECT_ID,
      aiAgentId: 'ag-1',
      metadata: {},
    })
    mockDb.builderProject.update.mockResolvedValue({})
    mockDb.aIAgentConfig.findUnique.mockResolvedValue({ systemPrompt: 'prompt base' })
    mockDb.aIAgentConfig.update.mockResolvedValue({})

    const res = await PATCH(
      new Request(`${BASE}/builder/identity/${PROJECT_ID}`, {
        method: 'PATCH',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Sofia', tom: 'amigavel' }),
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { card: Record<string, unknown> } }
    expect(body.data.card).toMatchObject({ displayName: 'Sofia', tom: 'amigavel' })
    expect(mockDb.builderProject.update).toHaveBeenCalled()
    expect(mockDb.aIAgentConfig.update).toHaveBeenCalled()
  })

  it('projeto de outra org responde 404', async () => {
    mockDb.builderProject.findFirst.mockResolvedValue(null)

    const res = await GET(
      new Request(`${BASE}/builder/identity/${PROJECT_ID}`, {
        headers: { authorization: bearer() },
      }),
    )
    expect(res.status).toBe(404)
  })
})
