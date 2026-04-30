/**
 * Builder Tool — attach_tool_to_agent (US-013)
 *
 * Wrapper tool exposed to the Quayer Builder meta-agent. Allows the Builder AI
 * to attach a built-in tool (by key) to an existing AIAgentConfig owned by the
 * current Builder project.
 *
 * Pattern mirrors `create-agent.tool.ts` and `create-instance.tool.ts`:
 *   - Uses Vercel AI SDK `tool()` helper with Zod inputSchema.
 *   - Receives a bound context via factory function.
 *   - Accesses Prisma directly through the shared `database` singleton.
 *   - Returns a success/failure envelope { success, ... }.
 *
 * Design notes:
 *   - The canonical built-in tool registry lives in
 *     `src/server/ai-module/ai-agents/tools/builtin-tools.ts` as
 *     `BUILTIN_TOOL_NAMES`. We import that constant to validate the input
 *     and to drive the Zod enum, so any new built-in tool added to the
 *     registry is automatically accepted here.
 *   - The schema model `AgentTool` (prisma/schema.prisma) is a per-org
 *     *catalog* of CUSTOM/BUILTIN/MCP tool definitions, NOT a pivot between
 *     agents and tools. Per-agent enablement is stored as a string array on
 *     `AIAgentConfig.enabledTools` (see create-agent.tool.ts, which writes to
 *     that field on creation). We therefore persist attachment by appending
 *     the tool key to `AIAgentConfig.enabledTools`.
 *   - The operation is idempotent: attaching an already-enabled tool returns
 *     success without mutating the array.
 *
 * Context shape is redefined inline (same as create-instance.tool.ts) rather
 * than imported from create-agent.tool.ts, to keep each builder tool file
 * self-contained and avoid cross-tool import cycles.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { BUILTIN_TOOL_NAMES } from '@/server/ai-module/ai-agents/tools/builtin-tools'
import { buildBuilderTool } from './build-tool'

// ---------------------------------------------------------------------------
// Context (shared shape with the other builder tools)
// ---------------------------------------------------------------------------

export interface BuilderToolExecutionContext {
  /** BuilderProject.id that owns the conversation */
  projectId: string
  /** Organization.id (tenant boundary) */
  organizationId: string
  /** User.id of the Builder chat author */
  userId: string
}

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

/**
 * Zod enum built dynamically from the canonical builtin tool registry.
 * Cast is required because z.enum wants a non-empty readonly tuple literal.
 */
const toolKeyEnum = z.enum(
  BUILTIN_TOOL_NAMES as unknown as [string, ...string[]],
)

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Creates the `attach_tool_to_agent` tool bound to a Builder chat context.
 *
 * The LLM should call this when the user confirms they want to enable a
 * specific capability (e.g. "transfer to a human", "create lead") on the
 * agent they are building.
 */
export function attachToolToAgentTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'attach_tool_to_agent',
    metadata: { isReadOnly: false, isConcurrencySafe: false },
    tool: tool({
    description:
      'Attaches a built-in tool to an existing AI agent in the current Builder project. Use this to enable capabilities like transfer_to_human, pause_session, search_contacts, create_lead, schedule_callback or get_session_history on an agent the user has already created. Idempotent: re-attaching an already-enabled tool is a no-op success.',
    inputSchema: z.object({
      agentId: z
        .string()
        .uuid()
        .describe('The AIAgentConfig.id of the agent to modify (must belong to the current organization)'),
      toolKey: toolKeyEnum.describe(
        'The built-in tool key to enable. Must be one of the registered builtin tool names.',
      ),
    }),
    execute: async (input) => {
      try {
        // Validate the tool key against the registry. Zod enum already
        // enforces this at parse time, but we double-check for defensive
        // runtime safety (e.g. if the LLM somehow bypasses schema parsing
        // or if the registry changes between parse and execute).
        if (!BUILTIN_TOOL_NAMES.includes(input.toolKey as never)) {
          return {
            success: false,
            message: `Unknown tool key '${input.toolKey}'. Valid keys: ${BUILTIN_TOOL_NAMES.join(', ')}`,
          }
        }

        // Ensure the agent exists AND belongs to the current organization.
        const agent = await database.aIAgentConfig.findFirst({
          where: {
            id: input.agentId,
            organizationId: ctx.organizationId,
          },
          select: { id: true, name: true, enabledTools: true },
        })

        if (!agent) {
          return {
            success: false,
            message: `Agent ${input.agentId} not found in organization ${ctx.organizationId}`,
          }
        }

        // Idempotency: if the tool is already enabled, short-circuit.
        if (agent.enabledTools.includes(input.toolKey)) {
          return {
            success: true,
            attached: true,
            toolKey: input.toolKey,
            message: `Tool '${input.toolKey}' was already enabled on agent '${agent.name}'.`,
          }
        }

        // Append the new tool key to the enabledTools array.
        await database.aIAgentConfig.update({
          where: { id: agent.id },
          data: {
            enabledTools: { set: [...agent.enabledTools, input.toolKey] },
          },
        })

        return {
          success: true,
          attached: true,
          toolKey: input.toolKey,
          message: `Tool '${input.toolKey}' attached to agent '${agent.name}'.`,
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to attach tool to agent'
        return {
          success: false,
          message,
        }
      }
    },
  }),
  })
}
