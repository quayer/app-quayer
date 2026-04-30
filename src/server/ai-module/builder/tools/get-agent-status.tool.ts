/**
 * Builder Tool — get_agent_status (US-007)
 *
 * Read-only, concurrent-safe tool that returns a comprehensive status snapshot
 * for a given AI agent: deployment status, prompt versions, connected instance
 * info, active conversations count, and recent message volume.
 *
 * All queries are scoped to the organization boundary.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function getAgentStatusTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'get_agent_status',
    metadata: { isReadOnly: true, isConcurrencySafe: true },
    tool: tool({
      description:
        'Returns the current status of an AI agent including deployment state, prompt versions (current and draft), connected WhatsApp instance details, active conversation count, and message volume from the last 24 hours. Use this to check if an agent is live, how many conversations it handles, and whether there are unpublished prompt changes.',
      inputSchema: z.object({
        agentId: z.string().uuid().describe('The AIAgentConfig.id to inspect'),
      }),
      execute: async (input) => {
        try {
          // 1. Load agent (scoped to org)
          const agent = await database.aIAgentConfig.findFirst({
            where: {
              id: input.agentId,
              organizationId: ctx.organizationId,
            },
            select: {
              id: true,
              name: true,
              isActive: true,
              provider: true,
              model: true,
            },
          })

          if (!agent) {
            return {
              success: false,
              message: `Agent ${input.agentId} not found in this organization.`,
            }
          }

          // 2. Get active deployment with connection info
          const deployment = await database.agentDeployment.findFirst({
            where: {
              agentConfigId: agent.id,
              status: 'ACTIVE',
            },
            orderBy: { updatedAt: 'desc' },
            select: {
              id: true,
              status: true,
              updatedAt: true,
              connection: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                  status: true,
                },
              },
            },
          })

          // 3. Get latest published version and latest draft version
          const [publishedVersion, latestVersion] = await Promise.all([
            database.builderPromptVersion.findFirst({
              where: {
                aiAgentId: agent.id,
                publishedAt: { not: null },
              },
              orderBy: { publishedAt: 'desc' },
              select: { versionNumber: true, publishedAt: true },
            }),
            database.builderPromptVersion.findFirst({
              where: { aiAgentId: agent.id },
              orderBy: { versionNumber: 'desc' },
              select: { versionNumber: true, publishedAt: true },
            }),
          ])

          // 4. Count active conversations (sessions linked to this agent)
          const activeConversations = await database.chatSession.count({
            where: {
              organizationId: ctx.organizationId,
              aiAgentConfigId: agent.id,
              status: { in: ['ACTIVE', 'QUEUED'] },
            },
          })

          // 5. Count messages in the last 24 hours across sessions for this agent
          const twentyFourHoursAgo = new Date(
            Date.now() - 24 * 60 * 60 * 1000,
          )

          const messagesLast24h = await database.message.count({
            where: {
              session: {
                organizationId: ctx.organizationId,
                aiAgentConfigId: agent.id,
              },
              createdAt: { gte: twentyFourHoursAgo },
            },
          })

          // 6. Determine draft version (latest that is not published yet)
          const draftVersion =
            latestVersion && !latestVersion.publishedAt
              ? latestVersion.versionNumber
              : null

          return {
            success: true,
            agent: {
              id: agent.id,
              name: agent.name,
              isActive: agent.isActive,
              provider: agent.provider,
              model: agent.model,
            },
            status: deployment ? 'deployed' : agent.isActive ? 'ready' : 'inactive',
            currentVersion: publishedVersion?.versionNumber ?? null,
            draftVersion,
            connectedInstance: deployment
              ? {
                  name: deployment.connection.name,
                  phoneNumber: deployment.connection.phoneNumber,
                  status: deployment.connection.status.toLowerCase(),
                }
              : null,
            activeConversations,
            messagesLast24h,
            lastDeployedAt: deployment?.updatedAt?.toISOString() ?? null,
          }
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : 'Failed to get agent status'
          return { success: false, message }
        }
      },
    }),
  })
}
