/**
 * Builder Module — apply-card-submit handler (Orayon Uplift, W2 — Stage 2)
 *
 * Deterministic core of the card-action protocol. Given a validated card
 * payload, it:
 *   1. Loads the conversation + current `builderState` (tenant-scoped).
 *   2. Re-validates client-supplied lists server-side (never trust the body):
 *        - tool_selection.toolKeys  → must be in BUILTIN_TOOL_NAMES.
 *        - channel.channelKey       → must be in the canonical channel catalog.
 *   3. Applies the card's OWNED fields via the pure builder-state helpers and
 *      flips the matching `*_confirmed` sentinel.
 *   4. Persists the new state in a SINGLE tenant-filtered update.
 *   5. Returns `{ cardInstruction }` — a pt-BR system note that seeds the ACK
 *      turn so the LLM acknowledges the card action and continues the journey.
 *
 * Pure of HTTP concerns (no `response`); the route owns auth + the SSE wire.
 * No `any`. Filters EVERY query by organizationId.
 */

import { Prisma } from '@prisma/client'
import { database } from '@/server/services/database'
import { BUILTIN_TOOL_NAMES } from '@/server/ai-module/ai-agents/tools/builtin-tools'
import {
  parseBuilderState,
  patchBuilderState,
  applyConfirmation,
  type BuilderState,
  type DeepPartial,
  type SourceProposal,
} from '../builder-state'
import {
  CHANNEL_KEYS,
  type CardSubmitBody,
  type ChannelKey,
  type AgentPersonaPayload,
  type ServicesPayload,
  type BusinessHoursPayload,
  type PricingPayload,
  type PricingItemPayload,
  type QualificationActionPayload,
  type QualificationStepsPayload,
  type TeamStructurePayload,
  type CalendarConnectPayload,
  type ActivationModePayload,
  type QuickReplyChipsPayload,
  type SourceProgressPayload,
} from '../card-submit.schemas'

// ---------------------------------------------------------------------------
// Args / result
// ---------------------------------------------------------------------------

export interface ApplyCardSubmitArgs {
  /** BuilderProject id (the route `:id`). */
  projectId: string
  /** Tenant boundary — the caller's currentOrgId. */
  organizationId: string
  /** Already-validated card payload (discriminated on cardKey). */
  body: CardSubmitBody
}

export type ApplyCardSubmitResult =
  | { ok: true; cardInstruction: string; conversationId: string }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'invalid' ; message: string }

// ---------------------------------------------------------------------------
// Server-side re-validation of client lists
// ---------------------------------------------------------------------------

const BUILTIN_TOOL_SET: ReadonlySet<string> = new Set(
  BUILTIN_TOOL_NAMES as readonly string[],
)
const CHANNEL_KEY_SET: ReadonlySet<string> = new Set(CHANNEL_KEYS)

/** Keep only tool keys that are real builtin tools (drops anything spoofed). */
function sanitizeToolKeys(toolKeys: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const key of toolKeys) {
    if (BUILTIN_TOOL_SET.has(key) && !seen.has(key)) {
      seen.add(key)
      out.push(key)
    }
  }
  return out
}

/** Dedupe capability keys (catalog membership is enforced by the FE registry). */
function dedupeCapabilityKeys(capabilityKeys: string[]): string[] {
  return Array.from(new Set(capabilityKeys.filter((k) => k.length > 0)))
}

function isValidChannelKey(key: string): key is ChannelKey {
  return CHANNEL_KEY_SET.has(key)
}

