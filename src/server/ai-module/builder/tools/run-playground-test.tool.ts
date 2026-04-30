/**
 * Builder Tool — run_playground_test (US-008)
 *
 * Read-only but NOT concurrent-safe (uses LLM calls). Runs scenario-based
 * tests against an agent's system prompt using the Vercel AI SDK.
 *
 * For each scenario:
 *   1. Calls `generateText()` with the agent's system prompt + user message.
 *   2. Calls a secondary LLM to judge if the response matches expected behavior.
 *
 * Returns per-scenario results with pass/fail, an overall score, suggestions,
 * and usage metrics.
 */

import { tool } from 'ai'
import { generateText } from 'ai'
import { z } from 'zod'
import { database } from '@/server/services/database'
import { buildBuilderTool } from './build-tool'
import type { BuilderToolExecutionContext } from './create-agent.tool'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Dynamically resolve a Vercel AI SDK provider/model from the agent's config.
 * Falls back to a lightweight model for cost efficiency in playground tests.
 */
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
      // OpenRouter uses OpenAI-compatible API
      const { createOpenAI } = await import('@ai-sdk/openai')
      const openrouter = createOpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
      })
      return openrouter(model)
    }
    default: {
      // Fallback to openai for unknown providers
      const { openai } = await import('@ai-sdk/openai')
      return openai('gpt-4o-mini')
    }
  }
}

/**
 * Get a lightweight judge model for evaluation.
 */
async function getJudgeModel() {
  const { openai } = await import('@ai-sdk/openai')
  return openai('gpt-4o-mini')
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScenarioResult {
  message: string
  agentResponse: string
  passed: boolean
  reason: string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function runPlaygroundTestTool(ctx: BuilderToolExecutionContext) {
  return buildBuilderTool({
    name: 'run_playground_test',
    metadata: { isReadOnly: true, isConcurrencySafe: false },
    tool: tool({
      description:
        'Runs scenario-based tests against an AI agent\'s system prompt. For each scenario, sends a test message through the agent and uses a judge LLM to evaluate whether the response matches the expected behavior. Returns per-scenario pass/fail results, an overall score (0-100), improvement suggestions, and usage metrics.',
      inputSchema: z.object({
        agentId: z.string().uuid().describe('The AIAgentConfig.id to test'),
        scenarios: z
          .array(
            z.object({
              userMessage: z
                .string()
                .min(1)
                .describe('The simulated user message to send to the agent'),
              expectedBehavior: z
                .string()
                .min(1)
                .describe(
                  'Description of the expected agent behavior/response',
                ),
            }),
          )
          .min(1)
          .max(10)
          .describe('Test scenarios (max 10 per run)'),
      }),
      execute: async (input) => {
        const startTime = Date.now()

        try {
          // 1. Load agent config (scoped to org)
          const agent = await database.aIAgentConfig.findFirst({
            where: {
              id: input.agentId,
              organizationId: ctx.organizationId,
            },
            select: {
              id: true,
              systemPrompt: true,
              provider: true,
              model: true,
              temperature: true,
            },
          })

          if (!agent) {
            return {
              success: false,
              message: `Agent ${input.agentId} not found in this organization.`,
            }
          }

          if (!agent.systemPrompt) {
            return {
              success: false,
              message:
                'Agent has no system prompt configured. Create or update the prompt first.',
            }
          }

          const agentModel = await resolveModel(agent.provider, agent.model)
          const judgeModel = await getJudgeModel()

          // 2. Run each scenario
          let totalTokens = 0
          const results: ScenarioResult[] = []

          for (const scenario of input.scenarios) {
            // 2a. Generate agent response
            const agentResult = await generateText({
              model: agentModel,
              system: agent.systemPrompt,
              prompt: scenario.userMessage,
              temperature: agent.temperature,
              maxOutputTokens: 1024,
            })

            const agentResponse = agentResult.text
            totalTokens +=
              (agentResult.usage?.inputTokens ?? 0) +
              (agentResult.usage?.outputTokens ?? 0)

            // 2b. Judge the response
            const judgePrompt = `You are a strict QA evaluator. Analyze whether an AI agent's response meets the expected behavior.

EXPECTED BEHAVIOR:
${scenario.expectedBehavior}

USER MESSAGE:
${scenario.userMessage}

AGENT RESPONSE:
${agentResponse}

Respond with EXACTLY this JSON format (no markdown, no extra text):
{"passed": true/false, "reason": "brief explanation of why it passed or failed"}`

            const judgeResult = await generateText({
              model: judgeModel,
              prompt: judgePrompt,
              temperature: 0,
              maxOutputTokens: 256,
            })

            totalTokens +=
              (judgeResult.usage?.inputTokens ?? 0) +
              (judgeResult.usage?.outputTokens ?? 0)

            // Parse judge response
            let passed = false
            let reason = 'Could not parse judge evaluation'

            try {
              const parsed = JSON.parse(judgeResult.text.trim())
              passed = Boolean(parsed.passed)
              reason = String(parsed.reason || 'No reason provided')
            } catch {
              // If JSON parsing fails, try to infer from text
              const text = judgeResult.text.toLowerCase()
              passed = text.includes('"passed": true') || text.includes('"passed":true')
              reason = judgeResult.text.trim().slice(0, 200)
            }

            results.push({
              message: scenario.userMessage,
              agentResponse,
              passed,
              reason,
            })
          }

          // 3. Calculate overall score
          const passedCount = results.filter((r) => r.passed).length
          const overallScore = Math.round(
            (passedCount / results.length) * 100,
          )

          // 4. Generate suggestions based on failures
          const suggestions: string[] = []
          const failedResults = results.filter((r) => !r.passed)

          if (failedResults.length > 0) {
            suggestions.push(
              `${failedResults.length} of ${results.length} scenarios failed. Review the system prompt for gaps in: ${failedResults.map((r) => r.reason).join('; ')}`,
            )
          }

          if (overallScore === 100) {
            suggestions.push(
              'All scenarios passed. Consider adding edge cases to increase test coverage.',
            )
          }

          const latencyMs = Date.now() - startTime

          return {
            success: true,
            results,
            overallScore,
            suggestions,
            tokensUsed: totalTokens,
            latencyMs,
          }
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : 'Failed to run playground test'
          return {
            success: false,
            message,
            latencyMs: Date.now() - startTime,
          }
        }
      },
    }),
  })
}
