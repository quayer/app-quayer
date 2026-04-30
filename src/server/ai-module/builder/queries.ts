/**
 * Builder Projects — Shared Data-Access Layer
 *
 * Used by Server Components (`/`, `/projetos`, `/projetos/[id]`) and by
 * `getBuilderSidebarData`. Wraps `builderProjectRepository` with
 * degrades-to-empty error handling for Turbopack stale-client edge cases.
 */

import { getDatabase } from '@/server/services/database'
import { builderProjectRepository } from './projects/projects.repository'

export async function listOrgProjects(organizationId: string) {
  try {
    const { data } = await builderProjectRepository.listForOrg({
      organizationId,
      limit: 100,
    })
    return data
  } catch (err) {
    console.warn('[builder/queries] listOrgProjects failed:', err)
    return []
  }
}

export async function listRecentProjects(organizationId: string, limit = 8) {
  try {
    const { data } = await builderProjectRepository.listForOrg({
      organizationId,
      limit,
    })
    return data
  } catch (err) {
    console.warn('[builder/queries] listRecentProjects failed:', err)
    return []
  }
}

export async function getProjectDetail(
  projectId: string,
  organizationId: string,
) {
  const database = getDatabase()
  try {
    return await database.builderProject.findFirst({
      where: { id: projectId, organizationId },
      include: {
        aiAgent: {
          select: {
            id: true,
            name: true,
            systemPrompt: true,
            provider: true,
            model: true,
            // Active AgentDeployments indicate a live channel connection.
            // Field name on AIAgentConfig is 'deployments' (-> AgentDeployment[]).
            deployments: {
              where: { status: 'ACTIVE' },
              select: { id: true, connectionId: true },
              take: 1,
            },
          },
        },
        // Still included for backward compat with the publish saga.
        deployments: {
          select: {
            status: true,
            connectionId: true,
          },
        },
      },
    })
  } catch (err) {
    console.warn('[builder/queries] getProjectDetail failed:', err)
    return null
  }
}

export async function getInitialMessages(projectId: string, limit = 50) {
  const database = getDatabase()
  try {
    const conversation = await database.builderProjectConversation.findFirst({
      where: { projectId },
      select: { id: true },
    })
    if (!conversation) return []

    const messages = await database.builderProjectMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
    return messages
  } catch (err) {
    console.warn('[builder/queries] getInitialMessages failed:', err)
    return []
  }
}
