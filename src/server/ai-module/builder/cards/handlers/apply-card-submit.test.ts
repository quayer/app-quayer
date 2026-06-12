import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mock — builderProjectConversation delegate (tenant-scoped read+write)
// ---------------------------------------------------------------------------
//
// `applyHandoff` is NOT exported (only the pure `applyPricing` is), so the
// Onda 2 `handoff` card is exercised through the PUBLIC `applyCardSubmit`
// entrypoint. That entrypoint reads the conversation (proving ownership) and
// writes the new state in a single tenant-filtered updateMany — both mocked
// here. The `applyPricing` suite below stays a pure-function unit (no DB), and
// the database mock is inert for it.

const mockFindUnique = vi.hoisted(() => vi.fn())
const mockUpdateMany = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => ({
  database: {
    builderProjectConversation: {
      findUnique: mockFindUnique,
      updateMany: mockUpdateMany,
    },
  },
}))

import {
  parseBuilderState,
  patchBuilderState,
  type BuilderState,
} from '../builder-state'
import { applyPricing, applyCardSubmit } from './apply-card-submit'
import type { CardSubmitBody } from '../card-submit.schemas'

/**
 * Onda B — G5a regression guard.
 *
 * The pricing card is submitted WHOLESALE, so an absent `minTicketCents` means the
 * user removed it. `deepMerge` skips `undefined`, so without an explicit clear a
 * previously-saved min ticket could never be unset (the mustFix from the review).
 */
describe('applyPricing — G5a min ticket (wholesale clear)', () => {
  const base = () =>
    patchBuilderState(parseBuilderState(undefined), {
      pricing: { minTicketCents: 5000 },
    })

  const payload = (minTicketCents?: number) => ({
    items: [{ name: 'Corte', priceCents: 5000 }],
    currency: 'BRL' as const,
    disclosureStyle: 'exact' as const,
    minTicketCents,
  })

  it('persists a positive min ticket', () => {
    const { next } = applyPricing(parseBuilderState(undefined), payload(8000))
    expect(next.pricing.minTicketCents).toBe(8000)
    expect(next.confirmations.pricing).toBe(true)
  })

  it('clears a previously-set min ticket when the new submit omits it', () => {
    // Was 5000; the new wholesale submit has no min ticket → must become undefined.
    const { next } = applyPricing(base(), payload(undefined))
    expect(next.pricing.minTicketCents).toBeUndefined()
  })

  it('treats a non-positive min ticket as cleared (0 → undefined)', () => {
    const { next } = applyPricing(base(), payload(0))
    expect(next.pricing.minTicketCents).toBeUndefined()
  })

  it('replaces items wholesale and keeps a re-submitted min ticket', () => {
    const { next } = applyPricing(base(), payload(5000))
    expect(next.pricing.minTicketCents).toBe(5000)
    expect(next.pricing.items.map((i) => i.name)).toEqual(['Corte'])
  })
})

