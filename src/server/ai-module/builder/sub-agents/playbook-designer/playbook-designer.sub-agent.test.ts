import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../base', () => ({
  runLLMSubAgent: vi.fn(),
}))

import { runLLMSubAgent } from '../base'
import { playbookDesignerSubAgent } from './playbook-designer.sub-agent'

const mockedRunLLM = vi.mocked(runLLMSubAgent)

const CONTEXT = {
  organizationId: 'org-test',
  userId: 'user-test',
  projectId: 'proj-test',
} as const

const INPUT = {
  objective: 'Qualificar interessados em imoveis e conduzir para visita.',
  niche: 'imobiliario',
  businessContext: ['Negocio: Imobiliaria Centro'],
  capabilities: ['Transferir para consultor'],
  knownServices: ['Apartamentos'],
  knownLimits: ['Nao prometer disponibilidade sem confirmar.'],
}

function validBlueprintJson(): string {
  return JSON.stringify({
    status: 'proposed',
    objective: INPUT.objective,
    niche: INPUT.niche,
    stages: [
      {
        id: 'qualificacao',
        title: 'Qualificar',
        goal: 'Entender interesse e proximo passo.',
      },
    ],
    questions: [
      {
        id: 'objetivo',
        stageId: 'qualificacao',
        text: 'Qual seu objetivo principal na busca?',
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
    handoffTriggers: ['Lead pede visita.'],
    toolTriggers: [],
    objectionRules: [],
    doRules: ['Perguntar uma coisa por vez.'],
    dontRules: ['Nao inventar disponibilidade.'],
    sourceRefs: [{ type: 'user', label: 'Contexto informado no builder' }],
  })
}

function llmSuccess(text: string) {
  return {
    success: true as const,
    data: { text, durationMs: 10 },
    durationMs: 10,
  }
}

beforeEach(() => {
  mockedRunLLM.mockReset()
})

describe('playbookDesignerSubAgent', () => {
  it('parseia JSON cercado por code fence', async () => {
    mockedRunLLM.mockResolvedValueOnce(
      llmSuccess(`\`\`\`json\n${validBlueprintJson()}\n\`\`\``),
    )

    const result = await playbookDesignerSubAgent.run(INPUT, CONTEXT)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.source).toBe('llm')
    expect(result.data.blueprint.status).toBe('proposed')
    expect(result.data.blueprint.questions[0]?.id).toBe('objetivo')
    expect(result.data.warnings).toEqual([])
  })

  it('usa fixture quando LLM falha', async () => {
    mockedRunLLM.mockResolvedValueOnce({
      success: false as const,
      error: 'timeout',
      code: 'TIMEOUT',
      durationMs: 35_000,
    })

    const result = await playbookDesignerSubAgent.run(INPUT, CONTEXT)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.source).toBe('fixture')
    expect(result.data.blueprint.status).toBe('proposed')
    expect(result.data.blueprint.objective).toBe(INPUT.objective)
    expect(result.data.warnings).toContain('Fallback por fixture: TIMEOUT')
  })

  it('usa fixture quando LLM retorna JSON invalido', async () => {
    mockedRunLLM.mockResolvedValueOnce(llmSuccess('isto nao e json'))

    const result = await playbookDesignerSubAgent.run(INPUT, CONTEXT)

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.source).toBe('fixture')
    expect(result.data.blueprint.niche).toBe(INPUT.niche)
    expect(result.data.warnings).toContain(
      'Fallback por fixture: resposta do playbook-designer não era JSON válido.',
    )
  })
})
