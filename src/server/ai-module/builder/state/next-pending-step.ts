/**
 * Builder Module — nextPendingStep (Orayon Uplift, W2 foundation)
 *
 * The deterministic heart of the step-engine. A SINGLE pure function decides
 * which journey step comes next from a `BuilderState` + live `StepEngineContext`,
 * computes a monotonic completeness %, and turns the 6 prose pre-deploy checks
 * (whatsapp-agent-system-prompt.ts) into typed `blockers[]` reusing the
 * deploy-runner vocabulary (agent | prompt | version | channel | plan | byok).
 *
 * NO IO. NO `any`. 100% testable. The resolver layer (readiness-resolver.ts)
 * feeds it the live signals; the journey banner + UI read its output.
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md.
 */

import type { BuilderState } from '../cards/builder-state'
import { CHANNEL_KEYS } from '../cards/card-submit.schemas'
import type {
  Readiness,
  ReadinessBlocker,
  ReadinessStep,
  StepEngineContext,
  FieldOwnership,
} from './readiness.types'
import { type StepDefinition, confirmed, hasText } from './step-helpers'

// ==========================================
// Tunables
// ==========================================

/** Minimum system-prompt length treated as "a real prompt" (mirrors deploy-runner). */
export const MIN_PROMPT_LENGTH = 50

/** Canonical channel keys (catálogo). A bogus key can't satisfy the channel gate. */
const CHANNEL_KEY_SET: ReadonlySet<string> = new Set(CHANNEL_KEYS)

/** Redirect targets for blockers that need the user to leave the chat. */
const REDIRECT_PLAN = '/conta'
// NOTE: publish-agent.tool.ts uses '/configuracoes/provedores', but that page
// does not exist — the real BYOK page is '/integracoes'. Using the real route.
const REDIRECT_BYOK = '/integracoes'
const REDIRECT_CHANNEL = '/canais'

// ==========================================
// QUAYER_STEPS — the ordered journey
// ==========================================

/**
 * O passo `calendar` só aplica quando o card de handoff liga "também agenda"
 * (`handoff.alsoSchedule`) — ORTOGONAL ao modo (Onda 2). Antes era
 * `qualification.action === 'book_appointment'`.
 */
function needsCalendar(state: BuilderState): boolean {
  return state.handoff.alsoSchedule === true
}

/** A channel is selected only if it is a non-empty key in the canonical catálogo. */
function isValidChannelKey(value: string | undefined | null): boolean {
  return hasText(value) && CHANNEL_KEY_SET.has(value as string)
}

/** Does the source synthesis carry at least one grounded field? Pure. */
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
 * `source_progress` card surfaces (and the agent acknowledges the scan) the
 * moment a link is pasted — even though `source_ingestion` is an OPTIONAL step
 * that is otherwise skipped from surfacing.
 *
 * Active while NOT yet accepted (`confirmations.source`) AND there is either a
 * source still settling (pending/processing) OR a proposal ready to accept. Once
 * every source settles with NO proposal (synthesis produced nothing), it stops
 * being active so the journey is NEVER stuck on a card whose only action
 * (Aceitar) is disabled — the source stays in RAG and the journey moves on.
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

/**
 * G1 — the OPTIONAL `silenced_contacts` card likewise TAKES OVER the active-step
 * slot so it surfaces instead of marching straight to the next step, but only when
 * it actually applies: the user chose "atende todos, menos bloqueados"
 * (`activation.mode === 'all_except_blacklist'`), already confirmed activation, and
 * has NOT yet acknowledged the silenced list. As soon as the user submits — even an
 * empty list via "não tenho ninguém" — `confirmations.silencedContacts` flips and
 * this returns false, so it never loops forever and never gates deploy (the step is
 * optional, outside REQUIRED_STEPS).
 */
function silencedContactsActive(state: BuilderState): boolean {
  return (
    state.activation.mode === 'all_except_blacklist' &&
    confirmed(state, 'activation') &&
    !confirmed(state, 'silencedContacts')
  )
}

