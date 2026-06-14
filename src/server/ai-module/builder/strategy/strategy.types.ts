/**
 * strategy.types — F5+ (Motor de Estratégia do Builder).
 *
 * O Modo Pesquisa robusto NÃO é um "gerador de perguntas": é um MOTOR DE ESTRATÉGIA
 * auditável e testável. Em vez de pedir à LLM "quais perguntas gerar?", o backend
 * decide, em camadas PURAS e separadas:
 *
 *   Fonte → Sinais → Diagnóstico de estratégia → Plano de campos → Crítica → Card
 *
 * A LLM (question-composer, fora deste módulo) só REDIGE as perguntas naturais a
 * partir do `fieldPlan`; a decisão estratégica fica aqui, determinística e testável.
 *
 * Estes são os TIPOS INTERNOS do motor (ricos). A forma PERSISTIDA (subset
 * serializável que o card lê) é `strategyDiagnosisSchema` em `cards/builder-state.ts`
 * — `toPersistedStrategyDiagnosis` (em `strategy-engine.ts`) faz a ponte.
 */

// ---------------------------------------------------------------------------
// 1. Sinais do negócio (extraídos de forma determinística da fonte/state)
// ---------------------------------------------------------------------------

/**
 * Sinais BOOLEANOS + de tipo extraídos da fonte do negócio (site/texto/arquivos
 * já capturados no builderState). É a "leitura de evidências" que alimenta o
 * diagnóstico — nada aqui vem de invenção do LLM.
 */
export interface BusinessSignals {
  /** Vertical do negócio normalizada (ex.: 'imobiliario', 'saude', 'generico'). */
  businessType: string
  /** Subtipo comercial quando detectável (ex.: 'empreendimento_especifico'). */
  subtype?: string
  hasAddress: boolean
  hasPricing: boolean
  /** A fonte aponta um PRODUTO específico (1 empreendimento/modelo), não um catálogo. */
  hasSpecificProduct: boolean
  /** Há objetivo de VISITA/tour presencial. */
  hasVisitGoal: boolean
  /** Há sinais de AGENDAMENTO (marcar horário/consulta/visita). */
  hasSchedulingSignal: boolean
  /** Há sinais de FINANCIAMENTO/entrada/FGTS. */
  hasFinancingSignal: boolean
  /** Há sinais de programa habitacional popular (MCMV/subsídio). */
  hasMcmvSignal: boolean
  /** A fonte sinaliza 100% vendido/esgotado (risco comercial). */
  soldOutRisk: boolean
  /** Nicho REGULADO (saúde/advocacia) — exige cautela e handoff humano. */
  regulated: boolean
  /** Fatos curtos extraídos da fonte (para exibir "detectei ..."). */
  sourceFacts: string[]
}

// ---------------------------------------------------------------------------
// 2. Evidência de pesquisa (vira insumo, NUNCA pergunta direta)
// ---------------------------------------------------------------------------

export type EvidenceSource =
  | 'pesquisa_nicho'
  | 'referencia_interna'
  | 'fonte_negocio'

/** Um achado da pesquisa, com confiança e a que estratégias se aplica. */
export interface ResearchEvidence {
  finding: string
  /** 0..1 — confiança no achado (a pesquisa lite/sem fontes vale menos). */
  confidence: number
  source: EvidenceSource
  appliesTo: string[]
}

// ---------------------------------------------------------------------------
// 3. Diagnóstico de estratégia (escolhe UMA, registrando as rejeitadas + porquê)
// ---------------------------------------------------------------------------

export interface RejectedStrategy {
  strategy: string
  reason: string
}

export interface StrategyDiagnosis {
  selectedStrategy: string
  reason: string
  rejectedStrategies: RejectedStrategy[]
}

// ---------------------------------------------------------------------------
// 4. Plano de campos de qualificação (ANTES das perguntas)
// ---------------------------------------------------------------------------

export type FieldPriority = 'high' | 'medium' | 'optional'

/** Um campo que o agente PRECISA qualificar, com justificativa comercial. */
export interface QualificationFieldPlan {
  key: string
  label: string
  reason: string
  priority: FieldPriority
  /** Condição em linguagem de negócio para perguntar (ex.: 'se MCMV/subsídio'). */
  askWhen?: string
}

/** Um campo que NÃO se deve perguntar, com o porquê (auditável no card). */
export interface ExcludedField {
  key: string
  reason: string
}

// ---------------------------------------------------------------------------
// 5. Crítica automática (segunda passada que reprova o plano)
// ---------------------------------------------------------------------------

export type CriticKind = 'reject' | 'warn' | 'ok'

/** Um achado do crítico: reprova/alerta sobre o plano, com alvo e motivo. */
export interface CriticFinding {
  kind: CriticKind
  /** O que foi avaliado (ex.: 'pergunta_regiao', 'handoff_corretor'). */
  target: string
  reason: string
}

/** Contexto externo (não vem só dos sinais) para a crítica decidir corretamente. */
export interface StrategyContext {
  /** O canal é WhatsApp (logo, NÃO pedir telefone). Default true. */
  channelIsWhatsapp: boolean
  /** Há agenda/calendário conectado (senão, NÃO prometer agendamento real). */
  calendarConnected: boolean
  /** Há handoff humano configurado (modo != 'nenhum'/ausente). */
  handoffConfigured: boolean
}

// ---------------------------------------------------------------------------
// 6. Plano completo (saída do motor)
// ---------------------------------------------------------------------------

/** A saída completa e auditável do motor de estratégia. */
export interface StrategyPlan {
  signals: BusinessSignals
  diagnosis: StrategyDiagnosis
  fieldPlan: QualificationFieldPlan[]
  excludedFields: ExcludedField[]
  criticFindings: CriticFinding[]
  evidence: ResearchEvidence[]
}
