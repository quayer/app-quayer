/**
 * Builder Module — Recomendador de capacidades — NÚCLEO PURO (client-safe)
 * (FR-51/FR-52/NFR-13/FR-40 — `specs/jornada-builder-v2/mission-first-v3.md`)
 *
 * `recommendAgentCapabilities(builderState, insumos)` é a inteligência de
 * PRÉ-MARCAÇÃO da superfície de Capacidades (FR-43): a partir da MISSÃO escolhida
 * (FR-37) + nicho inferido + risco detectado + os insumos de `GET /capabilities`
 * (customTools, calendarConnected, contagens), devolve as tools/capacidades que o
 * agente DEVERIA ter, em linguagem de negócio (FR-49).
 *
 * 🔒 INVARIANTES DUROS (a razão deste módulo existir):
 *  - READ-ONLY (FR-09): NUNCA escreve `enabledTools`, NUNCA toca o builderState,
 *    NUNCA roda a saga. Só LÊ e devolve sugestões. Aceitar uma sugestão é decisão
 *    do usuário no card de domínio (caminho do FR-52), fora daqui.
 *  - PURO (NFR-13): zero IO, zero `any`, zero import de Prisma/runtime. Espelha
 *    `deploy/enabled-tools-derivation.pure.ts`. Vive ACIMA da derivação e AO LADO
 *    de `getCapabilities` — NUNCA dentro do pipeline `derive*→reconcile→enabledTools`.
 *  - FONTE PRIMÁRIA por missão = o PLAYBOOK ENGINE (FR-40): `resolveAgentStrategy`
 *    devolve uma `AgentStrategy` curada (papel × negócio) cujo `recommendedTools[]`
 *    é a fonte principal das capacidades pré-marcadas; os `guardrails` da strategy
 *    alimentam `risk`/`reason`. FONTE SECUNDÁRIA (merge/complemento) = os GATILHOS
 *    do Blueprint Engine JÁ existentes: `blueprint.toolTriggers[]`
 *    (`{capability, toolKey?, when, requiredVariables[]}`) + `handoffTriggers[]` +
 *    `successCriteria[]` (`playbook/blueprint.schema.ts`) — complementam quando há
 *    blueprint e NUNCA são removidos. Sem missão/strategy → fallback como hoje.
 *  - Cada `id` referencia uma tool VÁLIDA do catálogo `catalog/official-tools.ts`
 *    (validado contra `OFFICIAL_TOOLS` — ids fora do catálogo são descartados).
 *  - `requires[]` reflete pré-requisitos da derivação (ex.: agenda real exige
 *    conexão — FR-11) para NUNCA recomendar estado impossível (FR-10).
 *  - Missão AUSENTE / blueprint ausente => recomendações de FALLBACK genéricas.
 *    NUNCA lança (coerente com NFR-11).
 */

import type { BuilderState } from '../cards/builder-state'
import { OFFICIAL_TOOLS } from '../catalog/official-tools'
import {
  type AgentStrategy,
  resolveAgentStrategy,
} from '../playbook/agent-strategy'
import {
  foldText,
  inferKnownVertical,
  inferNiche,
  soldOutLimit,
} from '../playbook/niche-inference.pure'

// ==========================================
// Tipos públicos do contrato FR-51
// ==========================================

/** Pré-requisitos que travam uma recomendação até serem satisfeitos (FR-11). */
export type CapabilityRequirement =
  | 'calendar_connection'
  | 'pricing_catalog'
  | 'team_members'

/** Uma capacidade sugerida, keyed numa tool de `official-tools.ts`. */
export interface CapabilityRecommendation {
  /** Nome da tool no catálogo `OFFICIAL_TOOLS` (ex.: 'transfer_to_human'). */
  id: string
  /** 'recommended' = pré-marcada para o nicho; 'optional' = oferecida abaixo. */
  kind: 'recommended' | 'optional'
  /** Justificativa em LINGUAGEM DE NEGÓCIO (FR-49) — vai no badge/tooltip. */
  reason: string
  /** Pré-requisitos ainda não satisfeitos (vazio = pronta para ligar). */
  requires: CapabilityRequirement[]
  /** Aviso de risco quando aplicável (ex.: fonte 100% vendida). Opcional. */
  risk?: string
  /** Prefill SUGERIDO para o card de domínio (FR-23) — NUNCA aplicado sozinho. */
  initialConfig?: Record<string, string | number | boolean>
}

