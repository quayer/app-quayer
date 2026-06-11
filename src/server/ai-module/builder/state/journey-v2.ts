/**
 * Builder Module — Journey v2 engine ("Configure por exceção", T15/T16).
 *
 * The deterministic phased step-engine for `journeyVersion: 2` projects. A SINGLE
 * pure function (`nextPendingStepV2`) decides the active step from a `BuilderState`
 * + live `StepEngineContext`, groups the steps into the 4 QUAYER_PHASES
 * (Conhecer → Revisar → Testar → Lançar), computes a monotonic completeness %,
 * and emits the same `Readiness` contract as v1 plus the additive `journey` payload.
 *
 * ANTI-FORK (risk R1, plan §3.2): this engine REUSES the v1 primitives instead of
 * duplicating them — `computeBlockers` + `FIELD_OWNERSHIP` from `next-pending-step.ts`
 * and `StepDefinition` + `confirmed` + `hasText` from `step-helpers.ts`. It NEVER
 * re-implements the blocker vocabulary, the field-ownership map, or the sentinel/text
 * predicates. The ordered v1 journey (`QUAYER_STEPS`) is NOT reused: v2 re-shapes the
 * same gates into phases with a different ordering, but the leaf predicates are shared.
 *
 * NO IO. NO `any`. 100% testable (unit T61). The resolver layer
 * (`readiness-resolver.ts`, v2 branch — T14/T17) feeds the live signals; the
 * v2-aware banner + phased UI read its output.
 *
 * Contract: specs/jornada-builder-v2/plan.md §3.1/§3.2.
 */

import type { BuilderState } from '../cards/builder-state'
import { computeBlockers, FIELD_OWNERSHIP } from './next-pending-step'
import type {
  PhaseId,
  Readiness,
  ReadinessStep,
  StepEngineContext,
} from './readiness.types'
import { type StepDefinition, confirmed, hasText } from './step-helpers'

// ==========================================
// ctx extension — channel-connection + deployment signals (populated by T14)
// ==========================================

/**
 * The three live signals the v2 engine consumes that the resolver (T14) will add
 * to `StepEngineContext` (plan §3.1). Declared here as an intersection so this
 * engine compiles isolated NOW and stays byte-compatible once T14 widens the
 * canonical type — `StepEngineContextV2` is structurally `StepEngineContext` plus
 * these three booleans. The RESOLVER owns populating them (org-scoped DB counts,
 * status `CONNECTED` + projectId); the engine only reads them. Do NOT add IO here.
 */
export interface JourneyV2ContextSignals {
  /** A `BuilderDeployment` for this project is live (terminal step surfaces). */
  hasLiveDeployment: boolean
  /**
   * A WHATSAPP `Connection` is `CONNECTED` for this project (status-aware — NOT
   * the presence-only `hasWhatsAppInstance`). The `whatsapp_connect` isDone OR's
   * this with the `whatsappConnectedOnce` sentinel-mirror for monotonicity (FR-30).
   */
  hasConnectedWhatsAppInstance: boolean
  /** An INSTAGRAM `Connection` is `CONNECTED` for this project (gate T82 caveat). */
  hasConnectedInstagramInstance: boolean
}

/** The context the v2 engine expects: the v1 ctx plus the three v2 signals. */
export type StepEngineContextV2 = StepEngineContext & JourneyV2ContextSignals

/**
 * A v2 step definition. REUSES the shared `StepDefinition` shape (T12, anti-fork)
 * for everything except the two predicate signatures, which widen `ctx` to
 * `StepEngineContextV2` so the channel steps can read the three v2 signals. Derived
 * via `Omit` — the field set, `optional`/`applies` semantics, and `id` union are NOT
 * re-declared. Once T14 widens the canonical `StepEngineContext`, this stays compatible
 * (the widened base already satisfies the narrower predicate param). NO IO.
 */
type JourneyV2Step = Omit<StepDefinition, 'isDone' | 'missing'> & {
  isDone: (state: BuilderState, ctx: StepEngineContextV2) => boolean
  missing: (state: BuilderState, ctx: StepEngineContextV2) => string[]
}

// ==========================================
// Channel selection — pure readers of state.channel (T86)
// ==========================================

