/**
 * Builder Module — PLAYBOOK ENGINE: biblioteca de AgentStrategy + resolver
 * (#6 / FR-40 — `specs/jornada-builder-v2/mission-first-v3.md`)
 *
 * Uma AgentStrategy é uma estratégia CURADA de agente (papel × tipo de negócio):
 * o que o agente precisa coletar, quais tools faz sentido recomendar, os
 * guardrails realistas do nicho e como ele entrega o bastão para humano. É a
 * FONTE PRIMÁRIA de recomendação por missão — o recomendador (`capabilities/
 * recommend-capabilities.pure.ts`) consulta esta biblioteca primeiro e só cai
 * para `blueprint.toolTriggers[]` como fallback quando nenhuma strategy bate.
 *
 * 🔒 INVARIANTES DUROS (a razão deste módulo existir):
 *  - DESIGN-TIME e PURO: zero IO, zero `any`, zero import de Prisma/runtime,
 *    zero migration. Espelha `niche-inference.pure.ts` e
 *    `recommend-capabilities.pure.ts`. NUNCA toca send/runtime.
 *  - CATÁLOGO É A LEI: todo `recommendedTools[]` referencia SOMENTE ids válidos
 *    de `catalog/official-tools.ts` (`OFFICIAL_TOOLS`). Há um guard de
 *    desenvolvimento (`assertStrategiesUseOfficialTools`) e o teste cobre isso.
 *  - FRAMEWORK É INTERNO: `framework` (bant_lite/spin/meddic/triage/appointment)
 *    é vocabulário de DESIGN — NUNCA é exposto na UI. A linguagem de negócio
 *    vive em `requiredFields`, `guardrails`, `handoffSummary`, etc.
 *  - NUNCA LANÇA: `resolveAgentStrategy(...)` sempre devolve uma strategy
 *    (fallback genérico para papel/negócio desconhecidos), coerente com NFR-11.
 *  - NICHO REUTILIZADO: o mapeamento nicho→businessType reusa
 *    `inferKnownVertical` (niche-inference.pure.ts) — single source de inferência.
 */

import { OFFICIAL_TOOLS } from '../catalog/official-tools'
import {
  foldText,
  inferKnownVertical,
  type KnownVertical,
} from './niche-inference.pure'

// ==========================================
// Tipos públicos do contrato FR-40
// ==========================================

/** Papel do agente (linguagem de negócio na UI; usado p/ casar strategy). */
export type AgentStrategyRole =
  | 'sdr'
  | 'closer'
  | 'secretaria'
  | 'suporte'
  | 'vendas'
  | 'cobranca'
  | 'onboarding'

/** Tipo de negócio curado (resolvido a partir do nicho via niche-inference). */
export type AgentStrategyBusinessType =
  | 'imobiliario'
  | 'clinica'
  | 'educacao'
  | 'saas'
  | 'servicos'
  | 'ecommerce'
  | 'generico'

/** Objetivo macro da missão (FR-37) — em linguagem de negócio. */
export type AgentStrategyObjective =
  | 'qualificar'
  | 'agendar'
  | 'vender'
  | 'suportar'
  | 'transferir'

/**
 * Framework de vendas/atendimento que dá a espinha dorsal à estratégia.
 * 🔒 INTERNO — NUNCA exibir na UI (é jargão de design, não de negócio).
 */
export type AgentStrategyFramework =
  | 'bant_lite'
  | 'spin'
  | 'meddic'
  | 'triage'
  | 'appointment'

/**
 * Estratégia CURADA de agente. Tudo aqui é design-time e em linguagem de
 * negócio, EXCETO `framework` (interno). `recommendedTools` referencia apenas
 * ids de `OFFICIAL_TOOLS`.
 */
