/**
 * strategy-engine — F5+ (Motor de Estratégia, orquestrador).
 *
 * Compõe os passos PUROS do motor numa decisão estratégica auditável:
 *   sinais → diagnóstico → plano de campos → crítica → StrategyPlan
 *
 * A LLM (question-composer) entra DEPOIS, só para REDIGIR perguntas a partir do
 * `fieldPlan`. Aqui é tudo determinístico e testável. O `toPersistedStrategyDiagnosis`
 * mapeia o `StrategyPlan` (rico) para a forma serializável que o card lê
 * (`strategyDiagnosisSchema` em `cards/builder-state.ts`).
 *
 * Pura: zero IO, zero `any`. A resolução de contexto que EXIGE IO (ex.: calendário
 * conectado) é INJETADA pelo caller (o serviço) via `context`.
 */

import type {
  BuilderState,
  PersistedStrategyDiagnosis,
} from '../cards/builder-state'
import type { NicheInsights } from '../sub-agents'
import { extractBusinessSignals } from './business-signal-extractor'
import { diagnoseStrategy } from './strategy-diagnoser'
import { planQualificationFields } from './qualification-field-planner'
import { critiquePlan } from './plan-critic'
import type {
  ResearchEvidence,
  StrategyContext,
  StrategyPlan,
} from './strategy.types'

// ---------------------------------------------------------------------------
// Contexto (parte derivável do state; parte injetada pelo caller via IO)
// ---------------------------------------------------------------------------

/**
 * Deriva o `StrategyContext` do que dá para saber SEM IO:
 *   - channelIsWhatsapp: WhatsApp é o canal padrão do produto; só vira false se o
 *     usuário escolheu canais e WhatsApp NÃO está entre eles;
 *   - handoffConfigured: handoff.mode definido e != 'nenhum';
 *   - calendarConnected: DEFAULT false (conservador) — o caller com IO sobrescreve.
 * Pura.
 */
export function deriveStrategyContextFromState(
  state: BuilderState,
): StrategyContext {
  const platforms = state.channel?.platforms
  const channelIsWhatsapp =
    !platforms || platforms.length === 0 || platforms.includes('whatsapp')
  const mode = state.handoff.mode
  const handoffConfigured = mode !== undefined && mode !== 'nenhum'
  return { channelIsWhatsapp, calendarConnected: false, handoffConfigured }
}

// ---------------------------------------------------------------------------
// Evidência da pesquisa de nicho (insumo, NUNCA pergunta direta)
// ---------------------------------------------------------------------------

/**
 * Converte o `NicheInsights` (pesquisa de nicho) em `ResearchEvidence[]`: cada
 * regulação/alerta/fluxo típico vira um achado com confiança (menor quando a
 * pesquisa foi lite/sem Tavily). É insumo do motor — não vira pergunta direta. Pura.
 */
export function mapNicheInsightsToEvidence(
  insights: NicheInsights,
  businessType: string,
): ResearchEvidence[] {
  const confidence = insights.fromLLMKnowledgeOnly ? 0.6 : 0.85
  const out: ResearchEvidence[] = []
  const push = (finding: string) => {
    const f = finding.trim()
    if (f.length > 0 && out.length < 20) {
      out.push({ finding: f, confidence, source: 'pesquisa_nicho', appliesTo: [businessType] })
    }
  }
  insights.regulations.forEach(push)
  insights.warnings.forEach(push)
  insights.typicalFlows.forEach(push)
  return out
}

// ---------------------------------------------------------------------------
// Orquestrador
// ---------------------------------------------------------------------------

export interface BuildStrategyPlanOptions {
  /** Sobrescreve o contexto derivado do state (ex.: calendarConnected via IO). */
  context?: Partial<StrategyContext>
  /** Evidência da pesquisa de nicho (insumo auditável). */
  evidence?: ResearchEvidence[]
}

/**
 * Roda o motor de estratégia completo sobre o builderState. Determinístico:
 * sinais → diagnóstico → plano de campos → crítica. Pura.
 */
export function buildStrategyPlan(
  state: BuilderState,
  opts: BuildStrategyPlanOptions = {},
): StrategyPlan {
  const signals = extractBusinessSignals(state)
  const diagnosis = diagnoseStrategy(signals)
  const { fieldPlan, excludedFields } = planQualificationFields(signals, diagnosis)

  const context: StrategyContext = {
    ...deriveStrategyContextFromState(state),
    ...opts.context,
  }

  const criticFindings = critiquePlan({
    signals,
    diagnosis,
    fieldPlan,
    excludedFields,
    context,
  })

  return {
    signals,
    diagnosis,
    fieldPlan,
    excludedFields,
    criticFindings,
    evidence: opts.evidence ?? [],
  }
}

// ---------------------------------------------------------------------------
// Mapeamento para a forma persistida (o que o card lê)
// ---------------------------------------------------------------------------

/**
 * Mapeia o `StrategyPlan` (rico) para `PersistedStrategyDiagnosis` (serializável).
 * `generatedAt` é INJETADO (ISO) para manter a pureza/determinismo. O zod schema
 * (`strategyDiagnosisSchema`) clampa tudo no parse — aqui só estruturamos. Pura.
 */
export function toPersistedStrategyDiagnosis(
  plan: StrategyPlan,
  generatedAt: string,
): PersistedStrategyDiagnosis {
  return {
    businessType: plan.signals.businessType,
    ...(plan.signals.subtype ? { subtype: plan.signals.subtype } : {}),
    selectedStrategy: plan.diagnosis.selectedStrategy,
    strategyReason: plan.diagnosis.reason,
    rejectedStrategies: plan.diagnosis.rejectedStrategies.map((r) => ({
      strategy: r.strategy,
      reason: r.reason,
    })),
    suggestedFields: plan.fieldPlan.map((f) => ({
      key: f.key,
      label: f.label,
      reason: f.reason,
      priority: f.priority,
      ...(f.askWhen ? { askWhen: f.askWhen } : {}),
    })),
    excludedFields: plan.excludedFields.map((e) => ({
      key: e.key,
      reason: e.reason,
    })),
    criticFindings: plan.criticFindings.map((c) => ({
      kind: c.kind,
      target: c.target,
      reason: c.reason,
    })),
    generatedAt,
  }
}
