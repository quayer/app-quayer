/**
 * Agent Runtime — metrics persistence
 *
 * Atualização fire-and-forget das métricas de agente e prompt version,
 * compartilhada pelos runtimes sync e streaming. Extraído de
 * `agent-runtime.service.ts` no split estrutural — comportamento idêntico.
 */

import { database } from '@/server/services/database'
import type { PreparedAgentCall } from './runtime.types'

/**
 * Fire-and-forget metrics update shared by both sync and streaming runtimes.
 * Logs errors but never throws — metrics updates are non-critical.
 */
export function updateRuntimeMetrics(
  agentConfig: NonNullable<PreparedAgentCall['agentConfig']>,
  promptVersion: PreparedAgentCall['promptVersion'],
  inputTokens: number,
  outputTokens: number,
  cost: { totalCost: number },
  latencyMs: number,
  toolCalls: Array<{ toolName: string }>
) {
  const updateAgentMetrics = database.aIAgentConfig.update({
    where: { id: agentConfig.id },
    data: {
      totalInputTokens: { increment: inputTokens },
      totalOutputTokens: { increment: outputTokens },
      totalCost: { increment: cost.totalCost },
      totalCalls: { increment: 1 },
    },
  })

  const updatePromptMetrics = promptVersion
    ? database.agentPromptVersion.update({
        where: { id: promptVersion.id },
        data: {
          totalMessages: { increment: 1 },
          totalCost: { increment: cost.totalCost },
          avgResponseTime: {
            set:
              promptVersion.totalMessages > 0
                ? (promptVersion.avgResponseTime *
                    promptVersion.totalMessages +
                    latencyMs) /
                  (promptVersion.totalMessages + 1)
                : latencyMs,
          },
          totalTransfers: {
            increment: toolCalls.some(
              (tc) => tc.toolName === 'transfer_to_human'
            )
              ? 1
              : 0,
          },
        },
      })
    : Promise.resolve()

  Promise.all([updateAgentMetrics, updatePromptMetrics]).catch((err) => {
    console.error('[AgentRuntime] Failed to update metrics:', err.message)
  })
}
