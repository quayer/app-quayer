/**
 * Herança de `journeyVersion` no `duplicate` (Jornada Builder v2 — T60).
 *
 * O `duplicate` cria o clone com uma conversa 1:1 nova cujo
 * `builderState.journeyVersion` é HERDADO da conversa do projeto-fonte (plan
 * §2.2 item 1). Sem isto, um clone de projeto v2 sofreria downgrade silencioso
 * para o default 1 na criação lazy da conversa. Casos cobertos:
 *
 *   1. fonte v2  → conversa do clone nasce com journeyVersion 2 (não 1) +
 *      trackJourneyEvent('journey_started') com a versão 2 congelada.
 *   2. fonte v1  → permanece 1.
 *   3. fonte sem conversa (null) → backfill p/ 1 via parseBuilderState.
 *
 * Estratégia (espelha set-project-basics.tool.test.ts): mock de
 * `@/server/services/database` (sem IO) com `$transaction` que invoca o callback
 * com um `tx` cujos métodos são os mesmos mocks hoisted; `trackJourneyEvent` é
 * espionado. `parseBuilderState`/`DEFAULT_BUILDER_STATE` rodam de verdade —
 * a lógica de herança é exercida genuinamente.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks (hoisted antes dos imports que os tocam)
// ---------------------------------------------------------------------------

const mockProjectFindFirst = vi.hoisted(() => vi.fn())
const mockProjectCreate = vi.hoisted(() => vi.fn())
const mockConvCreate = vi.hoisted(() => vi.fn())
const mockMessageCreate = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockTrackJourneyEvent = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => {
  const tx = {
    builderProject: {
      create: mockProjectCreate,
    },
    builderProjectConversation: {
      create: mockConvCreate,
    },
    builderProjectMessage: {
      create: mockMessageCreate,
    },
    aIAgentConfig: { create: vi.fn() },
    builderPromptVersion: { create: vi.fn() },
  }
  const database = {
    builderProject: {
      findFirst: mockProjectFindFirst,
    },
    $transaction: mockTransaction.mockImplementation(
      async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    ),
  }
  return { database, getDatabase: () => database }
})

vi.mock('@/server/services/journey-events', () => ({
  trackJourneyEvent: mockTrackJourneyEvent,
}))

// ---------------------------------------------------------------------------
// Imports após o registro dos mocks
// ---------------------------------------------------------------------------

import { builderProjectRepository } from './projects.repository'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ORG = 'org-test'
const USER = 'user-test'
const SRC_PROJECT = 'proj-src'
const CLONE_ID = 'proj-clone'

/** Source project sem agente (foco na herança de versão da conversa). */
function sourceProject(builderState: unknown) {
  return {
    id: SRC_PROJECT,
    organizationId: ORG,
    name: 'Projeto fonte',
    type: 'ai_agent',
    metadata: null,
    conversation: builderState === undefined ? null : { builderState },
    aiAgent: null,
  }
}

/** builderState gravado na (única) criação de conversa do clone. */
function clonedConversationState(): { journeyVersion: 1 | 2 } {
  expect(mockConvCreate).toHaveBeenCalledOnce()
  const call = mockConvCreate.mock.calls[0]![0] as {
    data: { builderState: { journeyVersion: 1 | 2 } }
  }
  return call.data.builderState
}

