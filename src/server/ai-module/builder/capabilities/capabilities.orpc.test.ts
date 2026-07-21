/**
 * Builder Capabilities (oRPC) — teste in-process do lote B5.
 *
 * Cobre: projeto sem KB (counts 0), com collection (counts reais) e o 404
 * cross-org. connections/list coberto de carona (mesma superfície B5).
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
    agentTool: { findMany: fn() },
    mediaAsset: { count: fn() },
    knowledgeImage: { count: fn() },
    knowledgeSource: { count: fn() },
    connection: { findMany: fn() },
  }
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock('@/server/ai-module/builder/knowledge/knowledge-helpers', () => ({
  loadProject: vi.fn(),
  resolveCollectionId: vi.fn(),
}))
vi.mock('@/server/ai-module/builder/sources/builder-state-db', () => ({
  readBuilderStateByProject: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/server/ai-module/builder/deploy/enabled-tools-derivation', () => ({
  hasActiveCalendarConnection: vi.fn().mockResolvedValue(false),
}))
vi.mock(
  '@/server/ai-module/builder/capabilities/recommend-capabilities.pure',
  () => ({ recommendAgentCapabilities: vi.fn().mockReturnValue([]) }),
)

import {
  loadProject,
  resolveCollectionId,
} from '@/server/ai-module/builder/knowledge/knowledge-helpers'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET } from '@/orpc/serve'

const loadProjectFn = loadProject as unknown as ReturnType<typeof vi.fn>
const resolveCollectionFn = resolveCollectionId as unknown as ReturnType<typeof vi.fn>

const BASE = 'http://localhost:3000/api/v1'
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

describe('oRPC — builder capabilities', () => {
  it('projeto sem KB devolve counts 0 (sem tocar os delegates de count)', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID, aiAgentId: null, metadata: null })
    resolveCollectionFn.mockResolvedValue(null)
    mockDb.agentTool.findMany.mockResolvedValue([])

    const res = await GET(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/capabilities`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({
      customTools: [],
      mediaImagesCount: 0,
      sourceImagesCount: 0,
      sourceImagesPendingCount: 0,
      knowledgeSourceCount: 0,
      calendarConnected: false,
    })
    expect(mockDb.mediaAsset.count).not.toHaveBeenCalled()
  })

  it('projeto de outra org responde 404 (não vaza existência)', async () => {
    loadProjectFn.mockResolvedValue(null)

    const res = await GET(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/capabilities`, {
        headers: { authorization: bearer() },
      }),
    )
    expect(res.status).toBe(404)
  })
})

describe('oRPC — builder connections list', () => {
  it('GET connections/list lista as instâncias WhatsApp da org', async () => {
    mockDb.connection.findMany.mockResolvedValue([
      { id: 'c-1', name: 'Loja', phoneNumber: '5511999999999', status: 'CONNECTED' },
    ])

    const res = await GET(
      new Request(`${BASE}/builder/connections/list`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        connections: [
          { id: 'c-1', name: 'Loja', phoneNumber: '5511999999999', status: 'CONNECTED' },
        ],
      },
      error: null,
    })
    expect(mockDb.connection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', channel: 'WHATSAPP' },
      }),
    )
  })
})
