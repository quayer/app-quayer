import { describe, expect, it } from 'vitest'
import type { ConversationBlueprint } from '../playbook/blueprint.schema'
import { validateBlueprintPreservation } from './blueprint-preservation'

const blueprint: ConversationBlueprint = {
  status: 'approved',
  objective: 'Qualificar leads imobiliarios e encaminhar para atendimento.',
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
      purpose: 'Entender a localizacao desejada',
      variableKey: 'regiao_interesse',
      skipWhenKnown: 'Pular se a regiao de interesse ja estiver clara no contexto.',
      required: true,
      order: 0,
    },
    {
      id: 'orcamento',
      stageId: 'qualificacao',
      text: 'Qual faixa de valor voce pretende investir?',
      purpose: 'Entender o orcamento do lead',
      variableKey: 'faixa_valor',
      skipWhenKnown: 'Nao perguntar se o valor ou orcamento ja foi informado.',
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
  skipRules: [
    {
      questionId: 'regiao',
      condition: 'Se houver regiao no CRM, nao repetir a pergunta.',
      reason: 'Evitar atrito.',
    },
  ],
  successCriteria: ['Lead qualificado com regiao e orcamento.'],
  handoffTriggers: ['Transferir para humano quando o lead pedir visita ao imovel.'],
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
  doRules: [],
  dontRules: ['Nunca inventar disponibilidade de imoveis.'],
  sourceRefs: [],
  approvedAt: '2026-06-12T12:00:00.000Z',
}

describe('validateBlueprintPreservation', () => {
  it('passes when the prompt preserves the blueprint with tolerant wording', () => {
    const prompt = `
# Fluxo de atendimento
- Descubra a localização desejada: pergunte em que bairro ou região a pessoa quer morar.
- Salve isso como regiao_interesse / região de interesse.
- Depois entenda a faixa de preço ou investimento pretendido e registre faixa_valor.
- Não repetir perguntas: se houver região no CRM ou se o orçamento já foi informado no contexto, pule essa pergunta.

# Ferramentas
- create_lead (Criar lead no CRM): usar quando região de interesse e faixa de valor estiverem preenchidas.
- Se o CRM falhar, informe que a equipe dará continuidade.

# Handoff e limites
- Transferir para uma pessoa da equipe quando o lead pedir visita ao imóvel.
- Nunca invente disponibilidade de imóveis.
`

    const result = validateBlueprintPreservation({ prompt, blueprint })

    expect(result.pass).toBe(true)
    expect(result.issues).toEqual([])
  })

  it('reports structured errors when core blueprint parts are absent', () => {
    const prompt = `
# Fluxo
Cumprimente o cliente e apresente a imobiliaria.

# Regras
Se nao souber responder, seja cordial.
`

    const result = validateBlueprintPreservation({ prompt, blueprint })

    expect(result.pass).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_question',
          path: 'questions.0',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'missing_variable',
          path: 'questions.0.variableKey',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'missing_skip_rule',
          path: 'questions.0.skipWhenKnown',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'missing_handoff_trigger',
          path: 'handoffTriggers.0',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'missing_tool_trigger',
          path: 'toolTriggers.0',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'missing_dont_rule',
          path: 'dontRules.0',
          severity: 'error',
        }),
      ]),
    )
  })

  it('warns for optional inactive tool trigger fallback gaps', () => {
    const inactiveToolBlueprint: ConversationBlueprint = {
      ...blueprint,
      toolTriggers: [
        {
          capability: 'Consultar catalogo',
          toolKey: 'search_catalog',
          when: 'Quando o lead pedir opcoes de imoveis.',
          requiredVariables: [],
          fallback: 'Se o catalogo falhar, encaminhar para a equipe.',
          active: false,
        },
      ],
    }

    const prompt = `
Pergunte o bairro ou região, registre regiao_interesse, pergunte a faixa de valor e registre faixa_valor.
Não repetir perguntas se a região ou orçamento já estiver no contexto.
Se houver região no CRM, não repetir a pergunta.
Transferir para humano quando pedir visita ao imóvel.
Nunca inventar disponibilidade de imóveis.
`

    const result = validateBlueprintPreservation({
      prompt,
      blueprint: inactiveToolBlueprint,
    })

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missing_tool_trigger',
          severity: 'warning',
          path: 'toolTriggers.0',
        }),
        expect.objectContaining({
          code: 'missing_tool_fallback',
          severity: 'warning',
          path: 'toolTriggers.0.fallback',
        }),
      ]),
    )
  })
})