/** Did the creator select WhatsApp in the channel_platform card? Pure. */
function selectedWhatsApp(state: BuilderState): boolean {
  return state.channel?.platforms?.includes('whatsapp') === true
}

/** Did the creator select Instagram in the channel_platform card? Pure. */
function selectedInstagram(state: BuilderState): boolean {
  return state.channel?.platforms?.includes('instagram') === true
}

// ==========================================
// source_ingestion override — mirrors v1 surfacing (NOT a forked primitive)
// ==========================================

/**
 * Does the source synthesis carry at least one grounded field? Mirrors the v1
 * `hasSourceProposal` (next-pending-step.ts) — reads `state.sourceIngestion.proposed`
 * shape only; the protected primitives (`confirmed`/`hasText`/`computeBlockers`/
 * `FIELD_OWNERSHIP`) are imported, never re-implemented.
 */
function hasSourceProposal(state: BuilderState): boolean {
  const p = state.sourceIngestion.proposed
  if (!p) return false
  return Boolean(
    p.businessName ||
      p.audience ||
      p.tone ||
      p.address ||
      p.description ||
      (p.services && p.services.length > 0) ||
      (p.differentiators && p.differentiators.length > 0),
  )
}

/**
 * An in-flight "cole seu site/IG" source TAKES OVER the active-step slot so the
 * `source_progress` card surfaces the moment a link is pasted — same override as
 * v1 (next-pending-step.ts §77-104), kept here because the v1 helper is private.
 *
 * Active while NOT yet accepted (`confirmations.source`) AND there is either a
 * source still settling OR a proposal ready to accept. Stops once every source
 * settles with NO proposal, so the journey is never stuck on a disabled card.
 */
function sourceIngestionActive(state: BuilderState): boolean {
  if (confirmed(state, 'source')) return false
  const sources = state.sourceIngestion.sources
  if (sources.length === 0) return false
  if (hasSourceProposal(state)) return true
  return sources.some((s) => {
    const st = (s.status ?? '').trim().toLowerCase()
    return (
      st !== 'ready' &&
      st !== 'error' &&
      st !== 'done' &&
      st !== 'completed' &&
      st !== 'ok'
    )
  })
}

// ==========================================
// QUAYER_PHASES — the 4-phase v2 journey (plan §3.2)
// ==========================================

/**
 * Steps of the "Conhecer" phase. The creator tells us about the business.
 *  - `objective`        : free-form (same gate as v1) — what the agent solves.
 *  - `business_identity`: isDone via `confirmations.businessIdentity` OR an accepted
 *                         source (`confirmed('source')`) — pasting a site/IG is the
 *                         equivalent path (FR-03). No new sentinel for the source path.
 *  - `source_ingestion` : OPTIONAL — overrides the active slot while a scan is in
 *                         flight (mirrors v1), otherwise skipped from surfacing.
 */
const CONHECER_STEPS: readonly JourneyV2Step[] = [
  {
    id: 'objective',
    title: 'Objetivo do agente',
    ask: 'Qual o objetivo do agente? O que ele precisa resolver?',
    requiredPaths: ['project.objective'],
    isDone: (s) => hasText(s.project.objective),
    missing: (s) => (hasText(s.project.objective) ? [] : ['project.objective']),
  },
  {
    id: 'business_identity',
    title: 'Sobre o negócio',
    ask: 'Me conte sobre o seu negócio — pode colar o site/Instagram que eu já entendo, ou preencher o card.',
    requiredPaths: ['confirmations.businessIdentity'],
    // FR-03 — a fonte aceita satisfaz a identidade (caminho equivalente).
    isDone: (s) => confirmed(s, 'businessIdentity') || confirmed(s, 'source'),
    missing: (s) =>
      confirmed(s, 'businessIdentity') || confirmed(s, 'source')
        ? []
        : ['confirmations.businessIdentity'],
  },
  {
    id: 'source_ingestion',
    title: 'Fonte de conhecimento',
    ask: 'Se quiser, cole o seu site ou Instagram que eu já entendo o negócio — é opcional e você pode pular.',
    requiredPaths: ['confirmations.source'],
    optional: true,
    isDone: (s) => confirmed(s, 'source'),
    missing: (s) => (confirmed(s, 'source') ? [] : ['confirmations.source']),
  },
] as const

