/**
 * attachConnection handler — step 3 of the Builder deploy saga.
 *
 * Links the freshly-created WhatsApp Connection to the Builder agent by
 * creating / activating an AgentDeployment row. Based on logic from
 * `tools/publish-agent.tool.ts` (which we do NOT modify — the tool stays
 * as-is for the LLM; this handler is the non-LLM callable equivalent).
 *
 * Touches tables:
 *   - AgentDeployment (INSERT or UPDATE)
 *   - BuilderDeployment (UPDATE connectionId) — try/catch fallback
 *
 * Coupling with communication/:
 *   - Reads `database.connection` to verify ownership.
 *   - Writes `database.agentDeployment` which pivots AIAgentConfig x
 *     Connection. No circular dep: agentDeployment lives in the same
 *     ai-module / Prisma schema.
 *
 * Idempotent: re-running with an existing (agentConfigId, connectionId)
 * pair toggles the row back to ACTIVE without duplication.
 */

import { database } from '@/server/services/database'
import type { DeployContext } from './deploy.contract'

export interface AttachConnectionResult {
  connectionId: string
  agentDeploymentId: string
  reused: boolean
}

export async function attachConnection(
  context: DeployContext,
): Promise<AttachConnectionResult> {
  if (!context.aiAgentId) {
    throw new Error('Agente não definido no contexto de deploy')
  }
  if (!context.state.instanceId) {
    throw new Error(
      'Instância não foi criada — não é possível anexar connection',
    )
  }

  // Verify the connection belongs to the org (tenant boundary).
  const connection = await database.connection.findFirst({
    where: {
      id: context.state.instanceId,
      organizationId: context.organizationId,
    },
    select: { id: true },
  })

  if (!connection) {
    throw new Error(
      `Connection ${context.state.instanceId} não pertence à organização`,
    )
  }

  const existing = await database.agentDeployment.findFirst({
    where: {
      agentConfigId: context.aiAgentId,
      connectionId: connection.id,
    },
    select: { id: true },
  })

  let agentDeploymentId: string
  let reused = false

  if (existing) {
    await database.agentDeployment.update({
      where: { id: existing.id },
      data: { status: 'ACTIVE', updatedAt: new Date() },
    })
    agentDeploymentId = existing.id
    reused = true
  } else {
    const created = await database.agentDeployment.create({
      data: {
        agentConfigId: context.aiAgentId,
        connectionId: connection.id,
        mode: 'CHAT',
        status: 'ACTIVE',
      },
      select: { id: true },
    })
    agentDeploymentId = created.id
  }

  context.state.connectionId = connection.id

  if (context.deploymentId) {
    try {
      await (database as unknown as {
        builderDeployment: {
          update: (args: {
            where: { id: string }
            data: Record<string, unknown>
          }) => Promise<unknown>
        }
      }).builderDeployment.update({
        where: { id: context.deploymentId },
        data: { connectionId: connection.id },
      })
    } catch (err) {
      console.warn(
        '[deploy/attach-connection] BuilderDeployment.update failed — table may not exist yet:',
        err,
      )
    }
  }

  return { connectionId: connection.id, agentDeploymentId, reused }
}

/**
 * Compensation: mark AgentDeployment as INACTIVE.
 */
export async function detachConnection(
  context: DeployContext,
): Promise<void> {
  if (!context.aiAgentId || !context.state.connectionId) return
  await database.agentDeployment.updateMany({
    where: {
      agentConfigId: context.aiAgentId,
      connectionId: context.state.connectionId,
    },
    data: { status: 'PAUSED', updatedAt: new Date() },
  })
}
