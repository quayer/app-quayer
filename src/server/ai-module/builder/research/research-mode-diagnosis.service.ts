/**
 * research-mode-diagnosis.service — F5/F5+ (Modo Pesquisa + Motor de Estratégia).
 *
 * Orquestra o Modo Pesquisa DETERMINÍSTICO disparado no submit do `build_mode`
 * (`buildMode === 'pesquisa'`). Pipeline:
 *   Fonte → (Pesquisa de nicho) → Diagnóstico + MOTOR DE ESTRATÉGIA → persiste no state
 *
 * Duas saídas persistidas, DESACOPLADAS de propósito:
 *   1. `diagnosisInsights` (evidências: negócio, riscos, boas práticas, fontes) —
 *      depende do `nicheResearcherSubAgent` (Tavily + LLM); sem ele não há insights.
 *   2. `strategyDiagnosis` (decisão ESTRATÉGICA: estratégia escolhida/rejeitadas,
 *      campos a qualificar, o que NÃO perguntar, crítica) — DETERMINÍSTICO (motor
 *      puro sobre os sinais do state). É o núcleo ROBUSTO: roda e persiste mesmo
 *      quando a pesquisa de nicho falha (LLM/Tavily fora do ar).
 *
 * 🔒 INVARIANTES:
 *   - NUNCA BLOQUEIA a jornada (FR-47): toda falha é fail-open, NUNCA lança.
 *   - org-scoped: TODA leitura/escrita filtra por `organizationId`.
 *   - Testabilidade: TODO o IO é injetado (sub-agente, DB, calendário, relógio).
 */

import type { Prisma } from '@prisma/client'

import type {
  BuilderState,
  DiagnosisInsights,
  PersistedStrategyDiagnosis,
} from '../cards/builder-state'
import type { NicheInsights } from '../sub-agents'
import type { SubAgentContext, SubAgentResult } from '../sub-agents/types'
import {
  buildDiagnosisInsights,
  resolveResearchSubject,
} from './research-mode-diagnosis.pure'
import {
  buildStrategyPlan,
  toPersistedStrategyDiagnosis,
} from '../strategy/strategy-engine'

// ---------------------------------------------------------------------------
// Contratos
// ---------------------------------------------------------------------------

export interface RunResearchDiagnosisInput {
  readonly projectId: string
  readonly organizationId: string
  readonly userId?: string
}

export type ResearchDiagnosisReason =
  | 'no_conversation'
  | 'no_subject'
  | 'persist_failed'

export interface ResearchDiagnosisResult {
  /** Persistiu pelo menos a estratégia (determinística). */
  readonly ran: boolean
  /** Motivo quando `ran === false` (auditável; nunca lança). */
  readonly reason?: ResearchDiagnosisReason
  /** A pesquisa de nicho (insights/evidências) também foi persistida. */
  readonly researchOk?: boolean
  /** Quando há insights, indica pesquisa LITE (sem Tavily — só LLM). */
  readonly lite?: boolean
}

/** Deps de IO injetadas (DB, sub-agente, calendário, relógio) — orquestração pura. */
export interface ResearchDiagnosisDeps {
  /** Carrega a conversa + state FRESCO do projeto (org-scoped). null = inexistente. */
  loadConversationState: (p: {
    projectId: string
    organizationId: string
  }) => Promise<{ conversationId: string; state: BuilderState } | null>
  /** Roda o niche-researcher (Tavily + síntese LLM). */
  runResearch: (
    input: { nicho: string; businessDescription?: string },
    ctx: SubAgentContext,
  ) => Promise<SubAgentResult<NicheInsights>>
  /** `true` quando há calendário ativo (o crítico não promete agenda sem isso). */
  resolveCalendarConnected: (p: {
    projectId: string
    organizationId: string
  }) => Promise<boolean>
  /** Persiste `strategyDiagnosis` (sempre) + `diagnosisInsights` (quando há). */
  persistDiagnosis: (p: {
    conversationId: string
    organizationId: string
    strategy: PersistedStrategyDiagnosis
    insights?: DiagnosisInsights
  }) => Promise<void>
  /** Relógio injetado (determinismo). */
  now: () => Date
}

// ---------------------------------------------------------------------------
// Orquestração (testável com fakes)
// ---------------------------------------------------------------------------

/**
 * Roda o Modo Pesquisa + motor de estratégia e persiste o resultado. Fail-open em
 * CADA passo (nunca lança): sem conversa/sujeito → no-op; a pesquisa de nicho pode
 * falhar SEM derrubar a estratégia (determinística); persist falho → `persist_failed`.
 */
