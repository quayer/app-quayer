/**
 * Capabilities Route — composição LEITORA da superfície de Capacidades (FR-06/07).
 *
 * Expõe 1 action read-only sob `/builder` (composta no builder controller):
 *   GET /builder/projects/:id/capabilities — insumos que NÃO derivam do
 *       builderState (este o readiness já entrega — NFR-05: sem fetch extra):
 *         - customTools:        AgentTool type CUSTOM da org (id/name/description/isActive)
 *         - mediaImagesCount:   fotos enviáveis (MediaAsset image) da collection do projeto
 *         - sourceImagesCount:  fotos extraídas das fontes para curadoria
 *         - calendarConnected:  reusa hasActiveCalendarConnection (mesma fonte do runtime)
 *         - knowledgeSourceCount: fontes ingeridas na collection do projeto
 *
 * NENHUMA escrita — toda decisão de capacidade passa pelo card-submit existente
 * (FR-09: sem segunda superfície de decisão). O estado dos toggles
 * (transferir/preços/agenda) vem do builderState que o readiness já carrega.
 *
 * Org-scoped (sempre filtra por user.currentOrgId). O projeto é resolvido
 * org-scoped (`loadProject`) — id de outra org → 404 (não vaza existência).
 * Degradação: sem org → badRequest; projeto sem KB → counts 0 (sem KB nenhum
 * MediaAsset/KnowledgeSource pode existir). Registro no controller é via spread.
 */

import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { database } from '@/server/services/database'
import { parseBuilderState } from '../cards/builder-state'
import { recommendAgentCapabilities } from './recommend-capabilities.pure'
import { hasActiveCalendarConnection } from '../deploy/enabled-tools-derivation'
import { loadProject, resolveCollectionId } from '../knowledge/knowledge-helpers'
import { readBuilderStateByProject } from '../sources/builder-state-db'

type AuthedUser = { id: string; currentOrgId?: string | null }

// ---------------------------------------------------------------------------
// GET /builder/projects/:id/capabilities
// ---------------------------------------------------------------------------

const getCapabilities = igniter.query({
  name: 'Get Project Capabilities',
  description:
    'Insumos da superfície de Capacidades (FR-06/07) que NÃO derivam do builderState: integrações CUSTOM da org, contagem de fotos enviáveis/extraídas e de fontes de conhecimento do projeto, e se a agenda está conectada. Org-scoped, read-only.',
  // Relativo ao prefixo do builderController ('/builder') — NÃO repetir '/builder'.
  path: '/projects/:id/capabilities' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }
    const organizationId = user.currentOrgId

    const params = request.params as { id?: string }
    const projectId = params.id
    if (!projectId) return response.badRequest('id obrigatório')

    // Ownership check — o projeto deve pertencer à org ativa (cross-org → 404).
    const project = await loadProject(projectId, organizationId)
    if (!project) return response.notFound('Projeto não encontrado')

    // Resolve a collection do projeto (read-only; null quando ainda não há KB).
    // Sem collection nenhum MediaAsset/KnowledgeSource pode existir → counts 0.
    const collectionId = await resolveCollectionId(project, organizationId)

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
        // String literal de AgentToolType — idiom verificado em custom-tools.ts.
        where: { organizationId, type: 'CUSTOM' },
        select: { id: true, name: true, description: true, isActive: true },
        orderBy: { createdAt: 'desc' },
      }),
      collectionId
        ? database.mediaAsset.count({
            where: {
              organizationId,
              collectionId,
              mediaType: 'image',
              deletedAt: null,
            },
          })
        : Promise.resolve(0),
      collectionId
        ? database.knowledgeImage.count({
            where: {
              organizationId,
              collectionId,
              deletedAt: null,
            },
          })
        : Promise.resolve(0),
      collectionId
        ? database.knowledgeImage.count({
            where: {
              organizationId,
              collectionId,
              deletedAt: null,
              confirmedAt: null,
            },
          })
        : Promise.resolve(0),
      collectionId
        ? database.knowledgeSource.count({
            where: { organizationId, collectionId },
          })
        : Promise.resolve(0),
      hasActiveCalendarConnection(organizationId, projectId),
      // builderState do projeto (1:1 com a conversa). O projeto já foi provado
      // org-scoped acima (loadProject), então o read by-project é seguro. Custo
      // ZERO além do batch que já roda (NFR-05 — sem fetch extra fora deste lote).
      readBuilderStateByProject(projectId),
    ])

    // ── Recomendações (FR-51/FR-52, NFR-13) ──────────────────────────────────
    // PRÉ-marcação read-only: a partir da missão/nicho + insumos JÁ carregados
    // acima (customTools, calendar, pricing items), o recomendador puro devolve
    // as capacidades sugeridas em linguagem de negócio. NUNCA escreve nada — só
    // alimenta a UI; aceitar uma sugestão roteia para o card/toggle de domínio.
    const builderState = parseBuilderState(rawBuilderState)
    const recommendations = recommendAgentCapabilities(builderState, {
      calendarConnected,
      customToolsCount: customTools.length,
      pricingItemCount: builderState.pricing.items.length,
    })

    return response.success({
      customTools,
      mediaImagesCount,
      sourceImagesCount,
      sourceImagesPendingCount,
      knowledgeSourceCount,
      calendarConnected,
      recommendations,
    })
  },
})

export const capabilitiesRoutes = { getCapabilities }
