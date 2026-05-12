/**
 * memory-window.service — unit tests.
 *
 * Garante que computeDynamicWindow respeita o orçamento de tokens e nunca
 * deixa overflow no contexto do LLM. Testa também os helpers estimateTokens
 * e applyWindow.
 */

import { describe, it, expect } from 'vitest'
import {
  computeDynamicWindow,
  estimateTokens,
  applyWindow,
  type ConversationMessage,
  type BudgetInputs,
} from './memory-window.service'

// Helper: gera mensagem com conteúdo de tamanho controlado para tokens
// previsíveis. content de length N → ceil(N/4) tokens + role tokens.
function makeMessage(content: string, role: string = 'user'): ConversationMessage {
  return { role, content }
}

// Budget abundante para isolar comportamento "tudo cabe".
const ABUNDANT_BUDGET: BudgetInputs = {
  maxTokens: 200_000,
  systemPromptTokens: 100,
  toolsEstimateTokens: 200,
}

describe('computeDynamicWindow', () => {
  it('1. budget abundante → window = messages.length, droppedCount 0, FITS_FULL', () => {
    const messages = [
      makeMessage('hello'),
      makeMessage('world'),
      makeMessage('how are you?'),
    ]

    const result = computeDynamicWindow(messages, ABUNDANT_BUDGET)

    expect(result.window).toBe(3)
    expect(result.droppedCount).toBe(0)
    expect(result.reason).toBe('FITS_FULL')
  })

  it('2. budget zero (após system+tools+output+buffer) → window 0, BUDGET_EXHAUSTED', () => {
    // maxTokens cobre exatamente system+tools+output+buffer → nada sobra.
    const budget: BudgetInputs = {
      maxTokens: 1000,
      systemPromptTokens: 500,
      toolsEstimateTokens: 0,
      expectedOutputTokens: 0,
      safetyBufferTokens: 500, // 500 + 500 = 1000 = maxTokens
    }

    const messages = [makeMessage('hello')]

    const result = computeDynamicWindow(messages, budget)

    expect(result.window).toBe(0)
    expect(result.reason).toBe('BUDGET_EXHAUSTED')
    expect(result.droppedCount).toBe(1)
  })

  it('3. mensagens grandes → algumas dropadas, window < total', () => {
    // Cada mensagem tem ~250 chars → ~63 tokens.
    // Budget remanescente apertado para forçar drop.
    const bigContent = 'x'.repeat(1000) // 1000/4 = 250 tokens
    const messages = [
      makeMessage(bigContent),
      makeMessage(bigContent),
      makeMessage(bigContent),
      makeMessage(bigContent),
      makeMessage(bigContent),
    ]

    const budget: BudgetInputs = {
      maxTokens: 2000,
      systemPromptTokens: 100,
      toolsEstimateTokens: 50,
      expectedOutputTokens: 200,
      safetyBufferTokens: 100,
      // remaining ≈ 1550 tokens, cabem ~6 mensagens de 250 — mas só temos 5.
    }
    // Ajusto para forçar drop: aperto mais o budget.
    const tighterBudget: BudgetInputs = {
      ...budget,
      maxTokens: 1000, // remaining ≈ 550, cabem ~2 msgs
    }

    const result = computeDynamicWindow(messages, tighterBudget)

    expect(result.window).toBeGreaterThan(0)
    expect(result.window).toBeLessThan(messages.length)
    expect(result.droppedCount).toBe(messages.length - result.window)
    expect(result.reason).toBe('TRIMMED')
  })

  it('4. messages vazias → window 0, droppedCount 0, FITS_FULL', () => {
    const result = computeDynamicWindow([], ABUNDANT_BUDGET)

    expect(result.window).toBe(0)
    expect(result.droppedCount).toBe(0)
    expect(result.reason).toBe('FITS_FULL')
  })

  it('5. apenas 1 mensagem cabe → window 1', () => {
    // Budget que cabe exatamente 1 mensagem de ~250 tokens.
    const bigContent = 'x'.repeat(1000) // 250 tokens + 4 (role "user")
    const messages = [
      makeMessage(bigContent),
      makeMessage(bigContent),
      makeMessage(bigContent),
    ]

    const budget: BudgetInputs = {
      maxTokens: 900,
      systemPromptTokens: 100,
      toolsEstimateTokens: 50,
      expectedOutputTokens: 200,
      safetyBufferTokens: 100,
      // remaining = 450 → cabe 1 msg de 254 tokens, não cabe a segunda.
    }

    const result = computeDynamicWindow(messages, budget)

    expect(result.window).toBe(1)
    expect(result.droppedCount).toBe(2)
    expect(result.reason).toBe('TRIMMED')
  })

  it('6. safetyBufferTokens default 500 aplicado', () => {
    // Se não passar safetyBufferTokens, default 500 deve ser deduzido.
    // maxTokens=600, system=0, tools=0, output default=1024 → remaining seria
    // negativo se buffer default 500 for considerado.
    const budget: BudgetInputs = {
      maxTokens: 600,
      systemPromptTokens: 0,
      toolsEstimateTokens: 0,
      // expectedOutputTokens default 1024 → 600 - 0 - 0 - 1024 - 500 < 0
    }

    const result = computeDynamicWindow([makeMessage('hi')], budget)

    expect(result.reason).toBe('BUDGET_EXHAUSTED')
    expect(result.window).toBe(0)
  })

  it('7. expectedOutputTokens default 1024 aplicado', () => {
    // maxTokens=1500, sem custom output. Se default 1024 aplicado, remaining
    // = 1500 - 0 - 0 - 1024 - 500 = -24 → BUDGET_EXHAUSTED.
    const budget: BudgetInputs = {
      maxTokens: 1500,
      systemPromptTokens: 0,
      toolsEstimateTokens: 0,
      // expectedOutputTokens omitido → default 1024
      // safetyBufferTokens omitido → default 500
    }

    const result = computeDynamicWindow([makeMessage('hi')], budget)

    expect(result.reason).toBe('BUDGET_EXHAUSTED')
  })

  it('8. custom budget inputs respeitados', () => {
    // Com output=100 e buffer=50, remaining = 5000 - 100 - 50 - 100 - 50 = 4700
    // → mensagens devem caber.
    const budget: BudgetInputs = {
      maxTokens: 5000,
      systemPromptTokens: 100,
      toolsEstimateTokens: 50,
      expectedOutputTokens: 100,
      safetyBufferTokens: 50,
    }

    const messages = [makeMessage('hello'), makeMessage('world')]

    const result = computeDynamicWindow(messages, budget)

    expect(result.window).toBe(2)
    expect(result.reason).toBe('FITS_FULL')
    expect(result.totalContextTokens).toBeGreaterThan(0)
    expect(result.totalContextTokens).toBeLessThanOrEqual(5000)
  })
})

describe('estimateTokens', () => {
  it('9. "hello world" → 3 tokens (ceil 11/4)', () => {
    expect(estimateTokens('hello world')).toBe(3)
  })

  it('10. text vazio → 0', () => {
    expect(estimateTokens('')).toBe(0)
  })
})

describe('applyWindow', () => {
  it('11. window 5 em array de 10 → últimas 5', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(applyWindow(arr, 5)).toEqual([6, 7, 8, 9, 10])
  })

  it('12. window 0 → array vazio', () => {
    const arr = [1, 2, 3]
    expect(applyWindow(arr, 0)).toEqual([])
  })

  it('13. window maior que length → array completo', () => {
    const arr = [1, 2, 3]
    expect(applyWindow(arr, 100)).toEqual([1, 2, 3])
  })
})
