/**
 * Builder Knowledge-sources — porta mecânica para oRPC (lote B3 do builder).
 *
 * Origem: ./knowledge-source.routes.ts (3 actions).
 *   addUrlSource  POST   /builder/knowledge/:projectId/source/url
 *   addTextSource POST   /builder/knowledge/:projectId/source/text
 *   deleteSource  DELETE /builder/knowledge/:projectId/source/:sourceId
 *
 * Upload de PDF é multipart → /api/v1/knowledge/upload (route handler Next,
 * fora do escopo desta migração).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { getDatabase } from '@/server/services/database'
import { ingestSource } from '@/server/ai-module/ai-agents/knowledge/knowledge-ingestion.service'
import { ensureCollectionIdOrThrow, loadProject } from './knowledge-helpers'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const projectIdParam = { projectId: z.string().min(1, 'projectId obrigatório') }
const authed = base.use(authOrApiKey)

// ==========================================
// ADD URL — POST /builder/knowledge/{projectId}/source/url
// ==========================================
export const addUrlSource = authed
  .route({
    method: 'POST',
    path: '/builder/knowledge/{projectId}/source/url',
    summary: 'Add URL Knowledge Source',
  })
  .input(
    z.object({
      ...projectIdParam,
      url: z.string().url(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const project = await loadProject(input.projectId, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    const collectionId = await ensureCollectionIdOrThrow(project, orgId)
    const db = getDatabase()
    const source = await db.knowledgeSource.create({
      data: {
        collectionId,
        organizationId: orgId,
        type: 'url',
        source: input.url,
        status: 'pending',
      },
      select: { id: true },
    })

    const result = await ingestSource(source.id, {
      expectedOrganizationId: orgId,
    })
    return ok(result)
  })

// ==========================================
// ADD TEXT — POST /builder/knowledge/{projectId}/source/text
// ==========================================
export const addTextSource = authed
  .route({
    method: 'POST',
    path: '/builder/knowledge/{projectId}/source/text',
    summary: 'Add Text Knowledge Source',
  })
  .input(
    z.object({
      ...projectIdParam,
      title: z.string().max(160).optional(),
      text: z.string().min(1).max(200_000),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const project = await loadProject(input.projectId, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    const collectionId = await ensureCollectionIdOrThrow(project, orgId)
    const db = getDatabase()
    const source = await db.knowledgeSource.create({
      data: {
        collectionId,
        organizationId: orgId,
        type: 'text',
        source: input.title ?? 'Texto colado',
        status: 'pending',
      },
      select: { id: true },
    })

    const result = await ingestSource(source.id, {
      rawText: input.text,
      expectedOrganizationId: orgId,
    })
    return ok(result)
  })

// ==========================================
// DELETE — DELETE /builder/knowledge/{projectId}/source/{sourceId}
// ==========================================
export const deleteSource = authed
  .route({
    method: 'DELETE',
    path: '/builder/knowledge/{projectId}/source/{sourceId}',
    summary: 'Delete Knowledge Source',
  })
  .input(
    z.object({
      ...projectIdParam,
      sourceId: z.string().min(1, 'sourceId obrigatório'),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const project = await loadProject(input.projectId, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    const db = getDatabase()
    // Isolamento multi-tenant: a fonte precisa ser da org.
    const source = await db.knowledgeSource.findFirst({
      where: { id: input.sourceId, organizationId: orgId },
      select: { id: true },
    })
    if (!source) throw new ORPCError('NOT_FOUND', { message: 'Fonte não encontrada' })

    // Fotos da fonte que já viraram MediaAsset (materialização gallery) ficariam
    // ÓRFÃS no catálogo do agente até o próximo deploy — soft-delete junto.
    const images = await db.knowledgeImage.findMany({
      where: { sourceId: source.id, organizationId: orgId },
      select: { id: true },
    })
    if (images.length > 0) {
      await db.mediaAsset.updateMany({
        where: {
          source: 'gallery',
          sourceRef: { in: images.map((i) => i.id) },
          organizationId: orgId,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      })
    }

    await db.knowledgeSource.delete({ where: { id: source.id } })
    return ok({ deleted: true })
  })

export const knowledgeSourceActions = { addUrlSource, addTextSource, deleteSource }
