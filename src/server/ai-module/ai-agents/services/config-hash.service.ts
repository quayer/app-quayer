/**
 * config-hash.service.ts — QH-11
 *
 * Computa um hash SHA-256 ESTÁVEL da configuração efetiva do agente por turno.
 * Gravado em AgentRuntimeDecision.configHash para facilitar agrupamento de turnos
 * por configuração e detecção de regressão/drift após rollback de prompt.
 *
 * Regras de estabilidade:
 *   - tools são ordenadas alfabeticamente antes da serialização.
 *   - O objeto canônico é serializado com JSON.stringify (ordem de chaves fixa).
 *   - temperature e maxTokens são incluídos apenas quando presentes (undefined é
 *     omitido para não gerar hashes distintos por ausência de campo opcional).
 *   - O resultado é sempre um hex de 64 caracteres (SHA-256).
 *
 * Função PURA: sem I/O, sem efeitos colaterais. Testável em isolamento.
 *
 * Referência: docs/backlog/QUAYER_HARDENING_BACKLOG.md — QH-11
 *
 * @module services/config-hash.service
 */

import { createHash } from 'node:crypto'
import { z } from 'zod'

// ── Schema Zod de entrada ─────────────────────────────────────────────────────

export const ComputeConfigHashInputSchema = z.object({
  /** Prompt do sistema enviado ao LLM neste turno. */
  systemPrompt: z.string(),
  /** Nomes das tools habilitadas. A ordem é normalizada internamente. */
  tools: z.array(z.string()),
  /** Identificador do provider LLM (ex.: 'openai', 'anthropic'). */
  provider: z.string().min(1),
  /** Identificador do modelo LLM (ex.: 'gpt-4o', 'claude-sonnet-4-5'). */
  model: z.string().min(1),
  /** Temperatura configurada. undefined = não incluído no hash. */
  temperature: z.number().optional(),
  /** Limite de tokens de saída. undefined = não incluído no hash. */
  maxTokens: z.number().int().optional(),
})

export type ComputeConfigHashInput = z.infer<typeof ComputeConfigHashInputSchema>

// ── Objeto canônico (estrutura serializada para o hash) ───────────────────────

interface CanonicalConfig {
  systemPrompt: string
  tools: string[]
  provider: string
  model: string
  temperature?: number
  maxTokens?: number
}

// ── Função pública ────────────────────────────────────────────────────────────

/**
 * Computa o SHA-256 da configuração efetiva do agente.
 *
 * Lança ZodError se o input não passar na validação (contrato explícito).
 * O caller deve garantir inputs válidos; erros de schema indicam bug no caller.
 *
 * @param input - Configuração do turno a ser hasheada.
 * @returns Hex string de 64 caracteres (SHA-256).
 */
export function computeConfigHash(input: ComputeConfigHashInput): string {
  // Valida o input — lança ZodError em caso de violação.
  const parsed = ComputeConfigHashInputSchema.parse(input)

  // Monta objeto canônico com tools em ordem alfabética determinística.
  const canonical: CanonicalConfig = {
    systemPrompt: parsed.systemPrompt,
    tools: [...parsed.tools].sort(),
    provider: parsed.provider,
    model: parsed.model,
  }

  // Inclui campos opcionais somente quando presentes para garantir que a
  // ausência de um campo não produza hash diferente de undefined explícito.
  if (parsed.temperature !== undefined) {
    canonical.temperature = parsed.temperature
  }
  if (parsed.maxTokens !== undefined) {
    canonical.maxTokens = parsed.maxTokens
  }

  const payload = JSON.stringify(canonical)
  return createHash('sha256').update(payload, 'utf8').digest('hex')
}
