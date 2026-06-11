/**
 * Builder Projects — CRUD routes
 * Actions: listProjects, getProject, createProject, deleteProject,
 *          renameProject, archiveProject, unarchiveProject, duplicateProject,
 *          updateAgentSettings
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import {
  getAgentRuntimeSettingsFromMetadata,
  normalizeAgentRuntimeSettings,
} from '@/lib/agent-runtime-settings'
import {
  listProjectsQuerySchema,
  createProjectInputSchema,
} from '../../builder.schemas'
import { builderProjectRepository } from '../projects.repository'
import {
  agentRuntimeSettingsPatchSchema,
  applyAgentRuntimeSettingsPatch,
} from './agent-settings-patch'

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

export const unarchiveProjectParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})
export const unarchiveProjectBodySchema = z.object({})

export const duplicateProjectParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})
export const duplicateProjectBodySchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
})

export const updateAgentSettingsParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})
/** PATCH parcial tipado — ver agent-settings-patch.ts (nada de z.record). */
export const updateAgentSettingsBodySchema = agentRuntimeSettingsPatchSchema

// ---------------------------------------------------------------------------
// Derivação de nome do projeto (FR-04 — jornada-builder-v2)
// ---------------------------------------------------------------------------

/** URLs (http(s)://… ou www.…) removidas da 1ª linha antes de derivar o nome. */
const URL_IN_NAME_PATTERN = /(?:https?:\/\/|www\.)\S+/gi

/** Tamanho máximo do nome derivado (corte no limite de palavra). */
const DERIVED_NAME_MAX = 40

/** Fallback quando a 1ª linha não rende um nome útil. */
const DERIVED_NAME_FALLBACK = 'Novo agente'

/** Conta caracteres "úteis" (letras/dígitos unicode) de uma string. */
function usefulChars(value: string): number {
  return (value.match(/[\p{L}\p{N}]/gu) ?? []).length
}

/**
 * Deriva um nome curto e legível a partir do prompt inicial (FR-04): 1ª linha
 * SEM URLs, cortada em ~40 chars no limite de palavra. Se sobrarem menos de 3
 * caracteres úteis (letras/dígitos), cai para 'Novo agente' — nunca a primeira
 * linha bruta do prompt na navegação.
 */
