import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockKnowledgeImageFindMany = vi.hoisted(() => vi.fn())
const mockMediaAssetUpsert = vi.hoisted(() => vi.fn())
const mockMediaAssetFindMany = vi.hoisted(() => vi.fn())
const mockMediaAssetUpdateMany = vi.hoisted(() => vi.fn())

const databaseMock = vi.hoisted(() => ({
  knowledgeImage: {
    findMany: mockKnowledgeImageFindMany,
  },
  mediaAsset: {
    upsert: mockMediaAssetUpsert,
    findMany: mockMediaAssetFindMany,
    updateMany: mockMediaAssetUpdateMany,
  },
}))

vi.mock('@/server/services/database', () => ({
  database: databaseMock,
  getDatabase: () => databaseMock,
}))

import { syncGalleryMediaAssets } from './gallery-media-sync'

const ORG_ID = 'org-1'
const COLLECTION_ID = 'collection-1'
const CONFIRMED_AT = new Date('2026-06-11T12:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  mockMediaAssetUpsert.mockResolvedValue({ id: 'asset' })
  mockMediaAssetFindMany.mockResolvedValue([])
  mockMediaAssetUpdateMany.mockResolvedValue({ count: 0 })
})

describe('syncGalleryMediaAssets', () => {
  it('materializa KnowledgeImage pendente como MediaAsset pendente', async () => {
    mockKnowledgeImageFindMany.mockResolvedValue([
      {
        id: 'img-pending',
        storageKey: 'knowledge/org/source/pending.jpg',
        mimeType: 'image/jpeg',
        caption: 'Fachada',
        sizeBytes: 1000,
        confirmedAt: null,
      },
    ])

    const result = await syncGalleryMediaAssets(COLLECTION_ID, ORG_ID)

    expect(result).toEqual({ upserted: 1, deactivated: 0 })
    const findArg = mockKnowledgeImageFindMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>
    }
    expect(findArg.where).toMatchObject({
      organizationId: ORG_ID,
      collectionId: COLLECTION_ID,
      deletedAt: null,
    })
    expect(findArg.where).not.toHaveProperty('confirmedAt')

    const upsertArg = mockMediaAssetUpsert.mock.calls[0]?.[0] as {
      create: { confirmedAt: Date | null; source: string; sourceRef: string }
      update: Record<string, unknown>
    }
    expect(upsertArg.create.source).toBe('gallery')
    expect(upsertArg.create.sourceRef).toBe('img-pending')
    expect(upsertArg.create.confirmedAt).toBeNull()
    expect(upsertArg.update).not.toHaveProperty('confirmedAt')
  })

  it('materializa KnowledgeImage aprovada como MediaAsset liberada', async () => {
    mockKnowledgeImageFindMany.mockResolvedValue([
      {
        id: 'img-confirmed',
        storageKey: 'knowledge/org/source/confirmed.jpg',
        mimeType: 'image/jpeg',
        caption: 'Piscina',
        sizeBytes: 2000,
        confirmedAt: CONFIRMED_AT,
      },
    ])

    await syncGalleryMediaAssets(COLLECTION_ID, ORG_ID)

    const upsertArg = mockMediaAssetUpsert.mock.calls[0]?.[0] as {
      create: { confirmedAt: Date | null }
      update: { confirmedAt?: Date | null }
    }
    expect(upsertArg.create.confirmedAt).toBe(CONFIRMED_AT)
    expect(upsertArg.update.confirmedAt).toBe(CONFIRMED_AT)
  })

  it('desativa MediaAsset gallery que nao existe mais nas KnowledgeImage ativas', async () => {
    mockKnowledgeImageFindMany.mockResolvedValue([])
    mockMediaAssetFindMany.mockResolvedValue([
      { id: 'asset-orphan', source: 'gallery', sourceRef: 'img-old' },
    ])
    mockMediaAssetUpdateMany.mockResolvedValue({ count: 1 })

    const result = await syncGalleryMediaAssets(COLLECTION_ID, ORG_ID)

    expect(result).toEqual({ upserted: 0, deactivated: 1 })
    const updateArg = mockMediaAssetUpdateMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] }; collectionId: string; organizationId: string }
      data: { deletedAt: Date }
    }
    expect(updateArg.where.id.in).toEqual(['asset-orphan'])
    expect(updateArg.where.collectionId).toBe(COLLECTION_ID)
    expect(updateArg.where.organizationId).toBe(ORG_ID)
    expect(updateArg.data.deletedAt).toBeInstanceOf(Date)
  })
})

