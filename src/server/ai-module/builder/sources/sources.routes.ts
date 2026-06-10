/**
 * Builder Module — Source-ingestion routes (Orayon Uplift, W4 source-ingestion)
 *
 * The "cole seu site/IG" surface. Two thin orchestrators under /builder:
 *
 *   POST /projects/:id/sources/ingest  { refs:[{value,type:'url'|'instagram'}] }
 *     1. Tenant-scoped load of the project + its per-project kb collection
 *        (ensureCollectionIdOrThrow — wires the agent's RAG).
 *     2. Create one KnowledgeSource row per ref (status=pending), org-stamped.
 *     3. Seed builderState.sourceIngestion.sources so the source_progress card
 *        can poll/render immediately (status mirrors the KnowledgeSource).
 *     4. Enqueue ONE enrichment job (enqueueSourceEnrich) — the async worker
 *        runs ingestSource() (extract→chunk→embed→pgvector) + synthesis and
 *        writes only PROPOSED values. Enrichment NEVER runs inline here; the
 *        producer's dev sync-fallback (SOURCE_ENRICH_SYNC=1) is the only path
 *        that may run it directly, and even then off the request thread.
 *
 *   GET /projects/:id/sources/status
 *     Poll target. Returns each KnowledgeSource for the project's collection
 *     ({id,source,type,status,chunkCount,error}) plus the synthesized
 *     builderState.sourceIngestion.proposed. Every query filtered by org.
 *
 * RULES: thin orchestrators (heavy lifting lives in the reused services), TS
 * strict, zero `any`, Zod inputs, EVERY query filtered by organizationId. We
 * never add a new fetch path — extraction happens on the job via the existing
 * SSRF-guarded fetcher.
 *
 * The create+seed+enqueue core is shared with the chat-turn hook via
 * ./ingest-source-refs; builderState reads go through ./builder-state-db (the
 * `builderState` column is now in the generated Prisma client, so the cast lives
 * in ONE place there). Spec: docs/builder/ORAYON_UPLIFT_SPEC.md §5.
 */

import { z } from 'zod'

import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'

import { loadProject } from '../knowledge/knowledge-helpers'
import { parseBuilderState } from '../cards/builder-state'
import { ingestSourceRefs } from './ingest-source-refs'
import { readBuilderStateByProject } from './builder-state-db'

// ---------------------------------------------------------------------------
// Local utilities (mirror chat.routes.ts / card-submit.routes.ts guards)
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
// Input schema — refs to ingest
// ---------------------------------------------------------------------------

/**
 * A single source ref produced by the pure `extractSourceRefs` (url-extractor):
 * `value` is always a normalized absolute http(s) URL (Instagram handles are
 * already canonicalized to https://www.instagram.com/<handle>).
 */
const sourceRefSchema = z.object({
  value: z.string().url(),
  type: z.enum(['url', 'instagram']),
})

const ingestSourcesBodySchema = z.object({
  refs: z.array(sourceRefSchema).min(1).max(10),
})

// ---------------------------------------------------------------------------
// ingestSources — create KnowledgeSource rows + seed state + enqueue enrich
// ---------------------------------------------------------------------------

