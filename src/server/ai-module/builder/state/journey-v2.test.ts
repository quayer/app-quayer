/**
 * Tests for the pure Journey v2 engine `nextPendingStepV2` (T61, plan §7.1).
 *
 * Hermetic: no DB, no mocks — the engine is pure. We drive it with crafted
 * `BuilderState` + `StepEngineContextV2` fixtures (the v1 ctx plus the three v2
 * live signals the resolver will populate).
 *
 * Covers (T61 / plan §7.1):
 *   - the 4 QUAYER_PHASES surface in order (Conhecer → Revisar → Testar → Lançar);
 *   - `business_identity` satisfied by `confirmations.source` (the FR-03 equiv path);
 *   - `test_drive` flipped by BOTH `tested` and `skip` (the soft gate sentinel);
 *   - `whatsapp_connect` done ONLY via `ctx.hasConnectedWhatsAppInstance` OR the
 *     `whatsappConnectedOnce` sentinel-mirror — a DISCONNECTED connection (ctx false,
 *     sentinel false) does NOT complete it; once flipped it stays done with ctx false
 *     (monotonicity, FR-30);
 *   - the conditional channel steps surface by selected platform (no whatsapp →
 *     `whatsapp_connect` never surfaces; instagram selected → `instagram_connect`
 *     surfaces) and enter the completeness denominator only when selected;
 *   - `published_next_steps` is the terminal step: it never pre-empts a pending
 *     gating step on its own, the live-deployment override surfaces it (FR-16), and
 *     it never gates `isDeployReady`;
 *   - completeness is monotonic;
 *   - `isDeployReady` requires zero blockers (reuses `computeBlockers`);
 *   - the 7 new v2 sentinels default false.
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
import { nextPendingStepV2, QUAYER_PHASES, type StepEngineContextV2 } from './journey-v2'
import type { PhaseId, StepId } from './readiness.types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A v2 context where every pre-deploy + channel/deployment signal is satisfied. */
const READY_CTX: StepEngineContextV2 = {
  hasActivePlan: true,
  byokProviderCount: 1,
  hasWhatsAppInstance: true,
  agentExists: true,
  promptLength: 500,
  latestVersionNumber: 1,
  hasLiveDeployment: false,
  hasConnectedWhatsAppInstance: true,
  hasConnectedInstagramInstance: true,
}

/** A v2 context where nothing is satisfied (all 6 v1 blockers fire; no channel/deploy). */
const EMPTY_CTX: StepEngineContextV2 = {
  hasActivePlan: false,
  byokProviderCount: 0,
  hasWhatsAppInstance: false,
  agentExists: false,
  promptLength: 0,
  latestVersionNumber: null,
  hasLiveDeployment: false,
  hasConnectedWhatsAppInstance: false,
  hasConnectedInstagramInstance: false,
}

/** A v2 state (journeyVersion 2) for a fresh project. */
function freshV2State(): BuilderState {
  return patchBuilderState(parseBuilderState(null), { journeyVersion: 2 })
}

/** Mark a confirmation sentinel true (pure). */
function confirm(state: BuilderState, key: ConfirmationKey): BuilderState {
  return applyConfirmation(state, key)
}

/** Select one or more channel platforms in the builderState (mirrors the card). */
function selectPlatforms(
  state: BuilderState,
  platforms: Array<'whatsapp' | 'instagram'>,
  whatsappMode?: 'qr' | 'cloud',
): BuilderState {
  return { ...state, channel: { platforms, whatsappMode } }
}

/**
 * Drive the journey to the boundary just before a given gating step, with WhatsApp
 * picked as the (single) channel. Stops short of confirming `from` so the caller can
 * assert that step is the surfaced one. Sentinels confirmed are exactly the gating
 * predecessors of `from` in phase order.
 */