describe('builderProjectRepository.duplicate — herança de journeyVersion (T60)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTransaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) =>
        fn({
          builderProject: { create: mockProjectCreate },
          builderProjectConversation: { create: mockConvCreate },
          builderProjectMessage: { create: mockMessageCreate },
          aIAgentConfig: { create: vi.fn() },
          builderPromptVersion: { create: vi.fn() },
        }),
    )
    mockProjectCreate.mockResolvedValue({ id: CLONE_ID })
    mockConvCreate.mockResolvedValue({ id: 'conv-clone' })
    mockMessageCreate.mockResolvedValue({ id: 'msg-1' })
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  it('fonte v2: conversa do clone nasce com journeyVersion 2 (não 1)', async () => {
    mockProjectFindFirst.mockResolvedValue(
      sourceProject({ journeyVersion: 2 }),
    )

    const result = await builderProjectRepository.duplicate(
      SRC_PROJECT,
      ORG,
      USER,
    )

    expect(result).toEqual({ id: CLONE_ID })
    expect(clonedConversationState().journeyVersion).toBe(2)
  })

  it('fonte v2: emite journey_started com a versão 2 congelada para o clone', async () => {
    mockProjectFindFirst.mockResolvedValue(
      sourceProject({ journeyVersion: 2 }),
    )

    await builderProjectRepository.duplicate(SRC_PROJECT, ORG, USER)

    expect(mockTrackJourneyEvent).toHaveBeenCalledOnce()
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith({
      organizationId: ORG,
      projectId: CLONE_ID,
      journeyVersion: 2,
      event: 'journey_started',
    })
  })

  it('fonte v1: conversa do clone permanece journeyVersion 1', async () => {
    mockProjectFindFirst.mockResolvedValue(
      sourceProject({ journeyVersion: 1 }),
    )

    await builderProjectRepository.duplicate(SRC_PROJECT, ORG, USER)

    expect(clonedConversationState().journeyVersion).toBe(1)
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: CLONE_ID,
        journeyVersion: 1,
        event: 'journey_started',
      }),
    )
  })

  it('fonte sem versão no builderState: backfill para 1 (parseBuilderState)', async () => {
    // builderState legado sem o campo journeyVersion → parseBuilderState
    // preenche o default 1.
    mockProjectFindFirst.mockResolvedValue(sourceProject({ project: {} }))

    await builderProjectRepository.duplicate(SRC_PROJECT, ORG, USER)

    expect(clonedConversationState().journeyVersion).toBe(1)
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ journeyVersion: 1 }),
    )
  })

  it('fonte sem conversa (null): backfill para 1', async () => {
    mockProjectFindFirst.mockResolvedValue(sourceProject(undefined))

    await builderProjectRepository.duplicate(SRC_PROJECT, ORG, USER)

    expect(clonedConversationState().journeyVersion).toBe(1)
  })

  it('projeto fonte inexistente/cross-org: retorna null sem tocar conversa nem funil', async () => {
    mockProjectFindFirst.mockResolvedValue(null)

    const result = await builderProjectRepository.duplicate(
      'proj-inexistente',
      ORG,
      USER,
    )

    expect(result).toBeNull()
    expect(mockConvCreate).not.toHaveBeenCalled()
    expect(mockTrackJourneyEvent).not.toHaveBeenCalled()
  })
})

describe('builderProjectRepository.createWithInitialMessage — seed journeyVersion (T10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('BUILDER_JOURNEY_V2', 'off')
    mockTransaction.mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) =>
        fn({
          builderProject: { create: mockProjectCreate },
          builderProjectConversation: { create: mockConvCreate },
          builderProjectMessage: { create: mockMessageCreate },
        }),
    )
    mockProjectCreate.mockResolvedValue({ id: 'proj-created' })
    mockConvCreate.mockResolvedValue({ id: 'conv-created' })
    mockMessageCreate.mockResolvedValue({ id: 'msg-created' })
    vi.spyOn(console, 'info').mockImplementation(() => {})
  })

  it('cookie override on congela journeyVersion 2 mesmo com env off', async () => {
    await builderProjectRepository.createWithInitialMessage({
      organizationId: ORG,
      userId: USER,
      prompt: 'Criar agente',
      type: 'ai_agent',
      name: 'Criar agente',
      builderV2OverrideCookie: 'on',
    })

    expect(clonedConversationState().journeyVersion).toBe(2)
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith({
      organizationId: ORG,
      projectId: 'proj-created',
      journeyVersion: 2,
      event: 'journey_started',
    })
  })

  it('sem override respeita env off e congela journeyVersion 1', async () => {
    await builderProjectRepository.createWithInitialMessage({
      organizationId: ORG,
      userId: USER,
      prompt: 'Criar agente',
      type: 'ai_agent',
      name: 'Criar agente',
    })

    expect(clonedConversationState().journeyVersion).toBe(1)
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-created',
        journeyVersion: 1,
        event: 'journey_started',
      }),
    )
  })
})
