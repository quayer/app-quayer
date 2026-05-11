/**
 * Builder Projects — CRUD routes
 * Actions: listProjects, getProject, createProject, deleteProject,
 *          renameProject, archiveProject, duplicateProject
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import {
  listProjectsQuerySchema,
  createProjectInputSchema,
} from '../../builder.schemas'
import { builderProjectRepository } from '../projects.repository'

// ---------------------------------------------------------------------------
// Schemas locais (pequenos — mantidos inline para não poluir builder.schemas.ts)
// ---------------------------------------------------------------------------

/**
 * Params do endpoint `GET /projects/:id`.
 */
export const getProjectParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})

export type GetProjectParams = z.infer<typeof getProjectParamsSchema>

/**
 * Params do endpoint `DELETE /projects/:id`.
 */
export const deleteProjectParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})

export type DeleteProjectParams = z.infer<typeof deleteProjectParamsSchema>

// Lifecycle mutation schemas
export const renameProjectParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})
export const renameProjectBodySchema = z.object({
  name: z.string().min(1, 'Nome obrigatório').max(100, 'Máximo 100 caracteres').trim(),
})

export const archiveProjectParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})
export const archiveProjectBodySchema = z.object({})

export const duplicateProjectParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})
export const duplicateProjectBodySchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
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

