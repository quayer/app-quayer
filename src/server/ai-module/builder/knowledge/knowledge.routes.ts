/**
 * Knowledge routes — estado da base + gestão da coleção.
 *
 *   GET   /knowledge/:projectId            — coleção + fontes + status (useRAG)
 *   POST  /knowledge/:projectId/collection — cria/garante a coleção e liga ao agente
 *   PATCH /knowledge/:projectId            — liga/desliga useRAG no agente
 *
 * Rotas de fontes (URL/texto/delete) ficam em knowledge-source.routes.ts.
 * Upload de PDF é multipart → /api/v1/knowledge/upload (route handler).
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import {
  ensureCollection as ensureCollectionFor,
  loadProject,
  resolveCollectionId,
  type AuthedUser,
} from './knowledge-helpers'

const getKnowledge = igniter.query({
  name: 'Get Knowledge Base',
  description: 'Retorna a coleção RAG do projeto, suas fontes e o status (useRAG).',
  path: '/knowledge/:projectId' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')

    const db = getDatabase()
    const collectionId = await resolveCollectionId(project, user.currentOrgId)

    let useRAG = false
    if (project.aiAgentId) {
      const agent = await db.aIAgentConfig.findUnique({
        where: { id: project.aiAgentId },
        select: { useRAG: true },
      })
      useRAG = agent?.useRAG ?? false
    }

    if (!collectionId) return response.success({ collection: null, sources: [], useRAG })

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

    return response.success({ collection, sources, useRAG })
  },
})

const ensureCollection = igniter.mutation({
  name: 'Ensure Knowledge Collection',
  description: 'Cria (idempotente) a coleção RAG do projeto e a vincula ao agente.',
  path: '/knowledge/:projectId/collection' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({ description: z.string().max(400).optional() }),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')

    const collection = await ensureCollectionFor(
      project,
      user.currentOrgId,
      request.body.description,
    )
    return response.success({ collection })
  },
})

const toggleRAG = igniter.mutation({
  name: 'Toggle RAG',
  description: 'Liga/desliga o uso da base de conhecimento pelo agente (useRAG).',
  path: '/knowledge/:projectId' as const,
  method: 'PATCH',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({ enabled: z.boolean() }),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')
    if (!project.aiAgentId) return response.badRequest('Projeto ainda não tem agente publicado')

    const db = getDatabase()
    await db.aIAgentConfig.update({
      where: { id: project.aiAgentId },
      data: { useRAG: request.body.enabled },
    })
    return response.success({ useRAG: request.body.enabled })
  },
})

export const knowledgeRoutes = { getKnowledge, ensureCollection, toggleRAG }
