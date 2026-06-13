import { describe, expect, it } from 'vitest'

import type { ConversationBlueprint } from './blueprint.schema'
import {
  normalizeConversationBlueprint,
  validateConversationBlueprint,
} from './blueprint-helpers'
import { buildNicheBlueprintFixture } from './niche-blueprint-fixtures'

function baseBlueprint(
  overrides: Partial<ConversationBlueprint> = {},
): ConversationBlueprint {
  return {
    status: 'proposed',
    objective: 'Qualificar leads e conduzir para atendimento humano.',
    niche: 'servico local',
    stages: [
      {
        id: 'qualificacao',
        title: 'Qualificacao',
        goal: 'Entender a necessidade do lead.',
        order: 0,
      },
    ],
    questions: [
      {
        id: 'necessidade',
        stageId: 'qualificacao',
        text: 'Qual servico voce precisa?',
        purpose: 'Descobrir a necessidade principal.',
        variableKey: 'necessidade',
        skipWhenKnown: 'Pular se a necessidade ja estiver clara.',
        required: true,
        order: 0,
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
    handoffTriggers: [],
    toolTriggers: [],
    objectionRules: [],
    doRules: [],
    dontRules: [],
    sourceRefs: [],
    ...overrides,
  }
}

describe('ConversationBlueprint helpers', () => {
  it('normalizacao cria variavel default para pergunta sem variavel declarada', () => {
    const normalized = normalizeConversationBlueprint(
      baseBlueprint({ variables: [] }),
    )

    expect(normalized.questions[0]?.variableKey).toBe('necessidade')
    expect(normalized.variables).toContainEqual({
      key: 'necessidade',
      label: 'Descobrir a necessidade principal.',
      type: 'text',
      source: 'default',
      reviewRequired: true,
    })
  })

  it('validacao detecta pergunta apontando para variavel inexistente', () => {
    const issues = validateConversationBlueprint(baseBlueprint({ variables: [] }))

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'question_without_variable',
        severity: 'fail',
      }),
    )
  })

  it('validacao detecta pergunta dupla', () => {
    const blueprint = baseBlueprint({
      questions: [
        {
          id: 'tipo_e_regiao',
          stageId: 'qualificacao',
          text: 'Qual tipo de imovel voce quer e qual regiao prefere?',
          purpose: 'Entender preferencias de busca.',
          variableKey: 'tipo_e_regiao',
          skipWhenKnown: 'Pular se tipo e regiao ja estiverem claros.',
          required: true,
          order: 0,
        },
      ],
      variables: [
        {
          key: 'tipo_e_regiao',
          label: 'Tipo e regiao',
          type: 'text',
          source: 'user',
          reviewRequired: false,
        },
      ],
    })

    const issues = validateConversationBlueprint(blueprint)

    expect(issues).toContainEqual(
      expect.objectContaining({
        code: 'multi_question',
        severity: 'warning',
      }),
    )
  })

  it('fixture imobiliario gera blueprint proposto e valido para nicho imobiliario', () => {
    const blueprint = buildNicheBlueprintFixture({
      objective: 'Qualificar interessados em apartamentos e conduzir para visita.',
      niche: 'imobiliaria de apartamentos',
    })

    expect(blueprint.status).toBe('proposed')
    expect(blueprint.niche).toBe('imobiliaria de apartamentos')
    expect(blueprint.stages.map((stage) => stage.id)).toContain(
      'entender_interesse',
    )
    expect(blueprint.questions.map((question) => question.id)).toEqual(
      expect.arrayContaining(['objetivo_compra', 'faixa_valor']),
    )
    expect(validateConversationBlueprint(blueprint)).not.toContainEqual(
      expect.objectContaining({ severity: 'fail' }),
    )
  })
})
