/**
 * research-mode-diagnosis.service.test — F5/F5+ (Modo Pesquisa + Motor de Estratégia).
 *
 * Cobre a orquestração fail-open com deps FAKE (sem mock de módulo):
 *   1. sucesso → persiste estratégia + insights (researchOk:true, lite:false);
 *   2. sem Tavily (fromLLMKnowledgeOnly) → insights lite (lite:true);
 *   3. sub-agente FALHOU → ainda persiste a ESTRATÉGIA (determinística), researchOk:false;
 *   4. sem conversa / sem sujeito → no-op auditável (não persiste);
 *   5. persist falhou → fail-open ('persist_failed'), NÃO lança;
 *   6. runResearch LANÇOU → fail-open total (estratégia não persistida → persist_failed).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseBuilderState } from '../cards/builder-state'
import type { NicheInsights } from '../sub-agents'
import type { SubAgentResult } from '../sub-agents/types'
import {
  runResearchModeDiagnosis,
  type ResearchDiagnosisDeps,
} from './research-mode-diagnosis.service'

const ORG = 'org-1'
const PROJECT = 'proj-1'
const NOW = new Date('2026-06-13T12:00:00.000Z')

function nicheInsights(overrides: Partial<NicheInsights> = {}): NicheInsights {
  return {
    regulations: [],
    vocabulary: [],
    typicalFlows: ['Atendimento típico'],
    warnings: [],
    sources: [{ title: 'Fonte', url: 'https://fonte.example' }],
    fromLLMKnowledgeOnly: false,
    ...overrides,
  }
}

function stateWithSubject() {
  return parseBuilderState({
    identity: { description: 'clínica veterinária no centro' },
  })
}

interface Fakes {
  deps: ResearchDiagnosisDeps
  loadConversationState: ReturnType<typeof vi.fn>
  runResearch: ReturnType<typeof vi.fn>
  persistDiagnosis: ReturnType<typeof vi.fn>
}

function makeDeps(opts: {
  state?: ReturnType<typeof parseBuilderState> | null
  research?: SubAgentResult<NicheInsights> | (() => Promise<never>)
  persistThrows?: boolean
}): Fakes {
  const loadConversationState = vi.fn(async () =>
    opts.state === null
      ? null
      : { conversationId: 'conv-1', state: opts.state ?? stateWithSubject() },
  )
  const okFallback: SubAgentResult<NicheInsights> = {
    success: true,
    data: nicheInsights(),
    durationMs: 1,
  }
  const runResearch = vi.fn(
    async (): Promise<SubAgentResult<NicheInsights>> => {
      if (typeof opts.research === 'function') return opts.research()
      return opts.research ?? okFallback
    },
  )
  const persistDiagnosis = vi.fn(async () => {
    if (opts.persistThrows) throw new Error('db down')
  })
  return {
    deps: {
      loadConversationState,
      runResearch,
      resolveCalendarConnected: vi.fn(async () => false),
      persistDiagnosis,
      now: () => NOW,
    },
    loadConversationState,
    runResearch,
    persistDiagnosis,
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('runResearchModeDiagnosis', () => {
  it('sucesso → persiste estratégia + insights (researchOk:true, lite:false)', async () => {
    const f = makeDeps({})
    const r = await runResearchModeDiagnosis(
      { projectId: PROJECT, organizationId: ORG },
      f.deps,
    )
    expect(r).toEqual({ ran: true, researchOk: true, lite: false })
    expect(f.persistDiagnosis).toHaveBeenCalledTimes(1)
    const arg = f.persistDiagnosis.mock.calls[0][0]
    expect(arg.conversationId).toBe('conv-1')
    expect(arg.organizationId).toBe(ORG)
    // estratégia SEMPRE persistida
    expect(arg.strategy.selectedStrategy.length).toBeGreaterThan(0)
    expect(arg.strategy.generatedAt).toBe(NOW.toISOString())
    // insights presentes no sucesso
    expect(arg.insights.sources).toEqual([
      { title: 'Fonte', url: 'https://fonte.example' },
    ])
  })

  it('sem Tavily (fromLLMKnowledgeOnly) → insights lite (lite:true)', async () => {
    const f = makeDeps({
      research: {
        success: true,
        data: nicheInsights({ fromLLMKnowledgeOnly: true, sources: [] }),
        durationMs: 1,
      },
    })
    const r = await runResearchModeDiagnosis(
      { projectId: PROJECT, organizationId: ORG },
      f.deps,
    )
    expect(r).toEqual({ ran: true, researchOk: true, lite: true })
  })

  it('sub-agente falhou → ainda persiste ESTRATÉGIA (researchOk:false), sem insights', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = makeDeps({
      research: { success: false, error: 'LLM down', durationMs: 1 },
    })
    const r = await runResearchModeDiagnosis(
      { projectId: PROJECT, organizationId: ORG },
      f.deps,
    )
    expect(r).toEqual({ ran: true, researchOk: false })
    expect(f.persistDiagnosis).toHaveBeenCalledTimes(1)
    const arg = f.persistDiagnosis.mock.calls[0][0]
    expect(arg.strategy.selectedStrategy.length).toBeGreaterThan(0)
    expect(arg.insights).toBeUndefined()
  })

  it('sem conversa → ran:false no_conversation (não roda pesquisa)', async () => {
    const f = makeDeps({ state: null })
    const r = await runResearchModeDiagnosis(
      { projectId: PROJECT, organizationId: ORG },
      f.deps,
    )
    expect(r).toEqual({ ran: false, reason: 'no_conversation' })
    expect(f.runResearch).not.toHaveBeenCalled()
  })

  it('sem sujeito (state vazio) → ran:false no_subject (não roda pesquisa)', async () => {
    const f = makeDeps({ state: parseBuilderState({}) })
    const r = await runResearchModeDiagnosis(
      { projectId: PROJECT, organizationId: ORG },
      f.deps,
    )
    expect(r).toEqual({ ran: false, reason: 'no_subject' })
    expect(f.runResearch).not.toHaveBeenCalled()
  })

  it('persist falhou → ran:false persist_failed, NÃO lança', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = makeDeps({ persistThrows: true })
    const r = await runResearchModeDiagnosis(
      { projectId: PROJECT, organizationId: ORG },
      f.deps,
    )
    expect(r).toEqual({ ran: false, reason: 'persist_failed' })
  })

  it('runResearch LANÇOU → fail-open total (persist_failed, nunca bloqueia)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const f = makeDeps({
      research: () => Promise.reject(new Error('boom')),
    })
    const r = await runResearchModeDiagnosis(
      { projectId: PROJECT, organizationId: ORG },
      f.deps,
    )
    expect(r).toEqual({ ran: false, reason: 'persist_failed' })
  })
})
