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
  patchBuilderState,
  clearCapturedProposals,
  invalidateRefinement,
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

describe('capturedProposals namespace (T06/FR-02) — parse + legacy backfill', () => {
  it('an empty {} resolves capturedProposals to undefined (OPTIONAL, no default)', () => {
    expect(parseBuilderState({}).capturedProposals).toBeUndefined()
  })

  it('DEFAULT_BUILDER_STATE has no capturedProposals', () => {
    expect(DEFAULT_BUILDER_STATE.capturedProposals).toBeUndefined()
  })

  it('backfills a LEGACY JSONB state (predates the namespace) to undefined', () => {
    const legacy = {
      project: { name: 'Barbearia X' },
      persona: { name: 'Ana' },
      confirmations: { persona: true },
    }
    expect(parseBuilderState(legacy).capturedProposals).toBeUndefined()
  })

  it('backfills a legacy persisted JSON STRING without the namespace to undefined', () => {
    const legacyJson = JSON.stringify({
      project: { name: 'Loja Y' },
      confirmations: {},
    })
    expect(parseBuilderState(legacyJson).capturedProposals).toBeUndefined()
  })

  it('preserves a populated capturedProposals namespace (multiple domains)', () => {
    const parsed = parseBuilderState({
      capturedProposals: {
        persona: { name: 'Bia', tone: 'formal' },
        services: { offered: ['corte', 'barba'] },
        handoff: { mode: 'roleta', reason: 'nicho regulado' },
      },
    })
    expect(parsed.capturedProposals).toEqual({
      persona: { name: 'Bia', tone: 'formal' },
      services: { offered: ['corte', 'barba'] },
      handoff: { mode: 'roleta', reason: 'nicho regulado' },
    })
  })

  it('preserves capturedProposals when parsing a persisted JSON string', () => {
    const json = JSON.stringify({
      capturedProposals: { hours: { preset: 'seg-sex 9-18' } },
      confirmations: {},
    })
    expect(parseBuilderState(json).capturedProposals).toEqual({
      hours: { preset: 'seg-sex 9-18' },
    })
  })

  it('strips UNKNOWN domains from capturedProposals (structural whitelist)', () => {
    // `unknownDomain` is not in capturedProposalsSchema → safeParse drops the
    // extra key while keeping the valid `persona` proposal.
    const parsed = parseBuilderState({
      capturedProposals: {
        persona: { name: 'Caio' },
        unknownDomain: { whatever: true },
      },
    })
    expect(parsed.capturedProposals).toEqual({ persona: { name: 'Caio' } })
    expect(
      (parsed.capturedProposals as Record<string, unknown>).unknownDomain,
    ).toBeUndefined()
  })

  it('drops an out-of-contract capturedProposals without throwing (NEVER throws)', () => {
    // `handoff.mode` must be a HandoffMode enum value; an invalid one fails the
    // whole safeParse, so parseBuilderState backfills to DEFAULT (undefined).
    const parsed = parseBuilderState({
      capturedProposals: { handoff: { mode: 'bogus_mode' } },
    })
    expect(parsed.capturedProposals).toBeUndefined()
  })

  it('truncation contract: an over-long captured text fails safeParse → DEFAULT (never throws)', () => {
    // CAPTURED_TEXT_MAX is 300; a 301-char name is out of contract. The LLM can
    // never persist an arbitrary-length blob into the JSONB.
    const parsed = parseBuilderState({
      capturedProposals: { persona: { name: 'x'.repeat(301) } },
    })
    expect(parsed.capturedProposals).toBeUndefined()
  })
})