function stateUpTo(step: StepId): BuilderState {
  // The ordered list of GATING sentinels (skipping optional/terminal + the
  // conditional connect steps which gate on platform/ctx, not a plain sentinel).
  const order: Array<{ id: StepId; confirm?: ConfirmationKey; free?: boolean }> = [
    { id: 'objective', free: true },
    { id: 'business_identity', confirm: 'businessIdentity' },
    { id: 'agent_review', confirm: 'persona' }, // composite — see below
    { id: 'agent_approval', confirm: 'agentApproved' },
    { id: 'test_drive', confirm: 'testDrive' },
    { id: 'activation', confirm: 'activation' },
    { id: 'channel_platform', confirm: 'channelPlatform' },
    { id: 'whatsapp_connect' }, // gated by ctx/sentinel + platform
    { id: 'summary', confirm: 'summary' },
  ]

  let s = freshV2State()
  // WhatsApp is the selected channel so whatsapp_connect is applicable.
  s = selectPlatforms(s, ['whatsapp'], 'qr')
  for (const entry of order) {
    if (entry.id === step) break
    if (entry.free) {
      s = patchBuilderState(s, { project: { name: 'X', objective: 'Y' } })
    } else if (entry.id === 'agent_review') {
      // Composite: persona + services + hours.
      s = confirm(s, 'persona')
      s = confirm(s, 'services')
      s = confirm(s, 'hours')
    } else if (entry.id === 'whatsapp_connect') {
      // Satisfied via the sentinel-mirror so we can step past it deterministically.
      s = confirm(s, 'whatsappConnectedOnce')
    } else if (entry.confirm) {
      s = confirm(s, entry.confirm)
    }
  }
  return s
}

/**
 * A v2 journey (WhatsApp channel) with every GATING step done — the optional steps
 * (`source_ingestion`/`knowledge`/`media`) and the terminal `published_next_steps`
 * are intentionally left pending. Used to assert the deploy-ready terminal condition
 * (optionals never block) + the terminal-override surfacing.
 */
function fullyCompletedV2State(): BuilderState {
  let s = freshV2State()
  s = patchBuilderState(s, { project: { name: 'X', objective: 'Y' } })
  s = selectPlatforms(s, ['whatsapp'], 'qr')
  const sentinels: ConfirmationKey[] = [
    'businessIdentity',
    'persona',
    'services',
    'hours',
    'agentApproved',
    'testDrive',
    'activation',
    'channelPlatform',
    'whatsappConnectedOnce',
    'summary',
  ]
  for (const key of sentinels) s = confirm(s, key)
  return s
}

/**
 * Every APPLICABLE step done (WhatsApp channel) — gating AND the optionals
 * (`source`/`knowledge`/`media`) AND the terminal `published_next_steps` acked. Used
 * to assert completeness hits 100 (the v2 ratio spans ALL applicable steps, like v1).
 */
function everyStepDoneV2State(): BuilderState {
  let s = fullyCompletedV2State()
  for (const key of ['source', 'knowledge', 'media', 'publishedNextSteps'] as ConfirmationKey[]) {
    s = confirm(s, key)
  }
  return s
}

// ---------------------------------------------------------------------------
// Phase ordering
// ---------------------------------------------------------------------------

describe('nextPendingStepV2 — phase ordering', () => {
  it('exposes exactly the 4 QUAYER_PHASES in order', () => {
    const ids = QUAYER_PHASES.map((p) => p.id)
    expect(ids).toEqual<PhaseId[]>(['conhecer', 'revisar', 'testar', 'lancar'])
  })

  it('a fresh v2 state surfaces objective in the Conhecer phase', () => {
    const r = nextPendingStepV2(freshV2State(), READY_CTX)
    expect(r.step.id).toBe<StepId>('objective')
    expect(r.journey?.version).toBe(2)
    expect(r.journey?.activePhaseId).toBe<PhaseId>('conhecer')
  })

  it('walks the phases in order as gating steps complete', () => {
    // objective (conhecer) → business_identity (conhecer) → agent_review (revisar)
    let s = freshV2State()
    expect(nextPendingStepV2(s, READY_CTX).journey?.activePhaseId).toBe<PhaseId>('conhecer')

    s = patchBuilderState(s, { project: { name: 'X', objective: 'Y' } })
    expect(nextPendingStepV2(s, READY_CTX).step.id).toBe<StepId>('business_identity')
    expect(nextPendingStepV2(s, READY_CTX).journey?.activePhaseId).toBe<PhaseId>('conhecer')

    s = confirm(s, 'businessIdentity')
    expect(nextPendingStepV2(s, READY_CTX).step.id).toBe<StepId>('agent_review')
    expect(nextPendingStepV2(s, READY_CTX).journey?.activePhaseId).toBe<PhaseId>('revisar')
  })

  it('the Testar phase (test_drive) comes after Revisar and before Lançar', () => {
    const r = nextPendingStepV2(stateUpTo('test_drive'), READY_CTX)
    expect(r.step.id).toBe<StepId>('test_drive')
    expect(r.journey?.activePhaseId).toBe<PhaseId>('testar')
  })

  it('earlier phases are done and later ones pending relative to the active one', () => {
    // Active = test_drive (testar). conhecer/revisar done, lancar pending.
    const r = nextPendingStepV2(stateUpTo('test_drive'), READY_CTX)
    const byId = Object.fromEntries(
      (r.journey?.phases ?? []).map((p) => [p.id, p.status]),
    )
    expect(byId.conhecer).toBe('done')
    expect(byId.revisar).toBe('done')
    expect(byId.testar).toBe('active')
    expect(byId.lancar).toBe('pending')
  })
})

