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
  type HandoffPairingPayload,
  type CalendarConnectPayload,
  type ActivationModePayload,
  type QuickReplyChipsPayload,
  type SourceProgressPayload,
  type SilencedContactsPayload,
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

/** Estilos de divulgação válidos — espelho do enum no schema/builder-state. */
const PRICING_DISCLOSURE_STYLES = [
  'exact',
  'from',
  'average',
  'none',
] as const
type PricingDisclosureStyle = (typeof PRICING_DISCLOSURE_STYLES)[number]
const PRICING_DISCLOSURE_SET: ReadonlySet<string> = new Set(
  PRICING_DISCLOSURE_STYLES,
)

/**
 * Re-valida o estilo de divulgação (G4) server-side: cai para 'exact' (o default)
 * se vier algo fora do conjunto conhecido. Nunca confia no body.
 */
function sanitizeDisclosureStyle(
  style: string | undefined,
): PricingDisclosureStyle {
  return style && PRICING_DISCLOSURE_SET.has(style)
    ? (style as PricingDisclosureStyle)
    : 'exact'
}

/** `true` quando uma URL https(s) é confiável o suficiente para persistir (G5b). */
function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

/**
 * Re-validate pricing items server-side: trim names, floor/clamp cents to int>=0,
 * e (Onda B) condiciona os novos campos ao estilo de divulgação global:
 *  - `priceMaxCents` (G4) só é mantido quando o estilo é 'average' E o teto é
 *    estritamente maior que o piso (`priceCents`); caso contrário é descartado,
 *    para o JSONB nunca guardar uma faixa sem sentido.
 *  - `imageUrl` (G5b) é mantido só quando é uma URL http(s) válida (trim + cap),
 *    senão é descartado.
 */
