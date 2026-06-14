/**
 * business-signal-extractor.test — F5+ (Motor de Estratégia, passo 1).
 * Pina a extração determinística de sinais do builderState.
 */

import { describe, it, expect } from 'vitest'
import { parseBuilderState } from '../cards/builder-state'
import { extractBusinessSignals } from './business-signal-extractor'

function imobiliarioMcmvState() {
  return parseBuilderState({
    identity: {
      description:
        'Empreendimento Vibra Vila Sônia, apartamentos de 1 e 2 dormitórios, próximo ao metrô. Minha Casa Minha Vida, entrada facilitada e uso de FGTS.',
      address: 'Vila Sônia, São Paulo',
    },
    sourceIngestion: {
      sources: [],
      proposed: {
        businessName: 'Vibra Vila Sônia',
        services: ['apartamentos de 1 e 2 dormitórios'],
        differentiators: ['próximo ao metrô'],
        address: 'Vila Sônia',
      },
    },
  })
}

describe('extractBusinessSignals', () => {
  it('imobiliário com empreendimento + MCMV/financiamento → sinais corretos', () => {
    const s = extractBusinessSignals(imobiliarioMcmvState())
    expect(s.businessType).toBe('imobiliario')
    expect(s.subtype).toBe('empreendimento_especifico')
    expect(s.hasSpecificProduct).toBe(true)
    expect(s.hasAddress).toBe(true)
    expect(s.hasMcmvSignal).toBe(true)
    expect(s.hasFinancingSignal).toBe(true)
    expect(s.regulated).toBe(false)
    expect(s.sourceFacts).toContain('Vibra Vila Sônia')
  })

  it('saúde → regulated true, businessType saude', () => {
    const s = extractBusinessSignals(
      parseBuilderState({
        identity: { description: 'Clínica médica, agendamento de consultas com especialistas' },
      }),
    )
    expect(s.businessType).toBe('saude')
    expect(s.regulated).toBe(true)
    expect(s.hasSchedulingSignal).toBe(true)
  })

  it('state vazio → generico, sem sinais, sem subtype', () => {
    const s = extractBusinessSignals(parseBuilderState({}))
    expect(s.businessType).toBe('generico')
    expect(s.subtype).toBeUndefined()
    expect(s.hasMcmvSignal).toBe(false)
    expect(s.hasFinancingSignal).toBe(false)
    expect(s.regulated).toBe(false)
  })

  it('imobiliária sem empreendimento único → subtype imobiliaria_generica', () => {
    const s = extractBusinessSignals(
      parseBuilderState({
        project: { name: 'Imobiliária Alpha', objective: 'vender e alugar imóveis' },
      }),
    )
    expect(s.businessType).toBe('imobiliario')
    expect(s.subtype).toBe('imobiliaria_generica')
    expect(s.hasSpecificProduct).toBe(false)
  })
})
