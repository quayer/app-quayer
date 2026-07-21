/**
 * Builder Sources (oRPC) — teste in-process do lote B3.
 *
 * Cobre: ingest com envelope response.success -> ok, 404 de projeto de outra
 * org e o poll de status com collection ausente (lista vazia + proposed null).
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
    builderProjectConversation: { findFirst: fn() },
    knowledgeCollection: { findFirst: fn() },
    knowledgeSource: { findMany: fn(), findFirst: fn() },
  }
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock('@/server/ai-module/builder/knowledge/knowledge-helpers', () => ({
  loadProject: vi.fn(),
}))
vi.mock('@/server/ai-module/builder/sources/ingest-source-refs', () => ({
  ingestSourceRefs: vi.fn(),
}))
vi.mock('@/server/ai-module/builder/sources/builder-state-db', () => ({
  SOURCE_SYNTHESIS_MANUAL_RETRY_LIMIT: 2,
  hasAnyProposalField: vi.fn().mockReturnValue(false),
  markSourceSynthesisRetryAtomic: vi.fn(),
  patchSourceIngestionAtomic: vi.fn(),
  readBuilderStateByProject: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/server/services/jobs/source-enrich.queue', () => ({
  enqueueSourceEnrich: vi.fn(),
}))

import { loadProject } from '@/server/ai-module/builder/knowledge/knowledge-helpers'
import { ingestSourceRefs } from '@/server/ai-module/builder/sources/ingest-source-refs'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST } from '@/app/api/orpc/[[...rest]]/route'

const loadProjectFn = loadProject as unknown as ReturnType<typeof vi.fn>
const ingestFn = ingestSourceRefs as unknown as ReturnType<typeof vi.fn>

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

describe('oRPC — builder sources', () => {
  it('POST sources/ingest cria fontes e devolve {collectionId, sources}', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID, aiAgentId: null, metadata: null })
    mockDb.builderProjectConversation.findFirst.mockResolvedValue({ id: 'conv-1' })
    ingestFn.mockResolvedValue({
      collectionId: 'col-1',
      sources: [{ id: 'src-1', source: 'https://minhaloja.com.br', status: 'pending' }],
    })

    const res = await POST(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/sources/ingest`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({
          refs: [{ value: 'https://minhaloja.com.br', type: 'url' }],
        }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: {
        collectionId: 'col-1',
        sources: [{ id: 'src-1', source: 'https://minhaloja.com.br', status: 'pending' }],
      },
      error: null,
    })
    expect(ingestFn).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        conversationId: 'conv-1',
      }),
    )
  })

  it('projeto de outra org responde 404 no ingest', async () => {
    loadProjectFn.mockResolvedValue(null)

    const res = await POST(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/sources/ingest`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({
          refs: [{ value: 'https://minhaloja.com.br', type: 'url' }],
        }),
      }),
    )
    expect(res.status).toBe(404)
    expect(ingestFn).not.toHaveBeenCalled()
  })

  it('GET sources/status sem collection devolve lista vazia + proposed null', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID, aiAgentId: null, metadata: null })
    mockDb.knowledgeCollection.findFirst.mockResolvedValue(null)

    const res = await GET(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/sources/status`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { sources: [], proposed: null },
      error: null,
    })
    expect(mockDb.knowledgeSource.findMany).not.toHaveBeenCalled()
  })
})