export interface AgentStrategy {
  /** Papel do agente (chave de casamento + rótulo de negócio). */
  role: AgentStrategyRole
  /** Tipo de negócio curado (resolvido do nicho). */
  businessType: AgentStrategyBusinessType
  /** Objetivo macro que a estratégia persegue. */
  objective: AgentStrategyObjective
  /** 🔒 Framework INTERNO que estrutura a coleta — nunca exposto na UI. */
  framework: AgentStrategyFramework
  /** O que o agente precisa descobrir/coletar — linguagem de negócio (FR-49). */
  requiredFields: string[]
  /** Tools recomendadas — SOMENTE ids de `OFFICIAL_TOOLS` (FR-51). */
  recommendedTools: string[]
  /** Limites realistas do nicho (ex.: não prometer preço/disponibilidade). */
  guardrails: string[]
  /** Como o agente entrega o bastão para humano (resumo do handoff). */
  handoffSummary: string[]
  /** Exemplos curtos de conversa que ilustram o estilo da estratégia. */
  exampleConversations: string[]
  /** Critérios de sucesso mapeáveis a eventos de funil (linguagem de negócio). */
  successCriteria: string[]
}

// ==========================================
// Biblioteca CURADA de estratégias
// ==========================================

/**
 * ~8 estratégias reais (papel × negócio). A ordem importa para o desempate do
 * resolver: a primeira que casar (role + businessType) vence; depois cai para a
 * primeira do mesmo role; por fim para a genérica de SDR.
 *
 * Tools usadas (todas ∈ OFFICIAL_TOOLS): transfer_to_human, create_lead,
 * create_followup, check_availability, create_event, cancel_event,
 * calendar_list_slots, calculator, search_contacts, detect_talking_to_ai.
 */
