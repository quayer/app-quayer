/**
 * Tests for the pure capability recommender `recommendAgentCapabilities`
 * (FR-51/FR-52/NFR-13 — `specs/jornada-builder-v2/mission-first-v3.md`).
 *
 * Hermetic: no DB, no mocks — the recommender is pure. We drive it with crafted
 * `BuilderState` (built via `parseBuilderState` + `patchBuilderState`) and the
 * `RecommendCapabilitiesInputs` envelope (the non-state insumos of getCapabilities).
 *
 * FONTE PRIMÁRIA = Playbook Engine (FR-40): a partir de mission.role/objective +
 * nicho inferido, `resolveAgentStrategy` escolhe a AgentStrategy curada e seu
 * `recommendedTools[]` vira a pré-marcação. O blueprint é fonte SECUNDÁRIA (merge).
 *
 * Covers:
 *   - SDR imobiliário/qualificar → strategy recomenda transfer_to_human +
 *     create_lead + agenda de visita, com gate de conexão de calendário;
 *   - SDR SaaS/qualificar → a strategy (não o blueprint) é quem traz a agenda;
 *   - clínica/secretária + agendar → a strategy traz agenda+confirmar
 *     (check_availability/create_event/cancel_event), exige 'calendar_connection'
 *     + risco quando NÃO conectada (FR-11) e perde o requisito/risco ao conectar;
 *   - suporte mission → handoff recomendado, sem agenda;
 *   - missão ausente → fallback (transfer_to_human + create_lead), nunca throw;
 *   - every recommended id exists in the OFFICIAL_TOOLS catalog (FR-51);
 *   - READ-ONLY invariant: the input BuilderState is never mutated.
 */

import { describe, it, expect } from 'vitest'
import {
  parseBuilderState,
  patchBuilderState,
  type BuilderState,
} from '../cards/builder-state'
import { OFFICIAL_TOOLS } from '../catalog/official-tools'
import {
  recommendAgentCapabilities,
  type CapabilityRecommendation,
} from './recommend-capabilities.pure'

const OFFICIAL_NAMES = new Set(OFFICIAL_TOOLS.map((t) => t.name))

function baseState(patch: Parameters<typeof patchBuilderState>[1] = {}): BuilderState {
  return patchBuilderState(parseBuilderState({}), patch)
}

function byId(
  recs: readonly CapabilityRecommendation[],
  id: string,
): CapabilityRecommendation | undefined {
  return recs.find((r) => r.id === id)
}

