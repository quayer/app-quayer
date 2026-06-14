import type { ConversationBlueprint } from './blueprint.schema'
import { normalizeConversationBlueprint } from './blueprint-helpers'

type FixtureKey =
  | 'imobiliario_financiamento_popular'
  | 'imobiliario_empreendimento'
  | 'imobiliario'
  | 'b2b'
  | 'servico_local'
  | 'saude'
  | 'delivery'
type RawFixture = Record<string, unknown>

const FIXTURES: Record<FixtureKey, RawFixture> = {
  imobiliario_financiamento_popular: {
    objective:
      'Qualificar interessado em empreendimento com financiamento popular e conduzir para simulação, consultor ou visita.',
    niche: 'empreendimento imobiliário com financiamento',
    stages: [
      {
        id: 'confirmar_interesse',
        title: 'Confirmar interesse',
        goal: 'Acolher o lead interessado no empreendimento e confirmar intenção de compra/moradia.',
      },
      {
        id: 'qualificar_financiamento',
        title: 'Qualificar financiamento',
        goal: 'Coletar sinais mínimos para simulação sem prometer aprovação, subsídio ou condição.',
      },
      {
        id: 'conduzir_simulacao_visita',
        title: 'Conduzir próximo passo',
        goal: 'Direcionar para simulação com consultor, envio de material ou visita com horário disponível.',
      },
    ],
    questions: [
      {
        id: 'primeiro_imovel',
        stageId: 'qualificar_financiamento',
        text: 'Esse seria seu primeiro imóvel?',
        purpose: 'Entender um sinal importante para financiamento/subsídio sem prometer enquadramento.',
        variableKey: 'primeiro_imovel',
        skipWhenKnown: 'Pular se o lead já informou que é ou não é primeiro imóvel.',
      },
      {
        id: 'renda_familiar_aproximada',
        stageId: 'qualificar_financiamento',
        text: 'Qual é a renda familiar aproximada hoje?',
        purpose: 'Coletar renda aproximada para o consultor validar possibilidades de financiamento.',
        variableKey: 'renda_familiar_aproximada',
        skipWhenKnown: 'Pular se renda familiar aproximada já estiver no contexto.',
      },
      {
        id: 'entrada_fgts',
        stageId: 'qualificar_financiamento',
        text: 'Qual valor você tem disponível para entrada, incluindo FGTS se for usar?',
        purpose: 'Entender recursos disponíveis para entrada e simulação.',
        variableKey: 'entrada_fgts',
        skipWhenKnown: 'Pular se valor de entrada ou uso de FGTS já estiver claro.',
      },
      {
        id: 'proximo_passo_interesse',
        stageId: 'conduzir_simulacao_visita',
        text: 'Qual próximo passo faz mais sentido: simulação com consultor, material, visita?',
        purpose: 'Definir o encaminhamento mais útil para o lead.',
        variableKey: 'proximo_passo_interesse',
        skipWhenKnown: 'Pular se o lead já pediu simulação, material, visita ou consultor.',
      },
      {
        id: 'email_material',
        stageId: 'conduzir_simulacao_visita',
        text: 'Qual e-mail posso usar para enviar o material da simulação?',
        purpose: 'Coletar e-mail quando o próximo passo exigir material, simulação ou proposta.',
        variableKey: 'email_material',
        skipWhenKnown: 'Pular se e-mail já estiver conhecido ou se o lead não quiser material/simulação.',
        required: false,
      },
    ],
    variables: [
      {
        key: 'email_material',
        label: 'E-mail para material ou simulação',
        type: 'email',
        source: 'user',
        reviewRequired: false,
      },
    ],
    skipRules: [],
    successCriteria: [
      'Lead encaminhado com primeiro imóvel, renda aproximada, entrada/FGTS e próximo passo quando possível.',
      'Endereço confirmado do empreendimento informado quando o lead pedir localização, visita ou handoff.',
      'Simulação, aprovação, subsídio e condições foram prometidos apenas após validação humana/simulador.',
      'Se o lead quiser visita e houver agenda conectada, horários disponíveis foram oferecidos antes do agendamento.',
    ],
    handoffTriggers: [
      'Lead pede simulação, aprovação de financiamento, subsídio, Minha Casa Minha Vida, proposta ou condição comercial.',
      'Lead quer falar com consultor ou confirmar disponibilidade/preço final.',
      'Lead aceita visita e não há agenda conectada para confirmar horários reais.',
    ],
    toolTriggers: [
      {
        capability: 'Registrar lead para simulação imobiliária',
        toolKey: 'create_lead',
        when: 'Quando houver pelo menos renda aproximada, entrada/FGTS ou próximo passo claro.',
        requiredVariables: [
          'renda_familiar_aproximada',
          'entrada_fgts',
          'proximo_passo_interesse',
        ],
        fallback: 'Resumir dados financeiros mínimos na conversa antes de transferir.',
        active: false,
      },
      {
        capability: 'Listar horários disponíveis para visita',
        toolKey: 'calendar_list_slots',
        when: 'Assim que o lead escolher visita e houver agenda conectada.',
        requiredVariables: ['proximo_passo_interesse'],
        fallback: 'Perguntar melhor período e transferir para consultor confirmar.',
        active: false,
      },
      {
        capability: 'Validar horário escolhido',
        toolKey: 'check_availability',
        when: 'Quando o lead escolher um horário entre os slots disponíveis.',
        requiredVariables: ['proximo_passo_interesse'],
        fallback: 'Oferecer outro horário disponível ou transferir para consultor.',
        active: false,
      },
      {
        capability: 'Agendar visita no decorado ou stand',
        toolKey: 'create_event',
        when: 'Quando o lead confirmar um horário livre para visita.',
        requiredVariables: ['proximo_passo_interesse'],
        fallback: 'Não confirmar visita; transferir para consultor com a preferência do lead.',
        active: false,
      },
      {
        capability: 'Transferir para consultor imobiliário',
        toolKey: 'transfer_to_human',
        when: 'Quando houver pedido de simulação, financiamento, condição comercial, consultor ou falta de agenda conectada.',
        requiredVariables: ['renda_familiar_aproximada', 'proximo_passo_interesse'],
        fallback: 'Avisar que o consultor valida as condições e confirma os detalhes.',
        active: false,
      },
    ],
    objectionRules: [
      {
        objection: 'Não sei minha renda exata',
        responseGuidance:
          'Pedir uma estimativa aproximada e explicar que o consultor valida a simulação depois.',
      },
      {
        objection: 'Não tenho entrada',
        responseGuidance:
          'Acolher e encaminhar para consultor validar alternativas, sem prometer aprovação ou condição.',
      },
    ],
    doRules: [
      'Explicar que os dados servem para o consultor simular possibilidades.',
      'Informar o endereço confirmado do empreendimento quando houver interesse em localização/visita.',
      'Coletar e-mail somente se for enviar material, simulação ou proposta.',
      'Ao transferir, resumir primeiro imóvel, renda aproximada, entrada/FGTS, próximo passo e melhor período de contato/visita.',
    ],
    dontRules: [
      'Não prometer aprovação de financiamento, subsídio, enquadramento no Minha Casa Minha Vida ou uso de FGTS.',
      'Não pedir CPF ou documentos sensíveis sem ferramenta, política ou necessidade explícita.',
      'Não inventar faixas oficiais, regras do programa, preço, condição ou disponibilidade.',
      'Não confirmar visita sem agenda conectada e horário livre.',
    ],
    sourceRefs: [
      { type: 'default', label: 'Fixture empreendimento com financiamento popular' },
    ],
  },
  imobiliario_empreendimento: {
    objective: 'Atender interessado em empreendimento específico e conduzir para material, consultor ou visita.',
    niche: 'empreendimento imobiliário',
    stages: [
      {
        id: 'confirmar_interesse',
        title: 'Confirmar interesse',
        goal: 'Acolher o lead e confirmar a intenção sem repetir dados que já vieram da fonte.',
      },
      {
        id: 'conduzir_proximo_passo',
        title: 'Conduzir próximo passo',
        goal: 'Direcionar para valores/condições, plantas/material, visita ou consultor.',
      },
      {
        id: 'agendar_visita',
        title: 'Agendar visita',
        goal: 'Oferecer horários reais quando houver agenda conectada ou transferir para confirmação humana.',
      },
    ],
    questions: [
      {
        id: 'objetivo_compra',
        stageId: 'confirmar_interesse',
        text: 'Você está olhando esse empreendimento para morar ou investir?',
        purpose: 'Entender a motivação principal do lead sem abrir uma busca genérica.',
        variableKey: 'objetivo_compra',
        skipWhenKnown: 'Pular se o lead já informou que quer morar, investir ou apenas pesquisar.',
      },
      {
        id: 'proximo_passo_interesse',
        stageId: 'conduzir_proximo_passo',
        text: 'O que você quer ver agora: valores e condições, plantas, visita ou falar com consultor?',
        purpose: 'Identificar o próximo passo comercial mais útil para o lead.',
        variableKey: 'proximo_passo_interesse',
        skipWhenKnown: 'Pular se o lead já pediu valores, plantas, visita ou consultor.',
      },
      {
        id: 'prazo_decisao',
        stageId: 'conduzir_proximo_passo',
        text: 'Você pretende decidir nos próximos meses ou está pesquisando com calma?',
        purpose: 'Entender urgência sem pressionar o lead.',
        variableKey: 'prazo_decisao',
        skipWhenKnown: 'Pular se o prazo ou urgência já estiver claro.',
      },
    ],
    variables: [],
    skipRules: [],
    successCriteria: [
      'Lead interessado no empreendimento com objetivo e próximo passo definidos.',
      'Se o lead quiser visita e houver agenda conectada, horários disponíveis foram oferecidos antes do agendamento.',
      'Preço final, condição comercial, financiamento e disponibilidade específica foram respondidos apenas com fonte confirmada ou consultor.',
    ],
    handoffTriggers: [
      'Lead pede consultor, proposta, financiamento, preço final, condição comercial ou disponibilidade específica.',
      'Lead aceita visita e não há agenda conectada para confirmar horários reais.',
      'Lead demonstra alto interesse e quer avançar com valores/condições.',
    ],
    toolTriggers: [
      {
        capability: 'Registrar lead interessado no empreendimento',
        toolKey: 'create_lead',
        when: 'Quando objetivo ou próximo passo estiver claro.',
        requiredVariables: ['objetivo_compra', 'proximo_passo_interesse'],
        fallback: 'Manter resumo do interesse na conversa antes de transferir.',
        active: false,
      },
      {
        capability: 'Listar horários disponíveis para visita',
        toolKey: 'calendar_list_slots',
        when: 'Assim que o lead aceitar visita e houver agenda conectada.',
        requiredVariables: ['proximo_passo_interesse'],
        fallback: 'Perguntar melhor período e transferir para consultor confirmar.',
        active: false,
      },
      {
        capability: 'Validar horário escolhido',
        toolKey: 'check_availability',
        when: 'Quando o lead escolher um horário entre os slots disponíveis.',
        requiredVariables: ['proximo_passo_interesse'],
        fallback: 'Oferecer outro horário disponível ou transferir para consultor.',
        active: false,
      },
      {
        capability: 'Agendar visita no decorado ou stand',
        toolKey: 'create_event',
        when: 'Quando o lead confirmar um horário livre para visita.',
        requiredVariables: ['proximo_passo_interesse'],
        fallback: 'Não confirmar visita; transferir para consultor com a preferência do lead.',
        active: false,
      },
      {
        capability: 'Transferir para consultor imobiliário',
        toolKey: 'transfer_to_human',
        when: 'Quando houver dúvida comercial específica, pedido de consultor ou falta de agenda conectada.',
        requiredVariables: ['objetivo_compra', 'proximo_passo_interesse'],
        fallback: 'Avisar que o consultor confirma os detalhes.',
        active: false,
      },
    ],
    objectionRules: [
      {
        objection: 'Só estou pesquisando',
        responseGuidance:
          'Acolher sem pressionar, oferecer material objetivo e perguntar se deseja valores/plantas ou falar com consultor.',
      },
      {
        objection: 'Quero saber preço',
        responseGuidance:
          'Responder apenas se houver valor confirmado na fonte; senão explicar que o consultor confirma valores e condições atualizadas.',
      },
    ],
    doRules: [
      'Usar nome, localização e diferenciais confirmados do empreendimento como contexto.',
      'Fazer poucas perguntas antes de oferecer o próximo passo.',
      'Quando visita for aceita e agenda existir, oferecer horários disponíveis em vez de perguntar horário aberto.',
      'Resumir objetivo, próximo passo e prazo antes de transferir.',
    ],
    dontRules: [
      'Não perguntar região, tipo de imóvel ou quartos como checklist se o empreendimento já define isso.',
      'Não inventar preço, financiamento, disponibilidade ou condição.',
      'Não confirmar visita sem agenda conectada e horário livre.',
      'Não transformar o atendimento em formulário longo.',
    ],
    sourceRefs: [{ type: 'default', label: 'Fixture empreendimento imobiliário' }],
  },
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
        id: 'qualificar_fit',
        title: 'Qualificar fit',
        goal: 'Entender tipologia, aderência à localização e capacidade de seguir.',
      },
      {
        id: 'conduzir_visita',
        title: 'Conduzir visita',
        goal: 'Definir se o próximo passo é material, consultor ou visita com horário disponível.',
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
        id: 'tipologia_interesse',
        stageId: 'qualificar_fit',
        text: 'Qual tipologia do empreendimento faz mais sentido para você?',
        purpose: 'Identificar a tipologia de interesse sem abrir busca genérica fora do empreendimento.',
        variableKey: 'tipologia_interesse',
        skipWhenKnown: 'Pular se a tipologia de interesse já estiver clara.',
      },
      {
        id: 'aderencia_localizacao',
        stageId: 'qualificar_fit',
        text: 'A região do empreendimento funciona para o que você procura?',
        purpose: 'Validar se a localização do empreendimento combina com a necessidade do lead.',
        variableKey: 'aderencia_localizacao',
        skipWhenKnown: 'Pular se o lead já confirmou que a localização faz sentido.',
      },
      {
        id: 'faixa_valor',
        stageId: 'qualificar_fit',
        text: 'Qual faixa de investimento você tem em mente?',
        purpose: 'Entender compatibilidade financeira sem prometer preço ou condição.',
        variableKey: 'faixa_valor',
        skipWhenKnown: 'Pular se a faixa de investimento já foi informada.',
      },
      {
        id: 'tipo_visita_preferido',
        stageId: 'conduzir_visita',
        text: 'Para avançar, qual formato faz mais sentido: visita ao decorado, atendimento online, consultor primeiro?',
        purpose: 'Definir o próximo passo operacional e o tipo de visita/atendimento desejado.',
        variableKey: 'tipo_visita_preferido',
        skipWhenKnown: 'Pular se o lead já escolheu visita, atendimento online ou consultor.',
      },
    ],
    variables: [],
    skipRules: [],
    successCriteria: [
      'Lead qualificado com intenção, tipologia, aderência à localização, faixa de investimento e próximo passo.',
      'Se houver agenda conectada, horários disponíveis foram oferecidos antes de marcar visita.',
      'Lead encaminhado sem prometer preço, condição ou disponibilidade não confirmada.',
    ],
    handoffTriggers: [
      'Lead pede visita, proposta ou atendimento com consultor.',
      'Lead demonstra urgência ou pergunta por preço final, financiamento, disponibilidade ou negociação específica.',
      'Não há agenda conectada para confirmar horários reais de visita.',
    ],
    toolTriggers: [
      {
        capability: 'Registrar lead imobiliário qualificado',
        toolKey: 'create_lead',
        when: 'Quando intenção, tipologia ou próximo passo estiverem claros o suficiente para continuidade comercial.',
        requiredVariables: ['objetivo_compra', 'tipo_visita_preferido'],
        fallback: 'Resumir o interesse na conversa antes de encaminhar.',
        active: false,
      },
      {
        capability: 'Listar horários disponíveis para visita',
        toolKey: 'calendar_list_slots',
        when: 'Quando o lead escolher visita ou atendimento com horário e houver agenda conectada.',
        requiredVariables: ['tipo_visita_preferido'],
        fallback: 'Coletar preferência de dia/horário e transferir para consultor confirmar.',
        active: false,
      },
      {
        capability: 'Validar horário escolhido',
        toolKey: 'check_availability',
        when: 'Quando o lead escolher um dia ou horário específico para visita.',
        requiredVariables: ['tipo_visita_preferido'],
        fallback: 'Oferecer outros horários disponíveis ou transferir para consultor.',
        active: false,
      },
      {
        capability: 'Agendar visita',
        toolKey: 'create_event',
        when: 'Quando o lead escolher um horário livre e confirmar o formato da visita.',
        requiredVariables: ['tipo_visita_preferido'],
        fallback: 'Não confirmar a visita; transferir para consultor com a preferência do lead.',
        active: false,
      },
      {
        capability: 'Transferir para consultor imobiliário',
        toolKey: 'transfer_to_human',
        when: 'Quando houver dúvida comercial específica, pedido de negociação ou falta de agenda conectada.',
        requiredVariables: ['objetivo_compra', 'tipo_visita_preferido'],
        fallback: 'Avisar que um consultor vai confirmar os detalhes.',
        active: false,
      },
    ],
    objectionRules: [
      {
        objection: 'Ainda estou só pesquisando',
        responseGuidance:
          'Acolher, oferecer informação útil e perguntar o tipo/região para enviar opções relevantes.',
      },
    ],
    doRules: [
      'Perguntar uma coisa por vez.',
      'Usar diferenciais e localização confirmados como contexto, não como pergunta solta.',
      'Oferecer horários disponíveis quando houver agenda conectada.',
      'Resumir o interesse antes de encaminhar.',
    ],
    dontRules: [
      'Não prometer disponibilidade sem confirmação.',
      'Não inventar preço, financiamento ou condição.',
      'Não confirmar visita sem agenda conectada e horário livre.',
    ],
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
  if (/(minha casa|minha\s+casa\s+minha\s+vida|mcmv|subs[ií]dio|financi|fgts|entrada facilitada|renda familiar|simula[cç][aã]o)/.test(n)) {
    return 'imobiliario_financiamento_popular'
  }
  if (/(empreend|empred|incorporador|loteamento|lan[cç]amento|decorado|stand|produto imobili)/.test(n)) {
    return 'imobiliario_empreendimento'
  }
  if (/(im[oó]vel|imob|imobili|empreend|empred|corretor|apartamento|casa)/.test(n)) return 'imobiliario'
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
