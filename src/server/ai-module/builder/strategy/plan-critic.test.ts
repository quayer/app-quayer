/**
 * plan-critic.test — F5+ (Motor de Estratégia, passo 6).
 * Pina as reprovações/alertas da crítica automática.
 */

import { describe, it, expect } from 'vitest'
import { critiquePlan, type CritiquePlanInput } from './plan-critic'
import type {
  BusinessSignals,
  QualificationFieldPlan,
  StrategyContext,
  StrategyDiagnosis,
} from './strategy.types'

function signals(overrides: Partial<BusinessSignals> = {}): BusinessSignals {
  return {
    businessType: 'imobiliario',
    subtype: 'empreendimento_especifico',
    hasAddress: true,
    hasPricing: false,
    hasSpecificProduct: true,
    hasVisitGoal: false,
    hasSchedulingSignal: false,
    hasFinancingSignal: true,
    hasMcmvSignal: true,
    soldOutRisk: false,
    regulated: false,
    sourceFacts: [],
    ...overrides,
  }
}

const diagnosis: StrategyDiagnosis = {
  selectedStrategy: 'financiamento_popular',
  reason: 'x',
  rejectedStrategies: [],
}

const ctx: StrategyContext = {
  channelIsWhatsapp: true,
  calendarConnected: false,
  handoffConfigured: true,
}

function field(over: Partial<QualificationFieldPlan>): QualificationFieldPlan {
  return { key: 'k', label: 'l', reason: 'r', priority: 'high', ...over }
}

function critique(over: Partial<CritiquePlanInput>) {
  return critiquePlan({
    signals: signals(),
    diagnosis,
    fieldPlan: [],
    excludedFields: [],
    context: ctx,
    ...over,
  })
}

describe('critiquePlan', () => {
  it('plano limpo → só "ok"', () => {
    const findings = critique({ fieldPlan: [field({ key: 'nome' })] })
    expect(findings.some((f) => f.kind === 'reject')).toBe(false)
    expect(findings.some((f) => f.kind === 'ok')).toBe(true)
  })

  it('telefone no WhatsApp → reject', () => {
    const findings = critique({ fieldPlan: [field({ key: 'telefone' })] })
    expect(findings.some((f) => f.kind === 'reject' && f.target.includes('telefone'))).toBe(true)
  })

  it('região com produto específico → reject', () => {
    const findings = critique({ fieldPlan: [field({ key: 'regiao_desejada' })] })
    expect(findings.some((f) => f.kind === 'reject' && f.target.includes('regiao'))).toBe(true)
  })

  it('promessa de aprovação → reject', () => {
    const findings = critique({
      fieldPlan: [field({ key: 'simulacao', label: 'Aprovação garantida no MCMV' })],
    })
    expect(findings.some((f) => f.kind === 'reject' && /aprova/i.test(f.reason))).toBe(true)
  })

  it('campo excluído presente no plano → reject', () => {
    const findings = critique({
      fieldPlan: [field({ key: 'regiao' })],
      excludedFields: [{ key: 'regiao', reason: 'já tem endereço' }],
    })
    expect(findings.some((f) => f.kind === 'reject')).toBe(true)
  })

  it('sinais de agenda sem calendário conectado → warn', () => {
    const findings = critique({
      signals: signals({ hasSchedulingSignal: true }),
      fieldPlan: [field({ key: 'nome' })],
      context: { ...ctx, calendarConnected: false },
    })
    expect(findings.some((f) => f.kind === 'warn' && f.target === 'agenda')).toBe(true)
  })

  it('estratégia que exige humano sem handoff → warn', () => {
    const findings = critique({
      fieldPlan: [field({ key: 'nome' })],
      context: { ...ctx, handoffConfigured: false },
    })
    expect(
      findings.some((f) => f.kind === 'warn' && f.target === 'handoff_humano'),
    ).toBe(true)
  })
})
