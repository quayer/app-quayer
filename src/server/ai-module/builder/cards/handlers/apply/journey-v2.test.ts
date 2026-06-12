/**
 * T63 (jornada-builder-v2, Onda 2) — unit do handler `applyBusinessIdentity`.
 *
 * Estratégia espelha `set-project-basics.tool.test.ts`: mock de
 * `@/server/services/database` (sem DB real) com um `$transaction` que invoca o
 * callback IMEDIATAMENTE com um `tx` cujos métodos são os mesmos mocks hoisted —
 * assim asseguramos os reads/writes feitos DENTRO da transação. O funil
 * (`trackJourneyEvent`) é mockado à parte para provar a emissão de `identity_done`
 * sem tocar o DB.
 *
 * Cobre (critério da tarefa):
 *   - espelha `name` no projeto (write transacional org-scoped: builderState +
 *     builder_projects.name num único $transaction);
 *   - flipa o sentinel `businessIdentity` via applyConfirmation;
 *   - sanitização server-side (trim + clamp de name/address/description; vazio →
 *     undefined; name ausente → invalid sem nenhum write);
 *   - `identity_done` emitido (mock do trackJourneyEvent, com a journeyVersion
 *     congelada do state);
 *   - cross-org: TODO write é filtrado por organizationId (boundary de tenant).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks (registrados antes de qualquer import que os toque)
// ---------------------------------------------------------------------------

const mockConvFindFirst = vi.hoisted(() => vi.fn())
const mockConvFindUnique = vi.hoisted(() => vi.fn())
const mockConvUpdateMany = vi.hoisted(() => vi.fn())
const mockProjectFindFirst = vi.hoisted(() => vi.fn())
const mockProjectUpdateMany = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockTrackJourneyEvent = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => {
  const tx = {
    builderProjectConversation: {
      findFirst: mockConvFindFirst,
      updateMany: mockConvUpdateMany,
    },
    builderProject: {
      findFirst: mockProjectFindFirst,
      updateMany: mockProjectUpdateMany,
    },
  }
  return {
    database: {
      ...tx,
      // `applySentinelAck` (test_drive/published_next_steps) resolve a posse da
      // conversa pelo `projectId @unique` ANTES da transação — fora do tx mock.
      builderProjectConversation: {
        ...tx.builderProjectConversation,
        findUnique: mockConvFindUnique,
      },
      $transaction: mockTransaction.mockImplementation(
        async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      ),
    },
  }
})

vi.mock('@/server/services/journey-events', () => ({
  trackJourneyEvent: mockTrackJourneyEvent,
}))

// ---------------------------------------------------------------------------
// Imports após o registro dos mocks
// ---------------------------------------------------------------------------

import {
  applyBusinessIdentity,
  applyAgentReview,
  applyChannelPlatform,
  applyTestDrive,
  applyPublishedNextSteps,
} from './journey-v2'
import {
  parseBuilderState,
  patchBuilderState,
  type BuilderState,
} from '../../builder-state'
import type {
  AgentReviewPayload,
  ChannelPlatformPayload,
  TestDrivePayload,
} from '../../card-submit.schemas'
import { getIdentityCardFromMetadata } from '@/lib/agent-identity-card'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONV_ID = 'conv-1'
const PROJECT_ID = 'proj-1'
const ORG_ID = 'org-1'

/** Estado v2 com subtrees não-relacionados que DEVEM sobreviver ao patch. */
function v2State(): BuilderState {
  return patchBuilderState(parseBuilderState(undefined), {
    journeyVersion: 2,
    persona: { tone: 'cordial' },
    confirmations: { persona: true },
  })
}

/** Atalho: chama o handler com defaults dos ids + estado-base. */
function submit(
  payload: { name?: string; address?: string; description?: string },
  current: BuilderState = v2State(),
) {
  return applyBusinessIdentity({
    conversationId: CONV_ID,
    projectId: PROJECT_ID,
    organizationId: ORG_ID,
    current,
    // O schema garante `name: string` em runtime; aqui exercitamos o clamp/guard
    // server-side passando inputs já validados/limítrofes.
    payload: payload as { name: string; address?: string; description?: string },
  })
}

/** O builderState gravado no (único) updateMany da conversa. */
function writtenConvState(): BuilderState {
  expect(mockConvUpdateMany).toHaveBeenCalledOnce()
  const call = mockConvUpdateMany.mock.calls[0]![0] as {
    where: { id: string; organizationId: string }
    data: { builderState: BuilderState }
  }
  return call.data.builderState
}