/**
 * Ordered journey lifted from the 8-stage flow + card catalog. Each entry is a
 * deterministic gate. Order matters: `nextPendingStep` returns the FIRST not-done.
 */
export const QUAYER_STEPS: readonly StepDefinition[] = [
  {
    id: 'project_identity',
    title: 'Nome do projeto',
    ask: 'Qual o nome do projeto?',
    requiredPaths: ['project.name'],
    isDone: (s) => hasText(s.project.name),
    missing: (s) => (hasText(s.project.name) ? [] : ['project.name']),
  },
  {
    id: 'objective',
    title: 'Objetivo do agente',
    ask: 'Qual o objetivo do agente? O que ele precisa resolver?',
    requiredPaths: ['project.objective'],
    isDone: (s) => hasText(s.project.objective),
    missing: (s) => (hasText(s.project.objective) ? [] : ['project.objective']),
  },
  {
    id: 'source_ingestion',
    title: 'Fonte de conhecimento',
    ask: 'Se quiser, cole o seu site ou Instagram que eu já entendo o negócio — é opcional e você pode pular.',
    requiredPaths: ['confirmations.source'],
    // Optional — never blocks the journey nor isDeployReady (see `optional`).
    // "Done" once the source card was accepted; otherwise simply skipped.
    optional: true,
    isDone: (s) => confirmed(s, 'source'),
    missing: (s) => (confirmed(s, 'source') ? [] : ['confirmations.source']),
  },
  {
    id: 'persona',
    title: 'Persona do agente',
    ask: 'Vamos definir o nome, tom e saudação do agente. Use o card de persona.',
    requiredPaths: ['confirmations.persona'],
    isDone: (s) => confirmed(s, 'persona'),
    missing: (s) => (confirmed(s, 'persona') ? [] : ['confirmations.persona']),
  },
  {
    id: 'services',
    title: 'O que oferece (e o que não)',
    ask: 'O que o agente oferece e o que ele NÃO faz? Use o card de serviços.',
    requiredPaths: ['confirmations.services'],
    isDone: (s) => confirmed(s, 'services'),
    missing: (s) => (confirmed(s, 'services') ? [] : ['confirmations.services']),
  },
  {
    id: 'business_hours',
    title: 'Horário de atendimento',
    ask: 'Qual o horário de atendimento? Use o card de horários.',
    requiredPaths: ['confirmations.hours'],
    isDone: (s) => confirmed(s, 'hours'),
    missing: (s) => (confirmed(s, 'hours') ? [] : ['confirmations.hours']),
  },
  {
    id: 'pricing',
    title: 'Preços',
    ask: 'Quer cadastrar preços? Use o card de preços (valores em reais).',
    requiredPaths: ['confirmations.pricing'],
    isDone: (s) => confirmed(s, 'pricing'),
    missing: (s) => (confirmed(s, 'pricing') ? [] : ['confirmations.pricing']),
  },
  {
    id: 'handoff',
    title: 'Passagem para humano',
    ask: 'Como o agente passa o atendimento para um humano — você mesmo (solo), rodízio da equipe (roleta), por departamento, ou nenhum? Use o card de handoff.',
    requiredPaths: ['confirmations.handoff'],
    // Onda 2 — FUSÃO de qualification_action + qualification_steps + team +
    // handoff_pairing. Sempre obrigatório: o usuário escolhe UM modo (mesmo
    // 'nenhum'). Roster/roteiro/agenda vivem como seções DENTRO do card.
    isDone: (s) => confirmed(s, 'handoff'),
    missing: (s) => (confirmed(s, 'handoff') ? [] : ['confirmations.handoff']),
  },
  {
    id: 'calendar',
    title: 'Agenda',
    ask: 'Quer conectar uma agenda para o agente marcar horários? Use o card de calendário.',
    requiredPaths: ['confirmations.calendar'],
    // Only relevant when the qualification action books an appointment. For
    // notify_team / lead_only it is non-applicable, so treat as satisfied.
    applies: needsCalendar,
    isDone: (s) => !needsCalendar(s) || confirmed(s, 'calendar'),
    missing: (s) =>
      !needsCalendar(s) || confirmed(s, 'calendar')
        ? []
        : ['confirmations.calendar'],
  },
  {
    id: 'activation',
    title: 'Modo de ativação',
    ask: 'Quando o agente deve responder (todas as mensagens, por palavra-chave, etc)? Use o card de ativação.',
    requiredPaths: ['confirmations.activation'],
    isDone: (s) => confirmed(s, 'activation'),
    missing: (s) => (confirmed(s, 'activation') ? [] : ['confirmations.activation']),
  },
  {
    id: 'silenced_contacts',
    title: 'Contatos em silêncio',
    ask: 'Algum contato que o agente deve deixar em silêncio (sócio, fornecedor, família)? É opcional.',
    requiredPaths: ['confirmations.silencedContacts'],
    // G1 — OPCIONAL (padrão source_ingestion): nunca bloqueia a jornada nem o
    // isDeployReady, nunca ocupa o active-step slot. Só faz sentido quando a
    // ativação é "atende todos, menos bloqueados"; fora disso é non-applicable
    // (applies=false → tratado como satisfeito e fora do ratio de completeness).
    optional: true,
    applies: (s) => s.activation.mode === 'all_except_blacklist',
    isDone: (s) => confirmed(s, 'silencedContacts'),
    missing: (s) =>
      confirmed(s, 'silencedContacts') ? [] : ['confirmations.silencedContacts'],
  },
  {
    id: 'tools',
    title: 'Ferramentas',
    // Inline card (ToolCallCard renders propose_tools) is the surface here.
    ask: 'Quais capacidades o agente precisa? Selecione no card de ferramentas.',
    requiredPaths: ['confirmations.tools'],
    isDone: (s) => confirmed(s, 'tools'),
    missing: (s) => (confirmed(s, 'tools') ? [] : ['confirmations.tools']),
  },
  {
    id: 'channel',
    title: 'Canal',
    // Inline card (ToolCallCard renders propose_channel) is the surface here.
    ask: 'Em qual canal o agente vai atender? Escolha no card de canais.',
    requiredPaths: ['selectedChannelKey', 'confirmations.channel'],
    isDone: (s) => confirmed(s, 'channel') && isValidChannelKey(s.selectedChannelKey),
    missing: (s) => {
      const out: string[] = []
      if (!isValidChannelKey(s.selectedChannelKey)) out.push('selectedChannelKey')
      if (!confirmed(s, 'channel')) out.push('confirmations.channel')
      return out
    },
  },
  {
    id: 'agent_approval',
    title: 'Aprovação do agente',
    // Inline card (ToolCallCard renders propose_agent) is the surface here.
    ask: 'Revise a proposta do agente no card e aprove para eu criar.',
    requiredPaths: ['confirmations.agentApproved'],
    isDone: (s) => confirmed(s, 'agentApproved'),
    missing: (s) =>
      confirmed(s, 'agentApproved') ? [] : ['confirmations.agentApproved'],
  },
  {
    id: 'summary',
    title: 'Revisão final',
    ask: 'Tudo certo? Revise o resumo e confirme para publicar.',
    requiredPaths: ['confirmations.summary'],
    isDone: (s) => confirmed(s, 'summary'),
    missing: (s) => (confirmed(s, 'summary') ? [] : ['confirmations.summary']),
  },
] as const

