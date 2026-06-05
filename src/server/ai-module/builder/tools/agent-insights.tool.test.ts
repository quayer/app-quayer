/**
 * agent-insights.tool — unit tests (QH-07c)
 *
 * Testa apenas `computeInsights` (lógica pura, sem DB).
 * Cobre: turnos vazios, cálculos de percentual, top tools, distribuição de
 * modelos, leads qualificados e distribuição de jornada.
 */

import { describe, it, expect } from 'vitest'
import { computeInsights, type RawDecision, type RawSession } from './agent-insights.tool'

// ---------------------------------------------------------------------------
// Factories de mocks
// ---------------------------------------------------------------------------

function makeDecision(overrides: Partial<RawDecision> = {}): RawDecision {
  return {
    fallbackTriggered: false,
    latencyMs: 200,
    totalCost: 0.001,
    toolsCalled: [],
    status: 'success',
    modelUsed: 'gpt-4o',
    ...overrides,
  }
}

function makeSession(overrides: Partial<RawSession> = {}): RawSession {
  return {
    leadScore: null,
    customerJourney: 'new',
    totalAiCost: 0.001,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Cenário: nenhum dado (zero decisions, zero sessions)
// ---------------------------------------------------------------------------

describe('computeInsights — sem dados', () => {
  it('retorna zeros sem lançar erro', () => {
    const result = computeInsights([], [], 24)

    expect(result.turnos).toBe(0)
    expect(result.percentualFallback).toBe(0)
    expect(result.latenciaMediaMs).toBe(0)
    expect(result.custoTotal).toBe(0)
    expect(result.custoPorConversa).toBe(0)
    expect(result.percentualErro).toBe(0)
    expect(result.topTools).toEqual([])
    expect(result.modelosUsados).toEqual([])
    expect(result.conversas).toBe(0)
    expect(result.leadsQualificados).toBe(0)
    expect(result.distribuicaoJornada).toEqual({})
    expect(result.janela).toBe('últimas 24h')
  })
})

// ---------------------------------------------------------------------------
// Cenário: cálculo de percentual fallback e erro
// ---------------------------------------------------------------------------

describe('computeInsights — percentuais', () => {
  it('calcula 50% fallback quando metade dos turnos fez fallback', () => {
    const decisions = [
      makeDecision({ fallbackTriggered: true }),
      makeDecision({ fallbackTriggered: true }),
      makeDecision({ fallbackTriggered: false }),
      makeDecision({ fallbackTriggered: false }),
    ]
    const { percentualFallback } = computeInsights(decisions, [], 24)
    expect(percentualFallback).toBe(50)
  })

  it('calcula 25% de erro quando 1 de 4 turnos falhou', () => {
    const decisions = [
      makeDecision({ status: 'error' }),
      makeDecision(),
      makeDecision(),
      makeDecision(),
    ]
    const { percentualErro } = computeInsights(decisions, [], 24)
    expect(percentualErro).toBe(25)
  })

  it('latência média = média aritmética simples', () => {
    const decisions = [
      makeDecision({ latencyMs: 100 }),
      makeDecision({ latencyMs: 300 }),
    ]
    const { latenciaMediaMs } = computeInsights(decisions, [], 24)
    expect(latenciaMediaMs).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Cenário: custo total e custo por conversa
// ---------------------------------------------------------------------------

describe('computeInsights — custos', () => {
  it('custo total = soma dos turnos', () => {
    const decisions = [
      makeDecision({ totalCost: 0.002 }),
      makeDecision({ totalCost: 0.003 }),
    ]
    const { custoTotal } = computeInsights(decisions, [], 24)
    expect(custoTotal).toBeCloseTo(0.005)
  })

  it('custo/conversa = custoTotal / número de sessões', () => {
    const decisions = [makeDecision({ totalCost: 0.006 })]
    const sessions = [makeSession(), makeSession(), makeSession()]
    const { custoPorConversa } = computeInsights(decisions, sessions, 24)
    expect(custoPorConversa).toBeCloseTo(0.002)
  })

  it('custo/conversa = 0 quando não há sessões', () => {
    const decisions = [makeDecision({ totalCost: 0.01 })]
    const { custoPorConversa } = computeInsights(decisions, [], 24)
    expect(custoPorConversa).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Cenário: top tools
// ---------------------------------------------------------------------------

describe('computeInsights — top tools', () => {
  it('ordena tools por frequência e limita a 5', () => {
    const toolSets = [
      ['get_pricing', 'schedule_meeting'],
      ['get_pricing', 'get_pricing'],
      ['schedule_meeting'],
      ['search_web', 'get_pricing'],
      ['search_web'],
      ['create_lead', 'create_lead', 'create_lead'],
    ]
    const decisions = toolSets.map((toolsCalled) => makeDecision({ toolsCalled }))
    const { topTools } = computeInsights(decisions, [], 24)

    expect(topTools.length).toBeLessThanOrEqual(5)
    // get_pricing aparece 4x, create_lead 3x, schedule_meeting 2x, search_web 2x
    expect(topTools[0]!.tool).toBe('get_pricing')
    expect(topTools[0]!.chamadas).toBe(4)
    expect(topTools[1]!.chamadas).toBe(3) // create_lead
  })

  it('retorna array vazio quando nenhum turno chamou tools', () => {
    const decisions = [makeDecision({ toolsCalled: [] }), makeDecision({ toolsCalled: [] })]
    const { topTools } = computeInsights(decisions, [], 24)
    expect(topTools).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Cenário: distribuição de modelos
// ---------------------------------------------------------------------------

describe('computeInsights — modelosUsados', () => {
  it('conta turnos por modelo e ordena por frequência decrescente', () => {
    const decisions = [
      makeDecision({ modelUsed: 'gpt-4o' }),
      makeDecision({ modelUsed: 'gpt-4o' }),
      makeDecision({ modelUsed: 'claude-3-5-haiku' }),
    ]
    const { modelosUsados } = computeInsights(decisions, [], 24)
    expect(modelosUsados[0]!.modelo).toBe('gpt-4o')
    expect(modelosUsados[0]!.turnos).toBe(2)
    expect(modelosUsados[1]!.modelo).toBe('claude-3-5-haiku')
    expect(modelosUsados[1]!.turnos).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Cenário: leads e jornada
// ---------------------------------------------------------------------------

describe('computeInsights — leads e jornada', () => {
  it('conta apenas leads com score >= 60 como qualificados', () => {
    const sessions = [
      makeSession({ leadScore: 80 }),
      makeSession({ leadScore: 60 }), // exatamente 60 = qualificado
      makeSession({ leadScore: 59 }), // abaixo = não qualificado
      makeSession({ leadScore: null }),
    ]
    const { leadsQualificados } = computeInsights([], sessions, 24)
    expect(leadsQualificados).toBe(2)
  })

  it('agrupa distribuição de jornada por customerJourney', () => {
    const sessions = [
      makeSession({ customerJourney: 'new' }),
      makeSession({ customerJourney: 'new' }),
      makeSession({ customerJourney: 'qualified' }),
      makeSession({ customerJourney: null }),
    ]
    const { distribuicaoJornada } = computeInsights([], sessions, 24)
    expect(distribuicaoJornada['new']).toBe(2)
    expect(distribuicaoJornada['qualified']).toBe(1)
    expect(distribuicaoJornada['desconhecido']).toBe(1)
  })

  it('janela reflete o windowHours passado', () => {
    const { janela } = computeInsights([], [], 48)
    expect(janela).toBe('últimas 48h')
  })
})