export const AGENT_STRATEGIES: readonly AgentStrategy[] = [
  // ── SDR imobiliário (qualificar interessados em imóvel) ────────────────────
  {
    role: 'sdr',
    businessType: 'imobiliario',
    objective: 'qualificar',
    framework: 'bant_lite',
    requiredFields: [
      'Se a pessoa quer morar, investir ou só está pesquisando',
      'Tipo de imóvel e região de interesse',
      'Faixa de valor ou forma de pagamento',
      'Próximo passo desejado (mais detalhes, visita ou falar com consultor)',
    ],
    recommendedTools: ['create_lead', 'transfer_to_human', 'create_followup'],
    guardrails: [
      'Não prometer disponibilidade de imóvel sem confirmação humana.',
      'Não inventar preço, condição de pagamento ou data de visita.',
      'Uma pergunta por vez; nunca despejar formulário.',
    ],
    handoffSummary: [
      'Passar para um consultor quando o lead pedir visita, proposta ou negociação.',
      'Resumir intenção, tipo/região e faixa de valor antes de transferir.',
    ],
    exampleConversations: [
      'Cliente: "Tem apê de 2 quartos na zona sul?" → entender se é p/ morar ou investir, depois região e faixa de valor.',
      'Cliente: "Quero agendar uma visita" → confirmar dados e transferir para o consultor.',
    ],
    successCriteria: [
      'Lead qualificado com intenção, tipo/região e faixa de valor.',
      'Lead encaminhado ao consultor sem repetir perguntas já respondidas.',
    ],
  },

  // ── SDR B2B / SaaS (qualificar oportunidade e marcar diagnóstico) ──────────
  {
    role: 'sdr',
    businessType: 'saas',
    objective: 'qualificar',
    framework: 'spin',
    requiredFields: [
      'Qual problema a empresa quer resolver primeiro',
      'Como o processo é feito hoje',
      'Tamanho do time ou volume envolvido',
      'Abertura para marcar um diagnóstico/reunião',
    ],
    recommendedTools: [
      'create_lead',
      'check_availability',
      'create_event',
      'transfer_to_human',
      'create_followup',
    ],
    guardrails: [
      'Não forçar reunião antes de entender a dor do lead.',
      'Não prometer preço ou ROI específico sem validação humana.',
      'Não confirmar horário de reunião sem agenda conectada.',
    ],
    handoffSummary: [
      'Passar para vendas/CS quando o lead aceitar diagnóstico ou pedir proposta.',
      'Levar dor, contexto da empresa e porte no resumo.',
    ],
    exampleConversations: [
      'Cliente: "Vocês integram com meu CRM?" → entender o problema atual antes de detalhar.',
      'Cliente: "Topo conhecer" → consultar horário livre e marcar o diagnóstico.',
    ],
    successCriteria: [
      'Lead com dor, processo atual e porte mapeados.',
      'Diagnóstico/reunião marcado ou follow-up agendado.',
    ],
  },

  // ── Closer (conduzir lead quente ao fechamento) ────────────────────────────
  {
    role: 'closer',
    businessType: 'generico',
    objective: 'vender',
    framework: 'meddic',
    requiredFields: [
      'Critério de decisão do cliente (o que precisa ver para fechar)',
      'Quem decide e o orçamento disponível',
      'Objeções pendentes',
      'Prazo desejado para começar',
    ],
    recommendedTools: [
      'create_lead',
      'calculator',
      'transfer_to_human',
      'create_followup',
    ],
    guardrails: [
      'Não oferecer desconto ou condição não autorizada.',
      'Usar a calculadora para parcelas/descontos em vez de calcular de cabeça.',
      'Não pressionar; respeitar o tempo de decisão do cliente.',
    ],
    handoffSummary: [
      'Passar para um vendedor humano quando houver negociação fora da alçada do agente.',
      'Levar critério de decisão, decisor e objeções no resumo.',
    ],
    exampleConversations: [
      'Cliente: "Consigo parcelar?" → usar a calculadora e apresentar as opções reais.',
      'Cliente: "Preciso pensar" → agendar follow-up e oferecer um material de apoio.',
    ],
    successCriteria: [
      'Objeções endereçadas e próximo passo de fechamento definido.',
      'Negociação fora da alçada encaminhada para humano com contexto.',
    ],
  },

  // ── Secretária / clínica (agendar + confirmar consultas) ───────────────────
  {
    role: 'secretaria',
    businessType: 'clinica',
    objective: 'agendar',
    framework: 'appointment',
    requiredFields: [
      'Motivo do contato ou tipo de atendimento procurado (sem diagnosticar)',
      'Se é urgente ou pode aguardar um horário',
      'Preferência de dia/horário',
      'Preferência de profissional ou unidade, quando houver',
    ],
    recommendedTools: [
      'check_availability',
      'create_event',
      'cancel_event',
      'calendar_list_slots',
      'transfer_to_human',
    ],
    guardrails: [
      'Não dar diagnóstico nem prescrever tratamento.',
      'Não confirmar horário sem agenda conectada.',
      'Encaminhar para a equipe humana em dúvida clínica sensível ou urgência.',
    ],
    handoffSummary: [
      'Passar para a equipe quando houver urgência, pedido de diagnóstico ou dúvida clínica.',
      'Levar motivo do contato e preferência de horário no resumo.',
    ],
    exampleConversations: [
      'Paciente: "Quero marcar uma avaliação" → consultar horários livres e agendar.',
      'Paciente: "Preciso remarcar" → cancelar o evento atual e oferecer novo horário.',
    ],
    successCriteria: [
      'Consulta agendada no horário escolhido.',
      'Urgência ou dúvida clínica encaminhada para humano sem diagnóstico.',
    ],
  },

  // ── Secretária genérica de serviços (agendar atendimento local) ────────────
  {
    role: 'secretaria',
    businessType: 'servicos',
    objective: 'agendar',
    framework: 'appointment',
    requiredFields: [
      'Qual serviço a pessoa precisa',
      'Preferência de dia/horário',
      'Preferência de unidade ou profissional, quando houver',
      'Se quer seguir com orçamento ou já agendar',
    ],
    recommendedTools: [
      'check_availability',
      'create_event',
      'calendar_list_slots',
      'create_lead',
      'transfer_to_human',
    ],
    guardrails: [
      'Não confirmar agenda sem conexão real de calendário.',
      'Não prometer preço fechado sem confirmação.',
      'Manter tom prático e local.',
    ],
    handoffSummary: [
      'Passar para a equipe quando o cliente quiser negociar condição específica.',
      'Levar serviço desejado e preferência de horário no resumo.',
    ],
    exampleConversations: [
      'Cliente: "Vocês têm horário amanhã?" → listar horários livres e marcar.',
      'Cliente: "Quanto custa?" → responder conforme a política e oferecer agendamento.',
    ],
    successCriteria: [
      'Serviço e horário definidos com agendamento criado.',
      'Lead registrado quando não houver fechamento imediato.',
    ],
  },

  // ── Suporte / SaaS (resolver dúvidas e escalar quando precisa) ─────────────
  {
    role: 'suporte',
    businessType: 'saas',
    objective: 'suportar',
    framework: 'triage',
    requiredFields: [
      'Qual é o problema ou a dúvida do cliente',
      'O que o cliente já tentou',
      'Se é bloqueante ou pode aguardar',
      'Dados para localizar a conta/contato',
    ],
    recommendedTools: [
      'search_contacts',
      'transfer_to_human',
      'detect_talking_to_ai',
      'create_followup',
    ],
    guardrails: [
      'Não prometer prazo de correção sem confirmação humana.',
      'Não pedir dados sensíveis desnecessários.',
      'Escalar rápido quando o problema for bloqueante.',
    ],
    handoffSummary: [
      'Passar para o time de suporte humano em caso bloqueante ou fora do escopo do agente.',
      'Levar o problema, o que já foi tentado e os dados da conta no resumo.',
    ],
    exampleConversations: [
      'Cliente: "Não consigo entrar" → triar o erro e, se bloqueante, escalar para humano.',
      'Cliente: "Quando volta?" → registrar follow-up e dar previsão só se confirmada.',
    ],
    successCriteria: [
      'Dúvida resolvida no primeiro contato quando possível.',
      'Caso bloqueante escalado para humano com contexto completo.',
    ],
  },

  // ── Cobrança (recuperar pagamentos com tom respeitoso) ─────────────────────
  {
    role: 'cobranca',
    businessType: 'generico',
    objective: 'transferir',
    framework: 'triage',
    requiredFields: [
      'Confirmar que está falando com a pessoa certa',
      'Situação do pagamento em aberto',
      'Motivo do atraso, quando informado',
      'Forma e prazo que a pessoa consegue regularizar',
    ],
    recommendedTools: [
      'search_contacts',
      'calculator',
      'transfer_to_human',
      'create_followup',
    ],
    guardrails: [
      'Manter tom respeitoso; nunca constranger ou ameaçar.',
      'Não negociar condição não autorizada — usar a calculadora só para informar.',
      'Não expor valores a quem não for o titular.',
    ],
    handoffSummary: [
      'Passar para o financeiro humano quando o cliente quiser negociar prazo/valor fora da regra.',
      'Levar situação do débito e proposta do cliente no resumo.',
    ],
    exampleConversations: [
      'Cliente: "Esqueci de pagar" → confirmar identidade e oferecer o caminho de regularização.',
      'Cliente: "Posso parcelar?" → calcular as opções e encaminhar para o financeiro decidir.',
    ],
    successCriteria: [
      'Pagamento regularizado ou follow-up agendado.',
      'Negociação fora da regra encaminhada para o financeiro.',
    ],
  },

  // ── Pós-venda / onboarding (ativar e reter o novo cliente) ─────────────────
  {
    role: 'onboarding',
    businessType: 'generico',
    objective: 'suportar',
    framework: 'triage',
    requiredFields: [
      'Em que etapa da ativação o cliente está',
      'O que falta para ele usar o produto/serviço',
      'Se há alguma dificuldade ou dúvida bloqueante',
      'Melhor horário para um acompanhamento',
    ],
    recommendedTools: [
      'create_followup',
      'check_availability',
      'create_event',
      'transfer_to_human',
    ],
    guardrails: [
      'Não confirmar agenda de acompanhamento sem calendário conectado.',
      'Não sobrecarregar com passos; guiar um de cada vez.',
      'Escalar para humano quando a dificuldade for técnica e bloqueante.',
    ],
    handoffSummary: [
      'Passar para CS/suporte humano quando a ativação travar por questão técnica.',
      'Levar a etapa atual e o bloqueio no resumo.',
    ],
    exampleConversations: [
      'Cliente novo: "Por onde começo?" → guiar o primeiro passo e agendar acompanhamento.',
      'Cliente: "Travou aqui" → registrar follow-up ou escalar se for bloqueante.',
    ],
    successCriteria: [
      'Cliente ativado no primeiro uso do produto/serviço.',
      'Acompanhamento agendado ou follow-up criado para reter.',
    ],
  },

  // ── Vendas genérica (atender e conduzir para a compra) ─────────────────────
  {
    role: 'vendas',
    businessType: 'ecommerce',
    objective: 'vender',
    framework: 'bant_lite',
    requiredFields: [
      'Qual produto ou categoria a pessoa quer',
      'Se já decidiu ou quer sugestões',
      'Dúvidas sobre entrega, pagamento ou prazo',
      'Próximo passo (fechar, reservar ou tirar dúvida)',
    ],
    recommendedTools: [
      'create_lead',
      'calculator',
      'transfer_to_human',
      'create_followup',
    ],
    guardrails: [
      'Não prometer desconto ou frete não confirmado.',
      'Usar a calculadora para totais e parcelas em vez de estimar.',
      'Não confirmar pedido sem dados suficientes.',
    ],
    handoffSummary: [
      'Passar para um vendedor quando houver negociação ou pedido especial.',
      'Levar produto de interesse e dúvidas no resumo.',
    ],
    exampleConversations: [
      'Cliente: "Tem em outra cor?" → checar interesse e conduzir para a compra.',
      'Cliente: "Parcela em quantas?" → calcular as opções reais e oferecer o fechamento.',
    ],
    successCriteria: [
      'Interesse de compra qualificado com próximo passo claro.',
      'Pedido encaminhado ou follow-up agendado.',
    ],
  },
] as const

