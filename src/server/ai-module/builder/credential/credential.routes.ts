/**
 * Credential routes — escolha da chave BYOK usada por um agente.
 *
 *   PATCH /credential/:projectId — seta (ou limpa) AIAgentConfig.organizationProviderId
 *           body { organizationProviderId: string | null }
 *           null = volta ao fallback (isPrimary → priority → primeira ativa).
 *
 * Resolve o agente via BuilderProject.aiAgentId (org-scoped). Valida que a chave
 * escolhida (OrganizationProvider) pertence à mesma org antes de vincular.
 * Espelha o padrão de identity.routes.ts.
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'

type AuthedUser = { id: string; currentOrgId?: string | null }

const credentialPatchSchema = z.object({
  organizationProviderId: z.string().min(1).nullable(),
})

async function loadProject(
  projectId: string,
  organizationId: string,
): Promise<{ id: string; aiAgentId: string | null } | null> {
  return getDatabase().builderProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, aiAgentId: true },
  })
}

const updateCredential = igniter.mutation({
  name: 'Set Agent Credential',
  description:
    'Vincula (ou limpa) a chave BYOK que o agente do projeto deve usar (AIAgentConfig.organizationProviderId).',
  path: '/credential/:projectId' as const,
  method: 'PATCH',
  use: [authOrApiKeyProcedure({ required: true })],
  body: credentialPatchSchema,
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')
    if (!project.aiAgentId) {
      return response.badRequest('Projeto ainda não tem agente publicado')
    }

    const db = getDatabase()
    const { organizationProviderId } = request.body

    // Valida que a chave escolhida pertence à org (evita cross-org leak).
    if (organizationProviderId) {
      const provider = await db.organizationProvider.findFirst({
        where: { id: organizationProviderId, organizationId: user.currentOrgId },
        select: { id: true },
      })
      if (!provider) return response.notFound('Chave não encontrada')
    }

    await db.aIAgentConfig.update({
      where: { id: project.aiAgentId },
      data: { organizationProviderId },
    })

    return response.success({ organizationProviderId })
  },
})

export const credentialRoutes = { updateCredential }
