/**
 * Tests for `journeyVersion` (Jornada v2 — plan §2.2 item 1, T04/T57).
 *
 * `journeyVersion` is the PER-PROJECT rollout key carried inside the BuilderState
 * JSONB (no new column on BuilderProject). The rules under test:
 *   - a legacy state WITHOUT the field backfills to journeyVersion 1
 *   - parsing `{}` (and null/undefined) yields the default 1
 *   - an explicit `2` is preserved; an explicit `1` stays 1
 *   - an out-of-contract value (anything that is not literally 1 or 2) falls back
 *     to the default 1 (parseBuilderState NEVER throws)
 *
 * Purely a parse contract — no DB, no IO.
 */

import { describe, it, expect } from 'vitest'
import {
  parseBuilderState,
  DEFAULT_BUILDER_STATE,
} from './builder-state'

describe('parseBuilderState — journeyVersion default + legacy backfill', () => {
  it('parses {} to journeyVersion 1 (the default)', () => {
    expect(parseBuilderState({}).journeyVersion).toBe(1)
  })

  it('backfills a LEGACY JSONB state without journeyVersion to 1', () => {
    // A realistic legacy row that predates the rollout key.
    const legacy = {
      project: { name: 'Barbearia X', objective: 'Atender clientes' },
      persona: { name: 'Ana', tone: 'amigável' },
      confirmations: { persona: true, services: true },
    }
    expect(parseBuilderState(legacy).journeyVersion).toBe(1)
  })

  it('backfills a legacy JSONB STRING (persisted text) without journeyVersion to 1', () => {
    const legacyJson = JSON.stringify({
      project: { name: 'Loja Y' },
      confirmations: {},
    })
    expect(parseBuilderState(legacyJson).journeyVersion).toBe(1)
  })

  it('DEFAULT_BUILDER_STATE carries journeyVersion 1', () => {
    expect(DEFAULT_BUILDER_STATE.journeyVersion).toBe(1)
  })

  it('null / undefined backfill to journeyVersion 1', () => {
    expect(parseBuilderState(null).journeyVersion).toBe(1)
    expect(parseBuilderState(undefined).journeyVersion).toBe(1)
  })
})

describe('parseBuilderState — journeyVersion explicit values', () => {
  it('preserves an explicit journeyVersion 2', () => {
    expect(parseBuilderState({ journeyVersion: 2 }).journeyVersion).toBe(2)
  })

  it('preserves an explicit journeyVersion 2 inside a populated state', () => {
    const state = {
      journeyVersion: 2,
      project: { name: 'Estúdio Z' },
      confirmations: { persona: true },
    }
    expect(parseBuilderState(state).journeyVersion).toBe(2)
  })

  it('keeps an explicit journeyVersion 1 as 1', () => {
    expect(parseBuilderState({ journeyVersion: 1 }).journeyVersion).toBe(1)
  })

  it('preserves journeyVersion 2 when parsing a persisted JSON string', () => {
    const json = JSON.stringify({ journeyVersion: 2, confirmations: {} })
    expect(parseBuilderState(json).journeyVersion).toBe(2)
  })
})

describe('parseBuilderState — journeyVersion out-of-contract falls back to 1', () => {
  it.each([0, 3, -1, 1.5, 99])(
    'falls back to 1 for the invalid numeric value %s',
    (value) => {
      expect(parseBuilderState({ journeyVersion: value }).journeyVersion).toBe(1)
    },
  )

  it.each([
    ['string "2"', '2'],
    ['null', null],
    ['boolean true', true],
    ['object', { v: 2 }],
  ])('falls back to 1 for a non-numeric journeyVersion (%s)', (_label, value) => {
    expect(
      parseBuilderState({ journeyVersion: value }).journeyVersion,
    ).toBe(1)
  })
})

describe('confirmations — v2 sentinels (T05) default false', () => {
  const V2_SENTINELS = [
    'businessIdentity',
    'testDrive',
    'knowledge',
    'media',
    'publishedNextSteps',
    'channelPlatform',
    'whatsappConnectedOnce',
  ] as const

  it('an empty {} resolves all 7 v2 sentinels to false', () => {
    const { confirmations } = parseBuilderState({})
    for (const key of V2_SENTINELS) {
      expect(confirmations[key]).toBe(false)
    }
  })

  it('DEFAULT_BUILDER_STATE carries all 7 v2 sentinels false', () => {
    for (const key of V2_SENTINELS) {
      expect(DEFAULT_BUILDER_STATE.confirmations[key]).toBe(false)
    }
  })

  it('backfills the 7 sentinels false on a legacy state without them', () => {
    const legacy = { confirmations: { persona: true } }
    const { confirmations } = parseBuilderState(legacy)
    expect(confirmations.persona).toBe(true)
    for (const key of V2_SENTINELS) {
      expect(confirmations[key]).toBe(false)
    }
  })
})

describe('channel namespace (T86) — optional, no default', () => {
  it('an empty {} resolves channel to undefined', () => {
    expect(parseBuilderState({}).channel).toBeUndefined()
  })

  it('DEFAULT_BUILDER_STATE has no channel', () => {
    expect(DEFAULT_BUILDER_STATE.channel).toBeUndefined()
  })

  it('a legacy JSONB state without channel parses fine (channel undefined)', () => {
    const legacy = { project: { name: 'Loja' }, confirmations: {} }
    expect(parseBuilderState(legacy).channel).toBeUndefined()
  })

  it('preserves a populated channel namespace', () => {
    const parsed = parseBuilderState({
      channel: { platforms: ['whatsapp', 'instagram'], whatsappMode: 'qr' },
    })
    expect(parsed.channel).toEqual({
      platforms: ['whatsapp', 'instagram'],
      whatsappMode: 'qr',
    })
  })

  it('drops an out-of-contract channel without throwing (NEVER throws contract)', () => {
    // Invalid platform value → the whole state would fail safeParse, so
    // parseBuilderState falls back to DEFAULT (channel undefined).
    const parsed = parseBuilderState({ channel: { platforms: ['telegram'] } })
    expect(parsed.channel).toBeUndefined()
  })
})
