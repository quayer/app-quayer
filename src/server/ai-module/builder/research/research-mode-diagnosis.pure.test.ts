/**
 * research-mode-diagnosis.pure.test — F5 (Modo Pesquisa).
 * Pina: resolução do sujeito, sugestão de capacidades e a tradução
 * NicheInsights → DiagnosisInsights.
 */

import { describe, it, expect } from 'vitest'
import { parseBuilderState } from '../cards/builder-state'
import type { NicheInsights } from '../sub-agents'
import {
  resolveResearchSubject,
  suggestCapabilitiesFromNiche,
  buildDiagnosisInsights,
} from './research-mode-diagnosis.pure'

const NOW = '2026-06-13T12:00:00.000Z'

function insights(overrides: Partial<NicheInsights> = {}): NicheInsights {
  return {
    regulations: [],
    vocabulary: [],
    typicalFlows: [],
    warnings: [],
    sources: [],
    fromLLMKnowledgeOnly: false,
    ...overrides,
  }
}

describe('resolveResearchSubject', () => {
  it('state vazio (sem sinal real) → null (não pesquisa o placeholder genérico)', () => {
    const state = parseBuilderState({})
    expect(resolveResearchSubject(state)).toBeNull()
  })

  it('com descrição de identidade → sujeito com nicho inferido + descrição', () => {
    const state = parseBuilderState({
      identity: { description: 'clínica veterinária no centro de SP' },
    })
    const subject = resolveResearchSubject(state)
    expect(subject).not.toBeNull()
    expect(subject?.description).toContain('clínica veterinária')
    // inferNiche reconhece "vet/animal" como nicho específico (não genérico).
    expect((subject?.nicho ?? '').length).toBeGreaterThan(1)
  })

  it('com nome de projeto, sem descrição → ainda resolve (sinal real)', () => {
    const state = parseBuilderState({ project: { name: 'Imobiliária Alpha' } })
    const subject = resolveResearchSubject(state)
    expect(subject).not.toBeNull()
  })

  it('com serviços da fonte → resolve mesmo sem descrição/nome', () => {
    const state = parseBuilderState({
      sourceIngestion: { sources: [], proposed: { services: ['corte de cabelo'] } },
    })
    expect(resolveResearchSubject(state)).not.toBeNull()
  })
})

describe('suggestCapabilitiesFromNiche', () => {
  it('sempre sugere follow-up (universal)', () => {
    const out = suggestCapabilitiesFromNiche({ nicho: 'barbearia' }, insights())
    expect(out).toContain('Retomar leads que pararam de responder')
  })

  it('nicho com regulamentações → sugere transferir para humano', () => {
    const out = suggestCapabilitiesFromNiche(
      { nicho: 'clínica médica' },
      insights({ regulations: ['CFM veda diagnóstico automatizado'] }),
    )
    expect(out).toContain('Transferir para um humano quando necessário')
  })

  it('fluxos com agendamento → sugere agendar pela conversa', () => {
    const out = suggestCapabilitiesFromNiche(
      { nicho: 'salão' },
      insights({ typicalFlows: ['cliente quer agendar um horário'] }),
    )
    expect(out).toContain('Agendar pela conversa')
  })

  it('sinais de preço → sugere informar preços', () => {
    const out = suggestCapabilitiesFromNiche(
      { nicho: 'loja', description: 'vende pacotes e mensalidade' },
      insights(),
    )
    expect(out).toContain('Informar preços do catálogo')
  })

  it('dedup: não repete capacidades', () => {
    const out = suggestCapabilitiesFromNiche({ nicho: 'x' }, insights())
    expect(new Set(out).size).toBe(out.length)
  })
})

describe('buildDiagnosisInsights', () => {
  it('mapeia warnings+regulations → risks, typicalFlows → bestPractices, sources e lite', () => {
    const subject = { nicho: 'clínica veterinária', description: 'pet shop + clínica' }
    const d = buildDiagnosisInsights(
      subject,
      insights({
        warnings: ['Não prometer cura'],
        regulations: ['CRMV exige responsável técnico'],
        typicalFlows: ['Agendamento de consulta'],
        vocabulary: ['anamnese'],
        sources: [{ title: 'CRMV', url: 'https://crmv.example' }],
        fromLLMKnowledgeOnly: false,
      }),
      NOW,
    )
    expect(d.detectedBusiness).toContain('clínica veterinária')
    expect(d.risks).toEqual(['Não prometer cura', 'CRMV exige responsável técnico'])
    expect(d.bestPractices).toEqual(['Agendamento de consulta'])
    expect(d.sources).toEqual([{ title: 'CRMV', url: 'https://crmv.example' }])
    expect(d.lite).toBe(false)
    expect(d.generatedAt).toBe(NOW)
    expect(d.recommendedCapabilities.length).toBeGreaterThan(0)
  })

  it('fromLLMKnowledgeOnly → lite:true e sources vazias', () => {
    const d = buildDiagnosisInsights(
      { nicho: 'barbearia' },
      insights({ fromLLMKnowledgeOnly: true, typicalFlows: ['atendimento'] }),
      NOW,
    )
    expect(d.lite).toBe(true)
    expect(d.sources).toEqual([])
  })

  it('descarta fontes sem url e dedup/clampa listas', () => {
    const d = buildDiagnosisInsights(
      { nicho: 'x' },
      insights({
        warnings: ['a', 'a', 'b'],
        sources: [
          { title: 'sem url', url: '   ' },
          { title: 'ok', url: 'https://ok.example' },
        ],
      }),
      NOW,
    )
    expect(d.risks).toEqual(['a', 'b'])
    expect(d.sources).toEqual([{ title: 'ok', url: 'https://ok.example' }])
  })
})
