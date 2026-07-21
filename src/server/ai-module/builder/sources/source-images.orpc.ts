/**
 * Builder Source-images — porta mecânica para oRPC (lote B3 do builder).
 *
 * Origem: ./source-images.routes.ts (3 actions).
 *   listSourceImages GET   /builder/projects/:id/sources/images
 *   patchSourceImage PATCH /builder/sources/images/:imageId
 *   bulkSourceImages POST  /builder/projects/:id/sources/images/bulk
 *
 * signImageRow (assinatura on-read fail-safe, storageKey nunca exposto)
 * copiado 1:1; repository e sync reusados.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { BUCKETS, storage } from '@/server/services/storage'
import { loadProject, resolveCollectionId } from '../knowledge/knowledge-helpers'
import { syncGalleryMediaAssets } from '../media/gallery-media-sync'
import { invalidateProjectRefinement } from '../refinement/refinement-state'
import {
  knowledgeImagesRepository,
  type KnowledgeImageRow,
} from './knowledge-images.repository'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const authed = base.use(authOrApiKey)

// ---------------------------------------------------------------------------
// Shape exposto ao FE — cópia 1:1 de source-images.routes.ts (storageKey NUNCA
// aparece; datas viram ISO string).
// ---------------------------------------------------------------------------

interface CuratedImage {
  id: string
  sourceId: string
  collectionId: string
  originalUrl: string
  imageUrl: string | null
  caption: string | null
  width: number | null
  height: number | null
  sizeBytes: number | null
  mimeType: string | null
  confirmedAt: string | null
  createdAt: string
}

async function signImageRow(row: KnowledgeImageRow): Promise<CuratedImage> {
  let imageUrl: string | null = null
  try {
    imageUrl = await storage.getSignedUrl(BUCKETS.MEDIA, row.storageKey)
  } catch (err) {
    console.warn(
      '[source-images] getSignedUrl falhou (fail-safe, imageUrl=null):',
      row.id,
      err instanceof Error ? err.message : String(err),
    )
    imageUrl = null
  }

  return {
    id: row.id,
    sourceId: row.sourceId,
    collectionId: row.collectionId,
    originalUrl: row.originalUrl,
    imageUrl,
    caption: row.caption,
    width: row.width,
    height: row.height,
    sizeBytes: row.sizeBytes,
    mimeType: row.mimeType,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

const patchImageActionsShape = {
  caption: z.string().trim().max(2000).optional(),
  deleted: z.literal(true).optional(),
  confirmed: z.boolean().optional(),
}

// ==========================================
// LIST — GET /builder/projects/{id}/sources/images
// ==========================================
export const listSourceImages = authed
  .route({
    method: 'GET',
    path: '/builder/projects/{id}/sources/images',
    summary: 'List Builder Project Source Images',
  })
  .input(z.object({ id: z.string().uuid('projectId inválido') }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const project = await loadProject(input.id, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    const rows = await knowledgeImagesRepository.listProjectImages(input.id, orgId)
    const images = await Promise.all(rows.map((row) => signImageRow(row)))

    return ok({ images })
  })

// ==========================================
// PATCH — PATCH /builder/sources/images/{imageId}
// ==========================================
export const patchSourceImage = authed
  .route({
    method: 'PATCH',
    path: '/builder/sources/images/{imageId}',
    summary: 'Patch Builder Source Image',
  })
  .input(
    z
      .object({
        imageId: z.string().uuid('imageId inválido'),
        ...patchImageActionsShape,
      })
      .refine(
        (b) =>
          b.caption !== undefined ||
          b.deleted !== undefined ||
          b.confirmed !== undefined,
        { message: 'Informe ao menos uma ação (caption, deleted ou confirmed)' },
      ),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const { imageId, caption, deleted, confirmed } = input

    // Precedência (uma ação por chamada): delete > confirmed > caption.
    let affected: number
    let applied: 'deleted' | 'confirmed' | 'caption'
    if (deleted === true) {
      affected = await knowledgeImagesRepository.softDelete(imageId, orgId)
      applied = 'deleted'
    } else if (confirmed !== undefined) {
      affected = await knowledgeImagesRepository.setConfirmed(imageId, confirmed, orgId)
      applied = 'confirmed'
    } else {
      affected = await knowledgeImagesRepository.patchCaption(
        imageId,
        caption ?? '',
        orgId,
      )
      applied = 'caption'
    }

    if (affected === 0) {
      throw new ORPCError('NOT_FOUND', { message: 'Imagem não encontrada' })
    }

    return ok({ ok: true, imageId, applied })
  })

// ==========================================
// BULK — POST /builder/projects/{id}/sources/images/bulk
// ==========================================
export const bulkSourceImages = authed
  .route({
    method: 'POST',
    path: '/builder/projects/{id}/sources/images/bulk',
    summary: 'Bulk Curate Builder Source Images',
  })
  .input(
    z.object({
      id: z.string().uuid('projectId inválido'),
      action: z.enum(['approve_all', 'delete_low_quality']),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const { id: projectId, action } = input

    const project = await loadProject(projectId, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    if (action === 'approve_all') {
      const { confirmed } = await knowledgeImagesRepository.bulkApproveAll(
        projectId,
        orgId,
      )
      try {
        const collectionId = await resolveCollectionId(project, orgId)
        if (collectionId) {
          await syncGalleryMediaAssets(collectionId, orgId)
        }
      } catch (err) {
        console.warn(
          '[source-images] sync gallery->media pós-approve_all falhou:',
          err instanceof Error ? err.message : String(err),
        )
      }
      await invalidateProjectRefinement({
        projectId,
        organizationId: orgId,
        reason: 'Imagens de fonte foram aprovadas em massa depois do refinamento.',
      })
      return ok({ action, confirmed })
    }

    // action === 'delete_low_quality'
    const { deleted } = await knowledgeImagesRepository.bulkDeleteLowQuality(
      projectId,
      orgId,
    )
    await invalidateProjectRefinement({
      projectId,
      organizationId: orgId,
      reason:
        'Imagens de baixa qualidade foram removidas em massa depois do refinamento.',
    })
    return ok({ action, deleted })
  })

export const sourceImagesActions = {
  listSourceImages,
  patchSourceImage,
  bulkSourceImages,
}