/**
 * Steps of the "Revisar" phase. The creator reviews the consolidated proposal.
 *  - `agent_review`  : COMPOSITE (FR-05) — isDone derives from the three EXISTING
 *                      sentinels (`persona && services && hours`); NO new sentinel.
 *  - `agent_approval`: creates the agent + prompt (legacy inline card kept).
 *  - `knowledge`     : OPTIONAL — real data (a source) OR the `knowledge` ack.
 *  - `media`         : OPTIONAL — real data (`imagesCount > 0`) OR the `media` ack.
 *
 * Capabilities (handoff/pricing/calendar) are NOT steps in v2 — opt-in via the
 * Capacidades surface (plan §4.3); their sentinels/handlers still work when opened.
 */
const REVISAR_STEPS: readonly JourneyV2Step[] = [
  {
    id: 'agent_review',
    title: 'Revisar o agente',
    ask: 'Revise a proposta do agente — persona, o que oferece e horários — e confirme no card.',
    requiredPaths: [
      'confirmations.persona',
      'confirmations.services',
      'confirmations.hours',
    ],
    // FR-05 — composto: deriva dos 3 sentinels existentes, sem sentinel novo.
    isDone: (s) =>
      confirmed(s, 'persona') && confirmed(s, 'services') && confirmed(s, 'hours'),
    missing: (s) => {
      const out: string[] = []
      if (!confirmed(s, 'persona')) out.push('confirmations.persona')
      if (!confirmed(s, 'services')) out.push('confirmations.services')
      if (!confirmed(s, 'hours')) out.push('confirmations.hours')
      return out
    },
  },
  {
    id: 'agent_approval',
    title: 'Aprovação do agente',
    ask: 'Revise a proposta do agente no card e aprove para eu criar.',
    requiredPaths: ['confirmations.agentApproved'],
    isDone: (s) => confirmed(s, 'agentApproved'),
    missing: (s) =>
      confirmed(s, 'agentApproved') ? [] : ['confirmations.agentApproved'],
  },
  {
    id: 'knowledge',
    title: 'Base de conhecimento',
    ask: 'Quer ensinar o agente com o seu material (site, textos, documentos)? É opcional.',
    requiredPaths: ['confirmations.knowledge'],
    optional: true,
    // Real data (uma fonte ingerida) OU o ack explícito satisfazem o passo.
    isDone: (s) =>
      confirmed(s, 'knowledge') || s.sourceIngestion.sources.length > 0,
    missing: (s) =>
      confirmed(s, 'knowledge') || s.sourceIngestion.sources.length > 0
        ? []
        : ['confirmations.knowledge'],
  },
  {
    id: 'media',
    title: 'Mídia do catálogo',
    ask: 'Quer que o agente envie fotos/vídeos do seu catálogo? É opcional.',
    requiredPaths: ['confirmations.media'],
    optional: true,
    // Real data (imagens extraídas de alguma fonte) OU o ack explícito satisfazem.
    isDone: (s) => confirmed(s, 'media') || hasMediaImages(s),
    missing: (s) =>
      confirmed(s, 'media') || hasMediaImages(s) ? [] : ['confirmations.media'],
  },
] as const

/** At least one ingested source carries extracted catalog images? Pure. */
function hasMediaImages(state: BuilderState): boolean {
  return state.sourceIngestion.sources.some((s) => (s.imagesCount ?? 0) > 0)
}

/**
 * Steps of the "Testar" phase.
 *  - `test_drive`: SOFT gate (decision 2, spec §9) — the "Publicar sem testar"
 *                  escape also flips `confirmations.testDrive`. Required so the
 *                  step surfaces, but it never holds deploy hostage (the escape clears it).
 */
const TESTAR_STEPS: readonly JourneyV2Step[] = [
  {
    id: 'test_drive',
    title: 'Testar o agente',
    ask: 'Faça um teste rápido do agente antes de publicar — ou pule se preferir.',
    requiredPaths: ['confirmations.testDrive'],
    isDone: (s) => confirmed(s, 'testDrive'),
    missing: (s) => (confirmed(s, 'testDrive') ? [] : ['confirmations.testDrive']),
  },
] as const