// ==========================================
// Internals (puros)
// ==========================================

/** Set de nomes válidos do catálogo — base do guard de tools. */
const OFFICIAL_TOOL_NAMES: ReadonlySet<string> = new Set(
  OFFICIAL_TOOLS.map((tool) => tool.name),
)

/**
 * Guard de desenvolvimento: garante que NENHUMA strategy referencie tool fora
 * do catálogo. Retorna a lista de pares (role/businessType, toolId) inválidos —
 * vazio = tudo certo. O teste usa isto para travar regressões (FR-51).
 */
export function assertStrategiesUseOfficialTools(): Array<{
  role: AgentStrategyRole
  businessType: AgentStrategyBusinessType
  invalidTool: string
}> {
  const offenders: Array<{
    role: AgentStrategyRole
    businessType: AgentStrategyBusinessType
    invalidTool: string
  }> = []
  for (const strategy of AGENT_STRATEGIES) {
    for (const toolId of strategy.recommendedTools) {
      if (!OFFICIAL_TOOL_NAMES.has(toolId)) {
        offenders.push({
          role: strategy.role,
          businessType: strategy.businessType,
          invalidTool: toolId,
        })
      }
    }
  }
  return offenders
}

/**
 * Mapeia a KnownVertical curada (niche-inference) para o businessType da
 * AgentStrategy. `delivery` cai em `ecommerce` (transação de compra) e `B2B` em
 * `saas` (o vocabulário B2B do Builder hoje é software/SaaS). `undefined` =
 * nicho não reconhecido (o caller decide o fallback).
 */
