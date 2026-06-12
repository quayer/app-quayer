/**
 * Builder Media — gallery source sync.
 *
 * Mantem a ponte entre `KnowledgeImage` (fotos extraidas das fontes) e
 * `MediaAsset` (catalogo editavel/enviavel da aba Midias). Diferente do passo de
 * deploy antigo, este sync materializa tambem fotos PENDENTES: elas aparecem na
 * curadoria com `confirmedAt=null`, mas o runtime segue filtrando apenas midias
 * confirmadas.
 */

import { database } from '@/server/services/database'

import {
  reconcileMediaAssets,
  sanitizeGalleryAssets,
  type DesiredMediaAsset,
  type ExistingMediaRow,
} from '../deploy/media-reconcile'

export interface SyncGalleryMediaAssetsResult {
  upserted: number
  deactivated: number
}

export async function loadGalleryDesiredMediaAssets(
  collectionId: string,
  organizationId: string,
): Promise<DesiredMediaAsset[]> {
  const images = await database.knowledgeImage.findMany({
    where: {
      organizationId,
      collectionId,
      deletedAt: null,
    },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      caption: true,
      sizeBytes: true,
      confirmedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return sanitizeGalleryAssets(images)
}

export async function syncGalleryMediaAssets(
  collectionId: string,
  organizationId: string,
): Promise<SyncGalleryMediaAssetsResult> {
  const desired = await loadGalleryDesiredMediaAssets(collectionId, organizationId)

  let upserted = 0
  for (let i = 0; i < desired.length; i += 1) {
    const item = desired[i]
    await database.mediaAsset.upsert({
      where: {
        source_sourceRef: { source: item.source, sourceRef: item.sourceRef },
      },
      create: {
        organizationId,
        collectionId,
        mediaType: item.mediaType,
        storageKey: item.storageKey,
        externalUrl: item.externalUrl,
        mimeType: item.mimeType,
        caption: item.caption,
        tags: [],
        category: item.category,
        source: item.source,
        sourceRef: item.sourceRef,
        sizeBytes: item.sizeBytes,
        position: i,
        confirmedAt: item.confirmedAt ?? null,
      },
      update: {
        collectionId,
        mediaType: item.mediaType,
        storageKey: item.storageKey,
        externalUrl: item.externalUrl,
        mimeType: item.mimeType,
        category: item.category,
        sizeBytes: item.sizeBytes,
        position: i,
        ...(item.confirmedAt ? { confirmedAt: item.confirmedAt } : {}),
      },
    })
    upserted += 1
  }

  const existingRows = await database.mediaAsset.findMany({
    where: {
      collectionId,
      organizationId,
      source: 'gallery',
      deletedAt: null,
    },
    select: { id: true, source: true, sourceRef: true },
  })
  const existing: ExistingMediaRow[] = existingRows.map((row) => ({
    id: row.id,
    source: row.source,
    sourceRef: row.sourceRef,
  }))

  const plan = reconcileMediaAssets(existing, desired)
  let deactivated = 0
  if (plan.toDeactivate.length > 0) {
    const result = await database.mediaAsset.updateMany({
      where: {
        id: { in: plan.toDeactivate },
        collectionId,
        organizationId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    })
    deactivated = result.count
  }

  return { upserted, deactivated }
}