export function deriveProjectName(prompt: string): string {
  const firstLine = prompt.split('\n')[0] ?? ''
  const withoutUrls = firstLine
    .replace(URL_IN_NAME_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (usefulChars(withoutUrls) < 3) return DERIVED_NAME_FALLBACK
  if (withoutUrls.length <= DERIVED_NAME_MAX) return withoutUrls

  // Corte no limite de palavra: olha 1 char além do máximo para não descartar
  // uma palavra que termina exatamente no limite.
  const slice = withoutUrls.slice(0, DERIVED_NAME_MAX + 1)
  const lastSpace = slice.lastIndexOf(' ')
  const cut = (
    lastSpace > 0 ? slice.slice(0, lastSpace) : withoutUrls.slice(0, DERIVED_NAME_MAX)
  )
    .replace(/[\s\p{P}]+$/gu, '')
    .trim()

  return usefulChars(cut) >= 3 ? cut : DERIVED_NAME_FALLBACK
}

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
        // FR-04 — nome curto e legível (1ª linha sem URLs, ~40 chars no limite
        // de palavra), nunca a primeira linha bruta do prompt.
        const name = deriveProjectName(prompt)

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
  // DELETE PROJECT (hard delete — PERMANENTE)
  // ==========================================
  deleteProject: igniter.mutation({
    name: 'Delete Builder Project',
    description:
      'Exclui PERMANENTEMENTE um BuilderProject e tudo que cascateia dele (conversa, mensagens, deployments da saga, providers/calendar do projeto). O agente de runtime vinculado é preservado mas desativado. Irreversível.',
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
        const deleted = await builderProjectRepository.hardDelete(
          id,
          user.currentOrgId,
        )

        if (!deleted) {
          return response.notFound('Projeto não encontrado')
        }

        return response.json({
          success: true,
          data: { id: deleted.id },
          message: 'Projeto excluído permanentemente',
        })
      } catch (error: unknown) {
        console.error(
          '[projectsRoutes.deleteProject] Erro ao excluir projeto:',
          error,
        )
        const message =
          error instanceof Error ? error.message : 'Erro desconhecido'
        return response.badRequest(`Erro ao excluir projeto: ${message}`)
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
  // UNARCHIVE PROJECT — PATCH /projects/:id/unarchive
  // ==========================================
  unarchiveProject: igniter.mutation({
    name: 'Unarchive Builder Project',
    description: 'Restaura um BuilderProject arquivado (status → draft, limpa archivedAt). Verifica posse por org.',
    path: '/projects/:id/unarchive',
    method: 'PATCH',
    use: [authOrApiKeyProcedure({ required: true })],
    body: unarchiveProjectBodySchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = unarchiveProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      try {
        const updated = await builderProjectRepository.unarchive(id, user.currentOrgId)
        if (!updated) return response.notFound('Projeto não encontrado')

        return response.json({
          success: true,
          data: {
            id: updated.id,
            status: updated.status,
            archivedAt: updated.archivedAt,
          },
          message: 'Projeto restaurado',
        })
      } catch (error: unknown) {
        console.error('[projectsRoutes.unarchiveProject] Erro:', error)
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        return response.badRequest(`Erro ao restaurar projeto: ${message}`)
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

  // ==========================================
  // UPDATE AGENT RUNTIME SETTINGS — PATCH /projects/:id/agent-settings
  // ==========================================
  updateAgentSettings: igniter.mutation({
    name: 'Update Agent Runtime Settings',
    description:
      'PATCH parcial das flags avançadas do agente: typing, idioma, mídia, buffer e áudio/TTS. Campos omitidos preservam o valor atual.',
    path: '/projects/:id/agent-settings',
    method: 'PATCH',
    use: [authOrApiKeyProcedure({ required: true })],
    body: updateAgentSettingsBodySchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = updateAgentSettingsParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const patch = updateAgentSettingsBodySchema.safeParse(request.body)
      if (!patch.success) {
        return response.badRequest('Configurações inválidas')
      }

      try {
        // PATCH parcial REAL: lê o estado ATUAL (metadata + colunas TTS do
        // agente — a mesma visão que a UI exibe via getProjectDetail) e aplica
        // o patch sobre ele. Sem isso, campos ausentes voltavam aos defaults.
        const projectRow = await getDatabase().builderProject.findFirst({
          where: { id, organizationId: user.currentOrgId },
          select: {
            metadata: true,
            aiAgent: {
              select: {
                enableTTS: true,
                ttsProvider: true,
                ttsVoiceId: true,
                ttsModel: true,
                ttsSpeechRate: true,
              },
            },
          },
        })
        if (!projectRow) return response.notFound('Projeto não encontrado')

        const current = normalizeAgentRuntimeSettings(
          getAgentRuntimeSettingsFromMetadata(projectRow.metadata),
          projectRow.aiAgent,
        )
        const merged = applyAgentRuntimeSettingsPatch(current, patch.data)

        const settings = await builderProjectRepository.updateAgentRuntimeSettings(
          id,
          user.currentOrgId,
          merged,
        )
        if (!settings) return response.notFound('Projeto não encontrado')

        return response.json({
          success: true,
          data: settings,
          message: 'Configurações do agente atualizadas',
        })
      } catch (error: unknown) {
        console.error('[projectsRoutes.updateAgentSettings] Erro:', error)
        const message = error instanceof Error ? error.message : 'Erro desconhecido'
        return response.badRequest(`Erro ao atualizar configurações: ${message}`)
      }
    },
  }),
}
