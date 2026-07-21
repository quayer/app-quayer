/**
 * Builder Media-curation — porta mecânica para oRPC (lote B3 do builder).
 *
 * Origem: ./media-curation.routes.ts (2 actions).
 *   listProjectMedia GET   /builder/projects/:id/media
 *   patchMediaAsset  PATCH /builder/media/:mediaId
 *
 * signMediaRow (externalUrl direto OU assinatura on-read fail-safe; storageKey
 * nunca exposto) copiado 1:1; repository e sync reusados.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { BUCKETS, storage } from '@/server/services/storage'
import { loadProject, resolveCollectionId } from '../knowledge/knowledge-helpers'
import { syncGalleryMediaAssets } from './gallery-media-sync'
import {
  mediaCurationRepository,
  type MediaAssetRow,
} from './media-curation.repository'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const authed = base.use(authOrApiKey)

// ---------------------------------------------------------------------------
// Domínio + shape exposto ao FE — cópia 1:1 de media-curation.routes.ts
// ---------------------------------------------------------------------------

type MediaType = 'image' | 'video' | 'document'
type MediaSource = 'upload' | 'gallery' | 'pricing'

interface MediaAssetItem {
  id: string
  url: string | null
  mediaType: MediaType
  caption: string | null
  category: string | null
  source: MediaSource
  mimeType: string | null
  confirmedAt: string | null
}

function toMediaType(value: string): MediaType {
  if (value === 'image' || value === 'video' || value === 'document') return value
  return 'document'
}

function toMediaSource(value: string): MediaSource {
  if (value === 'upload' || value === 'gallery' || value === 'pricing') return value
  return 'upload'
}

async function signMediaRow(row: MediaAssetRow): Promise<MediaAssetItem> {
  let url: string | null = null
  if (row.externalUrl) {
    url = row.externalUrl
  } else if (row.storageKey) {
    try {
      url = await storage.getSignedUrl(BUCKETS.MEDIA, row.storageKey)
    } catch (err) {
      console.warn(
        '[media-curation] getSignedUrl falhou (fail-safe, url=null):',
        row.id,
        err instanceof Error ? err.message : String(err),
      )
      url = null
    }
  }

  return {
    id: row.id,
    url,
    mediaType: toMediaType(row.mediaType),
    caption: row.caption,
    category: row.category,
    source: toMediaSource(row.source),
    mimeType: row.mimeType,
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
  }
}

// ==========================================
// LIST — GET /builder/projects/{id}/media
// ==========================================
export const listProjectMedia = authed
  .route({
    method: 'GET',
    path: '/builder/projects/{id}/media',
    summary: 'List Builder Project Media',
  })
  .input(z.object({ id: z.string().uuid('projectId inválido') }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const project = await loadProject(input.id, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    // Sem KB ainda ⇒ no-op limpo: nada a curar.
    const collectionId = await resolveCollectionId(project, orgId)
    if (!collectionId) return ok({ media: [] })

    try {
      await syncGalleryMediaAssets(collectionId, orgId)
    } catch (err) {
      console.warn(
        '[media-curation] sync gallery->media falhou (fail-safe, listando existente):',
        err instanceof Error ? err.message : String(err),
      )
    }

    const rows = await mediaCurationRepository.listProjectMedia(collectionId, orgId)
    const media = await Promise.all(rows.map((row) => signMediaRow(row)))

    return ok({ media })
  })

// ==========================================
// PATCH — PATCH /builder/media/{mediaId}
// ==========================================
export const patchMediaAsset = authed
  .route({
    method: 'PATCH',
    path: '/builder/media/{mediaId}',
    summary: 'Patch Builder Media Asset',
  })
  .input(
    z
      .object({
        mediaId: z.string().uuid('mediaId inválido'),
        caption: z.string().trim().max(2000).optional(),
        deleted: z.literal(true).optional(),
        confirmed: z.boolean().optional(),
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
    const { mediaId, caption, deleted, confirmed } = input

    // Precedência (uma ação por chamada): deleted > confirmed > caption.
    let affected: number
    let applied: 'deleted' | 'confirmed' | 'caption'
    if (deleted === true) {
      affected = await mediaCurationRepository.softDelete(mediaId, orgId)
      applied = 'deleted'
    } else if (confirmed !== undefined) {
      affected = await mediaCurationRepository.setConfirmed(mediaId, confirmed, orgId)
      applied = 'confirmed'
    } else {
      affected = await mediaCurationRepository.patchCaption(
        mediaId,
        caption ?? '',
        orgId,
      )
      applied = 'caption'
    }

    if (affected === 0) {
      throw new ORPCError('NOT_FOUND', { message: 'Mídia não encontrada' })
    }

    return ok({ ok: true, mediaId, applied })
  })

export const mediaCurationActions = {
  listProjectMedia,
  patchMediaAsset,
}
