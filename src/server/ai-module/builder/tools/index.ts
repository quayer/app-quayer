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
export { buildBuilderTool } from './build-tool'
export type { BuilderToolMetadata, BuilderToolDef, BuilderTool } from './build-tool'
import { updateAgentPromptTool } from './update-agent-prompt.tool'
import { listInstancesTool } from './list-instances.tool'
import { createInstanceTool } from './create-instance.tool'
import { attachToolToAgentTool } from './attach-tool.tool'
import { searchWebTool } from './search-web.tool'
import { researchNicheTool } from './research-niche.tool'
import { generatePromptAnatomyTool } from './generate-prompt-anatomy.tool'
import { publishAgentTool } from './publish-agent.tool'
import { getAgentStatusTool } from './get-agent-status.tool'
import { runPlaygroundTestTool } from './run-playground-test.tool'
import { createCustomToolTool } from './create-custom-tool.tool'
import { selectChannelTool } from './select-channel.tool'
import { proposeAgentCreationTool } from './propose-agent-creation.tool'
import { runPromptPreviewTool } from './run-prompt-preview.tool'
import { adjustPromptToneTool } from './adjust-prompt-tone.tool'
import { proposeToolSelectionTool } from './propose-tool-selection.tool'
import { proposePlanUpgradeTool } from './propose-plan-upgrade.tool'

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
    research_niche: researchNicheTool(ctx),
    generate_prompt_anatomy: generatePromptAnatomyTool(ctx),
    publish_agent: publishAgentTool(ctx),
    get_agent_status: getAgentStatusTool(ctx),
    run_playground_test: runPlaygroundTestTool(ctx),
    create_custom_tool: createCustomToolTool(ctx),
    select_channel: selectChannelTool(ctx),
    propose_agent_creation: proposeAgentCreationTool(ctx),
    run_prompt_preview: runPromptPreviewTool(ctx),
    adjust_prompt_tone: adjustPromptToneTool(ctx),
    propose_tool_selection: proposeToolSelectionTool(ctx),
    propose_plan_upgrade: proposePlanUpgradeTool(ctx),
  }
}
