/**
 * Builder Module — shared source-ingestion seed (Orayon Uplift, W4)
 *
 * The create + seed + enqueue core of "cole seu site/IG", extracted so the two
 * entrypoints share ONE implementation:
 *   - chat.routes.ts  → kickoffSourceIngestion (fire-and-forget on a chat turn)
 *   - sources.routes.ts → POST /projects/:id/sources/ingest (explicit)
 *
 * Steps (all org-scoped):
 *   1. ensureCollectionIdOrThrow — resolve (or lazily create + wire) the
 *      per-project kb collection that backs the agent's RAG.
 *   2. Create one KnowledgeSource (status=pending) per ref, org-stamped. Both
 *      'url' and 'instagram' refs flow through the SAME url fetch path on the
 *      job (Instagram is instagram.com/<handle>), so KnowledgeSource.type is
 *      always 'url'.
 *   3. Seed builderState.sourceIngestion.sources via the RACE-SAFE atomic patch
 *      (patchSourceIngestionAtomic) so a concurrent applyCardSubmit/enrich-job
 *      write can't clobber it, and the source_progress card can poll/render
 *      immediately.
 *   4. Enqueue ONE async quayer:source-enrich job for all created sources.
 *      Enrichment NEVER runs inline here — the producer owns the dev
 *      sync-fallback flag (SOURCE_ENRICH_SYNC), and even that runs off-thread.
 *
 * RULES: TS strict, zero `any`, EVERY query filtered by organizationId.
 */

import { database } from '@/server/services/database'

import { ensureCollectionIdOrThrow, type ProjectRow } from '../knowledge/knowledge-helpers'
import { enqueueSourceEnrich } from '@/server/services/jobs/source-enrich.queue'
import type { SourceIngestionItem } from '../cards/builder-state'
import { patchSourceIngestionAtomic } from './builder-state-db'

/** A ref to ingest. Shape shared by `extractSourceRefs` and the POST body. */
export interface IngestRef {
  /** Normalized absolute http(s) URL (Instagram already canonicalized). */
  value: string
  type: 'url' | 'instagram'
}

export interface IngestSourceRefsArgs {
  /** The owning project (already loaded + org-verified by the caller). */
  project: ProjectRow
  /** Conversation that holds the builderState to seed. */
  conversationId: string
  /** Tenant boundary — stamped on every row + every query. */
  organizationId: string
  /** For BYOK org-key resolution on the enrich job. */
  userId: string
  /** Refs to ingest (already capped/validated by the caller). */
  refs: IngestRef[]
}

export interface IngestSourceRefsResult {
  /** The project's kb collection id (resolved or lazily created). */
  collectionId: string
  /** The freshly-seeded source items mirrored into builderState. */
  sources: SourceIngestionItem[]
}

/**
 * Create KnowledgeSource rows for the given refs, seed builderState, and enqueue
 * the async enrich job. Returns the collectionId + seeded items. Throws only on
 * a genuine failure (collection resolution / DB) — callers that must not block a
 * response (the chat hook) wrap this in `void … .catch(…)`.
 */
export async function ingestSourceRefs(
  args: IngestSourceRefsArgs,
): Promise<IngestSourceRefsResult> {
  const { project, conversationId, organizationId, userId, refs } = args

  // 1. Resolve (or lazily create + wire) the per-project kb collection.
  const collectionId = await ensureCollectionIdOrThrow(project, organizationId)

  // 2. One KnowledgeSource per ref, org-stamped, status=pending. The async job
  //    reloads these by id and runs ingestSource() (org-guarded, idempotent).
  const created: { id: string; ref: IngestRef }[] = []
  for (const ref of refs) {
    const row = await database.knowledgeSource.create({
      data: {
        collectionId,
        organizationId,
        // KnowledgeSource.type is the ingestion fetcher's contract → 'url' for
        // every web ref (Instagram is instagram.com/<handle>).
        type: 'url',
        source: ref.value,
        status: 'pending',
      },
      select: { id: true },
    })
    created.push({ id: row.id, ref })
  }

  const seeded: SourceIngestionItem[] = created.map(({ id, ref }) => ({
    value: ref.value,
    type: ref.type,
    status: 'pending',
    sourceId: id,
  }))

  // 3. Seed builderState.sourceIngestion.sources via the race-safe atomic patch
  //    (only the sourceIngestion subtree is touched; concurrent card submits and
  //    the enrich job can't clobber each other).
  await patchSourceIngestionAtomic(conversationId, organizationId, {
    seedSources: seeded,
  })

  // 4. Enqueue ONE async enrichment job for all created sources. Enrichment NEVER
  //    runs inline — the producer owns the dev sync-fallback flag.
  await enqueueSourceEnrich({
    organizationId,
    userId,
    projectId: project.id,
    conversationId,
    sourceIds: created.map((c) => c.id),
  })

  return { collectionId, sources: seeded }
}