// ---------------------------------------------------------------------------
// business_identity satisfied by confirmations.source (FR-03)
// ---------------------------------------------------------------------------

describe('nextPendingStepV2 — business_identity', () => {
  it('is satisfied by the businessIdentity sentinel', () => {
    let s = patchBuilderState(freshV2State(), { project: { name: 'X', objective: 'Y' } })
    expect(nextPendingStepV2(s, READY_CTX).step.id).toBe<StepId>('business_identity')
    s = confirm(s, 'businessIdentity')
    expect(nextPendingStepV2(s, READY_CTX).step.id).not.toBe<StepId>('business_identity')
  })

  it('is ALSO satisfied by an accepted source (confirmations.source) — FR-03 equiv path', () => {
    let s = patchBuilderState(freshV2State(), { project: { name: 'X', objective: 'Y' } })
    // No businessIdentity sentinel, but the source was accepted → identity done.
    s = confirm(s, 'source')
    const r = nextPendingStepV2(s, READY_CTX)
    expect(r.steps.find((st) => st.id === 'business_identity')?.done).toBe(true)
    expect(r.step.id).not.toBe<StepId>('business_identity')
  })
})

// ---------------------------------------------------------------------------
// test_drive — soft gate flipped by BOTH tested and skip
// ---------------------------------------------------------------------------

describe('nextPendingStepV2 — test_drive (soft gate)', () => {
  it('surfaces while testDrive is pending', () => {
    const r = nextPendingStepV2(stateUpTo('test_drive'), READY_CTX)
    expect(r.step.id).toBe<StepId>('test_drive')
    expect(r.requiredMissing).toContain('confirmations.testDrive')
  })

  it('is satisfied once testDrive is flipped (both "tested" and "skip" flip the SAME sentinel)', () => {
    // Both the "Já testei" (tested) and the "Publicar sem testar" (skip) escapes flip
    // confirmations.testDrive server-side (T32) — the engine reads the one sentinel.
    const s = confirm(stateUpTo('test_drive'), 'testDrive')
    const r = nextPendingStepV2(s, READY_CTX)
    expect(r.steps.find((st) => st.id === 'test_drive')?.done).toBe(true)
    expect(r.step.id).not.toBe<StepId>('test_drive')
  })
})

// ---------------------------------------------------------------------------
// whatsapp_connect — status-aware + monotonic (FR-15 + FR-30)
// ---------------------------------------------------------------------------

describe('nextPendingStepV2 — whatsapp_connect', () => {
  /** Everything up to whatsapp_connect done, WhatsApp selected, sentinel NOT flipped. */
  function atWhatsappConnect(): BuilderState {
    let s = freshV2State()
    s = patchBuilderState(s, { project: { name: 'X', objective: 'Y' } })
    s = selectPlatforms(s, ['whatsapp'], 'qr')
    for (const key of [
      'businessIdentity',
      'persona',
      'services',
      'hours',
      'agentApproved',
      'testDrive',
      'activation',
      'channelPlatform',
    ] as ConfirmationKey[]) {
      s = confirm(s, key)
    }
    return s
  }

  it('completes via the live CONNECTED signal (ctx.hasConnectedWhatsAppInstance)', () => {
    const s = atWhatsappConnect()
    const r = nextPendingStepV2(s, { ...READY_CTX, hasConnectedWhatsAppInstance: true })
    expect(r.steps.find((st) => st.id === 'whatsapp_connect')?.done).toBe(true)
    expect(r.step.id).not.toBe<StepId>('whatsapp_connect')
  })

  it('a DISCONNECTED connection (ctx false, sentinel false) does NOT complete it', () => {
    const s = atWhatsappConnect()
    const ctx: StepEngineContextV2 = { ...READY_CTX, hasConnectedWhatsAppInstance: false }
    const r = nextPendingStepV2(s, ctx)
    expect(r.steps.find((st) => st.id === 'whatsapp_connect')?.done).toBe(false)
    expect(r.step.id).toBe<StepId>('whatsapp_connect')
    expect(r.requiredMissing).toContain('confirmations.whatsappConnectedOnce')
  })

  it('stays DONE with ctx false once whatsappConnectedOnce is true (monotonicity, FR-30)', () => {
    // Connected once (sentinel flipped by the webhook), then the live connection drops
    // (ctx back to false). The step must NOT reopen.
    let s = atWhatsappConnect()
    s = confirm(s, 'whatsappConnectedOnce')
    const ctx: StepEngineContextV2 = { ...READY_CTX, hasConnectedWhatsAppInstance: false }
    const r = nextPendingStepV2(s, ctx)
    expect(r.steps.find((st) => st.id === 'whatsapp_connect')?.done).toBe(true)
    expect(r.step.id).not.toBe<StepId>('whatsapp_connect')
  })
})

