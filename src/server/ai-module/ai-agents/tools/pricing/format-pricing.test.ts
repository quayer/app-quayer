import { describe, it, expect } from 'vitest'

import { formatPriceCents, formatItemPrice } from './format-pricing'

/**
 * M2 — guarda do formatador de preço do get_pricing (o que o AGENTE fala).
 * Pura, fail-safe, centavos→reais sem float drift.
 */
describe('formatPriceCents', () => {
  it('formata centavos em reais sem separador de milhar', () => {
    expect(formatPriceCents(4500, 'BRL')).toBe('R$ 45,00')
    expect(formatPriceCents(99, 'BRL')).toBe('R$ 0,99')
    expect(formatPriceCents(123456, 'BRL')).toBe('R$ 1234,56') // sem "1.234"
  })

  it('usa o código da moeda quando não é BRL', () => {
    expect(formatPriceCents(2500, 'USD')).toBe('USD 25,00')
  })

  it('fail-safe: NaN/Infinity/negativo → R$ 0,00', () => {
    expect(formatPriceCents(Number.NaN, 'BRL')).toBe('R$ 0,00')
    expect(formatPriceCents(Number.POSITIVE_INFINITY, 'BRL')).toBe('R$ 0,00')
    expect(formatPriceCents(-500, 'BRL')).toBe('R$ 0,00')
  })
})

describe('formatItemPrice — por disclosureStyle', () => {
  it("exact → preço cravado (piso)", () => {
    expect(formatItemPrice({ priceCents: 4500 }, 'BRL', 'exact')).toBe('R$ 45,00')
  })

  it("from → 'a partir de' + piso", () => {
    expect(formatItemPrice({ priceCents: 4500 }, 'BRL', 'from')).toBe(
      'a partir de R$ 45,00',
    )
  })

  it("average com teto válido → faixa 'entre X e Y'", () => {
    expect(
      formatItemPrice({ priceCents: 20000, priceMaxCents: 35000 }, 'BRL', 'average'),
    ).toBe('entre R$ 200,00 e R$ 350,00')
  })

  it('average com teto ausente/inválido → cai para o piso (não inventa teto)', () => {
    // sem teto
    expect(formatItemPrice({ priceCents: 20000 }, 'BRL', 'average')).toBe(
      'a partir de R$ 200,00',
    )
    // teto <= piso
    expect(
      formatItemPrice({ priceCents: 20000, priceMaxCents: 15000 }, 'BRL', 'average'),
    ).toBe('a partir de R$ 200,00')
    // teto não-finito
    expect(
      formatItemPrice(
        { priceCents: 20000, priceMaxCents: Number.NaN },
        'BRL',
        'average',
      ),
    ).toBe('a partir de R$ 200,00')
  })

  it('none → undefined (o agente não cita valor)', () => {
    expect(formatItemPrice({ priceCents: 4500 }, 'BRL', 'none')).toBeUndefined()
  })
})
