/**
 * update_agent_prompt — Builder tool wrapper (Story US-010)
 *
 * Creates a NEW BuilderPromptVersion for an existing agent with a linear
 * version number (max + 1). Does NOT publish the version — publishedAt stays
 * null and it remains a draft until the user explicitly publishes via another
 * action.
 *
 * Pattern mirrors src/server/ai-module/ai-agents/tools/builtin-tools.ts:
 *   - Vercel AI SDK v6 tool() helper
 *   - Zod inputSchema
 *   - Prisma client imported from '@/server/services/database'
 *   - Tenant boundary enforced via ctx.organizationId
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * Runtime context for builder tools. Bound once per builder chat turn.
 *
 * NOTE: this type is declared locally to keep the story atomic. It should
 * match the BuilderToolContext exported by create-agent.tool.ts (US-009).
 * When both stories land, consolidate into a shared types module.
 */
export type BuilderToolContext = {
  projectId: string
  organizationId: string
  userId: string
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function updateAgentPromptTool(ctx: BuilderToolContext) {
  return tool({
    description:
      'Updates the system prompt of an existing agent. Creates a NEW version (linear increment) but does NOT publish it — stays as draft until user explicitly publishes.',
    inputSchema: z.object({
      agentId: z
        .string()
        .uuid()
        .describe('The ai_agent_configs.id to update'),
      newPrompt: z
        .string()
        .min(50)
        .max(50000)
        .describe('The new system prompt content'),
      description: z
        .string()
        .max(500)
        .optional()
        .describe(
          'Human-readable description of what changed (e.g., "Tom mais formal", "Adiciona limite de horário")',
        ),
    }),
    execute: async (input) => {
      try {
        // 1. Validate the agent belongs to the caller's org (tenant boundary).
        const agent = await database.aIAgentConfig.findFirst({
          where: {
            id: input.agentId,
            organizationId: ctx.organizationId,
          },
          select: { id: true },
        })

        if (!agent) {
          return {
            success: false as const,
            message: 'Agent not found or not in your org',
          }
        }

        // 2. Compute the next linear version number (max + 1).
        const lastVersion = await database.builderPromptVersion.findFirst({
          where: { aiAgentId: input.agentId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        })
        const nextVersion = (lastVersion?.versionNumber ?? 0) + 1

        // 3. Create the draft version. publishedAt stays null — not published.
        const version = await database.builderPromptVersion.create({
          data: {
            aiAgentId: input.agentId,
            versionNumber: nextVersion,
            content: input.newPrompt,
            description: input.description ?? null,
            createdBy: 'chat',
          },
          select: { id: true },
        })

        return {
          success: true as const,
          versionNumber: nextVersion,
          versionId: version.id,
          description: input.description ?? null,
          message: `New draft version v${nextVersion} created. Not yet published.`,
        }
      } catch (err) {
        return {
          success: false as const,
          message:
            err instanceof Error ? err.message : 'Failed to create version',
        }
      }
    },
  })
}
