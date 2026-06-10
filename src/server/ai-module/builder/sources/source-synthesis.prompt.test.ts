/**
 * Unit tests — parseSourceSynthesisJSON (Onda E: address + description).
 *
 * Foco nos DOIS campos novos do SourceProposal: extração grounded de
 * `address`/`description`, contagem em `groundedFields`, lenient em
 * ausência/null e STRICT no tipo (anti-garbage). Puro — sem DB, sem IO.
 */

import { describe, it, expect } from 'vitest'

import {
  SOURCE_SYNTHESIS_SYSTEM,
  parseSourceSynthesisJSON,
} from './source-synthesis.prompt'

const VIBRA_ADDRESS = 'Rua Coronel Ferreira Leal, 161, Vila Gomes, São Paulo'

describe('parseSourceSynthesisJSON — address + description (Onda E)', () => {
  it('carrega address e description quando grounded (e conta em groundedFields)', () => {
    const raw = JSON.stringify({
      businessName: 'Vibra Residencial',
      services: ['apartamentos de 2 dormitórios'],
      audience: null,
      differentiators: [],
      tone: null,
      address: `  ${VIBRA_ADDRESS}  `,
      description: 'Empreendimento residencial na Vila Gomes.',
    })

    const parsed = parseSourceSynthesisJSON(raw)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.address).toBe(VIBRA_ADDRESS) // trimmed
    expect(parsed.value.description).toBe(
      'Empreendimento residencial na Vila Gomes.',
    )
    // businessName + services + address + description = 4 grounded fields.
    expect(parsed.groundedFields).toBe(4)
    expect(parsed.ungrounded).toBe(false)
  })

  it('null/ausente/"" → campo omitido do proposal (vazio é resposta válida)', () => {
    const parsed = parseSourceSynthesisJSON(
      JSON.stringify({ address: null, description: '' }),
    )
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.address).toBeUndefined()
    expect(parsed.value.description).toBeUndefined()
    expect(parsed.ungrounded).toBe(true)
  })

  it('rejeita address com tipo errado (number) — nunca persiste garbage', () => {
    const parsed = parseSourceSynthesisJSON(JSON.stringify({ address: 161 }))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).toContain('address')
  })

  it('rejeita description com tipo errado (objeto)', () => {
    const parsed = parseSourceSynthesisJSON(
      JSON.stringify({ description: { text: 'x' } }),
    )
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.message).toContain('description')
  })

  it('system prompt documenta os campos novos no shape JSON', () => {
    expect(SOURCE_SYNTHESIS_SYSTEM).toContain('"address"')
    expect(SOURCE_SYNTHESIS_SYSTEM).toContain('"description"')
  })
})
