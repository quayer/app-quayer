/**
 * Builder Integration-lifecycle — porta mecânica para oRPC (lote B6).
 *
 * Origem: ./integration-lifecycle.routes.ts (4 actions, role-gated T18).
 *   activateIntegration POST   /builder/integrations/:id/activate
 *   pauseIntegration    POST   /builder/integrations/:id/pause
 *   resumeIntegration   POST   /builder/integrations/:id/resume
 *   removeIntegration   DELETE /builder/integrations/:id
 *
 * Gates preservados: feature-flag + role (ADMIN global OU MASTER) + gates de
 * ativação (agente publicado, validated + teste success, quota ≤3 na MESMA
 * transação) + AuditLog por transição.
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getDatabase } from '@/server/services/database'
import { reconcileEnabledTools } from '@/server/ai-module/builder/deploy/enabled-tools-derivation'
import { invalidateProjectRefinement } from '../refinement/refinement-state'
import {
  getIntegration,
  setStatus,
  deleteIntegration,
  assertActiveIntegrationQuota,
  IntegrationQuotaError,
} from './integration.repository'
import {
  assertIntegrationBuilderEnabled,
  assertLifecycleRoleOrThrow,
  sessionUser,
} from './integrations.orpc'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const idParam = { id: z.string().min(1, 'id obrigatório') }
const authed = base.use(authOrApiKey)

async function auditLifecycle(
  action: string,
  args: {
    integrationId: string
    userId: string
    organizationId: string
    metadata: Prisma.InputJsonValue
  },
): Promise<void> {
  await getDatabase().auditLog.create({
    data: {
      action,
      resource: 'custom_integration',
      resourceId: args.integrationId,
      userId: args.userId,
      organizationId: args.organizationId,
      metadata: args.metadata,
    },
  })
}

/** Set-merge do nome da tool no enabledTools do agente (cópia 1:1). */
async function ensureToolEnabled(
  aiAgentId: string | null,
  agentToolId: string | null,
  organizationId: string,
): Promise<void> {
  if (!aiAgentId || !agentToolId) return
  const db = getDatabase()
  const tool = await db.agentTool.findUnique({
    where: { id: agentToolId },
    select: { name: true },
  })
  if (!tool) return
  const agent = await db.aIAgentConfig.findFirst({
    where: { id: aiAgentId, organizationId },
    select: { id: true, enabledTools: true },
  })
  if (!agent) return
  const plan = reconcileEnabledTools(agent.enabledTools, [
    { ensure: [tool.name], remove: [] },
  ])
  if (plan.changed) {
    await db.aIAgentConfig.update({
      where: { id: agent.id },
      data: { enabledTools: { set: plan.next } },
    })
  }
}

// ==========================================
// ACTIVATE — POST /builder/integrations/{id}/activate
// ==========================================
export const activateIntegration = authed
  .route({
    method: 'POST',
    path: '/builder/integrations/{id}/activate',
    summary: 'Activate Integration',
  })
  .input(z.object(idParam))
  .handler(async ({ input, context }) => {
    const user = sessionUser(context)
    const { orgId } = builderOrg(context)
    assertIntegrationBuilderEnabled(orgId, context.headers)
    await assertLifecycleRoleOrThrow(user, orgId)

    const integration = await getIntegration(orgId, input.id)
    if (!integration) {
      throw new ORPCError('NOT_FOUND', { message: 'Integração não encontrada' })
    }

    // Gate 1 — o projeto precisa ter um agente publicado.
    const project = await getDatabase().builderProject.findFirst({
      where: { id: integration.builderProjectId, organizationId: orgId },
      select: { id: true, aiAgentId: true },
    })
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })
    if (!project.aiAgentId) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'O projeto ainda não tem um agente publicado.',
      })
    }

    // Gate 2 — só ativa o validado E com último teste success.
    if (
      integration.status !== 'validated' ||
      integration.lastTestStatus !== 'success'
    ) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Teste a integração com sucesso antes de ativar.',
      })
    }

    const db = getDatabase()

    // Gate 3 (quota ≤3) NA MESMA transação da ativação.
    try {
      await db.$transaction(async (tx) => {
        await assertActiveIntegrationQuota(tx, orgId)

        await tx.customIntegration.update({
          where: { id: integration.id },
          data: {
            status: 'active',
            activatedById: user.id,
            activatedAt: new Date(),
          },
        })

        if (integration.agentToolId) {
          const toolDescription =
            integration.triggerDescription?.trim() ||
            `Integração: ${integration.displayName}`
          await tx.agentTool.update({
            where: { id: integration.agentToolId },
            data: { isActive: true, description: toolDescription },
          })

          const tool = await tx.agentTool.findUnique({
            where: { id: integration.agentToolId },
            select: { name: true },
          })
          if (tool) {
            const agent = await tx.aIAgentConfig.findFirst({
              where: { id: project.aiAgentId!, organizationId: orgId },
              select: { id: true, enabledTools: true },
            })
            if (agent) {
              const plan = reconcileEnabledTools(agent.enabledTools, [
                { ensure: [tool.name], remove: [] },
              ])
              if (plan.changed) {
                await tx.aIAgentConfig.update({
                  where: { id: agent.id },
                  data: { enabledTools: { set: plan.next } },
                })
              }
            }
          }
        }
      })
    } catch (err) {
      if (err instanceof IntegrationQuotaError) {
        throw new ORPCError('BAD_REQUEST', { message: err.message })
      }
      throw err
    }

    await auditLifecycle('integration.activated', {
      integrationId: integration.id,
      userId: user.id,
      organizationId: orgId,
      metadata: { displayName: integration.displayName },
    })
    await invalidateProjectRefinement({
      projectId: integration.builderProjectId,
      organizationId: orgId,
      reason: 'Uma integração foi ativada depois do refinamento.',
    })

    return ok({ id: integration.id, status: 'active' })
  })

