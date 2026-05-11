/**
 * Builder Projects — Metrics routes
 * Actions: getSidebar, getMetrics
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import { listRecentProjects } from '../../queries'

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

export const metricsRoutes = {
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
        return response.json({
          success: true,
          data: {
            recentProjects: projects.map((p) => ({
              id: p.id,
              name: p.name,
              status: p.status,
              type: p.type,
            })),
          },
        })
      } catch (error: unknown) {
        console.error(
          '[projectsRoutes.getSidebar] Erro ao buscar sidebar data:',
          error,
        )
        return response.json({
          success: true,
          data: { recentProjects: [] },
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
}
