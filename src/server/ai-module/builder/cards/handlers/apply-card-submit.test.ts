import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mock — builderProjectConversation delegate (tenant-scoped read+write)
// ---------------------------------------------------------------------------
//
// `applyHandoff` is NOT exported (only the pure `applyPricing` is), so the
// Onda 2 `handoff` card is exercised through the PUBLIC `applyCardSubmit`
// entrypoint. That entrypoint reads the conversation (proving ownership) and
// writes the new state in a single tenant-filtered updateMany — both mocked
// here. The `applyPricing` suite below stays a pure-function unit (no DB), and
// the database mock is inert for it.

const mockFindUnique = vi.hoisted(() => vi.fn())
const mockUpdateMany = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => ({
  database: {
    builderProjectConversation: {
      findUnique: mockFindUnique,
      updateMany: mockUpdateMany,
    },
  },
}))

import {
  parseBuilderState,
  patchBuilderState,
  type BuilderState,
} from '../builder-state'
import { applyPricing, applyCardSubmit } from './apply-card-submit'
import type { CardSubmitBody } from '../card-submit.schemas'

/**
 * Onda B — G5a regression guard.
 *
 * The pricing card is submitted WHOLESALE, so an absent `minTicketCents` means the
 * user removed it. `deepMerge` skips `undefined`, so without an explicit clear a
 * previously-saved min ticket could never be unset (the mustFix from the review).
 */
describe('applyPricing — G5a min ticket (wholesale clear)', () => {
  const base = () =>
    patchBuilderState(parseBuilderState(undefined), {
      pricing: { minTicketCents: 5000 },
    })

  const payload = (minTicketCents?: number) => ({
    items: [{ name: 'Corte', priceCents: 5000 }],
    currency: 'BRL' as const,
    disclosureStyle: 'exact' as const,
    minTicketCents,
  })

  it('persists a positive min ticket', () => {
    const { next } = applyPricing(parseBuilderState(undefined), payload(8000))
    expect(next.pricing.minTicketCents).toBe(8000)
    expect(next.confirmations.pricing).toBe(true)
  })

  it('clears a previously-set min ticket when the new submit omits it', () => {
    // Was 5000; the new wholesale submit has no min ticket → must become undefined.
    const { next } = applyPricing(base(), payload(undefined))
    expect(next.pricing.minTicketCents).toBeUndefined()
  })

  it('treats a non-positive min ticket as cleared (0 → undefined)', () => {
    const { next } = applyPricing(base(), payload(0))
    expect(next.pricing.minTicketCents).toBeUndefined()
  })

  it('replaces items wholesale and keeps a re-submitted min ticket', () => {
    const { next } = applyPricing(base(), payload(5000))
    expect(next.pricing.minTicketCents).toBe(5000)
    expect(next.pricing.items.map((i) => i.name)).toEqual(['Corte'])
  })
})

/**
 * Onda 2 — the unified `handoff` card (FUSÃO of the 4 retired handlers:
 * qualification_action + qualification_steps + team_structure + handoff_pairing).
 *
 * `applyHandoff` is internal, so we drive the PUBLIC `applyCardSubmit` with a
 * cardKey 'handoff' body and assert on the persisted state captured by the
 * mocked updateMany: it must write `state.handoff.*` (mode/roster/steps/schedule/
 * openingMessage) AND flip `confirmations.handoff` (the single sentinel that
 * replaced the 4 legacy ones).
 */
describe('applyCardSubmit — handoff card (Onda 2 unified)', () => {
  const PROJECT_ID = 'proj-1'
  const ORG_ID = 'org-1'
  const CONV_ID = 'conv-1'

  /** Seed conversation row with a given (already-parsed) builderState JSON. */
  function seedConversation(builderState: unknown): void {
    mockFindUnique.mockResolvedValue({
      id: CONV_ID,
      organizationId: ORG_ID,
      builderState,
    })
    mockUpdateMany.mockResolvedValue({ count: 1 })
  }

  /** The BuilderState written by the (single) updateMany call. */
  function writtenState(): BuilderState {
    expect(mockUpdateMany).toHaveBeenCalledTimes(1)
    const arg = mockUpdateMany.mock.calls[0][0] as {
      data: { builderState: BuilderState }
    }
    return arg.data.builderState
  }

  async function submitHandoff(
    body: Omit<Extract<CardSubmitBody, { cardKey: 'handoff' }>, 'cardKey'>,
  ) {
    return applyCardSubmit({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      body: { cardKey: 'handoff', ...body },
    })
  }

  beforeEach(() => {
    mockFindUnique.mockReset()
    mockUpdateMany.mockReset()
  })

  it('mode "solo": writes handoff.mode + flips confirmations.handoff (empty roster)', async () => {
    seedConversation(null)
    const res = await submitHandoff({
      mode: 'solo',
      alsoSchedule: false,
      steps: [],
      members: [],
    })

    expect(res.ok).toBe(true)
    const next = writtenState()
    expect(next.handoff.mode).toBe('solo')
    expect(next.handoff.alsoSchedule).toBe(false)
    expect(next.handoff.members).toEqual([])
    expect(next.confirmations.handoff).toBe(true)
  })

  it('mode "roleta": persists the sanitized roster (E.164-BR whatsapp + connectionId)', async () => {
    seedConversation(null)
    await submitHandoff({
      mode: 'roleta',
      alsoSchedule: false,
      steps: ['Qual seu nome?', 'Qual o serviço?'],
      members: [
        { name: 'João', whatsapp: '11988887777', connectionId: 'conn-joao', position: 0 },
        { name: 'Maria', whatsapp: '+5511966665555', position: 1 },
      ],
    })

    const next = writtenState()
    expect(next.handoff.mode).toBe('roleta')
    expect(next.handoff.steps).toEqual(['Qual seu nome?', 'Qual o serviço?'])
    const joao = next.handoff.members.find((m) => m.position === 0)
    const maria = next.handoff.members.find((m) => m.position === 1)
    // whatsapp is re-normalized server-side to E.164-BR.
    expect(joao?.whatsapp).toBe('+5511988887777')
    expect(joao?.connectionId).toBe('conn-joao') // warm transfer pairing transits through
    expect(maria?.whatsapp).toBe('+5511966665555')
    expect(next.confirmations.handoff).toBe(true)
  })

  it('alsoSchedule + openingMessage are persisted (warm transfer opener)', async () => {
    seedConversation(null)
    await submitHandoff({
      mode: 'roleta',
      alsoSchedule: true,
      steps: [],
      members: [{ name: 'João', position: 0 }],
      openingMessage: 'Oi, aqui é o João!',
    })

    const next = writtenState()
    expect(next.handoff.alsoSchedule).toBe(true)
    expect(next.handoff.openingMessage).toBe('Oi, aqui é o João!')
    expect(next.confirmations.handoff).toBe(true)
  })

  it('mode "nenhum": flips the sentinel with no roster', async () => {
    seedConversation(null)
    await submitHandoff({
      mode: 'nenhum',
      alsoSchedule: false,
      steps: [],
      members: [],
    })

    const next = writtenState()
    expect(next.handoff.mode).toBe('nenhum')
    expect(next.handoff.members).toEqual([])
    expect(next.confirmations.handoff).toBe(true)
  })

  it('does not write nor confirm when the conversation belongs to another org', async () => {
    mockFindUnique.mockResolvedValue({
      id: CONV_ID,
      organizationId: 'other-org',
      builderState: null,
    })
    const res = await submitHandoff({
      mode: 'solo',
      alsoSchedule: false,
      steps: [],
      members: [],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('forbidden')
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })
})
