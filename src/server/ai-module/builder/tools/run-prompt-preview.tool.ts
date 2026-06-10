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
 * The agent is resolved from the active project (`builder_projects.aiAgentId`
 * via ctx) — the LLM-provided agentId is optional and ignored when divergent
 * (anti-hallucination, see resolve-project-agent.ts). If the project has no
 * agent yet we return a clear error rather than simulated output.
 */

import { tool } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'
import { runFaithfulPreview } from '@/server/ai-module/builder/services/faithful-preview.service'
import {
  resolveProjectAgent,
  OPTIONAL_AGENT_ID_DESCRIPTION,
} from './resolve-project-agent'

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function runPromptPreviewTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'run_prompt_preview',
    metadata: { isReadOnly: true, isConcurrencySafe: false },
    tool: tool({
      description:
        'Renders 2-3 example conversation turns using the agent\'s current system prompt, so the user can preview the tone and answers before publishing. The agent is resolved automatically from the active project — do NOT provide agentId. Unlike run_playground_test, this does NOT judge the response — it simply shows what the agent would say. Prefer 2-3 scenarios that reflect the most common questions in the agent\'s niche (e.g. pricing, scheduling, objections).',
      inputSchema: z.object({
        agentId: z
          .string()
          .uuid()
          .optional()
          .describe(OPTIONAL_AGENT_ID_DESCRIPTION),
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
          // Resolve the REAL agent from the active project (LLM-provided ids
          // are ignored when divergent — they tend to be hallucinated).
          const resolved = await resolveProjectAgent(ctx, input.agentId)
          if (!resolved.ok) {
            return { success: false as const, message: resolved.message }
          }

          // QH-08: load agent for name + org-scope check
          const agent = await database.aIAgentConfig.findFirst({
            where: {
              id: resolved.agentId,
              organizationId: ctx.organizationId,
            },
            select: { id: true, name: true },
          })

          if (!agent) {
            return {
              success: false as const,
              message: `Agent ${resolved.agentId} not found in this organization.`,
            }
          }

          const examples: Array<{
            label?: string
            userMessage: string
            agentResponse: string
          }> = []

          let totalTokens = 0

          // QH-08: use the real runtime path (same tools, BYOK, model routing)
          for (const scenario of input.scenarios) {
            const result = await runFaithfulPreview({
              projectId: ctx.projectId,
              organizationId: ctx.organizationId,
              messages: [{ role: 'user', content: scenario.userMessage }],
            })
            totalTokens += result.usage.totalTokens
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