// ==========================================
// Field ownership map (journey banner: card vs livre)
// ==========================================

/**
 * Canonical field path → ownership. 'card' fields MUST be set through their card
 * (the banner tells the LLM to ask the user to use the card); 'livre' fields can
 * be captured from free-form chat text.
 */
export const FIELD_OWNERSHIP: Readonly<Record<string, FieldOwnership>> = {
  'project.name': 'livre',
  'project.objective': 'livre',
  'proposal.name': 'livre',
  'proposal.description': 'livre',
  'persona.name': 'card',
  // FR-02 (jornada-builder-v2) — o TOM é capturável em texto livre via
  // set_project_basics; a CONFIRMAÇÃO da persona continua no card de persona.
  'persona.tone': 'livre',
  'persona.style': 'card',
  'persona.greeting': 'card',
  'services.offered': 'card',
  'services.notOffered': 'card',
  'hours.preset': 'card',
  'hours.schedule': 'card',
  'pricing.items': 'card',
  'handoff.mode': 'card',
  'handoff.steps': 'card',
  'handoff.members': 'card',
  'calendar.connectionId': 'card',
  // FR-03 (jornada-builder-v2) — usuário sem site informa endereço/descrição
  // direto na conversa (set_project_basics) OU via accept do source_progress.
  'identity.address': 'livre',
  'identity.description': 'livre',
  'activation.mode': 'card',
  'activation.keywords': 'card',
  'silencedContacts.contacts': 'card',
  'selectedToolKeys': 'card',
  'selectedChannelKey': 'card',
  'sourceIngestion.sources': 'card',
}