/**
 * Insumos que NÃO derivam do builderState — o mesmo envelope de
 * `GET /builder/projects/:id/capabilities` (capabilities.routes.ts). Tipado em
 * mínimo-necessário para manter o módulo puro/testável sem arrastar o route.
 */
export interface RecommendCapabilitiesInputs {
  /** Agenda Google ativa? (FR-11 — gate de `check_availability`/`create_event`). */
  calendarConnected: boolean
  /** Integrações CUSTOM disponíveis na org (só a contagem importa aqui). */
  customToolsCount?: number
  /** Itens de preço cadastrados (gate de capacidade de falar preço). */
  pricingItemCount?: number
}

// ==========================================
// Internals (puros)
// ==========================================

/** Set de nomes válidos do catálogo — qualquer id fora daqui é descartado. */
const OFFICIAL_TOOL_NAMES: ReadonlySet<string> = new Set(
  OFFICIAL_TOOLS.map((tool) => tool.name),
)

/** Tools de calendário que exigem conexão real antes de ligar (FR-11). */
const CALENDAR_TOOL_IDS: ReadonlySet<string> = new Set([
  'check_availability',
  'create_event',
  'cancel_event',
  'calendar_list_slots',
])

/**
 * Tools que a strategy pode recomendar mas que o recomendador apresenta como
 * `optional` (oferecidas abaixo, não pré-marcadas) — preserva a semântica de UI
 * do recomendador (follow-up proativo e calculadora são utilidades opt-in).
 */
const OPTIONAL_TOOL_IDS: ReadonlySet<string> = new Set([
  'create_followup',
  'calculator',
  'detect_talking_to_ai',
])

/**
 * Reason em LINGUAGEM DE NEGÓCIO (FR-49) por tool — o badge/tooltip do card de
 * Capacidades. Cobre todas as tools que as strategies podem recomendar; um id
 * sem reason aqui cai num texto neutro derivado do catálogo.
 */
const TOOL_REASONS: Readonly<Record<string, string>> = {
  transfer_to_human:
    'Passar a conversa para uma pessoa quando o lead pedir atendimento humano ou o assunto sair do que o agente resolve sozinho.',
  create_lead:
    'Registrar quem chega e o que a pessoa quer, para não perder nenhum interessado e dar continuidade ao atendimento.',
  check_availability:
    'Consultar horários livres na agenda para oferecer ao cliente sem conflito.',
  create_event:
    'Marcar o compromisso direto na agenda assim que o cliente escolher o horário.',
  cancel_event:
    'Cancelar ou remarcar um horário já agendado quando o cliente pedir.',
  calendar_list_slots:
    'Listar os próximos horários livres do expediente para o cliente escolher.',
  create_followup:
    'Retomar contato com quem parou de responder, para reaquecer o lead sem depender de lembrar manualmente. Envios fora da janela de 24h do WhatsApp exigem template aprovado.',
  calculator:
    'Fazer contas exatas (parcelas, descontos, totais) sem o agente errar valores de cabeça.',
  search_contacts:
    'Localizar o contato/conta da pessoa para dar continuidade ao atendimento com contexto.',
  detect_talking_to_ai:
    'Perceber quando o contato notou que fala com uma IA (ou é bot/spam) e ajustar a conduta.',
}

/** Reason de negócio da tool — usa o mapa curado; senão um texto neutro. */
function reasonForTool(id: string): string {
  return (
    TOOL_REASONS[id] ??
    'Capacidade recomendada para a missão escolhida do agente.'
  )
}

