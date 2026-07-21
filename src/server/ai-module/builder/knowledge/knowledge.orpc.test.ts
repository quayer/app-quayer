/**
 * Builder Knowledge (oRPC) — teste in-process do lote B3.
 *
 * Cobre: getKnowledge sem collection (useRAG do agente), toggleRAG sem agente
 * publicado (400), addTextSource com ingestão síncrona e deleteSource com
 * isolamento multi-tenant (404 fora da org).
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
    aIAgentConfig: { findUnique: fn(), update: fn() },
    knowledgeCollection: { findUnique: fn() },
    knowledgeSource: { findMany: fn(), findFirst: fn(), create: fn(), delete: fn() },
    knowledgeImage: { findMany: fn() },
    mediaAsset: { updateMany: fn() },
  }
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock('@/server/ai-module/builder/knowledge/knowledge-helpers', () => ({
  loadProject: vi.fn(),
  resolveCollectionId: vi.fn(),
  ensureCollection: vi.fn(),
  ensureCollectionIdOrThrow: vi.fn(),
}))
vi.mock('@/server/ai-module/builder/refinement/refinement-state', () => ({
  invalidateProjectRefinement: vi.fn(),
}))
vi.mock(
  '@/server/ai-module/ai-agents/knowledge/knowledge-ingestion.service',
  () => ({ ingestSource: vi.fn() }),
)

import {
  loadProject,
  resolveCollectionId,
  ensureCollectionIdOrThrow,
} from '@/server/ai-module/builder/knowledge/knowledge-helpers'
import { ingestSource } from '@/server/ai-module/ai-agents/knowledge/knowledge-ingestion.service'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, POST, PATCH, DELETE } from '@/orpc/serve'

const loadProjectFn = loadProject as unknown as ReturnType<typeof vi.fn>
const resolveCollectionFn = resolveCollectionId as unknown as ReturnType<typeof vi.fn>
const ensureCollectionIdFn = ensureCollectionIdOrThrow as unknown as ReturnType<typeof vi.fn>
const ingestFn = ingestSource as unknown as ReturnType<typeof vi.fn>

const BASE = 'http://localhost:3000/api/v1'
const PROJECT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b51'
const SOURCE_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b55'

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

describe('oRPC — builder knowledge', () => {
  it('GET knowledge/{projectId} sem collection devolve useRAG do agente', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID, aiAgentId: 'ag-1' })
    resolveCollectionFn.mockResolvedValue(null)
    mockDb.aIAgentConfig.findUnique.mockResolvedValue({ useRAG: true })

    const res = await GET(
      new Request(`${BASE}/builder/knowledge/${PROJECT_ID}`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { collection: null, sources: [], useRAG: true },
      error: null,
    })
  })

  it('PATCH knowledge/{projectId} sem agente publicado responde 400', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID, aiAgentId: null })

    const res = await PATCH(
      new Request(`${BASE}/builder/knowledge/${PROJECT_ID}`, {
        method: 'PATCH',
        headers: jsonHeaders(),
        body: JSON.stringify({ enabled: true }),
      }),
    )

    expect(res.status).toBe(400)
    expect(JSON.stringify(await res.json())).toContain('agente publicado')
    expect(mockDb.aIAgentConfig.update).not.toHaveBeenCalled()
  })

  it('POST source/text cria a fonte e dispara a ingestão síncrona', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID, aiAgentId: 'ag-1' })
    ensureCollectionIdFn.mockResolvedValue('col-1')
    mockDb.knowledgeSource.create.mockResolvedValue({ id: SOURCE_ID })
    ingestFn.mockResolvedValue({ sourceId: SOURCE_ID, chunkCount: 3, status: 'ready' })

    const res = await POST(
      new Request(`${BASE}/builder/knowledge/${PROJECT_ID}/source/text`, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ title: 'FAQ', text: 'Perguntas frequentes...' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { sourceId: SOURCE_ID, chunkCount: 3, status: 'ready' },
      error: null,
    })
    expect(mockDb.knowledgeSource.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          collectionId: 'col-1',
          organizationId: 'org-1',
          type: 'text',
          source: 'FAQ',
        }),
      }),
    )
    expect(ingestFn).toHaveBeenCalledWith(SOURCE_ID, {
      rawText: 'Perguntas frequentes...',
      expectedOrganizationId: 'org-1',
    })
  })

  it('DELETE source de outra org responde 404 (isolamento multi-tenant)', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID, aiAgentId: 'ag-1' })
    mockDb.knowledgeSource.findFirst.mockResolvedValue(null)

    const res = await DELETE(
      new Request(`${BASE}/builder/knowledge/${PROJECT_ID}/source/${SOURCE_ID}`, {
        method: 'DELETE',
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(404)
    expect(mockDb.knowledgeSource.delete).not.toHaveBeenCalled()
  })

  it('DELETE source soft-deleta MediaAssets gallery das fotos da fonte', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID, aiAgentId: 'ag-1' })
    mockDb.knowledgeSource.findFirst.mockResolvedValue({ id: SOURCE_ID })
    mockDb.knowledgeImage.findMany.mockResolvedValue([{ id: 'img-1' }])
    mockDb.mediaAsset.updateMany.mockResolvedValue({ count: 1 })
    mockDb.knowledgeSource.delete.mockResolvedValue({ id: SOURCE_ID })

    const res = await DELETE(
      new Request(`${BASE}/builder/knowledge/${PROJECT_ID}/source/${SOURCE_ID}`, {
        method: 'DELETE',
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { deleted: true }, error: null })
    expect(mockDb.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: 'gallery',
          sourceRef: { in: ['img-1'] },
          organizationId: 'org-1',
        }),
      }),
    )
  })
})
