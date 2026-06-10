/**
 * Agent Runtime — tool loop helpers
 *
 * Truncamento de resultados de tools (cap de payload no contexto) e
 * StopCondition de token-budget (RT-10) usada junto do `stepCountIs` no loop
 * de tools do AI SDK. Extraído de `agent-runtime.service.ts` no split
 * estrutural — comportamento idêntico.
 */

import type { ToolSet, StopCondition } from 'ai'
import { truncateToolResult } from '../services/tool-registry.service'
import {
  createBudgetTracker,
  checkTokenBudget,
} from '../services/token-budget.service'

// ── Tool Result Truncation Wrapper ──────────────────────────────────────────
// Cap noisy tool outputs (search_contacts with 200 results, get_session_history,
// big MCP payloads, etc.) before they enter the LLM context. Each tool's
// `execute` is wrapped so that the serialized result is truncated to
// `maxResultSizeChars`. Tools without an `execute` function pass through.


export function wrapToolWithTruncation(tool: any, maxResultSizeChars = 5000): any {
  if (!tool || typeof tool.execute !== 'function') return tool
  const originalExecute = tool.execute.bind(tool)
  return {
    ...tool,

    execute: async (...args: any[]) => {
      const result = await originalExecute(...args)
      const { content, truncated } = truncateToolResult(result, maxResultSizeChars)
      if (truncated) {
        console.warn('[AgentRuntime] tool result truncated:', {
          tool: tool?.name,
        })
        return content
      }
      return result
    },
  }
}

// ── RT-10: Token budget as a StopCondition ──────────────────────────────────
//
// `token-budget.service` decide continue|stop a partir do total de tokens
// consumidos no turno (com detecção de diminishing returns). Aqui ele vira uma
// `StopCondition` do AI SDK: a cada step, somamos `usage.totalTokens` de todos
// os steps e perguntamos ao tracker se vale a pena continuar o loop de tools.
//
// Aplicamos um PISO ao budget: Math.max(maxTokens * 4, 8000). `maxTokens` é o
// teto de OUTPUT por chamada — multiplicar por 4 (e nunca abaixo de 8k) dá
// folga para input + várias rodadas de tools, evitando cortar o loop cedo
// demais. Mantido SEMPRE junto do `stepCountIs` existente (nunca o substitui).

const BUDGET_TOKEN_FLOOR = 8000

export function budgetTokensFor(maxTokens: number | null | undefined): number {
  return Math.max((maxTokens ?? 0) * 4, BUDGET_TOKEN_FLOOR)
}

/**
 * Cria uma StopCondition baseada no token-budget. Fecha sobre um tracker por
 * chamada — cada turno (generateText/streamText) recebe a sua própria via
 * `createBudgetStopCondition(...)`, então o estado não vaza entre turnos.
 */
export function createBudgetStopCondition(budgetTokens: number): StopCondition<ToolSet> {
  const tracker = createBudgetTracker()
  return ({ steps }) => {
    const turnTokens = steps.reduce(
      (sum, step) => sum + (step.usage?.totalTokens ?? 0),
      0,
    )
    return checkTokenBudget(tracker, turnTokens, budgetTokens).action === 'stop'
  }
}
