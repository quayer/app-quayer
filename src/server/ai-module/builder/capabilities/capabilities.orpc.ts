/**
 * Builder Capabilities — porta mecânica para oRPC (lote B5 do builder).
 *
 * Origem: ./capabilities.routes.ts (1 action, read-only).
 *   getCapabilities GET /builder/projects/:id/capabilities
 *
 * NENHUMA escrita — decisões de capacidade continuam no card-submit (FR-09).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { parseBuilderState } from '../cards/builder-state'
import { recommendAgentCapabilities } from './recommend-capabilities.pure'
import { hasActiveCalendarConnection } from '../deploy/enabled-tools-derivation'
import { loadProject, resolveCollectionId } from '../knowledge/knowledge-helpers'
import { readBuilderStateByProject } from '../sources/builder-state-db'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const authed = base.use(authOrApiKey)

// ==========================================
// GET — GET /builder/projects/{id}/capabilities
// ==========================================
export const getCapabilities = authed
  .route({
    method: 'GET',
    path: '/builder/projects/{id}/capabilities',
    summary: 'Get Project Capabilities',
  })
  .input(z.object({ id: z.string().min(1, 'id obrigatório') }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const projectId = input.id

    // Ownership check — o projeto deve pertencer à org ativa (cross-org → 404).
    const project = await loadProject(projectId, orgId)
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })

    // Sem collection nenhum MediaAsset/KnowledgeSource pode existir → counts 0.
    const collectionId = await resolveCollectionId(project, orgId)

    const [
      customTools,
      mediaImagesCount,
      sourceImagesCount,
      sourceImagesPendingCount,
      knowledgeSourceCount,
      calendarConnected,
      rawBuilderState,
    ] = await Promise.all([
      database.agentTool.findMany({
        where: { organizationId: orgId, type: 'CUSTOM' },
        select: { id: true, name: true, description: true, isActive: true },
        orderBy: { createdAt: 'desc' },
      }),
      collectionId
        ? database.mediaAsset.count({
            where: {
              organizationId: orgId,
              collectionId,
              mediaType: 'image',
              deletedAt: null,
            },
          })
        : Promise.resolve(0),
      collectionId
        ? database.knowledgeImage.count({
            where: { organizationId: orgId, collectionId, deletedAt: null },
          })
        : Promise.resolve(0),
      collectionId
        ? database.knowledgeImage.count({
            where: {
              organizationId: orgId,
              collectionId,
              deletedAt: null,
              confirmedAt: null,
            },
          })
        : Promise.resolve(0),
      collectionId
        ? database.knowledgeSource.count({
            where: { organizationId: orgId, collectionId },
          })
        : Promise.resolve(0),
      hasActiveCalendarConnection(orgId, projectId),
      readBuilderStateByProject(projectId),
    ])

    // Recomendações (FR-51/FR-52, NFR-13) — pré-marcação read-only.
    const builderState = parseBuilderState(rawBuilderState)
    const recommendations = recommendAgentCapabilities(builderState, {
      calendarConnected,
      customToolsCount: customTools.length,
      pricingItemCount: builderState.pricing.items.length,
    })

    return ok({
      customTools,
      mediaImagesCount,
      sourceImagesCount,
      sourceImagesPendingCount,
      knowledgeSourceCount,
      calendarConnected,
      recommendations,
    })
  })

export const capabilitiesActions = { getCapabilities }
