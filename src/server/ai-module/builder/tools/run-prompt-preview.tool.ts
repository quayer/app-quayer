/**
 * run_prompt_preview — Builder tool (Wave 1.4)
 *
 * Generates 2-3 example conversation turns so the user can SEE how the
 * agent will respond BEFORE publishing. No judge LLM, no pass/fail —
 * this is pure "show me what it sounds like".
 *
 * Pattern mirrors run-playground-test.tool.ts for the model resolution
 * and agent loading, but the execution is simpler (one-shot generate per
 * scenario, no JSON parsing, no scoring).
 */

import { tool } from 'ai'
import { generateText } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'

// ---------------------------------------------------------------------------
// Helpers (duplicate of run-playground-test.tool.ts — kept local to avoid
// a shared-module churn; extract when we add the 3rd consumer)
// ---------------------------------------------------------------------------

async function resolveModel(provider: string, model: string) {
  switch (provider) {
    case 'openai': {
      const { openai } = await import('@ai-sdk/openai')
      return openai(model)
    }
    case 'anthropic': {
      const { anthropic } = await import('@ai-sdk/anthropic')
      return anthropic(model)
    }
    case 'openrouter': {
      const { createOpenAI } = await import('@ai-sdk/openai')
      const openrouter = createOpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
      })
      return openrouter(model)
    }
    default: {
      const { openai } = await import('@ai-sdk/openai')
      return openai('gpt-4o-mini')
    }
  }
}

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
          const agent = await database.aIAgentConfig.findFirst({
            where: {
              id: input.agentId,
              organizationId: ctx.organizationId,
            },
            select: {
              id: true,
              name: true,
              systemPrompt: true,
              provider: true,
              model: true,
              temperature: true,
            },
          })

          if (!agent) {
            return {
              success: false as const,
              message: `Agent ${input.agentId} not found in this organization.`,
            }
          }
          if (!agent.systemPrompt) {
            return {
              success: false as const,
              message:
                'Agent has no system prompt configured. Create or update the prompt first.',
            }
          }

          const agentModel = await resolveModel(agent.provider, agent.model)

          const examples: Array<{
            label?: string
            userMessage: string
            agentResponse: string
          }> = []

          let totalTokens = 0
          for (const scenario of input.scenarios) {
            const result = await generateText({
              model: agentModel,
              system: agent.systemPrompt,
              prompt: scenario.userMessage,
              temperature: agent.temperature,
              maxOutputTokens: 512,
            })
            totalTokens +=
              (result.usage?.inputTokens ?? 0) +
              (result.usage?.outputTokens ?? 0)
            examples.push({
              label: scenario.label,
              userMessage: scenario.userMessage,
              agentResponse: result.text,
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
