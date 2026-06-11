/**
 * Integration Builder — LIFECYCLE routes (Wave 1, T18).
 *
 * Split out of `integrations.routes.ts` to keep both files under the route
 * limit (docs/FILE_SIZE_GUIDELINES.md ≤400). These are the role-gated state
 * transitions that flip an integration on/off and keep the runtime catalog
 * (`AgentTool.isActive` + `AIAgentConfig.enabledTools` + `AgentTool.description`)
 * in lockstep so the playground/production runtime sees exactly the same tools:
 *
 *   POST   /integrations/:id/activate — gates (agente publicado + validated +
 *            último teste success + quota ≤3 NA MESMA transação) → status 'active'
 *            + tool no enabledTools + triggerDescription na AgentTool.description.
 *   POST   /integrations/:id/pause    — status 'paused' (isActive=false). NÃO toca
 *            enabledTools (a tool fica anexada, só inativa no catálogo).
 *   POST   /integrations/:id/resume   — re-exige teste recente OK → status 'active'
 *            + garante a tool no enabledTools.
 *   DELETE /integrations/:id          — remove a key do enabledTools (se houver
 *            agente) ANTES do delete composto (soft-delete CustomIntegration +
 *            hard-delete AgentTool).
 *
 * Toda mutação passa pelo role-gate `assertIntegrationLifecycleRole` (ADMIN
 * global OU MASTER da org) e é flag-gated defensivamente. AuditLog por transição.
 *
 * Zero `any`; tudo org-scoped por `user.currentOrgId`. Espelha o shape de
 * pricing.routes.ts / credential.routes.ts (igniter.mutation + authOrApiKey +
 * response.success/badRequest/notFound/forbidden/unauthorized).
 */

import type { Prisma } from '@prisma/client'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { getDatabase } from '@/server/services/database'
import {
  isIntegrationBuilderEnabled,
  INTEGRATION_BUILDER_OVERRIDE_COOKIE,
} from '@/lib/feature-flags/integration-builder'
import { reconcileEnabledTools } from '@/server/ai-module/builder/deploy/enabled-tools-derivation'

import { integrationIdParamSchema } from './integration.schemas'
import {
  getIntegration,
  setStatus,
  deleteIntegration,
  assertActiveIntegrationQuota,
  IntegrationQuotaError,
} from './integration.repository'
import { assertIntegrationLifecycleRole } from './integration-access'

// ---------------------------------------------------------------------------
// Shared helpers (kept in sync with integrations.routes.ts)
// ---------------------------------------------------------------------------

/** Session user shape we rely on (full Prisma `User` carries `role`). */
interface AuthedUser {
  id: string
  currentOrgId?: string | null
  role?: string | null
}