/** A strategy recomenda esta tool como pré-marcada (recommended) ou opcional? */
function kindForTool(id: string): CapabilityRecommendation['kind'] {
  return OPTIONAL_TOOL_IDS.has(id) ? 'optional' : 'recommended'
}

/**
 * Converte uma `AgentStrategy` resolvida (FONTE PRIMÁRIA — FR-40) na lista de
 * recomendações. Para cada tool em `strategy.recommendedTools`:
 *  - mapeia reason em linguagem de negócio + kind (recommended/optional);
 *  - aplica o gate de calendário (FR-11): sem conexão → requires/risk;
 *  - anexa o risco de fonte esgotada (`soldOutRisk`) quando houver e a tool não
 *    já carregar o aviso de calendário.
 * O 1º guardrail da strategy vira o aviso de risco-padrão (linguagem de negócio)
 * para tools sem risco específico, dando contexto da estratégia.
 */
function strategyToRecommendations(
  strategy: AgentStrategy,
  calendarConnected: boolean,
  soldOutRisk: string | undefined,
): CapabilityRecommendation[] {
  const out: CapabilityRecommendation[] = []
  const needsConnection = !calendarConnected
  const strategyGuardrail = strategy.guardrails[0]

  for (const id of strategy.recommendedTools) {
    if (!OFFICIAL_TOOL_NAMES.has(id)) continue

    if (CALENDAR_TOOL_IDS.has(id)) {
      out.push({
        id,
        kind: kindForTool(id),
        reason: reasonForTool(id),
        requires: needsConnection ? ['calendar_connection'] : [],
        risk: needsConnection
          ? 'Conecte uma agenda (Google Calendar) antes de ligar esta capacidade — sem conexão o agente não consegue confirmar horários reais.'
          : undefined,
      })
      continue
    }

    out.push({
      id,
      kind: kindForTool(id),
      reason: reasonForTool(id),
      requires: [],
      // Risco da fonte esgotada (quando houver) tem prioridade; senão usa o
      // guardrail-chefe da strategy como aviso de risco em linguagem de negócio.
      risk: soldOutRisk ?? strategyGuardrail,
      ...(id === 'transfer_to_human' ? { initialConfig: { mode: 'solo' } } : {}),
    })
  }

  return out
}

/**
 * Garante o contrato do catálogo (FR-51): só deixa passar recomendações cujo
 * `id` existe em `OFFICIAL_TOOLS` e DEDUPLICA por id, mantendo a primeira (a de
 * maior prioridade — a lista é montada na ordem recommended→optional).
 */
function sanitizeRecommendations(
  raw: readonly CapabilityRecommendation[],
): CapabilityRecommendation[] {
  const seen = new Set<string>()
  const out: CapabilityRecommendation[] = []
  for (const rec of raw) {
    if (!OFFICIAL_TOOL_NAMES.has(rec.id)) continue
    if (seen.has(rec.id)) continue
    seen.add(rec.id)
    out.push(rec)
  }
  return out
}

/** Sinais de texto do projeto para inferir nicho + risco (read-only). */
function projectSignals(state: BuilderState): (string | undefined)[] {
  const proposed = state.sourceIngestion.proposed
  return [
    state.project.objective,
    state.project.name,
    state.identity.description,
    proposed?.description,
    proposed?.businessName,
    ...(proposed?.services ?? []),
    ...(proposed?.differentiators ?? []),
  ]
}

/** Risco "100% vendido/esgotado" na fonte (compartilhado com o designer-input). */
function detectSoldOutRisk(state: BuilderState): string | undefined {
  return soldOutLimit(projectSignals(state))
}

/**
 * O blueprint pede AGENDA? Lê os gatilhos reais (FR-51 — fonte = blueprint):
 *  - algum `toolTrigger` com `toolKey` de calendário OU `capability`/`when`
 *    falando de agenda/horário/visita; OU
 *  - algum `successCriteria` sobre marcar/agendar.
 */
