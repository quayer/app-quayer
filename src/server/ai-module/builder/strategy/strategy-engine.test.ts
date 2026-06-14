/**
 * strategy-engine.test — F5+ (Motor de Estratégia, end-to-end).
 * Exercita o pipeline completo (sinais → diagnóstico → campos → crítica) e o
 * mapeamento para a forma persistida.
 */

import { describe, it, expect } from 'vitest'
import { parseBuilderState } from '../cards/builder-state'
import {
  buildStrategyPlan,
  deriveStrategyContextFromState,
  toPersistedStrategyDiagnosis,
} from './strategy-engine'

const NOW = '2026-06-13T12:00:00.000Z'

function imobiliarioMcmvState() {
  return parseBuilderState({
    identity: {
      description:
        'Empreendimento Vibra Vila Sônia, apartamentos de 1 e 2 dormitórios, próximo ao metrô. Minha Casa Minha Vida, entrada facilitada e FGTS.',
      address: 'Vila Sônia, SP',
    },
    sourceIngestion: {
      sources: [],
      proposed: {
        businessName: 'Vibra Vila Sônia',
        services: ['apartamentos de 1 e 2 dormitórios'],
        address: 'Vila Sônia',
      },
    },
  })
}

describe('buildStrategyPlan — imobiliário MCMV (empreendimento específico)', () => {
  it('escolhe financiamento_popular e rejeita busca genérica', () => {
    const plan = buildStrategyPlan(imobiliarioMcmvState())
    expect(plan.diagnosis.selectedStrategy).toBe('financiamento_popular')
    expect(
      plan.diagnosis.rejectedStrategies.some(
        (r) => r.strategy === 'busca_generica_imobiliaria',
      ),
    ).toBe(true)
  })

  it('planeja campos de financiamento e exclui região/telefone/preço final', () => {
    const plan = buildStrategyPlan(imobiliarioMcmvState())
    const keys = plan.fieldPlan.map((f) => f.key)
    expect(keys).toContain('renda_familiar_aproximada')
    expect(keys).toContain('entrada_fgts')
    expect(keys).toContain('primeiro_imovel')
    const excluded = plan.excludedFields.map((e) => e.key)
    expect(excluded).toContain('regiao')
    expect(excluded).toContain('telefone')
    expect(excluded).toContain('preco_final')
  })

  it('crítica não reprova o plano curado (sem rejects)', () => {
    const plan = buildStrategyPlan(imobiliarioMcmvState())
    expect(plan.criticFindings.some((f) => f.kind === 'reject')).toBe(false)
  })

  it('sem handoff configurado → warn de handoff humano', () => {
    const plan = buildStrategyPlan(imobiliarioMcmvState())
    expect(
      plan.criticFindings.some(
        (f) => f.kind === 'warn' && f.target === 'handoff_humano',
      ),
    ).toBe(true)
  })
})

describe('buildStrategyPlan — outras verticais', () => {
  it('imobiliária genérica → busca_generica com região e tipo', () => {
    const plan = buildStrategyPlan(
      parseBuilderState({
        project: { name: 'Imobiliária Alpha', objective: 'vender e alugar imóveis na cidade' },
      }),
    )
    expect(plan.diagnosis.selectedStrategy).toBe('busca_generica_imobiliaria')
    const keys = plan.fieldPlan.map((f) => f.key)
    expect(keys).toContain('regiao_desejada')
    expect(keys).toContain('tipo_imovel')
  })

  it('saúde → agendamento_assistido, exclui diagnóstico e telefone', () => {
    const plan = buildStrategyPlan(
      parseBuilderState({
        identity: { description: 'Clínica médica com agendamento de consultas' },
      }),
    )
    expect(plan.diagnosis.selectedStrategy).toBe('agendamento_assistido')
    const excluded = plan.excludedFields.map((e) => e.key)
    expect(excluded).toContain('diagnostico')
    expect(excluded).toContain('telefone')
  })

  it('genérico → qualificacao_consultiva', () => {
    const plan = buildStrategyPlan(
      parseBuilderState({ project: { objective: 'vender cursos online de idiomas' } }),
    )
    expect(plan.diagnosis.selectedStrategy).toBe('qualificacao_consultiva')
  })
})

describe('deriveStrategyContextFromState', () => {
  it('WhatsApp default true; handoff nenhum → não configurado', () => {
    const ctx = deriveStrategyContextFromState(parseBuilderState({}))
    expect(ctx.channelIsWhatsapp).toBe(true)
    expect(ctx.handoffConfigured).toBe(false)
    expect(ctx.calendarConnected).toBe(false)
  })

  it('handoff roleta → configurado', () => {
    const ctx = deriveStrategyContextFromState(
      parseBuilderState({ handoff: { mode: 'roleta', alsoSchedule: false, steps: [], members: [] } }),
    )
    expect(ctx.handoffConfigured).toBe(true)
  })

  it('canal só Instagram → channelIsWhatsapp false', () => {
    const ctx = deriveStrategyContextFromState(
      parseBuilderState({ channel: { platforms: ['instagram'] } }),
    )
    expect(ctx.channelIsWhatsapp).toBe(false)
  })
})

describe('toPersistedStrategyDiagnosis', () => {
  it('mapeia o plano para a forma persistida com generatedAt injetado', () => {
    const plan = buildStrategyPlan(imobiliarioMcmvState())
    const persisted = toPersistedStrategyDiagnosis(plan, NOW)
    expect(persisted.businessType).toBe('imobiliario')
    expect(persisted.selectedStrategy).toBe('financiamento_popular')
    expect(persisted.suggestedFields.length).toBeGreaterThan(0)
    expect(persisted.excludedFields.length).toBeGreaterThan(0)
    expect(persisted.generatedAt).toBe(NOW)
  })
})