/** Trim, drop empties, and dedupe a free-text string list (order-preserving). */
function sanitizeStringList(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const trimmed = raw.trim()
    if (trimmed.length === 0 || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

/** Re-validate pricing items server-side: trim names, floor/clamp cents to int>=0. */
function sanitizePricingItems(
  items: readonly PricingItemPayload[],
): PricingItemPayload[] {
  const out: PricingItemPayload[] = []
  for (const item of items) {
    const name = item.name.trim()
    if (name.length === 0) continue
    // priceCents is already int>=0 via Zod; clamp defensively (never trust body).
    const priceCents = Math.max(0, Math.trunc(item.priceCents))
    const category = item.category?.trim()
    out.push({
      name,
      priceCents,
      ...(category && category.length > 0 ? { category } : {}),
    })
  }
  return out
}

/** Normalize a currency code to an uppercase 3-letter ISO-ish code. */
function sanitizeCurrency(currency: string): string {
  const trimmed = currency.trim().toUpperCase()
  return trimmed.length === 3 ? trimmed : 'BRL'
}

/**
 * Re-validate team members server-side: keep position as a non-negative int and
 * trim string fields. The deploy saga maps these to DepartmentMember rows later.
 */
function sanitizeTeamMembers(
  members: TeamStructurePayload['members'],
): TeamStructurePayload['members'] {
  return members.map((m) => {
    const userId = m.userId?.trim()
    const name = m.name?.trim()
    return {
      position: Math.max(0, Math.trunc(m.position)),
      ...(userId && userId.length > 0 ? { userId } : {}),
      ...(name && name.length > 0 ? { name } : {}),
    }
  })
}

// ---------------------------------------------------------------------------
// Per-card application — returns the next state + the ACK instruction
// ---------------------------------------------------------------------------

interface CardApplication {
  next: BuilderState
  cardInstruction: string
}

function applyAgentApproval(state: BuilderState): CardApplication {
  const next = applyConfirmation(state, 'agentApproved')
  return {
    next,
    cardInstruction:
      'O usuário CONFIRMOU a criação do agente proposto pelo card de aprovação. ' +
      'Prossiga com create_agent usando o nome e a descrição já propostos — não peça nova confirmação. ' +
      'Depois siga para o próximo passo da jornada.',
  }
}

function applyToolSelection(
  state: BuilderState,
  toolKeys: string[],
  capabilityKeys: string[],
): CardApplication {
  const cleanToolKeys = sanitizeToolKeys(toolKeys)
  const cleanCapabilityKeys = dedupeCapabilityKeys(capabilityKeys)

  const patch: DeepPartial<BuilderState> = {
    selectedToolKeys: cleanToolKeys,
    selectedCapabilityKeys: cleanCapabilityKeys,
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'tools')

  const listLabel =
    cleanToolKeys.length > 0 ? cleanToolKeys.join(', ') : '(nenhuma)'
  return {
    next,
    cardInstruction:
      `O usuário SELECIONOU as ferramentas via card. Ferramentas válidas escolhidas: ${listLabel}. ` +
      'Anexe cada uma ao agente com attach_tool_to_agent (uma chamada por ferramenta) e então siga para o próximo passo. ' +
      'Não reabra o seletor de ferramentas.',
  }
}

function applyChannel(
  state: BuilderState,
  channelKey: ChannelKey,
): CardApplication {
  const patch: DeepPartial<BuilderState> = { selectedChannelKey: channelKey }
  const next = applyConfirmation(patchBuilderState(state, patch), 'channel')
  return {
    next,
    cardInstruction:
      `O usuário ESCOLHEU o canal "${channelKey}" via card. ` +
      'Conduza a publicação nesse canal (create_whatsapp_instance ou o fluxo do canal correspondente) e siga a jornada. ' +
      'Não reabra o seletor de canais.',
  }
}

// --- W3 cards --------------------------------------------------------------

function applyAgentPersona(
  state: BuilderState,
  persona: AgentPersonaPayload['persona'],
): CardApplication {
  // Only carry fields the user actually supplied (deepMerge ignores undefined).
  const patch: DeepPartial<BuilderState> = {
    persona: {
      name: persona.name,
      tone: persona.tone,
      style: persona.style,
      greeting: persona.greeting,
    },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'persona')

  const bits: string[] = []
  if (persona.name) bits.push(`nome "${persona.name}"`)
  if (persona.tone) bits.push(`tom "${persona.tone}"`)
  if (persona.style) bits.push(`estilo "${persona.style}"`)
  const summary = bits.length > 0 ? bits.join(', ') : 'os valores informados'
  return {
    next,
    cardInstruction:
      `O usuário DEFINIU a persona do agente via card (${summary}). ` +
      'Use a saudação configurada e siga para o próximo passo da jornada. ' +
      'Não reabra o card de persona.',
  }
}

function applyServices(
  state: BuilderState,
  payload: Pick<ServicesPayload, 'offered' | 'notOffered'>,
): CardApplication {
  const offered = sanitizeStringList(payload.offered)
  const notOffered = sanitizeStringList(payload.notOffered)
  const patch: DeepPartial<BuilderState> = {
    services: { offered, notOffered },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'services')

  const offeredLabel = offered.length > 0 ? offered.join(', ') : '(nenhum)'
  const notOfferedLabel =
    notOffered.length > 0 ? notOffered.join(', ') : '(nenhum)'
  return {
    next,
    cardInstruction:
      `O usuário INFORMOU os serviços via card. Oferece: ${offeredLabel}. Não oferece: ${notOfferedLabel}. ` +
      'Incorpore isso ao escopo do agente e siga para o próximo passo. ' +
      'Não reabra o card de serviços.',
  }
}

function applyBusinessHours(
  state: BuilderState,
  payload: Pick<BusinessHoursPayload, 'preset' | 'schedule' | 'timezone'>,
): CardApplication {
  // `schedule` is opaque (card owns its shape) — store verbatim.
  const patch: DeepPartial<BuilderState> = {
    hours: {
      preset: payload.preset,
      schedule: payload.schedule,
      timezone: payload.timezone,
    },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'hours')

  const presetLabel = payload.preset ? `preset "${payload.preset}"` : 'horário manual'
  return {
    next,
    cardInstruction:
      `O usuário DEFINIU o horário de atendimento via card (${presetLabel}). ` +
      'Considere esse horário no comportamento do agente e siga para o próximo passo. ' +
      'Não reabra o card de horários.',
  }
}

function applyPricing(
  state: BuilderState,
  payload: Pick<PricingPayload, 'items' | 'currency'>,
): CardApplication {
  // builderState only — the deploy saga materializes PriceList/PriceItem later.
  const items = sanitizePricingItems(payload.items)
  const currency = sanitizeCurrency(payload.currency)
  const patch: DeepPartial<BuilderState> = {
    pricing: { items, currency },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'pricing')

  const countLabel =
    items.length === 1 ? '1 item' : `${items.length} itens`
  return {
    next,
    cardInstruction:
      `O usuário CADASTROU a tabela de preços via card (${countLabel} em ${currency}). ` +
      'Use a tool get_pricing para responder sobre preços e siga para o próximo passo. ' +
      'Não reabra o card de preços.',
  }
}

function applyQualificationAction(
  state: BuilderState,
  action: QualificationActionPayload['action'],
): CardApplication {
  const patch: DeepPartial<BuilderState> = {
    qualification: { action },
  }
  const next = applyConfirmation(
    patchBuilderState(state, patch),
    'qualificationAction',
  )

  const labels: Record<QualificationActionPayload['action'], string> = {
    notify_team: 'avisar a equipe',
    book_appointment: 'agendar um horário',
    lead_only: 'apenas registrar o lead',
  }
  return {
    next,
    cardInstruction:
      `O usuário ESCOLHEU a ação de qualificação via card: ${labels[action]}. ` +
      'Conduza o lead qualificado para essa ação e siga para o próximo passo. ' +
      'Não reabra o card de ação de qualificação.',
  }
}

function applyQualificationSteps(
  state: BuilderState,
  payload: Pick<QualificationStepsPayload, 'steps'>,
): CardApplication {
  const steps = sanitizeStringList(payload.steps)
  const patch: DeepPartial<BuilderState> = {
    qualification: { steps },
  }
  const next = applyConfirmation(
    patchBuilderState(state, patch),
    'qualificationSteps',
  )

  const countLabel =
    steps.length === 1 ? '1 pergunta' : `${steps.length} perguntas`
  return {
    next,
    cardInstruction:
      `O usuário DEFINIU as etapas de qualificação via card (${countLabel}). ` +
      'Faça essas perguntas na ordem para qualificar o lead e siga para o próximo passo. ' +
      'Não reabra o card de etapas de qualificação.',
  }
}

function applyTeamStructure(
  state: BuilderState,
  payload: Pick<
    TeamStructurePayload,
    'departmentName' | 'departmentType' | 'members'
  >,
): CardApplication {
  // builderState only — the deploy saga materializes Department/DepartmentMember.
  const members = sanitizeTeamMembers(payload.members)
  const patch: DeepPartial<BuilderState> = {
    team: {
      departmentName: payload.departmentName,
      departmentType: payload.departmentType,
      members,
    },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'team')

  const countLabel =
    members.length === 1 ? '1 membro' : `${members.length} membros`
  const deptLabel = payload.departmentName
    ? `departamento "${payload.departmentName}"`
    : 'a roleta'
  return {
    next,
    cardInstruction:
      `O usuário CONFIGUROU a equipe via card (${deptLabel}, ${countLabel} na roleta). ` +
      'Use essa distribuição na transferência para humano e siga para o próximo passo. ' +
      'Não reabra o card de equipe.',
  }
}

function applyCalendarConnect(
  state: BuilderState,
  payload: Pick<CalendarConnectPayload, 'connectionId' | 'status'>,
): CardApplication {
  // builderState only — the deploy saga owns the real CalendarConnection.
  const patch: DeepPartial<BuilderState> = {
    calendar: {
      connectionId: payload.connectionId,
      status: payload.status,
    },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'calendar')

  const statusLabel = payload.status ? `status "${payload.status}"` : 'conectado'
  return {
    next,
    cardInstruction:
      `O usuário CONECTOU a agenda via card (${statusLabel}). ` +
      'Use a agenda conectada para agendamentos e siga para o próximo passo. ' +
      'Não reabra o card de conexão de agenda.',
  }
}

function applyActivationMode(
  state: BuilderState,
  payload: Pick<ActivationModePayload, 'mode' | 'keywords'>,
): CardApplication {
  const keywords = sanitizeStringList(payload.keywords)
  const patch: DeepPartial<BuilderState> = {
    activation: { mode: payload.mode, keywords },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'activation')

  const keywordsLabel = keywords.length > 0 ? keywords.join(', ') : '(nenhuma)'
  return {
    next,
    cardInstruction:
      `O usuário ESCOLHEU o modo de ativação via card: "${payload.mode}" (palavras-chave: ${keywordsLabel}). ` +
      'Considere esse modo no comportamento do agente e siga para o próximo passo. ' +
      'Não reabra o card de modo de ativação.',
  }
}

function applyPreviewSummary(state: BuilderState): CardApplication {
  // Confirm-only deploy gate — flip `summary`, no owned fields.
  const next = applyConfirmation(state, 'summary')
  return {
    next,
    cardInstruction:
      'O usuário CONFIRMOU o resumo de pré-visualização ("Tudo certo?") via card. ' +
      'Todos os passos da jornada estão revisados — prossiga para a publicação (deploy) do agente. ' +
      'Não reabra o card de resumo.',
  }
}

function applyQuickReplyChips(
  state: BuilderState,
  payload: Pick<QuickReplyChipsPayload, 'value'>,
): CardApplication {
  // No sentinel, no owned field — the chosen chip routes as a NORMAL user turn.
  // State is returned unchanged; the entrypoint skips the persist for this card.
  return {
    next: state,
    cardInstruction: payload.value.trim(),
  }
}

/**
 * Resolve the values to commit when the user ACCEPTS the source proposal:
 * start from the stored `proposed` synthesis, let `edited` override per field,
 * then re-sanitize EVERY value server-side (never trust the body). Returns a
 * clean `SourceProposal` carrying only grounded, non-empty fields.
 */
function resolveAcceptedProposal(
  proposed: SourceProposal | undefined,
  edited: SourceProgressPayload['edited'],
): SourceProposal {
  const base = proposed ?? {}
  const out: SourceProposal = {}

  // Scalars: edited wins; fall back to the stored proposal. Trim + drop empties.
  const businessName = (edited?.businessName ?? base.businessName)?.trim()
  if (businessName) out.businessName = businessName

  const audience = (edited?.audience ?? base.audience)?.trim()
  if (audience) out.audience = audience

  const tone = (edited?.tone ?? base.tone)?.trim()
  if (tone) out.tone = tone

  // Lists: edited replaces the proposal wholesale when supplied. Trim + dedupe.
  const services = sanitizeStringList(edited?.services ?? base.services ?? [])
  if (services.length > 0) out.services = services

  const differentiators = sanitizeStringList(
    edited?.differentiators ?? base.differentiators ?? [],
  )
  if (differentiators.length > 0) out.differentiators = differentiators

  return out
}

/**
 * source_progress — the "cole seu site/IG" acceptance gate. The async
 * `quayer:source-enrich` job has already written PROPOSED values into
 * `state.sourceIngestion.proposed`; here the user ACCEPTS them, so we copy the
 * (optionally edited) proposal into the OWNED builderState fields and flip the
 * `source` sentinel.
 *
 * Owned-field mapping (only fields with a canonical home are committed):
 *   - businessName    → project.name
 *   - audience        → project.objective  (the only free-text "who it serves" slot)
 *   - tone            → persona.tone
 *   - services        → services.offered    (UNIONed with already-confirmed list)
 *   - differentiators → kept in `proposed` + RAG (no owned field today; never
 *                       force-fit into a mismatched slot — see the report note).
 *
 * Anti-hallucination: this is the ONLY place `confirmations.source` flips. The
 * synthesis job never touches owned fields nor the sentinel.
 */
function applySourceProgress(
  state: BuilderState,
  edited: SourceProgressPayload['edited'],
): CardApplication {
  const accepted = resolveAcceptedProposal(state.sourceIngestion.proposed, edited)

  // Build the patch ONLY from fields that resolved to a value, so accepting a
  // sparse proposal never clobbers unrelated owned values with empties.
  const patch: DeepPartial<BuilderState> = {}

  if (accepted.businessName || accepted.audience) {
    patch.project = {
      ...(accepted.businessName ? { name: accepted.businessName } : {}),
      ...(accepted.audience ? { objective: accepted.audience } : {}),
    }
  }
  if (accepted.tone) {
    patch.persona = { tone: accepted.tone }
  }
  if (accepted.services && accepted.services.length > 0) {
    // Union with the already-present offered list (the user may have confirmed
    // services earlier) so accepting the source never DROPS prior choices.
    patch.services = {
      offered: sanitizeStringList([
        ...state.services.offered,
        ...accepted.services,
      ]),
    }
  }
  // `differentiators` has no owned field today; it stays in `proposed` (and in
  // the RAG collection) rather than being written to a mismatched slot.

  const next = applyConfirmation(patchBuilderState(state, patch), 'source')

  const bits: string[] = []
  if (accepted.businessName) bits.push(`nome "${accepted.businessName}"`)
  if (accepted.services && accepted.services.length > 0) {
    const noun = accepted.services.length === 1 ? 'serviço' : 'serviços'
    bits.push(`${accepted.services.length} ${noun}`)
  }
  if (accepted.audience) bits.push('público-alvo')
  if (accepted.tone) bits.push(`tom "${accepted.tone}"`)
  const summary = bits.length > 0 ? bits.join(', ') : 'as informações da fonte'
  return {
    next,
    cardInstruction:
      `O usuário ACEITOU os dados extraídos do site/Instagram via card (${summary}). ` +
      'Esses valores agora fazem parte do contexto do agente (e o conteúdo da fonte está na base de conhecimento). ' +
      'Use-os ao montar o agente e siga para o próximo passo da jornada. Não reabra o card de fontes.',
  }
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

export async function applyCardSubmit(
  args: ApplyCardSubmitArgs,
): Promise<ApplyCardSubmitResult> {
  const { projectId, organizationId, body } = args

  // `builderState` is in the generated client — read it in the same typed query
  // that proves ownership (no separate accessor / shim needed).
  const conversation = await database.builderProjectConversation.findUnique({
    where: { projectId },
    select: { id: true, organizationId: true, builderState: true },
  })

  if (!conversation) {
    return { ok: false, reason: 'not_found', message: 'Conversa do Builder não encontrada' }
  }
  if (conversation.organizationId !== organizationId) {
    return { ok: false, reason: 'forbidden', message: 'Acesso negado a esta conversa' }
  }

  // null/garbage/partial → DEFAULT_BUILDER_STATE (never throws).
  const current = parseBuilderState(conversation.builderState)

  let application: CardApplication
  switch (body.cardKey) {
    case 'agent_approval':
      application = applyAgentApproval(current)
      break
    case 'tool_selection':
      application = applyToolSelection(current, body.toolKeys, body.capabilityKeys)
      break
    case 'channel': {
      // Defense-in-depth: the Zod enum already gates this, but never trust the
      // body — re-check against the canonical catalog before persisting.
      if (!isValidChannelKey(body.channelKey)) {
        return { ok: false, reason: 'invalid', message: 'Canal inválido' }
      }
      application = applyChannel(current, body.channelKey)
      break
    }
    case 'agent_persona':
      application = applyAgentPersona(current, body.persona)
      break
    case 'services':
      application = applyServices(current, body)
      break
    case 'business_hours':
      application = applyBusinessHours(current, body)
      break
    case 'pricing':
      application = applyPricing(current, body)
      break
    case 'qualification_action':
      application = applyQualificationAction(current, body.action)
      break
    case 'qualification_steps':
      application = applyQualificationSteps(current, body)
      break
    case 'team_structure':
      application = applyTeamStructure(current, body)
      break
    case 'calendar_connect':
      application = applyCalendarConnect(current, body)
      break
    case 'activation_mode':
      application = applyActivationMode(current, body)
      break
    case 'preview_summary':
      application = applyPreviewSummary(current)
      break
    case 'quick_reply_chips':
      // No sentinel + no owned field: routes as a normal user turn. Skip the
      // persist entirely (state is unchanged) and return the echoed value.
      return {
        ok: true,
        conversationId: conversation.id,
        cardInstruction: applyQuickReplyChips(current, body).cardInstruction,
      }
    case 'source_progress':
      // `accept: true` is guaranteed by the Zod literal — copy proposed (with
      // optional per-field edits) into the owned fields + flip `source`.
      application = applySourceProgress(current, body.edited)
      break
    default: {
      // Exhaustiveness guard — a new registered card without a handler branch
      // becomes a compile error here.
      const _never: never = body
      return {
        ok: false,
        reason: 'invalid',
        message: `Card não suportado: ${(_never as { cardKey?: string }).cardKey ?? 'desconhecido'}`,
      }
    }
  }

  // Single tenant-filtered write, scoped by organizationId in the same statement
  // (findUnique-by-projectId already proved ownership). `BuilderState` is a plain
  // JSON-serializable object → cast to the Prisma JSON input type for the column.
  await database.builderProjectConversation.updateMany({
    where: { id: conversation.id, organizationId },
    data: { builderState: application.next as unknown as Prisma.InputJsonValue },
  })

  return {
    ok: true,
    conversationId: conversation.id,
    cardInstruction: application.cardInstruction,
  }
}