describe('applyCardSubmit — agent_approval deterministic card', () => {
  const PROJECT_ID = 'proj-1'
  const ORG_ID = 'org-1'
  const CONV_ID = 'conv-1'

  function seedConversation(builderState: unknown): void {
    mockFindUnique.mockResolvedValue({
      id: CONV_ID,
      organizationId: ORG_ID,
      builderState,
    })
    mockUpdateMany.mockResolvedValue({ count: 1 })
  }

  function writtenState(): BuilderState {
    expect(mockUpdateMany).toHaveBeenCalledTimes(1)
    const arg = mockUpdateMany.mock.calls[0][0] as {
      data: { builderState: BuilderState }
    }
    return arg.data.builderState
  }

  beforeEach(() => {
    mockFindUnique.mockReset()
    mockUpdateMany.mockReset()
  })

  it('persists approved proposal name/description and flips agentApproved', async () => {
    seedConversation(null)

    const res = await applyCardSubmit({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      body: {
        cardKey: 'agent_approval',
        action: 'confirm',
        name: 'SDR Vibra Butantã',
        description:
          'Atende leads do empreendimento Vibra Butantã, tira dúvidas, qualifica interesse e encaminha oportunidades para o time comercial.',
      },
    })

    expect(res.ok).toBe(true)
    const next = writtenState()
    expect(next.confirmations.agentApproved).toBe(true)
    expect(next.proposal.name).toBe('SDR Vibra Butantã')
    expect(next.proposal.description).toContain('Vibra Butantã')
    if (res.ok) {
      expect(res.cardInstruction).toContain('nome "SDR Vibra Butantã"')
      expect(res.cardInstruction).toContain('descrição "')
    }
  })

  it('falls back to an existing server-side proposal when body omits details', async () => {
    seedConversation(
      patchBuilderState(parseBuilderState(undefined), {
        proposal: {
          name: 'SDR Existente',
          description:
            'Proposta já existente no estado para criar o agente sem depender de texto livre.',
        },
      }),
    )

    const res = await applyCardSubmit({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      body: { cardKey: 'agent_approval', action: 'confirm' },
    })

    expect(res.ok).toBe(true)
    const next = writtenState()
    expect(next.confirmations.agentApproved).toBe(true)
    expect(next.proposal.name).toBe('SDR Existente')
    if (res.ok) expect(res.cardInstruction).toContain('SDR Existente')
  })
})

/**
 * Onda 2 — the unified `handoff` card (FUSÃO of the 4 retired handlers:
 * qualification_action + qualification_steps + team_structure + handoff_pairing).
 *
 * `applyHandoff` is internal, so we drive the PUBLIC `applyCardSubmit` with a
 * cardKey 'handoff' body and assert on the persisted state captured by the
 * mocked updateMany: it must write `state.handoff.*` (mode/roster/steps/schedule/
 * openingMessage) AND flip `confirmations.handoff` (the single sentinel that
 * replaced the 4 legacy ones).
 */
