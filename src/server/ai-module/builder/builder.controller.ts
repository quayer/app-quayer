/**
 * Builder Controller
 *
 * Wraps the ai-agents infrastructure with Builder-specific endpoints.
 * Follows the pattern of src/server/ai-module/ai-agents/controllers/ai-agents.controller.ts
 *
 * Stories implemented:
 *   - US-005: POST /builder/projects/create — create a new Builder project (draft)
 *   - US-007: POST /builder/projects/publish — publish a BuilderPromptVersion
 */

import { igniter } from '@/igniter'
import { authProcedure } from '@/server/core/auth/procedures/auth.procedure'
import {
  createProjectInputSchema,
  publishProjectInputSchema,
} from './builder.schemas'
import { builderProjectRepository } from './repositories/builder-project.repository'

export const builderController = igniter.controller({
  name: 'builder',
  path: '/builder',
  description:
    'Builder — conversational wrapper over ai-agents for project creation and publishing',
  actions: {
    // ==========================================
    // US-005: CREATE PROJECT
    // ==========================================
    createProject: igniter.mutation({
      name: 'Create Builder Project',
      description:
        'Create a draft BuilderProject, its 1:1 conversation, and the first user message in one transaction',
      path: '/projects/create',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: createProjectInputSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) {
          return response.unauthorized('Não autenticado')
        }
        if (!user.currentOrgId) {
          return response.badRequest('Organização não selecionada')
        }

        const { prompt, type } = request.body

        try {
          // Derive a short human-readable name from the first line of the prompt.
          const firstLine = prompt.split('\n')[0]?.trim() ?? 'Novo projeto'
          const name =
            firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine

          const { project, conversation } =
            await builderProjectRepository.createWithInitialMessage({
              organizationId: user.currentOrgId,
              userId: user.id,
              prompt,
              type,
              name,
            })

          return response.json({
            success: true,
            data: {
              projectId: project.id,
              conversationId: conversation.id,
            },
            message: 'Projeto criado',
          })
        } catch (error: any) {
          console.error('[builderController] Error creating project:', error)
          return response.badRequest('Erro ao criar projeto')
        }
      },
    }),

    // ==========================================
    // US-007: PUBLISH PROJECT
    // ==========================================
    publishProject: igniter.mutation({
      name: 'Publish Builder Project',
      description:
        'Publish a BuilderPromptVersion and move the BuilderProject to production status. Does not touch active conversations (sticky versioning handled at runtime — US-029).',
      path: '/projects/publish',
      method: 'POST',
      use: [authProcedure({ required: true })],
      body: publishProjectInputSchema,
      handler: async ({ request, context, response }) => {
        const user = context.auth?.session?.user as any
        if (!user) {
          return response.unauthorized('Não autenticado')
        }
        if (!user.currentOrgId) {
          return response.badRequest('Organização não selecionada')
        }

        const { projectId, promptVersionId } = request.body

        // 1. Validate project belongs to user's org
        const project = await builderProjectRepository.findProjectForOrg(
          projectId,
          user.currentOrgId
        )
        if (!project) {
          return response.notFound('Projeto não encontrado')
        }

        // 2. A Builder project must have an AI agent bound before it can publish.
        //    The agent is created by the Builder LLM via a tool call in an earlier step.
        if (!project.aiAgentId) {
          return response.badRequest(
            'Projeto ainda não possui um agente associado. Continue a conversa no Builder para criá-lo.'
          )
        }

        // 3. Validate the prompt version belongs to the project's agent
        const version = await builderProjectRepository.findPromptVersionForAgent(
          promptVersionId,
          project.aiAgentId
        )
        if (!version) {
          return response.notFound(
            'Versão de prompt não encontrada ou não pertence a este projeto'
          )
        }

        try {
          const published = await builderProjectRepository.publishVersion({
            projectId,
            promptVersionId,
            publishedBy: user.id,
          })

          return response.json({
            success: true,
            data: {
              version: published.versionNumber,
              publishedAt: published.publishedAt,
            },
            message: 'Projeto publicado',
          })
        } catch (error: any) {
          console.error('[builderController] Error publishing project:', error)
          return response.badRequest('Erro ao publicar projeto')
        }
      },
    }),
  },
})