export async function runResearchModeDiagnosis(
  input: RunResearchDiagnosisInput,
  deps: ResearchDiagnosisDeps,
): Promise<ResearchDiagnosisResult> {
  try {
    const loaded = await deps.loadConversationState({
      projectId: input.projectId,
      organizationId: input.organizationId,
    })
    if (!loaded) return { ran: false, reason: 'no_conversation' }

    const subject = resolveResearchSubject(loaded.state)
    if (!subject) return { ran: false, reason: 'no_subject' }

    // Pesquisa de nicho (pode falhar — não derruba a estratégia).
    const research = await deps.runResearch(
      {
        nicho: subject.nicho,
        ...(subject.description ? { businessDescription: subject.description } : {}),
      },
      {
        organizationId: input.organizationId,
        userId: input.userId ?? 'system',
        projectId: input.projectId,
      },
    )
    const researchOk = research.success
    if (!researchOk) {
      console.warn(
        '[research-mode-diagnosis] niche-researcher falhou (estratégia segue):',
        research.error,
      )
    }

    // MOTOR DE ESTRATÉGIA (determinístico): sempre roda. `calendarConnected` é IO
    // (fail-open false) para o crítico não prometer agenda sem calendário.
    const calendarConnected = await deps.resolveCalendarConnected({
      projectId: input.projectId,
      organizationId: input.organizationId,
    })
    const now = deps.now().toISOString()
    const plan = buildStrategyPlan(loaded.state, {
      context: { calendarConnected },
    })
    const strategy = toPersistedStrategyDiagnosis(plan, now)

    // Insights só quando a pesquisa de nicho deu certo.
    const insights = research.success
      ? buildDiagnosisInsights(subject, research.data, now)
      : undefined

    try {
      await deps.persistDiagnosis({
        conversationId: loaded.conversationId,
        organizationId: input.organizationId,
        strategy,
        ...(insights ? { insights } : {}),
      })
    } catch (err) {
      console.warn(
        '[research-mode-diagnosis] persistência falhou (não-fatal):',
        err instanceof Error ? err.message : String(err),
      )
      return { ran: false, reason: 'persist_failed' }
    }

    return { ran: true, researchOk, ...(insights ? { lite: insights.lite } : {}) }
  } catch (err) {
    // Fail-open total: o Modo Pesquisa NUNCA pode bloquear a jornada (FR-47).
    console.warn(
      '[research-mode-diagnosis] falha inesperada (não-fatal):',
      err instanceof Error ? err.message : String(err),
    )
    return { ran: false, reason: 'persist_failed' }
  }
}

// ---------------------------------------------------------------------------
// Deps reais (lazy) + atalho fail-open p/ o applyBuildMode
// ---------------------------------------------------------------------------

/**
 * Monta as deps reais via lazy import (não arrasta sub-agente/Prisma pro caminho do
 * card quando o modo NÃO é pesquisa). Persiste `strategyDiagnosis` (sempre) +
 * `diagnosisInsights` (quando há) num único $transaction, re-lendo o state FRESCO e
 * invalidando o refinamento. `calendarConnected` espelha `hasActiveCalendarConnection`.
 */
export async function buildRealResearchDiagnosisDeps(): Promise<ResearchDiagnosisDeps> {
  const [{ database }, { nicheResearcherSubAgent }, builderState, enabledTools] =
    await Promise.all([
      import('@/server/services/database'),
      import('../sub-agents'),
      import('../cards/builder-state'),
      import('../deploy/enabled-tools-derivation'),
    ])

  return {
    loadConversationState: async ({ projectId, organizationId }) => {
      const row = await database.builderProjectConversation.findFirst({
        where: { projectId, organizationId },
        select: { id: true, builderState: true },
      })
      if (!row) return null
      return {
        conversationId: row.id,
        state: builderState.parseBuilderState(row.builderState),
      }
    },
    runResearch: (i, ctx) =>
      nicheResearcherSubAgent.run(
        { nicho: i.nicho, businessDescription: i.businessDescription },
        ctx,
      ),
    resolveCalendarConnected: ({ projectId, organizationId }) =>
      enabledTools.hasActiveCalendarConnection(organizationId, projectId),
    persistDiagnosis: async ({ conversationId, organizationId, strategy, insights }) => {
      await database.$transaction(async (tx) => {
        const row = await tx.builderProjectConversation.findFirst({
          where: { id: conversationId, organizationId },
          select: { builderState: true },
        })
        const fresh = builderState.parseBuilderState(row?.builderState)
        const next = builderState.invalidateRefinement(
          {
            ...fresh,
            strategyDiagnosis: strategy,
            ...(insights ? { diagnosisInsights: insights } : {}),
          },
          'O Modo Pesquisa gerou um novo diagnóstico/estratégia depois do refinamento.',
        )
        await tx.builderProjectConversation.updateMany({
          where: { id: conversationId, organizationId },
          data: { builderState: next as unknown as Prisma.InputJsonValue },
        })
      })
    },
    now: () => new Date(),
  }
}

/**
 * Atalho fail-open que o `applyBuildMode` chama quando o modo é 'pesquisa'. Monta
 * as deps reais e roda. NUNCA lança (mesmo se o lazy import falhar) — o submit do
 * card NÃO pode quebrar por causa da pesquisa.
 */
export async function runResearchModeDiagnosisReal(
  input: RunResearchDiagnosisInput,
): Promise<ResearchDiagnosisResult> {
  try {
    const deps = await buildRealResearchDiagnosisDeps()
    return await runResearchModeDiagnosis(input, deps)
  } catch (err) {
    console.warn(
      '[research-mode-diagnosis] bootstrap das deps falhou (não-fatal):',
      err instanceof Error ? err.message : String(err),
    )
    return { ran: false, reason: 'persist_failed' }
  }
}
