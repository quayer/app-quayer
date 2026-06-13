/**
 * proactive-eligibility.pure — unit tests (NFR-15 / NFR-PRO-2; TPRO-13/TPRO-15 puro)
 *
 * Hermético: zero DB, zero mock — o módulo é puro. Dirigimos cada gate isolado,
 * a decisão combinada e os caminhos fail-safe (em dúvida → não envia).
 *
 * Cobre:
 *   - isOptedOut: registro presente vs null.
 *   - isWithin24hWindow: dentro / expirado / borda exata / ausente (fail-safe fora).
 *   - isAiSuppressed: aiEnabled=false / aiBlockedUntil futuro / borda / passado /
 *     status CLOSED / sessão limpa libera.
 *   - exceededAntiSpam: abaixo / no teto / acima / maxAttempts<=0 / contador inválido.
 *   - canSendProactive: prioridade dos gates, janela dentro/fora±template, e a
 *     ordem opt-out > suppressed > anti_spam > janela quando vários gates batem.
 */

import { describe, it, expect } from 'vitest'
import {
  isOptedOut,
  isWithin24hWindow,
  isAiSuppressed,
  exceededAntiSpam,
  canSendProactive,
  type CanSendProactiveInput,
} from './proactive-eligibility.pure'

const NOW = new Date('2026-06-13T12:00:00.000Z')
const future = (ms: number) => new Date(NOW.getTime() + ms)
const past = (ms: number) => new Date(NOW.getTime() - ms)

// ---------------------------------------------------------------------------
// isOptedOut
// ---------------------------------------------------------------------------

