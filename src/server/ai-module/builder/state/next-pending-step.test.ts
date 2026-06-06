/**
 * Tests for the pure step-engine `nextPendingStep` (+ computeBlockers).
 *
 * Hermetic: no DB, no mocks — the function is pure. We drive it with crafted
 * BuilderState + StepEngineContext fixtures.
 *
 * Covers:
 *   - empty state → first step (project_identity)
 *   - each step gates on its required fields/sentinels (sequential advance)
 *   - completenessPct is monotonic as steps complete
 *   - isDeployReady only when all steps done AND all blockers clear
 *   - computeBlockers maps the 6 pre-deploy checks
 */

import { describe, it, expect } from 'vitest'
import {
  parseBuilderState,
  applyConfirmation,
  patchBuilderState,
  DEFAULT_BUILDER_STATE,
  type BuilderState,
  type ConfirmationKey,
} from '../cards/builder-state'
import {
  nextPendingStep,
  computeBlockers,
  QUAYER_STEPS,
  MIN_PROMPT_LENGTH,
} from './next-pending-step'
import type { StepEngineContext, StepId } from './readiness.types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A context where every live pre-deploy signal is satisfied (zero blockers). */
const READY_CTX: StepEngineContext = {
  hasActivePlan: true,
  byokProviderCount: 1,
  hasWhatsAppInstance: true,
  agentExists: true,
  promptLength: 500,
  latestVersionNumber: 1,
}

/** A context where nothing is satisfied (all 6 blockers fire). */
const EMPTY_CTX: StepEngineContext = {
  hasActivePlan: false,
  byokProviderCount: 0,
  hasWhatsAppInstance: false,
  agentExists: false,
  promptLength: 0,
  latestVersionNumber: null,
}

function freshState(): BuilderState {
  return parseBuilderState(null)
}

// Mark a confirmation sentinel true (pure).
function confirm(state: BuilderState, key: ConfirmationKey): BuilderState {
  return applyConfirmation(state, key)
}

/**
 * Walk the full happy journey, returning a fully-completed state. Used to test
 * the deploy-ready terminal condition + monotonic completeness.
 */
function fullyCompletedState(): BuilderState {
  let s = freshState()
  // Free-form fields. 'uazapi' is a canonical channel key (CHANNEL_KEYS);
  // 'book_appointment' makes the calendar step applicable.
  s = patchBuilderState(s, {
    project: { name: 'Clínica X', objective: 'Agendar consultas' },
    selectedChannelKey: 'uazapi',
    qualification: { action: 'book_appointment' },
  })
  // Every confirmation sentinel. 'silencedContacts' (G1, optional) is included so
  // the full-checklist `steps.every(done)` assertion stays green — its step.done
  // reads the raw sentinel regardless of applicability.
  const allSentinels: ConfirmationKey[] = [
    'source',
    'persona',
    'services',
    'hours',
    'pricing',
    'qualificationAction',
    'qualificationSteps',
    'team',
    'calendar',
    'activation',
    'silencedContacts',
    'tools',
    'channel',
    'agentApproved',
    'summary',
  ]
  for (const key of allSentinels) s = confirm(s, key)
  return s
}

// ---------------------------------------------------------------------------
// Empty state → first step
// ---------------------------------------------------------------------------

