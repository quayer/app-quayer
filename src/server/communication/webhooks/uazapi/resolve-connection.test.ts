/**
 * Jornada Builder v2 — Onda 5b (multi-canal simultâneo), T93.
 *
 * VALIDAÇÃO da resolução inbound POR CONNECTION. O gate T83 confirmou que
 * `resolveAgentIdForConnection` JÁ resolve via `connectionId` (filtro
 * `where { connectionId, status:'ACTIVE', agentConfig.organizationId }`), logo
 * estes testes blindam o contrato contra regressões que reintroduzam a hipótese
 * de "1 deployment ACTIVE por agente":
 *
 *   - 2 deployments ACTIVE em conexões DIFERENTES do MESMO agente → cada
 *     `connectionId` resolve o seu próprio `agentConfigId` (nunca assume
 *     unicidade global por agente).
 *   - dentro da MESMA conexão, ordena por `updatedAt desc` (o mais recente vence).
 *   - org-scoped (multi-tenant): o `where` carrega `agentConfig.organizationId`.
 *   - fail-open: erro de DB → cai no `fallbackAgentId`; sem deployment → fallback.
 *
 * O delegate `database.agentDeployment` é mockado — sem IO real. Os imports de
 * módulo (journey-events / builder-state / next/server) também são mockados só
 * para o carregamento do arquivo não puxar IO.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Prisma } from '@prisma/client'

import {
  promoteConnectionFromEvent,
  resolveAgentIdForConnection,
} from './resolve-connection'

const databaseMock = vi.hoisted(() => ({
  agentDeployment: {
    findFirst: vi.fn(),
  },
  connection: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  builderProjectConversation: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
  },
}))
const mockTrackJourneyEvent = vi.hoisted(() => vi.fn())
const mockParseBuilderState = vi.hoisted(() => vi.fn())
const mockApplyConfirmation = vi.hoisted(() => vi.fn())

const findFirst = databaseMock.agentDeployment.findFirst

vi.mock('@/server/services/database', () => ({
  database: databaseMock,
}))

vi.mock('@/server/services/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// Imports de módulo que carregam serviços reais — neutralizados no load.
vi.mock('@/server/services/journey-events', () => ({
  trackJourneyEvent: mockTrackJourneyEvent,
}))
vi.mock('@/server/ai-module/builder/cards/builder-state', () => ({
  parseBuilderState: mockParseBuilderState,
  applyConfirmation: mockApplyConfirmation,
}))

const ORG = 'org_1'
const PROJECT_ID = 'project_1'
const CONVERSATION_ID = 'conversation_1'

/**
 * Fixture: o MESMO agente (`agent_main`) com deployments ACTIVE em DUAS conexões
 * (WhatsApp + Instagram, multi-canal simultâneo) + uma conexão de outra org
 * (vazamento de tenant que o filtro deve excluir).
 */
type FakeDeployment = {
  agentConfigId: string
  connectionId: string
  status: 'ACTIVE' | 'PAUSED'
  organizationId: string
  updatedAt: Date
}

const FIXTURES: FakeDeployment[] = [
  // conexão A (WhatsApp): 2 versões da MESMA conexão — a mais nova vence
  {
    agentConfigId: 'agent_main',
    connectionId: 'conn_whatsapp',
    status: 'ACTIVE',
    organizationId: ORG,
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  },
  {
    agentConfigId: 'agent_main',
    connectionId: 'conn_whatsapp',
    status: 'ACTIVE',
    organizationId: ORG,
    updatedAt: new Date('2026-06-10T00:00:00Z'), // mais recente
  },
  // conexão B (Instagram) do MESMO agente, ACTIVE em paralelo (multi-canal)
  {
    agentConfigId: 'agent_main',
    connectionId: 'conn_instagram',
    status: 'ACTIVE',
    organizationId: ORG,
    updatedAt: new Date('2026-06-05T00:00:00Z'),
  },
  // conexão C: deployment apenas PAUSED (re-attach antigo) — nunca resolve
  {
    agentConfigId: 'agent_main',
    connectionId: 'conn_paused',
    status: 'PAUSED',
    organizationId: ORG,
    updatedAt: new Date('2026-06-09T00:00:00Z'),
  },
  // conexão D: mesma connectionId, outra ORG — barreira multi-tenant
  {
    agentConfigId: 'agent_other_org',
    connectionId: 'conn_whatsapp',
    status: 'ACTIVE',
    organizationId: 'org_2',
    updatedAt: new Date('2026-06-20T00:00:00Z'), // mais novo, mas outra org
  },
]