function sanitizePricingItems(
  items: readonly PricingItemPayload[],
  disclosureStyle: PricingDisclosureStyle,
): PricingItemPayload[] {
  const out: PricingItemPayload[] = []
  for (const item of items) {
    const name = item.name.trim()
    if (name.length === 0) continue
    // priceCents is already int>=0 via Zod; clamp defensively (never trust body).
    const priceCents = Math.max(0, Math.trunc(item.priceCents))
    const category = item.category?.trim()

    // G4 — teto da faixa: só quando 'average' E max > piso. Senão dropamos.
    let priceMaxCents: number | undefined
    if (disclosureStyle === 'average' && typeof item.priceMaxCents === 'number') {
      const ceiling = Math.max(0, Math.trunc(item.priceMaxCents))
      if (ceiling > priceCents) priceMaxCents = ceiling
    }

    // G5b — foto do serviço: só uma URL http(s) válida (cap a 2000 chars).
    let imageUrl: string | undefined
    if (typeof item.imageUrl === 'string') {
      const trimmed = item.imageUrl.trim().slice(0, 2000)
      if (trimmed.length > 0 && isHttpUrl(trimmed)) imageUrl = trimmed
    }

    out.push({
      name,
      priceCents,
      ...(category && category.length > 0 ? { category } : {}),
      ...(priceMaxCents !== undefined ? { priceMaxCents } : {}),
      ...(imageUrl ? { imageUrl } : {}),
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
 * Porta SERVER-SIDE de `phone-br.ts normalizeBrPhone` (G6/G1): normaliza um
 * telefone brasileiro digitado livre para E.164 (`+55DDDNNNNNNNN`) SEM depender
 * de DOM. Mantém PARIDADE EXATA com a normalização do frontend (mesma regex de
 * validação `^\+\d{10,15}$`) para que FE e BE concordem sobre o que é um número
 * válido. Só retorna um número quando há confiança na forma; caso contrário
 * `undefined` — telefone é OPCIONAL, então simplesmente o omitimos.
 */
function normalizeWhatsappBr(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const digits = raw.replace(/\D/g, '')
  if (!digits) return undefined

  let candidate: string | null = null
  // Já vem com DDI 55 (12 dígitos = fixo, 13 = celular com 9).
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    candidate = `+${digits}`
  } else if (digits.length === 10 || digits.length === 11) {
    // Local com DDD: 10 (fixo) ou 11 (celular com 9) — assume Brasil.
    candidate = `+55${digits}`
  } else if (raw.startsWith('+') && digits.length >= 10 && digits.length <= 15) {
    // Estrangeiro / já prefixado com `+` — repassa se o tamanho for plausível.
    candidate = `+${digits}`
  }

  // Valida a forma final igual ao FE (isValidBrE164) antes de confiar nela.
  if (candidate !== null && /^\+\d{10,15}$/.test(candidate)) return candidate
  return undefined
}

/**
 * Re-validate team members server-side: keep position as a non-negative int,
 * trim string fields and normalizar o WhatsApp (G6) para E.164-BR — incluindo o
 * campo só quando confiável (espelha o opcional `userId`).
 */
function sanitizeTeamMembers(
  members: TeamStructurePayload['members'],
): TeamStructurePayload['members'] {
  return members.map((m) => {
    const userId = m.userId?.trim()
    const name = m.name?.trim()
    const whatsapp = normalizeWhatsappBr(m.whatsapp)
    const connectionId = m.connectionId?.trim()
    return {
      position: Math.max(0, Math.trunc(m.position)),
      ...(userId && userId.length > 0 ? { userId } : {}),
      ...(name && name.length > 0 ? { name } : {}),
      ...(whatsapp ? { whatsapp } : {}),
      // F0 — só transita; o runtime valida tenant-scoped (fail-open).
      ...(connectionId && connectionId.length > 0 ? { connectionId } : {}),
    }
  })
}

/**
 * G1 — re-valida contatos silenciados server-side: normaliza o WhatsApp para
 * E.164-BR (descarta os que não normalizam), faz trim do nome (inclui só se não
 * vazio), dedupe por whatsapp e capa em 50. Nunca confia no body.
 */
function sanitizeSilencedContacts(
  items: SilencedContactsPayload['contacts'],
): SilencedContactsPayload['contacts'] {
  const seen = new Set<string>()
  const out: SilencedContactsPayload['contacts'] = []
  for (const item of items) {
    const whatsapp = normalizeWhatsappBr(item.whatsapp)
    if (!whatsapp || seen.has(whatsapp)) continue
    seen.add(whatsapp)
    const name = item.name?.trim()
    out.push(name && name.length > 0 ? { name, whatsapp } : { whatsapp })
    if (out.length >= 50) break
  }
  return out
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
  // G7 — `speechMode` (estilo de voz) é OPCIONAL e additivo: persiste verbatim
  // quando vier, e o deepMerge descarta `undefined` quando não vier.
  const patch: DeepPartial<BuilderState> = {
    persona: {
      name: persona.name,
      tone: persona.tone,
      style: persona.style,
      greeting: persona.greeting,
      speechMode: persona.speechMode,
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

/** Frase PT-BR de COMO o agente fala o preço (G4), para a copy do ACK. */
const DISCLOSURE_LABELS: Record<PricingDisclosureStyle, string> = {
  exact: 'valor exato (ex.: "R$ 250")',
  from: 'a partir de (ex.: "a partir de R$ 250")',
  average: 'faixa média (ex.: "entre R$ 200 e R$ 350")',
  none: 'não informar o preço (qualifica e encaminha)',
}

/** Render server-side de centavos → "R$ 1.234,56" para a copy do ACK (min ticket). */
function centsToBrl(cents: number): string {
  const safe = Math.max(0, Math.trunc(cents))
  const reais = Math.floor(safe / 100)
  const remainder = safe % 100
  const reaisStr = reais.toLocaleString('pt-BR')
  return `R$ ${reaisStr},${remainder.toString().padStart(2, '0')}`
}

export function applyPricing(
  state: BuilderState,
  payload: Pick<
    PricingPayload,
    'items' | 'currency' | 'disclosureStyle' | 'minTicketCents'
  >,
): CardApplication {
  // builderState only — the deploy saga materializes PriceList/PriceItem later.
  const disclosureStyle = sanitizeDisclosureStyle(payload.disclosureStyle)
  const items = sanitizePricingItems(payload.items, disclosureStyle)
  const currency = sanitizeCurrency(payload.currency)

  // G5a — min ticket: mantém só um inteiro > 0; 0/null/ausente significa SEM valor
  // mínimo. A tabela é submetida wholesale, então "ausente" = o usuário REMOVEU.
  let minTicketCents: number | undefined
  if (typeof payload.minTicketCents === 'number') {
    const cents = Math.max(0, Math.trunc(payload.minTicketCents))
    if (cents > 0) minTicketCents = cents
  }

  const patch: DeepPartial<BuilderState> = {
    pricing: {
      items,
      currency,
      disclosureStyle,
      ...(minTicketCents !== undefined ? { minTicketCents } : {}),
    },
  }
  // deepMerge pula `undefined`, então um min ticket ausente preservaria o valor
  // antigo. Limpamos o escalar explicitamente para o checkbox poder ser desmarcado.
  let merged = patchBuilderState(state, patch)
  if (minTicketCents === undefined && merged.pricing.minTicketCents !== undefined) {
    merged = { ...merged, pricing: { ...merged.pricing, minTicketCents: undefined } }
  }
  const next = applyConfirmation(merged, 'pricing')

  const countLabel = items.length === 1 ? '1 item' : `${items.length} itens`
  const withPhotoCount = items.filter((i) => Boolean(i.imageUrl)).length
  const photoNote =
    withPhotoCount > 0
      ? ` ${withPhotoCount === 1 ? '1 item tem' : `${withPhotoCount} itens têm`} foto (catálogo visual).`
      : ''
  const minTicketNote =
    minTicketCents !== undefined
      ? ` Valor mínimo de atendimento: ${centsToBrl(minTicketCents)}.`
      : ''

  return {
    next,
    cardInstruction:
      `O usuário CADASTROU a tabela de preços via card (${countLabel} em ${currency}).${photoNote}${minTicketNote} ` +
      `Ao falar de preço, use o formato: ${DISCLOSURE_LABELS[disclosureStyle]}. ` +
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
  // G6 — alguns membros podem ter WhatsApp para receber o aviso do rodízio.
  const withPhoneCount = members.filter((m) => Boolean(m.whatsapp)).length
  const phoneNote =
    withPhoneCount > 0
      ? ` ${withPhoneCount === 1 ? '1 membro tem' : `${withPhoneCount} membros têm`} WhatsApp para receber a notificação do rodízio.`
      : ''
  return {
    next,
    cardInstruction:
      `O usuário CONFIGUROU a equipe via card (${deptLabel}, ${countLabel} na roleta).${phoneNote} ` +
      'Use essa distribuição na transferência para humano e siga para o próximo passo. ' +
      'Não reabra o card de equipe.',
  }
}

/**
 * B2 (warm transfer) — pareia a instância WhatsApp PRÓPRIA de cada membro (por
 * `position`) e grava a mensagem de abertura editável. O `connectionId` só transita;
 * o runtime valida tenant-scoped (fail-open). Membros fora do payload ficam intactos.
 */
export function applyHandoffPairing(
  state: BuilderState,
  payload: Pick<HandoffPairingPayload, 'members' | 'openingMessage'>,
): CardApplication {
  const connByPosition = new Map<number, string | undefined>(
    payload.members.map((m) => [m.position, m.connectionId?.trim() || undefined]),
  )
  const members = state.team.members.map((m) =>
    connByPosition.has(m.position)
      ? { ...m, connectionId: connByPosition.get(m.position) }
      : m,
  )

  const openingMessage = payload.openingMessage?.trim()
  const patch: DeepPartial<BuilderState> = {
    team: {
      members,
      ...(openingMessage ? { openingMessage } : {}),
    },
  }
  const next = applyConfirmation(patchBuilderState(state, patch), 'handoffPairing')

  const pairedCount = members.filter((m) => Boolean(m.connectionId)).length
  const label =
    pairedCount === 1 ? '1 atendente' : `${pairedCount} atendentes`
  return {
    next,
    cardInstruction:
      `O usuário PAREOU o WhatsApp de ${label} para warm transfer. ` +
      'Quando o lead cair na roleta de um atendente pareado, a conexão própria dele ' +
      'inicia o atendimento direto no WhatsApp do cliente. Siga para o próximo passo; não reabra o card.',
  }
}

/**
 * G10 — valores de `status` que significam "o usuário optou por seguir SEM agenda"
 * (escape hatch "Continuar sem agenda" após N tentativas de conexão falharem). O
 * schema mantém `status` como string opcional (≤120), então 'skipped' já cabe sem
 * mudança de contrato — aqui só ramificamos a COPY do ACK.
 */
const CALENDAR_SKIPPED_STATUSES: ReadonlySet<string> = new Set([
  'skipped',
  'skip',
  'none',
])

function applyCalendarConnect(
  state: BuilderState,
  payload: Pick<CalendarConnectPayload, 'connectionId' | 'status'>,
): CardApplication {
  // builderState only — the deploy saga owns the real CalendarConnection.
  // `status` é persistido verbatim (inclui 'skipped' do escape hatch).
  const patch: DeepPartial<BuilderState> = {
    calendar: {
      connectionId: payload.connectionId,
      status: payload.status,
    },
  }
  // O flip de `confirmations.calendar` acontece SEMPRE (inclusive no skip): é esse
  // sentinel que destrava o passo `calendar` em nextPendingStep, então o escape
  // hatch nunca prende o usuário — a jornada avança.
  const next = applyConfirmation(patchBuilderState(state, patch), 'calendar')

  // G10 — escape hatch: o usuário seguiu sem conectar a agenda. O agente deve
  // qualificar + avisar a equipe, NUNCA prometer agendamento.
  const normalizedStatus = (payload.status ?? '').trim().toLowerCase()
  if (CALENDAR_SKIPPED_STATUSES.has(normalizedStatus)) {
    return {
      next,
      cardInstruction:
        'O usuário optou por CONTINUAR SEM AGENDA (não conectou um calendário). ' +
        'NÃO prometa marcar horários nem confirme agendamentos: qualifique o lead e avise a equipe responsável para o contato humano dar sequência. ' +
        'Siga para o próximo passo da jornada. Não reabra o card de conexão de agenda (o usuário pode reconectar depois se quiser).',
    }
  }

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

/**
 * G1 — silenced_contacts: o usuário definiu (ou confirmou que não há) os contatos
 * que o agente NUNCA responde automaticamente. `contacts` é um array → o
 * deepMerge substitui a lista inteira (replace wholesale), que é o comportamento
 * desejado. `acknowledged` é sempre `true` no state (o sentinel real é
 * `confirmations.silencedContacts`, resolvido só aqui via applyConfirmation —
 * nunca lido do body). Passo OPCIONAL: lista vazia é válida.
 */
function applySilencedContacts(
  state: BuilderState,
  contacts: SilencedContactsPayload['contacts'],
): CardApplication {
  const clean = sanitizeSilencedContacts(contacts)
  const patch: DeepPartial<BuilderState> = {
    silencedContacts: { contacts: clean, acknowledged: true },
  }
  const next = applyConfirmation(
    patchBuilderState(state, patch),
    'silencedContacts',
  )

  const cardInstruction =
    clean.length === 0
      ? 'O usuário confirmou que não há contatos a silenciar — o agente pode responder todos. ' +
        'Siga para o próximo passo da jornada. Não reabra o card de contatos em silêncio.'
      : `O usuário definiu ${clean.length === 1 ? '1 contato' : `${clean.length} contatos`} que o agente NUNCA responde automaticamente (o humano responde essas pessoas no WhatsApp). ` +
        'Respeite esse silêncio no comportamento do agente e siga para o próximo passo. ' +
        'Não reabra o card de contatos em silêncio.'

  return { next, cardInstruction }
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
    case 'handoff_pairing':
      application = applyHandoffPairing(current, body)
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
    case 'silenced_contacts':
      // `acknowledged: true` is guaranteed by the Zod literal — replace the
      // silenced-contacts list wholesale + flip `silencedContacts`. Empty is OK.
      application = applySilencedContacts(current, body.contacts)
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
