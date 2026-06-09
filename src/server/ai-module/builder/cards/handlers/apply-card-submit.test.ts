import { describe, it, expect } from 'vitest'

import { parseBuilderState, patchBuilderState } from '../builder-state'
import { applyPricing, applyHandoffPairing } from './apply-card-submit'

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

describe('applyHandoffPairing — B2 (warm transfer)', () => {
  const teamState = () =>
    patchBuilderState(parseBuilderState(undefined), {
      team: {
        members: [
          { name: 'João', whatsapp: '+5511988887777', position: 0 },
          { name: 'Maria', whatsapp: '+5511966665555', position: 1 },
        ],
      },
    })

  it('seta connectionId por position e grava openingMessage + flag', () => {
    const { next } = applyHandoffPairing(teamState(), {
      members: [{ position: 0, connectionId: 'conn-joao' }],
      openingMessage: 'Oi, aqui é o João!',
    })
    const joao = next.team.members.find((m) => m.position === 0)
    const maria = next.team.members.find((m) => m.position === 1)
    expect(joao?.connectionId).toBe('conn-joao')
    expect(maria?.connectionId).toBeUndefined() // fora do payload → intacto
    expect(next.team.openingMessage).toBe('Oi, aqui é o João!')
    expect(next.confirmations.handoffPairing).toBe(true)
  })

  it('connectionId em branco limpa o pareamento daquele membro', () => {
    const withConn = patchBuilderState(teamState(), {
      team: { members: [{ name: 'João', whatsapp: '+5511988887777', connectionId: 'old', position: 0 }] },
    })
    const { next } = applyHandoffPairing(withConn, {
      members: [{ position: 0, connectionId: '   ' }],
    })
    expect(next.team.members.find((m) => m.position === 0)?.connectionId).toBeUndefined()
  })

  it('confirma mesmo sem nenhum pareamento (passo opcional)', () => {
    const { next } = applyHandoffPairing(teamState(), { members: [] })
    expect(next.confirmations.handoffPairing).toBe(true)
  })
})
