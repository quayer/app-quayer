import type { ConversationBlueprint } from './blueprint.schema'
import { normalizeConversationBlueprint } from './blueprint-helpers'

type FixtureKey = 'imobiliario' | 'b2b' | 'servico_local' | 'saude' | 'delivery'
type RawFixture = Record<string, unknown>

const FIXTURES: Record<FixtureKey, RawFixture> = {
  imobiliario: {
    objective: 'Qualificar interessados em imóveis e conduzir para visita ou atendimento humano.',
    niche: 'imobiliário',
    stages: [
      {
        id: 'entender_interesse',
        title: 'Entender interesse',
        goal: 'Descobrir se o lead quer morar, investir ou só tirar dúvidas.',
      },
      {
        id: 'qualificar_busca',
        title: 'Qualificar busca',
        goal: 'Coletar preferências suficientes para sugerir o próximo passo.',
      },
      {
        id: 'proximo_passo',
        title: 'Conduzir próximo passo',
        goal: 'Oferecer detalhes, fotos, visita ou contato com consultor.',
      },
    ],
    questions: [
      {
        id: 'objetivo_compra',
        stageId: 'entender_interesse',
        text: 'Você está procurando para morar, investir ou ainda está pesquisando?',
        purpose: 'Descobrir a intenção principal do lead.',
        variableKey: 'objetivo_compra',
        skipWhenKnown: 'Pular se o lead já disse que quer morar, investir ou pesquisar.',
      },
      {
        id: 'tipologia_regiao',
        stageId: 'qualificar_busca',
        text: 'Qual tipo de imóvel e região fazem mais sentido para você?',
        purpose: 'Identificar tipologia e localização desejadas.',
        variableKey: 'tipologia_regiao',
        skipWhenKnown: 'Pular se tipo de imóvel e região já estiverem claros.',
      },
      {
        id: 'faixa_valor',
        stageId: 'qualificar_busca',
        text: 'Você já tem uma faixa de valor ou forma de pagamento em mente?',
        purpose: 'Entender orçamento e necessidade de financiamento.',
        variableKey: 'faixa_valor',
        skipWhenKnown: 'Pular se orçamento ou financiamento já foram informados.',
      },
      {
        id: 'proximo_passo_preferido',
        stageId: 'proximo_passo',
        text: 'Quer receber mais detalhes, ver fotos ou falar com um consultor?',
        purpose: 'Escolher o melhor próximo passo.',
        variableKey: 'proximo_passo_preferido',
        skipWhenKnown: 'Pular se o lead já pediu detalhes, fotos, visita ou consultor.',
      },
    ],
    variables: [],
    skipRules: [],
    successCriteria: [
      'Lead qualificado com intenção, tipo/região, faixa de valor e próximo passo.',
      'Lead encaminhado sem repetir perguntas já respondidas.',
    ],
    handoffTriggers: [
      'Lead pede visita, proposta ou atendimento com consultor.',
      'Lead demonstra urgência ou pergunta por negociação específica.',
    ],
    toolTriggers: [],
    objectionRules: [
      {
        objection: 'Ainda estou só pesquisando',
        responseGuidance:
          'Acolher, oferecer informação útil e perguntar o tipo/região para enviar opções relevantes.',
      },
    ],
    doRules: ['Perguntar uma coisa por vez.', 'Resumir o interesse antes de encaminhar.'],
    dontRules: ['Não prometer disponibilidade sem confirmação.', 'Não inventar preço ou condição.'],
    sourceRefs: [{ type: 'default', label: 'Fixture inicial imobiliário' }],
  },
  b2b: {
    objective: 'Qualificar oportunidades B2B e conduzir para diagnóstico ou reunião.',
    niche: 'B2B',
    stages: [
      { id: 'dor', title: 'Entender dor', goal: 'Descobrir o problema principal.' },
      { id: 'contexto', title: 'Contexto da empresa', goal: 'Entender porte, processo e urgência.' },
      { id: 'conversao', title: 'Converter', goal: 'Conduzir para diagnóstico ou reunião.' },
    ],
    questions: [
      {
        id: 'problema_atual',
        stageId: 'dor',
        text: 'Qual problema você quer resolver primeiro?',
        purpose: 'Identificar a dor principal.',
        variableKey: 'problema_atual',
        skipWhenKnown: 'Pular se a dor principal já foi descrita.',
      },
      {
        id: 'processo_atual',
        stageId: 'contexto',
        text: 'Como vocês resolvem isso hoje?',
        purpose: 'Entender processo atual e maturidade.',
        variableKey: 'processo_atual',
        skipWhenKnown: 'Pular se o lead já explicou o processo atual.',
      },
      {
        id: 'porte_volume',
        stageId: 'contexto',
        text: 'Qual o tamanho do time ou volume envolvido?',
        purpose: 'Medir fit e prioridade.',
        variableKey: 'porte_volume',
        skipWhenKnown: 'Pular se porte ou volume já estiver claro.',
      },
      {
        id: 'agenda_diagnostico',
        stageId: 'conversao',
        text: 'Faz sentido marcar um diagnóstico rápido para entender o cenário?',
        purpose: 'Conduzir para reunião.',
        variableKey: 'agenda_diagnostico',
        skipWhenKnown: 'Pular se o lead já aceitou ou recusou reunião.',
      },
    ],
    variables: [],
    skipRules: [],
    successCriteria: ['Lead com dor, contexto e próximo passo definidos.'],
    handoffTriggers: ['Lead aceita diagnóstico ou pede proposta.'],
    toolTriggers: [],
    objectionRules: [
      {
        objection: 'Não tenho tempo agora',
        responseGuidance:
          'Ser breve, oferecer resumo e perguntar melhor horário para retomar.',
      },
    ],
    doRules: ['Conectar perguntas ao problema do lead.'],
    dontRules: ['Não forçar reunião antes de entender a dor.'],
    sourceRefs: [{ type: 'default', label: 'Fixture inicial B2B' }],
  },
  servico_local: {
    objective: 'Responder interessados em serviço local e conduzir para orçamento ou agendamento.',
    niche: 'serviço local',
    stages: [
      { id: 'necessidade', title: 'Necessidade', goal: 'Entender o serviço procurado.' },
      { id: 'detalhes', title: 'Detalhes', goal: 'Coletar informações para orçamento ou agenda.' },
      { id: 'fechamento', title: 'Fechamento', goal: 'Encaminhar para confirmação.' },
    ],
    questions: [
      {
        id: 'servico_desejado',
        stageId: 'necessidade',
        text: 'Qual serviço você precisa?',
        purpose: 'Identificar o serviço desejado.',
        variableKey: 'servico_desejado',
        skipWhenKnown: 'Pular se o serviço já foi informado.',
      },
      {
        id: 'preferencia_horario',
        stageId: 'detalhes',
        text: 'Você prefere algum dia ou horário?',
        purpose: 'Coletar preferência de agenda.',
        variableKey: 'preferencia_horario',
        skipWhenKnown: 'Pular se o lead já informou data ou horário.',
      },
      {
        id: 'unidade_profissional',
        stageId: 'detalhes',
        text: 'Tem preferência por unidade ou profissional?',
        purpose: 'Identificar preferência operacional.',
        variableKey: 'unidade_profissional',
        skipWhenKnown: 'Pular se não houver unidades/profissionais ou se o lead já disse.',
      },
      {
        id: 'confirmar_proximo_passo',
        stageId: 'fechamento',
        text: 'Quer que eu siga com orçamento ou agendamento?',
        purpose: 'Definir próximo passo.',
        variableKey: 'confirmar_proximo_passo',
        skipWhenKnown: 'Pular se o lead já pediu orçamento ou agendamento.',
      },
    ],
    variables: [],
    skipRules: [],
    successCriteria: ['Serviço e próximo passo claros.'],
    handoffTriggers: ['Lead quer fechar, agendar ou negociar condição específica.'],
    toolTriggers: [],
    objectionRules: [
      {
        objection: 'Só quero saber preço',
        responseGuidance:
          'Responder conforme política de preços e pedir o serviço para orientar melhor.',
      },
    ],
    doRules: ['Manter tom prático e local.'],
    dontRules: ['Não confirmar agenda sem conexão real de calendário.'],
    sourceRefs: [{ type: 'default', label: 'Fixture inicial serviço local' }],
  },
  saude: {
    objective: 'Orientar pacientes, qualificar demanda e conduzir para atendimento sem diagnóstico.',
    niche: 'saúde',
    stages: [
      { id: 'demanda', title: 'Demanda', goal: 'Entender o motivo do contato sem diagnosticar.' },
      { id: 'triagem_leve', title: 'Triagem leve', goal: 'Coletar contexto seguro e encaminhar.' },
      { id: 'encaminhamento', title: 'Encaminhamento', goal: 'Agendar ou orientar atendimento humano.' },
    ],
    questions: [
      {
        id: 'motivo_contato',
        stageId: 'demanda',
        text: 'Qual é o motivo do contato ou o tipo de atendimento que você procura?',
        purpose: 'Entender a demanda sem fazer diagnóstico.',
        variableKey: 'motivo_contato',
        skipWhenKnown: 'Pular se a demanda já foi informada.',
      },
      {
        id: 'urgencia',
        stageId: 'triagem_leve',
        text: 'É algo urgente ou você busca um horário para avaliação?',
        purpose: 'Identificar urgência e segurança.',
        variableKey: 'urgencia',
        skipWhenKnown: 'Pular se urgência já estiver clara.',
      },
      {
        id: 'preferencia_atendimento',
        stageId: 'encaminhamento',
        text: 'Você prefere agendar ou falar com a equipe primeiro?',
        purpose: 'Definir encaminhamento.',
        variableKey: 'preferencia_atendimento',
        skipWhenKnown: 'Pular se o lead já pediu agenda ou humano.',
      },
    ],
    variables: [],
    skipRules: [],
    successCriteria: ['Demanda entendida e encaminhada sem diagnóstico médico.'],
    handoffTriggers: ['Sintoma urgente, pedido de diagnóstico ou dúvida clínica sensível.'],
    toolTriggers: [],
    objectionRules: [
      {
        objection: 'Você pode dizer o que eu tenho?',
        responseGuidance:
          'Não diagnosticar; orientar avaliação com profissional e urgência quando aplicável.',
      },
    ],
    doRules: ['Ser acolhedor e seguro.', 'Recomendar atendimento humano em dúvidas clínicas.'],
    dontRules: ['Não dar diagnóstico.', 'Não prescrever tratamento.'],
    sourceRefs: [{ type: 'default', label: 'Fixture inicial saúde' }],
  },
  delivery: {
    objective: 'Atender pedidos, tirar dúvidas de cardápio e conduzir para compra.',
    niche: 'delivery',
    stages: [
      { id: 'pedido', title: 'Pedido', goal: 'Entender o que o cliente quer pedir.' },
      { id: 'detalhes_entrega', title: 'Entrega', goal: 'Coletar detalhes necessários.' },
      { id: 'confirmacao', title: 'Confirmação', goal: 'Conferir pedido e próximo passo.' },
    ],
    questions: [
      {
        id: 'item_interesse',
        stageId: 'pedido',
        text: 'Você já sabe o que quer pedir ou quer ver sugestões?',
        purpose: 'Entender intenção de compra.',
        variableKey: 'item_interesse',
        skipWhenKnown: 'Pular se o item ou categoria já foi informado.',
      },
      {
        id: 'endereco_entrega',
        stageId: 'detalhes_entrega',
        text: 'Qual bairro ou endereço para eu considerar a entrega?',
        purpose: 'Verificar entrega e contexto local.',
        variableKey: 'endereco_entrega',
        skipWhenKnown: 'Pular se endereço/bairro já foi informado.',
      },
      {
        id: 'confirmar_pedido',
        stageId: 'confirmacao',
        text: 'Quer que eu confirme esse pedido ou prefere ajustar alguma coisa?',
        purpose: 'Confirmar intenção final.',
        variableKey: 'confirmar_pedido',
        skipWhenKnown: 'Pular se o cliente já confirmou o pedido.',
      },
    ],
    variables: [],
    skipRules: [],
    successCriteria: ['Pedido, entrega e próximo passo claros.'],
    handoffTriggers: ['Cliente quer fechar pedido, reclamar ou negociar condição.'],
    toolTriggers: [],
    objectionRules: [
      {
        objection: 'Está caro',
        responseGuidance:
          'Acolher, sugerir opções compatíveis e evitar prometer desconto não confirmado.',
      },
    ],
    doRules: ['Ser objetivo e apetitoso.'],
    dontRules: ['Não confirmar pedido sem dados suficientes.'],
    sourceRefs: [{ type: 'default', label: 'Fixture inicial delivery' }],
  },
}

function fixtureKeyFor(niche: string): FixtureKey {
  const n = niche.toLowerCase()
  if (/(im[oó]vel|imobili|corretor|apartamento|casa)/.test(n)) return 'imobiliario'
  if (/(sa[uú]de|cl[ií]nica|m[eé]dic|dent|psico|consulta)/.test(n)) return 'saude'
  if (/(delivery|restaurante|lanch|pizza|comida|pedido)/.test(n)) return 'delivery'
  if (/(b2b|software|saas|empresa|crm|diagn[oó]stico)/.test(n)) return 'b2b'
  return 'servico_local'
}

export function buildNicheBlueprintFixture(args: {
  objective: string
  niche: string
}): ConversationBlueprint {
  const key = fixtureKeyFor(`${args.niche} ${args.objective}`)
  return normalizeConversationBlueprint({
    ...FIXTURES[key],
    status: 'proposed',
    objective: args.objective,
    niche: args.niche,
  })
}
