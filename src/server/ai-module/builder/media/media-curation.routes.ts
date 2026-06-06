/**
 * Builder Module — Media CURATION routes (Fase E / E4).
 *
 * A camada de API que o FE de curadoria de mídia (aba "Mídias") consome para
 * LISTAR e CURAR o CATÁLOGO DE MÍDIA enviável pelo agente (foto/vídeo/PDF — NÃO
 * áudio). Espelho FINO de `sources/source-images.routes.ts` (D2): dois
 * orquestradores sob o prefixo /builder, com sign-on-read fail-safe.
 *
 * As mídias vivem no model de RUNTIME `MediaAsset` (tabela media_assets), com três
 * origens (`source`):
 *   - 'upload'  → o dono subiu via POST /api/v1/builder/media/upload (E1). storageKey
 *                 no BUCKETS.MEDIA → assina on-read.
 *   - 'gallery' → materializadas das KnowledgeImage confirmadas (Onda D). storageKey
 *                 no BUCKETS.MEDIA → assina on-read.
 *   - 'pricing' → materializadas de PriceItem.imageUrl (M2). externalUrl https direto
 *                 (URL externa, hospedada fora) → usada SEM assinar.
 *
 *   GET   /projects/:id/media
 *     Lista os MediaAsset da collection do projeto (deletedAt IS NULL), org-scoped +
 *     ownership real (loadProject). Para CADA item: se externalUrl != null usa-a
 *     direto (pricing); senão assina storageKey on-read via
 *     storage.getSignedUrl(BUCKETS.MEDIA, …) — a signed URL NUNCA é persistida.
 *     FAIL-SAFE: se a assinatura de UM item falhar (ou o storage estiver
 *     indisponível), `url=null` para AQUELE item — nunca derruba a lista. O
 *     storageKey NÃO é exposto ao FE. Projeto sem KB (sem collection) ⇒ { media: [] }
 *     (no-op limpo, igual ao materialize).
 *
 *   PATCH /media/:mediaId  { caption? | deleted? | confirmed? }
 *     Curadoria de UMA mídia (exatamente UMA ação por chamada). Ownership via org: o
 *     updateMany filtra por organizationId — contagem afetada 0 ⇒ 404 (inexistente /
 *     sem acesso / outra org). Soft-delete só "deleta" (não des-deleta); confirmed
 *     alterna confirmedAt = now()|null; caption trima (vazio → null).
 *
 * RULES: orquestradores finos, TS strict, zero `any`, Zod em TODO input, TODA query
 * filtrada por organizationId (defense-in-depth, além do collectionId). A assinatura
 * de storageKey é a única responsabilidade "pesada" desta camada e é fail-safe por
 * design.
 *
 * Paths absolutos resultantes (prefixo /builder + /api/v1):
 *   GET   /api/v1/builder/projects/:id/media
 *   PATCH /api/v1/builder/media/:mediaId
 */

import { z } from 'zod'

import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { BUCKETS, storage } from '@/server/services/storage'

import { loadProject, resolveCollectionId } from '../knowledge/knowledge-helpers'
import {
  mediaCurationRepository,
  type MediaAssetRow,
} from './media-curation.repository'

// ---------------------------------------------------------------------------
// Local utilities (mirror source-images.routes.ts / chat.routes.ts guards)
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
// Domínio mínimo de tipos (estreito sobre os campos do MediaAsset que tocamos).
// ---------------------------------------------------------------------------

type MediaType = 'image' | 'video' | 'document'
type MediaSource = 'upload' | 'gallery' | 'pricing'

// `MediaAssetRow` (linha crua do MediaAsset, com storageKey/externalUrl ANTES da
// resolução de url) é importado da camada de DADOS (media-curation.repository).

// ---------------------------------------------------------------------------
// Shape exposto ao FE — storageKey NÃO aparece (só `url`: signed on-read OU
// externalUrl https direto). Datas viram ISO string para serialização estável.
// ---------------------------------------------------------------------------

interface MediaAssetItem {
  id: string
  /** signed URL on-read (BUCKETS.MEDIA) OU externalUrl https; null se assinar falhar. */
  url: string | null
  mediaType: MediaType
  caption: string | null
  category: string | null
  source: MediaSource
  mimeType: string | null
  /** ISO; null = pendente de curadoria. (aditivo p/ o FE distinguir pendente/confirmado.) */
  confirmedAt: string | null
}

/** Normaliza um valor de mediaType cru para o union do FE (default seguro: 'document'). */
function toMediaType(value: string): MediaType {
  if (value === 'image' || value === 'video' || value === 'document') return value
  return 'document'
}

/** Normaliza um valor de source cru para o union do FE (default seguro: 'upload'). */
function toMediaSource(value: string): MediaSource {
  if (value === 'upload' || value === 'gallery' || value === 'pricing') return value
  return 'upload'
}

/**
 * Resolve a `url` de UMA mídia on-read. FAIL-SAFE (espelha signImageRow do D2):
 *   1. externalUrl != null  → usa-a DIRETO (pricing; URL https externa, não assina).
 *   2. senão storageKey != null → assina via storage.getSignedUrl(BUCKETS.MEDIA, …)
 *      dentro de try/catch — qualquer erro (storage indisponível, key inexistente,
 *      hiccup de rede) vira `url=null` para AQUELE item, nunca propaga, nunca derruba
 *      a lista (console.warn).
 *   3. senão → url=null.
 * O storageKey é deliberadamente omitido da resposta (só a url chega ao FE).
 */
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