describe('applyBusinessIdentity — T63 (FR-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // findFirst dentro da tx devolve o estado fresco; updateMany conta 1 linha.
    mockConvFindFirst.mockResolvedValue({ builderState: v2State() })
    mockConvUpdateMany.mockResolvedValue({ count: 1 })
    mockProjectUpdateMany.mockResolvedValue({ count: 1 })
    // $transaction re-arma o impl (clearAllMocks limpa a implementação).
    mockTransaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) =>
        fn({
          builderProjectConversation: {
            findFirst: mockConvFindFirst,
            updateMany: mockConvUpdateMany,
          },
          builderProject: { updateMany: mockProjectUpdateMany },
        }),
    )
    mockTrackJourneyEvent.mockResolvedValue(undefined)
  })

  // -------------------------------------------------------------------------
  // Espelho do nome + flip do sentinel (write transacional org-scoped)
  // -------------------------------------------------------------------------
  it('espelha name no builderState E em builder_projects.name (org-scoped, num único $transaction)', async () => {
    const res = await submit({ name: 'Barbearia do Zé' })

    expect(res.ok).toBe(true)
    // Tudo aconteceu dentro de UMA transação.
    expect(mockTransaction).toHaveBeenCalledOnce()

    // builderState.project.name gravado; subtrees não-relacionados preservados.
    const next = writtenConvState()
    expect(next.project.name).toBe('Barbearia do Zé')
    expect(next.persona.tone).toBe('cordial')
    expect(next.confirmations.persona).toBe(true)

    // Espelho na linha do projeto, sempre filtrado por organizationId.
    expect(mockProjectUpdateMany).toHaveBeenCalledOnce()
    expect(mockProjectUpdateMany).toHaveBeenCalledWith({
      where: { id: PROJECT_ID, organizationId: ORG_ID },
      data: { name: 'Barbearia do Zé' },
    })
  })

  it('flipa o sentinel confirmations.businessIdentity', async () => {
    const res = await submit({ name: 'Clínica Sorriso' })

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    expect(next.confirmations.businessIdentity).toBe(true)
  })

  it('grava identity.address/description quando presentes', async () => {
    await submit({
      name: 'Estúdio Aurora',
      address: 'Rua das Flores, 123, Centro, São Paulo',
      description: 'Estúdio de tatuagem autoral.',
    })

    const next = writtenConvState()
    expect(next.identity.address).toBe('Rua das Flores, 123, Centro, São Paulo')
    expect(next.identity.description).toBe('Estúdio de tatuagem autoral.')
  })

  it('só com name: identity fica vazia (nunca inventa endereço/descrição)', async () => {
    await submit({ name: 'Loja X' })

    const next = writtenConvState()
    expect(next.identity).toEqual({})
  })

  // -------------------------------------------------------------------------
  // Sanitização server-side (trim + clamp; vazio → undefined; name obrigatório)
  // -------------------------------------------------------------------------
  it('aplica trim em name/address/description antes de gravar', async () => {
    await submit({
      name: '  Padaria Pão Quente  ',
      address: '  Av. Brasil, 1000  ',
      description: '  Pães artesanais.  ',
    })

    const next = writtenConvState()
    expect(next.project.name).toBe('Padaria Pão Quente')
    expect(next.identity.address).toBe('Av. Brasil, 1000')
    expect(next.identity.description).toBe('Pães artesanais.')
  })

  it('clampa name a 80, address a 300 e description a 500 chars', async () => {
    await submit({
      name: 'n'.repeat(120),
      address: 'a'.repeat(400),
      description: 'd'.repeat(700),
    })

    const next = writtenConvState()
    expect(next.project.name).toHaveLength(80)
    expect(next.identity.address).toHaveLength(300)
    expect(next.identity.description).toHaveLength(500)
    // O espelho do projeto recebe o name JÁ clampado (mesmo valor sanitizado).
    expect(mockProjectUpdateMany).toHaveBeenCalledWith({
      where: { id: PROJECT_ID, organizationId: ORG_ID },
      data: { name: 'n'.repeat(80) },
    })
  })

  it('address/description só-espaço viram undefined (não gravam identity)', async () => {
    await submit({ name: 'Café Central', address: '   ', description: '\t\n' })

    const next = writtenConvState()
    expect(next.identity).toEqual({})
  })

  it('name vazio/só-espaço → invalid, sem NENHUM write nem evento', async () => {
    const res = await submit({ name: '   ' })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('invalid')
      expect(res.message).toMatch(/nome do negócio é obrigatório/i)
    }
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
    expect(mockProjectUpdateMany).not.toHaveBeenCalled()
    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Evento de funil identity_done
  // -------------------------------------------------------------------------
  it('emite identity_done com a journeyVersion congelada do state', async () => {
    await submit({ name: 'Petshop Latido' })

    expect(mockTrackJourneyEvent).toHaveBeenCalledOnce()
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      journeyVersion: 2,
      event: 'identity_done',
    })
  })

  it('emite o evento DEPOIS do write da identidade (ordem do contrato)', async () => {
    // O write transacional precede a telemetria — se o write falhar, o evento
    // de "identidade pronta" nunca é emitido (não anunciamos algo não-gravado).
    const order: string[] = []
    mockConvUpdateMany.mockImplementationOnce(async () => {
      order.push('write')
      return { count: 1 }
    })
    mockTrackJourneyEvent.mockImplementationOnce(async () => {
      order.push('event')
    })

    await submit({ name: 'Floricultura Bela' })

    expect(order).toEqual(['write', 'event'])
  })

  // -------------------------------------------------------------------------
  // Boundary de tenant — todo write filtrado por organizationId
  // -------------------------------------------------------------------------
  it('cross-org: leitura e escrita da conversa SEMPRE filtram por organizationId', async () => {
    await submit({ name: 'Mercado do Bairro' })

    // O read fresco dentro da tx é org-scoped.
    expect(mockConvFindFirst).toHaveBeenCalledWith({
      where: { id: CONV_ID, organizationId: ORG_ID },
      select: { builderState: true },
    })
    // O write da conversa é org-scoped.
    const convCall = mockConvUpdateMany.mock.calls[0]![0] as {
      where: { id: string; organizationId: string }
    }
    expect(convCall.where).toEqual({ id: CONV_ID, organizationId: ORG_ID })
    // O espelho do projeto é org-scoped.
    const projCall = mockProjectUpdateMany.mock.calls[0]![0] as {
      where: { id: string; organizationId: string }
    }
    expect(projCall.where).toEqual({ id: PROJECT_ID, organizationId: ORG_ID })
  })

  it('cross-org: read fresco vazio (conversa de outra org) cai no fallback do current sem clobber', async () => {
    // findFirst filtrado por org alheia não acha → handler usa `current` (não
    // dropa o write) mas continua escrevendo SÓ no escopo do org do caller.
    mockConvFindFirst.mockResolvedValueOnce(null)

    const res = await submit({ name: 'Oficina Veloz' })

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    expect(next.project.name).toBe('Oficina Veloz')
    expect(next.confirmations.businessIdentity).toBe(true)
    // herda do `current` (state v2 fornecido), provando que não houve clobber.
    expect(next.journeyVersion).toBe(2)
    expect(next.persona.tone).toBe('cordial')
  })
})