export const crudRoutes = {
  // ==========================================
  // LIST PROJECTS
  // ==========================================
  listProjects: igniter.query({
    name: 'List Builder Projects',
    description:
      'Lista todos os Builder projects da organização atual, com filtros opcionais de tipo/status.',
    path: '/projects',
    method: 'GET',
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) {
        return response.unauthorized('Não autenticado')
      }
      if (!user.currentOrgId) {
        return response.badRequest('Organização não selecionada')
      }

      const query = listProjectsQuerySchema.parse(request.query ?? {})

      const { data, total } = await builderProjectRepository.listForOrg({
        organizationId: user.currentOrgId,
        type: query.type,
        status: query.status,
        limit: query.limit,
        offset: query.offset,
      })

      return response.json({
        success: true,
        data,
        total,
      })
    },
  }),

  // ==========================================
  // GET SINGLE PROJECT
  // ==========================================
  getProject: igniter.query({
    name: 'Get Builder Project',
    description:
      'Retorna um BuilderProject pelo ID, incluindo a conversa 1:1 e o agente vinculado (quando existir).',
    path: '/projects/:id',
    method: 'GET',
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) {
        return response.unauthorized('Não autenticado')
      }
      if (!user.currentOrgId) {
        return response.badRequest('Organização não selecionada')
      }

      const parseResult = getProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) {
        return response.badRequest('ID de projeto inválido')
      }
      const { id } = parseResult.data

      const project = await builderProjectRepository.findByIdForOrg(
        id,
        user.currentOrgId,
      )

      if (!project) {
        return response.notFound('Projeto não encontrado')
      }

      return response.json({
        success: true,
        data: project,
      })
    },
  }),

  // ==========================================
  // US-005: CREATE PROJECT
  // ==========================================
  createProject: igniter.mutation({
    name: 'Create Builder Project',
    description:
      'Cria um BuilderProject (draft), sua conversa 1:1 e a primeira mensagem do usuário em uma única transação.',
    path: '/projects/create',
    method: 'POST',
    use: [authOrApiKeyProcedure({ required: true })],
    body: createProjectInputSchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) {
        return response.unauthorized('Não autenticado')
      }
      if (!user.currentOrgId) {
        return response.badRequest('Organização não selecionada')
      }

      const { prompt, type } = request.body

      try {
        // Deriva um nome legível a partir da primeira linha do prompt.
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
      } catch (error: unknown) {
        console.error('[projectsRoutes.createProject] Erro ao criar projeto:', error)
        const message =
          error instanceof Error ? error.message : 'Erro desconhecido'
        return response.badRequest(`Erro ao criar projeto: ${message}`)
      }
    },
  }),

  // ==========================================
  // DELETE PROJECT (soft delete)
  // ==========================================
  deleteProject: igniter.mutation({
    name: 'Delete Builder Project',
    description:
      'Soft delete de um BuilderProject: marca status = archived e carimba archivedAt. Não remove o registro fisicamente.',
    path: '/projects/:id',
    method: 'DELETE',
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) {
        return response.unauthorized('Não autenticado')
      }
      if (!user.currentOrgId) {
        return response.badRequest('Organização não selecionada')
      }

      const parseResult = deleteProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) {
        return response.badRequest('ID de projeto inválido')
      }
      const { id } = parseResult.data

      try {
        const archived = await builderProjectRepository.softDelete(
          id,
          user.currentOrgId,
        )

        if (!archived) {
          return response.notFound('Projeto não encontrado')
        }

        return response.json({
          success: true,
          data: {
            id: archived.id,
            status: archived.status,
            archivedAt: archived.archivedAt,
          },
          message: 'Projeto arquivado',
        })
      } catch (error: unknown) {
        console.error(
          '[projectsRoutes.deleteProject] Erro ao arquivar projeto:',
          error,
        )
        const message =
          error instanceof Error ? error.message : 'Erro desconhecido'
        return response.badRequest(`Erro ao arquivar projeto: ${message}`)
      }
    },
  }),

  // ==========================================
  // RENAME PROJECT — PATCH /projects/:id/rename
  // ==========================================
  renameProject: igniter.mutation({
    name: 'Rename Builder Project',
    description: 'Renomeia um BuilderProject. Verifica posse por org.',
    path: '/projects/:id/rename',
    method: 'PATCH',
    use: [authOrApiKeyProcedure({ required: true })],
    body: renameProjectBodySchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = renameProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const { name } = request.body

      try {
        const updated = await builderProjectRepository.rename(id, user.currentOrgId, name)
        if (!updated) return response.notFound('Projeto não encontrado')

        return response.json({
          success: true,
          data: updated,
          message: 'Projeto renomeado',
        })
      } catch (error: unknown) {
        console.error('[projectsRoutes.renameProject] Erro:', error)
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        return response.badRequest(`Erro ao renomear projeto: ${message}`)
      }
    },
  }),

  // ==========================================
  // ARCHIVE PROJECT — PATCH /projects/:id/archive
  // ==========================================
  archiveProject: igniter.mutation({
    name: 'Archive Builder Project',
    description: 'Arquiva um BuilderProject (status → archived). Verifica posse por org.',
    path: '/projects/:id/archive',
    method: 'PATCH',
    use: [authOrApiKeyProcedure({ required: true })],
    body: archiveProjectBodySchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = archiveProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      try {
        const updated = await builderProjectRepository.archive(id, user.currentOrgId)
        if (!updated) return response.notFound('Projeto não encontrado')

        return response.json({
          success: true,
          data: {
            id: updated.id,
            status: updated.status,
            archivedAt: updated.archivedAt,
          },
          message: 'Projeto arquivado',
        })
      } catch (error: unknown) {
        console.error('[projectsRoutes.archiveProject] Erro:', error)
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        return response.badRequest(`Erro ao arquivar projeto: ${message}`)
      }
    },
  }),

  // ==========================================
  // DUPLICATE PROJECT — POST /projects/:id/duplicate
  // ==========================================
  duplicateProject: igniter.mutation({
    name: 'Duplicate Builder Project',
    description:
      'Clona um BuilderProject (+ AIAgentConfig + última BuilderPromptVersion). Não clona deployments/conversas/mensagens.',
    path: '/projects/:id/duplicate',
    method: 'POST',
    use: [authOrApiKeyProcedure({ required: true })],
    body: duplicateProjectBodySchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = duplicateProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const { name } = request.body

      try {
        const newProject = await builderProjectRepository.duplicate(
          id,
          user.currentOrgId,
          user.id,
          name,
        )
        if (!newProject) return response.notFound('Projeto não encontrado')

        return response.json({
          success: true,
          data: { id: newProject.id, name: newProject.name },
          message: 'Projeto duplicado',
        })
      } catch (error: unknown) {
        console.error('[projectsRoutes.duplicateProject] Erro:', error)
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        return response.badRequest(`Erro ao duplicar projeto: ${message}`)
      }
    },
  }),
}
