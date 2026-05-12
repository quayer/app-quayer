/**
 * Memory Window Service — dynamic conversation window sizing.
 *
 * Em vez de manter `memoryWindow` fixo (ex.: 20 mensagens) por agente,
 * calcula em runtime quantas mensagens de histórico cabem no orçamento
 * de tokens disponível depois de descontar:
 *   - tokens do system prompt
 *   - tokens estimados dos schemas de tools
 *   - tokens reservados para a saída (default 1024)
 *   - safety buffer (default 500)
 *
 * Estratégia: percorre as mensagens do mais recente para o mais antigo,
 * acumulando tokens até esgotar o budget. O resultado é o número N de
 * mensagens que devem ser passadas ao LLM (use `applyWindow` para
 * obter o slice efetivo).
 *
 * Heurística de tokens: chars / 4 (mesma usada em `microcompact.service`
 * e `prompt-builder.service`). É grosseira mas suficiente para budgeting
 * defensivo — sempre arredondamos para cima.
 *
 * Uso típico no runtime do agente WhatsApp:
 *
 *   const decision = computeDynamicWindow(history, {
 *     maxTokens: model.contextWindow,
 *     systemPromptTokens: estimateTokens(systemPrompt),
 *     toolsEstimateTokens: toolsSchemaTokens,
 *   })
 *   const trimmedHistory = applyWindow(history, decision.window)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BudgetInputs {
  /** Janela de contexto do modelo (ex.: 200_000 para Claude Sonnet). */
  maxTokens: number
  /** Tokens já consumidos pelo system prompt. */
  systemPromptTokens: number
  /** Tokens estimados dos JSON schemas das tools registradas. */
  toolsEstimateTokens: number
  /** Tokens reservados para a resposta do LLM. Default 1024. */
  expectedOutputTokens?: number
  /** Buffer defensivo extra. Default 500. */
  safetyBufferTokens?: number
}

export interface ConversationMessage {
  role: string
  content: string
}

export interface WindowDecision {
  /** Número de mensagens (a partir do fim) que cabem no budget. */
  window: number
  /** Tokens estimados do conjunto final (system + tools + output + buffer + msgs). */
  totalContextTokens: number
  /** Quantas mensagens foram descartadas (mais antigas). */
  droppedCount: number
  /** Motivo legível para logs/telemetria. */
  reason: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_EXPECTED_OUTPUT_TOKENS = 1024
const DEFAULT_SAFETY_BUFFER_TOKENS = 500

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Estimador heurístico de tokens.
 * Usa a aproximação clássica de 4 chars/token, arredondando pra cima para
 * evitar underbudget.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

/**
 * Estima tokens de uma mensagem de conversa. Soma role + content com um
 * pequeno overhead (formatação do provider). Mantemos simples para
 * previsibilidade.
 */
function estimateMessageTokens(message: ConversationMessage): number {
  return estimateTokens(message.role) + estimateTokens(message.content)
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/**
 * Calcula a janela dinâmica de mensagens que cabem no orçamento de tokens.
 *
 * Comportamento:
 *  1. budgetForMessages = maxTokens - systemPromptTokens - toolsEstimateTokens
 *                       - expectedOutputTokens - safetyBufferTokens
 *  2. Se <= 0 → window=0, reason="BUDGET_EXHAUSTED".
 *  3. Itera do fim para o começo somando tokens; para no primeiro overflow.
 *  4. reason="FITS_FULL" se todas mensagens entraram, senão "TRIMMED".
 */
export function computeDynamicWindow(
  messages: ConversationMessage[],
  budget: BudgetInputs,
): WindowDecision {
  const expectedOutput = budget.expectedOutputTokens ?? DEFAULT_EXPECTED_OUTPUT_TOKENS
  const safetyBuffer = budget.safetyBufferTokens ?? DEFAULT_SAFETY_BUFFER_TOKENS

  const fixedOverhead =
    budget.systemPromptTokens +
    budget.toolsEstimateTokens +
    expectedOutput +
    safetyBuffer

  const remainingForMessages = budget.maxTokens - fixedOverhead

  if (remainingForMessages <= 0) {
    return {
      window: 0,
      totalContextTokens: fixedOverhead,
      droppedCount: messages.length,
      reason: 'BUDGET_EXHAUSTED',
    }
  }

  if (messages.length === 0) {
    return {
      window: 0,
      totalContextTokens: fixedOverhead,
      droppedCount: 0,
      reason: 'FITS_FULL',
    }
  }

  let consumed = 0
  let window = 0

  // Iteramos do fim para o começo: mensagens recentes têm prioridade.
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateMessageTokens(messages[i])
    if (consumed + msgTokens > remainingForMessages) {
      break
    }
    consumed += msgTokens
    window += 1
  }

  const droppedCount = messages.length - window
  const reason = droppedCount === 0 ? 'FITS_FULL' : 'TRIMMED'

  return {
    window,
    totalContextTokens: fixedOverhead + consumed,
    droppedCount,
    reason,
  }
}

/**
 * Aplica a janela retornando as últimas N mensagens. Se window <= 0 retorna
 * array vazio; se window >= length retorna o array completo.
 */
export function applyWindow<T>(messages: T[], window: number): T[] {
  if (window <= 0) return []
  if (window >= messages.length) return messages.slice()
  return messages.slice(-window)
}