describe('applyCardSubmit — handoff card (Onda 2 unified)', () => {
  const PROJECT_ID = 'proj-1'
  const ORG_ID = 'org-1'
  const CONV_ID = 'conv-1'

  /** Seed conversation row with a given (already-parsed) builderState JSON. */
  function seedConversation(builderState: unknown): void {
    mockFindUnique.mockResolvedValue({
      id: CONV_ID,
      organizationId: ORG_ID,
      builderState,
    })
    mockUpdateMany.mockResolvedValue({ count: 1 })
  }

  /** The BuilderState written by the (single) updateMany call. */
  function writtenState(): BuilderState {
    expect(mockUpdateMany).toHaveBeenCalledTimes(1)
    const arg = mockUpdateMany.mock.calls[0][0] as {
      data: { builderState: BuilderState }
    }
    return arg.data.builderState
  }

  async function submitHandoff(
    body: Omit<Extract<CardSubmitBody, { cardKey: 'handoff' }>, 'cardKey'>,
  ) {
    return applyCardSubmit({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      body: { cardKey: 'handoff', ...body },
    })
  }

  beforeEach(() => {
    mockFindUnique.mockReset()
    mockUpdateMany.mockReset()
  })

  it('mode "solo": writes handoff.mode + flips confirmations.handoff (empty roster)', async () => {
    seedConversation(null)
    const res = await submitHandoff({
      mode: 'solo',
      alsoSchedule: false,
      steps: [],
      members: [],
    })

    expect(res.ok).toBe(true)
    const next = writtenState()
    expect(next.handoff.mode).toBe('solo')
    expect(next.handoff.alsoSchedule).toBe(false)
    expect(next.handoff.members).toEqual([])
    expect(next.confirmations.handoff).toBe(true)
  })

  it('mode "roleta": persists the sanitized roster (E.164-BR whatsapp + connectionId)', async () => {
    seedConversation(null)
    await submitHandoff({
      mode: 'roleta',
      alsoSchedule: false,
      steps: ['Qual seu nome?', 'Qual o serviço?'],
      members: [
        { name: 'João', whatsapp: '11988887777', connectionId: 'conn-joao', position: 0 },
        { name: 'Maria', whatsapp: '+5511966665555', position: 1 },
      ],
    })

    const next = writtenState()
    expect(next.handoff.mode).toBe('roleta')
    expect(next.handoff.steps).toEqual(['Qual seu nome?', 'Qual o serviço?'])
    const joao = next.handoff.members.find((m) => m.position === 0)
    const maria = next.handoff.members.find((m) => m.position === 1)
    // whatsapp is re-normalized server-side to E.164-BR.
    expect(joao?.whatsapp).toBe('+5511988887777')
    expect(joao?.connectionId).toBe('conn-joao') // warm transfer pairing transits through
    expect(maria?.whatsapp).toBe('+5511966665555')
    expect(next.confirmations.handoff).toBe(true)
  })

  it('alsoSchedule + openingMessage are persisted (warm transfer opener)', async () => {
    seedConversation(null)
    await submitHandoff({
      mode: 'roleta',
      alsoSchedule: true,
      steps: [],
      members: [{ name: 'João', position: 0 }],
      openingMessage: 'Oi, aqui é o João!',
    })

    const next = writtenState()
    expect(next.handoff.alsoSchedule).toBe(true)
    expect(next.handoff.openingMessage).toBe('Oi, aqui é o João!')
    expect(next.confirmations.handoff).toBe(true)
  })

  it('mode "nenhum": flips the sentinel with no roster', async () => {
    seedConversation(null)
    await submitHandoff({
      mode: 'nenhum',
      alsoSchedule: false,
      steps: [],
      members: [],
    })

    const next = writtenState()
    expect(next.handoff.mode).toBe('nenhum')
    expect(next.handoff.members).toEqual([])
    expect(next.confirmations.handoff).toBe(true)
  })

  it('does not write nor confirm when the conversation belongs to another org', async () => {
    mockFindUnique.mockResolvedValue({
      id: CONV_ID,
      organizationId: 'other-org',
      builderState: null,
    })
    const res = await submitHandoff({
      mode: 'solo',
      alsoSchedule: false,
      steps: [],
      members: [],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('forbidden')
    expect(mockUpdateMany).not.toHaveBeenCalled()
  })
})

/**
 * Onda E — source_progress accept: a síntese grava só `sourceIngestion.proposed`;
 * o "Aceitar" copia os valores propostos (com overrides em `edited`) para os
 * campos OWNED — incluindo os novos `identity.address`/`identity.description` —
 * e flipa `confirmations.source` (único sentinel do passo; sem sentinel novo).
 */
describe('applyCardSubmit — source_progress (Onda E: address + description)', () => {
  const PROJECT_ID = 'proj-1'
  const ORG_ID = 'org-1'
  const CONV_ID = 'conv-1'

  const VIBRA_ADDRESS = 'Rua Coronel Ferreira Leal, 161, Vila Gomes, São Paulo'
  const VIBRA_DESCRIPTION =
    'Empreendimento residencial na Vila Gomes com studios e apartamentos de 2 dormitórios.'

  function seedConversation(builderState: unknown): void {
    mockFindUnique.mockResolvedValue({
      id: CONV_ID,
      organizationId: ORG_ID,
      builderState,
    })
    mockUpdateMany.mockResolvedValue({ count: 1 })
  }

  function writtenState(): BuilderState {
    expect(mockUpdateMany).toHaveBeenCalledTimes(1)
    const arg = mockUpdateMany.mock.calls[0][0] as {
      data: { builderState: BuilderState }
    }
    return arg.data.builderState
  }

  /** builderState com um proposal completo já sintetizado (pré-accept). */
  function stateWithProposal(): BuilderState {
    return patchBuilderState(parseBuilderState(undefined), {
      sourceIngestion: {
        sources: [
          { value: 'https://vibra.example', type: 'url', status: 'ready' },
        ],
        proposed: {
          businessName: 'Vibra Residencial',
          services: ['apartamentos de 2 dormitórios'],
          audience: 'compradores de imóveis na Vila Gomes',
          tone: 'acolhedor e direto',
          address: VIBRA_ADDRESS,
          description: VIBRA_DESCRIPTION,
        },
      },
    })
  }

  async function submitAccept(
    edited?: Extract<
      CardSubmitBody,
      { cardKey: 'source_progress' }
    >['edited'],
  ) {
    return applyCardSubmit({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      body: { cardKey: 'source_progress', accept: true, ...(edited ? { edited } : {}) },
    })
  }

  beforeEach(() => {
    mockFindUnique.mockReset()
    mockUpdateMany.mockReset()
  })

  it('accept sem edits: copia address/description do proposal para identity.* e flipa source', async () => {
    seedConversation(stateWithProposal())
    const res = await submitAccept()

    expect(res.ok).toBe(true)
    const next = writtenState()
    expect(next.identity.address).toBe(VIBRA_ADDRESS)
    expect(next.identity.description).toBe(VIBRA_DESCRIPTION)
    // Mapeamentos pré-existentes continuam intactos.
    expect(next.project.name).toBe('Vibra Residencial')
    expect(next.project.objective).toBe('compradores de imóveis na Vila Gomes')
    expect(next.persona.tone).toBe('acolhedor e direto')
    expect(next.services.offered).toContain('apartamentos de 2 dormitórios')
    expect(next.confirmations.source).toBe(true)
  })

  it('edited.address/description sobrescrevem o proposal (trim aplicado)', async () => {
    seedConversation(stateWithProposal())
    await submitAccept({
      address: '  Av. Nova, 200, Butantã, São Paulo  ',
      description: '  Residencial compacto perto da USP.  ',
    })

    const next = writtenState()
    expect(next.identity.address).toBe('Av. Nova, 200, Butantã, São Paulo')
    expect(next.identity.description).toBe('Residencial compacto perto da USP.')
    expect(next.confirmations.source).toBe(true)
  })

  it('proposal sem address/description: identity fica vazia (nunca inventa)', async () => {
    seedConversation(
      patchBuilderState(parseBuilderState(undefined), {
        sourceIngestion: {
          sources: [
            { value: 'https://acme.example', type: 'url', status: 'ready' },
          ],
          proposed: { businessName: 'Acme' },
        },
      }),
    )
    await submitAccept()

    const next = writtenState()
    expect(next.identity.address).toBeUndefined()
    expect(next.identity.description).toBeUndefined()
    expect(next.project.name).toBe('Acme')
    expect(next.confirmations.source).toBe(true)
  })

  it('state legado (null) parseia com identity default {} e aceita edited.address', async () => {
    seedConversation(null)
    await submitAccept({ address: VIBRA_ADDRESS })

    const next = writtenState()
    expect(next.identity.address).toBe(VIBRA_ADDRESS)
    expect(next.identity.description).toBeUndefined()
    expect(next.confirmations.source).toBe(true)
  })

  it('FR-02: NÃO sobrescreve project.objective já preenchido com o audience da fonte', async () => {
    const USER_OBJECTIVE = 'Qualificar leads e agendar visitas ao decorado'
    seedConversation(
      patchBuilderState(stateWithProposal(), {
        project: { objective: USER_OBJECTIVE },
      }),
    )
    const res = await submitAccept()

    expect(res.ok).toBe(true)
    const next = writtenState()
    // O objetivo digitado pelo usuário sobrevive ao aceite da fonte.
    expect(next.project.objective).toBe(USER_OBJECTIVE)
    // O resto do proposal continua aplicado normalmente.
    expect(next.project.name).toBe('Vibra Residencial')
    expect(next.persona.tone).toBe('acolhedor e direto')
    expect(next.identity.address).toBe(VIBRA_ADDRESS)
    expect(next.confirmations.source).toBe(true)
    // ACK honesto: não anuncia "público-alvo" que não foi aplicado.
    if (res.ok) expect(res.cardInstruction).not.toMatch(/público-alvo/)
  })

  it('FR-02: audience ainda preenche objective quando ele está vazio', async () => {
    seedConversation(stateWithProposal())
    const res = await submitAccept()

    expect(res.ok).toBe(true)
    const next = writtenState()
    expect(next.project.objective).toBe('compradores de imóveis na Vila Gomes')
    if (res.ok) expect(res.cardInstruction).toMatch(/público-alvo/)
  })
})

/**
 * FR-11 (jornada-builder-v2) — calendar_connect: o flip de `confirmations.calendar`
 * SÓ acontece com conexão REAL (status no conjunto conectado, espelho do
 * resolvePhase do card) ou pulo EXPLÍCITO ('skipped'). Qualquer outro status
 * (vazio do clique "Conectar agenda", connecting, error) persiste o progresso em
 * `calendar.*` mas NÃO confirma — e o ACK avisa que está aguardando a conexão.
 */
describe('applyCardSubmit — calendar_connect (FR-11: flip só com conexão real ou pulo)', () => {
  const PROJECT_ID = 'proj-1'
  const ORG_ID = 'org-1'
  const CONV_ID = 'conv-1'

  function seedConversation(builderState: unknown): void {
    mockFindUnique.mockResolvedValue({
      id: CONV_ID,
      organizationId: ORG_ID,
      builderState,
    })
    mockUpdateMany.mockResolvedValue({ count: 1 })
  }

  function writtenState(): BuilderState {
    expect(mockUpdateMany).toHaveBeenCalledTimes(1)
    const arg = mockUpdateMany.mock.calls[0][0] as {
      data: { builderState: BuilderState }
    }
    return arg.data.builderState
  }

  async function submitCalendar(payload: {
    connectionId?: string
    status?: string
  }) {
    return applyCardSubmit({
      projectId: PROJECT_ID,
      organizationId: ORG_ID,
      body: { cardKey: 'calendar_connect', ...payload },
    })
  }

  beforeEach(() => {
    mockFindUnique.mockReset()
    mockUpdateMany.mockReset()
  })

  it('status "connected": persiste calendar.* e flipa confirmations.calendar', async () => {
    seedConversation(null)
    const res = await submitCalendar({
      connectionId: 'conn-1',
      status: 'connected',
    })

    expect(res.ok).toBe(true)
    const next = writtenState()
    expect(next.calendar.connectionId).toBe('conn-1')
    expect(next.calendar.status).toBe('connected')
    expect(next.confirmations.calendar).toBe(true)
    if (res.ok) expect(res.cardInstruction).toMatch(/CONECTOU a agenda/)
  })

  it('status ausente (clique "Conectar agenda"): NÃO flipa e ACK avisa que aguarda conexão', async () => {
    seedConversation(null)
    const res = await submitCalendar({})

    expect(res.ok).toBe(true)
    const next = writtenState()
    expect(next.confirmations.calendar).toBe(false)
    if (res.ok) {
      expect(res.cardInstruction).toMatch(/aguardando conexão da agenda/i)
      expect(res.cardInstruction).not.toMatch(/CONECTOU a agenda/)
    }
  })

  it('status "connecting": persiste o progresso mas NÃO confirma', async () => {
    seedConversation(null)
    const res = await submitCalendar({
      connectionId: 'conn-1',
      status: 'connecting',
    })

    expect(res.ok).toBe(true)
    const next = writtenState()
    expect(next.calendar.connectionId).toBe('conn-1')
    expect(next.calendar.status).toBe('connecting')
    expect(next.confirmations.calendar).toBe(false)
  })

  it('status "error": NÃO confirma', async () => {
    seedConversation(null)
    await submitCalendar({ status: 'error' })

    const next = writtenState()
    expect(next.calendar.status).toBe('error')
    expect(next.confirmations.calendar).toBe(false)
  })

  it('status "skipped" (pulo explícito): flipa e ACK orienta a não prometer agendamento', async () => {
    seedConversation(null)
    const res = await submitCalendar({ status: 'skipped' })

    expect(res.ok).toBe(true)
    const next = writtenState()
    expect(next.calendar.status).toBe('skipped')
    expect(next.confirmations.calendar).toBe(true)
    if (res.ok) expect(res.cardInstruction).toMatch(/CONTINUAR SEM AGENDA/)
  })
})
