import type { Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import {
  invalidateRefinement,
  parseBuilderState,
} from '../cards/builder-state'

export async function invalidateProjectRefinement(input: {
  projectId: string
  organizationId: string
  reason: string
}): Promise<void> {
  await database.$transaction(async (tx) => {
    const row = await tx.builderProjectConversation.findFirst({
      where: {
        projectId: input.projectId,
        organizationId: input.organizationId,
      },
      select: { id: true, builderState: true },
    })
    if (!row) return

    const current = parseBuilderState(row.builderState)
    if (current.journeyVersion !== 2) return

    const next = invalidateRefinement(current, input.reason)

    const project = await tx.builderProject.findFirst({
      where: { id: input.projectId, organizationId: input.organizationId },
      select: { aiAgentId: true },
    })

    if (next !== current) {
      await tx.builderProjectConversation.updateMany({
        where: { id: row.id, organizationId: input.organizationId },
        data: { builderState: next as unknown as Prisma.InputJsonValue },
      })
    }

    if (project?.aiAgentId) {
      await tx.agentDeployment.updateMany({
        where: { agentConfigId: project.aiAgentId, status: 'ACTIVE' },
        data: { status: 'PAUSED', updatedAt: new Date() },
      })
    }
  })
}
