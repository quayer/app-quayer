/**
 * Unit tests do parser PURO resolveScheduledAt (TPRO-01).
 */

import { describe, it, expect } from 'vitest'
import { resolveScheduledAt } from './resolve-scheduled-at'

const NOW = new Date('2026-06-13T10:00:00.000Z')

describe('resolveScheduledAt', () => {
  it('parseia offsets relativos (s/m/h/d, com e sem +)', () => {
    expect(resolveScheduledAt('+90s', NOW)?.delayMs).toBe(90_000)
    expect(resolveScheduledAt('30m', NOW)?.delayMs).toBe(30 * 60_000)
    expect(resolveScheduledAt('+2h', NOW)?.delayMs).toBe(2 * 3_600_000)
    expect(resolveScheduledAt('1d', NOW)?.delayMs).toBe(86_400_000)
  })

  it('offset calcula a data alvo a partir de now', () => {
    const r = resolveScheduledAt('+2h', NOW)
    expect(r?.at.toISOString()).toBe('2026-06-13T12:00:00.000Z')
  })

  it('parseia ISO absoluto futuro e calcula o delay', () => {
    const r = resolveScheduledAt('2026-06-14T10:00:00.000Z', NOW)
    expect(r?.delayMs).toBe(24 * 3_600_000)
    expect(r?.at.toISOString()).toBe('2026-06-14T10:00:00.000Z')
  })

  it('rejeita ISO no passado/agora (null)', () => {
    expect(resolveScheduledAt('2026-06-13T09:00:00.000Z', NOW)).toBeNull()
    expect(resolveScheduledAt('2026-06-13T10:00:00.000Z', NOW)).toBeNull()
  })

  it('rejeita offset <= 0 e unidades inválidas (null)', () => {
    expect(resolveScheduledAt('+0h', NOW)).toBeNull()
    expect(resolveScheduledAt('2x', NOW)).toBeNull()
  })

  it('rejeita string vazia / indecifrável (null)', () => {
    expect(resolveScheduledAt('', NOW)).toBeNull()
    expect(resolveScheduledAt('   ', NOW)).toBeNull()
    expect(resolveScheduledAt('amanhã de manhã', NOW)).toBeNull()
  })
})
