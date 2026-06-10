/**
 * Agent Runtime — cost table + token estimation
 *
 * Tabela de custo por modelo, cálculo de custo do turno e estimativa grosseira
 * de tokens (US-036). Extraído de `agent-runtime.service.ts` no split
 * estrutural — comportamento idêntico.
 */

// ── Cost Table ───────────────────────────────────────────────────────────────
// Approximate cost per 1M tokens (March 2026 pricing)

const COST_TABLE: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4-turbo': { input: 10.0, output: 30.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-haiku-3-5-20241022': { input: 0.8, output: 4.0 },
  'llama-3.1-70b-versatile': { input: 0.59, output: 0.79 },
}

const FALLBACK_RATES = { input: 5.0, output: 15.0 }

// ── US-036: Token Estimation ────────────────────────────────────────────────

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function calculateCost(model: string, inputTokens: number, outputTokens: number) {
  const rates = COST_TABLE[model] || FALLBACK_RATES
  const inputCost = (inputTokens / 1_000_000) * rates.input
  const outputCost = (outputTokens / 1_000_000) * rates.output
  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
  }
}
