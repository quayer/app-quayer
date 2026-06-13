import { describe, expect, it } from 'vitest'
import type { ConversationBlueprint } from '../../playbook/blueprint.schema'
import {
  generateRefinementScenarios,
  scenarioGeneratorSubAgent,
} from './scenario-generator'

const blueprint: ConversationBlueprint = {
  status: 'approved',
  objective: 'Qualificar leads imobiliarios e conduzir para visita.',
  niche: 'imobiliario',
  stages: [
    {
      id: 'qualificacao',
      title: 'Qualificacao',
      goal: 'Entender perfil e proximo passo.',
      order: 0,
    },
  ],
  questions: [
    {
      id: 'regiao',
      stageId: 'qualificacao',
      text: 'Em qual bairro ou regiao voce quer morar?',
      purpose: 'Entender localizacao desejada.',
      variableKey: 'regiao_interesse',
      skipWhenKnown: 'Pular se a regiao de interesse ja estiver clara no contexto.',
      required: true,
      order: 0,
    },
    {
      id: 'orcamento',
      stageId: 'qualificacao',
      text: 'Qual faixa de valor voce pretende investir?',
      purpose: 'Entender orcamento do lead.',
      variableKey: 'faixa_valor',
      skipWhenKnown: 'Nao perguntar se o valor ja foi informado.',
      required: true,
      order: 1,
    },
  ],
  variables: [
    {
      key: 'regiao_interesse',
      label: 'Regiao de interesse',
      type: 'location',
      source: 'user',
      reviewRequired: false,
    },
    {
      key: 'faixa_valor',
      label: 'Faixa de valor',
      type: 'currency',
      source: 'user',
      reviewRequired: false,
    },
  ],
  skipRules: [],
  successCriteria: ['Lead qualificado com regiao, orcamento e proximo passo.'],
  handoffTriggers: ['Lead pede visita ou consultor humano.'],
  toolTriggers: [
    {
      capability: 'Criar lead no CRM',
      toolKey: 'create_lead',
      when: 'Quando regiao_interesse e faixa_valor estiverem preenchidos.',
      requiredVariables: ['regiao_interesse', 'faixa_valor'],
      fallback: 'Se o CRM falhar, avisar que a equipe dara continuidade.',
      active: true,
    },
  ],
  objectionRules: [],
  doRules: ['Perguntar uma coisa por vez.'],
  dontRules: ['Nunca inventar disponibilidade de imoveis.'],
  sourceRefs: [],
}

function byKind(
  scenarios: ReturnType<typeof generateRefinementScenarios>,
  kind: ReturnType<typeof generateRefinementScenarios>[number]['kind'],
) {
  const scenario = scenarios.find((item) => item.kind === kind)
  expect(scenario).toBeDefined()
  return scenario!
}

describe('generateRefinementScenarios', () => {
  it('gera os 6 cenarios minimos com falha de ferramenta quando ha toolTrigger', () => {
    const scenarios = generateRefinementScenarios(blueprint)

    expect(scenarios).toHaveLength(6)
    expect(scenarios.map((scenario) => scenario.kind)).toEqual([
      'happy_flow',
      'rushed_lead',
      'skip_known_data',
      'out_of_scope_dont_rule',
      'human_request',
      'tool_failure',
    ])

    const skipScenario = byKind(scenarios, 'skip_known_data')
    expect(skipScenario.setup?.knownVariables).toEqual({
      regiao_interesse: 'Centro',
    })
    expect(skipScenario.expectedBehaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: 'skip_known_data.do_not_repeat',
          blueprintPath: 'questions.0.skipWhenKnown',
        }),
        expect.objectContaining({
          checkId: 'skip_known_data.advance_to_next_missing',
          blueprintPath: 'questions.1',
        }),
      ]),
    )

    const outOfScopeScenario = byKind(scenarios, 'out_of_scope_dont_rule')
    expect(outOfScopeScenario.blueprintPaths).toContain('dontRules.0')
    expect(outOfScopeScenario.expectedBehaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          statement: expect.stringContaining(
            'Nunca inventar disponibilidade de imoveis',
          ),
        }),
      ]),
    )

    const humanScenario = byKind(scenarios, 'human_request')
    expect(humanScenario.blueprintPaths).toContain('handoffTriggers.0')

    const toolScenario = byKind(scenarios, 'tool_failure')
    expect(toolScenario.setup?.toolFailure).toEqual({
      toolKey: 'create_lead',
      capability: 'Criar lead no CRM',
      message: 'Falha simulada: timeout ou erro externo.',
    })
    expect(toolScenario.turns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actor: 'tool',
          toolKey: 'create_lead',
          status: 'failure',
        }),
      ]),
    )
    expect(toolScenario.expectedBehaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: 'tool_failure.apply_fallback',
          blueprintPath: 'toolTriggers.0.fallback',
          statement: expect.stringContaining('Se o CRM falhar'),
        }),
      ]),
    )
  })

  it('troca o cenario de ferramenta por fallback geral quando nao ha toolTrigger', () => {
    const scenarios = generateRefinementScenarios({
      ...blueprint,
      toolTriggers: [],
    })

    expect(scenarios).toHaveLength(6)
    expect(scenarios.map((scenario) => scenario.kind)).toEqual([
      'happy_flow',
      'rushed_lead',
      'skip_known_data',
      'out_of_scope_dont_rule',
      'human_request',
      'general_fallback',
    ])
    expect(scenarios.some((scenario) => scenario.kind === 'tool_failure')).toBe(
      false,
    )

    const fallbackScenario = byKind(scenarios, 'general_fallback')
    expect(fallbackScenario.expectedBehaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          checkId: 'general_fallback.no_fake_tool',
        }),
      ]),
    )
  })

  it('e deterministico para o mesmo blueprint', () => {
    expect(generateRefinementScenarios(blueprint)).toEqual(
      generateRefinementScenarios(blueprint),
    )
  })
})

describe('scenarioGeneratorSubAgent', () => {
  it('executa sem LLM e retorna saida tipada', async () => {
    const result = await scenarioGeneratorSubAgent.run(
      { blueprint },
      {
        organizationId: 'org-test',
        userId: 'user-test',
        projectId: 'proj-test',
      },
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.source).toBe('deterministic')
    expect(result.data.scenarios).toHaveLength(6)
  })
})