/**
 * Steps of the "Lançar" phase. Activation → channel → connect → publish.
 *  - `activation`        : same gate as v1 (`confirmations.activation`).
 *  - `channel_platform`  : NEW (FR-24/25) — picks the platform(s) + WhatsApp mode.
 *  - `whatsapp_connect`  : CONDITIONAL — surfaces only if `channel.platforms`
 *                          includes 'whatsapp'. isDone MONOTONIC (FR-15+FR-30):
 *                          live `CONNECTED` signal OR the `whatsappConnectedOnce`
 *                          sentinel-mirror — connected once never reopens.
 *  - `instagram_connect` : CONDITIONAL — surfaces only if 'instagram' selected;
 *                          isDone via the live `CONNECTED` IG signal (gate T82).
 *  - `summary`           : deploy gate (same as v1).
 *  - `published_next_steps`: TERMINAL — surfaces only once a deployment is live and
 *                          the ack is still pending (override, like silenced_contacts).
 */
const LANCAR_STEPS: readonly JourneyV2Step[] = [
  {
    id: 'activation',
    title: 'Modo de ativação',
    ask: 'Quando o agente deve responder (todas as mensagens, por palavra-chave, etc)? Use o card de ativação.',
    requiredPaths: ['confirmations.activation'],
    isDone: (s) => confirmed(s, 'activation'),
    missing: (s) =>
      confirmed(s, 'activation') ? [] : ['confirmations.activation'],
  },
  {
    id: 'channel_platform',
    title: 'Onde o agente atende',
    ask: 'Onde seu agente vai atender? Escolha a plataforma no card.',
    requiredPaths: ['confirmations.channelPlatform'],
    isDone: (s) => confirmed(s, 'channelPlatform'),
    missing: (s) =>
      confirmed(s, 'channelPlatform') ? [] : ['confirmations.channelPlatform'],
  },
  {
    id: 'whatsapp_connect',
    title: 'Conectar WhatsApp',
    ask: 'Vamos conectar o WhatsApp do seu negócio — escaneie o QR code no card.',
    requiredPaths: ['confirmations.whatsappConnectedOnce'],
    // CONDICIONAL: só aplica quando o WhatsApp foi escolhido em channel_platform.
    applies: (s) => selectedWhatsApp(s),
    // MONOTÔNICO (FR-15+FR-30): sinal vivo OU o sentinel-espelho. Não-aplicável
    // (WhatsApp não selecionado) → tratado como satisfeito.
    isDone: (s, ctx) =>
      !selectedWhatsApp(s) ||
      ctx.hasConnectedWhatsAppInstance ||
      confirmed(s, 'whatsappConnectedOnce'),
    missing: (s, ctx) =>
      !selectedWhatsApp(s) ||
      ctx.hasConnectedWhatsAppInstance ||
      confirmed(s, 'whatsappConnectedOnce')
        ? []
        : ['confirmations.whatsappConnectedOnce'],
  },
  {
    id: 'instagram_connect',
    title: 'Conectar Instagram',
    ask: 'Vamos conectar o seu Instagram para o agente responder as DMs — siga o card.',
    requiredPaths: ['ctx.hasConnectedInstagramInstance'],
    // CONDICIONAL: só aplica quando o Instagram foi escolhido em channel_platform.
    applies: (s) => selectedInstagram(s),
    isDone: (s, ctx) => !selectedInstagram(s) || ctx.hasConnectedInstagramInstance,
    missing: (s, ctx) =>
      !selectedInstagram(s) || ctx.hasConnectedInstagramInstance
        ? []
        : ['ctx.hasConnectedInstagramInstance'],
  },
  {
    id: 'summary',
    title: 'Revisão final',
    ask: 'Tudo certo? Revise o resumo e confirme para publicar.',
    requiredPaths: ['confirmations.summary'],
    isDone: (s) => confirmed(s, 'summary'),
    missing: (s) => (confirmed(s, 'summary') ? [] : ['confirmations.summary']),
  },
  {
    id: 'published_next_steps',
    title: 'Próximos passos',
    ask: 'Seu agente está no ar! Veja como testar do celular e acompanhar as conversas.',
    requiredPaths: ['confirmations.publishedNextSteps'],
    // TERMINAL opcional — nunca bloqueia a jornada nem o isDeployReady. Surfa
    // (override) só depois que há deployment vivo E o ack ainda está pendente.
    optional: true,
    isDone: (s) => confirmed(s, 'publishedNextSteps'),
    missing: (s) =>
      confirmed(s, 'publishedNextSteps')
        ? []
        : ['confirmations.publishedNextSteps'],
  },
] as const