function blueprintWantsScheduling(state: BuilderState): boolean {
  const blueprint = state.conversationBlueprint
  if (!blueprint) return false
  const calendarKeys = new Set([
    'check_availability',
    'create_event',
    'cancel_event',
    'calendar_list_slots',
  ])
  const triggerHit = blueprint.toolTriggers.some((trigger) => {
    if (trigger.toolKey && calendarKeys.has(trigger.toolKey)) return true
    const text = foldText([trigger.capability, trigger.when])
    return /(agenda|agendar|horario|visita|consulta|reuniao|marcar)/.test(text)
  })
  if (triggerHit) return true
  const criteriaText = foldText(blueprint.successCriteria)
  return /(agend|marcar visita|marcar consulta|marcar reuniao|horario)/.test(
    criteriaText,
  )
}

/** O blueprint pede TRANSFERÊNCIA para humano? (qualquer handoffTrigger). */
function blueprintWantsHandoff(state: BuilderState): boolean {
  const blueprint = state.conversationBlueprint
  if (!blueprint) return false
  if (blueprint.handoffTriggers.length > 0) return true
  return blueprint.toolTriggers.some((trigger) => {
    const text = foldText([trigger.capability, trigger.when])
    return /(transferir|humano|consultor|atendente|equipe)/.test(text)
  })
}

/** O blueprint/missão captura LEAD/qualificação? (successCriteria + objetivo). */
function blueprintWantsLead(state: BuilderState): boolean {
  const objective = foldText([state.mission?.objective, state.project.objective])
  if (/(qualific|captar|lead|interesse)/.test(objective)) return true
  const blueprint = state.conversationBlueprint
  if (!blueprint) return false
  const criteriaText = foldText(blueprint.successCriteria)
  return /(qualific|lead|interesse|encaminhad)/.test(criteriaText)
}

/** A missão é de SDR/closer/cobrança/onboarding? (proatividade — FR-PRO-01). */
function missionFavorsFollowup(state: BuilderState): boolean {
  const role = foldText([state.mission?.role, state.mission?.key])
  return /(sdr|closer|cobranca|onboarding|pos-?venda|posvenda)/.test(role)
}

/**
 * A missão implica passar o bastão para humano? Quase toda missão comercial/de
 * atendimento (sdr/closer/secretaria/vendas/suporte) acaba precisando transferir —
 * complementa o gatilho do blueprint (handoffTriggers) para não deixar o agente
 * sem a capacidade de cair em humano (FR-10).
 */
function missionFavorsHandoff(state: BuilderState): boolean {
  const role = foldText([state.mission?.role, state.mission?.key])
  return /(sdr|closer|secretaria|vendas|suporte|cobranca|onboarding)/.test(role)
}

/** A missão pede AGENDA explicitamente (objetivo agendar OU add-on agenda)? */
function missionFavorsScheduling(state: BuilderState): boolean {
  const objective = foldText([state.mission?.objective])
  if (/(agend|marcar)/.test(objective)) return true
  const addons = foldText(state.mission?.addons ?? [])
  return /(agend|agenda|calendario)/.test(addons)
}

// ==========================================
// recommendAgentCapabilities (pura)
// ==========================================

/**
 * Devolve as capacidades recomendadas/opcionais para o agente, derivadas da
 * missão + nicho + risco + insumos. PURA e READ-ONLY: nunca escreve nada.
 *
 * Pipeline de fontes (FR-40):
 *   1. PRIMÁRIA — Playbook Engine: `resolveAgentStrategy` (papel × negócio) →
 *      `strategy.recommendedTools` viram as recomendações pré-marcadas, com os
 *      guardrails da strategy alimentando `risk`. Só quando HÁ missão.
 *   2. SECUNDÁRIA (merge) — Blueprint Engine: `blueprint.toolTriggers[]` +
 *      `handoffTriggers[]` + `successCriteria[]` complementam quando há blueprint
 *      (dedup mantém a primária; o blueprint só ADICIONA o que faltar).
 *   3. FALLBACK — sem missão: recomendações genéricas (transferir + lead), nunca
 *      erro (NFR-11).
 */
