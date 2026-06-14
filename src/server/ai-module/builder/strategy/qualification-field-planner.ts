/**
 * qualification-field-planner — F5+ (Motor de Estratégia, passo 4).
 *
 * ANTES das perguntas, define QUAIS CAMPOS o agente precisa qualificar para a
 * estratégia escolhida — com justificativa comercial e prioridade — e QUAIS NÃO
 * perguntar (com o porquê). A LLM (question-composer) só redige perguntas para os
 * campos `high`/`medium`; os `excludedFields` viram o "não sugeri X porque Y" do card.
 *
 * Curado por ESTRATÉGIA (não por vertical): a mesma vertical pode ter estratégias
 * diferentes (ex.: imobiliário genérico × empreendimento). Pura: zero IO, zero `any`.
 */

import type {
  BusinessSignals,
  ExcludedField,
  QualificationFieldPlan,
  StrategyDiagnosis,
} from './strategy.types'

export interface QualificationFieldPlanResult {
  fieldPlan: QualificationFieldPlan[]
  excludedFields: ExcludedField[]
}

/** Sempre presente: nome do contato (base de qualquer atendimento). */
const FIELD_NOME: QualificationFieldPlan = {
  key: 'nome',
  label: 'Nome do contato',
  reason: 'Personaliza o atendimento e organiza o lead para o time.',
  priority: 'high',
}

/** Telefone NUNCA é pedido: o canal já É o WhatsApp. Exclusão universal. */
const EXCLUDE_TELEFONE: ExcludedField = {
  key: 'telefone',
  reason: 'O canal já é o WhatsApp — o número do contato já está disponível.',
}

/** Tabela por estratégia: campos sugeridos + exclusões com justificativa. */
const PLANS: Readonly<
  Record<string, (s: BusinessSignals) => QualificationFieldPlanResult>
> = {
  financiamento_popular: () => ({
    fieldPlan: [
      FIELD_NOME,
      {
        key: 'primeiro_imovel',
        label: 'É o primeiro imóvel?',
        reason: 'Pode impactar elegibilidade a subsídio e a abordagem comercial.',
        priority: 'high',
        askWhen: 'se há sinais de MCMV/subsídio/financiamento popular',
      },
      {
        key: 'renda_familiar_aproximada',
        label: 'Renda familiar aproximada',
        reason: 'Ajuda o consultor a simular possibilidades reais.',
        priority: 'high',
      },
      {
        key: 'entrada_fgts',
        label: 'Entrada disponível / uso de FGTS',
        reason: 'Entrada e FGTS mudam a viabilidade da simulação.',
        priority: 'high',
      },
      {
        key: 'interesse_simulacao_ou_visita',
        label: 'Interesse em simulação ou visita',
        reason: 'Define o próximo passo (simular com consultor ou agendar visita).',
        priority: 'high',
      },
      {
        key: 'email_material',
        label: 'E-mail para material/simulação',
        reason: 'Útil apenas se for enviar material/simulação por e-mail.',
        priority: 'optional',
      },
    ],
    excludedFields: [
      EXCLUDE_TELEFONE,
      {
        key: 'regiao',
        reason: 'O empreendimento já tem endereço — perguntar região não agrega.',
      },
      {
        key: 'preco_final',
        reason: 'Preço final exige confirmação comercial — não prometer pela IA.',
      },
    ],
  }),

  empreendimento_especifico: () => ({
    fieldPlan: [
      FIELD_NOME,
      {
        key: 'interesse_simulacao_ou_visita',
        label: 'Interesse em simulação ou visita',
        reason: 'Define o próximo passo com o corretor.',
        priority: 'high',
      },
      {
        key: 'momento_compra',
        label: 'Momento de compra',
        reason: 'Prioriza o atendimento (comprar agora × pesquisando).',
        priority: 'medium',
      },
      {
        key: 'email_material',
        label: 'E-mail para material',
        reason: 'Útil apenas se for enviar material por e-mail.',
        priority: 'optional',
      },
    ],
    excludedFields: [
      EXCLUDE_TELEFONE,
      {
        key: 'regiao',
        reason: 'O empreendimento já tem endereço — perguntar região não agrega.',
      },
      {
        key: 'preco_final',
        reason: 'Preço final exige confirmação comercial — não prometer pela IA.',
      },
    ],
  }),

  busca_generica_imobiliaria: () => ({
    fieldPlan: [
      FIELD_NOME,
      {
        key: 'regiao_desejada',
        label: 'Região desejada',
        reason: 'Sem produto único, a região direciona a busca.',
        priority: 'high',
      },
      {
        key: 'tipo_imovel',
        label: 'Tipo de imóvel',
        reason: 'Filtra o estoque (apto/casa, dormitórios).',
        priority: 'high',
      },
      {
        key: 'faixa_orcamento',
        label: 'Faixa de orçamento',
        reason: 'Direciona para imóveis viáveis e a forma de pagamento.',
        priority: 'high',
      },
      {
        key: 'momento_compra',
        label: 'Momento de compra',
        reason: 'Prioriza o atendimento.',
        priority: 'medium',
      },
    ],
    excludedFields: [EXCLUDE_TELEFONE],
  }),

  agendamento_assistido: () => ({
    fieldPlan: [
      FIELD_NOME,
      {
        key: 'motivo_contato',
        label: 'Motivo do contato',
        reason: 'Direciona ao profissional/serviço certo (sem avaliar sintomas).',
        priority: 'high',
      },
      {
        key: 'preferencia_horario',
        label: 'Preferência de horário',
        reason: 'Agiliza o agendamento com o time.',
        priority: 'high',
      },
      {
        key: 'convenio_ou_particular',
        label: 'Convênio ou particular',
        reason: 'Define a forma de atendimento e valores.',
        priority: 'medium',
      },
    ],
    excludedFields: [
      EXCLUDE_TELEFONE,
      {
        key: 'diagnostico',
        reason:
          'Nicho regulado: a IA não avalia sintomas nem dá diagnóstico — só encaminha.',
      },
    ],
  }),

  qualificacao_consultiva: (s) => ({
    fieldPlan: [
      FIELD_NOME,
      {
        key: 'necessidade',
        label: 'Necessidade / o que procura',
        reason: 'Entende o objetivo para direcionar a conversa.',
        priority: 'high',
      },
      {
        key: 'prazo',
        label: 'Prazo / urgência',
        reason: 'Prioriza o atendimento.',
        priority: 'medium',
      },
      ...(s.hasSchedulingSignal
        ? [
            {
              key: 'preferencia_horario',
              label: 'Preferência de horário',
              reason: 'Há sinais de agendamento — facilita marcar com o time.',
              priority: 'medium' as const,
            },
          ]
        : []),
    ],
    excludedFields: [EXCLUDE_TELEFONE],
  }),
}

/**
 * Planeja os campos de qualificação para a estratégia escolhida. Sem entrada na
 * tabela (estratégia desconhecida) cai no plano consultivo genérico. Pura.
 */
export function planQualificationFields(
  signals: BusinessSignals,
  diagnosis: StrategyDiagnosis,
): QualificationFieldPlanResult {
  const planner =
    PLANS[diagnosis.selectedStrategy] ?? PLANS.qualificacao_consultiva
  return planner(signals)
}
