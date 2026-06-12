import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockMediaAssetFindFirst = vi.hoisted(() => vi.fn())
const mockMediaAssetFindMany = vi.hoisted(() => vi.fn())
const mockMediaAssetUpdateMany = vi.hoisted(() => vi.fn())
const mockKnowledgeImageUpdateMany = vi.hoisted(() => vi.fn())

const databaseMock = vi.hoisted(() => ({
  mediaAsset: {
    findFirst: mockMediaAssetFindFirst,
    findMany: mockMediaAssetFindMany,
    updateMany: mockMediaAssetUpdateMany,
  },
  knowledgeImage: {
    updateMany: mockKnowledgeImageUpdateMany,
  },
}))

vi.mock('@/server/services/database', () => ({
  database: databaseMock,
  getDatabase: () => databaseMock,
}))

import {
  patchCaption,
  setConfirmed,
  softDelete,
} from './media-curation.repository'

const ORG_ID = 'org-1'
const MEDIA_ID = 'media-1'
const IMAGE_ID = 'image-1'

beforeEach(() => {
  vi.clearAllMocks()
  mockMediaAssetFindFirst.mockResolvedValue({
    source: 'gallery',
    sourceRef: IMAGE_ID,
  })
  mockMediaAssetUpdateMany.mockResolvedValue({ count: 1 })
  mockKnowledgeImageUpdateMany.mockResolvedValue({ count: 1 })
})

describe('mediaCurationRepository gallery link sync', () => {
  it('sincroniza confirmacao da MediaAsset gallery para a KnowledgeImage', async () => {
    const count = await setConfirmed(MEDIA_ID, true, ORG_ID)

    expect(count).toBe(1)
    const mediaArg = mockMediaAssetUpdateMany.mock.calls[0]?.[0] as {
      data: { confirmedAt: Date | null }
    }
    const imageArg = mockKnowledgeImageUpdateMany.mock.calls[0]?.[0] as {
      where: { id: string; organizationId: string; deletedAt: null }
      data: { confirmedAt: Date | null }
    }
    expect(mediaArg.data.confirmedAt).toBeInstanceOf(Date)
    expect(imageArg.where).toEqual({
      id: IMAGE_ID,
      organizationId: ORG_ID,
      deletedAt: null,
    })
    expect(imageArg.data.confirmedAt).toBe(mediaArg.data.confirmedAt)
  })

  it('sincroniza legenda editada da MediaAsset gallery para a KnowledgeImage', async () => {
    await patchCaption(MEDIA_ID, '  Piscina adulto  ', ORG_ID)

    const mediaArg = mockMediaAssetUpdateMany.mock.calls[0]?.[0] as {
      data: { caption: string | null }
    }
    const imageArg = mockKnowledgeImageUpdateMany.mock.calls[0]?.[0] as {
      data: { caption: string | null }
    }
    expect(mediaArg.data.caption).toBe('Piscina adulto')
    expect(imageArg.data.caption).toBe('Piscina adulto')
  })

  it('sincroniza remocao da MediaAsset gallery para a KnowledgeImage', async () => {
    await softDelete(MEDIA_ID, ORG_ID)

    const mediaArg = mockMediaAssetUpdateMany.mock.calls[0]?.[0] as {
      data: { deletedAt: Date }
    }
    const imageArg = mockKnowledgeImageUpdateMany.mock.calls[0]?.[0] as {
      data: { deletedAt: Date }
    }
    expect(mediaArg.data.deletedAt).toBeInstanceOf(Date)
    expect(imageArg.data.deletedAt).toBe(mediaArg.data.deletedAt)
  })

  it('nao toca KnowledgeImage para midia de upload', async () => {
    mockMediaAssetFindFirst.mockResolvedValue({
      source: 'upload',
      sourceRef: null,
    })

    await setConfirmed(MEDIA_ID, true, ORG_ID)

    expect(mockKnowledgeImageUpdateMany).not.toHaveBeenCalled()
  })
})

