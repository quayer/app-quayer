/**
 * Quayer Builder — Tool Registry Barrel
 *
 * Wires the 7 Builder tool factories into a single `buildBuilderToolset`
 * helper consumed by the agent runtime (`agent-runtime.service.ts`) when the
 * active agent is the reserved Builder meta-agent (`BUILDER_RESERVED_NAME`).
 *
 * Each factory receives a `BuilderToolExecutionContext` bound once per chat
 * turn: { projectId, organizationId, userId }.
 *
 * Story: Wave 4 wiring — Quayer Builder PRD.
 */

import { createAgentTool, type BuilderToolExecutionContext } from './create-agent.tool'
import { updateAgentPromptTool } from './update-agent-prompt.tool'
import { listInstancesTool } from './list-instances.tool'
import { createInstanceTool } from './create-instance.tool'
import { attachToolToAgentTool } from './attach-tool.tool'
import { searchWebTool } from './search-web.tool'
import { generatePromptAnatomyTool } from './generate-prompt-anatomy.tool'

export type { BuilderToolExecutionContext }

/**
 * Instantiates the full Builder toolset with a bound execution context.
 *
 * Tool name conventions are snake_case to match the rest of the agent
 * runtime (see `src/server/ai-module/ai-agents/tools/builtin-tools.ts`).
 */
export function buildBuilderToolset(ctx: BuilderToolExecutionContext) {
  return {
    create_agent: createAgentTool(ctx),
    update_agent_prompt: updateAgentPromptTool(ctx),
    list_whatsapp_instances: listInstancesTool(ctx),
    create_whatsapp_instance: createInstanceTool(ctx),
    attach_tool_to_agent: attachToolToAgentTool(ctx),
    search_web: searchWebTool(ctx),
    generate_prompt_anatomy: generatePromptAnatomyTool(ctx),
  }
}
