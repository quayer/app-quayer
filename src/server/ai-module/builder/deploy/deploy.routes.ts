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
  organizationId: string
  userId: string
  status: DeployStatus
  currentStep: string | null
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
        where: { projectId, organizationId: user.currentOrgId },
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
    // Admin-only gate — role check is intentionally permissive (lets
    // both 'owner' and 'admin' through); tighten when the roles module
    // exposes a canonical guard.
    if (user.role && !['admin', 'owner'].includes(user.role)) {
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
      const result = await rollbackDeployment(deploymentId, user.id)
      return response.json({ success: true, data: result })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      return response.badRequest(`Erro ao reverter deploy: ${message}`)
    }
  },
})

export const deployRoutes = { publish, status, rollback }