/**
 * Implementação fiel de `findFirst` para o `where`/`orderBy` que a função usa:
 * filtra por connectionId + status + agentConfig.organizationId e respeita
 * `orderBy.updatedAt: 'desc'`. Sem hipótese de unicidade — múltiplos matches
 * coexistem e o primeiro pós-ordenação vence.
 */
function fakeFindFirst(args: {
  where: Prisma.AgentDeploymentWhereInput
  orderBy?: { updatedAt?: 'asc' | 'desc' }
  select?: unknown
}): { agentConfigId: string } | null {
  const where = args.where as {
    connectionId?: string
    status?: string
    agentConfig?: { organizationId?: string }
  }
  const matches = FIXTURES.filter(
    (d) =>
      d.connectionId === where.connectionId &&
      d.status === where.status &&
      d.organizationId === where.agentConfig?.organizationId,
  )
  const dir = args.orderBy?.updatedAt === 'asc' ? 1 : -1
  matches.sort((a, b) => dir * (a.updatedAt.getTime() - b.updatedAt.getTime()))
  const first = matches[0]
  return first ? { agentConfigId: first.agentConfigId } : null
}

describe('resolveAgentIdForConnection — resolução POR connection (T93)', () => {
  beforeEach(() => {
    findFirst.mockReset()
  })

  it('2 deployments ACTIVE em conexões diferentes do MESMO agente: cada connectionId resolve isoladamente', async () => {
    findFirst.mockImplementation((args) => Promise.resolve(fakeFindFirst(args)))

    const whatsapp = await resolveAgentIdForConnection('conn_whatsapp', ORG)
    const instagram = await resolveAgentIdForConnection('conn_instagram', ORG)

    // Ambas resolvem (multi-canal simultâneo do mesmo agente) — sem "ou um, ou outro".
    expect(whatsapp).toBe('agent_main')
    expect(instagram).toBe('agent_main')

    // A query é re-chaveada por connectionId a CADA chamada — nunca cacheia/assume único.
    expect(findFirst.mock.calls[0][0].where.connectionId).toBe('conn_whatsapp')
    expect(findFirst.mock.calls[1][0].where.connectionId).toBe('conn_instagram')
  })

  it('filtra estritamente por connectionId + status ACTIVE + org no where', async () => {
    findFirst.mockImplementation((args) => Promise.resolve(fakeFindFirst(args)))

    await resolveAgentIdForConnection('conn_whatsapp', ORG)

    const where = findFirst.mock.calls[0][0].where
    expect(where).toMatchObject({
      connectionId: 'conn_whatsapp',
      status: 'ACTIVE',
      agentConfig: { organizationId: ORG },
    })
  })

  it('dentro da MESMA conexão, ordena por updatedAt desc (o deployment mais recente vence)', async () => {
    findFirst.mockImplementation((args) => Promise.resolve(fakeFindFirst(args)))

    const result = await resolveAgentIdForConnection('conn_whatsapp', ORG)

    expect(result).toBe('agent_main')
    expect(findFirst.mock.calls[0][0].orderBy).toEqual({ updatedAt: 'desc' })
  })

  it('barreira multi-tenant: a connectionId compartilhada NÃO vaza o agente de outra org', async () => {
    findFirst.mockImplementation((args) => Promise.resolve(fakeFindFirst(args)))

    // conn_whatsapp existe em org_1 (agent_main) e org_2 (agent_other_org, mais novo).
    // Resolvendo na org_1, jamais retorna o agente da org_2.
    const result = await resolveAgentIdForConnection('conn_whatsapp', ORG)

    expect(result).toBe('agent_main')
    expect(result).not.toBe('agent_other_org')
  })

  it('conexão só com deployment PAUSED não resolve — cai no fallback quando informado', async () => {
    findFirst.mockImplementation((args) => Promise.resolve(fakeFindFirst(args)))

    const result = await resolveAgentIdForConnection('conn_paused', ORG, 'agent_fallback')

    expect(result).toBe('agent_fallback')
  })

  it('sem deployment ACTIVE e sem fallback → retorna null', async () => {
    findFirst.mockResolvedValue(null)

    const result = await resolveAgentIdForConnection('conn_unknown', ORG)

    expect(result).toBeNull()
  })

  it('fail-open: erro de DB no lookup cai no fallbackAgentId (nunca lança)', async () => {
    findFirst.mockRejectedValue(new Error('connection refused'))

    const result = await resolveAgentIdForConnection('conn_whatsapp', ORG, 'agent_fallback')

    expect(result).toBe('agent_fallback')
  })

  it('fail-open: erro de DB sem fallback → null (nunca lança)', async () => {
    findFirst.mockRejectedValue(new Error('boom'))

    await expect(resolveAgentIdForConnection('conn_whatsapp', ORG)).resolves.toBeNull()
  })

  it('o deployment ACTIVE vence o fallbackAgentId (deployment é a fonte autoritativa)', async () => {
    findFirst.mockImplementation((args) => Promise.resolve(fakeFindFirst(args)))

    // Mesmo passando um fallback diferente, o deployment ACTIVE da conexão prevalece.
    const result = await resolveAgentIdForConnection('conn_instagram', ORG, 'agent_loose')

    expect(result).toBe('agent_main')
  })
})