// ===========================================================================
// T66 (jornada-builder-v2, Onda 3) — unit do handler `applyAgentReview`.
//
// O `agent_review` é o card COMPOSTO da fase Revisar: funde persona + serviços +
// horários + aprovação da criação numa ÚNICA confirmação consolidada (NFR-07:
// 1 decisão/1 ACK em vez de 4) e opcionalmente aplica o disclosure no MESMO handler.
// Os mocks de `database`
// e `journey-events` são os mesmos do bloco acima; o lib `agent-identity-card` é
// PURO e usado de verdade (prova o merge real do disclosure no metadata).
//
// Cobre (critério da tarefa T66):
//   - exatamente 4 sentinels (persona/services/hours/agentApproved) flipados em UM único write;
//   - clearCapturedProposals chamado nos 3 domínios (zumbi removido do JSONB);
//   - disclosure aplicado no metadata.identityCard (1 POST real, sem 2º request);
//   - erro em UMA seção → { errors: { <secao> } } SEM nenhum write parcial;
//   - review_done emitido (mock do trackJourneyEvent);
//   - default de horários NÃO vive no handler (body com schedule não-vazio é o que
//     destrava `hours`; preset/schedule vazios → erro granular `hours`).
// ===========================================================================

/** Payload válido base do agent_review (as 3 seções preenchidas). */
function reviewPayload(
  overrides: Partial<AgentReviewPayload> = {},
): AgentReviewPayload {
  return {
    cardKey: 'agent_review',
    persona: { name: 'Marina', tone: 'cordial' },
    offered: ['corte', 'barba'],
    notOffered: ['coloração'],
    preset: 'comercial',
    schedule: undefined,
    timezone: 'America/Sao_Paulo',
    outOfHours: undefined,
    ...overrides,
  }
}

/** Atalho: chama o handler de review com defaults dos ids + estado-base. */
function submitReview(
  payload: AgentReviewPayload = reviewPayload(),
  current: BuilderState = patchBuilderState(parseBuilderState(undefined), {
    journeyVersion: 2,
  }),
) {
  return applyAgentReview({
    conversationId: CONV_ID,
    projectId: PROJECT_ID,
    organizationId: ORG_ID,
    current,
    payload,
  })
}

/** Estado v2 com propostas capturadas nos 3 domínios (devem ser limpas no submit). */
function v2StateWithProposals(): BuilderState {
  return patchBuilderState(parseBuilderState(undefined), {
    journeyVersion: 2,
    capturedProposals: {
      persona: { tone: 'descontraído' },
      services: { offered: ['corte sugerido'] },
      hours: { preset: 'comercial' },
    },
  })
}

