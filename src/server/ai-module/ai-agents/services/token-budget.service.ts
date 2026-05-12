/**
 * Token Budget tracker with diminishing-returns detection.
 *
 * Inspirado em `inspiration/claude-code-leak/src/query/tokenBudget.ts`, mas
 * adaptado ao runtime Quayer: sem agentId, sem nudge messages, sem
 * completionEvent. Apenas decide `continue | stop` com motivo.
 *
 * Uso típico no loop de tool-calling do agente WhatsApp:
 *
 *   const tracker = createBudgetTracker()
 *   while (true) {
 *     const decision = checkTokenBudget(tracker, currentTurnTokens, budget)
 *     if (decision.action === 'stop') break
 *     // continuar com próxima rodada de tools
 *   }
 *
 * Stop conditions:
 *   1. budget é null ou <= 0                       → 'no_budget'
 *   2. turnTokens >= 90% do budget                 → 'over_budget'
 *   3. count >= 3 AND deltas atual e anterior < 500 → 'diminishing_returns'
 */

/** Fração do budget a partir da qual paramos (over_budget). */
export const COMPLETION_THRESHOLD = 0.9

/** Delta abaixo do qual consideramos que não há mais progresso útil. */
export const DIMINISHING_THRESHOLD = 500

/** Quantas continuações antes de checar diminishing returns. */
const MIN_CONTINUATIONS_FOR_DIMINISHING = 3

export interface BudgetTracker {
  continuationCount: number
  lastDeltaTokens: number
  lastGlobalTurnTokens: number
  startedAt: number
}

export type TokenBudgetDecision =
  | {
      action: 'continue'
      reason: 'within_budget'
      turnTokens: number
      pct: number
    }
  | {
      action: 'stop'
      reason: 'over_budget' | 'diminishing_returns' | 'no_budget'
      turnTokens: number
      pct: number
    }

export function createBudgetTracker(): BudgetTracker {
  return {
    continuationCount: 0,
    lastDeltaTokens: 0,
    lastGlobalTurnTokens: 0,
    startedAt: Date.now(),
  }
}

/**
 * Reseta o tracker para o próximo turno. Mantém referência (mutação in-place)
 * para evitar realocação no hot-path do agent loop.
 */
export function resetBudgetTracker(tracker: BudgetTracker): void {
  tracker.continuationCount = 0
  tracker.lastDeltaTokens = 0
  tracker.lastGlobalTurnTokens = 0
  tracker.startedAt = Date.now()
}

export function checkTokenBudget(
  tracker: BudgetTracker,
  globalTurnTokens: number,
  budget: number | null,
): TokenBudgetDecision {
  // Sem budget definido → stop conservador. Evita drift inalcançável.
  if (budget === null || budget <= 0) {
    return {
      action: 'stop',
      reason: 'no_budget',
      turnTokens: globalTurnTokens,
      pct: 0,
    }
  }

  const pct = Math.round((globalTurnTokens / budget) * 100)

  // Hard stop: estouramos 90% do budget.
  if (globalTurnTokens >= budget * COMPLETION_THRESHOLD) {
    return {
      action: 'stop',
      reason: 'over_budget',
      turnTokens: globalTurnTokens,
      pct,
    }
  }

  // Diminishing returns: já tentamos várias rodadas e os últimos dois deltas
  // ficaram pequenos. Não vale a pena queimar mais tokens.
  const deltaSinceLastCheck = globalTurnTokens - tracker.lastGlobalTurnTokens
  const isDiminishing =
    tracker.continuationCount >= MIN_CONTINUATIONS_FOR_DIMINISHING &&
    deltaSinceLastCheck < DIMINISHING_THRESHOLD &&
    tracker.lastDeltaTokens < DIMINISHING_THRESHOLD

  if (isDiminishing) {
    return {
      action: 'stop',
      reason: 'diminishing_returns',
      turnTokens: globalTurnTokens,
      pct,
    }
  }

  // Caminho normal: continuar e atualizar o tracker.
  tracker.continuationCount += 1
  tracker.lastDeltaTokens = deltaSinceLastCheck
  tracker.lastGlobalTurnTokens = globalTurnTokens

  return {
    action: 'continue',
    reason: 'within_budget',
    turnTokens: globalTurnTokens,
    pct,
  }
}
