/**
 * Builder Tool — run_playground_test (US-008)
 *
 * Read-only but NOT concurrent-safe (uses LLM calls). Runs scenario-based
 * tests against an agent's system prompt using the Vercel AI SDK.
 *
 * QH-08: Agent response step now uses `runFaithfulPreview` (the real runtime's
 * playground path — same tools, BYOK, model routing) instead of bare
 * `generateText`. The judge LLM step is unchanged.
 *
 * For each scenario:
 *   1. Calls `runFaithfulPreview()` with the scenario user message.
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
import { runFaithfulPreview } from '@/server/ai-module/builder/services/faithful-preview.service'
import { autoFlipTestDrive } from '@/server/ai-module/builder/state/auto-flip-test-drive'
import {
  resolveProjectAgent,
  OPTIONAL_AGENT_ID_DESCRIPTION,
} from './resolve-project-agent'

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
        'Runs scenario-based tests against the system prompt of the agent of the current Builder project. The agent is resolved automatically from the active project — do NOT provide agentId. For each scenario, sends a test message through the agent and uses a judge LLM to evaluate whether the response matches the expected behavior. Returns per-scenario pass/fail results, an overall score (0-100), improvement suggestions, and usage metrics.',
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
          // 1. Resolve the REAL agent from the active project (LLM-provided
          //    ids are ignored when divergent — they tend to be hallucinated).
          const resolved = await resolveProjectAgent(ctx, input.agentId)
          if (!resolved.ok) {
            return { success: false, message: resolved.message }
          }

          // Load agent config (scoped to org) — only for existence check
          const agent = await database.aIAgentConfig.findFirst({
            where: {
              id: resolved.agentId,
              organizationId: ctx.organizationId,
            },
            select: { id: true },
          })

          if (!agent) {
            return {
              success: false,
              message: `Agent ${resolved.agentId} not found in this organization.`,
            }
          }

          const judgeModel = await getJudgeModel()

          // 2. Run each scenario
          let totalTokens = 0
          const results: ScenarioResult[] = []

          for (const scenario of input.scenarios) {
            // 2a. QH-08: Generate agent response via the real runtime playground path
            //     (same tools, BYOK, model routing, cooldown fallback — no side-effects)
            const previewResult = await runFaithfulPreview({
              projectId: ctx.projectId,
              organizationId: ctx.organizationId,
              messages: [{ role: 'user', content: scenario.userMessage }],
            })

            const agentResponse = previewResult.reply
            totalTokens += previewResult.usage.totalTokens

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

          // 2c. Jornada v2 (T33): rodar os cenários é um teste do agente — satisfaz
          //     o passo Testar pelo MESMO helper do playground stateless (proibido
          //     duplicar a lógica de flip). Usa o projectId do contexto da tool.
          //     Idempotente e fail-open: se `runFaithfulPreview` já flipou via
          //     `processPlaygroundStream` nesta mesma execução, vê `testDrive: true`
          //     e é no-op — nunca re-grava nem re-emite o evento; erro de DB jamais
          //     quebra a tool.
          await autoFlipTestDrive({
            projectId: ctx.projectId,
            organizationId: ctx.organizationId,
          })

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