describe('applyAgentReview — T66 (FR-05/FR-22)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConvFindFirst.mockResolvedValue({
      builderState: patchBuilderState(parseBuilderState(undefined), {
        journeyVersion: 2,
      }),
    })
    mockConvUpdateMany.mockResolvedValue({ count: 1 })
    mockProjectFindFirst.mockResolvedValue({ metadata: {} })
    mockProjectUpdateMany.mockResolvedValue({ count: 1 })
    // $transaction re-arma o impl COM builderProject.findFirst (path do disclosure).
    mockTransaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) =>
        fn({
          builderProjectConversation: {
            findFirst: mockConvFindFirst,
            updateMany: mockConvUpdateMany,
          },
          builderProject: {
            findFirst: mockProjectFindFirst,
            updateMany: mockProjectUpdateMany,
          },
        }),
    )
    mockTrackJourneyEvent.mockResolvedValue(undefined)
  })

  // -------------------------------------------------------------------------
  // 4 sentinels num único write
  // -------------------------------------------------------------------------
  it('flipa persona+services+hours+agentApproved num ÚNICO updateMany org-scoped', async () => {
    const res = await submitReview()

    expect(res.ok).toBe(true)
    // Tudo numa só transação, com UM write de conversa (4 flips, 1 write).
    expect(mockTransaction).toHaveBeenCalledOnce()
    expect(mockConvUpdateMany).toHaveBeenCalledOnce()

    const next = writtenConvState()
    expect(next.confirmations.persona).toBe(true)
    expect(next.confirmations.services).toBe(true)
    expect(next.confirmations.hours).toBe(true)
    expect(next.confirmations.agentApproved).toBe(true)
    // Nenhum sentinel de capacidades/canais é tocado por este handler.
    expect(next.confirmations.businessIdentity).toBe(false)
    expect(next.confirmations.pricing).toBe(false)
    expect(next.confirmations.handoff).toBe(false)
    expect(next.confirmations.channelPlatform).toBe(false)

    // O write é sempre org-scoped.
    const convCall = mockConvUpdateMany.mock.calls[0]![0] as {
      where: { id: string; organizationId: string }
    }
    expect(convCall.where).toEqual({ id: CONV_ID, organizationId: ORG_ID })
  })

  it('grava os campos OWNED de cada seção no MESMO write', async () => {
    await submitReview(
      reviewPayload({
        persona: { name: 'Marina', tone: 'cordial', style: 'objetivo' },
        offered: ['corte', 'barba'],
        notOffered: ['coloração'],
        preset: 'comercial',
        timezone: 'America/Sao_Paulo',
      }),
    )

    const next = writtenConvState()
    expect(next.persona.name).toBe('Marina')
    expect(next.persona.tone).toBe('cordial')
    expect(next.persona.style).toBe('objetivo')
    expect(next.services.offered).toEqual(['corte', 'barba'])
    expect(next.services.notOffered).toEqual(['coloração'])
    expect(next.hours.preset).toBe('comercial')
    expect(next.hours.timezone).toBe('America/Sao_Paulo')
  })

  it('carimba proposal.{name,description} e autoriza create_agent no mesmo write', async () => {
    mockConvFindFirst.mockResolvedValueOnce({
      builderState: patchBuilderState(parseBuilderState(undefined), {
        journeyVersion: 2,
        project: {
          name: 'Vibra Butantã',
          objective: 'Captar leads interessados no empreendimento',
        },
      }),
    })

    const res = await submitReview(
      reviewPayload({
        persona: { name: 'SDR Vibra', tone: 'consultivo' },
        offered: ['plantas', 'localização', 'visitas'],
      }),
    )

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    expect(next.proposal.name).toBe('SDR Vibra')
    expect(next.proposal.description).toContain(
      'Captar leads interessados no empreendimento',
    )
    expect(next.proposal.description).toContain('plantas, localização, visitas')
    expect(next.confirmations.agentApproved).toBe(true)
    if (res.ok) {
      expect(res.cardInstruction).toMatch(/prossiga com create_agent/i)
      expect(res.cardInstruction).toMatch(/não peça nova aprovação/i)
    }
  })

  it('preserva proposal já proposto pelo LLM ao aprovar no review', async () => {
    mockConvFindFirst.mockResolvedValueOnce({
      builderState: patchBuilderState(parseBuilderState(undefined), {
        journeyVersion: 2,
        proposal: {
          name: 'Consultor Vibra Butantã',
          description: 'Qualifica leads do Vibra Butantã e encaminha para vendas.',
        },
      }),
    })

    await submitReview()

    const next = writtenConvState()
    expect(next.proposal.name).toBe('Consultor Vibra Butantã')
    expect(next.proposal.description).toBe(
      'Qualifica leads do Vibra Butantã e encaminha para vendas.',
    )
  })

  // -------------------------------------------------------------------------
  // clearCapturedProposals nos 3 domínios
  // -------------------------------------------------------------------------
  it('limpa capturedProposals.{persona,services,hours} (zumbi removido do JSONB)', async () => {
    // O read fresco da tx devolve um state COM propostas capturadas nos 3 domínios.
    mockConvFindFirst.mockResolvedValueOnce({
      builderState: v2StateWithProposals(),
    })

    await submitReview()

    const next = writtenConvState()
    // O namespace inteiro some quando todos os domínios são limpos (sem `{}` órfão).
    expect(next.capturedProposals).toBeUndefined()
  })

  it('limpa só os 3 domínios da review; outras propostas (ex. pricing) sobrevivem', async () => {
    mockConvFindFirst.mockResolvedValueOnce({
      builderState: patchBuilderState(parseBuilderState(undefined), {
        journeyVersion: 2,
        capturedProposals: {
          persona: { tone: 'descontraído' },
          services: { offered: ['corte sugerido'] },
          hours: { preset: 'comercial' },
          pricing: { items: [] },
        },
      }),
    })

    await submitReview()

    const next = writtenConvState()
    expect(next.capturedProposals?.persona).toBeUndefined()
    expect(next.capturedProposals?.services).toBeUndefined()
    expect(next.capturedProposals?.hours).toBeUndefined()
    // O clear é POR domínio — pricing (não é da review) permanece intocado.
    expect(next.capturedProposals?.pricing).toBeDefined()
  })

  // -------------------------------------------------------------------------
  // disclosure no metadata.identityCard
  // -------------------------------------------------------------------------
  it('SEM disclosure: não toca BuilderProject.metadata (nenhum read/write de projeto)', async () => {
    await submitReview()

    expect(mockProjectFindFirst).not.toHaveBeenCalled()
    expect(mockProjectUpdateMany).not.toHaveBeenCalled()
  })

  it('COM disclosure: aplica mode/customText no metadata.identityCard na MESMA transação', async () => {
    const res = await submitReview(
      reviewPayload({
        disclosure: { mode: 'custom', customText: 'Sou o assistente da loja.' },
      }),
    )

    expect(res.ok).toBe(true)
    // 1 POST real: read + write do projeto acontecem DENTRO da única transação.
    expect(mockTransaction).toHaveBeenCalledOnce()
    expect(mockProjectFindFirst).toHaveBeenCalledWith({
      where: { id: PROJECT_ID, organizationId: ORG_ID },
      select: { metadata: true },
    })
    expect(mockProjectUpdateMany).toHaveBeenCalledOnce()

    // O metadata gravado tem o identityCard com o disclosure escolhido (merge real
    // via lib pura — não mockada).
    const projCall = mockProjectUpdateMany.mock.calls[0]![0] as {
      where: { id: string; organizationId: string }
      data: { metadata: unknown }
    }
    expect(projCall.where).toEqual({ id: PROJECT_ID, organizationId: ORG_ID })
    const card = getIdentityCardFromMetadata(projCall.data.metadata)
    expect(card.disclosureMode).toBe('custom')
    expect(card.disclosureCustomText).toBe('Sou o assistente da loja.')
  })

  it('COM disclosure: o merge preserva chaves não-identity já presentes no metadata', async () => {
    mockProjectFindFirst.mockResolvedValueOnce({
      metadata: { knowledgeCollectionId: 'col-1', identityCard: { persona: 'Ana' } },
    })

    await submitReview(
      reviewPayload({ disclosure: { mode: 'human_passthrough' } }),
    )

    const projCall = mockProjectUpdateMany.mock.calls[0]![0] as {
      data: { metadata: Record<string, unknown> }
    }
    // Chave estranha ao identityCard sobrevive ao merge.
    expect(projCall.data.metadata.knowledgeCollectionId).toBe('col-1')
    const card = getIdentityCardFromMetadata(projCall.data.metadata)
    expect(card.disclosureMode).toBe('human_passthrough')
    // O campo pré-existente do card (persona) é preservado pelo merge parcial.
    expect(card.persona).toBe('Ana')
  })

  // -------------------------------------------------------------------------
  // Erro granular por seção (FR-22) — SEM write parcial
  // -------------------------------------------------------------------------
  it('persona vazia → { errors: { persona } } e NENHUM write/evento', async () => {
    const res = await submitReview(
      reviewPayload({ persona: {} }),
    )

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('invalid')
      expect(res.errors).toBeDefined()
      expect(res.errors?.persona).toBeTruthy()
      // Só a seção que falhou aparece — nunca erro monolítico.
      expect(res.errors?.services).toBeUndefined()
      expect(res.errors?.hours).toBeUndefined()
    }
    // Validação acontece ANTES de qualquer escrita: zero side-effects.
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
    expect(mockProjectUpdateMany).not.toHaveBeenCalled()
    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
  })

  it('services sem nenhum oferecido → { errors: { services } } sem write parcial', async () => {
    const res = await submitReview(reviewPayload({ offered: [] }))

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.errors?.services).toBeTruthy()
      expect(res.errors?.persona).toBeUndefined()
      expect(res.errors?.hours).toBeUndefined()
    }
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
  })

  it('default de horários NÃO vive no handler: sem preset E sem schedule → { errors: { hours } }', async () => {
    // Se o "sempre aberto" morasse no handler, isto passaria — mas o default vive
    // no COMPONENTE (T43); o body sempre chega com algo a confirmar.
    const res = await submitReview(
      reviewPayload({ preset: undefined, schedule: undefined }),
    )

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.errors?.hours).toBeTruthy()
      expect(res.errors?.persona).toBeUndefined()
      expect(res.errors?.services).toBeUndefined()
    }
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
  })

  it('hours destrava por SCHEDULE não-vazio (sem preset) — sem default no handler', async () => {
    const res = await submitReview(
      reviewPayload({
        preset: undefined,
        schedule: { mon: [{ start: '09:00', end: '18:00' }] },
      }),
    )

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    expect(next.confirmations.hours).toBe(true)
  })

  it('schedule objeto VAZIO não destrava hours (não é "algo a confirmar")', async () => {
    const res = await submitReview(
      reviewPayload({ preset: undefined, schedule: {} }),
    )

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.errors?.hours).toBeTruthy()
  })

  it('multiplas seções inválidas → todas no erro granular, sem write', async () => {
    const res = await submitReview(
      reviewPayload({ persona: {}, offered: [], preset: undefined, schedule: undefined }),
    )

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.errors?.persona).toBeTruthy()
      expect(res.errors?.services).toBeTruthy()
      expect(res.errors?.hours).toBeTruthy()
    }
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Evento review_done
  // -------------------------------------------------------------------------
  it('emite review_done com a journeyVersion congelada do state', async () => {
    await submitReview()

    expect(mockTrackJourneyEvent).toHaveBeenCalledOnce()
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      journeyVersion: 2,
      event: 'review_done',
    })
  })

  it('emite review_done DEPOIS do write consolidado (ordem do contrato)', async () => {
    const order: string[] = []
    mockConvUpdateMany.mockImplementationOnce(async () => {
      order.push('write')
      return { count: 1 }
    })
    mockTrackJourneyEvent.mockImplementationOnce(async () => {
      order.push('event')
    })

    await submitReview()

    expect(order).toEqual(['write', 'event'])
  })

  // -------------------------------------------------------------------------
  // Boundary de tenant — read fresco org-scoped + fallback sem clobber
  // -------------------------------------------------------------------------
  it('cross-org: read fresco da conversa é org-scoped', async () => {
    await submitReview()

    expect(mockConvFindFirst).toHaveBeenCalledWith({
      where: { id: CONV_ID, organizationId: ORG_ID },
      select: { builderState: true },
    })
  })

  it('cross-org: read fresco vazio cai no fallback do current sem clobber', async () => {
    mockConvFindFirst.mockResolvedValueOnce(null)

    const res = await submitReview(
      reviewPayload(),
      patchBuilderState(parseBuilderState(undefined), {
        journeyVersion: 2,
        persona: { greeting: 'Olá!' },
      }),
    )

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    // Os 4 flips aconteceram sobre o `current` (fallback), sem perder subtrees.
    expect(next.confirmations.persona).toBe(true)
    expect(next.confirmations.services).toBe(true)
    expect(next.confirmations.hours).toBe(true)
    expect(next.confirmations.agentApproved).toBe(true)
    expect(next.journeyVersion).toBe(2)
    expect(next.persona.greeting).toBe('Olá!')
    expect(next.proposal.name).toBe('Marina')
  })
})

