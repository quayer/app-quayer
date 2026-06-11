/**
 * rollbackDeployment — compensation saga for a failed Builder deploy.
 *
 * Runs compensation handlers in reverse order. Each step is wrapped in its
 * own try/catch so a failure in one compensation doesn't block the next.
 * Collected errors are returned to the caller for logging/alerting.
 *
 * Touches tables:
 *   - AgentDeployment (UPDATE status = PAUSED) — via detachConnection
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
import { compensateMaterializePricing } from './materialize-pricing.handler'
import { compensateMaterializeTeam } from './materialize-team.handler'
import { compensateMaterializeMedia } from './materialize-media.handler'
import { compensateMaterializeKnowledge } from './materialize-knowledge.handler'

// Matches the real BuilderDeployment columns (schema.prisma): no organizationId
// / userId / updatedAt / publishedAt exist. Org is derived via the `project`
// relation; whether the version was published is read from BuilderPromptVersion.
type BuilderDeploymentRow = {
  id: string
  projectId: string
  promptVersionId: string
  aiAgentId: string | null
  instanceId: string | null
  connectionId: string | null
  project?: { organizationId: string | null } | null
}

async function loadDeployment(
  deploymentId: string,
): Promise<BuilderDeploymentRow | null> {
  try {
    const row = await (database as unknown as {
      builderDeployment: {
        findUnique: (args: {
          where: { id: string }
          select?: Record<string, unknown>
        }) => Promise<BuilderDeploymentRow | null>
      }
    }).builderDeployment.findUnique({
      where: { id: deploymentId },
      select: {
        id: true,
        projectId: true,
        promptVersionId: true,
        aiAgentId: true,
        instanceId: true,
        connectionId: true,
        project: { select: { organizationId: true } },
      },
    })
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

  // Org comes from the project relation (no organizationId column on the row).
  const organizationId = row.project?.organizationId ?? ''

  // Whether the prompt version is published (so unpublishVersion compensation
  // actually runs) is read from the source of truth, not a non-existent column.
  let publishedAt: Date | undefined
  try {
    const version = await database.builderPromptVersion.findUnique({
      where: { id: row.promptVersionId },
      select: { publishedAt: true },
    })
    publishedAt = version?.publishedAt ?? undefined
  } catch {
    publishedAt = undefined
  }

  const context: DeployContext = {
    deploymentId,
    projectId: row.projectId,
    promptVersionId: row.promptVersionId,
    aiAgentId: row.aiAgentId ?? '',
    organizationId,
    userId,
    state: {
      instanceId: row.instanceId ?? undefined,
      connectionId: row.connectionId ?? undefined,
      publishedAt,
    },
  }

  // Reverse execution order (attach → instance → materialize_knowledge →
  // materialize_media → materialize_team → materialize_pricing → publish). All four
  // materialize compensations are self-contained no-ops: ctx.state.{pricing,team,
  // media,knowledge} is NOT reconstructed from the BuilderDeploymentRow, and the
  // materialized catalog/department/media/RAG-link are the user's source of truth
  // (not deploy garbage), so none is undone.
  const steps: Array<{ name: DeployStepName; fn: () => Promise<void> }> = [
    { name: 'attach_connection', fn: () => detachConnection(context) },
    { name: 'create_instance', fn: () => deleteDeployInstance(context) },
    { name: 'materialize_knowledge', fn: () => compensateMaterializeKnowledge(context) },
    { name: 'materialize_media', fn: () => compensateMaterializeMedia(context) },
    { name: 'materialize_team', fn: () => compensateMaterializeTeam(context) },
    { name: 'materialize_pricing', fn: () => compensateMaterializePricing(context) },
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
      // No `updatedAt` column on BuilderDeployment — writing it threw and was
      // swallowed, so rolled_back never persisted. Only real columns now.
      data: {
        rolledBack: true,
        status: 'rolled_back',
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
