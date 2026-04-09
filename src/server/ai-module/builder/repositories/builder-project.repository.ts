/**
 * Builder Project Repository
 *
 * Thin Prisma wrapper for BuilderProject / BuilderProjectConversation /
 * BuilderProjectMessage / BuilderPromptVersion. All methods are organization-scoped
 * at the caller — this layer trusts the caller has already validated org ownership
 * unless the method explicitly enforces it (see findProjectForOrg).
 */

import { getDatabase } from '@/server/services/database'
import type { Prisma } from '@prisma/client'

export const builderProjectRepository = {
  /**
   * US-005: Create a BuilderProject + empty conversation + first user message
   * in a single transaction.
   */
  async createWithInitialMessage(params: {
    organizationId: string
    userId: string
    prompt: string
    type: 'ai_agent'
    name: string
  }) {
    const database = getDatabase()
    if (!database.builderProject) {
      throw new Error(
        'PrismaClient.builderProject delegate not available. Run `npx prisma generate` and restart the dev server.',
      )
    }
    return database.$transaction(async (tx) => {
      const project = await tx.builderProject.create({
        data: {
          organizationId: params.organizationId,
          userId: params.userId,
          type: params.type,
          name: params.name,
          status: 'draft',
          aiAgentId: null,
        },
      })

      const conversation = await tx.builderProjectConversation.create({
        data: {
          projectId: project.id,
          organizationId: params.organizationId,
          userId: params.userId,
          stateSummary: null,
          lastMessageAt: new Date(),
        },
      })

      await tx.builderProjectMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'user',
          content: params.prompt,
        },
      })

      return { project, conversation }
    })
  },

  /**
   * Find a project for a specific org — used to enforce tenant boundaries.
   */
  async findProjectForOrg(projectId: string, organizationId: string) {
    const database = getDatabase()
    return database.builderProject.findFirst({
      where: { id: projectId, organizationId },
    })
  },

  /**
   * Find a BuilderPromptVersion by id, verifying it belongs to the given agent.
   */
  async findPromptVersionForAgent(promptVersionId: string, aiAgentId: string) {
    const database = getDatabase()
    return database.builderPromptVersion.findFirst({
      where: { id: promptVersionId, aiAgentId },
    })
  },

  /**
   * US-007: Mark a BuilderPromptVersion as published and set the project
   * status to production. Runs in one transaction.
   */
  async publishVersion(params: {
    projectId: string
    promptVersionId: string
    publishedBy: string
  }) {
    const database = getDatabase()
    return database.$transaction(async (tx) => {
      const version = await tx.builderPromptVersion.update({
        where: { id: params.promptVersionId },
        data: {
          publishedAt: new Date(),
          publishedBy: params.publishedBy,
        },
      })

      await tx.builderProject.update({
        where: { id: params.projectId },
        data: { status: 'production' },
      })

      return version
    })
  },
}

export type BuilderProjectRepository = typeof builderProjectRepository
export type BuilderProjectWithConversation = Prisma.BuilderProjectGetPayload<{
  include: { conversation: true }
}>
