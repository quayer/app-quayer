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
import { buildBuilderTool } from './build-tool'
import {
  resolveProjectAgent,
  OPTIONAL_AGENT_ID_DESCRIPTION,
} from './resolve-project-agent'

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
  return buildBuilderTool({
    name: 'update_agent_prompt',
    metadata: { isReadOnly: false, isConcurrencySafe: false, requiresApproval: true },
    tool: tool({
    description:
      'Updates the system prompt of the agent of the current Builder project. The agent is resolved automatically from the active project — do NOT provide agentId. Creates a NEW version (linear increment) but does NOT publish it — stays as draft until user explicitly publishes.',
    inputSchema: z.object({
      agentId: z
        .string()
        .uuid()
        .optional()
        .describe(OPTIONAL_AGENT_ID_DESCRIPTION),
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
        // 1. Resolve the REAL agent from the active project (LLM-provided ids
        //    are ignored when divergent — they tend to be hallucinated).
        const resolved = await resolveProjectAgent(ctx, input.agentId)
        if (!resolved.ok) {
          return {
            success: false as const,
            message: resolved.message,
          }
        }

        const agent = await database.aIAgentConfig.findFirst({
          where: {
            id: resolved.agentId,
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
          where: { aiAgentId: resolved.agentId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        })
        const nextVersion = (lastVersion?.versionNumber ?? 0) + 1

        // 3. Create the draft version. publishedAt stays null — not published.
        const version = await database.builderPromptVersion.create({
          data: {
            aiAgentId: resolved.agentId,
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
  }),
  })
}
