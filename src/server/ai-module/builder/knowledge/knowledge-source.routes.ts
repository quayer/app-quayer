/**
 * Knowledge source routes — adicionar/remover fontes da base.
 *
 *   POST   /knowledge/:projectId/source/url       — URL (ingestão síncrona)
 *   POST   /knowledge/:projectId/source/text      — texto colado
 *   DELETE /knowledge/:projectId/source/:sourceId — remove (chunks cascade)
 *
 * Upload de PDF é multipart → /api/v1/knowledge/upload (route handler).
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import { ingestSource } from '@/server/ai-module/ai-agents/knowledge/knowledge-ingestion.service'
import {
  ensureCollectionIdOrThrow,
  loadProject,
  type AuthedUser,
} from './knowledge-helpers'

const addUrlSource = igniter.mutation({
  name: 'Add URL Knowledge Source',
  description: 'Adiciona uma URL à base e dispara a ingestão (extrai, chunk, embeda).',
  path: '/knowledge/:projectId/source/url' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({ url: z.string().url() }),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')

    const collectionId = await ensureCollectionIdOrThrow(project, user.currentOrgId)
    const db = getDatabase()
    const source = await db.knowledgeSource.create({
      data: {
        collectionId,
        organizationId: user.currentOrgId,
        type: 'url',
        source: request.body.url,
        status: 'pending',
      },
      select: { id: true },
    })

    const result = await ingestSource(source.id, {
      expectedOrganizationId: user.currentOrgId,
    })
    return response.success(result)
  },
})

const addTextSource = igniter.mutation({
  name: 'Add Text Knowledge Source',
  description: 'Adiciona um texto colado à base e dispara a ingestão.',
  path: '/knowledge/:projectId/source/text' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({
    title: z.string().max(160).optional(),
    text: z.string().min(1).max(200_000),
  }),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')

    const collectionId = await ensureCollectionIdOrThrow(project, user.currentOrgId)
    const db = getDatabase()
    const source = await db.knowledgeSource.create({
      data: {
        collectionId,
        organizationId: user.currentOrgId,
        type: 'text',
        source: request.body.title ?? 'Texto colado',
        status: 'pending',
      },
      select: { id: true },
    })

    const result = await ingestSource(source.id, {
      rawText: request.body.text,
      expectedOrganizationId: user.currentOrgId,
    })
    return response.success(result)
  },
})

const deleteSource = igniter.mutation({
  name: 'Delete Knowledge Source',
  description: 'Remove uma fonte da base (chunks são apagados em cascade).',
  path: '/knowledge/:projectId/source/:sourceId' as const,
  method: 'DELETE',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string; sourceId?: string }
    if (!params.projectId || !params.sourceId) {
      return response.badRequest('projectId e sourceId obrigatórios')
    }

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')

    const db = getDatabase()
    // Isolamento multi-tenant: a fonte precisa ser da org.
    const source = await db.knowledgeSource.findFirst({
      where: { id: params.sourceId, organizationId: user.currentOrgId },
      select: { id: true },
    })
    if (!source) return response.notFound('Fonte não encontrada')

    await db.knowledgeSource.delete({ where: { id: source.id } })
    return response.success({ deleted: true })
  },
})

export const knowledgeSourceRoutes = { addUrlSource, addTextSource, deleteSource }
