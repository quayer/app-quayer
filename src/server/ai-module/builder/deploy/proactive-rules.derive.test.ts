/**
 * proactive-rules.derive — Vitest unit (F1, helper PURO).
 *
 * Tradução dos 3 toggles opt-in (`builderState.proactive`) nas regras de runtime
 * `ScheduledAutomation` + reconciliação por trigger. Zero IO — só lógica pura.
 *
 * O que estes testes pinam:
 *   1. deriveProactiveRules: cada toggle → triggers/audiences certos; undefined/false
 *      → [].
 *   2. reconcileProactiveRules: match-by-trigger (create/update/pause), duplicatas
 *      históricas convergem, nunca "delete".
 */

import { describe, it, expect } from 'vitest'

import {
  deriveProactiveRules,
  reconcileProactiveRules,
  type DerivedAutomation,
  type ExistingAutomation,
} from './proactive-rules.derive'

describe('deriveProactiveRules', () => {
  it('undefined → []', () => {
    expect(deriveProactiveRules(undefined)).toEqual([])
  })

  it('todos false → []', () => {
    expect(
      deriveProactiveRules({
        followUp: false,
        reminders: false,
        importantDates: false,
      }),
    ).toEqual([])
  })

  it('followUp → lead_idle (audience lead, cancelRules base, maxAttempts 1)', () => {
    const rules = deriveProactiveRules({
      followUp: true,
      reminders: false,
      importantDates: false,
    })
    expect(rules).toHaveLength(1)
    const rule = rules[0] as DerivedAutomation
    expect(rule.trigger).toBe('lead_idle')
    expect(rule.audience).toBe('lead')
    expect(rule.cancelRules).toEqual([
      'customer_replied',
      'opted_out',
      'human_took_over',
    ])
    expect(rule.maxAttempts).toBe(1)
    expect(rule.messageTemplate.length).toBeGreaterThan(0)
  })

  it('reminders → appointment_before + appointment_after (cancelRules incluem session_closed)', () => {
    const rules = deriveProactiveRules({
      followUp: false,
      reminders: true,
      importantDates: false,
    })
    expect(rules.map((r) => r.trigger).sort()).toEqual([
      'appointment_after',
      'appointment_before',
    ])
    expect(rules.every((r) => r.cancelRules.includes('session_closed'))).toBe(
      true,
    )
  })

  it('importantDates → birthday + renewal_due (audience customer)', () => {
    const rules = deriveProactiveRules({
      followUp: false,
      reminders: false,
      importantDates: true,
    })
    expect(rules.map((r) => r.trigger).sort()).toEqual([
      'birthday',
      'renewal_due',
    ])
    expect(rules.every((r) => r.audience === 'customer')).toBe(true)
  })

  it('todos ON → 5 regras com triggers distintos', () => {
    const rules = deriveProactiveRules({
      followUp: true,
      reminders: true,
      importantDates: true,
    })
    expect(rules).toHaveLength(5)
    const triggers = new Set(rules.map((r) => r.trigger))
    expect(triggers.size).toBe(5)
  })

  it('timing é serializável (objeto fechado, sem PII)', () => {
    const rules = deriveProactiveRules({
      followUp: true,
      reminders: true,
      importantDates: true,
    })
    for (const rule of rules) {
      expect(() => JSON.stringify(rule.timing)).not.toThrow()
      expect(typeof rule.timing).toBe('object')
    }
  })
})

describe('reconcileProactiveRules', () => {
  const ruleLeadIdle: DerivedAutomation = {
    trigger: 'lead_idle',
    audience: 'lead',
    timing: { hoursIdle: 24 },
    messageTemplate: 'x',
    cancelRules: ['customer_replied'],
    maxAttempts: 1,
  }

  it('DB vazio → todos os desired entram em toCreate', () => {
    const plan = reconcileProactiveRules([], [ruleLeadIdle])
    expect(plan.toCreate).toHaveLength(1)
    expect(plan.toUpdate).toHaveLength(0)
    expect(plan.toPause).toHaveLength(0)
  })

  it('match por trigger → toUpdate carimba o id', () => {
    const existing: ExistingAutomation[] = [
      { id: 'a-1', trigger: 'lead_idle', status: 'active' },
    ]
    const plan = reconcileProactiveRules(existing, [ruleLeadIdle])
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toUpdate[0]?.id).toBe('a-1')
    expect(plan.toCreate).toHaveLength(0)
  })

  it('desired vazio → tudo do DB entra em toPause (nunca delete)', () => {
    const existing: ExistingAutomation[] = [
      { id: 'a-1', trigger: 'lead_idle', status: 'active' },
      { id: 'a-2', trigger: 'birthday', status: 'active' },
    ]
    const plan = reconcileProactiveRules(existing, [])
    expect(plan.toPause.sort()).toEqual(['a-1', 'a-2'])
    expect(plan.toCreate).toHaveLength(0)
    expect(plan.toUpdate).toHaveLength(0)
  })

  it('duplicata histórica de trigger → 1 update + extras em toPause (converge)', () => {
    const existing: ExistingAutomation[] = [
      { id: 'a-1', trigger: 'lead_idle', status: 'active' },
      { id: 'a-2', trigger: 'lead_idle', status: 'active' },
    ]
    const plan = reconcileProactiveRules(existing, [ruleLeadIdle])
    expect(plan.toUpdate).toHaveLength(1)
    expect(plan.toUpdate[0]?.id).toBe('a-1')
    expect(plan.toPause).toEqual(['a-2'])
  })

  it('não muta os inputs', () => {
    const existing: ExistingAutomation[] = [
      { id: 'a-1', trigger: 'birthday', status: 'active' },
    ]
    const desired = [ruleLeadIdle]
    const existingCopy = JSON.parse(JSON.stringify(existing))
    const desiredCopy = JSON.parse(JSON.stringify(desired))
    reconcileProactiveRules(existing, desired)
    expect(existing).toEqual(existingCopy)
    expect(desired).toEqual(desiredCopy)
  })
})