/** A single phase: its id, title and ordered steps. */
export interface PhaseDefinition {
  id: PhaseId
  title: string
  steps: readonly JourneyV2Step[]
}

/**
 * The 4 ordered Journey v2 phases (plan §3.2). Order matters: `nextPendingStepV2`
 * walks them in sequence and surfaces the FIRST not-done applicable required step.
 */
export const QUAYER_PHASES: readonly PhaseDefinition[] = [
  { id: 'conhecer', title: 'Conhecer', steps: CONHECER_STEPS },
  { id: 'revisar', title: 'Revisar', steps: REVISAR_STEPS },
  { id: 'testar', title: 'Testar', steps: TESTAR_STEPS },
  { id: 'lancar', title: 'Lançar', steps: LANCAR_STEPS },
] as const

/** Flattened ordered step list across all phases (journey order). */
const ALL_STEPS: readonly JourneyV2Step[] = QUAYER_PHASES.flatMap(
  (phase) => phase.steps,
)

/** The terminal step id — surfaces only as an override post-publish. */
const TERMINAL_STEP_ID = 'published_next_steps'

// ==========================================
// Pure helpers (applicability + completeness)
// ==========================================

/** A step applies unless its `applies` predicate says otherwise (default: yes). */
function stepApplies(def: JourneyV2Step, state: BuilderState): boolean {
  return def.applies ? def.applies(state) : true
}

/**
 * Fraction of the journey done, 0-100 integer. Monotonic. Conditional channel
 * steps enter the denominator ONLY when their platform is selected (their
 * `applies` predicate gates membership), so an unselected channel neither inflates
 * nor blocks progress — same contract as v1 `computeCompletenessPct`.
 */
function computeCompletenessPct(
  state: BuilderState,
  ctx: StepEngineContextV2,
): number {
  const applicable = ALL_STEPS.filter((step) => stepApplies(step, state))
  const total = applicable.length
  if (total === 0) return 100
  const done = applicable.reduce(
    (acc, step) => acc + (step.isDone(state, ctx) ? 1 : 0),
    0,
  )
  return Math.round((done / total) * 100)
}

/**
 * Required (non-optional, non-terminal) steps gate the journey + isDeployReady.
 * Optional steps never block; the terminal step is post-publish and excluded too.
 */
function isGatingStep(def: JourneyV2Step): boolean {
  return !def.optional && def.id !== TERMINAL_STEP_ID
}

/** The phase that owns a given step id (every step belongs to exactly one phase). */
function phaseOfStep(stepId: JourneyV2Step['id']): PhaseId {
  for (const phase of QUAYER_PHASES) {
    if (phase.steps.some((s) => s.id === stepId)) return phase.id
  }
  // Unreachable: ALL_STEPS is derived from QUAYER_PHASES. Fall back to first phase.
  return QUAYER_PHASES[0].id
}

// ==========================================
// nextPendingStepV2 — the pure entry point (T16)
// ==========================================

/**
 * Compute the full `Readiness` (v1 contract) + the v2 `journey` payload from a
 * resolved `BuilderState` + live signals.
 *
 * Algorithm:
 *   1. Mark every applicable step done/not-done (non-applicable channel steps are
 *      treated as satisfied and excluded from the checklist + denominator).
 *   2. Surface the FIRST not-done GATING step in phase order as `step` (the ask).
 *      An in-flight pasted source overrides the slot (mirrors v1); the terminal
 *      published_next_steps overrides once the deployment is live + ack pending.
 *   3. `completenessPct` = done/total over applicable steps (monotonic).
 *   4. `blockers` = the v1 typed pre-deploy checks (REUSED `computeBlockers`).
 *   5. `isDeployReady` = all GATING steps done AND zero blockers (same as v1).
 *   6. `journey` = the 4 phases with per-phase status (done/active/pending).
 *
 * Never throws. Pure.
 */
