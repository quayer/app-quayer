import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockProjectFindFirst,
  mockKnowledgeCollectionFindFirst,
  mockTransaction,
  mockAgentCreate,
  mockPromptVersionCreate,
  mockProjectUpdate,
  mockTrackJourneyEvent,
  mockInvalidateProjectRefinement,
} = vi.hoisted(() => ({
  mockProjectFindFirst: vi.fn(),
  mockKnowledgeCollectionFindFirst: vi.fn(),
  mockTransaction: vi.fn(),
  mockAgentCreate: vi.fn(),
  mockPromptVersionCreate: vi.fn(),
  mockProjectUpdate: vi.fn(),
  mockTrackJourneyEvent: vi.fn(),
  mockInvalidateProjectRefinement: vi.fn(),
}))

vi.mock('@/server/services/database', () => ({
  database: {
    builderProject: {
      findFirst: mockProjectFindFirst,
    },
    knowledgeCollection: {
      findFirst: mockKnowledgeCollectionFindFirst,
    },
    $transaction: mockTransaction,
  },
}))

vi.mock('@/server/services/journey-events', () => ({
  trackJourneyEvent: mockTrackJourneyEvent,
}))

vi.mock('../refinement/refinement-state', () => ({
  invalidateProjectRefinement: mockInvalidateProjectRefinement,
}))

import { createAgentTool } from './create-agent.tool'

const CTX = {
  projectId: 'proj-1',
  organizationId: 'org-1',
  userId: 'user-1',
}

const INPUT = {
  name: 'SDR Acme',
  systemPrompt:
    '# Papel\nVoce atende leads da Acme com clareza, qualifica interesse, responde duvidas e encaminha oportunidades para a equipe comercial.',
  provider: 'anthropic' as const,
  model: 'claude-sonnet-4-20250514',
  temperature: 0.4,
  enabledTools: ['transfer_to_human'],
}

function project(overrides: Record<string, unknown> = {}) {
  return {
    id: CTX.projectId,
    aiAgentId: null,
    metadata: {},
    conversation: { builderState: { journeyVersion: 2 } },
    ...overrides,
  }
}

async function execute(input: typeof INPUT = INPUT) {
  const builtTool = createAgentTool(CTX)
  const executeFn = (
    builtTool as unknown as { execute: (i: typeof INPUT) => Promise<unknown> }
  ).execute
  return executeFn(input)
}

function agentCreateData() {
  expect(mockAgentCreate).toHaveBeenCalledOnce()
  return mockAgentCreate.mock.calls[0]![0].data as Record<string, unknown>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockProjectFindFirst.mockResolvedValue(project())
  mockKnowledgeCollectionFindFirst.mockResolvedValue(null)
  mockAgentCreate.mockResolvedValue({ id: 'agent-1', name: INPUT.name })
  mockPromptVersionCreate.mockResolvedValue({ id: 'version-1', versionNumber: 1 })
  mockProjectUpdate.mockResolvedValue({ id: CTX.projectId })
  mockTrackJourneyEvent.mockResolvedValue(undefined)
  mockInvalidateProjectRefinement.mockResolvedValue(undefined)
  mockTransaction.mockImplementation(
    async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        aIAgentConfig: { create: mockAgentCreate },
        builderPromptVersion: { create: mockPromptVersionCreate },
        builderProject: { update: mockProjectUpdate },
      }),
  )
})

describe('createAgentTool', () => {
  it('T29: usa metadata.knowledgeCollectionId antes do fallback por nome', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(
      project({ metadata: { knowledgeCollectionId: 'col-from-meta' } }),
    )
    mockKnowledgeCollectionFindFirst.mockResolvedValueOnce({ id: 'col-from-meta' })

    const result = await execute()

    expect(result).toMatchObject({ success: true, agentId: 'agent-1' })
    expect(mockKnowledgeCollectionFindFirst).toHaveBeenCalledOnce()
    expect(mockKnowledgeCollectionFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'col-from-meta',
        organizationId: CTX.organizationId,
        isActive: true,
      },
      select: { id: true },
    })
    expect(agentCreateData()).toMatchObject({
      ragCollectionId: 'col-from-meta',
      useRAG: true,
    })
  })

  it('T29: cai no fallback por nome quando metadata nao tem collectionId', async () => {
    mockKnowledgeCollectionFindFirst.mockResolvedValueOnce({ id: 'col-by-name' })

    const result = await execute()

    expect(result).toMatchObject({ success: true, agentId: 'agent-1' })
    expect(mockKnowledgeCollectionFindFirst).toHaveBeenCalledWith({
      where: {
        organizationId: CTX.organizationId,
        name: 'kb:proj-1',
        isActive: true,
      },
      select: { id: true },
    })
    expect(agentCreateData()).toMatchObject({
      ragCollectionId: 'col-by-name',
      useRAG: true,
    })
  })

  it('T25: injeta disclosure de metadata.identityCard no prompt materializado', async () => {
    mockProjectFindFirst.mockResolvedValueOnce(
      project({
        metadata: {
          identityCard: {
            displayName: 'Marina',
            disclosureMode: 'custom',
            disclosureCustomText: 'Sou a Marina, assistente virtual da Acme.',
          },
        },
      }),
    )

    await execute()

    const data = agentCreateData()
    expect(data.systemPrompt).toContain('# Identidade')
    expect(data.systemPrompt).toContain('Sou a Marina, assistente virtual da Acme.')
    expect(mockPromptVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ content: data.systemPrompt }),
      }),
    )
  })

  it('T25: emite agent_created com a journeyVersion congelada', async () => {
    await execute()

    expect(mockTrackJourneyEvent).toHaveBeenCalledOnce()
    expect(mockTrackJourneyEvent).toHaveBeenCalledWith({
      organizationId: CTX.organizationId,
      projectId: CTX.projectId,
      journeyVersion: 2,
      event: 'agent_created',
    })
  })
})
