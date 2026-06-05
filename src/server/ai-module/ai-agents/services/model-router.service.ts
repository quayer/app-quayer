/**
 * model-router.service.ts — QH-05
 *
 * Roteador custo-consciente: decide se usa o modelo "mini" (barato) ou
 * "full" (completo) para cada turno com base nas tools chamadas no turno
 * anterior (lidas de AgentRuntimeDecision.toolsCalled[]).
 *
 * API pública:
 *   - modelForTurn(input) → { provider, model, tier, reason }
 *   - parseMiniModelEnv(raw?) → { provider, model } | null
 *
 * Heurística:
 *   - 'full' quando:
 *       (a) miniModel não está configurado (roteamento desligado), OU
 *       (b) previousTools é undefined (primeiro turno — contexto desconhecido), OU
 *       (c) previousTools contém pelo menos uma tool pesada.
 *   - 'mini' nos demais casos (small-talk, qualificação simples, etc.).
 *
 * Completamente livre de I/O — função pura testável em isolamento.
 *
 * Referência: docs/backlog/QUAYER_HARDENING_BACKLOG.md — QH-05
 *
 * @module services/model-router.service
 */

import { z } from 'zod'

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface ModelDescriptor {
  provider: string
  model: string
}

export type ModelTier = 'mini' | 'full'

export interface ModelRouterResult {
  provider: string
  model: string
  tier: ModelTier
  reason: string
}

// ── Schema Zod de entrada ─────────────────────────────────────────────────────

const ModelDescriptorSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
})

export const ModelForTurnInputSchema = z.object({
  /**
   * Tools chamadas no turno ANTERIOR (de AgentRuntimeDecision.toolsCalled).
   * undefined indica "primeiro turno" — força tier full.
   */
  previousTools: z.array(z.string()).optional(),
  /** Modelo completo configurado para o agente. */
  fullModel: ModelDescriptorSchema,
  /**
   * Modelo mini opcional (barato). null ou ausente = roteamento desligado.
   * Formato env esperado: "provider:model" — ver parseMiniModelEnv().
   */
  miniModel: ModelDescriptorSchema.nullable().optional(),
})

export type ModelForTurnInput = z.infer<typeof ModelForTurnInputSchema>

// ── Tools "pesadas" que exigem modelo full ────────────────────────────────────
// Qualquer prefixo "calendar*" + transferências/dispatch/CRM/pricing.

const HEAVY_TOOL_EXACT = new Set<string>([
  'transfer_to_human',
  'dispatch_to_agent',
  'create_lead',
  'create_event',
  'check_availability',
  'get_pricing',
  'send_pricing',
])

const HEAVY_TOOL_PREFIXES: readonly string[] = ['calendar']

/**
 * Retorna true se o nome da tool exige tier full.
 */
function isHeavyTool(toolName: string): boolean {
  if (HEAVY_TOOL_EXACT.has(toolName)) return true
  return HEAVY_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix))
}

// ── Função principal ──────────────────────────────────────────────────────────

/**
 * Decide qual modelo usar neste turno.
 *
 * @param input - Validado internamente. Input inválido → tier full (fail-safe).
 * @returns ModelRouterResult com provider, model, tier e razão human-readable.
 */
export function modelForTurn(input: ModelForTurnInput): ModelRouterResult {
  const parsed = ModelForTurnInputSchema.safeParse(input)

  // Zod inválido → fail-safe: full model
  if (!parsed.success) {
    return {
      provider: input.fullModel?.provider ?? 'unknown',
      model: input.fullModel?.model ?? 'unknown',
      tier: 'full',
      reason: 'invalid_input_fallback_full',
    }
  }

  const { previousTools, fullModel, miniModel } = parsed.data

  // (a) Roteamento desligado: miniModel não configurado
  if (miniModel == null) {
    return {
      ...fullModel,
      tier: 'full',
      reason: 'routing_disabled_no_mini_model',
    }
  }

  // (b) Primeiro turno: previousTools undefined — contexto desconhecido
  if (previousTools === undefined) {
    return {
      ...fullModel,
      tier: 'full',
      reason: 'first_turn_no_previous_tools',
    }
  }

  // (c) Turno anterior usou tool pesada
  const heavyTool = previousTools.find(isHeavyTool)
  if (heavyTool !== undefined) {
    return {
      ...fullModel,
      tier: 'full',
      reason: `heavy_tool_used:${heavyTool}`,
    }
  }

  // Caso contrário → mini
  return {
    ...miniModel,
    tier: 'mini',
    reason: 'lightweight_turn_use_mini',
  }
}

// ── Utilitário de env ─────────────────────────────────────────────────────────

/**
 * Parseia a variável de ambiente que define o modelo mini no formato
 * "provider:model" (ex.: "openai:gpt-4o-mini", "anthropic:claude-haiku-3-5-20241022").
 *
 * Retorna null em caso de:
 *   - raw undefined ou string vazia
 *   - formato inválido (sem ':' ou partes vazias)
 *
 * Nunca lança exceção.
 *
 * @example
 *   parseMiniModelEnv("openai:gpt-4o-mini")
 *   // → { provider: "openai", model: "gpt-4o-mini" }
 *
 *   parseMiniModelEnv(undefined)
 *   // → null
 */
export function parseMiniModelEnv(raw?: string): ModelDescriptor | null {
  if (!raw || raw.trim() === '') return null

  const separatorIndex = raw.indexOf(':')
  if (separatorIndex <= 0) return null

  const provider = raw.slice(0, separatorIndex).trim()
  const model = raw.slice(separatorIndex + 1).trim()

  if (!provider || !model) return null

  return { provider, model }
}
