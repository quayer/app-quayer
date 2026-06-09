/**
 * Tests for `migrateLegacyHandoff` (Onda 2 — atomic refactor).
 *
 * The function upgrades a LEGACY persisted state (with `qualification` + `team`
 * and the 4 old confirmation sentinels) into the unified `handoff` shape BEFORE
 * `safeParse` (which would otherwise drop the unknown legacy fields). It is pure
 * and never throws.
 *
 * Mapping contract (spec Q1-Q3):
 *   - notify_team + members  → mode 'roleta'
 *   - notify_team, no members → mode 'solo'
 *   - book_appointment       → mode 'solo' + alsoSchedule = true
 *   - lead_only              → mode 'solo'
 *   - preserves steps, roster, departmentName/Type, openingMessage
 *   - inherits confirmation: ANY legacy confirmation true → handoff: true
 *   - an already-new state (has `handoff`) passes through untouched
 */

import { describe, it, expect } from 'vitest'
import { migrateLegacyHandoff } from '../cards/builder-state'

// ---------------------------------------------------------------------------
// Narrowing helpers (the function returns `unknown` by contract)
// ---------------------------------------------------------------------------

function asObject(v: unknown): Record<string, unknown> {
  expect(v).toBeTypeOf('object')
  expect(v).not.toBeNull()
  return v as Record<string, unknown>
}

function handoffOf(v: unknown): Record<string, unknown> {
  return asObject(asObject(v).handoff)
}

function confirmationsOf(v: unknown): Record<string, unknown> {
  return asObject(asObject(v).confirmations)
}

// ---------------------------------------------------------------------------
// notify_team → roleta / solo (depending on roster)
// ---------------------------------------------------------------------------

describe('migrateLegacyHandoff — notify_team', () => {
  it('notify_team WITH members → mode "roleta" (roster preserved)', () => {
    const legacy = {
      qualification: { action: 'notify_team', steps: ['Nome?', 'Serviço?'] },
      team: {
        members: [
          { name: 'João', whatsapp: '+5511988887777', position: 0 },
          { name: 'Maria', position: 1 },
        ],
      },
      confirmations: {},
    }
    const handoff = handoffOf(migrateLegacyHandoff(legacy))
    expect(handoff.mode).toBe('roleta')
    expect(handoff.steps).toEqual(['Nome?', 'Serviço?'])
    expect(handoff.members).toHaveLength(2)
    expect(handoff.alsoSchedule).toBe(false)
  })

  it('notify_team WITHOUT members → mode "solo"', () => {
    const legacy = {
      qualification: { action: 'notify_team', steps: [] },
      team: { members: [] },
      confirmations: {},
    }
    const handoff = handoffOf(migrateLegacyHandoff(legacy))
    expect(handoff.mode).toBe('solo')
    expect(handoff.members).toEqual([])
  })

  it('notify_team with NO team object at all → mode "solo"', () => {
    const legacy = {
      qualification: { action: 'notify_team' },
      confirmations: {},
    }
    const handoff = handoffOf(migrateLegacyHandoff(legacy))
    expect(handoff.mode).toBe('solo')
    expect(handoff.members).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// book_appointment → solo + alsoSchedule
// ---------------------------------------------------------------------------

describe('migrateLegacyHandoff — book_appointment', () => {
  it('book_appointment → mode "solo" + alsoSchedule = true', () => {
    const legacy = {
      qualification: { action: 'book_appointment', steps: ['Quando?'] },
      confirmations: {},
    }
    const handoff = handoffOf(migrateLegacyHandoff(legacy))
    expect(handoff.mode).toBe('solo')
    expect(handoff.alsoSchedule).toBe(true)
    expect(handoff.steps).toEqual(['Quando?'])
  })
})

// ---------------------------------------------------------------------------
// lead_only → solo
// ---------------------------------------------------------------------------

describe('migrateLegacyHandoff — lead_only', () => {
  it('lead_only → mode "solo" (alsoSchedule stays false)', () => {
    const legacy = {
      qualification: { action: 'lead_only' },
      confirmations: {},
    }
    const handoff = handoffOf(migrateLegacyHandoff(legacy))
    expect(handoff.mode).toBe('solo')
    expect(handoff.alsoSchedule).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Preserves department metadata + openingMessage
// ---------------------------------------------------------------------------

describe('migrateLegacyHandoff — field preservation', () => {
  it('preserves steps, departmentName/Type and openingMessage from team', () => {
    const legacy = {
      qualification: { action: 'notify_team', steps: ['Pergunta A'] },
      team: {
        departmentName: 'Vendas',
        departmentType: 'comercial',
        openingMessage: 'Oi, sou o atendente!',
        members: [{ name: 'João', position: 0 }],
      },
      confirmations: {},
    }
    const handoff = handoffOf(migrateLegacyHandoff(legacy))
    expect(handoff.steps).toEqual(['Pergunta A'])
    expect(handoff.departmentName).toBe('Vendas')
    expect(handoff.departmentType).toBe('comercial')
    expect(handoff.openingMessage).toBe('Oi, sou o atendente!')
  })
})

// ---------------------------------------------------------------------------
// Confirmation inheritance: ANY legacy true → handoff: true
// ---------------------------------------------------------------------------

describe('migrateLegacyHandoff — confirmation inheritance', () => {
  const legacyBase = {
    qualification: { action: 'lead_only' },
    confirmations: {} as Record<string, boolean>,
  }

  it.each([
    'qualificationAction',
    'qualificationSteps',
    'team',
    'handoffPairing',
  ])('inherits handoff: true when legacy confirmation "%s" is true', (key) => {
    const legacy = {
      ...legacyBase,
      confirmations: { [key]: true },
    }
    expect(confirmationsOf(migrateLegacyHandoff(legacy)).handoff).toBe(true)
  })

  it('handoff: false when no legacy confirmation was set', () => {
    const legacy = { ...legacyBase, confirmations: {} }
    expect(confirmationsOf(migrateLegacyHandoff(legacy)).handoff).toBe(false)
  })

  it('drops the legacy qualification/team objects after migrating', () => {
    const migrated = asObject(
      migrateLegacyHandoff({
        qualification: { action: 'notify_team' },
        team: { members: [] },
        confirmations: {},
      }),
    )
    expect(migrated.qualification).toBeUndefined()
    expect(migrated.team).toBeUndefined()
    expect(migrated.handoff).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Already-new + no-op pass-through
// ---------------------------------------------------------------------------

describe('migrateLegacyHandoff — pass-through (no migration)', () => {
  it('returns an already-new state (with handoff) untouched', () => {
    const already = {
      handoff: { mode: 'roleta', alsoSchedule: false, steps: [], members: [] },
      confirmations: { handoff: true },
    }
    // Reference-equal: the function returns the input verbatim.
    expect(migrateLegacyHandoff(already)).toBe(already)
  })

  it('returns the input unchanged when there is nothing legacy to migrate', () => {
    const noLegacy = { project: { name: 'X' }, confirmations: {} }
    expect(migrateLegacyHandoff(noLegacy)).toBe(noLegacy)
  })

  it('does not throw on non-object input (null / primitive) and returns it as-is', () => {
    expect(migrateLegacyHandoff(null)).toBeNull()
    expect(migrateLegacyHandoff('garbage')).toBe('garbage')
    expect(migrateLegacyHandoff(undefined)).toBeUndefined()
  })
})
