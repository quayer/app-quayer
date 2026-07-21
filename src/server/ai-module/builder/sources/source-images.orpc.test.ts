/**
 * Builder Source-images (oRPC) — teste in-process do lote B3.
 *
 * Cobre: lista com assinatura on-read fail-safe (imageUrl=null quando o
 * storage falha, storageKey nunca exposto), patch org-scoped (0 afetadas ⇒
 * 404) e bulk approve_all.
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
  }
})

vi.mock('@/server/services/database', () => ({
  database: mockDb,
  getDatabase: () => mockDb,
}))
vi.mock('@/server/services/storage', () => ({
  BUCKETS: { MEDIA: 'media' },
  storage: { getSignedUrl: vi.fn() },
}))
vi.mock('@/server/ai-module/builder/knowledge/knowledge-helpers', () => ({
  loadProject: vi.fn(),
  resolveCollectionId: vi.fn(),
}))
vi.mock('@/server/ai-module/builder/media/gallery-media-sync', () => ({
  syncGalleryMediaAssets: vi.fn(),
}))
vi.mock('@/server/ai-module/builder/refinement/refinement-state', () => ({
  invalidateProjectRefinement: vi.fn(),
}))
vi.mock(
  '@/server/ai-module/builder/sources/knowledge-images.repository',
  () => ({
    knowledgeImagesRepository: {
      listProjectImages: vi.fn(),
      softDelete: vi.fn(),
      setConfirmed: vi.fn(),
      patchCaption: vi.fn(),
      bulkApproveAll: vi.fn(),
      bulkDeleteLowQuality: vi.fn(),
    },
  }),
)

import { storage } from '@/server/services/storage'
import { loadProject } from '@/server/ai-module/builder/knowledge/knowledge-helpers'
import { knowledgeImagesRepository } from '@/server/ai-module/builder/sources/knowledge-images.repository'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, PATCH, POST } from '@/app/api/orpc/[[...rest]]/route'

const loadProjectFn = loadProject as unknown as ReturnType<typeof vi.fn>
const signFn = storage.getSignedUrl as unknown as ReturnType<typeof vi.fn>
const repo = knowledgeImagesRepository as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>

const BASE = 'http://localhost:3000/api/orpc'
const PROJECT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b51'
const IMAGE_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b53'

function bearer(): string {
  const token = signAccessToken({
    userId: 'user-1',
    email: 'u@example.com',
    role: 'user',
    currentOrgId: 'org-1',
  } as Parameters<typeof signAccessToken>[0])
  return `Bearer ${token}`
}

function imageRow(id: string) {
  return {
    id,
    sourceId: 'src-1',
    collectionId: 'col-1',
    originalUrl: `https://site.com/${id}.jpg`,
    storageKey: `kb/${id}.jpg`,
    caption: null,
    width: 800,
    height: 600,
    sizeBytes: 1000,
    mimeType: 'image/jpeg',
    confirmedAt: null,
    createdAt: new Date('2026-07-21T10:00:00Z'),
  }
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

describe('oRPC — builder source images', () => {
  it('GET sources/images assina on-read e degrada imageUrl=null por item', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID })
    repo.listProjectImages.mockResolvedValue([imageRow('img-1'), imageRow('img-2')])
    signFn
      .mockResolvedValueOnce('https://signed/img-1')
      .mockRejectedValueOnce(new Error('storage down'))

    const res = await GET(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/sources/images`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { images: Array<Record<string, unknown>> }
    }
    expect(body.data.images).toHaveLength(2)
    expect(body.data.images[0].imageUrl).toBe('https://signed/img-1')
    expect(body.data.images[1].imageUrl).toBeNull()
    // storageKey NUNCA exposto
    expect(JSON.stringify(body)).not.toContain('storageKey')
  })

  it('PATCH sources/images/{imageId} de outra org responde 404 (0 afetadas)', async () => {
    repo.softDelete.mockResolvedValue(0)

    const res = await PATCH(
      new Request(`${BASE}/builder/sources/images/${IMAGE_ID}`, {
        method: 'PATCH',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ deleted: true }),
      }),
    )
    expect(res.status).toBe(404)
    expect(repo.softDelete).toHaveBeenCalledWith(IMAGE_ID, 'org-1')
  })

  it('POST sources/images/bulk approve_all confirma pendentes', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID })
    repo.bulkApproveAll.mockResolvedValue({ confirmed: 4 })

    const res = await POST(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/sources/images/bulk`, {
        method: 'POST',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approve_all' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { action: 'approve_all', confirmed: 4 },
      error: null,
    })
  })
})