function verticalToBusinessType(
  vertical: KnownVertical,
): AgentStrategyBusinessType {
  switch (vertical) {
    case 'imobiliário':
      return 'imobiliario'
    case 'saúde':
      return 'clinica'
    case 'delivery':
      return 'ecommerce'
    case 'B2B':
      return 'saas'
  }
}

/**
 * Resolve o businessType a partir do nicho/tipo informado. Tenta primeiro a
 * vertical curada (`inferKnownVertical`, reuso single-source); senão reconhece
 * alguns sinais diretos (educação/SaaS/serviços/e-commerce) por texto; por fim
 * `generico`.
 */
function resolveBusinessType(input: {
  niche?: string
  businessType?: string
}): AgentStrategyBusinessType {
  const vertical = inferKnownVertical([input.niche, input.businessType])
  if (vertical) return verticalToBusinessType(vertical)

  const text = foldText([input.businessType, input.niche])
  if (!text) return 'generico'
  if (/(educac|curso|escola|ensino|faculdade|aula)/.test(text)) return 'educacao'
  if (/(saas|software|aplicativo|plataforma|app)/.test(text)) return 'saas'
  if (/(ecommerce|e-commerce|loja|varejo|produto|venda online)/.test(text)) {
    return 'ecommerce'
  }
  if (/(clinica|consultorio|saude|medic|dent)/.test(text)) return 'clinica'
  if (/(imovel|imobili|corretor)/.test(text)) return 'imobiliario'
  if (/(servic|atendimento|local|oficina|salao|estetica)/.test(text)) {
    return 'servicos'
  }
  return 'generico'
}

