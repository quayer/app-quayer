import { tool } from 'ai'
import { z } from 'zod'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import { runProjectRefinement } from '../refinement/run-project-refinement'

const runAgentRefinementInputSchema = z.object({})

export function runAgentRefinementTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'run_agent_refinement',
    metadata: { isReadOnly: false, isConcurrencySafe: false },
    tool: tool({
      description:
        'Runs the Builder Refining Loop before publishing: generates deterministic scenarios from the approved ConversationBlueprint, executes preview conversations, runs route/question/safety auditors, and stores the aggregate refinement result in builderState. Use after the agent and prompt exist and before publish_agent.',
      inputSchema: runAgentRefinementInputSchema,
      execute: async () =>
        runProjectRefinement({
          projectId: ctx.projectId,
          organizationId: ctx.organizationId,
        }),
    }),
  })
}