// ---------------------------------------------------------------------------
// A camada de DADOS (listProjectMedia / softDelete / setConfirmed / patchCaption)
// vive em `media-curation.repository.ts` (espelha knowledge-images.repository):
// ORG-SCOPED SEMPRE, mutações via updateMany por organizationId (id de outra org
// afeta 0 linhas → a rota traduz 0 → 404), nunca assina storageKey (isso é a
// responsabilidade da ROTA via signMediaRow, fail-safe lá).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Input schemas (Zod)
// ---------------------------------------------------------------------------

/**
 * Curadoria de UMA mídia: exatamente UMA ação por chamada. Todas opcionais, mas o
 * refine garante ao menos uma. `deleted` é literal `true` (só soft-delete; não
 * "des-deleta"). A precedência das ações vive no handler. ESPELHA patchImageBodySchema.
 */
const patchMediaBodySchema = z
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

// ---------------------------------------------------------------------------
// ROTA 1 — GET /projects/:id/media  (lista + resolve url on-read fail-safe)
// ---------------------------------------------------------------------------

const listProjectMediaRoute = igniter.query({
  name: 'List Builder Project Media',
  description:
    "List the media catalog the agent can send (MediaAsset rows of the project's collection, deletedAt IS NULL), org-scoped + ownership. Each row's url is resolved ON-READ: externalUrl used directly (pricing), else storageKey signed (BUCKETS.MEDIA) — fail-safe: a failed signature yields url=null for that item and never drops the list. storageKey is never exposed. Project without KB ⇒ { media: [] }.",
  path: '/projects/:id/media' as const,
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

    // Tenant-scoped project load (filtra por organizationId) — org guard real.
    const project = await loadProject(projectId, organizationId)
    if (!project) return response.notFound('Projeto não encontrado')

    // Resolve a collection do projeto. Sem KB ainda (FK NOT NULL) ⇒ no-op limpo:
    // não há collection alvo, logo nada a curar (igual ao materialize).
    const collectionId = await resolveCollectionId(project, organizationId)
    if (!collectionId) return response.success({ media: [] })

    // Lista org-scoped (deletadas omitidas; SEMPRE filtra organizationId além do
    // collectionId — defense-in-depth).
    const rows = await mediaCurationRepository.listProjectMedia(
      collectionId,
      organizationId,
    )

    // Resolve url on-read, fail-safe POR ITEM (Promise.all sobre uma função que
    // nunca rejeita — signMediaRow engole a falha da assinatura individual).
    const media = await Promise.all(rows.map((row) => signMediaRow(row)))

    return response.success({ media })
  },
})

// ---------------------------------------------------------------------------
// ROTA 2 — PATCH /media/:mediaId  (curadoria de uma mídia)
// ---------------------------------------------------------------------------

const patchMediaAssetRoute = igniter.mutation({
  name: 'Patch Builder Media Asset',
  description:
    'Curate a single media asset (exactly ONE action per call): set caption, soft-delete (deleted:true), or confirm/unconfirm (confirmed). Org-scoped via updateMany ({id, organizationId}); affected count 0 ⇒ 404 (not found / no access / other org).',
  path: '/media/:mediaId' as const,
  method: 'PATCH',
  use: [authOrApiKeyProcedure({ required: true })],
  body: patchMediaBodySchema,
  handler: async ({ request, context, response }) => {
    const user = getUser(context)
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }
    const organizationId = user.currentOrgId

    const { mediaId } = request.params as { mediaId: string }
    if (!mediaId || !UUID_REGEX.test(mediaId)) {
      return response.badRequest('mediaId inválido')
    }

    const parsedBody = patchMediaBodySchema.safeParse(request.body)
    if (!parsedBody.success) {
      return response.badRequest(
        'Corpo inválido (informe caption, deleted ou confirmed)',
      )
    }
    const { caption, deleted, confirmed } = parsedBody.data

    // Precedência (uma ação por chamada): deleted > confirmed > caption. O refine
    // do schema já garante que ao menos uma está presente.
    let affected: number
    let applied: 'deleted' | 'confirmed' | 'caption'
    if (deleted === true) {
      affected = await mediaCurationRepository.softDelete(mediaId, organizationId)
      applied = 'deleted'
    } else if (confirmed !== undefined) {
      affected = await mediaCurationRepository.setConfirmed(
        mediaId,
        confirmed,
        organizationId,
      )
      applied = 'confirmed'
    } else {
      // caption !== undefined garantido pelo refine + ramos acima.
      affected = await mediaCurationRepository.patchCaption(
        mediaId,
        caption ?? '',
        organizationId,
      )
      applied = 'caption'
    }

    if (affected === 0) {
      return response.notFound('Mídia não encontrada')
    }

    return response.success({ ok: true, mediaId, applied })
  },
})

// ---------------------------------------------------------------------------
// Export composition (spread into builder.controller by the integration owner)
// ---------------------------------------------------------------------------
//
// Paths absolutos resultantes (prefixo /builder + /api/v1):
//   GET   /api/v1/builder/projects/:id/media
//   PATCH /api/v1/builder/media/:mediaId
//
// Nomes tipados no client (após regen do igniter.schema.ts):
//   api.builder.listProjectMedia  (useQuery)
//   api.builder.patchMediaAsset   (useMutation)

export const mediaCurationRoutes = {
  listProjectMedia: listProjectMediaRoute,
  patchMediaAsset: patchMediaAssetRoute,
}
