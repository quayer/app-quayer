/**
 * Unit tests do ext-service-cost (custo de STT por turno).
 * Função pura + tarifas por env (override + fallback ao default em valor inválido).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { computeSttCostUsd } from './ext-service-cost.service'

const ENV_KEYS = ['STT_COST_PER_MIN_DEEPGRAM', 'STT_COST_PER_MIN_WHISPER']

describe('computeSttCostUsd', () => {
  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k]
  })

  it('deepgram: 60s = 1 min × default 0.0043', () => {
    expect(computeSttCostUsd('deepgram', 60)).toBeCloseTo(0.0043, 6)
  })

  it('deepgram: 120s = 2 min', () => {
    expect(computeSttCostUsd('deepgram', 120)).toBeCloseTo(0.0086, 6)
  })

  it('whisper: 60s = default 0.006', () => {
    expect(computeSttCostUsd('whisper', 60)).toBeCloseTo(0.006, 6)
  })

  it('duração 0/negativa/NaN/null/undefined → 0', () => {
    expect(computeSttCostUsd('deepgram', 0)).toBe(0)
    expect(computeSttCostUsd('deepgram', -5)).toBe(0)
    expect(computeSttCostUsd('deepgram', Number.NaN)).toBe(0)
    expect(computeSttCostUsd('deepgram', null)).toBe(0)
    expect(computeSttCostUsd('deepgram', undefined)).toBe(0)
  })

  it('respeita override por env', () => {
    process.env.STT_COST_PER_MIN_DEEPGRAM = '0.01'
    expect(computeSttCostUsd('deepgram', 60)).toBeCloseTo(0.01, 6)
  })

  it('env inválida → cai no default', () => {
    process.env.STT_COST_PER_MIN_WHISPER = 'not-a-number'
    expect(computeSttCostUsd('whisper', 60)).toBeCloseTo(0.006, 6)
  })

  it('env negativa → cai no default (tarifa não pode ser < 0)', () => {
    process.env.STT_COST_PER_MIN_DEEPGRAM = '-1'
    expect(computeSttCostUsd('deepgram', 60)).toBeCloseTo(0.0043, 6)
  })
})
