import { describe, expect, it } from 'vitest'

import {
  normalizeSourceProposalItems,
  normalizeSourceProposalText,
  sourceProposalAvailabilityWarning,
} from '@/lib/builder/source-proposal-display'

describe('source proposal display helpers', () => {
  it('normaliza placeholder quebrado de distância do CMS', () => {
    expect(
      normalizeSourceProposalText(
        'a minuto(s) do(a) Estação BUTANTÃ (Linha Amarela)',
      ),
    ).toBe('próximo à Estação Butantã (Linha Amarela)')
  })

  it('deduplica e limpa highlights antes de exibir', () => {
    expect(
      normalizeSourceProposalItems([
        ' opção de varanda ',
        'opção de varanda',
        'a minuto(s) do(a) Estação BUTANTÃ (Linha Amarela)',
      ]),
    ).toEqual([
      'opção de varanda',
      'próximo à Estação Butantã (Linha Amarela)',
    ])
  })

  it('alerta quando a fonte indica empreendimento 100% vendido', () => {
    expect(
      sourceProposalAvailabilityWarning({
        businessName: 'Vibra Butantã',
        description:
          'Empreendimento residencial pronto e 100% vendido na Zona Oeste.',
      }),
    ).toContain('100% vendido')
  })
})