/** Reconhece o papel a partir de texto livre. `undefined` quando nada bate. */
function resolveRole(input: {
  role?: string
  objective?: string
}): AgentStrategyRole | undefined {
  const roleText = foldText([input.role])
  if (/(sdr|qualific|prospec)/.test(roleText)) return 'sdr'
  if (/(closer|fechamento|fechad)/.test(roleText)) return 'closer'
  if (/(secretari|recepc|agenda)/.test(roleText)) return 'secretaria'
  if (/(suporte|support|atendimento tecnico|ajuda)/.test(roleText)) {
    return 'suporte'
  }
  if (/(cobranc|financeiro|inadimpl)/.test(roleText)) return 'cobranca'
  if (/(onboarding|pos-?venda|posvenda|ativac|retenc)/.test(roleText)) {
    return 'onboarding'
  }
  if (/(vendas|vendedor|comercial)/.test(roleText)) return 'vendas'

  // Sem papel explícito: inferir pelo objetivo macro.
  const objText = foldText([input.objective])
  if (/(agend|marcar)/.test(objText)) return 'secretaria'
  if (/(vend|fechar|compr)/.test(objText)) return 'vendas'
  if (/(suport|ajud|duvid)/.test(objText)) return 'suporte'
  if (/(qualific|captar|lead)/.test(objText)) return 'sdr'
  return undefined
}

/** Strategy de fallback genérico (SDR genérico): nunca falha em retornar algo. */
const GENERIC_FALLBACK_STRATEGY: AgentStrategy = {
  role: 'sdr',
  businessType: 'generico',
  objective: 'qualificar',
  framework: 'bant_lite',
  requiredFields: [
    'O que a pessoa procura ou precisa resolver',
    'Contexto suficiente para indicar o próximo passo',
    'Próximo passo desejado (informação, atendimento humano ou agenda)',
  ],
  recommendedTools: ['create_lead', 'transfer_to_human', 'create_followup'],
  guardrails: [
    'Não prometer preço, prazo ou disponibilidade sem confirmação.',
    'Uma pergunta por vez; manter o tom acolhedor.',
    'Encaminhar para humano quando o assunto sair do que o agente resolve.',
  ],
  handoffSummary: [
    'Passar para uma pessoa quando o lead pedir atendimento humano ou o assunto fugir do escopo.',
    'Resumir o que a pessoa quer antes de transferir.',
  ],
  exampleConversations: [
    'Cliente: "Como funciona?" → entender a necessidade e indicar o próximo passo.',
    'Cliente: "Quero falar com alguém" → registrar o lead e transferir para humano.',
  ],
  successCriteria: [
    'Necessidade entendida com próximo passo definido.',
    'Lead registrado e encaminhado quando precisa de humano.',
  ],
}

// ==========================================
// resolveAgentStrategy (pura, nunca lança)
// ==========================================

/**
 * Escolhe a melhor AgentStrategy para o conjunto (role, niche/businessType,
 * objective). Ordem de desempate:
 *   1. casamento exato (role + businessType);
 *   2. mesma role com businessType `generico` (estratégia neutra do papel);
 *   3. qualquer estratégia da mesma role (primeira da lista);
 *   4. fallback genérico (SDR genérico) — NUNCA lança (NFR-11).
 *
 * O nicho é mapeado para businessType reusando `inferKnownVertical`
 * (niche-inference.pure.ts) — single source da inferência de vertical.
 */
export function resolveAgentStrategy(input: {
  role?: string
  niche?: string
  objective?: string
  businessType?: string
}): AgentStrategy {
  const businessType = resolveBusinessType({
    niche: input.niche,
    businessType: input.businessType,
  })
  const role = resolveRole({ role: input.role, objective: input.objective })

  if (!role) return GENERIC_FALLBACK_STRATEGY

  // 1. Casamento exato role + businessType.
  const exact = AGENT_STRATEGIES.find(
    (s) => s.role === role && s.businessType === businessType,
  )
  if (exact) return exact

  // 2. Mesma role, businessType genérico (estratégia neutra do papel).
  const roleGeneric = AGENT_STRATEGIES.find(
    (s) => s.role === role && s.businessType === 'generico',
  )
  if (roleGeneric) return roleGeneric

  // 3. Qualquer estratégia da mesma role.
  const sameRole = AGENT_STRATEGIES.find((s) => s.role === role)
  if (sameRole) return sameRole

  // 4. Fallback genérico — nunca lança.
  return GENERIC_FALLBACK_STRATEGY
}
