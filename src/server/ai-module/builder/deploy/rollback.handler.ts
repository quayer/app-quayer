/**
 * rollbackDeployment — compensation saga for a failed Builder deploy.
 *
 * Runs compensation handlers in reverse order. Each step is wrapped in its
 * own try/catch so a failure in one compensation doesn't block the next.
 * Collected errors are returned to the caller for logging/alerting.
 *
 * Touches tables:
 *   - AgentDeployment (UPDATE status = INACTIVE)
 *   - Connection      (DELETE) — via deleteDeployInstance
 *   - BuilderPromptVersion (UPDATE publishedAt = null)
 *   - BuilderProject  (UPDATE status = 'draft')
 *   - BuilderDeployment (UPDATE rolledBack = true) — try/catch fallback
 */

import { database } from '@/server/services/database'
import type { DeployContext, RollbackResult, DeployStepName } from './deploy.contract'
import { detachConnection } from './attach-connection.handler'
import { deleteDeployInstance } from './create-instance.handler'
import { unpublishVersion } from './publish-version.handler'

type BuilderDeploymentRow = {
  id: string
  projectId: string
  promptVersionId: string
  aiAgentId: string | null
  organizationId: string
  userId: string
  instanceId: string | null
  connectionId: string | null
  publishedAt: Date | null
}

async function loadDeployment(
  deploymentId: string,
): Promise<BuilderDeploymentRow | null> {
  try {
    const row = await (database as unknown as {
      builderDeployment: {
        findUnique: (args: {
          where: { id: string }
        }) => Promise<BuilderDeploymentRow | null>
      }
    }).builderDeployment.findUnique({ where: { id: deploymentId } })
    return row ?? null
  } catch (err) {
    console.warn(
      '[deploy/rollback] builderDeployment.findUnique unavailable — table may not exist:',
      err,
    )
    return null
  }
}

export async function rollbackDeployment(
  deploymentId: string,
  userId: string,
): Promise<RollbackResult> {
  const compensations: RollbackResult['compensations'] = []
  const row = await loadDeployment(deploymentId)

  if (!row) {
    return {
      deploymentId,
      rolledBack: false,
      compensations: [
        {
          step: 'publish_version',
          success: false,
          error: 'BuilderDeployment não encontrado (tabela ausente ou id inválido)',
        },
      ],
    }
  }

  const context: DeployContext = {
    deploymentId,
    projectId: row.projectId,
    promptVersionId: row.promptVersionId,
    aiAgentId: row.aiAgentId ?? '',
    organizationId: row.organizationId,
    userId,
    state: {
      instanceId: row.instanceId ?? undefined,
      connectionId: row.connectionId ?? undefined,
      publishedAt: row.publishedAt ?? undefined,
    },
  }

  const steps: Array<{ name: DeployStepName; fn: () => Promise<void> }> = [
    { name: 'attach_connection', fn: () => detachConnection(context) },
    { name: 'create_instance', fn: () => deleteDeployInstance(context) },
    { name: 'publish_version', fn: () => unpublishVersion(context) },
  ]

  for (const step of steps) {
    try {
      await step.fn()
      compensations.push({ step: step.name, success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      compensations.push({ step: step.name, success: false, error: message })
      console.warn(
        `[deploy/rollback] Compensação de '${step.name}' falhou:`,
        message,
      )
    }
  }

  // Mark the BuilderDeployment row as rolled back.
  try {
    await (database as unknown as {
      builderDeployment: {
        update: (args: {
          where: { id: string }
          data: Record<string, unknown>
        }) => Promise<unknown>
      }
    }).builderDeployment.update({
      where: { id: deploymentId },
      data: {
        rolledBack: true,
        status: 'rolled_back',
        updatedAt: new Date(),
      },
    })
  } catch (err) {
    console.warn(
      '[deploy/rollback] Falha ao marcar BuilderDeployment como rolled back:',
      err,
    )
  }

  const allOk = compensations.every((c) => c.success)

  return {
    deploymentId,
    rolledBack: allOk,
    compensations,
  }
}
