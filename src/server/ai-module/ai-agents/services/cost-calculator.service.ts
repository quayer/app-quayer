// ============================================================================
// cost-calculator.service.ts
// US-038 — Token cost calculator for AI agent usage tracking
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  model: string
}

export interface CostBreakdown {
  inputCost: number   // USD
  outputCost: number  // USD
  totalCostUSD: number
  totalCostBRL: number
}

// ---------------------------------------------------------------------------
// Pricing Table — price per 1M tokens (input / output)
// ---------------------------------------------------------------------------

export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-3-5-20241022': { input: 0.80, output: 4.00 },
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
}

const FALLBACK_MODEL = 'gpt-4o-mini'

/** USD to BRL exchange rate — configurable constant */
export const BRL_EXCHANGE_RATE = 5.5

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up pricing for a model. Tries exact match first, then prefix match
 * for versioned models (e.g. "gpt-4o-2024-08-06" matches "gpt-4o").
 * Returns fallback pricing if no match found.
 */
function getModelPricing(model: string): { input: number; output: number } {
  // Exact match
  if (MODEL_PRICING[model]) {
    return MODEL_PRICING[model]
  }

  // Prefix match — find the longest matching key
  let bestMatch: string | null = null
  let bestLen = 0

  for (const key of Object.keys(MODEL_PRICING)) {
    if (model.startsWith(key) && key.length > bestLen) {
      bestMatch = key
      bestLen = key.length
    }
  }

  if (bestMatch) {
    return MODEL_PRICING[bestMatch]
  }

  // Fallback
  return MODEL_PRICING[FALLBACK_MODEL]
}

// ---------------------------------------------------------------------------
// Main Functions
// ---------------------------------------------------------------------------

/**
 * Calculate cost breakdown for a given token usage.
 *
 * Formula: (tokens / 1_000_000) * price_per_million
 */
export function calculateCost(usage: TokenUsage): CostBreakdown {
  const pricing = getModelPricing(usage.model)

  const inputCost = (usage.inputTokens / 1_000_000) * pricing.input
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.output
  const totalCostUSD = inputCost + outputCost
  const totalCostBRL = totalCostUSD * BRL_EXCHANGE_RATE

  return {
    inputCost: roundToDecimals(inputCost, 6),
    outputCost: roundToDecimals(outputCost, 6),
    totalCostUSD: roundToDecimals(totalCostUSD, 6),
    totalCostBRL: roundToDecimals(totalCostBRL, 2),
  }
}

/**
 * Format a cost breakdown into a human-readable summary string.
 *
 * Example: "Input: $0.0015 | Output: $0.0042 | Total: $0.0057 (R$0.03)"
 */
export function formatCostSummary(cost: CostBreakdown): string {
  const input = formatUSD(cost.inputCost)
  const output = formatUSD(cost.outputCost)
  const total = formatUSD(cost.totalCostUSD)
  const brl = formatBRL(cost.totalCostBRL)

  return `Input: ${input} | Output: ${output} | Total: ${total} (${brl})`
}

// ---------------------------------------------------------------------------
// Formatting Utilities
// ---------------------------------------------------------------------------

function roundToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

function formatUSD(value: number): string {
  if (value < 0.01 && value > 0) {
    return `$${value.toFixed(4)}`
  }
  return `$${value.toFixed(2)}`
}

function formatBRL(value: number): string {
  return `R$${value.toFixed(2)}`
}
