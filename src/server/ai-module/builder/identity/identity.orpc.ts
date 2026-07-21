/**
 * Builder Identity — porta mecânica para oRPC (lote B5 do builder).
 *
 * Origem: ./identity.routes.ts (2 actions).
 *   getIdentity    GET   /builder/identity/:projectId
 *   updateIdentity PATCH /builder/identity/:projectId
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
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
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const projectIdParam = { projectId: z.string().min(1, 'projectId obrigatório') }
const authed = base.use(authOrApiKey)

const identityPatchShape = {
  objetivo: z.string().max(200).optional(),
  displayName: z.string().max(80).optional(),
  persona: z.string().max(400).optional(),
  tom: z.enum(['formal', 'amigavel', 'direto']).optional(),
  usaEmojis: z.boolean().optional(),
  disclosureMode: z.enum(['ai_explicit', 'human_passthrough', 'custom']).optional(),
  disclosureCustomText: z.string().max(600).optional(),
  avatarUrl: z.string().max(500).optional(),
}

async function loadProjectForOrg(
  projectId: string,
  organizationId: string,
): Promise<{ id: string; aiAgentId: string | null; metadata: unknown }> {
  const project = await getDatabase().builderProject.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, aiAgentId: true, metadata: true },
  })
  if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })
  return project
}

// ==========================================
// GET — GET /builder/identity/{projectId}
// ==========================================
export const getIdentity = authed
  .route({
    method: 'GET',
    path: '/builder/identity/{projectId}',
    summary: 'Get Agent Identity Card',
  })
  .input(z.object(projectIdParam))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const project = await loadProjectForOrg(input.projectId, orgId)

    return ok({ card: getIdentityCardFromMetadata(project.metadata) })
  })

// ==========================================
// PATCH — PATCH /builder/identity/{projectId}
// ==========================================
export const updateIdentity = authed
  .route({
    method: 'PATCH',
    path: '/builder/identity/{projectId}',
    summary: 'Update Agent Identity Card',
  })
  .input(z.object({ ...projectIdParam, ...identityPatchShape }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)
    const { projectId, ...patch } = input
    const project = await loadProjectForOrg(projectId, orgId)

    const current = getIdentityCardFromMetadata(project.metadata)
    const merged: AgentIdentityCard = normalizeIdentityCard({ ...current, ...patch })

    const db = getDatabase()
    await db.builderProject.update({
      where: { id: project.id },
      data: { metadata: mergeIdentityCardIntoMetadata(project.metadata, merged) as object },
    })

    // Sincroniza os 4 campos estruturados + injeta o bloco de disclosure no
    // systemPrompt (idempotente) — não-fatal.
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
          organizationId: orgId,
          reason:
            'O card de identidade alterou disclosure/systemPrompt depois do refinamento.',
        })
      } catch (err) {
        console.warn('[identity] sync AIAgentConfig falhou (não-fatal):', err)
      }
    }

    return ok({ card: merged })
  })

export const identityActions = { getIdentity, updateIdentity }