describe('nextPendingStep — empty state', () => {
  it('returns the first step (project_identity) for a fresh state', () => {
    const r = nextPendingStep(freshState(), READY_CTX)
    expect(r.step.id).toBe<StepId>('project_identity')
    expect(r.requiredMissing).toContain('project.name')
  })

  it('handles a null/garbage persisted state without throwing (backfill)', () => {
    expect(() => nextPendingStep(parseBuilderState(null), EMPTY_CTX)).not.toThrow()
    expect(() =>
      nextPendingStep(parseBuilderState('not json {{{'), EMPTY_CTX),
    ).not.toThrow()
    const r = nextPendingStep(parseBuilderState(undefined), EMPTY_CTX)
    expect(r.step.id).toBe<StepId>('project_identity')
  })

  it('completenessPct is 0 for the default empty state', () => {
    const r = nextPendingStep(DEFAULT_BUILDER_STATE, READY_CTX)
    expect(r.completenessPct).toBe(0)
  })

  it('is never deploy-ready when nothing is filled', () => {
    expect(nextPendingStep(freshState(), READY_CTX).isDeployReady).toBe(false)
    expect(nextPendingStep(freshState(), EMPTY_CTX).isDeployReady).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Sequential gating: each step unblocks only its successor
// ---------------------------------------------------------------------------

describe('nextPendingStep — sequential gating', () => {
  it('advances from project_identity to objective once name is set', () => {
    const s = patchBuilderState(freshState(), { project: { name: 'X' } })
    const r = nextPendingStep(s, READY_CTX)
    expect(r.step.id).toBe<StepId>('objective')
    expect(r.requiredMissing).toContain('project.objective')
  })

  it('skips optional source_ingestion and surfaces persona after name + objective', () => {
    const s = patchBuilderState(freshState(), {
      project: { name: 'X', objective: 'Y' },
    })
    const r = nextPendingStep(s, READY_CTX)
    // source_ingestion is optional → never occupies the active-step slot; the
    // first pending REQUIRED step is persona.
    expect(r.step.id).toBe<StepId>('persona')
  })

  it('still surfaces persona whether or not the optional source is confirmed', () => {
    let s = patchBuilderState(freshState(), {
      project: { name: 'X', objective: 'Y' },
    })
    s = confirm(s, 'source')
    const r = nextPendingStep(s, READY_CTX)
    expect(r.step.id).toBe<StepId>('persona')
    // The optional step shows as done in the checklist once confirmed.
    expect(r.steps.find((st) => st.id === 'source_ingestion')?.done).toBe(true)
  })

  it('qualification_action requires BOTH the action value and the sentinel', () => {
    let s = freshState()
    s = patchBuilderState(s, { project: { name: 'X', objective: 'Y' } })
    for (const k of ['source', 'persona', 'services', 'hours', 'pricing'] as ConfirmationKey[]) {
      s = confirm(s, k)
    }
    // Sentinel set but no action value → still on qualification_action.
    s = confirm(s, 'qualificationAction')
    let r = nextPendingStep(s, READY_CTX)
    expect(r.step.id).toBe<StepId>('qualification_action')
    expect(r.requiredMissing).toContain('qualification.action')

    // Now set the action value → advances.
    s = patchBuilderState(s, { qualification: { action: 'notify_team' } })
    r = nextPendingStep(s, READY_CTX)
    expect(r.step.id).toBe<StepId>('qualification_steps')
  })

  it('channel requires BOTH selectedChannelKey and the sentinel', () => {
    let s = fullyCompletedState()
    // Strip channel sentinel + key, keep everything else done. patchBuilderState
    // ignores `undefined` patch values (last-write-wins only for defined ones),
    // so we clear the key via an explicit spread.
    s = { ...s, selectedChannelKey: undefined }
    s = { ...s, confirmations: { ...s.confirmations, channel: false } }
    const r = nextPendingStep(s, READY_CTX)
    expect(r.step.id).toBe<StepId>('channel')
    expect(r.requiredMissing).toEqual(
      expect.arrayContaining(['selectedChannelKey', 'confirmations.channel']),
    )
  })

  it('the last pending step before completion is summary', () => {
    let s = fullyCompletedState()
    s = { ...s, confirmations: { ...s.confirmations, summary: false } }
    const r = nextPendingStep(s, READY_CTX)
    expect(r.step.id).toBe<StepId>('summary')
  })
})

// ---------------------------------------------------------------------------
// In-flight source ingestion takes over the active-step slot
// ---------------------------------------------------------------------------

describe('nextPendingStep — in-flight source ingestion', () => {
  it('surfaces source_ingestion while a pasted source is still settling (no proposal)', () => {
    const s = patchBuilderState(freshState(), {
      sourceIngestion: {
        sources: [{ value: 'https://acme.com', type: 'url', status: 'pending' }],
      },
    })
    const r = nextPendingStep(s, READY_CTX)
    // Even though project_identity is the first required step, the in-flight
    // source takes over so the source_progress card surfaces immediately.
    expect(r.step.id).toBe<StepId>('source_ingestion')
    expect(r.requiredMissing).toEqual([])
  })

  it('keeps source_ingestion surfaced once a proposal is ready to accept', () => {
    const s = patchBuilderState(freshState(), {
      sourceIngestion: {
        sources: [{ value: 'https://acme.com', type: 'url', status: 'ready' }],
        proposed: { businessName: 'Acme' },
      },
    })
    const r = nextPendingStep(s, READY_CTX)
    expect(r.step.id).toBe<StepId>('source_ingestion')
  })

  it('stops surfacing source_ingestion once accepted (confirmations.source)', () => {
    let s = patchBuilderState(freshState(), {
      project: { name: 'X', objective: 'Y' },
      sourceIngestion: {
        sources: [{ value: 'https://acme.com', type: 'url', status: 'ready' }],
        proposed: { businessName: 'Acme' },
      },
    })
    s = confirm(s, 'source')
    const r = nextPendingStep(s, READY_CTX)
    expect(r.step.id).toBe<StepId>('persona')
  })

  it('does NOT surface source_ingestion when all sources settled with no proposal (no dead-end)', () => {
    const s = patchBuilderState(freshState(), {
      project: { name: 'X', objective: 'Y' },
      sourceIngestion: {
        sources: [{ value: 'https://acme.com', type: 'url', status: 'error' }],
      },
    })
    const r = nextPendingStep(s, READY_CTX)
    // Settled (error) + no proposal → not active → normal flow surfaces persona.
    expect(r.step.id).toBe<StepId>('persona')
  })
})

// ---------------------------------------------------------------------------
// Completeness monotonicity
// ---------------------------------------------------------------------------

describe('nextPendingStep — completenessPct', () => {
  it('increases monotonically as steps complete, ending at 100', () => {
    let s = freshState()
    let prev = nextPendingStep(s, READY_CTX).completenessPct
    expect(prev).toBe(0)

    // Fill the two free-form steps first.
    s = patchBuilderState(s, { project: { name: 'X', objective: 'Y' } })
    let pct = nextPendingStep(s, READY_CTX).completenessPct
    expect(pct).toBeGreaterThanOrEqual(prev)
    prev = pct

    // Confirm sentinels one by one — never decreases.
    const order: ConfirmationKey[] = [
      'source',
      'persona',
      'services',
      'hours',
      'pricing',
      'qualificationAction',
      'qualificationSteps',
      'team',
      'calendar',
      'activation',
      'silencedContacts',
      'tools',
      'channel',
      'agentApproved',
      'summary',
    ]
    s = patchBuilderState(s, {
      selectedChannelKey: 'uazapi',
      qualification: { action: 'lead_only' },
    })
    for (const key of order) {
      s = confirm(s, key)
      pct = nextPendingStep(s, READY_CTX).completenessPct
      expect(pct).toBeGreaterThanOrEqual(prev)
      prev = pct
    }
    expect(prev).toBe(100)
  })

  it('100% completeness when every applicable step is done (full checklist surfaced)', () => {
    const r = nextPendingStep(fullyCompletedState(), READY_CTX)
    // The full ordered checklist is always surfaced (non-applicable steps still
    // appear, marked done), even though completeness ratios over applicable steps.
    expect(r.steps).toHaveLength(QUAYER_STEPS.length)
    expect(r.steps.every((step) => step.done)).toBe(true)
    expect(r.completenessPct).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Deploy readiness gates on blockers
// ---------------------------------------------------------------------------

describe('nextPendingStep — isDeployReady', () => {
  it('is true only when every step done AND no blockers', () => {
    const r = nextPendingStep(fullyCompletedState(), READY_CTX)
    expect(r.blockers).toHaveLength(0)
    expect(r.isDeployReady).toBe(true)
  })

  it('is false when all steps done but a blocker remains', () => {
    const noPlan: StepEngineContext = { ...READY_CTX, hasActivePlan: false }
    const r = nextPendingStep(fullyCompletedState(), noPlan)
    expect(r.isDeployReady).toBe(false)
    expect(r.blockers.map((b) => b.check)).toContain('plan')
  })

  it('is false when blockers clear but steps remain', () => {
    const r = nextPendingStep(freshState(), READY_CTX)
    expect(r.blockers).toHaveLength(0)
    expect(r.isDeployReady).toBe(false)
  })

  it('reaches isDeployReady WITHOUT confirming the optional source step', () => {
    // Start from a fully-completed state, then un-confirm the optional source.
    let s = fullyCompletedState()
    s = { ...s, confirmations: { ...s.confirmations, source: false } }

    const r = nextPendingStep(s, READY_CTX)
    // The optional step is NOT done...
    expect(r.steps.find((st) => st.id === 'source_ingestion')?.done).toBe(false)
    // ...yet the journey is complete and deploy-ready (optional never blocks).
    expect(r.blockers).toHaveLength(0)
    expect(r.isDeployReady).toBe(true)
    // And it never occupies the active-step slot — the terminal ask is summary.
    expect(r.step.id).toBe<StepId>('summary')
  })
})

// ---------------------------------------------------------------------------
// Action-gated steps: team (notify_team) and calendar (book_appointment)
// ---------------------------------------------------------------------------

describe('nextPendingStep — team/calendar gated by qualification.action', () => {
  /** All required sentinels EXCEPT team + calendar, with a given action. */
  function stateUpToActivation(
    action: 'notify_team' | 'book_appointment' | 'lead_only',
  ): BuilderState {
    let s = patchBuilderState(freshState(), {
      project: { name: 'X', objective: 'Y' },
      selectedChannelKey: 'uazapi',
      qualification: { action },
    })
    for (const k of [
      'persona',
      'services',
      'hours',
      'pricing',
      'qualificationAction',
      'qualificationSteps',
      'activation',
      'tools',
      'channel',
      'agentApproved',
      'summary',
    ] as ConfirmationKey[]) {
      s = confirm(s, k)
    }
    return s
  }

  it('lead_only: team + calendar are non-applicable → deploy-ready without confirming either', () => {
    const s = stateUpToActivation('lead_only')
    const r = nextPendingStep(s, READY_CTX)
    expect(r.steps.find((st) => st.id === 'team')?.done).toBe(true)
    expect(r.steps.find((st) => st.id === 'calendar')?.done).toBe(true)
    expect(r.isDeployReady).toBe(true)
  })

  it('notify_team: team is required (surfaced) but calendar is non-applicable', () => {
    const s = stateUpToActivation('notify_team')
    const r = nextPendingStep(s, READY_CTX)
    // calendar never blocks for notify_team...
    expect(r.steps.find((st) => st.id === 'calendar')?.done).toBe(true)
    // ...but team must be confirmed → it gates and is the surfaced step.
    expect(r.steps.find((st) => st.id === 'team')?.done).toBe(false)
    expect(r.step.id).toBe<StepId>('team')
    expect(r.isDeployReady).toBe(false)

    // Confirming team clears it.
    const r2 = nextPendingStep(confirm(s, 'team'), READY_CTX)
    expect(r2.isDeployReady).toBe(true)
  })

  it('book_appointment: calendar is required (surfaced) but team is non-applicable', () => {
    const s = stateUpToActivation('book_appointment')
    const r = nextPendingStep(s, READY_CTX)
    expect(r.steps.find((st) => st.id === 'team')?.done).toBe(true)
    expect(r.steps.find((st) => st.id === 'calendar')?.done).toBe(false)
    expect(r.step.id).toBe<StepId>('calendar')
    expect(r.isDeployReady).toBe(false)

    const r2 = nextPendingStep(confirm(s, 'calendar'), READY_CTX)
    expect(r2.isDeployReady).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// G1 — silenced_contacts: OPTIONAL + applies-gated by activation.mode
// ---------------------------------------------------------------------------

describe('nextPendingStep — silenced_contacts (optional, applies-gated)', () => {
  it('reaches isDeployReady WITHOUT confirming the optional silenced_contacts step', () => {
    // Start fully complete, then un-confirm the optional silenced_contacts step
    // AND force the applicable mode so it WOULD count if it were required.
    let s = fullyCompletedState()
    s = patchBuilderState(s, {
      activation: { mode: 'all_except_blacklist' },
    })
    s = { ...s, confirmations: { ...s.confirmations, silencedContacts: false } }

    const r = nextPendingStep(s, READY_CTX)
    // The optional step is NOT done...
    expect(r.steps.find((st) => st.id === 'silenced_contacts')?.done).toBe(false)
    // ...yet the journey is complete and deploy-ready (optional never blocks).
    expect(r.blockers).toHaveLength(0)
    expect(r.isDeployReady).toBe(true)
  })

  it('is non-applicable when activation.mode !== all_except_blacklist (excluded from the ratio)', () => {
    // mode is unset in fullyCompletedState → silenced_contacts does not apply, so
    // it neither inflates nor blocks completeness; the journey is still 100%.
    let s = fullyCompletedState()
    s = { ...s, confirmations: { ...s.confirmations, silencedContacts: false } }
    const r = nextPendingStep(s, READY_CTX)
    // Non-applicable + unconfirmed → never surfaces, still deploy-ready and 100%.
    expect(r.step.id).not.toBe<StepId>('silenced_contacts')
    expect(r.isDeployReady).toBe(true)
    expect(r.completenessPct).toBe(100)
  })

  it('G1 surfacing: takes over the active step (nudge) when applicable + pending, then yields once acknowledged', () => {
    // Fully complete + applicable mode + optional step pending → it surfaces as the
    // active step (over the terminal summary), like the source override.
    let s = fullyCompletedState()
    s = patchBuilderState(s, { activation: { mode: 'all_except_blacklist' } })
    s = { ...s, confirmations: { ...s.confirmations, silencedContacts: false } }

    let r = nextPendingStep(s, READY_CTX)
    expect(r.step.id).toBe<StepId>('silenced_contacts')
    expect(r.requiredMissing).toHaveLength(0) // optional → no required fields
    expect(r.isDeployReady).toBe(true) // surfacing it never blocks deploy

    // Once acknowledged (even an empty list via "não tenho ninguém"), it yields to
    // the terminal summary and never surfaces again.
    s = confirm(s, 'silencedContacts')
    r = nextPendingStep(s, READY_CTX)
    expect(r.step.id).toBe<StepId>('summary')
  })

  it('does not jump ahead: silenced_contacts only surfaces after activation is confirmed', () => {
    // Pre-activation journey + the applicable mode, activation NOT yet confirmed.
    let s = patchBuilderState(freshState(), {
      project: { name: 'X', objective: 'Y' },
      selectedChannelKey: 'uazapi',
      qualification: { action: 'lead_only' },
      activation: { mode: 'all_except_blacklist' },
    })
    for (const k of [
      'persona',
      'services',
      'hours',
      'pricing',
      'qualificationAction',
      'qualificationSteps',
    ] as ConfirmationKey[]) {
      s = confirm(s, k)
    }
    // activation pending → the optional card does NOT pre-empt it.
    const before = nextPendingStep(s, READY_CTX)
    expect(before.step.id).toBe<StepId>('activation')

    // After confirming activation, the optional silenced card surfaces as the nudge
    // (over the next required step, tools).
    const after = nextPendingStep(confirm(s, 'activation'), READY_CTX)
    expect(after.step.id).toBe<StepId>('silenced_contacts')
  })
})

// ---------------------------------------------------------------------------
// Channel key is validated against the canonical catálogo (CHANNEL_KEYS)
// ---------------------------------------------------------------------------

describe('nextPendingStep — channel key validation', () => {
  it('a bogus channel key does not satisfy the channel gate', () => {
    let s = fullyCompletedState()
    // Confirmed sentinel but a key outside CHANNEL_KEYS → channel not done.
    s = { ...s, selectedChannelKey: 'whatsapp' }
    const r = nextPendingStep(s, READY_CTX)
    expect(r.steps.find((st) => st.id === 'channel')?.done).toBe(false)
    expect(r.step.id).toBe<StepId>('channel')
    expect(r.requiredMissing).toContain('selectedChannelKey')
  })

  it('a canonical channel key (uazapi) satisfies the channel gate', () => {
    const r = nextPendingStep(fullyCompletedState(), READY_CTX)
    expect(r.steps.find((st) => st.id === 'channel')?.done).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// computeBlockers — the 6 pre-deploy checks
// ---------------------------------------------------------------------------

describe('computeBlockers', () => {
  it('returns all six blockers for a fully-empty context', () => {
    const blockers = computeBlockers(freshState(), EMPTY_CTX)
    const checks = blockers.map((b) => b.check).sort()
    expect(checks).toEqual(
      ['agent', 'byok', 'channel', 'plan', 'prompt', 'version'].sort(),
    )
  })

  it('returns no blockers when every signal is satisfied', () => {
    expect(computeBlockers(freshState(), READY_CTX)).toHaveLength(0)
  })

  it('plan blocker redirects to /conta', () => {
    const blockers = computeBlockers(freshState(), { ...READY_CTX, hasActivePlan: false })
    const plan = blockers.find((b) => b.check === 'plan')
    expect(plan?.redirect).toBe('/conta')
  })

  it('byok blocker redirects to /integracoes (real BYOK page)', () => {
    const blockers = computeBlockers(freshState(), { ...READY_CTX, byokProviderCount: 0 })
    const byok = blockers.find((b) => b.check === 'byok')
    expect(byok?.redirect).toBe('/integracoes')
  })

  it('prompt blocker fires when promptLength is below the floor', () => {
    const ctx: StepEngineContext = { ...READY_CTX, promptLength: MIN_PROMPT_LENGTH - 1 }
    const blockers = computeBlockers(freshState(), ctx)
    expect(blockers.map((b) => b.check)).toContain('prompt')
  })

  it('version blocker fires when latestVersionNumber is null', () => {
    const ctx: StepEngineContext = { ...READY_CTX, latestVersionNumber: null }
    const blockers = computeBlockers(freshState(), ctx)
    expect(blockers.map((b) => b.check)).toContain('version')
  })

  it('channel blocker fires when no WhatsApp instance exists', () => {
    const ctx: StepEngineContext = { ...READY_CTX, hasWhatsAppInstance: false }
    const blockers = computeBlockers(freshState(), ctx)
    expect(blockers.map((b) => b.check)).toContain('channel')
  })
})

// ---------------------------------------------------------------------------
// Field ownership surface
// ---------------------------------------------------------------------------

describe('nextPendingStep — fieldOwnership', () => {
  it('marks free-form vs card-owned fields', () => {
    const r = nextPendingStep(freshState(), READY_CTX)
    expect(r.fieldOwnership['project.name']).toBe('livre')
    expect(r.fieldOwnership['persona.greeting']).toBe('card')
    expect(r.fieldOwnership['selectedChannelKey']).toBe('card')
  })
})
