/**
 * Capabilities Route — composição LEITORA da superfície de Capacidades (FR-06/07).
 *
 * Expõe 1 action read-only sob `/builder` (composta no builder controller):
 *   GET /builder/projects/:id/capabilities — insumos que NÃO derivam do
 *       builderState (este o readiness já entrega — NFR-05: sem fetch extra):
 *         - customTools:        AgentTool type CUSTOM da org (id/name/description/isActive)
 *         - mediaImagesCount:   fotos enviáveis (MediaAsset image) da collection do projeto
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
import { hasActiveCalendarConnection } from '../deploy/enabled-tools-derivation'
import { loadProject, resolveCollectionId } from '../knowledge/knowledge-helpers'

type AuthedUser = { id: string; currentOrgId?: string | null }

// ---------------------------------------------------------------------------
// GET /builder/projects/:id/capabilities
// ---------------------------------------------------------------------------

const getCapabilities = igniter.query({
  name: 'Get Project Capabilities',
  description:
    'Insumos da superfície de Capacidades (FR-06/07) que NÃO derivam do builderState: integrações CUSTOM da org, contagem de fotos enviáveis e de fontes de conhecimento do projeto, e se a agenda está conectada. Org-scoped, read-only.',
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

    const [customTools, mediaImagesCount, knowledgeSourceCount, calendarConnected] =
      await Promise.all([
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
          ? database.knowledgeSource.count({
              where: { organizationId, collectionId },
            })
          : Promise.resolve(0),
        hasActiveCalendarConnection(organizationId, projectId),
      ])

    return response.success({
      customTools,
      mediaImagesCount,
      knowledgeSourceCount,
      calendarConnected,
    })
  },
})

export const capabilitiesRoutes = { getCapabilities }
