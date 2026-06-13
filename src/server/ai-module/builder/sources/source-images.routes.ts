/**
 * Builder Module — Source-image CURATION routes (Onda D2, vision/G2).
 *
 * A camada de API que o FE de curadoria (D3) consome para LISTAR e CURAR as
 * imagens que a Onda D1 já extraiu e persistiu em `knowledge_images`. Três
 * orquestradores finos sob o prefixo /builder, espelhando sources.routes.ts:
 *
 *   GET   /projects/:id/sources/images
 *     Lista as imagens do projeto (todas as KnowledgeSource da collection
 *     kb:projectId, deletadas omitidas), org-scoped. Para CADA imagem, ASSINA o
 *     storageKey on-read via storage.getSignedUrl(BUCKETS.MEDIA, …) — a signed
 *     URL NUNCA é persistida (expira em ~7d). FAIL-SAFE: se a assinatura de UMA
 *     imagem falhar (ou o storage estiver indisponível), `imageUrl=null` para
 *     AQUELA imagem — nunca derruba a lista. O storageKey NÃO é exposto ao FE.
 *
 *   PATCH /sources/images/:imageId  { caption? | deleted? | confirmed? }
 *     Curadoria de UMA imagem (exatamente UMA ação por chamada). Ownership via
 *     org: o repository filtra por organizationId no updateMany — contagem
 *     afetada 0 ⇒ 404 (inexistente/sem acesso). Soft-delete só "deleta" (não
 *     des-deleta); confirmed alterna confirmedAt = now()|null.
 *
 *   POST  /projects/:id/sources/images/bulk  { action }
 *     Ações em massa org-scoped: 'approve_all' confirma todas as pendentes;
 *     'delete_low_quality' soft-deleta por heurística de baixa qualidade
 *     (sem caption / dimensão pequena — vive nas constantes do repository).
 *
 * RULES: orquestradores finos (a lógica de DB vive no knowledgeImagesRepository),
 * TS strict, zero `any`, Zod em TODO input, TODA query filtrada por
 * organizationId. A assinatura de storageKey é a única responsabilidade "pesada"
 * desta camada e é fail-safe por design.
 *
 * Contrato/decisões: docs/builder/ONDA_D_VISION_PLAN.md (§ curadoria/D2).
 */

import { z } from 'zod'

import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { BUCKETS, storage } from '@/server/services/storage'

import { loadProject, resolveCollectionId } from '../knowledge/knowledge-helpers'
import { syncGalleryMediaAssets } from '../media/gallery-media-sync'
import { invalidateProjectRefinement } from '../refinement/refinement-state'
import {
  knowledgeImagesRepository,
  type KnowledgeImageRow,
} from './knowledge-images.repository'

// ---------------------------------------------------------------------------
// Local utilities (mirror sources.routes.ts / chat.routes.ts guards)
// ---------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface AuthedUser {
  id: string
  currentOrgId?: string | null
}

function getUser(context: unknown): AuthedUser | null {
  const ctx = context as {
    auth?: { session?: { user?: AuthedUser } }
  } | null
  return ctx?.auth?.session?.user ?? null
}

// ---------------------------------------------------------------------------
// Shape exposto ao FE — note que storageKey NÃO aparece (só imageUrl assinada).
// Datas viram ISO string para serialização estável.
// ---------------------------------------------------------------------------

interface CuratedImage {
  id: string
  sourceId: string
  collectionId: string
  originalUrl: string
  /** Signed URL on-read (BUCKETS.MEDIA); null se a assinatura falhar. */
  imageUrl: string | null
  caption: string | null
  width: number | null
  height: number | null
  sizeBytes: number | null
  mimeType: string | null
  /** ISO; null = pendente de curadoria. */
  confirmedAt: string | null
  /** ISO. */
  createdAt: string
}

/**
 * Assina o storageKey de UMA imagem on-read. FAIL-SAFE: qualquer erro
 * (storage indisponível, key inexistente, hiccup de rede) vira `imageUrl=null`
 * para AQUELA imagem — nunca propaga, nunca derruba a lista. O storageKey é
 * deliberadamente omitido da resposta (só a signed URL chega ao FE).
 */
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

// ---------------------------------------------------------------------------
// Input schemas (Zod)
// ---------------------------------------------------------------------------

/**
 * Curadoria de UMA imagem: exatamente UMA ação por chamada. Todas opcionais,
 * mas o refine garante ao menos uma. `deleted` é literal `true` (só soft-delete;
 * não "des-deleta"). A precedência das ações vive no handler.
 */
const patchImageBodySchema = z
  .object({
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
  )

const bulkImagesBodySchema = z.object({
  action: z.enum(['approve_all', 'delete_low_quality']),
})

// ---------------------------------------------------------------------------
// ROTA 1 — GET /projects/:id/sources/images  (lista + assina on-read)
// ---------------------------------------------------------------------------

const listSourceImages = igniter.query({
  name: 'List Builder Project Source Images',
  description:
    'List the curation catalog of images extracted from a project\'s sources (KnowledgeImage rows of collection kb:projectId, deletedAt IS NULL), org-scoped. Each row\'s storageKey is signed ON-READ (BUCKETS.MEDIA) into imageUrl — fail-safe: a failed signature yields imageUrl=null for that image and never drops the list. storageKey is never exposed.',
  path: '/projects/:id/sources/images' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = getUser(context)
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }
    const organizationId = user.currentOrgId

    const { id: projectId } = request.params as { id: string }
    if (!projectId || !UUID_REGEX.test(projectId)) {
      return response.badRequest('projectId inválido')
    }

    // Tenant-scoped project load (filtra por organizationId).
    const project = await loadProject(projectId, organizationId)
    if (!project) return response.notFound('Projeto não encontrado')

    // Lista org-scoped (deletadas omitidas). Se a collection kb:projectId ainda
    // não existe, o repository devolve [] — sem imagens a curar.
    const rows = await knowledgeImagesRepository.listProjectImages(
      projectId,
      organizationId,
    )

    // Assina storageKey on-read, fail-safe POR ITEM (Promise.all sobre uma função
    // que nunca rejeita — signImageRow engole a falha da assinatura individual).
    const images = await Promise.all(rows.map((row) => signImageRow(row)))

    return response.success({ images })
  },
})

