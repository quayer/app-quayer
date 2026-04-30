/**
 * Builder — Projects Routes
 *
 * Sub-módulo focado em CRUD de BuilderProject, extraído do controller
 * monolítico `../builder.controller.ts`. Este arquivo exporta um objeto
 * `projectsRoutes` com definições de `igniter.query` / `igniter.mutation`
 * prontas para serem compostas dentro do `builderController` (ou de um
 * novo controller dedicado) em fase posterior do refactor.
 *
 * Ações expostas:
 *   - GET    /projects         → listProjects
 *   - GET    /projects/:id     → getProject
 *   - POST   /projects/create  → createProject  (US-005)
 *   - PATCH  /projects/:id/prompt → updatePrompt (auto-save system prompt)
 *   - DELETE /projects/:id     → deleteProject  (soft delete)
 *   - GET    /sidebar          → getSidebar     (wraps get-sidebar-data.ts)
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import {
  listProjectsQuerySchema,
  createProjectInputSchema,
  updatePromptBodySchema,
  updatePromptParamsSchema,
  versionListParamsSchema,
  playgroundStreamBodySchema,
  rollbackPromptParamsSchema,
  rollbackPromptBodySchema,
} from '../builder.schemas'
import { getDatabase } from '@/server/services/database'
import { builderProjectRepository } from './projects.repository'
import { listRecentProjects } from '../queries'
import {
  processPlaygroundStream,
  type AgentStreamEvent,
} from '@/server/ai-module/ai-agents/agent-runtime.service'

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

// ---------------------------------------------------------------------------
// Schema for GET /projects/:id/metrics
// ---------------------------------------------------------------------------

export const getMetricsParamsSchema = z.object({
  id: z.string().uuid('ID de projeto inválido'),
})

export type GetMetricsParams = z.infer<typeof getMetricsParamsSchema>

export interface ProjectMetrics {
  messages24h: number
  conversations24h: number
  totalCalls: number | null
  totalInputTokens: number | null
  totalOutputTokens: number | null
  totalCost: number | null
  lastMessageAt: string | null
}

export const projectsRoutes = {
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

  // ==========================================
  // UPDATE PROMPT — PATCH /projects/:id/prompt
  // ==========================================
  updatePrompt: igniter.mutation({
    name: 'Update Agent System Prompt',
    description:
      'Auto-save do system prompt do AIAgentConfig vinculado ao projeto. ' +
      'Verifica posse por org. Retorna 404 se o projeto não existir ou não tiver agente vinculado.',
    path: '/projects/:id/prompt',
    method: 'PATCH',
    use: [authOrApiKeyProcedure({ required: true })],
    body: updatePromptBodySchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = updatePromptParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const { systemPrompt } = request.body

      try {
        const agent = await builderProjectRepository.updateAgentSystemPrompt(
          id,
          user.currentOrgId,
          systemPrompt,
        )

        if (!agent) {
          return response.notFound('Projeto ou agente não encontrado')
        }

        return response.json({
          success: true,
          data: {
            id: agent.id,
            systemPrompt: agent.systemPrompt,
            updatedAt: agent.updatedAt,
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
  // GET SIDEBAR DATA
  // ==========================================
  getSidebar: igniter.query({
    name: 'Get Builder Sidebar Data',
    description:
      'Retorna os dados agregados consumidos pelo componente <BuilderSidebar> (projetos recentes + flag de super admin).',
    path: '/sidebar',
    method: 'GET',
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) {
        return response.unauthorized('Não autenticado')
      }
      if (!user.currentOrgId) {
        return response.badRequest('Organização não selecionada')
      }

      try {
        const projects = await listRecentProjects(user.currentOrgId)
        const isSuperAdmin =
          user.role === 'admin' || user.role === 'super_admin'
        return response.json({
          success: true,
          data: {
            recentProjects: projects.map((p) => ({
              id: p.id,
              name: p.name,
              status: p.status,
              type: p.type,
            })),
            isSuperAdmin,
          },
        })
      } catch (error: unknown) {
        console.error(
          '[projectsRoutes.getSidebar] Erro ao buscar sidebar data:',
          error,
        )
        return response.json({
          success: true,
          data: { recentProjects: [], isSuperAdmin: false },
        })
      }
    },
  }),

  // ==========================================
  // GET PROJECT METRICS — GET /projects/:id/metrics
  // ==========================================
  getMetrics: igniter.query({
    name: 'Get Builder Project Metrics',
    description:
      'Retorna métricas de uso das últimas 24h para um projeto Builder IA publicado (ChatSessions + Messages via AIAgentConfig). Requer aiAgentId vinculado.',
    path: '/projects/:id/metrics',
    method: 'GET',
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = getMetricsParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const database = getDatabase()

      // Step 1: Load project scoped by org
      const project = await database.builderProject.findFirst({
        where: { id, organizationId: user.currentOrgId },
        select: { id: true, aiAgentId: true },
      })

      if (!project) return response.notFound('Projeto não encontrado')

      if (!project.aiAgentId) {
        return response.success<ProjectMetrics>({
          messages24h: 0,
          conversations24h: 0,
          totalCalls: null,
          totalInputTokens: null,
          totalOutputTokens: null,
          totalCost: null,
          lastMessageAt: null,
        })
      }

      // Step 2: Load AIAgentConfig aggregated counters
      const agent = await database.aIAgentConfig.findFirst({
        where: { id: project.aiAgentId, organizationId: user.currentOrgId },
        select: {
          totalCalls: true,
          totalInputTokens: true,
          totalOutputTokens: true,
          totalCost: true,
        },
      })

      if (!agent) return response.notFound('Agente não encontrado')

      const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

      // Count ChatSessions created in last 24h for this agent
      const conversations24h = await database.chatSession.count({
        where: {
          organizationId: user.currentOrgId,
          aiAgentConfigId: project.aiAgentId,
          createdAt: { gte: since24h },
        },
      })

      // Count Messages in sessions of this agent in last 24h
      const messages24hResult = await database.message.count({
        where: {
          session: {
            organizationId: user.currentOrgId,
            aiAgentConfigId: project.aiAgentId,
          },
          createdAt: { gte: since24h },
        },
      })

      // Most recent message timestamp for this agent
      const lastMsg = await database.message.findFirst({
        where: {
          session: {
            organizationId: user.currentOrgId,
            aiAgentConfigId: project.aiAgentId,
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      })

      return response.success<ProjectMetrics>({
        messages24h: messages24hResult,
        conversations24h,
        totalCalls: agent.totalCalls,
        totalInputTokens: agent.totalInputTokens,
        totalOutputTokens: agent.totalOutputTokens,
        totalCost: agent.totalCost,
        lastMessageAt: lastMsg?.createdAt.toISOString() ?? null,
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

  // ==========================================
  // GET PROJECT CHANNEL — GET /projects/:id/channel
  // ==========================================
  getProjectChannel: igniter.query({
    name: 'Get Project Channel',
    description: 'Retorna o canal (Connection) ativo vinculado ao agente do projeto via AgentDeployment.',
    path: '/projects/:id/channel' as const,
    method: 'GET',
    use: [authOrApiKeyProcedure({ required: true })],
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = getProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const database = getDatabase()
      const project = await database.builderProject.findFirst({
        where: { id, organizationId: user.currentOrgId },
        select: { aiAgentId: true },
      })

      if (!project) return response.notFound('Projeto não encontrado')
      if (!project.aiAgentId) return response.success({ channel: null })

      const deployment = await database.agentDeployment.findFirst({
        where: {
          agentConfigId: project.aiAgentId,
          status: 'ACTIVE',
        },
        include: {
          connection: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              status: true,
              channel: true,
              provider: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      })

      return response.success({ channel: deployment?.connection ?? null })
    },
  }),

  // ==========================================
  // ATTACH CHANNEL — POST /projects/:id/channel
  // ==========================================
  attachChannel: igniter.mutation({
    name: 'Attach Channel to Project',
    description: 'Vincula um canal WhatsApp existente ao agente do projeto via AgentDeployment.',
    path: '/projects/:id/channel' as const,
    method: 'POST',
    use: [authOrApiKeyProcedure({ required: true })],
    body: z.object({ connectionId: z.string().uuid('ID de canal inválido') }),
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = getProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data
      const { connectionId } = request.body

      const database = getDatabase()

      const project = await database.builderProject.findFirst({
        where: { id, organizationId: user.currentOrgId },
        select: { aiAgentId: true },
      })

      if (!project) return response.notFound('Projeto não encontrado')
      if (!project.aiAgentId) return response.badRequest('O Builder ainda não criou o agente para este projeto')

      // Validate connection belongs to org
      const connection = await database.connection.findFirst({
        where: { id: connectionId, organizationId: user.currentOrgId },
        select: { id: true, name: true, phoneNumber: true, status: true },
      })

      if (!connection) return response.notFound('Canal não encontrado ou não pertence à sua organização')

      // Deactivate any existing deployment for this agent
      await database.agentDeployment.updateMany({
        where: { agentConfigId: project.aiAgentId, status: 'ACTIVE' },
        data: { status: 'PAUSED', updatedAt: new Date() },
      })

      // Create or reactivate deployment for the chosen connection
      const existing = await database.agentDeployment.findFirst({
        where: { agentConfigId: project.aiAgentId, connectionId },
        select: { id: true },
      })

      if (existing) {
        await database.agentDeployment.update({
          where: { id: existing.id },
          data: { status: 'ACTIVE', updatedAt: new Date() },
        })
      } else {
        await database.agentDeployment.create({
          data: {
            agentConfigId: project.aiAgentId,
            connectionId,
            mode: 'CHAT',
            status: 'ACTIVE',
          },
        })
      }

      return response.success({ connectionId, name: connection.name })
    },
  }),

  // ==========================================
  // DETACH CHANNEL — DELETE /projects/:id/channel
  // ==========================================
  detachChannel: igniter.mutation({
    name: 'Detach Channel from Project',
    description: 'Remove o vínculo entre o canal ativo e o agente do projeto.',
    path: '/projects/:id/channel' as const,
    method: 'DELETE',
    use: [authOrApiKeyProcedure({ required: true })],
    body: z.object({}).optional(),
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = getProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const database = getDatabase()
      const project = await database.builderProject.findFirst({
        where: { id, organizationId: user.currentOrgId },
        select: { aiAgentId: true },
      })

      if (!project) return response.notFound('Projeto não encontrado')
      if (!project.aiAgentId) return response.success({ detached: false })

      await database.agentDeployment.updateMany({
        where: { agentConfigId: project.aiAgentId, status: 'ACTIVE' },
        data: { status: 'PAUSED', updatedAt: new Date() },
      })

      return response.success({ detached: true })
    },
  }),

  // ==========================================
  // PLAYGROUND STREAM — POST /projects/:id/playground/stream
  // ==========================================
  playgroundStream: igniter.mutation({
    name: 'Playground Stream',
    description:
      'Stateless SSE stream for testing an agent in the Playground tab. ' +
      'Does NOT persist any messages, tool calls, or metrics.',
    path: '/projects/:id/playground/stream' as const,
    method: 'POST',
    use: [authOrApiKeyProcedure({ required: true })],
    body: playgroundStreamBodySchema,
    handler: async ({ request, context, response }) => {
      const user = context.auth?.session?.user as AuthedUser | undefined
      if (!user) return response.unauthorized('Não autenticado')
      if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

      const parseResult = getProjectParamsSchema.safeParse(request.params)
      if (!parseResult.success) return response.badRequest('ID de projeto inválido')
      const { id } = parseResult.data

      const { message, history: rawHistory } = request.body
      const history = rawHistory ?? []

      const db = getDatabase()
      const project = await db.builderProject.findFirst({
        where: { id, organizationId: user.currentOrgId },
        select: { id: true, aiAgentId: true },
      })

      if (!project) return response.notFound('Projeto não encontrado')
      if (!project.aiAgentId) {
        return response.notFound('Este projeto ainda não tem um agente vinculado')
      }

      const encoder = new TextEncoder()
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const sendEvent = (event: AgentStreamEvent) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            )
          }
          try {
            for await (const ev of processPlaygroundStream({
              agentConfigId: project.aiAgentId!,
              organizationId: user!.currentOrgId!,
              message,
              history,
            })) {
              sendEvent(ev)
              if (ev.type === 'finish' || ev.type === 'error') break
            }
          } catch (fatal: unknown) {
            const msg = fatal instanceof Error ? fatal.message : 'Unknown error'
            console.error('[playgroundStream] Fatal:', fatal)
            try {
              sendEvent({ type: 'error', message: msg })
            } catch {
              // already closing
            }
          } finally {
            try { controller.close() } catch { /* already closed */ }
          }
        },
      })

      return new Response(stream, {
        headers: new Headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        }),
      })
    },
  }),
}

export type ProjectsRoutes = typeof projectsRoutes