describe('refinement namespace — optional aggregate state', () => {
  it('an empty {} resolves refinement to undefined (OPTIONAL, no default)', () => {
    expect(parseBuilderState({}).refinement).toBeUndefined()
  })

  it('DEFAULT_BUILDER_STATE has no refinement namespace', () => {
    expect(DEFAULT_BUILDER_STATE.refinement).toBeUndefined()
  })

  it('backfills a legacy JSONB state without refinement to undefined', () => {
    const legacy = {
      project: { name: 'Clínica X' },
      confirmations: { persona: true },
    }
    expect(parseBuilderState(legacy).refinement).toBeUndefined()
  })

  it('preserves a populated refinement aggregate and defaults internal arrays', () => {
    const parsed = parseBuilderState({
      refinement: {
        status: 'failed',
        runId: 'refine-1',
        score: 72,
        startedAt: '2026-06-12T00:00:00.000Z',
        finishedAt: '2026-06-12T00:01:00.000Z',
        checks: [
          {
            checkId: 'route',
            label: 'Plano de atendimento',
            status: 'fail',
            severity: 'critical',
            evidence: 'Pulou a etapa de qualificação.',
            recommendation: 'Corrigir o fluxo antes de publicar.',
            autoFixable: true,
          },
        ],
        blockers: [
          {
            checkId: 'route',
            severity: 'critical',
            message: 'O agente pulou uma etapa obrigatória.',
          },
        ],
      },
    })

    expect(parsed.refinement).toMatchObject({
      status: 'failed',
      runId: 'refine-1',
      score: 72,
      checks: [
        expect.objectContaining({
          checkId: 'route',
          status: 'fail',
          severity: 'critical',
          autoFixable: true,
        }),
      ],
      blockers: [
        expect.objectContaining({
          checkId: 'route',
          message: 'O agente pulou uma etapa obrigatória.',
        }),
      ],
    })
  })

  it('defaults checks/blockers to [] when the namespace is present but empty', () => {
    const parsed = parseBuilderState({ refinement: { status: 'idle' } })

    expect(parsed.refinement).toEqual({
      status: 'idle',
      checks: [],
      blockers: [],
    })
  })

  it('drops an out-of-contract refinement without throwing', () => {
    const parsed = parseBuilderState({
      refinement: {
        status: 'failed',
        score: 101,
      },
    })

    expect(parsed.refinement).toBeUndefined()
  })

  it('preserves refinement material metadata', () => {
    const parsed = parseBuilderState({
      refinement: {
        status: 'passed',
        checks: [],
        blockers: [],
        material: {
          promptVersionId: 'version-1',
          promptVersionNumber: 1,
          promptHash: 'prompt-hash',
          blueprintHash: 'blueprint-hash',
          contextHash: 'context-hash',
        },
      },
    })

    expect(parsed.refinement?.material).toEqual({
      promptVersionId: 'version-1',
      promptVersionNumber: 1,
      promptHash: 'prompt-hash',
      blueprintHash: 'blueprint-hash',
      contextHash: 'context-hash',
    })
  })

  it('invalidateRefinement turns a v2 result into an idle blocker without old checks', () => {
    const state = parseBuilderState({
      journeyVersion: 2,
      refinement: {
        status: 'passed',
        score: 100,
        runId: 'refine-1',
        checks: [
          {
            checkId: 'route',
            status: 'pass',
            severity: 'low',
          },
        ],
        blockers: [],
        material: { promptVersionId: 'version-1' },
      },
    })

    const next = invalidateRefinement(
      state,
      'Prompt mudou.',
      '2026-06-12T10:00:00.000Z',
    )

    expect(next.refinement).toEqual({
      status: 'idle',
      checks: [],
      blockers: [],
      material: { promptVersionId: 'version-1' },
      invalidatedAt: '2026-06-12T10:00:00.000Z',
      invalidationReason: 'Prompt mudou.',
    })
  })

  it('invalidateRefinement is a no-op for v1 projects', () => {
    const state = parseBuilderState({
      journeyVersion: 1,
      refinement: { status: 'passed', checks: [], blockers: [] },
    })

    expect(invalidateRefinement(state, 'Mudou.')).toBe(state)
  })
})