// ==========================================
// Blockers — the 6 pre-deploy checks, typed
// ==========================================

/**
 * Maps the 6 prose pre-deploy checks (whatsapp-agent-system-prompt.ts §86-93)
 * onto typed blockers. PURE — reads only the supplied state + live signals.
 * Returns every UNCLEARED blocker (no short-circuit) so the UI can list them all.
 */
export function computeBlockers(
  state: BuilderState,
  ctx: StepEngineContext,
): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = []

  // 1. Plano ativo.
  if (!ctx.hasActivePlan) {
    blockers.push({
      check: 'plan',
      message: 'Nenhum plano ativo. Faça upgrade para publicar.',
      cta: 'Fazer upgrade do plano',
      redirect: REDIRECT_PLAN,
    })
  }

  // 2. BYOK configurado.
  if (ctx.byokProviderCount === 0) {
    blockers.push({
      check: 'byok',
      message:
        'Nenhuma chave de IA (BYOK) configurada. Adicione sua própria chave para publicar.',
      cta: 'Configurar provedor de IA',
      redirect: REDIRECT_BYOK,
    })
  }

  // 3. Agente criado.
  if (!ctx.agentExists) {
    blockers.push({
      check: 'agent',
      message: 'Nenhum agente criado para este projeto.',
      cta: 'Crie o agente antes de publicar',
    })
  }

  // 4. Prompt presente e suficiente.
  if (ctx.promptLength < MIN_PROMPT_LENGTH) {
    blockers.push({
      check: 'prompt',
      message: 'Prompt ausente ou muito curto.',
      cta: 'Gere o prompt do agente',
    })
  }

  // 5. Versão de prompt existe.
  if (ctx.latestVersionNumber == null) {
    blockers.push({
      check: 'version',
      message: 'Nenhuma versão de prompt encontrada.',
      cta: 'Gere uma versão de prompt',
    })
  }

  // 6. Instância WhatsApp conectada.
  if (!ctx.hasWhatsAppInstance) {
    blockers.push({
      check: 'channel',
      message: 'Nenhum canal WhatsApp configurado.',
      cta: 'Conecte um canal WhatsApp',
      redirect: REDIRECT_CHANNEL,
    })
  }

  return blockers
}

// ==========================================
// Completeness
// ==========================================

/** A step applies unless its `applies` predicate says otherwise (default: yes). */
function stepApplies(def: StepDefinition, state: BuilderState): boolean {
  return def.applies ? def.applies(state) : true
}

/**
 * Fraction of the journey that is done, as an integer 0-100. Monotonic:
 * marking any step done can only increase it. Optional steps count toward the
 * ratio once completed; non-applicable action-gated steps (team/calendar that
 * don't match the chosen qualification action) are excluded from BOTH the
 * numerator and the denominator, so they neither inflate nor block progress.
 */