// ---------------------------------------------------------------------------
// ROTA 2 — PATCH /sources/images/:imageId  (curadoria de uma imagem)
// ---------------------------------------------------------------------------

const patchSourceImage = igniter.mutation({
  name: 'Patch Builder Source Image',
  description:
    'Curate a single extracted image (exactly ONE action per call): set caption, soft-delete (deleted:true), or confirm/unconfirm (confirmed). Org-scoped via the repository updateMany ({id, organizationId}); affected count 0 ⇒ 404 (not found / no access).',
  path: '/sources/images/:imageId' as const,
  method: 'PATCH',
  use: [authOrApiKeyProcedure({ required: true })],
  body: patchImageBodySchema,
  handler: async ({ request, context, response }) => {
    const user = getUser(context)
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }
    const organizationId = user.currentOrgId

    const { imageId } = request.params as { imageId: string }
    if (!imageId || !UUID_REGEX.test(imageId)) {
      return response.badRequest('imageId inválido')
    }

    const parsedBody = patchImageBodySchema.safeParse(request.body)
    if (!parsedBody.success) {
      return response.badRequest(
        'Corpo inválido (informe caption, deleted ou confirmed)',
      )
    }
    const { caption, deleted, confirmed } = parsedBody.data

    // Precedência (uma ação por chamada): delete > confirmed > caption. O refine
    // do schema já garante que ao menos uma está presente.
    let affected: number
    let applied: 'deleted' | 'confirmed' | 'caption'
    if (deleted === true) {
      affected = await knowledgeImagesRepository.softDelete(
        imageId,
        organizationId,
      )
      applied = 'deleted'
    } else if (confirmed !== undefined) {
      affected = await knowledgeImagesRepository.setConfirmed(
        imageId,
        confirmed,
        organizationId,
      )
      applied = 'confirmed'
    } else {
      // caption !== undefined garantido pelo refine + ramos acima.
      affected = await knowledgeImagesRepository.patchCaption(
        imageId,
        caption ?? '',
        organizationId,
      )
      applied = 'caption'
    }

    if (affected === 0) {
      return response.notFound('Imagem não encontrada')
    }

    return response.success({ ok: true, imageId, applied })
  },
})

// ---------------------------------------------------------------------------
// ROTA 3 — POST /projects/:id/sources/images/bulk  (ações em massa)
// ---------------------------------------------------------------------------

const bulkSourceImages = igniter.mutation({
  name: 'Bulk Curate Builder Source Images',
  description:
    'Bulk-curate a project\'s extracted images, org-scoped: "approve_all" confirms every pending image (confirmedAt IS NULL, deletedAt IS NULL); "delete_low_quality" soft-deletes by a low-quality heuristic (missing caption / small dimensions). Returns the affected count.',
  path: '/projects/:id/sources/images/bulk' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: bulkImagesBodySchema,
  handler: async ({ request, context, response }) => {
    const user = getUser(context)
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }
    const organizationId = user.currentOrgId

    const { id: projectId } = request.params as { id: string }
    if (!projectId || !UUID_REGEX.test(projectId)) {
      return response.badRequest('projectId inválido')
    }

    const parsedBody = bulkImagesBodySchema.safeParse(request.body)
    if (!parsedBody.success) {
      return response.badRequest('Corpo inválido (action)')
    }
    const { action } = parsedBody.data

    // Tenant-scoped project load (filtra por organizationId).
    const project = await loadProject(projectId, organizationId)
    if (!project) return response.notFound('Projeto não encontrado')

    if (action === 'approve_all') {
      const { confirmed } = await knowledgeImagesRepository.bulkApproveAll(
        projectId,
        organizationId,
      )
      try {
        const collectionId = await resolveCollectionId(project, organizationId)
        if (collectionId) {
          await syncGalleryMediaAssets(collectionId, organizationId)
        }
      } catch (err) {
        console.warn(
          '[source-images] sync gallery->media pós-approve_all falhou:',
          err instanceof Error ? err.message : String(err),
        )
      }
      await invalidateProjectRefinement({
        projectId,
        organizationId,
        reason: 'Imagens de fonte foram aprovadas em massa depois do refinamento.',
      })
      return response.success({ action, confirmed })
    }

    // action === 'delete_low_quality'
    const { deleted } = await knowledgeImagesRepository.bulkDeleteLowQuality(
      projectId,
      organizationId,
    )
    await invalidateProjectRefinement({
      projectId,
      organizationId,
      reason:
        'Imagens de baixa qualidade foram removidas em massa depois do refinamento.',
    })
    return response.success({ action, deleted })
  },
})

// ---------------------------------------------------------------------------
// Export composition (spread into builder.controller by the integration owner)
// ---------------------------------------------------------------------------
//
// Paths absolutos resultantes (prefixo /builder + /api/v1):
//   GET   /api/v1/builder/projects/:id/sources/images
//   PATCH /api/v1/builder/sources/images/:imageId
//   POST  /api/v1/builder/projects/:id/sources/images/bulk

export const sourceImagesRoutes = {
  listSourceImages,
  patchSourceImage,
  bulkSourceImages,
}
