import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockConvFindFirst = vi.hoisted(() => vi.fn())
const mockConvUpdateMany = vi.hoisted(() => vi.fn())
const mockTransaction = vi.hoisted(() => vi.fn())
const mockDesignerRun = vi.hoisted(() => vi.fn())

vi.mock('@/server/services/database', () => {
  const tx = {
    builderProjectConversation: {
      findFirst: mockConvFindFirst,
      updateMany: mockConvUpdateMany,
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

vi.mock('../sub-agents', () => ({
  playbookDesignerSubAgent: { run: mockDesignerRun },
}))

import { generateConversationBlueprintTool } from './generate-conversation-blueprint.tool'

const CTX = {
  projectId: 'proj-test',
  organizationId: 'org-test',
  userId: 'user-test',
}

const BLUEPRINT = {
  status: 'proposed',
  objective: 'Qualificar interessados e conduzir para visita.',
  niche: 'imobiliario',
  stages: [
    {
      id: 'qualificacao',
      title: 'Qualificacao',
      goal: 'Entender interesse do lead.',
    },
  ],
  questions: [
    {
      id: 'objetivo',
      stageId: 'qualificacao',
      text: 'Voce procura para morar ou investir?',
      purpose: 'Descobrir objetivo da busca.',
      variableKey: 'objetivo',
      skipWhenKnown: 'Pular se objetivo ja estiver claro.',
    },
  ],
  variables: [
    {
      key: 'objetivo',
      label: 'Objetivo',
      type: 'text',
      source: 'user',
      reviewRequired: false,
    },
  ],
  skipRules: [],
  successCriteria: ['Objetivo e proximo passo claros.'],
  handoffTriggers: [],
  toolTriggers: [],
  objectionRules: [],
  doRules: [],
  dontRules: [],
  sourceRefs: [],
}

function getExecute(t: ReturnType<typeof generateConversationBlueprintTool>) {
  return (t as unknown as { execute: (i: unknown) => Promise<unknown> }).execute
}

function writtenState(): {
  conversationBlueprint?: {
    status?: string
    objective?: string
    niche?: string
    questions?: Array<{ id: string }>
  }
} {
  expect(mockConvUpdateMany).toHaveBeenCalledOnce()
  const call = mockConvUpdateMany.mock.calls[0]![0] as {
    where: { id: string; organizationId: string }
    data: { builderState: ReturnType<typeof writtenState> }
  }
  expect(call.where).toEqual({ id: 'conv-1', organizationId: 'org-test' })
  return call.data.builderState
}

beforeEach(() => {
  mockConvFindFirst.mockReset()
  mockConvUpdateMany.mockReset()
  mockTransaction.mockReset()
  mockDesignerRun.mockReset()
  mockTransaction.mockImplementation(async (fn) =>
    fn({
      builderProjectConversation: {
        findFirst: mockConvFindFirst,
        updateMany: mockConvUpdateMany,
      },
    }),
  )
  mockConvFindFirst
    .mockResolvedValueOnce({ id: 'conv-1', builderState: {} })
    .mockResolvedValueOnce({ builderState: {} })
  mockConvUpdateMany.mockResolvedValue({ count: 1 })
  mockDesignerRun.mockResolvedValue({
    success: true as const,
    data: {
      blueprint: BLUEPRINT,
      source: 'llm',
      warnings: [],
    },
    durationMs: 10,
  })
})

describe('generateConversationBlueprintTool', () => {
  it('retorna OBJECTIVE_REQUIRED quando objetivo nao foi informado nem existe no state', async () => {
    const execute = getExecute(generateConversationBlueprintTool(CTX))

    const result = (await execute({})) as {
      success: boolean
      code?: string
      message?: string
    }

    expect(result.success).toBe(false)
    expect(result.code).toBe('OBJECTIVE_REQUIRED')
    expect(result.message).toMatch(/objetivo/i)
    expect(mockDesignerRun).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
  })

  it("gera blueprint e grava builderState.conversationBlueprint.status='proposed' com org scope", async () => {
    const execute = getExecute(generateConversationBlueprintTool(CTX))

    const result = (await execute({
      objective: 'Qualificar interessados em imoveis e conduzir para visita.',
      niche: 'imobiliario',
    })) as {
      success: boolean
      card?: string
      blueprint?: { questionCount: number }
    }

    expect(result.success).toBe(true)
    expect(result.card).toBe('conversation_blueprint')
    expect(result.blueprint?.questionCount).toBe(1)

    expect(mockConvFindFirst.mock.calls[0]?.[0]).toMatchObject({
      where: { projectId: 'proj-test', organizationId: 'org-test' },
      select: { id: true, builderState: true },
    })
    expect(mockConvFindFirst.mock.calls[1]?.[0]).toMatchObject({
      where: { id: 'conv-1', organizationId: 'org-test' },
      select: { builderState: true },
    })
    expect(mockDesignerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        objective: 'Qualificar interessados em imoveis e conduzir para visita.',
        niche: 'imobiliário',
      }),
      {
        organizationId: 'org-test',
        userId: 'user-test',
        projectId: 'proj-test',
      },
    )

    const state = writtenState()
    expect(state.conversationBlueprint).toMatchObject({
      status: 'proposed',
      objective: 'Qualificar interessados em imoveis e conduzir para visita.',
      niche: 'imobiliário',
    })
    expect(state.conversationBlueprint?.questions?.[0]?.id).toBe('objetivo')
  })

  it('recusa gerar roteiro para fonte 100% vendida sem estratégia do usuário', async () => {
    mockConvFindFirst.mockReset()
    mockConvFindFirst.mockResolvedValueOnce({
      id: 'conv-1',
      builderState: {
        journeyVersion: 2,
        project: {
          objective: 'Qualificar interessados em imoveis.',
        },
        sourceIngestion: {
          proposed: {
            differentiators: ['pronto e 100% vendido'],
          },
        },
      },
    })
    const execute = getExecute(generateConversationBlueprintTool(CTX))

    const result = (await execute({})) as {
      success: boolean
      code?: string
      message?: string
    }

    expect(result.success).toBe(false)
    expect(result.code).toBe('SOURCE_DECISION_REQUIRED')
    expect(result.message).toMatch(/100% vendido\/esgotado/i)
    expect(mockDesignerRun).not.toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
    expect(mockConvUpdateMany).not.toHaveBeenCalled()
  })

  it('inclui a estratégia de fonte vendida no input do playbook-designer', async () => {
    mockConvFindFirst.mockReset()
    mockConvFindFirst
      .mockResolvedValueOnce({
        id: 'conv-1',
        builderState: {
          journeyVersion: 2,
          project: {
            objective: 'Qualificar interessados em imoveis.',
          },
          sourceIngestion: {
            proposed: {
              services: ['apartamentos de 2 quartos'],
              differentiators: ['pronto e 100% vendido'],
            },
          },
        },
      })
      .mockResolvedValueOnce({ builderState: {} })
    const execute = getExecute(generateConversationBlueprintTool(CTX))

    const result = (await execute({
      soldOutStrategy: 'human_confirm',
    })) as {
      success: boolean
    }

    expect(result.success).toBe(true)
    expect(mockDesignerRun).toHaveBeenCalledWith(
      expect.objectContaining({
        knownLimits: expect.arrayContaining([
          expect.stringContaining('100% vendido'),
          expect.stringContaining('confirmar disponibilidade'),
        ]),
      }),
      expect.any(Object),
    )
  })
})