function computeCompletenessPct(
  state: BuilderState,
  ctx: StepEngineContext,
): number {
  const applicable = QUAYER_STEPS.filter((step) => stepApplies(step, state))
  const total = applicable.length
  if (total === 0) return 100
  const done = applicable.reduce(
    (acc, step) => acc + (step.isDone(state, ctx) ? 1 : 0),
    0,
  )
  return Math.round((done / total) * 100)
}

/** Required (non-optional) steps — the set that gates the journey + isDeployReady. */
const REQUIRED_STEPS: readonly StepDefinition[] = QUAYER_STEPS.filter(
  (def) => !def.optional,
)

// ==========================================
// nextPendingStep — the pure entry point
// ==========================================

/**
 * Compute the full `Readiness` from a resolved `BuilderState` + live signals.
 *
 * Algorithm:
 *   1. Build the ordered checklist (`steps`) marking each done/not-done.
 *   2. Pick the FIRST not-done REQUIRED step as `step` (the next ask). Optional
 *      steps (e.g. source_ingestion) never block: they are skipped here and the
 *      scan lands on the next pending required step instead.
 *   3. `requiredMissing` = the canonical paths still empty for that step.
 *   4. `completenessPct` = done/total (monotonic).
 *   5. `blockers` = the 6 typed pre-deploy checks.
 *   6. `isDeployReady` = all REQUIRED steps done AND zero blockers.
 *
 * Never throws. Pure.
 */
export function nextPendingStep(
  state: BuilderState,
  ctx: StepEngineContext,
): Readiness {
  const steps: ReadinessStep[] = QUAYER_STEPS.map((def) => ({
    id: def.id,
    title: def.title,
    done: def.isDone(state, ctx),
  }))

  // Surface the FIRST not-done REQUIRED step in journey order. Optional steps
  // never occupy the active-step slot (they would be a dead end when their card
  // has no usable action), so they are skipped from the surfacing scan — they
  // are still completable any time via their own inline/card surface.
  const surfaced: StepDefinition | null =
    QUAYER_STEPS.find((def) => !def.optional && !def.isDone(state, ctx)) ?? null

  const blockers = computeBlockers(state, ctx)
  const completenessPct = computeCompletenessPct(state, ctx)
  // Only required steps gate the journey + deploy. Optional steps never block.
  const allStepsDone = REQUIRED_STEPS.every((def) => def.isDone(state, ctx))
  const isDeployReady = allStepsDone && blockers.length === 0

  // Orayon Uplift: an in-flight pasted source ("cole seu site/IG") takes over the
  // active-step slot (over the normal next required step) so the source_progress
  // card surfaces and the agent acknowledges the scan instead of marching on to
  // the next manual question. Once accepted/exhausted, normal flow resumes.
  const sourceStep =
    sourceIngestionActive(state)
      ? QUAYER_STEPS.find((def) => def.id === 'source_ingestion') ?? null
      : null

  // G1 — the optional silenced_contacts card also takes over the active-step slot
  // (lower priority than an in-flight source scan) so it surfaces after activation
  // instead of jumping straight to tools. Clears the instant the user submits.
  const silencedStep =
    sourceStep === null && silencedContactsActive(state)
      ? QUAYER_STEPS.find((def) => def.id === 'silenced_contacts') ?? null
      : null

  const overrideStep = sourceStep ?? silencedStep

  // When everything is done, surface the summary step as the terminal "ask".
  const chosen = overrideStep ?? surfaced ?? QUAYER_STEPS[QUAYER_STEPS.length - 1]
  const ask = sourceStep
    ? hasSourceProposal(state)
      ? 'Terminei de ler o site/Instagram que você enviou. Revise os campos detectados no card "Fontes do negócio" e clique em Aceitar para aplicar ao agente (pode editar antes).'
      : 'Recebi o link e já estou lendo o seu site/Instagram para entender o negócio. Acompanhe no card "Fontes do negócio" — em instantes mostro o que entendi.'
    : chosen.ask
  // Override steps (source/silenced) are optional → no required fields; otherwise
  // the surfaced required step's missing paths.
  const requiredMissing = overrideStep ? [] : surfaced ? surfaced.missing(state, ctx) : []

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
  }
}
