/**
 * executeDeployFlow — saga orchestrator for Builder deploys.
 *
 * Coordinates the 3-step publish flow (publish version → create instance →
 * attach connection). Tracks progress on a BuilderDeployment row when the
 * table exists, and runs the rollback handler on any step failure.
 *
 * All database writes to `builderDeployment.*` are wrapped in try/catch so
 * this module works even before the corresponding Prisma migration is
 * applied — a console.warn is logged and orchestration continues with an
 * in-memory state object.
 */

import { database } from '@/server/services/database'
import type {
  DeployContext,
  DeployResult,
  DeployStatus,
  DeployStepName,
} from './deploy.contract'
import { publishVersion } from './publish-version.handler'
import { createDeployInstance } from './create-instance.handler'
import { attachConnection } from './attach-connection.handler'
import { rollbackDeployment } from './rollback.handler'

export interface ExecuteDeployFlowInput {
  projectId: string
  promptVersionId: string
  userId: string
  organizationId: string
}

type BuilderDeploymentDelegate = {
  create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>
  update: (args: {
    where: { id: string }
    data: Record<string, unknown>
  }) => Promise<unknown>
}

function getBuilderDeployment(): BuilderDeploymentDelegate | null {
  const delegate = (database as unknown as {
    builderDeployment?: BuilderDeploymentDelegate
  }).builderDeployment
  return delegate ?? null
}

async function updateDeploymentStatus(
  deploymentId: string | null,
  data: Record<string, unknown>,
): Promise<void> {
  if (!deploymentId) return
  const delegate = getBuilderDeployment()
  if (!delegate) return
  try {
    await delegate.update({ where: { id: deploymentId }, data })
  } catch (err) {
    console.warn(
      '[deploy/orchestrator] builderDeployment.update falhou — degradando:',
      err,
    )
  }
}

export async function executeDeployFlow(
  input: ExecuteDeployFlowInput,
): Promise<DeployResult> {
  const startedAt = new Date()

  // Resolve the project + agent.
  const project = await database.builderProject.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      organizationId: true,
      aiAgentId: true,
    },
  })

  if (!project) {
    throw new Error(`Projeto ${input.projectId} não encontrado`)
  }
  if (project.organizationId !== input.organizationId) {
    throw new Error('Projeto não pertence à organização ativa')
  }
  if (!project.aiAgentId) {
    throw new Error(
      'Projeto ainda não possui agente associado — complete o fluxo no Builder antes de publicar',
    )
  }

  // Attempt to persist a BuilderDeployment row. Degrade gracefully.
  let deploymentId: string | null = null
  const delegate = getBuilderDeployment()
  if (delegate) {
    try {
      const row = await delegate.create({
        data: {
          projectId: project.id,
          promptVersionId: input.promptVersionId,
          aiAgentId: project.aiAgentId,
          organizationId: project.organizationId,
          userId: input.userId,
          status: 'pending' satisfies DeployStatus,
          startedAt,
        },
      })
      deploymentId = row.id
    } catch (err) {
      console.warn(
        '[deploy/orchestrator] builderDeployment.create falhou — seguindo em memória:',
        err,
      )
    }
  } else {
    console.warn(
      '[deploy/orchestrator] Delegate builderDeployment não disponível — execução em memória',
    )
  }

  const context: DeployContext = {
    deploymentId,
    projectId: project.id,
    promptVersionId: input.promptVersionId,
    aiAgentId: project.aiAgentId,
    organizationId: project.organizationId,
    userId: input.userId,
    state: {},
  }

  const result: DeployResult = {
    deploymentId,
    status: 'pending',
    projectId: project.id,
    promptVersionId: input.promptVersionId,
    startedAt,
  }

  const runStep = async <T>(
    name: DeployStepName,
    status: DeployStatus,
    fn: () => Promise<T>,
  ): Promise<T> => {
    result.status = status
    await updateDeploymentStatus(deploymentId, { status, currentStep: name })
    return fn()
  }

  try {
    const published = await runStep('publish_version', 'publishing', () =>
      publishVersion(context),
    )
    result.publishedAt = published.publishedAt
    result.versionNumber = published.versionNumber

    const instance = await runStep(
      'create_instance',
      'instance_creating',
      () => createDeployInstance(context),
    )
    result.instanceId = instance.instanceId

    const attached = await runStep('attach_connection', 'attaching', () =>
      attachConnection(context),
    )
    result.connectionId = attached.connectionId

    result.status = 'live'
    result.completedAt = new Date()
    await updateDeploymentStatus(deploymentId, {
      status: 'live',
      completedAt: result.completedAt,
      instanceId: result.instanceId,
      connectionId: result.connectionId,
    })

    return result
  } catch (err) {
    const failureReason = err instanceof Error ? err.message : String(err)
    const failureStep: DeployStepName =
      result.status === 'publishing'
        ? 'publish_version'
        : result.status === 'instance_creating'
          ? 'create_instance'
          : 'attach_connection'

    result.status = 'failed'
    result.failureStep = failureStep
    result.failureReason = failureReason
    result.completedAt = new Date()

    await updateDeploymentStatus(deploymentId, {
      status: 'failed',
      failureStep,
      failureReason,
      completedAt: result.completedAt,
    })

    // Auto-rollback. Swallow errors — they're already logged inside the
    // rollback handler and do not affect the caller's error payload.
    if (deploymentId) {
      try {
        await rollbackDeployment(deploymentId, input.userId)
      } catch (rollbackErr) {
        console.warn(
          '[deploy/orchestrator] Rollback automático falhou:',
          rollbackErr,
        )
      }
    }

    throw new Error(`Deploy falhou em '${failureStep}': ${failureReason}`)
  }
}
