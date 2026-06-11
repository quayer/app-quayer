/**
 * Builder Projects — Prompt routes
 * Actions: updatePrompt, listVersions, rollbackPrompt
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import {
  updatePromptBodySchema,
  updatePromptParamsSchema,
  versionListParamsSchema,
  rollbackPromptParamsSchema,
  rollbackPromptBodySchema,
} from '../../builder.schemas'
import { builderProjectRepository } from '../projects.repository'

/**
 * Body do PATCH com precondição otimista: `baseUpdatedAt` é o `updatedAt`
 * retornado pelo último save bem-sucedido. Quando presente e o agente mudou
 * desde então (regeneração via chat, rollback, disclosure da identidade), o
 * endpoint responde 409 em vez de sobrescrever silenciosamente.
 */
const updatePromptWithPreconditionSchema = updatePromptBodySchema.extend({
  baseUpdatedAt: z.string().datetime().optional(),
})

// ---------------------------------------------------------------------------
// Tipagem mínima do usuário autenticado — evita `any` espalhado.
// ---------------------------------------------------------------------------

type AuthedUser = {
  id: string
  currentOrgId?: string | null
  role?: string | null
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const promptRoutes = {
  // ==========================================
  // UPDATE PROMPT — PATCH /projects/:id/prompt
  // ==========================================
  updatePrompt: igniter.mutation({
    name: 'Update Agent System Prompt',
    description:
      'Auto-save do system prompt do AIAgentConfig vinculado ao projeto. ' +
      'Mantém uma BuilderPromptVersion draft "manual" reutilizável (edição manual vira versão publicável). ' +
      'Aceita precondição otimista via baseUpdatedAt e responde 409 quando o prompt mudou no servidor. ' +
      'Verifica posse por org. Retorna 404 se o projeto não existir ou não tiver agente vinculado.',
    path: '/projects/:id/prompt',
    method: 'PATCH',
    use: [authOrApiKeyProcedure({ required: true })],
    body: updatePromptWithPreconditionSchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = updatePromptParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const { systemPrompt, baseUpdatedAt } = request.body

      try {
        const result = await builderProjectRepository.updateAgentSystemPrompt(
          id,
          user.currentOrgId,
          systemPrompt,
          baseUpdatedAt ? { baseUpdatedAt: new Date(baseUpdatedAt) } : undefined,
        )

        if (!result) {
          return response.notFound('Projeto ou agente não encontrado')
        }

        if (result.conflict) {
          return response.status(409).json({
            success: false,
            error: 'prompt_conflict',
            data: {
              id: result.current.id,
              systemPrompt: result.current.systemPrompt,
              updatedAt: result.current.updatedAt,
            },
            message:
              'O prompt foi alterado no servidor desde a sua última edição.',
          })
        }

        return response.json({
          success: true,
          data: {
            id: result.agent.id,
            systemPrompt: result.agent.systemPrompt,
            updatedAt: result.agent.updatedAt,
          },
          message: 'Prompt salvo',
        })
      } catch (error: unknown) {
        console.error('[projectsRoutes.updatePrompt] Erro ao salvar prompt:', error)
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        return response.badRequest(`Erro ao salvar prompt: ${message}`)
      }
    },
  }),

  // ==========================================
  // LIST VERSIONS — GET /projects/:id/versions
  // ==========================================
  listVersions: igniter.query({
    name: 'List Builder Prompt Versions',
    description:
      'Retorna o histórico de versões do system prompt de um projeto Builder IA, ordenado por versionNumber DESC.',
    path: '/projects/:id/versions',
    method: 'GET',
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = versionListParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const rows = await builderProjectRepository.listVersionsForProject(
        id,
        user.currentOrgId,
      )

      if (rows === null) {
        return response.notFound('Projeto não encontrado')
      }

      return response.success({
        versions: rows.map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          content: v.content,
          description: v.description ?? null,
          createdBy: v.createdBy as 'chat' | 'manual' | 'rollback',
          publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
          publishedBy: v.publisher
            ? { id: v.publisher.id, name: v.publisher.name }
            : null,
          createdAt: v.createdAt.toISOString(),
        })),
      })
    },
  }),

  // ==========================================
  // ROLLBACK PROMPT — POST /projects/:id/prompt/rollback
  // ==========================================
  rollbackPrompt: igniter.mutation({
    name: 'Rollback Agent Prompt',
    description:
      'Cria uma nova BuilderPromptVersion com createdBy=rollback copiando o conteúdo ' +
      'de targetVersionId e atualiza o AIAgentConfig.systemPrompt. Não sobrescreve histórico.',
    path: '/projects/:id/prompt/rollback',
    method: 'POST',
    use: [authOrApiKeyProcedure({ required: true })],
    body: rollbackPromptBodySchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const paramsResult = rollbackPromptParamsSchema.safeParse(request.params)
      if (!paramsResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = paramsResult.data

      const { targetVersionId } = request.body

      try {
        const result = await builderProjectRepository.rollbackToVersion(
          id,
          user.currentOrgId,
          targetVersionId,
          user.id,
        )

        if (!result) {
          return response.notFound('Projeto, agente ou versão alvo não encontrado')
        }

        return response.success({
          versionId: result.newVersion.id,
          versionNumber: result.newVersion.versionNumber,
          content: result.newVersion.content,
        })
      } catch (error: unknown) {
        console.error('[projectsRoutes.rollbackPrompt] Erro ao reverter prompt:', error)
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        return response.badRequest(`Erro ao reverter prompt: ${message}`)
      }
    },
  }),
}
