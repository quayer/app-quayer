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
import { materializePricing } from './materialize-pricing.handler'
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
          // schema: BuilderDeployment has NO organizationId column (org is
          // reachable via the project relation) and uses `triggeredBy` for the
          // user id — writing `organizationId`/`userId` made every create throw.
          triggeredBy: input.userId,
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

  // Tracks the step currently running so the catch maps `failureStep` robustly.
  // Status alone is ambiguous: `materialize_pricing` reuses 'publishing' (it's
  // still the "config" phase, pre-infra), so inferring the step from status would
  // mis-attribute its failures to 'publish_version'. We capture the real name here.
  let activeStep: DeployStepName = 'publish_version'

  const runStep = async <T>(
    name: DeployStepName,
    status: DeployStatus,
    fn: () => Promise<T>,
  ): Promise<T> => {
    activeStep = name
    result.status = status
    // `currentStep` is not a column on BuilderDeployment — the `status` enum
    // already encodes the active step (publishing/instance_creating/attaching).
    // The step NAME is tracked in `activeStep` (above) for failure attribution.
    await updateDeploymentStatus(deploymentId, { status })
    return fn()
  }

  try {
    const published = await runStep('publish_version', 'publishing', () =>
      publishVersion(context),
    )
    result.publishedAt = published.publishedAt
    result.versionNumber = published.versionNumber

    // Materialize the pricing collected in builderState (Onda B) into the runtime
    // models (PriceList/PriceItem) BEFORE provisioning the WhatsApp instance — so
    // a materialization failure leaves no orphan UAZapi instance to compensate.
    // Status reuses 'publishing' (still pre-infra "config" phase); the real step
    // name 'materialize_pricing' lives in `activeStep` for failure attribution.
    const materialized = await runStep(
      'materialize_pricing',
      'publishing',
      () => materializePricing(context),
    )
    context.state.pricing = { listId: materialized.listId }

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
    // Use the captured active step name (not status, which is ambiguous now that
    // materialize_pricing shares 'publishing'). This attributes failures to the
    // exact step for ALL steps, including the new one.
    const failureStep: DeployStepName = activeStep

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
