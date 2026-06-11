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
const mockConvUpdateMany = vi.hoisted(() => vi.fn())
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
      updateMany: mockProjectUpdateMany,
    },
  }
  return {
    database: {
      ...tx,
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

import { applyBusinessIdentity } from './journey-v2'
import {
  parseBuilderState,
  patchBuilderState,
  type BuilderState,
} from '../../builder-state'

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
