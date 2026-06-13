/**
 * Identity routes — GET/PATCH do Card de Identidade & Comportamento do agente.
 *
 *   GET   /identity/:projectId — retorna o AgentIdentityCard (default se ausente)
 *   PATCH /identity/:projectId — merge parcial em BuilderProject.metadata e,
 *           se o projeto já tem agente, sincroniza os 4 campos estruturados do
 *           AIAgentConfig (personality/agentTarget/agentBehavior/agentAvatar).
 *
 * Sem migration: o card vive em BuilderProject.metadata.identityCard (Json),
 * espelhando metadata.agentRuntimeSettings.
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import {
  getIdentityCardFromMetadata,
  injectDisclosureIntoPrompt,
  mergeIdentityCardIntoMetadata,
  normalizeIdentityCard,
  toAgentConfigIdentityFields,
  type AgentIdentityCard,
} from '@/lib/agent-identity-card'
import { invalidateProjectRefinement } from '../refinement/refinement-state'

type AuthedUser = { id: string; currentOrgId?: string | null }

const identityPatchSchema = z.object({
  objetivo: z.string().max(200).optional(),
  displayName: z.string().max(80).optional(),
  persona: z.string().max(400).optional(),
  tom: z.enum(['formal', 'amigavel', 'direto']).optional(),
  usaEmojis: z.boolean().optional(),
  disclosureMode: z.enum(['ai_explicit', 'human_passthrough', 'custom']).optional(),
  disclosureCustomText: z.string().max(600).optional(),
  avatarUrl: z.string().max(500).optional(),
})

async function loadProject(
  projectId: string,
  organizationId: string,
): Promise<{ id: string; aiAgentId: string | null; metadata: unknown } | null> {
  const db = getDatabase()
  return db.builderProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, aiAgentId: true, metadata: true },
  })
}

const getIdentity = igniter.query({
  name: 'Get Agent Identity Card',
  description: 'Retorna o Card de Identidade do projeto (objetivo/persona/tom/disclosure).',
  path: '/identity/:projectId' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')

    return response.success({ card: getIdentityCardFromMetadata(project.metadata) })
  },
})

const updateIdentity = igniter.mutation({
  name: 'Update Agent Identity Card',
  description:
    'Atualiza (merge parcial) o Card de Identidade e sincroniza os campos estruturados do agente.',
  path: '/identity/:projectId' as const,
  method: 'PATCH',
  use: [authOrApiKeyProcedure({ required: true })],
  body: identityPatchSchema,
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')

    const params = request.params as { projectId?: string }
    if (!params.projectId) return response.badRequest('projectId obrigatório')

    const project = await loadProject(params.projectId, user.currentOrgId)
    if (!project) return response.notFound('Projeto não encontrado')

    const current = getIdentityCardFromMetadata(project.metadata)
    const merged: AgentIdentityCard = normalizeIdentityCard({ ...current, ...request.body })

    const db = getDatabase()
    await db.builderProject.update({
      where: { id: project.id },
      data: { metadata: mergeIdentityCardIntoMetadata(project.metadata, merged) as object },
    })

    // Sincroniza os 4 campos estruturados (antes mortos) + injeta o bloco de
    // disclosure no systemPrompt (idempotente) para que a identidade escolhida
    // REALMENTE altere o comportamento do agente.
    if (project.aiAgentId) {
      try {
        const agent = await db.aIAgentConfig.findUnique({
          where: { id: project.aiAgentId },
          select: { systemPrompt: true },
        })
        await db.aIAgentConfig.update({
          where: { id: project.aiAgentId },
          data: {
            ...toAgentConfigIdentityFields(merged),
            systemPrompt: injectDisclosureIntoPrompt(agent?.systemPrompt ?? '', merged),
          },
        })
        await invalidateProjectRefinement({
          projectId: project.id,
          organizationId: user.currentOrgId,
          reason:
            'O card de identidade alterou disclosure/systemPrompt depois do refinamento.',
        })
      } catch (err) {
        console.warn('[identity] sync AIAgentConfig falhou (não-fatal):', err)
      }
    }

    return response.success({ card: merged })
  },
})

export const identityRoutes = { getIdentity, updateIdentity }