describe('isOptedOut', () => {
  it('returns true when an opt-out record exists', () => {
    expect(isOptedOut({ phone: '+5511999999999' })).toBe(true)
  })

  it('returns false when there is no opt-out record (null)', () => {
    expect(isOptedOut(null)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isWithin24hWindow
// ---------------------------------------------------------------------------

describe('isWithin24hWindow', () => {
  it('returns true when window expires in the future', () => {
    expect(
      isWithin24hWindow({ whatsappWindowExpiresAt: future(60_000) }, NOW),
    ).toBe(true)
  })

  it('returns false when the window already expired', () => {
    expect(
      isWithin24hWindow({ whatsappWindowExpiresAt: past(60_000) }, NOW),
    ).toBe(false)
  })

  it('returns false at the exact expiry boundary (expiresAt === now)', () => {
    // strictly > now → boundary is OUT (fail-safe).
    expect(isWithin24hWindow({ whatsappWindowExpiresAt: NOW }, NOW)).toBe(false)
  })

  it('returns false when window field is null (fail-safe: needs template)', () => {
    expect(isWithin24hWindow({ whatsappWindowExpiresAt: null }, NOW)).toBe(false)
  })

  it('returns false when window field is undefined', () => {
    expect(isWithin24hWindow({}, NOW)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// isAiSuppressed (espelha canDispatchAgent + status CLOSED)
// ---------------------------------------------------------------------------

describe('isAiSuppressed', () => {
  it('suppresses when aiEnabled === false', () => {
    expect(isAiSuppressed({ aiEnabled: false }, NOW)).toBe(true)
  })

  it('suppresses when aiBlockedUntil is in the future', () => {
    expect(isAiSuppressed({ aiBlockedUntil: future(60_000) }, NOW)).toBe(true)
  })

  it('does NOT suppress at the block boundary (aiBlockedUntil === now)', () => {
    // canDispatchAgent: block lifts when blockedUntil <= now.
    expect(isAiSuppressed({ aiBlockedUntil: NOW }, NOW)).toBe(false)
  })

  it('does NOT suppress when aiBlockedUntil is in the past', () => {
    expect(isAiSuppressed({ aiBlockedUntil: past(60_000) }, NOW)).toBe(false)
  })

  it('suppresses when status === CLOSED', () => {
    expect(isAiSuppressed({ status: 'CLOSED' }, NOW)).toBe(true)
  })

  it('does NOT suppress a clean, open, enabled session', () => {
    expect(
      isAiSuppressed(
        { aiEnabled: true, aiBlockedUntil: null, status: 'OPEN' },
        NOW,
      ),
    ).toBe(false)
  })

  it('does NOT suppress an empty session (all fields undefined)', () => {
    // aiEnabled undefined !== false → not suppressed by that gate.
    expect(isAiSuppressed({}, NOW)).toBe(false)
  })

  it('suppresses when multiple suppression conditions hold', () => {
    expect(
      isAiSuppressed(
        { aiEnabled: false, aiBlockedUntil: future(60_000), status: 'CLOSED' },
        NOW,
      ),
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// exceededAntiSpam
// ---------------------------------------------------------------------------

describe('exceededAntiSpam', () => {
  it('does not exceed when below max', () => {
    expect(exceededAntiSpam(1, 3)).toBe(false)
  })

  it('exceeds exactly at the cap (>=)', () => {
    expect(exceededAntiSpam(3, 3)).toBe(true)
  })

  it('exceeds when above the cap', () => {
    expect(exceededAntiSpam(5, 3)).toBe(true)
  })

  it('does not exceed at zero sends with a positive cap', () => {
    expect(exceededAntiSpam(0, 1)).toBe(false)
  })

  it('fail-safe: maxAttempts <= 0 always exceeds (blocks)', () => {
    expect(exceededAntiSpam(0, 0)).toBe(true)
    expect(exceededAntiSpam(0, -1)).toBe(true)
  })

  it('fail-safe: non-finite maxAttempts blocks', () => {
    expect(exceededAntiSpam(0, Number.NaN)).toBe(true)
    expect(exceededAntiSpam(0, Number.POSITIVE_INFINITY)).toBe(true)
  })

  it('fail-safe: negative or non-finite counter blocks', () => {
    expect(exceededAntiSpam(-1, 3)).toBe(true)
    expect(exceededAntiSpam(Number.NaN, 3)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// canSendProactive — decisão combinada
// ---------------------------------------------------------------------------

/** Base que PASSA em todos os gates (dentro da janela, IA viva, sem opt-out). */
function allowedInput(
  overrides: Partial<CanSendProactiveInput> = {},
): CanSendProactiveInput {
  return {
    optOut: null,
    session: {
      whatsappWindowExpiresAt: future(60_000),
      aiEnabled: true,
      aiBlockedUntil: null,
      status: 'OPEN',
    },
    now: NOW,
    consecutiveProactiveWithoutReply: 0,
    maxAttempts: 3,
    hasApprovedTemplate: false,
    ...overrides,
  }
}

describe('canSendProactive', () => {
  it('allows within window without needing a template', () => {
    expect(canSendProactive(allowedInput())).toEqual({
      allowed: true,
      needsTemplate: false,
    })
  })

  it('blocks with opted_out when contact opted out', () => {
    const result = canSendProactive(
      allowedInput({ optOut: { phone: '+5511999999999' } }),
    )
    expect(result).toEqual({ allowed: false, reason: 'opted_out' })
  })

  it('blocks with suppressed when AI is disabled', () => {
    const result = canSendProactive(
      allowedInput({
        session: {
          whatsappWindowExpiresAt: future(60_000),
          aiEnabled: false,
        },
      }),
    )
    expect(result).toEqual({ allowed: false, reason: 'suppressed' })
  })

  it('blocks with suppressed when session is CLOSED', () => {
    const result = canSendProactive(
      allowedInput({
        session: {
          whatsappWindowExpiresAt: future(60_000),
          status: 'CLOSED',
        },
      }),
    )
    expect(result).toEqual({ allowed: false, reason: 'suppressed' })
  })

  it('blocks with anti_spam at the cap', () => {
    const result = canSendProactive(
      allowedInput({ consecutiveProactiveWithoutReply: 3, maxAttempts: 3 }),
    )
    expect(result).toEqual({ allowed: false, reason: 'anti_spam' })
  })

  it('blocks outside window when no approved template', () => {
    const result = canSendProactive(
      allowedInput({
        session: {
          whatsappWindowExpiresAt: past(60_000),
          aiEnabled: true,
          status: 'OPEN',
        },
        hasApprovedTemplate: false,
      }),
    )
    expect(result).toEqual({
      allowed: false,
      reason: 'outside_window_no_template',
    })
  })

  it('allows outside window WITH approved template, flagging needsTemplate', () => {
    const result = canSendProactive(
      allowedInput({
        session: {
          whatsappWindowExpiresAt: past(60_000),
          aiEnabled: true,
          status: 'OPEN',
        },
        hasApprovedTemplate: true,
      }),
    )
    expect(result).toEqual({ allowed: true, needsTemplate: true })
  })

  it('blocks outside window when window field absent and no template', () => {
    const result = canSendProactive(
      allowedInput({
        session: { aiEnabled: true, status: 'OPEN' },
        hasApprovedTemplate: false,
      }),
    )
    expect(result).toEqual({
      allowed: false,
      reason: 'outside_window_no_template',
    })
  })

  // --- Prioridade dos gates (ordem de severidade) ---------------------------

  it('prioritizes opt-out over every other failing gate', () => {
    const result = canSendProactive({
      optOut: { phone: '+5511999999999' },
      session: { whatsappWindowExpiresAt: past(1), aiEnabled: false, status: 'CLOSED' },
      now: NOW,
      consecutiveProactiveWithoutReply: 99,
      maxAttempts: 1,
      hasApprovedTemplate: false,
    })
    expect(result).toEqual({ allowed: false, reason: 'opted_out' })
  })

  it('prioritizes suppression over anti-spam and window when not opted out', () => {
    const result = canSendProactive({
      optOut: null,
      session: { whatsappWindowExpiresAt: past(1), aiEnabled: false },
      now: NOW,
      consecutiveProactiveWithoutReply: 99,
      maxAttempts: 1,
      hasApprovedTemplate: false,
    })
    expect(result).toEqual({ allowed: false, reason: 'suppressed' })
  })

  it('prioritizes anti-spam over the window gate when not opted out / not suppressed', () => {
    const result = canSendProactive({
      optOut: null,
      session: { whatsappWindowExpiresAt: past(1), aiEnabled: true, status: 'OPEN' },
      now: NOW,
      consecutiveProactiveWithoutReply: 5,
      maxAttempts: 1,
      hasApprovedTemplate: true, // would otherwise allow with template
    })
    expect(result).toEqual({ allowed: false, reason: 'anti_spam' })
  })

  it('fail-safe: maxAttempts <= 0 blocks via anti_spam even at zero sends', () => {
    const result = canSendProactive(
      allowedInput({ consecutiveProactiveWithoutReply: 0, maxAttempts: 0 }),
    )
    expect(result).toEqual({ allowed: false, reason: 'anti_spam' })
  })

  it('treats hasApprovedTemplate default (undefined) as no template (fail-safe)', () => {
    const result = canSendProactive({
      optOut: null,
      session: { whatsappWindowExpiresAt: past(60_000), aiEnabled: true, status: 'OPEN' },
      now: NOW,
      consecutiveProactiveWithoutReply: 0,
      maxAttempts: 3,
      // hasApprovedTemplate omitted on purpose
    })
    expect(result).toEqual({
      allowed: false,
      reason: 'outside_window_no_template',
    })
  })
})