// ===========================================================================
// T103 (jornada-builder-v2, Onda 5) — unit do handler `applyChannelPlatform`.
//
// O `channel_platform` (T91, FR-24/25) é o card da fase Lançar onde o usuário
// escolhe EM QUE canais o agente atende. Grava `channel.platforms` +
// `channel.whatsappMode` e flipa `confirmations.channelPlatform` — o engine v2
// lê `platforms` para surfar `whatsapp_connect`/`instagram_connect`. Os mocks de
// `database`/`journey-events` são os mesmos dos blocos acima (write atômico
// org-scoped via `$transaction`, igual a `applyBusinessIdentity`).
//
// Cobre (critério da tarefa T103):
//   - min 1 plataforma (o schema garante; aqui o caminho feliz com 1 grava);
//   - refine: `whatsappMode` obrigatório quando `'whatsapp'` selecionado → invalid;
//   - rejeição de dupla seleção pré-5b (2 plataformas → invalid; invertido em T94);
//   - grava `channel.platforms`/`channel.whatsappMode`;
//   - flipa `channelPlatform` (e NÃO emite evento de funil — channel_connected é
//     da conexão real, não da seleção);
//   - cross-org: read fresco + write SEMPRE filtrados por organizationId.
// ===========================================================================

/** Atalho: chama o handler do channel_platform com defaults dos ids + estado-base. */
function submitChannel(
  payload: Pick<ChannelPlatformPayload, 'platforms' | 'whatsappMode'>,
  current: BuilderState = patchBuilderState(parseBuilderState(undefined), {
    journeyVersion: 2,
  }),
) {
  return applyChannelPlatform({
    conversationId: CONV_ID,
    organizationId: ORG_ID,
    current,
    payload,
  })
}