describe('clearCapturedProposals (T06/FR-02) — explicit per-domain deletion', () => {
  const stateWith = (
    captured: NonNullable<ReturnType<typeof parseBuilderState>['capturedProposals']>,
  ) => parseBuilderState({ capturedProposals: captured })

  it('removes ONLY the given domain, leaving the others untouched', () => {
    const state = stateWith({
      persona: { name: 'Bia' },
      services: { offered: ['corte'] },
      hours: { preset: 'seg-sex' },
    })
    const next = clearCapturedProposals(state, 'services')
    expect(next.capturedProposals).toEqual({
      persona: { name: 'Bia' },
      hours: { preset: 'seg-sex' },
    })
    // The cleared domain is truly gone, not merely undefined-merged.
    expect(next.capturedProposals?.services).toBeUndefined()
  })

  it('removes the whole namespace when the last remaining domain is cleared (no orphan {})', () => {
    const state = stateWith({ persona: { name: 'Bia' } })
    const next = clearCapturedProposals(state, 'persona')
    expect(next.capturedProposals).toBeUndefined()
    expect('capturedProposals' in next).toBe(false)
  })

  it('is a no-op (returns the same reference) when the domain is absent', () => {
    const state = stateWith({ persona: { name: 'Bia' } })
    const next = clearCapturedProposals(state, 'services')
    expect(next).toBe(state)
  })

  it('is a no-op (returns the same reference) when the namespace itself is absent', () => {
    const state = parseBuilderState({})
    expect(state.capturedProposals).toBeUndefined()
    const next = clearCapturedProposals(state, 'persona')
    expect(next).toBe(state)
  })

  it('is PURE — never mutates the input state', () => {
    const state = stateWith({
      persona: { name: 'Bia' },
      services: { offered: ['corte'] },
    })
    const snapshot = JSON.parse(JSON.stringify(state))
    clearCapturedProposals(state, 'persona')
    expect(state).toEqual(snapshot)
    expect(state.capturedProposals).toEqual({
      persona: { name: 'Bia' },
      services: { offered: ['corte'] },
    })
  })

  it('clearing each domain in turn drains the namespace to undefined', () => {
    let state = stateWith({
      persona: { name: 'Bia' },
      services: { offered: ['corte'] },
    })
    state = clearCapturedProposals(state, 'persona')
    expect(state.capturedProposals).toEqual({ services: { offered: ['corte'] } })
    state = clearCapturedProposals(state, 'services')
    expect(state.capturedProposals).toBeUndefined()
  })
})

describe('regression — deepMerge (patchBuilderState) NEVER deletes keys', () => {
  it('patching a domain with undefined does NOT clear it (why clearCapturedProposals exists)', () => {
    const state = parseBuilderState({
      capturedProposals: { persona: { name: 'Bia' } },
    })
    // The tempting-but-wrong way to "clear": patch the domain to undefined.
    // deepMerge ignores undefined patch values, so the proposal SURVIVES — this
    // is exactly the zombie-badge trap the explicit helper guards against.
    const patched = patchBuilderState(state, {
      capturedProposals: { persona: undefined },
    })
    expect(patched.capturedProposals?.persona).toEqual({ name: 'Bia' })
  })

  it('patching a sub-field with undefined leaves the existing value in place', () => {
    const state = parseBuilderState({
      capturedProposals: { persona: { name: 'Bia', tone: 'formal' } },
    })
    const patched = patchBuilderState(state, {
      capturedProposals: { persona: { tone: undefined } },
    })
    // `tone` is NOT deleted; only present (defined) patch keys win.
    expect(patched.capturedProposals?.persona).toEqual({
      name: 'Bia',
      tone: 'formal',
    })
  })

  it('patch only adds/overwrites defined keys — never removes a sibling domain', () => {
    const state = parseBuilderState({
      capturedProposals: { persona: { name: 'Bia' } },
    })
    const patched = patchBuilderState(state, {
      capturedProposals: { services: { offered: ['corte'] } },
    })
    expect(patched.capturedProposals).toEqual({
      persona: { name: 'Bia' },
      services: { offered: ['corte'] },
    })
  })

  it('clearCapturedProposals SUCCEEDS where the patch fails to clear', () => {
    const state = parseBuilderState({
      capturedProposals: { persona: { name: 'Bia' }, services: { offered: ['x'] } },
    })
    // The patch cannot delete `persona`...
    const patchAttempt = patchBuilderState(state, {
      capturedProposals: { persona: undefined },
    })
    expect(patchAttempt.capturedProposals?.persona).toBeDefined()
    // ...but the explicit helper does, leaving only `services`.
    const cleared = clearCapturedProposals(state, 'persona')
    expect(cleared.capturedProposals).toEqual({ services: { offered: ['x'] } })
  })
})
