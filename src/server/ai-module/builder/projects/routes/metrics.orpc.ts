/**
 * Builder Projects/Metrics — porta mecânica para oRPC (lote B1 do builder).
 *
 * Origem: ./metrics.routes.ts (2 actions).
 * URLs: GET /builder/sidebar · GET /builder/projects/:id/metrics
 * Fidelidade: getSidebar degrada fail-open para lista vazia; getMetrics
 * responde métricas zeradas para projeto sem agente publicado.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { getDatabase } from '@/server/services/database'
import { listRecentProjects } from '../../queries'
import type { ProjectMetrics } from './metrics.routes'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from './crud.orpc'

const authed = base.use(authOrApiKey)

// ==========================================
// SIDEBAR — GET /builder/sidebar
// ==========================================
export const getSidebar = authed
  .route({ method: 'GET', path: '/builder/sidebar', summary: 'Get Builder Sidebar Data' })
  .handler(async ({ context }) => {
    const { orgId } = builderOrg(context)

    try {
      const projects = await listRecentProjects(orgId)
      return ok({
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
      console.error('[projectsRoutes.getSidebar] Erro ao buscar sidebar data:', error)
      // Fail-open do original: nunca derruba a sidebar
      return ok({ success: true, data: { recentProjects: [] } })
    }
  })

// ==========================================
// METRICS — GET /builder/projects/{id}/metrics
// ==========================================
export const getMetrics = authed
  .route({
    method: 'GET',
    path: '/builder/projects/{id}/metrics',
    summary: 'Get Builder Project Metrics',
  })
  .input(z.object({ id: z.string().uuid('ID de projeto inválido') }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const database = getDatabase()

    const project = await database.builderProject.findFirst({
      where: { id: input.id, organizationId: orgId },
      select: { id: true, aiAgentId: true },
    })

    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    if (!project.aiAgentId) {
      return ok<ProjectMetrics>({
        messages24h: 0,
        conversations24h: 0,
        totalCalls: null,
        totalInputTokens: null,
        totalOutputTokens: null,
        totalCost: null,
        lastMessageAt: null,
      })
    }

    const agent = await database.aIAgentConfig.findFirst({
      where: { id: project.aiAgentId, organizationId: orgId },
      select: {
        totalCalls: true,
        totalInputTokens: true,
        totalOutputTokens: true,
        totalCost: true,
      },
    })

    if (!agent) throw new ORPCError('NOT_FOUND', { message: 'Agente não encontrado' })

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const conversations24h = await database.chatSession.count({
      where: {
        organizationId: orgId,
        aiAgentConfigId: project.aiAgentId,
        createdAt: { gte: since24h },
      },
    })

    const messages24hResult = await database.message.count({
      where: {
        session: { organizationId: orgId, aiAgentConfigId: project.aiAgentId },
        createdAt: { gte: since24h },
      },
    })

    const lastMsg = await database.message.findFirst({
      where: {
        session: { organizationId: orgId, aiAgentConfigId: project.aiAgentId },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })

    return ok<ProjectMetrics>({
      messages24h: messages24hResult,
      conversations24h,
      totalCalls: agent.totalCalls,
      totalInputTokens: agent.totalInputTokens,
      totalOutputTokens: agent.totalOutputTokens,
      totalCost: agent.totalCost,
      lastMessageAt: lastMsg?.createdAt.toISOString() ?? null,
    })
  })

export const metricsActions = {
  getSidebar,
  getMetrics,
}
