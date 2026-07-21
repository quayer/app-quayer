/**
 * Builder Media-curation (oRPC) — teste in-process do lote B3.
 *
 * Cobre: projeto sem KB ⇒ { media: [] } (no-op limpo), resolução de url
 * (externalUrl direto vs signed) e patch de caption org-scoped.
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
vi.mock('@/server/ai-module/builder/media/media-curation.repository', () => ({
  mediaCurationRepository: {
    listProjectMedia: vi.fn(),
    softDelete: vi.fn(),
    setConfirmed: vi.fn(),
    patchCaption: vi.fn(),
  },
}))

import { storage } from '@/server/services/storage'
import {
  loadProject,
  resolveCollectionId,
} from '@/server/ai-module/builder/knowledge/knowledge-helpers'
import { mediaCurationRepository } from '@/server/ai-module/builder/media/media-curation.repository'
import { signAccessToken } from '@/lib/auth/jwt'
import { GET, PATCH } from '@/app/api/orpc/[[...rest]]/route'

const loadProjectFn = loadProject as unknown as ReturnType<typeof vi.fn>
const resolveCollectionFn = resolveCollectionId as unknown as ReturnType<typeof vi.fn>
const signFn = storage.getSignedUrl as unknown as ReturnType<typeof vi.fn>
const repo = mediaCurationRepository as unknown as Record<string, ReturnType<typeof vi.fn>>

const BASE = 'http://localhost:3000/api/orpc'
const PROJECT_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b51'
const MEDIA_ID = '3c6f0f6e-8db1-4bfb-9c86-0e6c9f6f2b54'

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

describe('oRPC — builder media curation', () => {
  it('GET projects/{id}/media sem KB devolve { media: [] }', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID })
    resolveCollectionFn.mockResolvedValue(null)

    const res = await GET(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/media`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { media: [] }, error: null })
    expect(repo.listProjectMedia).not.toHaveBeenCalled()
  })

  it('GET media resolve url: externalUrl direto, storageKey assinado', async () => {
    loadProjectFn.mockResolvedValue({ id: PROJECT_ID })
    resolveCollectionFn.mockResolvedValue('col-1')
    repo.listProjectMedia.mockResolvedValue([
      {
        id: 'm-ext',
        externalUrl: 'https://externo.com/foto.jpg',
        storageKey: null,
        mediaType: 'image',
        caption: 'externa',
        category: null,
        source: 'pricing',
        mimeType: 'image/jpeg',
        confirmedAt: null,
      },
      {
        id: 'm-key',
        externalUrl: null,
        storageKey: 'media/m-key.jpg',
        mediaType: 'image',
        caption: null,
        category: null,
        source: 'upload',
        mimeType: 'image/jpeg',
        confirmedAt: new Date('2026-07-21T10:00:00Z'),
      },
    ])
    signFn.mockResolvedValue('https://signed/m-key')

    const res = await GET(
      new Request(`${BASE}/builder/projects/${PROJECT_ID}/media`, {
        headers: { authorization: bearer() },
      }),
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: { media: Array<Record<string, unknown>> }
    }
    expect(body.data.media[0].url).toBe('https://externo.com/foto.jpg')
    expect(body.data.media[1].url).toBe('https://signed/m-key')
    expect(signFn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(body)).not.toContain('storageKey')
  })

  it('PATCH media/{mediaId} aplica caption org-scoped', async () => {
    repo.patchCaption.mockResolvedValue(1)

    const res = await PATCH(
      new Request(`${BASE}/builder/media/${MEDIA_ID}`, {
        method: 'PATCH',
        headers: { authorization: bearer(), 'content-type': 'application/json' },
        body: JSON.stringify({ caption: 'Fachada da loja' }),
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: { ok: true, mediaId: MEDIA_ID, applied: 'caption' },
      error: null,
    })
    expect(repo.patchCaption).toHaveBeenCalledWith(MEDIA_ID, 'Fachada da loja', 'org-1')
  })
})