describe('applyChannelPlatform — T103 (FR-24/25)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConvFindFirst.mockResolvedValue({
      builderState: patchBuilderState(parseBuilderState(undefined), {
        journeyVersion: 2,
      }),
    })
    mockConvUpdateMany.mockResolvedValue({ count: 1 })
    // $transaction re-arma o impl (clearAllMocks limpa a implementação). Este
    // handler só toca a conversa (não há read/write de projeto).
    mockTransaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) =>
        fn({
          builderProjectConversation: {
            findFirst: mockConvFindFirst,
            updateMany: mockConvUpdateMany,
          },
        }),
    )
    mockTrackJourneyEvent.mockResolvedValue(undefined)
  })

  // -------------------------------------------------------------------------
  // Min 1 plataforma + grava platforms/whatsappMode + flipa o sentinel
  // -------------------------------------------------------------------------
  it('WhatsApp (QR): grava channel.platforms/whatsappMode e flipa channelPlatform num único write', async () => {
    const res = await submitChannel({ platforms: ['whatsapp'], whatsappMode: 'qr' })

    expect(res.ok).toBe(true)
    // Tudo numa só transação, com UM write de conversa.
    expect(mockTransaction).toHaveBeenCalledOnce()
    expect(mockConvUpdateMany).toHaveBeenCalledOnce()

    const next = writtenConvState()
    expect(next.channel?.platforms).toEqual(['whatsapp'])
    expect(next.channel?.whatsappMode).toBe('qr')
    expect(next.confirmations.channelPlatform).toBe(true)
  })

  it('WhatsApp (Cloud API): persiste whatsappMode = cloud', async () => {
    const res = await submitChannel({ platforms: ['whatsapp'], whatsappMode: 'cloud' })

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    expect(next.channel?.platforms).toEqual(['whatsapp'])
    expect(next.channel?.whatsappMode).toBe('cloud')
  })

  it('Instagram: grava platforms sem whatsappMode (IG não tem nível 2)', async () => {
    const res = await submitChannel({ platforms: ['instagram'] })

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    expect(next.channel?.platforms).toEqual(['instagram'])
    // Nenhum modo órfão é persistido quando WhatsApp não está selecionado.
    expect(next.channel?.whatsappMode).toBeUndefined()
    expect(next.confirmations.channelPlatform).toBe(true)
  })

  it('IG com whatsappMode no body: o modo NÃO é persistido (sem órfão)', async () => {
    // O body pode trazer um modo pré-selecionado pela UI; sem WhatsApp na lista,
    // o handler descarta o modo (não guarda nível 2 órfão de IG).
    const res = await submitChannel({ platforms: ['instagram'], whatsappMode: 'qr' })

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    expect(next.channel?.platforms).toEqual(['instagram'])
    expect(next.channel?.whatsappMode).toBeUndefined()
  })

  it('NÃO emite evento de funil (channel_connected é da conexão real, não da seleção)', async () => {
    await submitChannel({ platforms: ['whatsapp'], whatsappMode: 'qr' })

    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
  })

  it('subtrees não-relacionados sobrevivem ao patch do canal', async () => {
    // O read FRESCO dentro da tx é a fonte do estado patcheado (o `current` só
    // entra no fallback) — carrega os subtrees não-relacionados nele.
    mockConvFindFirst.mockResolvedValueOnce({
      builderState: patchBuilderState(parseBuilderState(undefined), {
        journeyVersion: 2,
        persona: { tone: 'cordial' },
        confirmations: { persona: true },
      }),
    })

    const res = await submitChannel({ platforms: ['whatsapp'], whatsappMode: 'qr' })

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    expect(next.persona.tone).toBe('cordial')
    expect(next.confirmations.persona).toBe(true)
    expect(next.confirmations.channelPlatform).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Refine — whatsappMode obrigatório quando WhatsApp marcado
  // -------------------------------------------------------------------------
  it('WhatsApp SEM whatsappMode → invalid, sem nenhum write', async () => {
    const res = await submitChannel({ platforms: ['whatsapp'] })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.reason).toBe('invalid')
      expect(res.message).toMatch(/qr code ou cloud api/i)
    }
    // O refine roda ANTES da transação: zero side-effects.
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Seleção dupla HABILITADA na Onda 5b (T94 removeu a rejeição pré-5b): o
  // mesmo agente atende WhatsApp + Instagram (attach pausa por conexão, não por
  // agente). Persiste as 2 plataformas e flipa o sentinel.
  // -------------------------------------------------------------------------
  it('duas plataformas (pós-5b) → aceito, grava ambas e flipa o sentinel', async () => {
    const res = await submitChannel({
      platforms: ['whatsapp', 'instagram'],
      whatsappMode: 'qr',
    })

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    expect(next.channel?.platforms).toEqual(['whatsapp', 'instagram'])
    expect(next.channel?.whatsappMode).toBe('qr')
    expect(next.confirmations.channelPlatform).toBe(true)
  })

  it('platforms duplicado é deduplicado para um canal único (não dispara a regra pré-5b)', async () => {
    // O body com a MESMA plataforma repetida vira 1 após o dedupe — não é "dupla
    // seleção" e segue o caminho feliz.
    const res = await submitChannel({
      platforms: ['whatsapp', 'whatsapp'],
      whatsappMode: 'qr',
    })

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    expect(next.channel?.platforms).toEqual(['whatsapp'])
    expect(next.confirmations.channelPlatform).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Boundary de tenant — read fresco org-scoped + write org-scoped + fallback
  // -------------------------------------------------------------------------
  it('cross-org: leitura e escrita da conversa SEMPRE filtram por organizationId', async () => {
    await submitChannel({ platforms: ['whatsapp'], whatsappMode: 'qr' })

    // O read fresco dentro da tx é org-scoped.
    expect(mockConvFindFirst).toHaveBeenCalledWith({
      where: { id: CONV_ID, organizationId: ORG_ID },
      select: { builderState: true },
    })
    // O write da conversa é org-scoped.
    const convCall = mockConvUpdateMany.mock.calls[0]![0] as {
      where: { id: string; organizationId: string }
    }
    expect(convCall.where).toEqual({ id: CONV_ID, organizationId: ORG_ID })
  })

  it('cross-org: read fresco vazio (conversa de outra org) cai no fallback do current sem clobber', async () => {
    // findFirst filtrado por org alheia não acha → handler usa `current` (não dropa
    // o write) mas continua escrevendo SÓ no escopo do org do caller.
    mockConvFindFirst.mockResolvedValueOnce(null)

    const res = await submitChannel(
      { platforms: ['instagram'] },
      patchBuilderState(parseBuilderState(undefined), {
        journeyVersion: 2,
        persona: { greeting: 'Oi!' },
      }),
    )

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    expect(next.channel?.platforms).toEqual(['instagram'])
    expect(next.confirmations.channelPlatform).toBe(true)
    // herda do `current` (state v2 fornecido), provando que não houve clobber.
    expect(next.journeyVersion).toBe(2)
    expect(next.persona.greeting).toBe('Oi!')
  })
})

// ===========================================================================
// T69 (jornada-builder-v2, Onda 5) — unit dos handlers `applyTestDrive` e
// `applyPublishedNextSteps` (cards das fases Testar/Lançar).
//
// Ambos passam por `applySentinelAck`, que resolve a POSSE da conversa pelo
// `projectId @unique` (findUnique, FORA da transação) antes do write atômico
// org-scoped. Diferente dos handlers acima, não recebem `conversationId`/`current`
// nem espelham nada na linha do projeto — flipam UM sentinel e, depois do write,
// emitem o evento de funil ramificado por ação.
//
// Cobre (critério da tarefa T69):
//   - test_drive: skip vs tested flipam o MESMO sentinel `testDrive`, mas a COPY do
//     ACK é DISTINTA (skip não promete validação) e o evento RAMIFICA
//     (tested → test_done, skip → test_skipped);
//   - published_next_steps: flipa `publishedNextSteps` e emite `next_steps_ack`;
//   - evento só DEPOIS do write (não anunciamos passo não-gravado) e, em falha de
//     posse (not_found/forbidden), NENHUM write/evento;
//   - cross-org: a posse é provada por findUnique e o write é org-scoped.
// ===========================================================================

/** Atalho: chama o handler do test_drive com defaults dos ids + journeyVersion. */
function submitTestDrive(action: TestDrivePayload['action']) {
  return applyTestDrive({
    projectId: PROJECT_ID,
    organizationId: ORG_ID,
    journeyVersion: 2,
    payload: { action },
  })
}

describe('applyTestDrive — T69 (FR-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Posse: a conversa do projeto pertence ao org do caller (caminho feliz).
    mockConvFindUnique.mockResolvedValue({ id: CONV_ID, organizationId: ORG_ID })
    // Read fresco dentro da tx: state v2 com o sentinel ainda false.
    mockConvFindFirst.mockResolvedValue({
      builderState: patchBuilderState(parseBuilderState(undefined), {
        journeyVersion: 2,
      }),
    })
    mockConvUpdateMany.mockResolvedValue({ count: 1 })
    // $transaction re-arma o impl (clearAllMocks limpa a implementação). O
    // applySentinelAck só toca a conversa dentro da tx.
    mockTransaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) =>
        fn({
          builderProjectConversation: {
            findFirst: mockConvFindFirst,
            updateMany: mockConvUpdateMany,
          },
        }),
    )
    mockTrackJourneyEvent.mockResolvedValue(undefined)
  })

  // -------------------------------------------------------------------------
  // Skip vs tested — MESMO sentinel, COPY do ACK distinta
  // -------------------------------------------------------------------------
  it('"tested": flipa testDrive num único write org-scoped', async () => {
    const res = await submitTestDrive('tested')

    expect(res.ok).toBe(true)
    expect(mockTransaction).toHaveBeenCalledOnce()
    expect(mockConvUpdateMany).toHaveBeenCalledOnce()

    const next = writtenConvState()
    expect(next.confirmations.testDrive).toBe(true)
  })

  it('"skip": flipa o MESMO sentinel testDrive (gate soft destrava igual)', async () => {
    const res = await submitTestDrive('skip')

    expect(res.ok).toBe(true)
    const next = writtenConvState()
    expect(next.confirmations.testDrive).toBe(true)
  })

  it('"tested": o ACK considera o teste concluído e segue para a publicação', async () => {
    const res = await submitTestDrive('tested')

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.cardInstruction).toMatch(/testou o agente/i)
      expect(res.cardInstruction).toMatch(/publica/i)
      // Nunca menciona "sem testar"/"não afirme validado" no caminho tested.
      expect(res.cardInstruction).not.toMatch(/sem testar/i)
    }
  })

  it('"skip": o ACK NÃO promete validação (copy distinta do tested)', async () => {
    const res = await submitTestDrive('skip')

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.cardInstruction).toMatch(/publicar sem testar/i)
      // O LLM é instruído a NÃO afirmar que o agente foi validado.
      expect(res.cardInstruction).toMatch(/não afirme que o agente foi validado/i)
    }
  })

  it('skip e tested têm copy de ACK DIFERENTE (ramificação por ação)', async () => {
    const tested = await submitTestDrive('tested')
    const skipped = await submitTestDrive('skip')

    expect(tested.ok && skipped.ok).toBe(true)
    if (tested.ok && skipped.ok) {
      expect(tested.cardInstruction).not.toBe(skipped.cardInstruction)
    }
  })

  // -------------------------------------------------------------------------
  // Evento ramificado test_done / test_skipped — só APÓS o write
  // -------------------------------------------------------------------------
  it('"tested" emite test_done com a journeyVersion recebida', async () => {
    await submitTestDrive('tested')

    expect(mockTrackJourneyEvent).toHaveBeenCalledOnce()
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      journeyVersion: 2,
      event: 'test_done',
    })
  })

  it('"skip" emite test_skipped (NÃO test_done)', async () => {
    await submitTestDrive('skip')

    expect(mockTrackJourneyEvent).toHaveBeenCalledOnce()
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      journeyVersion: 2,
      event: 'test_skipped',
    })
  })

  it('emite o evento DEPOIS do write do sentinel (ordem do contrato)', async () => {
    const order: string[] = []
    mockConvUpdateMany.mockImplementationOnce(async () => {
      order.push('write')
      return { count: 1 }
    })
    mockTrackJourneyEvent.mockImplementationOnce(async () => {
      order.push('event')
    })

    await submitTestDrive('tested')

    expect(order).toEqual(['write', 'event'])
  })

  // -------------------------------------------------------------------------
  // Falha de posse — NENHUM write/evento
  // -------------------------------------------------------------------------
  it('conversa inexistente → not_found, sem write nem evento', async () => {
    mockConvFindUnique.mockResolvedValueOnce(null)

    const res = await submitTestDrive('tested')

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('not_found')
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
  })

  it('conversa de outra org → forbidden, sem write nem evento', async () => {
    mockConvFindUnique.mockResolvedValueOnce({
      id: CONV_ID,
      organizationId: 'org-OUTRA',
    })

    const res = await submitTestDrive('skip')

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('forbidden')
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Boundary de tenant — posse por findUnique + write org-scoped
  // -------------------------------------------------------------------------
  it('cross-org: resolve a posse pelo projectId e escreve SEMPRE org-scoped', async () => {
    await submitTestDrive('tested')

    expect(mockConvFindUnique).toHaveBeenCalledWith({
      where: { projectId: PROJECT_ID },
      select: { id: true, organizationId: true },
    })
    const convCall = mockConvUpdateMany.mock.calls[0]![0] as {
      where: { id: string; organizationId: string }
    }
    expect(convCall.where).toEqual({ id: CONV_ID, organizationId: ORG_ID })
  })
})

