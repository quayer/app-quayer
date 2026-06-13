import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConversationFindFirst = vi.hoisted(() => vi.fn())
const mockConversationUpdateMany = vi.hoisted(() => vi.fn())
const mockProjectFindFirst = vi.hoisted(() => vi.fn())
const mockPromptVersionFindFirst = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockRunRefinement = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => {
  const tx = {
    builderProjectConversation: {
      findFirst: mockConversationFindFirst,
      updateMany: mockConversationUpdateMany,
    },
    builderProject: {
      findFirst: mockProjectFindFirst,
    },
    builderPromptVersion: {
      findFirst: mockPromptVersionFindFirst,
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

vi.mock('../refinement/run-refinement', () => ({
  DEFAULT_REFINEMENT_AUDITORS: [],
  runRefinement: mockRunRefinement,
}))

vi.mock('../refinement/conversation-runner', () => ({
  runRefinementConversation: vi.fn(),
}))

import { runAgentRefinementTool } from './run-agent-refinement.tool'
import type { ConversationBlueprint } from '../playbook/blueprint.schema'

const CTX = {
  projectId: 'proj-test',
  organizationId: 'org-test',
  userId: 'user-test',
}

const BLUEPRINT: ConversationBlueprint = {
  status: 'approved',
  objective: 'Qualificar leads e conduzir para atendimento.',
  niche: 'servico local',
  stages: [
    {
      id: 'qualificacao',
      title: 'Qualificacao',
      goal: 'Entender necessidade.',
    },
  ],
  questions: [
    {
      id: 'necessidade',
      stageId: 'qualificacao',
      text: 'Qual servico voce precisa?',
      purpose: 'Descobrir necessidade.',
      variableKey: 'necessidade',
      skipWhenKnown: 'Pular se a necessidade ja estiver clara.',
      required: true,
    },
  ],
  variables: [
    {
      key: 'necessidade',
      label: 'Necessidade',
      type: 'text',
      source: 'user',
      reviewRequired: false,
    },
  ],
  skipRules: [],
  successCriteria: ['Necessidade e proximo passo claros.'],
  handoffTriggers: ['Lead pede humano.'],
  toolTriggers: [],
  objectionRules: [],
  doRules: [],
  dontRules: ['Nunca prometer prazo sem confirmar.'],
  sourceRefs: [],
  approvedAt: '2026-06-12T00:00:00.000Z',
}

function getExecute(t: ReturnType<typeof runAgentRefinementTool>) {
  return (t as unknown as { execute: (i: unknown) => Promise<unknown> }).execute
}

beforeEach(() => {
  mockConversationFindFirst.mockReset()
  mockConversationUpdateMany.mockReset()
  mockProjectFindFirst.mockReset()
  mockPromptVersionFindFirst.mockReset()
  mockTransaction.mockReset()
  mockRunRefinement.mockReset()
  mockTransaction.mockImplementation(async (fn) =>
    fn({
      builderProjectConversation: {
        findFirst: mockConversationFindFirst,
        updateMany: mockConversationUpdateMany,
      },
    }),
  )
  mockConversationFindFirst.mockResolvedValue({
    id: 'conv-1',
    builderState: {
      journeyVersion: 2,
      conversationBlueprint: BLUEPRINT,
      refinement: {
        status: 'failed',
        score: 10,
        checks: [],
        blockers: [],
      },
    },
  })
  mockConversationUpdateMany.mockResolvedValue({ count: 1 })
  mockProjectFindFirst.mockResolvedValue({ aiAgentId: 'agent-1' })
  mockPromptVersionFindFirst.mockResolvedValue({
    id: 'version-1',
    versionNumber: 1,
    content: 'Prompt aprovado com roteiro preservado.',
  })
  mockRunRefinement.mockResolvedValue({
    state: {
      status: 'passed',
      runId: 'refine-fixed',
      score: 100,
      startedAt: '2026-06-12T00:00:00.000Z',
      finishedAt: '2026-06-12T00:01:00.000Z',
      checks: [
        {
          checkId: 'route',
          label: 'Plano de atendimento',
          status: 'pass',
          severity: 'low',
          evidence: 'Ok',
          recommendation: 'Nenhuma ação.',
          autoFixable: false,
        },
      ],
      blockers: [],
    },
    runs: [],
  })
})

describe('runAgentRefinementTool', () => {
  it('requires an approved conversation blueprint', async () => {
    mockConversationFindFirst.mockResolvedValueOnce({
      id: 'conv-1',
      builderState: { journeyVersion: 2 },
    })
    const execute = getExecute(runAgentRefinementTool(CTX))

    const result = (await execute({})) as {
      success: boolean
      code?: string
      message?: string
    }

    expect(result.success).toBe(false)
    expect(result.code).toBe('BLUEPRINT_REQUIRED')
    expect(result.message).toMatch(/plano de atendimento/i)
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockRunRefinement).not.toHaveBeenCalled()
  })

  it('persists running then final refinement state with org-scoped writes', async () => {
    const execute = getExecute(runAgentRefinementTool(CTX))

    const result = (await execute({})) as {
      success: boolean
      status?: string
      scenarioCount?: number
      checkCount?: number
      blockerCount?: number
    }

    expect(result.success).toBe(true)
    expect(result.status).toBe('passed')
    expect(result.scenarioCount).toBe(6)
    expect(result.checkCount).toBe(1)
    expect(result.blockerCount).toBe(0)

    expect(mockTransaction).toHaveBeenCalledTimes(2)
    expect(mockConversationUpdateMany).toHaveBeenCalledTimes(2)
    const firstWrite = mockConversationUpdateMany.mock.calls[0]![0] as {
      where: { id: string; organizationId: string }
      data: {
        builderState: {
          refinement?: {
            status?: string
            score?: number
            material?: { promptVersionId?: string }
          }
        }
      }
    }
    const finalWrite = mockConversationUpdateMany.mock.calls[1]![0] as {
      where: { id: string; organizationId: string }
      data: {
        builderState: {
          refinement?: {
            status?: string
            score?: number
            material?: { promptVersionId?: string }
          }
        }
      }
    }

    expect(firstWrite.where).toEqual({ id: 'conv-1', organizationId: 'org-test' })
    expect(firstWrite.data.builderState.refinement).toMatchObject({
      status: 'running',
      score: 0,
      checks: [],
      blockers: [],
      material: expect.objectContaining({
        promptVersionId: 'version-1',
        promptVersionNumber: 1,
        promptHash: expect.any(String),
        blueprintHash: expect.any(String),
        contextHash: expect.any(String),
      }),
    })
    expect(finalWrite.where).toEqual({ id: 'conv-1', organizationId: 'org-test' })
    expect(finalWrite.data.builderState.refinement).toMatchObject({
      status: 'passed',
      score: 100,
      material: expect.objectContaining({
        promptVersionId: 'version-1',
      }),
    })
    expect(mockRunRefinement).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-test',
        organizationId: 'org-test',
        blueprint: expect.objectContaining({ status: 'approved' }),
        scenarios: expect.any(Array),
        runId: expect.stringMatching(/^refine_/),
        material: expect.objectContaining({
          promptVersionId: 'version-1',
          promptVersionNumber: 1,
        }),
      }),
    )
  })
})