export function recommendAgentCapabilities(
  state: BuilderState,
  inputs: RecommendCapabilitiesInputs,
): CapabilityRecommendation[] {
  const recs: CapabilityRecommendation[] = []

  const niche = inferKnownVertical(projectSignals(state))
  const soldOutRisk = detectSoldOutRisk(state)
  const hasMission = state.mission !== undefined

  // ── FONTE PRIMÁRIA (FR-40): Playbook Engine ───────────────────────────────
  // Resolve a AgentStrategy a partir do papel/objetivo da missão + nicho. Só
  // quando há missão — sem missão mantemos o fallback genérico de antes.
  if (hasMission) {
    const strategy = resolveAgentStrategy({
      role: state.mission?.role,
      objective: state.mission?.objective,
      niche: inferNiche(state, undefined),
    })
    recs.push(
      ...strategyToRecommendations(
        strategy,
        inputs.calendarConnected,
        soldOutRisk,
      ),
    )
  }

  // ── FONTE SECUNDÁRIA (merge): Blueprint Engine + heurísticas de missão ─────
  // Complementa o que a strategy não cobriu. O dedup em `sanitizeRecommendations`
  // mantém a recomendação PRIMÁRIA (empurrada acima) — o blueprint só ADICIONA o
  // que faltar. Sem missão, estes ramos formam o FALLBACK genérico.
  const wantsHandoff =
    blueprintWantsHandoff(state) || missionFavorsHandoff(state) || !hasMission
  const wantsLead = blueprintWantsLead(state) || !hasMission
  const wantsScheduling =
    blueprintWantsScheduling(state) || missionFavorsScheduling(state)

  if (wantsHandoff) {
    recs.push({
      id: 'transfer_to_human',
      kind: 'recommended',
      reason: reasonForTool('transfer_to_human'),
      requires: [],
      risk: soldOutRisk,
      initialConfig: { mode: 'solo' },
    })
  }

  if (wantsLead) {
    recs.push({
      id: 'create_lead',
      kind: 'recommended',
      reason: reasonForTool('create_lead'),
      requires: [],
      risk: soldOutRisk,
    })
  }

  // Agenda (FR-11: marcar exige conexão real — nunca recomendar impossível).
  if (wantsScheduling) {
    const needsConnection = !inputs.calendarConnected
    recs.push({
      id: 'check_availability',
      kind: 'recommended',
      reason: reasonForTool('check_availability'),
      requires: needsConnection ? ['calendar_connection'] : [],
      risk: needsConnection
        ? 'Conecte uma agenda (Google Calendar) antes de ligar esta capacidade — sem conexão o agente não consegue confirmar horários reais.'
        : undefined,
    })
    recs.push({
      id: 'create_event',
      kind: 'recommended',
      reason: reasonForTool('create_event'),
      requires: needsConnection ? ['calendar_connection'] : [],
      risk: needsConnection
        ? 'Conecte uma agenda (Google Calendar) antes de ligar esta capacidade.'
        : undefined,
    })
  }

  // Follow-up proativo (FR-PRO-01: SDR/closer/cobrança/onboarding).
  if (missionFavorsFollowup(state)) {
    recs.push({
      id: 'create_followup',
      kind: 'optional',
      reason: reasonForTool('create_followup'),
      requires: [],
    })
  } else {
    recs.push({
      id: 'create_followup',
      kind: 'optional',
      reason: 'Agendar um retorno proativo quando fizer sentido reaquecer o contato.',
      requires: [],
    })
  }

  // Calculadora (opcional; útil em delivery/B2B/imobiliário com contas/parcelas).
  if (niche === 'delivery' || niche === 'B2B' || niche === 'imobiliário') {
    recs.push({
      id: 'calculator',
      kind: 'optional',
      reason: reasonForTool('calculator'),
      requires: [],
    })
  }

  return sanitizeRecommendations(recs)
}