// ---------------------------------------------------------------------------
// Conditional channel steps surface per selected platform
// ---------------------------------------------------------------------------

describe('nextPendingStepV2 — conditional channel steps', () => {
  /** Up to channel_platform confirmed; platforms chosen by the caller. */
  function atConnect(platforms: Array<'whatsapp' | 'instagram'>): BuilderState {
    let s = freshV2State()
    s = patchBuilderState(s, { project: { name: 'X', objective: 'Y' } })
    s = selectPlatforms(s, platforms, platforms.includes('whatsapp') ? 'qr' : undefined)
    for (const key of [
      'businessIdentity',
      'persona',
      'services',
      'hours',
      'agentApproved',
      'testDrive',
      'activation',
      'channelPlatform',
    ] as ConfirmationKey[]) {
      s = confirm(s, key)
    }
    return s
  }

  it('WhatsApp NOT selected → whatsapp_connect never surfaces and drops from the checklist', () => {
    const s = atConnect(['instagram'])
    const ctx: StepEngineContextV2 = {
      ...READY_CTX,
      hasConnectedWhatsAppInstance: false,
      hasConnectedInstagramInstance: false,
    }
    const r = nextPendingStepV2(s, ctx)
    expect(r.steps.find((st) => st.id === 'whatsapp_connect')).toBeUndefined()
    expect(r.step.id).not.toBe<StepId>('whatsapp_connect')
  })

  it('Instagram selected → instagram_connect surfaces and gates until connected', () => {
    const s = atConnect(['instagram'])
    const ctx: StepEngineContextV2 = {
      ...READY_CTX,
      hasConnectedInstagramInstance: false,
    }
    const r = nextPendingStepV2(s, ctx)
    expect(r.steps.find((st) => st.id === 'instagram_connect')).toBeDefined()
    expect(r.step.id).toBe<StepId>('instagram_connect')

    // Connecting it (live IG signal) clears the step.
    const r2 = nextPendingStepV2(s, { ...ctx, hasConnectedInstagramInstance: true })
    expect(r2.steps.find((st) => st.id === 'instagram_connect')?.done).toBe(true)
    expect(r2.step.id).not.toBe<StepId>('instagram_connect')
  })

  it('Instagram NOT selected → instagram_connect drops from the checklist', () => {
    const s = atConnect(['whatsapp'])
    const r = nextPendingStepV2(s, {
      ...READY_CTX,
      hasConnectedInstagramInstance: false,
    })
    expect(r.steps.find((st) => st.id === 'instagram_connect')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// published_next_steps — terminal override only with a live deployment
// ---------------------------------------------------------------------------

describe('nextPendingStepV2 — published_next_steps', () => {
  it('does NOT pre-empt a pending gating step while no deployment is live', () => {
    // A still-pending journey (objective only). With no live deployment, the active
    // step is the next GATING one (business_identity), never the terminal card.
    let s = patchBuilderState(freshV2State(), { project: { name: 'X', objective: 'Y' } })
    s = selectPlatforms(s, ['whatsapp'], 'qr')
    const r = nextPendingStepV2(s, { ...READY_CTX, hasLiveDeployment: false })
    expect(r.step.id).toBe<StepId>('business_identity')
    expect(r.step.id).not.toBe<StepId>('published_next_steps')
  })

  it('terminal override PRE-EMPTS a pending step once a deployment is live + ack pending', () => {
    // Even mid-journey, a live deployment surfaces the next-steps card (override),
    // ahead of the next gating step (FR-16 — celebrate + guide once published).
    let s = patchBuilderState(freshV2State(), { project: { name: 'X', objective: 'Y' } })
    s = selectPlatforms(s, ['whatsapp'], 'qr')
    const r = nextPendingStepV2(s, { ...READY_CTX, hasLiveDeployment: true })
    expect(r.step.id).toBe<StepId>('published_next_steps')
  })

  it('the override stops once the next-steps card is acknowledged', () => {
    let s = patchBuilderState(freshV2State(), { project: { name: 'X', objective: 'Y' } })
    s = selectPlatforms(s, ['whatsapp'], 'qr')
    s = confirm(s, 'publishedNextSteps')
    const r = nextPendingStepV2(s, { ...READY_CTX, hasLiveDeployment: true })
    // The override yields; the journey returns to the next pending gating step.
    expect(r.step.id).toBe<StepId>('business_identity')
  })

  it('is the terminal fallback ask once every gating step is done', () => {
    // All gating done, no live deployment → the terminal step is the fallback "ask".
    const r = nextPendingStepV2(fullyCompletedV2State(), {
      ...READY_CTX,
      hasLiveDeployment: false,
    })
    expect(r.step.id).toBe<StepId>('published_next_steps')
  })

  it('never gates isDeployReady (terminal optional)', () => {
    const s = fullyCompletedV2State()
    // ack pending, but deploy is already ready.
    const r = nextPendingStepV2(s, READY_CTX)
    expect(r.steps.find((st) => st.id === 'published_next_steps')?.done).toBe(false)
    expect(r.isDeployReady).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Completeness monotonicity + conditional denominator
// ---------------------------------------------------------------------------

describe('nextPendingStepV2 — completenessPct', () => {
  it('is 0 for a fresh v2 state and 100 when every applicable step is done', () => {
    // EMPTY_CTX so no channel signal pre-completes a step on the fresh state.
    expect(nextPendingStepV2(freshV2State(), EMPTY_CTX).completenessPct).toBe(0)
    expect(nextPendingStepV2(everyStepDoneV2State(), READY_CTX).completenessPct).toBe(100)
  })

  it('never decreases as steps are confirmed, ending at 100', () => {
    let s = freshV2State()
    s = selectPlatforms(s, ['whatsapp'], 'qr')
    // Drive with a ctx where WhatsApp is NOT yet connected so the channel step only
    // completes via its sentinel below — the walk stays strictly monotonic.
    const ctx: StepEngineContextV2 = { ...READY_CTX, hasConnectedWhatsAppInstance: false }
    let prev = nextPendingStepV2(s, ctx).completenessPct
    expect(prev).toBe(0)

    s = patchBuilderState(s, { project: { name: 'X', objective: 'Y' } })
    let pct = nextPendingStepV2(s, ctx).completenessPct
    expect(pct).toBeGreaterThanOrEqual(prev)
    prev = pct

    // Every step's sentinel in journey order — gating + the optionals + the terminal.
    const order: ConfirmationKey[] = [
      'businessIdentity',
      'source',
      'persona',
      'services',
      'hours',
      'agentApproved',
      'knowledge',
      'media',
      'testDrive',
      'activation',
      'channelPlatform',
      'whatsappConnectedOnce',
      'summary',
      'publishedNextSteps',
    ]
    for (const key of order) {
      s = confirm(s, key)
      pct = nextPendingStepV2(s, ctx).completenessPct
      expect(pct).toBeGreaterThanOrEqual(prev)
      prev = pct
    }
    expect(prev).toBe(100)
  })

  it('a conditional channel step enters the denominator ONLY when its platform is selected', () => {
    // Every NON-channel applicable step done; the channel choice differs per case.
    // With only WhatsApp selected, instagram_connect is excluded from the ratio (and
    // vice-versa) — the unselected connect step neither inflates nor drags the %.
    const base = (platforms: Array<'whatsapp' | 'instagram'>) => {
      let s = freshV2State()
      s = patchBuilderState(s, { project: { name: 'X', objective: 'Y' } })
      s = selectPlatforms(s, platforms, platforms.includes('whatsapp') ? 'qr' : undefined)
      for (const key of [
        'businessIdentity',
        'source',
        'persona',
        'services',
        'hours',
        'agentApproved',
        'knowledge',
        'media',
        'testDrive',
        'activation',
        'channelPlatform',
        'summary',
        'publishedNextSteps',
      ] as ConfirmationKey[]) {
        s = confirm(s, key)
      }
      return s
    }

    // WhatsApp only, connected → 100% (instagram_connect not in the denominator).
    const whatsappState = confirm(base(['whatsapp']), 'whatsappConnectedOnce')
    expect(nextPendingStepV2(whatsappState, READY_CTX).completenessPct).toBe(100)

    // Instagram only, connected → 100% (whatsapp_connect not in the denominator).
    const igState = base(['instagram'])
    expect(
      nextPendingStepV2(igState, {
        ...READY_CTX,
        hasConnectedInstagramInstance: true,
      }).completenessPct,
    ).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// isDeployReady gates on blockers (reuses computeBlockers)
// ---------------------------------------------------------------------------

describe('nextPendingStepV2 — isDeployReady', () => {
  it('is true only when every gating step done AND zero blockers', () => {
    const r = nextPendingStepV2(fullyCompletedV2State(), READY_CTX)
    expect(r.blockers).toHaveLength(0)
    expect(r.isDeployReady).toBe(true)
  })

  it('is false when all steps done but a blocker remains (computeBlockers reused)', () => {
    const noPlan: StepEngineContextV2 = { ...READY_CTX, hasActivePlan: false }
    const r = nextPendingStepV2(fullyCompletedV2State(), noPlan)
    expect(r.isDeployReady).toBe(false)
    expect(r.blockers.map((b) => b.check)).toContain('plan')
  })

  it('surfaces all six v1 blockers for an empty context (vocabulary reused, not forked)', () => {
    const r = nextPendingStepV2(freshV2State(), EMPTY_CTX)
    expect(r.blockers.map((b) => b.check).sort()).toEqual(
      ['agent', 'byok', 'channel', 'plan', 'prompt', 'version'].sort(),
    )
  })

  it('is false when blockers clear but gating steps remain', () => {
    const r = nextPendingStepV2(freshV2State(), READY_CTX)
    expect(r.blockers).toHaveLength(0)
    expect(r.isDeployReady).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The 7 new v2 sentinels default false on a fresh state
// ---------------------------------------------------------------------------

describe('nextPendingStepV2 — new v2 sentinels default false', () => {
  it('all 7 new sentinels are false on a fresh/default state', () => {
    const c = DEFAULT_BUILDER_STATE.confirmations
    const newSentinels: ConfirmationKey[] = [
      'businessIdentity',
      'testDrive',
      'knowledge',
      'media',
      'publishedNextSteps',
      'channelPlatform',
      'whatsappConnectedOnce',
    ]
    for (const key of newSentinels) {
      expect(c[key]).toBe(false)
    }
  })

  it('a fresh v2 state never reports any v2 step as done', () => {
    const r = nextPendingStepV2(freshV2State(), EMPTY_CTX)
    const v2StepIds: StepId[] = [
      'business_identity',
      'agent_review',
      'test_drive',
      'channel_platform',
    ]
    for (const id of v2StepIds) {
      expect(r.steps.find((st) => st.id === id)?.done).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Optional knowledge/media never gate the journey
// ---------------------------------------------------------------------------

describe('nextPendingStepV2 — optional knowledge/media', () => {
  it('reaches isDeployReady WITHOUT confirming the optional knowledge/media steps', () => {
    const s = fullyCompletedV2State()
    const r = nextPendingStepV2(s, READY_CTX)
    expect(r.steps.find((st) => st.id === 'knowledge')?.done).toBe(false)
    expect(r.steps.find((st) => st.id === 'media')?.done).toBe(false)
    expect(r.isDeployReady).toBe(true)
  })

  it('knowledge is satisfied by real data (an ingested source) without the ack', () => {
    const s = patchBuilderState(fullyCompletedV2State(), {
      sourceIngestion: {
        sources: [{ value: 'https://acme.com', type: 'url', status: 'ready' }],
      },
    })
    const r = nextPendingStepV2(s, READY_CTX)
    expect(r.steps.find((st) => st.id === 'knowledge')?.done).toBe(true)
  })

  it('media is satisfied by extracted catalog images without the ack', () => {
    const s = patchBuilderState(fullyCompletedV2State(), {
      sourceIngestion: {
        sources: [
          { value: 'https://acme.com', type: 'url', status: 'ready', imagesCount: 3 },
        ],
      },
    })
    const r = nextPendingStepV2(s, READY_CTX)
    expect(r.steps.find((st) => st.id === 'media')?.done).toBe(true)
  })
})
