/**
 * token-budget.service — unit tests.
 *
 * Cobre o algoritmo de orçamento de tokens com diminishing returns, inspirado
 * em `inspiration/claude-code-leak/src/query/tokenBudget.ts` mas simplificado
 * para o runtime Quayer (sem agentId, sem nudge messages).
 *
 * Stop conditions:
 *   - turnTokens >= 90% do budget         → over_budget
 *   - count >= 3 AND ambos deltas < 500   → diminishing_returns
 *   - budget null ou <= 0                 → no_budget
 *
 * Em qualquer outro caso → continue (incrementa count + atualiza deltas).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createBudgetTracker,
  checkTokenBudget,
  resetBudgetTracker,
  type BudgetTracker,
} from './token-budget.service'

describe('createBudgetTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-11T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna estado inicial zerado com startedAt = now', () => {
    const t = createBudgetTracker()
    expect(t.continuationCount).toBe(0)
    expect(t.lastDeltaTokens).toBe(0)
    expect(t.lastGlobalTurnTokens).toBe(0)
    expect(t.startedAt).toBe(Date.now())
  })
})

describe('checkTokenBudget — continue path', () => {
  let tracker: BudgetTracker

  beforeEach(() => {
    tracker = createBudgetTracker()
  })

  it('retorna continue se turnTokens < 90% budget', () => {
    const decision = checkTokenBudget(tracker, 5000, 10000)
    expect(decision.action).toBe('continue')
    if (decision.action === 'continue') {
      expect(decision.reason).toBe('within_budget')
      expect(decision.turnTokens).toBe(5000)
      expect(decision.pct).toBe(50)
    }
  })

  it('incrementa continuationCount quando continua', () => {
    expect(tracker.continuationCount).toBe(0)
    checkTokenBudget(tracker, 2000, 10000)
    expect(tracker.continuationCount).toBe(1)
    checkTokenBudget(tracker, 4000, 10000)
    expect(tracker.continuationCount).toBe(2)
  })

  it('atualiza lastDeltaTokens e lastGlobalTurnTokens quando continua', () => {
    checkTokenBudget(tracker, 2000, 10000)
    expect(tracker.lastGlobalTurnTokens).toBe(2000)
    expect(tracker.lastDeltaTokens).toBe(2000) // delta = 2000 - 0

    checkTokenBudget(tracker, 5500, 10000)
    expect(tracker.lastGlobalTurnTokens).toBe(5500)
    expect(tracker.lastDeltaTokens).toBe(3500) // delta = 5500 - 2000
  })
})

describe('checkTokenBudget — stop/over_budget', () => {
  it('retorna stop/over_budget quando turnTokens >= 90% budget', () => {
    const tracker = createBudgetTracker()
    const decision = checkTokenBudget(tracker, 9000, 10000)
    expect(decision.action).toBe('stop')
    if (decision.action === 'stop') {
      expect(decision.reason).toBe('over_budget')
      expect(decision.pct).toBe(90)
      expect(decision.turnTokens).toBe(9000)
    }
  })

  it('retorna stop/over_budget quando turnTokens excede 100% budget', () => {
    const tracker = createBudgetTracker()
    const decision = checkTokenBudget(tracker, 12000, 10000)
    expect(decision.action).toBe('stop')
    if (decision.action === 'stop') {
      expect(decision.reason).toBe('over_budget')
    }
  })
})

describe('checkTokenBudget — stop/diminishing_returns', () => {
  it('retorna stop/diminishing_returns quando count >= 3 AND ambos deltas < 500', () => {
    const tracker: BudgetTracker = {
      continuationCount: 3,
      lastDeltaTokens: 200,        // < 500
      lastGlobalTurnTokens: 5000,
      startedAt: Date.now(),
    }
    // deltaSinceLastCheck = 5300 - 5000 = 300 (< 500)
    const decision = checkTokenBudget(tracker, 5300, 10000)
    expect(decision.action).toBe('stop')
    if (decision.action === 'stop') {
      expect(decision.reason).toBe('diminishing_returns')
    }
  })

  it('NÃO retorna diminishing se count < 3', () => {
    const tracker: BudgetTracker = {
      continuationCount: 2, // < 3
      lastDeltaTokens: 100,
      lastGlobalTurnTokens: 5000,
      startedAt: Date.now(),
    }
    const decision = checkTokenBudget(tracker, 5100, 10000)
    expect(decision.action).toBe('continue')
  })

  it('NÃO retorna diminishing se delta atual >= 500 (ainda há progresso)', () => {
    const tracker: BudgetTracker = {
      continuationCount: 5,
      lastDeltaTokens: 200,       // pequeno
      lastGlobalTurnTokens: 5000,
      startedAt: Date.now(),
    }
    // deltaSinceLastCheck = 5600 - 5000 = 600 (>= 500 → ainda progredindo)
    const decision = checkTokenBudget(tracker, 5600, 10000)
    expect(decision.action).toBe('continue')
  })
})

describe('checkTokenBudget — stop/no_budget', () => {
  it('retorna stop/no_budget se budget é null', () => {
    const tracker = createBudgetTracker()
    const decision = checkTokenBudget(tracker, 100, null)
    expect(decision.action).toBe('stop')
    if (decision.action === 'stop') {
      expect(decision.reason).toBe('no_budget')
    }
  })

  it('retorna stop/no_budget se budget <= 0', () => {
    const tracker = createBudgetTracker()
    const decision = checkTokenBudget(tracker, 100, 0)
    expect(decision.action).toBe('stop')
    if (decision.action === 'stop') {
      expect(decision.reason).toBe('no_budget')
    }

    const decision2 = checkTokenBudget(tracker, 100, -50)
    expect(decision2.action).toBe('stop')
    if (decision2.action === 'stop') {
      expect(decision2.reason).toBe('no_budget')
    }
  })
})

describe('resetBudgetTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-11T10:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('zera count, deltas e atualiza startedAt', () => {
    const tracker: BudgetTracker = {
      continuationCount: 5,
      lastDeltaTokens: 1234,
      lastGlobalTurnTokens: 9999,
      startedAt: Date.now() - 60_000,
    }

    vi.setSystemTime(new Date('2026-05-11T11:00:00Z'))
    resetBudgetTracker(tracker)

    expect(tracker.continuationCount).toBe(0)
    expect(tracker.lastDeltaTokens).toBe(0)
    expect(tracker.lastGlobalTurnTokens).toBe(0)
    expect(tracker.startedAt).toBe(Date.now())
  })
})