/** Reads the integration-builder QA override cookie from the raw request. */
function readOverrideCookie(request: {
  headers: { get(name: string): string | null }
}): string | null {
  const cookieHeader = request.headers.get('cookie') ?? ''
  const value = cookieHeader
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${INTEGRATION_BUILDER_OVERRIDE_COOKIE}=`))
    ?.split('=')
    .slice(1)
    .join('=')
  return value ?? null
}

/**
 * Writes an AuditLog row for a lifecycle transition. metadata is value-free by
 * construction (only the transition + the integration's display/tool naming).
 */
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

// ---------------------------------------------------------------------------
// POST /integrations/:id/activate
// ---------------------------------------------------------------------------

const activateIntegration = igniter.mutation({
  name: 'Activate Integration',
  description:
    'Ativa a integração após gates server-side (agente publicado + validada + teste OK + limite de ativas) e espelha a tool no catálogo do runtime.',
  path: '/integrations/:id/activate' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: integrationIdParamSchema.optional(),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')
    const orgId = user.currentOrgId

    if (!isIntegrationBuilderEnabled(orgId, readOverrideCookie(request))) {
      return response.notFound('Recurso indisponível')
    }

    const params = request.params as { id?: string }
    if (!params.id) return response.badRequest('id obrigatório')

    const access = await assertIntegrationLifecycleRole(user, orgId)
    if (!access.allowed) return response.forbidden(access.reason)

    const integration = await getIntegration(orgId, params.id)
    if (!integration) return response.notFound('Integração não encontrada')

    // Gate 1 — o projeto precisa ter um agente publicado para receber a tool.
    const project = await getDatabase().builderProject.findFirst({
      where: { id: integration.builderProjectId, organizationId: orgId },
      select: { id: true, aiAgentId: true },
    })
    if (!project) return response.notFound('Projeto não encontrado')
    if (!project.aiAgentId) {
      return response.badRequest('O projeto ainda não tem um agente publicado.')
    }

    // Gate 2 — só ativa o que foi validado E cujo último teste teve sucesso.
    if (
      integration.status !== 'validated' ||
      integration.lastTestStatus !== 'success'
    ) {
      return response.badRequest('Teste a integração com sucesso antes de ativar.')
    }

    const db = getDatabase()

    // Gate 3 (quota ≤3) NA MESMA transação da ativação — count+activate atômicos.
    try {
      await db.$transaction(async (tx) => {
        await assertActiveIntegrationQuota(tx, orgId)

        // status 'active' espelha AgentTool.isActive=true (dentro do mesmo tx do
        // repository, mas aqui chamamos setStatus que tem seu próprio tx — então
        // a checagem de quota acima já garantiu o slot dentro DESTE tx).
        await tx.customIntegration.update({
          where: { id: integration.id },
          data: {
            status: 'active',
            activatedById: user.id,
            activatedAt: new Date(),
          },
        })

        if (integration.agentToolId) {
          // Compõe o triggerDescription na description da tool (FR-09) para o
          // runtime/playground saber QUANDO usar; espelha isActive=true.
          const toolDescription =
            integration.triggerDescription?.trim() ||
            `Integração: ${integration.displayName}`
          await tx.agentTool.update({
            where: { id: integration.agentToolId },
            data: { isActive: true, description: toolDescription },
          })

          // Garante a key da tool no enabledTools do agente (set-merge: preserva
          // tools custom/desconhecidas; só anexa quando ausente).
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
        return response.badRequest(err.message)
      }
      throw err
    }

    await auditLifecycle('integration.activated', {
      integrationId: integration.id,
      userId: user.id,
      organizationId: orgId,
      metadata: { displayName: integration.displayName },
    })

    return response.success({ id: integration.id, status: 'active' })
  },
})

// ---------------------------------------------------------------------------
// POST /integrations/:id/pause
// ---------------------------------------------------------------------------

const pauseIntegration = igniter.mutation({
  name: 'Pause Integration',
  description:
    'Pausa a integração (status paused / AgentTool.isActive=false). NÃO toca enabledTools — a tool fica anexada, só inativa no catálogo.',
  path: '/integrations/:id/pause' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: integrationIdParamSchema.optional(),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')
    const orgId = user.currentOrgId

    if (!isIntegrationBuilderEnabled(orgId, readOverrideCookie(request))) {
      return response.notFound('Recurso indisponível')
    }

    const params = request.params as { id?: string }
    if (!params.id) return response.badRequest('id obrigatório')

    const access = await assertIntegrationLifecycleRole(user, orgId)
    if (!access.allowed) return response.forbidden(access.reason)

    // setStatus 'paused' espelha AgentTool.isActive=false; org-scoped (null = 404).
    const updated = await setStatus(orgId, params.id, 'paused')
    if (!updated) return response.notFound('Integração não encontrada')

    await auditLifecycle('integration.paused', {
      integrationId: updated.id,
      userId: user.id,
      organizationId: orgId,
      metadata: { displayName: updated.displayName },
    })

    return response.success({ id: updated.id, status: 'paused' })
  },
})

// ---------------------------------------------------------------------------
// POST /integrations/:id/resume
// ---------------------------------------------------------------------------

const resumeIntegration = igniter.mutation({
  name: 'Resume Integration',
  description:
    'Reativa uma integração pausada — re-exige teste recente com sucesso, volta a status active e garante a tool no enabledTools.',
  path: '/integrations/:id/resume' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: integrationIdParamSchema.optional(),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')
    const orgId = user.currentOrgId

    if (!isIntegrationBuilderEnabled(orgId, readOverrideCookie(request))) {
      return response.notFound('Recurso indisponível')
    }

    const params = request.params as { id?: string }
    if (!params.id) return response.badRequest('id obrigatório')

    const access = await assertIntegrationLifecycleRole(user, orgId)
    if (!access.allowed) return response.forbidden(access.reason)

    const integration = await getIntegration(orgId, params.id)
    if (!integration) return response.notFound('Integração não encontrada')

    // Re-exige um teste recente com sucesso antes de voltar ao ar.
    if (integration.lastTestStatus !== 'success') {
      return response.badRequest('Teste a integração com sucesso antes de reativar.')
    }

    const db = getDatabase()
    const project = await db.builderProject.findFirst({
      where: { id: integration.builderProjectId, organizationId: orgId },
      select: { aiAgentId: true },
    })

    // setStatus 'active' espelha AgentTool.isActive=true; stamp do ativador.
    const updated = await setStatus(orgId, integration.id, 'active', {
      field: 'activated',
      userId: user.id,
    })
    if (!updated) return response.notFound('Integração não encontrada')

    // Garante a tool no enabledTools do agente (se houver agente + tool).
    await ensureToolEnabled(project?.aiAgentId ?? null, integration.agentToolId, orgId)

    await auditLifecycle('integration.resumed', {
      integrationId: updated.id,
      userId: user.id,
      organizationId: orgId,
      metadata: { displayName: updated.displayName },
    })

    return response.success({ id: updated.id, status: 'active' })
  },
})

// ---------------------------------------------------------------------------
// DELETE /integrations/:id
// ---------------------------------------------------------------------------

const removeIntegration = igniter.mutation({
  name: 'Delete Integration',
  description:
    'Remove a integração: tira a key do enabledTools (se houver agente) ANTES do delete composto (soft-delete da integração + hard-delete da AgentTool, liberando o nome).',
  path: '/integrations/:id' as const,
  method: 'DELETE',
  use: [authOrApiKeyProcedure({ required: true })],
  body: integrationIdParamSchema.optional(),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as AuthedUser | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) return response.badRequest('Organização não selecionada')
    const orgId = user.currentOrgId

    if (!isIntegrationBuilderEnabled(orgId, readOverrideCookie(request))) {
      return response.notFound('Recurso indisponível')
    }

    const params = request.params as { id?: string }
    if (!params.id) return response.badRequest('id obrigatório')

    const access = await assertIntegrationLifecycleRole(user, orgId)
    if (!access.allowed) return response.forbidden(access.reason)

    const integration = await getIntegration(orgId, params.id)
    if (!integration) return response.notFound('Integração não encontrada')

    const db = getDatabase()
    const project = await db.builderProject.findFirst({
      where: { id: integration.builderProjectId, organizationId: orgId },
      select: { aiAgentId: true },
    })

    // Remove a key do enabledTools ANTES do delete composto (o hard-delete da
    // AgentTool no repository libera o @@unique do nome, então removemos a
    // referência do agente primeiro para o catálogo não apontar para um vazio).
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
    if (!deleted) return response.notFound('Integração não encontrada')

    await auditLifecycle('integration.deleted', {
      integrationId: deleted.id,
      userId: user.id,
      organizationId: orgId,
      metadata: { displayName: integration.displayName },
    })

    return response.success({ id: deleted.id, deleted: true })
  },
})

// ---------------------------------------------------------------------------
// Local helper — ensure a tool name is present in an agent's enabledTools.
// ---------------------------------------------------------------------------

/**
 * Set-merges the AgentTool's name into the agent's `enabledTools` (preserving
 * custom/unknown entries; only appends when absent). No-op when there is no
 * agent or no backing tool. Org-scoped on the agent lookup.
 */
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

export const integrationLifecycleRoutes = {
  activateIntegration,
  pauseIntegration,
  resumeIntegration,
  removeIntegration,
}