describe('applyPublishedNextSteps — T69 (FR-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConvFindUnique.mockResolvedValue({ id: CONV_ID, organizationId: ORG_ID })
    mockConvFindFirst.mockResolvedValue({
      builderState: patchBuilderState(parseBuilderState(undefined), {
        journeyVersion: 2,
      }),
    })
    mockConvUpdateMany.mockResolvedValue({ count: 1 })
    mockTransaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) =>
        fn({
          builderProjectConversation: {
            findFirst: mockConvFindFirst,
            updateMany: mockConvUpdateMany,
          },
        }),
    )
    mockTrackJourneyEvent.mockResolvedValue(undefined)
  })

  function submitNextSteps() {
    return applyPublishedNextSteps({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      journeyVersion: 2,
    })
  }

  it('flipa publishedNextSteps num único write org-scoped', async () => {
    const res = await submitNextSteps()

    expect(res.ok).toBe(true)
    expect(mockConvUpdateMany).toHaveBeenCalledOnce()
    const next = writtenConvState()
    expect(next.confirmations.publishedNextSteps).toBe(true)
  })

  it('emite next_steps_ack com a journeyVersion recebida', async () => {
    await submitNextSteps()

    expect(mockTrackJourneyEvent).toHaveBeenCalledOnce()
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      journeyVersion: 2,
      event: 'next_steps_ack',
    })
  })

  it('emite next_steps_ack DEPOIS do write (ordem do contrato)', async () => {
    const order: string[] = []
    mockConvUpdateMany.mockImplementationOnce(async () => {
      order.push('write')
      return { count: 1 }
    })
    mockTrackJourneyEvent.mockImplementationOnce(async () => {
      order.push('event')
    })

    await submitNextSteps()

    expect(order).toEqual(['write', 'event'])
  })

  it('conversa inexistente → not_found, sem write nem evento', async () => {
    mockConvFindUnique.mockResolvedValueOnce(null)

    const res = await submitNextSteps()

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('not_found')
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
  })
})