describe('promoteConnectionFromEvent — T35 channel_connected', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findFirst.mockReset()
    databaseMock.connection.update.mockResolvedValue({ id: 'conn_whatsapp' })
    databaseMock.builderProjectConversation.updateMany.mockResolvedValue({
      count: 1,
    })
    mockTrackJourneyEvent.mockResolvedValue(undefined)
  })

  function connectedPayload() {
    return {
      event: 'connection.status',
      instance: 'uaz_instance_1',
      data: { status: 'connected' },
    } as unknown as Parameters<typeof promoteConnectionFromEvent>[0]
  }

  function armDisconnectedConnection() {
    databaseMock.connection.findFirst.mockResolvedValueOnce({
      id: 'conn_whatsapp',
      status: 'DISCONNECTED',
      organizationId: ORG,
      projectId: null,
    })
  }

  function armBuilderProjectConnection(options?: {
    whatsappConnectedOnce?: boolean
  }) {
    databaseMock.agentDeployment.findFirst.mockResolvedValueOnce({
      agentConfig: { builderProject: { id: PROJECT_ID } },
    })
    const state = {
      journeyVersion: 2,
      confirmations: {
        whatsappConnectedOnce: options?.whatsappConnectedOnce ?? false,
      },
    }
    const next = {
      ...state,
      confirmations: { ...state.confirmations, whatsappConnectedOnce: true },
    }

    databaseMock.builderProjectConversation.findUnique.mockResolvedValueOnce({
      id: CONVERSATION_ID,
      organizationId: ORG,
      builderState: state,
    })
    mockParseBuilderState.mockReturnValueOnce(state)
    mockApplyConfirmation.mockReturnValueOnce(next)

    return { state, next }
  }

  it('transição para CONNECTED emite channel_connected e flipa whatsappConnectedOnce', async () => {
    armDisconnectedConnection()
    const { state, next } = armBuilderProjectConnection()

    await expect(promoteConnectionFromEvent(connectedPayload())).resolves.toBe(
      true,
    )

    expect(databaseMock.connection.update).toHaveBeenCalledWith({
      where: { id: 'conn_whatsapp' },
      data: { status: 'CONNECTED' },
    })
    expect(mockTrackJourneyEvent).toHaveBeenCalledOnce()
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith({
      organizationId: ORG,
      projectId: PROJECT_ID,
      journeyVersion: 2,
      event: 'channel_connected',
    })
    expect(mockApplyConfirmation).toHaveBeenCalledWith(
      state,
      'whatsappConnectedOnce',
    )
    expect(
      databaseMock.builderProjectConversation.updateMany,
    ).toHaveBeenCalledWith({
        where: { id: CONVERSATION_ID, organizationId: ORG },
        data: { builderState: next },
      })
  })

  it('fail-open: falha de telemetria não aborta a promoção para CONNECTED', async () => {
    armDisconnectedConnection()
    armBuilderProjectConnection()
    mockTrackJourneyEvent.mockRejectedValueOnce(new Error('telemetry down'))

    await expect(promoteConnectionFromEvent(connectedPayload())).resolves.toBe(
      true,
    )

    expect(databaseMock.connection.update).toHaveBeenCalledWith({
      where: { id: 'conn_whatsapp' },
      data: { status: 'CONNECTED' },
    })
  })

  it('connection sem BuilderProject resolvível não emite evento nem flipa o sentinel', async () => {
    armDisconnectedConnection()
    databaseMock.agentDeployment.findFirst.mockResolvedValueOnce(null)

    await expect(promoteConnectionFromEvent(connectedPayload())).resolves.toBe(
      true,
    )

    expect(databaseMock.connection.update).toHaveBeenCalledWith({
      where: { id: 'conn_whatsapp' },
      data: { status: 'CONNECTED' },
    })
    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
    expect(mockApplyConfirmation).not.toHaveBeenCalled()
    expect(
      databaseMock.builderProjectConversation.updateMany,
    ).not.toHaveBeenCalled()
  })
})
