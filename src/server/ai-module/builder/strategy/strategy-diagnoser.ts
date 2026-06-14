/**
 * strategy-diagnoser — F5+ (Motor de Estratégia, passo 3).
 *
 * A partir dos `BusinessSignals` (passo 1) escolhe UMA estratégia comercial e
 * REGISTRA as rejeitadas + por quê (auditável). Registry curado por vertical,
 * extensível: cada vertical tem um diagnosticador puro; verticais novas entram no
 * `DIAGNOSERS` sem tocar nas demais. Pura: zero IO, zero `any`.
 *
 * A chave do design (e a razão de existir): a decisão NÃO é "quais perguntas
 * gerar?", e sim "que estratégia faz sentido para ESTE negócio e POR QUÊ não as
 * outras?". As perguntas vêm DEPOIS (planner → composer), restritas pela estratégia.
 */

import type { BusinessSignals, StrategyDiagnosis } from './strategy.types'

type Diagnoser = (signals: BusinessSignals) => StrategyDiagnosis

// ---------------------------------------------------------------------------
// Imobiliário
// ---------------------------------------------------------------------------

const diagnoseImobiliario: Diagnoser = (s) => {
  // Empreendimento específico → NÃO faz sentido busca genérica (perguntar região):
  // o lead veio de UM produto com endereço próprio.
  const rejectGeneric = {
    strategy: 'busca_generica_imobiliaria',
    reason:
      'Não faz sentido perguntar região/tipo de imóvel: o lead veio de um empreendimento específico com endereço próprio.',
  }

  if (s.subtype === 'empreendimento_especifico') {
    if (s.hasFinancingSignal || s.hasMcmvSignal) {
      return {
        selectedStrategy: 'financiamento_popular',
        reason:
          'Empreendimento específico com sinais de financiamento/entrada facilitada. Faz sentido qualificar primeiro imóvel, renda e entrada antes de uma simulação.',
        rejectedStrategies: [rejectGeneric],
      }
    }
    return {
      selectedStrategy: 'empreendimento_especifico',
      reason:
        'Empreendimento específico sem sinais de financiamento popular. Qualificar interesse, perfil e intenção de visita antes de acionar o corretor.',
      rejectedStrategies: [rejectGeneric],
    }
  }

  return {
    selectedStrategy: 'busca_generica_imobiliaria',
    reason:
      'Carteira/imobiliária sem produto único detectado. Qualificar região, tipo de imóvel e faixa de orçamento para direcionar a busca.',
    rejectedStrategies: [
      {
        strategy: 'empreendimento_especifico',
        reason:
          'Não há um único empreendimento na fonte — perguntar sobre um produto específico restringiria leads de outras buscas.',
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Saúde (regulado)
// ---------------------------------------------------------------------------

const diagnoseSaude: Diagnoser = () => ({
  selectedStrategy: 'agendamento_assistido',
  reason:
    'Nicho de saúde (regulado): qualificar motivo do contato e preferência de horário, SEM diagnóstico/conduta automatizada, e encaminhar a um humano quando necessário.',
  rejectedStrategies: [
    {
      strategy: 'autoatendimento_total',
      reason:
        'Conselhos profissionais vedam diagnóstico/conduta por IA — não dá para resolver 100% sem um humano.',
    },
  ],
})

// ---------------------------------------------------------------------------
// Genérico (fallback)
// ---------------------------------------------------------------------------

const diagnoseGenerico: Diagnoser = (s) => ({
  selectedStrategy: 'qualificacao_consultiva',
  reason: s.regulated
    ? 'Negócio com sinais regulatórios: qualificar a necessidade e encaminhar a um humano quando o tema exigir.'
    : 'Negócio sem vertical específica detectada: qualificar a necessidade, o prazo e o melhor encaminhamento de forma consultiva.',
  rejectedStrategies: [],
})

// ---------------------------------------------------------------------------
// Registry + fachada
// ---------------------------------------------------------------------------

/** Registry de diagnosticadores por `businessType`. Extensível por vertical. */
const DIAGNOSERS: Readonly<Record<string, Diagnoser>> = {
  imobiliario: diagnoseImobiliario,
  saude: diagnoseSaude,
}

/**
 * Diagnostica a estratégia a partir dos sinais. Despacha para o diagnosticador
 * da vertical; sem vertical curada cai no genérico (que respeita `regulated`).
 * Pura.
 */
export function diagnoseStrategy(signals: BusinessSignals): StrategyDiagnosis {
  const diagnoser = DIAGNOSERS[signals.businessType] ?? diagnoseGenerico
  return diagnoser(signals)
}