describe('recommendAgentCapabilities', () => {
  it('SDR imobiliário/qualificar: strategy recomenda lead, transfer e agenda com gate de conexão', () => {
    const state = baseState({
      mission: { key: 'sdr_qualificar', role: 'sdr', objective: 'qualificar', addons: [], custom: false },
      project: { objective: 'Captar e qualificar leads de imóveis' },
      identity: { description: 'Imobiliária que capta interessados em imóveis.' },
      conversationBlueprint: {
        status: 'proposed',
        stages: [],
        questions: [],
        variables: [],
        skipRules: [],
        successCriteria: ['Lead qualificado e encaminhado.'],
        handoffTriggers: ['Lead pede atendimento com consultor.'],
        toolTriggers: [],
        objectionRules: [],
        doRules: [],
        dontRules: [],
        sourceRefs: [],
      },
    })

    const recs = recommendAgentCapabilities(state, { calendarConnected: false })

    // FONTE PRIMÁRIA = strategy SDR/imobiliário: create_lead + agenda + transfer + followup.
    expect(byId(recs, 'transfer_to_human')?.kind).toBe('recommended')
    expect(byId(recs, 'create_lead')?.kind).toBe('recommended')
    expect(byId(recs, 'create_followup')).toBeDefined()
    expect(byId(recs, 'calendar_list_slots')?.kind).toBe('recommended')
    expect(byId(recs, 'check_availability')?.kind).toBe('recommended')
    expect(byId(recs, 'create_event')?.kind).toBe('recommended')
    expect(byId(recs, 'calendar_list_slots')?.requires).toContain(
      'calendar_connection',
    )
    expect(byId(recs, 'check_availability')?.requires).toContain(
      'calendar_connection',
    )
    expect(byId(recs, 'create_event')?.requires).toContain('calendar_connection')
    expect(byId(recs, 'check_availability')?.risk).toBeTruthy()
  })

  it('SDR SaaS/qualificar: a strategy (não o blueprint) é quem traz a agenda', () => {
    const state = baseState({
      mission: { key: 'sdr_qualificar', role: 'sdr', objective: 'qualificar', addons: [], custom: false },
      identity: { description: 'Empresa de software B2B (SaaS) que marca diagnósticos.' },
      // SEM conversationBlueprint: a única fonte de agenda aqui é a strategy SaaS.
    })

    const recs = recommendAgentCapabilities(state, { calendarConnected: true })

    // A strategy SDR/SaaS recomenda agenda + create_lead + transfer.
    expect(byId(recs, 'create_lead')?.kind).toBe('recommended')
    expect(byId(recs, 'transfer_to_human')?.kind).toBe('recommended')
    expect(byId(recs, 'check_availability')?.kind).toBe('recommended')
    expect(byId(recs, 'create_event')?.kind).toBe('recommended')
    // Conectada → agenda sem requisito/risco (FR-11).
    expect(byId(recs, 'check_availability')?.requires).not.toContain('calendar_connection')
    expect(byId(recs, 'check_availability')?.risk).toBeUndefined()
  })

  it('clínica + agenda no blueprint exige conexão e marca risco quando desconectada (FR-11)', () => {
    const state = baseState({
      mission: { key: 'secretaria_agendar', role: 'secretaria', objective: 'agendar', addons: [], custom: false },
      identity: { description: 'Clínica odontológica que agenda consultas e avaliações.' },
      conversationBlueprint: {
        status: 'proposed',
        stages: [],
        questions: [],
        variables: [],
        skipRules: [],
        successCriteria: ['Consulta agendada com o paciente.'],
        handoffTriggers: [],
        toolTriggers: [
          {
            capability: 'Consultar horários da agenda',
            toolKey: 'check_availability',
            when: 'Quando o paciente quer marcar uma consulta.',
            requiredVariables: [],
            active: false,
          },
        ],
        objectionRules: [],
        doRules: [],
        dontRules: [],
        sourceRefs: [],
      },
    })

    const disconnected = recommendAgentCapabilities(state, { calendarConnected: false })
    const availDisc = byId(disconnected, 'check_availability')
    expect(availDisc?.kind).toBe('recommended')
    expect(availDisc?.requires).toContain('calendar_connection')
    expect(availDisc?.risk).toBeTruthy()
    expect(byId(disconnected, 'create_event')?.requires).toContain('calendar_connection')
    // A strategy de secretária/clínica também traz CONFIRMAR/remarcar (cancel_event),
    // que o blueprint NÃO gatilhou — prova de que a fonte primária é a strategy.
    expect(byId(disconnected, 'cancel_event')?.kind).toBe('recommended')
    expect(byId(disconnected, 'cancel_event')?.requires).toContain('calendar_connection')

    const connected = recommendAgentCapabilities(state, { calendarConnected: true })
    const availConn = byId(connected, 'check_availability')
    expect(availConn?.requires).not.toContain('calendar_connection')
    expect(availConn?.risk).toBeUndefined()
    expect(byId(connected, 'cancel_event')?.requires).not.toContain('calendar_connection')
  })

  it('missão de suporte recomenda transferência mas não agenda', () => {
    const state = baseState({
      mission: { key: 'suporte_resolver', role: 'suporte', objective: 'suportar', addons: [], custom: false },
      project: { objective: 'Tirar dúvidas e dar suporte aos clientes' },
      conversationBlueprint: {
        status: 'proposed',
        stages: [],
        questions: [],
        variables: [],
        skipRules: [],
        successCriteria: ['Dúvida resolvida ou encaminhada.'],
        handoffTriggers: ['Cliente pede falar com a equipe.'],
        toolTriggers: [],
        objectionRules: [],
        doRules: [],
        dontRules: [],
        sourceRefs: [],
      },
    })

    const recs = recommendAgentCapabilities(state, { calendarConnected: true })

    expect(byId(recs, 'transfer_to_human')).toBeDefined()
    expect(byId(recs, 'check_availability')).toBeUndefined()
    expect(byId(recs, 'create_event')).toBeUndefined()
  })

  it('missão ausente cai para fallback genérico sem lançar', () => {
    const state = baseState({}) // sem mission, sem conversationBlueprint
    expect(state.mission).toBeUndefined()

    let recs: CapabilityRecommendation[] = []
    expect(() => {
      recs = recommendAgentCapabilities(state, { calendarConnected: false })
    }).not.toThrow()

    expect(byId(recs, 'transfer_to_human')).toBeDefined()
    expect(byId(recs, 'create_lead')).toBeDefined()
  })

  it('todo id recomendado existe no catálogo OFFICIAL_TOOLS (FR-51)', () => {
    const state = baseState({
      mission: { key: 'sdr_qualificar', role: 'sdr', objective: 'agendar', addons: ['agenda'], custom: false },
      identity: { description: 'Imobiliária que agenda visitas.' },
    })

    const recs = recommendAgentCapabilities(state, { calendarConnected: true })

    expect(recs.length).toBeGreaterThan(0)
    for (const rec of recs) {
      expect(OFFICIAL_NAMES.has(rec.id)).toBe(true)
    }
    // Sem ids duplicados (sanitize dedup).
    const ids = recs.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('é READ-ONLY: não muta o BuilderState de entrada', () => {
    const state = baseState({
      mission: { key: 'sdr_qualificar', role: 'sdr', objective: 'qualificar', addons: [], custom: false },
    })
    const snapshot = JSON.stringify(state)

    recommendAgentCapabilities(state, { calendarConnected: false })

    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('detecta risco de fonte 100% vendida e anexa às sugestões de SDR', () => {
    const state = baseState({
      mission: { key: 'sdr_qualificar', role: 'sdr', objective: 'qualificar', addons: [], custom: false },
      identity: { description: 'Empreendimento 100% vendido; captar lista de interesse.' },
    })

    const recs = recommendAgentCapabilities(state, { calendarConnected: false })

    expect(byId(recs, 'create_lead')?.risk).toBeTruthy()
    expect(byId(recs, 'transfer_to_human')?.risk).toBeTruthy()
  })
})