export function nextPendingStepV2(
  state: BuilderState,
  ctx: StepEngineContextV2,
): Readiness {
  // 1. Build the ordered checklist over APPLICABLE steps only (non-applicable
  //    channel steps drop out so the UI never shows an irrelevant connect step).
  const applicableSteps = ALL_STEPS.filter((def) => stepApplies(def, state))
  const steps: ReadinessStep[] = applicableSteps.map((def) => ({
    id: def.id,
    title: def.title,
    done: def.isDone(state, ctx),
  }))

  // 2. Surface the FIRST not-done GATING step in phase order. Optional + terminal
  //    steps never occupy the active-step slot through the normal scan.
  const surfaced: JourneyV2Step | null =
    applicableSteps.find(
      (def) => isGatingStep(def) && !def.isDone(state, ctx),
    ) ?? null

  // 2a. In-flight pasted source ("cole seu site/IG") takes over the slot so the
  //     source_progress card surfaces (same override as v1).
  const sourceStep =
    sourceIngestionActive(state)
      ? ALL_STEPS.find((def) => def.id === 'source_ingestion') ?? null
      : null

  // 2b. Terminal override: once a deployment is live and the user hasn't acked the
  //     next-steps card, surface it (lower priority than an in-flight source scan).
  const terminalStep =
    sourceStep === null &&
    ctx.hasLiveDeployment &&
    !confirmed(state, 'publishedNextSteps')
      ? ALL_STEPS.find((def) => def.id === TERMINAL_STEP_ID) ?? null
      : null

  const overrideStep = sourceStep ?? terminalStep

  const blockers = computeBlockers(state, ctx)
  const completenessPct = computeCompletenessPct(state, ctx)

  // 5. Only GATING steps (required, non-terminal) gate the journey + deploy.
  const allGatingDone = applicableSteps
    .filter(isGatingStep)
    .every((def) => def.isDone(state, ctx))
  const isDeployReady = allGatingDone && blockers.length === 0

  // When everything gating is done, fall back to the last step as the terminal ask.
  const chosen =
    overrideStep ?? surfaced ?? ALL_STEPS[ALL_STEPS.length - 1]

  const ask = sourceStep
    ? hasSourceProposal(state)
      ? 'Terminei de ler o site/Instagram que você enviou. Revise os campos detectados no card "Fontes do negócio" e clique em Aceitar para aplicar ao agente (pode editar antes).'
      : 'Recebi o link e já estou lendo o seu site/Instagram para entender o negócio. Acompanhe no card "Fontes do negócio" — em instantes mostro o que entendi.'
    : chosen.ask

  // Override steps (source/terminal) are optional → no required fields; otherwise
  // the surfaced gating step's missing paths.
  const requiredMissing = overrideStep
    ? []
    : surfaced
      ? surfaced.missing(state, ctx)
      : []

  // 6. Phased journey payload. The ACTIVE phase owns the chosen step. Status is
  //    derived by ORDINAL position relative to the active phase — phases before
  //    it are `done`, after it `pending` — so an undone OPTIONAL step in an
  //    earlier phase (e.g. `media`) never drags a passed phase back to `pending`
  //    (monotonicity, FR-30). The active phase reflects the boundary `surfaced`
  //    already found: the first not-done GATING step.
  const activePhaseId = phaseOfStep(chosen.id)
  const activePhaseIndex = QUAYER_PHASES.findIndex((p) => p.id === activePhaseId)
  const phases = QUAYER_PHASES.map((phase, index) => {
    const phaseApplicable = phase.steps.filter((def) => stepApplies(def, state))
    const phaseSteps: ReadinessStep[] = phaseApplicable.map((def) => ({
      id: def.id,
      title: def.title,
      done: def.isDone(state, ctx),
    }))
    const status: 'done' | 'active' | 'pending' =
      index < activePhaseIndex
        ? 'done'
        : index === activePhaseIndex
          ? 'active'
          : 'pending'
    return { id: phase.id, title: phase.title, steps: phaseSteps, status }
  })

  return {
    step: {
      id: chosen.id,
      title: chosen.title,
      ask,
    },
    requiredMissing,
    completenessPct,
    isDeployReady,
    blockers,
    fieldOwnership: { ...FIELD_OWNERSHIP },
    steps,
    journey: {
      version: 2,
      activePhaseId,
      phases,
    },
  }
}
