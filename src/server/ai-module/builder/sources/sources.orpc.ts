/**
 * Builder Sources — porta mecânica para oRPC (lote B3 do builder).
 *
 * Origem: ./sources.routes.ts (3 actions).
 *   ingestSources        POST /builder/projects/:id/sources/ingest
 *   sourcesStatus        GET  /builder/projects/:id/sources/status
 *   retrySourceSynthesis POST /builder/projects/:id/sources/:sourceId/synthesis/retry
 *
 * Helpers route-local (deriveSynthesisStatus etc.) copiados 1:1; serviços
 * (ingestSourceRefs, builder-state-db, enqueueSourceEnrich) REUSADOS.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { getDatabase } from '@/server/services/database'
import { enqueueSourceEnrich } from '@/server/services/jobs/source-enrich.queue'
import { loadProject } from '../knowledge/knowledge-helpers'
import { parseBuilderState } from '../cards/builder-state'
import { ingestSourceRefs } from './ingest-source-refs'
import {
  SOURCE_SYNTHESIS_MANUAL_RETRY_LIMIT,
  hasAnyProposalField,
  markSourceSynthesisRetryAtomic,
  patchSourceIngestionAtomic,
  readBuilderStateByProject,
} from './builder-state-db'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const projectIdParam = { id: z.string().uuid('projectId inválido') }
const authed = base.use(authOrApiKey)

// ---------------------------------------------------------------------------
// Helpers route-local — cópia 1:1 de sources.routes.ts
// ---------------------------------------------------------------------------

type SynthesisStatus = 'pending' | 'running' | 'ready' | 'error'

function hasProposal(value: ReturnType<typeof parseBuilderState>): boolean {
  const proposed = value.sourceIngestion.proposed
  return proposed ? hasAnyProposalField(proposed) : false
}

function deriveSynthesisStatus(
  rowStatus: string,
  mirrorStatus: SynthesisStatus | undefined,
  proposalExists: boolean,
): SynthesisStatus {
  if (mirrorStatus) return mirrorStatus
  if (rowStatus === 'error') return 'error'
  if (rowStatus === 'ready') return proposalExists ? 'ready' : 'error'
  if (rowStatus === 'processing' || rowStatus === 'running') return 'running'
  return 'pending'
}

function derivePollStatus(
  rowStatus: string,
  synthesisStatus: SynthesisStatus,
  proposalExists: boolean,
): string {
  if (
    rowStatus === 'ready' &&
    !proposalExists &&
    (synthesisStatus === 'pending' || synthesisStatus === 'running')
  ) {
    return 'processing'
  }
  return rowStatus
}

function retrySynthesisPath(projectId: string, sourceId: string): string {
  return `/api/v1/builder/projects/${projectId}/sources/${sourceId}/synthesis/retry`
}

function sourceRefType(
  value: string,
  mirrorType: 'url' | 'instagram' | undefined,
): 'url' | 'instagram' {
  if (mirrorType) return mirrorType
  try {
    const host = new URL(value).hostname.toLowerCase()
    return host === 'instagram.com' || host === 'www.instagram.com'
      ? 'instagram'
      : 'url'
  } catch {
    return /(^|\.)instagram\.com\//i.test(value) ? 'instagram' : 'url'
  }
}

const sourceRefSchema = z.object({
  value: z.string().url(),
  type: z.enum(['url', 'instagram']),
})

// ==========================================
// INGEST — POST /builder/projects/{id}/sources/ingest
// ==========================================
export const ingestSources = authed
  .route({
    method: 'POST',
    path: '/builder/projects/{id}/sources/ingest',
    summary: 'Ingest Builder Project Sources',
  })
  .input(
    z.object({
      ...projectIdParam,
      refs: z.array(sourceRefSchema).min(1).max(10),
    }),
  )
  .handler(async ({ input, context }) => {
    const { userId, orgId } = builderOrg(context)

    const project = await loadProject(input.id, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    const db = getDatabase()
    const conversation = await db.builderProjectConversation.findFirst({
      where: { projectId: input.id, organizationId: orgId },
      select: { id: true },
    })
    if (!conversation) {
      throw new ORPCError('NOT_FOUND', { message: 'Conversa do Builder não encontrada' })
    }

    const { collectionId, sources } = await ingestSourceRefs({
      project,
      conversationId: conversation.id,
      organizationId: orgId,
      userId,
      refs: input.refs,
    })

    return ok({ collectionId, sources })
  })

// ==========================================
// STATUS — GET /builder/projects/{id}/sources/status
// ==========================================
export const sourcesStatus = authed
  .route({
    method: 'GET',
    path: '/builder/projects/{id}/sources/status',
    summary: 'Get Builder Project Sources Status',
  })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const projectId = input.id

    const project = await loadProject(projectId, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    const db = getDatabase()
    const collection = await db.knowledgeCollection.findFirst({
      where: { organizationId: orgId, name: `kb:${projectId}` },
      select: { id: true },
    })

    const rows = collection
      ? await db.knowledgeSource.findMany({
          where: { collectionId: collection.id, organizationId: orgId },
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

    const state = parseBuilderState(await readBuilderStateByProject(projectId))
    const mirrorBySourceId = new Map(
      state.sourceIngestion.sources.flatMap((s) =>
        s.sourceId ? ([[s.sourceId, s]] as const) : [],
      ),
    )
    const proposalExists = hasProposal(state)

    const sources = rows.map((row) => {
      const mirror = mirrorBySourceId.get(row.id)
      const synthesisStatus = deriveSynthesisStatus(
        row.status,
        mirror?.synthesisStatus,
        proposalExists,
      )
      const status = derivePollStatus(row.status, synthesisStatus, proposalExists)
      const synthesisAttempts = mirror?.synthesisAttempts ?? 0
      const synthesisError =
        mirror?.synthesisError ??
        (synthesisStatus === 'error' && row.status === 'ready'
          ? 'Li o conteúdo, mas não consegui organizar os campos do negócio.'
          : undefined)
      const canRetrySynthesis =
        row.status === 'ready' &&
        synthesisStatus === 'error' &&
        synthesisAttempts < SOURCE_SYNTHESIS_MANUAL_RETRY_LIMIT
      return {
        ...row,
        status,
        value: row.source,
        sourceId: row.id,
        type: mirror?.type ?? row.type,
        ...(mirror?.imagesStatus ? { imagesStatus: mirror.imagesStatus } : {}),
        ...(mirror?.imagesCount !== undefined
          ? { imagesCount: mirror.imagesCount }
          : {}),
        synthesisStatus,
        ...(synthesisError ? { synthesisError } : {}),
        synthesisAttempts,
        canRetrySynthesis,
        retrySynthesis: canRetrySynthesis
          ? {
              method: 'POST' as const,
              path: retrySynthesisPath(projectId, row.id),
            }
          : null,
      }
    })

    return ok({
      sources,
      proposed: state.sourceIngestion.proposed ?? null,
    })
  })

// ==========================================
// RETRY SYNTHESIS — POST /builder/projects/{id}/sources/{sourceId}/synthesis/retry
// ==========================================
export const retrySourceSynthesis = authed
  .route({
    method: 'POST',
    path: '/builder/projects/{id}/sources/{sourceId}/synthesis/retry',
    summary: 'Retry Builder Source Synthesis',
  })
  .input(
    z.object({
      ...projectIdParam,
      sourceId: z.string().uuid('sourceId inválido'),
    }),
  )
  .handler(async ({ input, context }) => {
    const { userId, orgId } = builderOrg(context)
    const { id: projectId, sourceId } = input

    const project = await loadProject(projectId, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    const db = getDatabase()
    const [collection, conversation] = await Promise.all([
      db.knowledgeCollection.findFirst({
        where: { organizationId: orgId, name: `kb:${projectId}` },
        select: { id: true },
      }),
      db.builderProjectConversation.findFirst({
        where: { projectId, organizationId: orgId },
        select: { id: true },
      }),
    ])
    if (!collection) {
      throw new ORPCError('NOT_FOUND', { message: 'Coleção de conhecimento não encontrada' })
    }
    if (!conversation) {
      throw new ORPCError('NOT_FOUND', { message: 'Conversa do Builder não encontrada' })
    }

    const source = await db.knowledgeSource.findFirst({
      where: { id: sourceId, organizationId: orgId, collectionId: collection.id },
      select: {
        id: true,
        source: true,
        status: true,
        chunkCount: true,
        error: true,
      },
    })
    if (!source) throw new ORPCError('NOT_FOUND', { message: 'Fonte não encontrada' })

    if (source.status !== 'ready') {
      return ok({
        ok: true,
        queued: false,
        reason: 'source_not_ready',
        sourceId,
        status: source.status,
      })
    }

    const state = parseBuilderState(await readBuilderStateByProject(projectId))
    const mirror = state.sourceIngestion.sources.find(
      (item) => item.sourceId === sourceId,
    )

    const mark = await markSourceSynthesisRetryAtomic({
      conversationId: conversation.id,
      organizationId: orgId,
      source: {
        value: source.source,
        type: sourceRefType(source.source, mirror?.type),
        status: source.status,
        sourceId: source.id,
        ...(mirror?.imagesStatus ? { imagesStatus: mirror.imagesStatus } : {}),
        ...(mirror?.imagesCount !== undefined
          ? { imagesCount: mirror.imagesCount }
          : {}),
      },
    })

    if (!mark.ok) {
      return ok({
        ok: true,
        queued: false,
        reason: mark.reason,
        sourceId,
        synthesisStatus: mark.reason === 'already_running' ? 'running' : 'error',
        synthesisAttempts: mark.attempt,
        canRetrySynthesis: mark.reason !== 'retry_limit_reached',
      })
    }

    const enqueueResult = await enqueueSourceEnrich(
      {
        organizationId: orgId,
        userId,
        projectId,
        conversationId: conversation.id,
        sourceIds: [sourceId],
        mode: 'synthesis_retry',
        synthesisAttempt: mark.attempt,
      },
      {
        jobId: `source-synthesis-retry:${projectId}:${sourceId}:${mark.attempt}`,
      },
    )

    if (!enqueueResult.enqueued) {
      await patchSourceIngestionAtomic(conversation.id, orgId, {
        synthesisBySourceId: new Map([
          [
            sourceId,
            {
              synthesisStatus: 'error',
              synthesisError: 'Não consegui iniciar nova tentativa agora.',
              synthesisAttempts: mark.attempt,
            },
          ],
        ]),
      })
      throw new ORPCError('BAD_REQUEST', {
        message: 'Não consegui iniciar nova tentativa agora',
      })
    }

    return ok({
      ok: true,
      queued: true,
      sourceId,
      synthesisStatus: 'running',
      synthesisAttempts: mark.attempt,
      canRetrySynthesis: false,
      retrySynthesis: {
        method: 'POST' as const,
        path: retrySynthesisPath(projectId, sourceId),
      },
    })
  })

export const sourcesActions = {
  ingestSources,
  sourcesStatus,
  retrySourceSynthesis,
}