// ==========================================
// PAUSE — POST /builder/integrations/{id}/pause
// ==========================================
export const pauseIntegration = authed
  .route({
    method: 'POST',
    path: '/builder/integrations/{id}/pause',
    summary: 'Pause Integration',
  })
  .input(z.object(idParam))
  .handler(async ({ input, context }) => {
    const user = sessionUser(context)
    const { orgId } = builderOrg(context)
    assertIntegrationBuilderEnabled(orgId, context.headers)
    await assertLifecycleRoleOrThrow(user, orgId)

    const updated = await setStatus(orgId, input.id, 'paused')
    if (!updated) throw new ORPCError('NOT_FOUND', { message: 'Integração não encontrada' })

    await auditLifecycle('integration.paused', {
      integrationId: updated.id,
      userId: user.id,
      organizationId: orgId,
      metadata: { displayName: updated.displayName },
    })
    await invalidateProjectRefinement({
      projectId: updated.builderProjectId,
      organizationId: orgId,
      reason: 'Uma integração foi pausada depois do refinamento.',
    })

    return ok({ id: updated.id, status: 'paused' })
  })

// ==========================================
// RESUME — POST /builder/integrations/{id}/resume
// ==========================================
export const resumeIntegration = authed
  .route({
    method: 'POST',
    path: '/builder/integrations/{id}/resume',
    summary: 'Resume Integration',
  })
  .input(z.object(idParam))
  .handler(async ({ input, context }) => {
    const user = sessionUser(context)
    const { orgId } = builderOrg(context)
    assertIntegrationBuilderEnabled(orgId, context.headers)
    await assertLifecycleRoleOrThrow(user, orgId)

    const integration = await getIntegration(orgId, input.id)
    if (!integration) {
      throw new ORPCError('NOT_FOUND', { message: 'Integração não encontrada' })
    }

    // Re-exige teste recente com sucesso antes de voltar ao ar.
    if (integration.lastTestStatus !== 'success') {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Teste a integração com sucesso antes de reativar.',
      })
    }

    const db = getDatabase()
    const project = await db.builderProject.findFirst({
      where: { id: integration.builderProjectId, organizationId: orgId },
      select: { aiAgentId: true },
    })

    const updated = await setStatus(orgId, integration.id, 'active', {
      field: 'activated',
      userId: user.id,
    })
    if (!updated) throw new ORPCError('NOT_FOUND', { message: 'Integração não encontrada' })

    await ensureToolEnabled(project?.aiAgentId ?? null, integration.agentToolId, orgId)

    await auditLifecycle('integration.resumed', {
      integrationId: updated.id,
      userId: user.id,
      organizationId: orgId,
      metadata: { displayName: updated.displayName },
    })
    await invalidateProjectRefinement({
      projectId: integration.builderProjectId,
      organizationId: orgId,
      reason: 'Uma integração foi reativada depois do refinamento.',
    })

    return ok({ id: updated.id, status: 'active' })
  })

// ==========================================
// DELETE — DELETE /builder/integrations/{id}
// ==========================================
export const removeIntegration = authed
  .route({
    method: 'DELETE',
    path: '/builder/integrations/{id}',
    summary: 'Delete Integration',
  })
  .input(z.object(idParam))
  .handler(async ({ input, context }) => {
    const user = sessionUser(context)
    const { orgId } = builderOrg(context)
    assertIntegrationBuilderEnabled(orgId, context.headers)
    await assertLifecycleRoleOrThrow(user, orgId)

    const integration = await getIntegration(orgId, input.id)
    if (!integration) {
      throw new ORPCError('NOT_FOUND', { message: 'Integração não encontrada' })
    }

    const db = getDatabase()
    const project = await db.builderProject.findFirst({
      where: { id: integration.builderProjectId, organizationId: orgId },
      select: { aiAgentId: true },
    })

    // Remove a key do enabledTools ANTES do delete composto.
    if (project?.aiAgentId && integration.agentToolId) {
      const tool = await db.agentTool.findUnique({
        where: { id: integration.agentToolId },
        select: { name: true },
      })
      if (tool) {
        const agent = await db.aIAgentConfig.findFirst({
          where: { id: project.aiAgentId, organizationId: orgId },
          select: { id: true, enabledTools: true },
        })
        if (agent) {
          const plan = reconcileEnabledTools(agent.enabledTools, [
            { ensure: [], remove: [tool.name] },
          ])
          if (plan.changed) {
            await db.aIAgentConfig.update({
              where: { id: agent.id },
              data: { enabledTools: { set: plan.next } },
            })
          }
        }
      }
    }

    const deleted = await deleteIntegration(orgId, integration.id)
    if (!deleted) throw new ORPCError('NOT_FOUND', { message: 'Integração não encontrada' })

    await auditLifecycle('integration.deleted', {
      integrationId: deleted.id,
      userId: user.id,
      organizationId: orgId,
      metadata: { displayName: integration.displayName },
    })
    await invalidateProjectRefinement({
      projectId: integration.builderProjectId,
      organizationId: orgId,
      reason: 'Uma integração foi removida depois do refinamento.',
    })

    return ok({ id: deleted.id, deleted: true })
  })

export const integrationLifecycleActions = {
  activateIntegration,
  pauseIntegration,
  resumeIntegration,
  removeIntegration,
}
