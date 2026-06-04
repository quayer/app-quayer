/**
 * Deploy Routes — HTTP surface for the Builder deploy saga.
 *
 * Exposes 3 actions under `/deploy`:
 *   POST  /deploy/publish              — kick off a deploy (returns deployment id)
 *   GET   /deploy/:projectId/status    — latest deployment + step-by-step progress
 *   POST  /deploy/:deploymentId/rollback — admin compensation
 *
 * Persistence of BuilderDeployment rows is best-effort: all calls to
 * `database.builderDeployment.*` are wrapped in try/catch so the routes work
 * even before the Prisma migration lands. When the table is unavailable the
 * status endpoint returns a minimal in-memory payload and rollback returns a
 * 404 with a warning.
 */

import { z } from 'zod'
import { igniter } from '@/igniter'
import { authOrApiKeyProcedure } from '@/server/core/auth/procedures/api-key.procedure'
import { database } from '@/server/services/database'
import { executeDeployFlow } from './deploy-flow.orchestrator'
import { publishVersion as publishVersionStep } from './publish-version.handler'
import { rollbackDeployment } from './rollback.handler'
import type { DeployStatus } from './deploy.contract'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const publishInputSchema = z.object({
  projectId: z.string().uuid(),
  promptVersionId: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type BuilderDeploymentRow = {
  id: string
  projectId: string
  promptVersionId: string
  triggeredBy: string
  status: DeployStatus
  failureStep: string | null
  failureReason: string | null
  instanceId: string | null
  connectionId: string | null
  startedAt: Date
  completedAt: Date | null
  rolledBack: boolean | null
}

type BuilderDeploymentDelegate = {
  findFirst: (args: {
    where: Record<string, unknown>
    orderBy?: Record<string, unknown>
  }) => Promise<BuilderDeploymentRow | null>
  findUnique: (args: {
    where: { id: string }
  }) => Promise<BuilderDeploymentRow | null>
}

function getBuilderDeployment(): BuilderDeploymentDelegate | null {
  const delegate = (database as unknown as {
    builderDeployment?: BuilderDeploymentDelegate
  }).builderDeployment
  return delegate ?? null
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const publish = igniter.mutation({
  name: 'Publish Builder Deployment',
  description:
    'Orchestrates the full Builder deploy saga (publish version → create instance → attach connection).',
  path: '/deploy/publish',
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: publishInputSchema,
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as { id: string; currentOrgId?: string } | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }

    const { projectId, promptVersionId } = request.body

    try {
      const result = await executeDeployFlow({
        projectId,
        promptVersionId,
        userId: user.id,
        organizationId: user.currentOrgId,
      })
      return response.json({
        success: true,
        data: {
          deploymentId: result.deploymentId,
          status: result.status,
          instanceId: result.instanceId,
          connectionId: result.connectionId,
          versionNumber: result.versionNumber,
          publishedAt: result.publishedAt,
        },
        message: 'Deploy concluído',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[deploy/publish] Falha:', err)
      return response.badRequest(`Erro ao publicar deploy: ${message}`)
    }
  },
})

const status = igniter.query({
  name: 'Get Deploy Status',
  description:
    'Retorna o último BuilderDeployment do projeto e o progresso passo-a-passo.',
  path: '/deploy/:projectId/status' as const,
  method: 'GET',
  use: [authOrApiKeyProcedure({ required: true })],
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as { currentOrgId?: string } | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }

    const params = request.params as { projectId?: string }
    const projectId = params.projectId
    if (!projectId) return response.badRequest('projectId obrigatório')

    const delegate = getBuilderDeployment()
    if (!delegate) {
      console.warn('[deploy/status] BuilderDeployment indisponível — retornando vazio')
      return response.json({
        success: true,
        data: null,
        warning: 'BuilderDeployment table not available',
      })
    }

    try {
      const latest = await delegate.findFirst({
        // org scoping via the project relation (no organizationId column here)
        where: { projectId, project: { organizationId: user.currentOrgId } },
        orderBy: { startedAt: 'desc' },
      })

      if (!latest) {
        return response.json({ success: true, data: null })
      }

      const steps = [
        {
          name: 'publish_version',
          done: !!latest.completedAt || latest.status !== 'pending',
          failed: latest.failureStep === 'publish_version',
        },
        {
          name: 'create_instance',
          done: !!latest.instanceId,
          failed: latest.failureStep === 'create_instance',
        },
        {
          name: 'attach_connection',
          done: !!latest.connectionId,
          failed: latest.failureStep === 'attach_connection',
        },
      ]

      return response.json({
        success: true,
        data: { deployment: latest, steps },
      })
    } catch (err) {
      console.warn('[deploy/status] Leitura falhou:', err)
      return response.json({
        success: true,
        data: null,
        warning: 'BuilderDeployment read failed',
      })
    }
  },
})

const rollback = igniter.mutation({
  name: 'Rollback Deployment',
  description: 'Compensação manual — reverte um BuilderDeployment.',
  path: '/deploy/:deploymentId/rollback' as const,
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({}).optional(),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as { id: string; role?: string; currentOrgId?: string } | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (user.role !== 'admin') {
      return response.forbidden('Apenas administradores podem reverter deploys')
    }

    const params = request.params as { deploymentId?: string }
    const deploymentId = params.deploymentId
    if (!deploymentId) return response.badRequest('deploymentId obrigatório')

    const delegate = getBuilderDeployment()
    if (!delegate) {
      return response.notFound(
        'BuilderDeployment indisponível — tabela não provisionada',
      )
    }

    try {
      const deployment = await delegate.findUnique({ where: { id: deploymentId } })
      if (!deployment) {
        return response.notFound('Deployment não encontrado')
      }
      // No organizationId column on BuilderDeployment — verify ownership via
      // the project (which IS org-scoped).
      const ownerProject = await database.builderProject.findFirst({
        where: { id: deployment.projectId, organizationId: user.currentOrgId },
        select: { id: true },
      })
      if (!ownerProject) {
        return response.forbidden('Deployment não pertence à organização ativa')
      }

      const result = await rollbackDeployment(deploymentId, user.id)
      return response.json({ success: true, data: result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return response.badRequest(`Erro ao reverter deploy: ${message}`)
    }
  },
})

// ---------------------------------------------------------------------------
// publish-version — promote a draft prompt version to production WITHOUT the
// instance-creation saga. The deploy-tab wizard attaches the channel in a
// separate step (channel.routes), so "Publicar" here only needs to promote the
// version. This is the route the UI button hits (the old saga `/publish` would
// provision a duplicate instance over the already-attached channel).
// ---------------------------------------------------------------------------

const publishVersion = igniter.mutation({
  name: 'Publish Builder Prompt Version',
  description:
    'Promove uma versão de prompt para produção (sem criar instância; o canal é anexado à parte).',
  path: '/deploy/publish-version',
  method: 'POST',
  use: [authOrApiKeyProcedure({ required: true })],
  body: z.object({
    projectId: z.string().uuid(),
    promptVersionId: z.string().uuid(),
  }),
  handler: async ({ request, context, response }) => {
    const user = context.auth?.session?.user as
      | { id: string; currentOrgId?: string }
      | undefined
    if (!user) return response.unauthorized('Não autenticado')
    if (!user.currentOrgId) {
      return response.badRequest('Organização não selecionada')
    }

    const { projectId, promptVersionId } = request.body

    const project = await database.builderProject.findFirst({
      where: { id: projectId, organizationId: user.currentOrgId },
      select: { id: true, aiAgentId: true },
    })
    if (!project) return response.notFound('Projeto não encontrado')
    if (!project.aiAgentId) {
      return response.badRequest(
        'Projeto ainda não possui agente — crie o agente antes de publicar',
      )
    }

    try {
      const result = await publishVersionStep({
        deploymentId: null,
        projectId: project.id,
        promptVersionId,
        aiAgentId: project.aiAgentId,
        organizationId: user.currentOrgId,
        userId: user.id,
        state: {},
      })
      return response.json({
        success: true,
        data: {
          versionNumber: result.versionNumber,
          publishedAt: result.publishedAt,
        },
        message: 'Versão publicada',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      console.error('[deploy/publish-version] Falha:', err)
      return response.badRequest(`Erro ao publicar versão: ${message}`)
    }
  },
})

export const deployRoutes = { publish, publishVersion, status, rollback }
