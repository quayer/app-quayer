/**
 * Builder Tool — create_agent
 *
 * Wrapper tool exposed to the Quayer Builder meta-agent. Allows the Builder AI
 * to create a real AIAgentConfig for the current BuilderProject once the user
 * has approved the generated system prompt.
 *
 * Pattern mirrors `src/server/ai-module/ai-agents/tools/builtin-tools.ts`:
 *   - Uses Vercel AI SDK `tool()` helper with Zod inputSchema.
 *   - Receives a bound context via factory function.
 *   - Accesses Prisma directly through the shared `database` singleton
 *     (no HTTP self-calls).
 *
 * Side effects (all inside a single Prisma transaction):
 *   1. Creates `AIAgentConfig` scoped to the organization.
 *   2. Creates the first `BuilderPromptVersion` (versionNumber = 1, createdBy = chat).
 *   3. Links the agent to the owning `BuilderProject` via `aiAgentId`.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import { BUILDER_RESERVED_NAME } from '../builder.constants'

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * Runtime context injected into the Builder tool execution.
 * Bound once per Builder chat turn.
 */
export interface BuilderToolExecutionContext {
  /** BuilderProject.id that owns the conversation — agent will be linked here */
  projectId: string
  /** Organization.id (tenant boundary) */
  organizationId: string
  /** User.id of the Builder chat author — used as publishedBy/createdBy hint */
  userId: string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the `create_agent` tool bound to a Builder chat context.
 *
 * The LLM should only call this AFTER the user has explicitly approved the
 * generated system prompt in chat.
 */
export function createAgentTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'create_agent',
    metadata: { isReadOnly: false, isConcurrencySafe: false, requiresApproval: true },
    tool: tool({
    description:
      'Creates a new AI agent for WhatsApp in the current Builder project. Call this ONLY AFTER showing the generated system prompt to the user and receiving explicit approval. Links the new AIAgentConfig to the current BuilderProject and creates version 1 of the prompt.',
    inputSchema: z.object({
      name: z
        .string()
        .min(2)
        .max(100)
        .describe('The agent name (shown to the user, unique per organization)'),
      systemPrompt: z
        .string()
        .min(50)
        .max(50000)
        .describe('The full system prompt for the agent (user-approved)'),
      provider: z
        .enum(['anthropic', 'openai', 'openrouter'])
        .default('anthropic')
        .describe('LLM provider'),
      model: z
        .string()
        .min(1)
        .describe(
          'Model name (e.g., claude-sonnet-4-20250514, gpt-4o, llama-3.1-70b-versatile)',
        ),
      temperature: z.number().min(0).max(2).default(0.7),
      enabledTools: z
        .array(z.string())
        .default([])
        .describe(
          'Builtin tool keys to enable (e.g., transfer_to_human, pause_session, get_session_history, search_contacts, create_lead, schedule_callback)',
        ),
    }),
    execute: async (input) => {
      try {
        if (input.name === BUILDER_RESERVED_NAME) {
          return {
            success: false,
            message: 'This agent name is reserved',
          }
        }

        // Sanity check: ensure the BuilderProject exists in the same org and
        // does not yet have an agent bound to it (1:1 relation).
        const project = await database.builderProject.findFirst({
          where: {
            id: ctx.projectId,
            organizationId: ctx.organizationId,
          },
          select: { id: true, aiAgentId: true },
        })

        if (!project) {
          return {
            success: false,
            message: `BuilderProject ${ctx.projectId} not found in organization ${ctx.organizationId}`,
          }
        }

        if (project.aiAgentId) {
          return {
            success: false,
            message: `This project already has an AI agent (${project.aiAgentId}). Use edit_agent to modify it instead.`,
          }
        }

        // Transactional create: agent + version + project link
        const result = await database.$transaction(async (tx) => {
          const agent = await tx.aIAgentConfig.create({
            data: {
              organizationId: ctx.organizationId,
              name: input.name,
              provider: input.provider,
              model: input.model,
              temperature: input.temperature,
              systemPrompt: input.systemPrompt,
              enabledTools: input.enabledTools,
              isActive: true,
            },
            select: { id: true, name: true },
          })

          const version = await tx.builderPromptVersion.create({
            data: {
              aiAgentId: agent.id,
              versionNumber: 1,
              content: input.systemPrompt,
              description: 'Initial version (created by Builder AI)',
              createdBy: 'chat',
            },
            select: { id: true, versionNumber: true },
          })

          await tx.builderProject.update({
            where: { id: ctx.projectId },
            data: { aiAgentId: agent.id },
          })

          return { agent, version }
        })

        return {
          success: true,
          agentId: result.agent.id,
          versionNumber: result.version.versionNumber,
          message: `Agent '${result.agent.name}' created successfully.`,
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create agent'
        return {
          success: false,
          message,
        }
      }
    },
  }),
  })
}
