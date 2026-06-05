/**
 * run_prompt_preview — Builder tool (Wave 1.4)
 *
 * Generates 2-3 example conversation turns so the user can SEE how the
 * agent will respond BEFORE publishing. No judge LLM, no pass/fail —
 * this is pure "show me what it sounds like".
 *
 * QH-08: Each scenario now goes through `runFaithfulPreview` (the real
 * runtime's playground path — same tools, BYOK, cooldown fallback) instead of
 * a bare `generateText`. This ensures the preview is faithful to production.
 *
 * Fallback: if the agent has no linked BuilderProject yet (agentId → projectId
 * lookup fails), we still return an error with a clear message rather than
 * silently falling back to simulated output.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import { runFaithfulPreview } from '@/server/ai-module/builder/services/faithful-preview.service'

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function runPromptPreviewTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'run_prompt_preview',
    metadata: { isReadOnly: true, isConcurrencySafe: false },
    tool: tool({
      description:
        'Renders 2-3 example conversation turns using the agent\'s current system prompt, so the user can preview the tone and answers before publishing. Unlike run_playground_test, this does NOT judge the response — it simply shows what the agent would say. Prefer 2-3 scenarios that reflect the most common questions in the agent\'s niche (e.g. pricing, scheduling, objections).',
      inputSchema: z.object({
        agentId: z
          .string()
          .uuid()
          .describe('The AIAgentConfig.id whose prompt to preview'),
        scenarios: z
          .array(
            z.object({
              userMessage: z
                .string()
                .min(1)
                .describe('Simulated user message (customer side).'),
              label: z
                .string()
                .max(40)
                .optional()
                .describe(
                  'Optional short label for the scenario (e.g. "Preço", "Agendamento"). Shown above the example.',
                ),
            }),
          )
          .min(1)
          .max(3)
          .describe('Example scenarios (max 3 per preview)'),
      }),
      execute: async (input) => {
        const startTime = Date.now()
        try {
          // QH-08: load agent for name + org-scope check
          const agent = await database.aIAgentConfig.findFirst({
            where: {
              id: input.agentId,
              organizationId: ctx.organizationId,
            },
            select: { id: true, name: true },
          })

          if (!agent) {
            return {
              success: false as const,
              message: `Agent ${input.agentId} not found in this organization.`,
            }
          }

          // QH-08: resolve projectId from agentId (1:1 relation)
          const project = await database.builderProject.findFirst({
            where: {
              aiAgentId: input.agentId,
              organizationId: ctx.organizationId,
            },
            select: { id: true },
          })

          if (!project) {
            return {
              success: false as const,
              message:
                'Agent has no linked Builder project yet. Publish the agent first so the faithful preview can use the real runtime.',
            }
          }

          const examples: Array<{
            label?: string
            userMessage: string
            agentResponse: string
          }> = []

          let totalTokens = 0
          let totalLatencyMs = 0

          // QH-08: use the real runtime path (same tools, BYOK, model routing)
          for (const scenario of input.scenarios) {
            const result = await runFaithfulPreview({
              projectId: project.id,
              organizationId: ctx.organizationId,
              messages: [{ role: 'user', content: scenario.userMessage }],
            })
            totalTokens += result.usage.totalTokens
            totalLatencyMs += result.latencyMs
            examples.push({
              label: scenario.label,
              userMessage: scenario.userMessage,
              agentResponse: result.reply,
            })
          }

          return {
            success: true as const,
            agentId: agent.id,
            agentName: agent.name,
            examples,
            tokensUsed: totalTokens,
            latencyMs: Date.now() - startTime,
          }
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : 'Failed to run prompt preview'
          return {
            success: false as const,
            message,
            latencyMs: Date.now() - startTime,
          }
        }
      },
    }),
  })
}
