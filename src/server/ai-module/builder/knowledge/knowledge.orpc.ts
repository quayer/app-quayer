/**
 * Builder Knowledge — porta mecânica para oRPC (lote B3 do builder).
 *
 * Origem: ./knowledge.routes.ts (3 actions).
 *   getKnowledge     GET   /builder/knowledge/:projectId
 *   ensureCollection POST  /builder/knowledge/:projectId/collection
 *   toggleRAG        PATCH /builder/knowledge/:projectId
 *
 * NOTA: o original valida apenas a PRESENÇA de projectId (sem checagem de
 * UUID) — preservado com z.string().min(1).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { getDatabase } from '@/server/services/database'
import { invalidateProjectRefinement } from '../refinement/refinement-state'
import {
  ensureCollection as ensureCollectionFor,
  loadProject,
  resolveCollectionId,
} from './knowledge-helpers'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const projectIdParam = { projectId: z.string().min(1, 'projectId obrigatório') }
const authed = base.use(authOrApiKey)

// ==========================================
// GET — GET /builder/knowledge/{projectId}
// ==========================================
export const getKnowledge = authed
  .route({
    method: 'GET',
    path: '/builder/knowledge/{projectId}',
    summary: 'Get Knowledge Base',
  })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const project = await loadProject(input.projectId, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    const db = getDatabase()
    const collectionId = await resolveCollectionId(project, orgId)

    let useRAG = false
    if (project.aiAgentId) {
      const agent = await db.aIAgentConfig.findUnique({
        where: { id: project.aiAgentId },
        select: { useRAG: true },
      })
      useRAG = agent?.useRAG ?? false
    }

    if (!collectionId) return ok({ collection: null, sources: [], useRAG })

    const [collection, sources] = await Promise.all([
      db.knowledgeCollection.findUnique({
        where: { id: collectionId },
        select: { id: true, name: true, description: true, isActive: true },
      }),
      db.knowledgeSource.findMany({
        where: { collectionId },
        select: {
          id: true,
          type: true,
          source: true,
          status: true,
          error: true,
          chunkCount: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ])

    return ok({ collection, sources, useRAG })
  })

// ==========================================
// ENSURE COLLECTION — POST /builder/knowledge/{projectId}/collection
// ==========================================
export const ensureCollection = authed
  .route({
    method: 'POST',
    path: '/builder/knowledge/{projectId}/collection',
    summary: 'Ensure Knowledge Collection',
  })
  .input(
    z.object({
      ...projectIdParam,
      description: z.string().max(400).optional(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const project = await loadProject(input.projectId, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    const collection = await ensureCollectionFor(project, orgId, input.description)
    await invalidateProjectRefinement({
      projectId: project.id,
      organizationId: orgId,
      reason: 'A coleção de conhecimento foi criada/vinculada depois do refinamento.',
    })
    return ok({ collection })
  })

// ==========================================
// TOGGLE RAG — PATCH /builder/knowledge/{projectId}
// ==========================================
export const toggleRAG = authed
  .route({
    method: 'PATCH',
    path: '/builder/knowledge/{projectId}',
    summary: 'Toggle RAG',
  })
  .input(
    z.object({
      ...projectIdParam,
      enabled: z.boolean(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const project = await loadProject(input.projectId, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })
    if (!project.aiAgentId) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Projeto ainda não tem agente publicado',
      })
    }

    const db = getDatabase()
    await db.aIAgentConfig.update({
      where: { id: project.aiAgentId },
      data: { useRAG: input.enabled },
    })
    await invalidateProjectRefinement({
      projectId: project.id,
      organizationId: orgId,
      reason: 'O uso de RAG foi alterado depois do refinamento.',
    })
    return ok({ useRAG: input.enabled })
  })

export const knowledgeActions = { getKnowledge, ensureCollection, toggleRAG }