const ingestSources = igniter.mutation({
  name: 'Ingest Builder Project Sources',
  description:
    'Create a KnowledgeSource (status=pending) per pasted site/Instagram ref, seed builderState.sourceIngestion.sources, and enqueue the async quayer:source-enrich job (extract→chunk→embed→pgvector + proposed-only synthesis). Enrichment never runs inline.',
  path: '/projects/:id/sources/ingest' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: ingestSourcesBodySchema,
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

    const parsedBody = ingestSourcesBodySchema.safeParse(request.body)
    if (!parsedBody.success) {
      return response.badRequest('Corpo inválido (refs)')
    }
    const { refs } = parsedBody.data

    // Tenant-scoped project load. loadProject filters by organizationId.
    const project = await loadProject(projectId, organizationId)
    if (!project) return response.notFound('Projeto não encontrado')

    // The conversation is where the source-ingestion state lives. Scope by org.
    const db = getDatabase()
    const conversation = await db.builderProjectConversation.findFirst({
      where: { projectId, organizationId },
      select: { id: true },
    })
    if (!conversation) {
      return response.notFound('Conversa do Builder não encontrada')
    }

    // Create KnowledgeSource rows + seed builderState (race-safe) + enqueue the
    // async enrich job. Shared with the chat-turn hook so both entrypoints stay
    // byte-identical. Enrichment never runs inline (producer owns the flag).
    const { collectionId, sources } = await ingestSourceRefs({
      project,
      conversationId: conversation.id,
      organizationId,
      userId: user.id,
      refs,
    })

    return response.success({
      collectionId,
      sources,
    })
  },
})

// ---------------------------------------------------------------------------
// sourcesStatus — poll target: KnowledgeSource rows + proposed synthesis
// ---------------------------------------------------------------------------

const sourcesStatus = igniter.query({
  name: 'Get Builder Project Sources Status',
  description:
    'Poll the status of a project\'s ingested sources: each KnowledgeSource ({id,source,type,status,chunkCount,error}) for the project collection plus the synthesized builderState.sourceIngestion.proposed (PROPOSED values awaiting Aceitar). Org-scoped.',
  path: '/projects/:id/sources/status' as const,
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

    // Tenant-scoped project load (filters by organizationId).
    const project = await loadProject(projectId, organizationId)
    if (!project) return response.notFound('Projeto não encontrado')

    // Resolve the project's kb collection. If none exists yet (no source ever
    // added) there are simply no sources to report — return an empty list
    // instead of forcing a collection to be created on a read.
    const db = getDatabase()
    const collection = await db.knowledgeCollection.findFirst({
      where: { organizationId, name: `kb:${projectId}` },
      select: { id: true },
    })

    const rows = collection
      ? await db.knowledgeSource.findMany({
          // Double tenant guard: org on the source AND its collection.
          where: { collectionId: collection.id, organizationId },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            source: true,
            type: true,
            status: true,
            chunkCount: true,
            error: true,
          },
        })
      : []

    // Proposed synthesis + the per-source mirror (ref type 'url'|'instagram',
    // imagesStatus/imagesCount) live on the conversation's builderState. Read it
    // via the centralized accessor (builder-state-db).
    const state = parseBuilderState(await readBuilderStateByProject(projectId))
    const mirrorBySourceId = new Map(
      state.sourceIngestion.sources.flatMap((s) =>
        s.sourceId ? ([[s.sourceId, s]] as const) : [],
      ),
    )

    // Response shape: keep the original row fields (id/source/...) AND the
    // card-contract fields the source_progress poll parses (`value`, `sourceId`,
    // ref `type`, `imagesStatus`, `imagesCount`). Without these aliases the FE
    // parser drops every entry (it requires `value`) and the card never settles.
    const sources = rows.map((row) => {
      const mirror = mirrorBySourceId.get(row.id)
      return {
        ...row,
        value: row.source,
        sourceId: row.id,
        // KnowledgeSource.type is always 'url' (fetcher contract); the REF type
        // ('url'|'instagram') lives on the builderState mirror.
        type: mirror?.type ?? row.type,
        ...(mirror?.imagesStatus ? { imagesStatus: mirror.imagesStatus } : {}),
        ...(mirror?.imagesCount !== undefined
          ? { imagesCount: mirror.imagesCount }
          : {}),
      }
    })

    return response.success({
      sources,
      proposed: state.sourceIngestion.proposed ?? null,
    })
  },
})

// ---------------------------------------------------------------------------
// Export composition (spread into builder.controller by the integration owner)
// ---------------------------------------------------------------------------

export const sourcesRoutes = {
  ingestSources,
  sourcesStatus,
}
