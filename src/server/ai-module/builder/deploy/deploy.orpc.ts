/**
 * Builder Deploy — porta mecânica para oRPC (lote B4 do builder).
 *
 * Origem: ./deploy.routes.ts (4 actions).
 *   publish        POST /builder/deploy/publish
 *   publishVersion POST /builder/deploy/publish-version
 *   status         GET  /builder/deploy/:projectId/status
 *   rollback       POST /builder/deploy/:deploymentId/rollback (admin-only)
 *
 * Persistência de BuilderDeployment best-effort preservada: delegate ausente
 * ou leitura falha degradam para payload mínimo (status) ou 404 (rollback).
 */
import { ORPCError } from '@orpc/server'
import { z } from 'zod'
import { database } from '@/server/services/database'
import {
  assertNoCriticalRefinementPublishBlocker,
  executeDeployFlow,
} from './deploy-flow.orchestrator'
import { publishVersion as publishVersionStep } from './publish-version.handler'
import { rollbackDeployment } from './rollback.handler'
import type { DeployStatus } from './deploy.contract'
import { base } from '@/orpc/base'
import { ok } from '@/orpc/envelope'
import { authOrApiKey } from '@/orpc/auth.middleware'
import { builderOrg } from '../projects/routes/crud.orpc'

const authed = base.use(authOrApiKey)

// ---------------------------------------------------------------------------
// Helpers — cópia 1:1 de deploy.routes.ts
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

// ==========================================
// PUBLISH (saga completa) — POST /builder/deploy/publish
// ==========================================
export const publish = authed
  .route({
    method: 'POST',
    path: '/builder/deploy/publish',
    summary: 'Publish Builder Deployment',
  })
  .input(
    z.object({
      projectId: z.string().uuid(),
      promptVersionId: z.string().uuid(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { userId, orgId } = builderOrg(context)

    try {
      const result = await executeDeployFlow({
        projectId: input.projectId,
        promptVersionId: input.promptVersionId,
        userId,
        organizationId: orgId,
      })
      return ok({
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
      throw new ORPCError('BAD_REQUEST', {
        message: `Erro ao publicar deploy: ${message}`,
      })
    }
  })

// ==========================================
// STATUS — GET /builder/deploy/{projectId}/status
// ==========================================
export const status = authed
  .route({
    method: 'GET',
    path: '/builder/deploy/{projectId}/status',
    summary: 'Get Deploy Status',
  })
  .input(z.object({ projectId: z.string().min(1, 'projectId obrigatório') }))
  .handler(async ({ input, context }) => {
    const { orgId } = builderOrg(context)

    const delegate = getBuilderDeployment()
    if (!delegate) {
      console.warn('[deploy/status] BuilderDeployment indisponível — retornando vazio')
      return ok({
        success: true,
        data: null,
        warning: 'BuilderDeployment table not available',
      })
    }

    try {
      const latest = await delegate.findFirst({
        // org scoping via a relação project (sem coluna organizationId aqui)
        where: { projectId: input.projectId, project: { organizationId: orgId } },
        orderBy: { startedAt: 'desc' },
      })

      if (!latest) {
        return ok({ success: true, data: null })
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

      return ok({ success: true, data: { deployment: latest, steps } })
    } catch (err) {
      console.warn('[deploy/status] Leitura falhou:', err)
      return ok({
        success: true,
        data: null,
        warning: 'BuilderDeployment read failed',
      })
    }
  })

// ==========================================
// ROLLBACK — POST /builder/deploy/{deploymentId}/rollback (admin-only)
// ==========================================
export const rollback = authed
  .route({
    method: 'POST',
    path: '/builder/deploy/{deploymentId}/rollback',
    summary: 'Rollback Deployment',
  })
  .input(z.object({ deploymentId: z.string().min(1, 'deploymentId obrigatório') }))
  .handler(async ({ input, context }) => {
    const user = context.auth.session.user as {
      id: string
      role?: string | null
      currentOrgId?: string | null
    } | null
    if (!user) throw new ORPCError('UNAUTHORIZED', { message: 'Não autenticado' })
    if (user.role !== 'admin') {
      throw new ORPCError('FORBIDDEN', {
        message: 'Apenas administradores podem reverter deploys',
      })
    }

    const delegate = getBuilderDeployment()
    if (!delegate) {
      throw new ORPCError('NOT_FOUND', {
        message: 'BuilderDeployment indisponível — tabela não provisionada',
      })
    }

    try {
      const deployment = await delegate.findUnique({
        where: { id: input.deploymentId },
      })
      if (!deployment) {
        throw new ORPCError('NOT_FOUND', { message: 'Deployment não encontrado' })
      }
      // Sem coluna organizationId no BuilderDeployment — posse verificada via
      // o project (que É org-scoped).
      const ownerProject = await database.builderProject.findFirst({
        where: {
          id: deployment.projectId,
          organizationId: user.currentOrgId ?? undefined,
        },
        select: { id: true },
      })
      if (!ownerProject) {
        throw new ORPCError('FORBIDDEN', {
          message: 'Deployment não pertence à organização ativa',
        })
      }

      const result = await rollbackDeployment(input.deploymentId, user.id)
      return ok({ success: true, data: result })
    } catch (err) {
      if (err instanceof ORPCError) throw err
      const message = err instanceof Error ? err.message : 'Erro desconhecido'
      throw new ORPCError('BAD_REQUEST', {
        message: `Erro ao reverter deploy: ${message}`,
      })
    }
  })

// ==========================================
// PUBLISH VERSION — POST /builder/deploy/publish-version
// ==========================================
export const publishVersion = authed
  .route({
    method: 'POST',
    path: '/builder/deploy/publish-version',
    summary: 'Publish Builder Prompt Version',
  })
  .input(
    z.object({
      projectId: z.string().uuid(),
      promptVersionId: z.string().uuid(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { userId, orgId } = builderOrg(context)

    const project = await database.builderProject.findFirst({
      where: { id: input.projectId, organizationId: orgId },
      select: { id: true, aiAgentId: true },
    })
    if (!project) throw new ORPCError('NOT_FOUND', { message: 'Projeto não encontrado' })
    if (!project.aiAgentId) {
      throw new ORPCError('BAD_REQUEST', {
        message: 'Projeto ainda não possui agente — crie o agente antes de publicar',
      })
    }

    try {
      await assertNoCriticalRefinementPublishBlocker({
        projectId: project.id,
        organizationId: orgId,
      })

      const result = await publishVersionStep({
        deploymentId: null,
        projectId: project.id,
        promptVersionId: input.promptVersionId,
        aiAgentId: project.aiAgentId,
        organizationId: orgId,
        userId,
        state: {},
      })
      return ok({
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
      throw new ORPCError('BAD_REQUEST', {
        message: `Erro ao publicar versão: ${message}`,
      })
    }
  })

export const deployActions = { publish, publishVersion, status, rollback }
