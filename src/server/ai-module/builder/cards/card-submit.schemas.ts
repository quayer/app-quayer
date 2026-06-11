/**
 * Builder Module — Card-submit Zod contracts (Orayon Uplift, W2 — Stage 2)
 *
 * The card-action protocol replaces the old "approval-by-regex" flow: a card no
 * longer posts a synthetic user message that the LLM re-parses. Instead the FE
 * POSTs a typed payload to `/builder/projects/:id/cards/:cardKey/submit`, the
 * server applies the card's owned fields to `BuilderState` + flips the matching
 * confirmation sentinel, then streams the ACK turn over the SAME SSE wire.
 *
 * This file owns ONLY the request contracts. Persistence/validation lives in
 * `handlers/apply-card-submit.ts`; routing in `card-submit.routes.ts`.
 *
 * EXTENSIBILITY (W3): payload schemas live in a per-card REGISTRY keyed by
 * `cardKey`. W3 adds a new card by registering one entry — no edits to the
 * discriminated union, the param schema, or the handler dispatch shape. The
 * `cardKey` enum + the discriminated body union are both DERIVED from the
 * registry so they stay in lockstep automatically.
 *
 * Dependency-free beyond `zod`. No DB, no IO, no `any`.
 */

import { z } from 'zod'
import { CHANNEL_KEYS } from '../tools/select-channel.tool'

// ==========================================
// Channel enum (derived from select-channel.tool.ts CHANNEL_CATALOG)
// ==========================================

/**
 * The canonical channel keys the `channel` card may select. DERIVED from the
 * `CHANNEL_CATALOG` in `tools/select-channel.tool.ts` (the single source of
 * truth) and re-exported here so existing consumers keep their import path. The
 * handler RE-VALIDATES against the same list server-side — this enum is the
 * first gate, never the only one.
 */
export { CHANNEL_KEYS }
export const channelKeySchema = z.enum(CHANNEL_KEYS)
export type ChannelKey = z.infer<typeof channelKeySchema>

// ==========================================
// Per-card payload registry
// ==========================================

/**
 * agent_approval — user confirms the proposed agent (name + one-liner) so the
 * LLM may proceed with `create_agent`. The only action is an explicit confirm;
 * there is no client-supplied data to trust.
 */
export const agentApprovalPayloadSchema = z.object({
  cardKey: z.literal('agent_approval'),
  action: z.literal('confirm'),
})

/**
 * tool_selection — user multi-selects which capabilities/tools to attach.
 * `capabilityKeys` are the curated catalog ids; `toolKeys` are the underlying
 * BUILTIN_TOOL_NAMES. Both are RE-VALIDATED server-side (never trust the body).
 */
export const toolSelectionPayloadSchema = z.object({
  cardKey: z.literal('tool_selection'),
  action: z.literal('apply'),
  // Bounded: trusted client data, deduped (and re-validated against the curated
  // catalog) server-side. Cap list length + per-key length so a hostile body
  // can't balloon the JSONB column. Mirrors the other list/name bounds here.
  capabilityKeys: z
    .array(z.string().min(1).max(120))
    .max(64)
    .default([]),
  toolKeys: z
    .array(z.string().min(1).max(120))
    .max(64)
    .default([]),
})

/**
 * channel — user picks ONE messaging channel for deployment. `channelKey` is
 * re-validated against the channel catalog server-side.
 */
export const channelPayloadSchema = z.object({
  cardKey: z.literal('channel'),
  action: z.literal('select'),
  channelKey: channelKeySchema,
})

// ==========================================
// W3 cards — 11 new payload schemas (one per CARD CONTRACT)
// ==========================================

/**
 * agent_persona — user dials in the agent's voice (name/tone/style/greeting).
 * Every field optional so the card can submit a partial; owned fields land in
 * `builderState.persona.*`. → confirmation `persona`.
 *
 * Onda C (G7): `speechMode` (OPCIONAL) é o estilo de voz do passo A do wizard
 * (assistant | first_person | secretary). Espelha `personaStateSchema.speechMode`
 * 1:1; é additivo e não-bloqueante — o card pode submeter sem ele.
 */
export const agentPersonaPayloadSchema = z.object({
  cardKey: z.literal('agent_persona'),
  persona: z
    .object({
      name: z.string().min(1).max(120).optional(),
      tone: z.string().min(1).max(120).optional(),
      style: z.string().min(1).max(120).optional(),
      greeting: z.string().min(1).max(2000).optional(),
      speechMode: z.enum(['assistant', 'first_person', 'secretary']).optional(),
    })
    .default({}),
})

/**
 * services — user lists what the business DOES and does NOT offer. Both lists
 * are re-trimmed/deduped server-side. → `builderState.services.*` / `services`.
 */
export const servicesPayloadSchema = z.object({
  cardKey: z.literal('services'),
  offered: z.array(z.string().min(1)).default([]),
  notOffered: z.array(z.string().min(1)).default([]),
})

/**
 * business_hours — preset or manual weekly schedule. `schedule` is intentionally
 * opaque (`unknown`) — the card owns its serialization; the handler stores it
 * verbatim into `builderState.hours.schedule`. → confirmation `hours`.
 */
export const businessHoursPayloadSchema = z.object({
  cardKey: z.literal('business_hours'),
  preset: z.string().min(1).max(120).optional(),
  schedule: z.unknown(),
  timezone: z.string().min(1).max(120).optional(),
  // Onda 3d — comportamento FORA do horário (OPCIONAL, additivo): 'reply_notice'
  // (responde avisando) ou 'silent' (fica em silêncio). → builderState.hours.outOfHours.
  outOfHours: z.enum(['reply_notice', 'silent']).optional(),
})

/**
 * pricing — BRL price list stored in cents. `priceCents` is a non-negative int
 * (no floats/cents-as-reais drift); `currency` defaults to BRL. Items are
 * re-validated server-side. → `builderState.pricing.*` / `pricing`.
 */
export const pricingItemPayloadSchema = z.object({
  name: z.string().min(1).max(200),
  priceCents: z.number().int().nonnegative(),
  category: z.string().min(1).max(120).optional(),
  // G4 — teto OPCIONAL da faixa (priceCents é o piso). Só significativo quando o
  // `disclosureStyle` global for 'average'; o handler descarta caso contrário.
  priceMaxCents: z.number().int().nonnegative().optional(),
  // G5b — URL https da foto do serviço (catálogo visual). Vem do uploader (signed
  // URL do Storage) OU de uma URL colada — ambas chegam como string https.
  imageUrl: z.string().url().max(2000).optional(),
})

export const pricingPayloadSchema = z.object({
  cardKey: z.literal('pricing'),
  items: z.array(pricingItemPayloadSchema).default([]),
  currency: z.string().min(3).max(3).default('BRL'),
  // G4 — estilo de divulgação: como o AGENTE fala o preço. Global ao card.
  disclosureStyle: z
    .enum(['exact', 'from', 'average', 'none'])
    .default('exact'),
  // G5a — valor mínimo (min ticket) global, em centavos. Omitido quando não há.
  minTicketCents: z.number().int().nonnegative().optional(),
})

/**
 * Membro do roster (roleta), reusado pelo `handoff`. `position` é o índice no
 * rodízio; userId/name/whatsapp/connectionId opcionais. RE-validado server-side.
 */
export const teamMemberPayloadSchema = z.object({
  userId: z.string().min(1).optional(),
  name: z.string().min(1).max(200).optional(),
  // G6 — WhatsApp do membro (OPCIONAL). Limite curto: um telefone formatado/E.164
  // nunca passa de ~20 chars; 40 dá folga. RE-normalizado server-side no handler.
  whatsapp: z.string().min(1).max(40).optional(),
  // F0 (warm transfer) — Connection.id da instância própria do membro. Validado no
  // runtime (tenant-scoped, fail-open); aqui só transita como string.
  connectionId: z.string().min(1).max(80).optional(),
  position: z.number().int().nonnegative(),
})

/**
 * handoff (Onda 2) — FUSÃO de qualification_action + qualification_steps +
 * team_structure + handoff_pairing num único card. `mode` define o destino do
 * bastão (solo→routing self; roleta/departamentos→department; nenhum→sem handoff);
 * `alsoSchedule` é ORTOGONAL (gateia o card de calendário); `steps` é o roteiro de
 * qualificação; `members` o roster (com connectionId p/ warm transfer);
 * `openingMessage` a 1ª mensagem do warm transfer. → `builderState.handoff.*` /
 * confirmation `handoff`. Tudo RE-validado server-side.
 */
export const handoffPayloadSchema = z.object({
  cardKey: z.literal('handoff'),
  mode: z.enum(['solo', 'roleta', 'departamentos', 'nenhum']),
  alsoSchedule: z.boolean().default(false),
  steps: z.array(z.string().min(1)).default([]),
  departmentName: z.string().min(1).max(200).optional(),
  departmentType: z.string().min(1).max(120).optional(),
  members: z.array(teamMemberPayloadSchema).default([]),
  openingMessage: z.string().min(1).max(500).optional(),
})

/**
 * calendar_connect — mostly a poll/read of an OAuth connection the FE drives
 * elsewhere; the card just records the resulting id/status. The deploy saga
 * owns the real CalendarConnection. → `builderState.calendar.*` / `calendar`.
 */
export const calendarConnectPayloadSchema = z.object({
  cardKey: z.literal('calendar_connect'),
  connectionId: z.string().min(1).optional(),
  status: z.string().min(1).max(120).optional(),
})

/**
 * activation_mode — how the agent activates in a chat (mode enum string +
 * trigger keywords). Keywords re-trimmed/deduped server-side.
 * → `builderState.activation.*` / confirmation `activation`.
 */
export const activationModePayloadSchema = z.object({
  cardKey: z.literal('activation_mode'),
  mode: z.string().min(1).max(120),
  keywords: z.array(z.string().min(1)).default([]),
})

/**
 * preview_summary — the "Tudo certo?" deploy gate. Confirm-only: there is no
 * client data to trust, it just flips `summary`. → confirmation `summary`.
 */
export const previewSummaryPayloadSchema = z.object({
  cardKey: z.literal('preview_summary'),
})

/**
 * quick_reply_chips — a chosen chip routes as a NORMAL user turn (no sentinel).
 * The handler echoes `value` as the user's answer; it owns no builderState field.
 */
export const quickReplyChipsPayloadSchema = z.object({
  cardKey: z.literal('quick_reply_chips'),
  value: z.string().min(1).max(2000),
})

/**
 * source_progress — the "cole seu site/IG" acceptance gate. The async
 * `quayer:source-enrich` job writes only PROPOSED values into
 * `builderState.sourceIngestion.proposed`; this card's submit is where the user
 * ACCEPTS them (anti-hallucination: owned fields + `confirmations.source` flip
 * ONLY here, never from the synthesis job).
 *
 * `accept` is `z.literal(true)` — the only action is an explicit accept (a
 * "rejeitar/ignorar" never posts here; it just dismisses the card client-side).
 * `edited` is an OPTIONAL per-field override the user may tweak before accepting;
 * every field is optional so the card can submit only what changed. Absent
 * fields fall back to the stored `proposed` value at apply time. All free-text
 * lists are re-trimmed/deduped server-side (never trust the body).
 */
export const sourceProgressPayloadSchema = z.object({
  cardKey: z.literal('source_progress'),
  accept: z.literal(true),
  edited: z
    .object({
      businessName: z.string().min(1).max(200).optional(),
      services: z.array(z.string().min(1)).optional(),
      audience: z.string().min(1).max(2000).optional(),
      differentiators: z.array(z.string().min(1)).optional(),
      tone: z.string().min(1).max(120).optional(),
      // Onda E — identidade do negócio extraída da fonte (endereço completo +
      // descrição em 1-2 frases). No accept vão para `builderState.identity.*`.
      address: z.string().min(1).max(400).optional(),
      description: z.string().min(1).max(1000).optional(),
    })
    .optional(),
})

/**
 * G1 — silenced_contacts: a lista de contatos que o agente NUNCA responde
 * automaticamente (sócio, fornecedor, família). Cada item tem um `name` opcional
 * e um `whatsapp` obrigatório (RE-normalizado para E.164-BR server-side). A lista
 * é OPCIONAL: pode vir vazia. `acknowledged` é `z.literal(true)` — tanto
 * "confirmar" quanto "não tenho ninguém" reconhecem o passo (espelha o
 * `source_progress accept:true`). Cap de 50 itens contra balão da coluna JSONB.
 */
export const silencedContactItemPayloadSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  whatsapp: z.string().min(1).max(40),
})

export const silencedContactsPayloadSchema = z.object({
  cardKey: z.literal('silenced_contacts'),
  contacts: z.array(silencedContactItemPayloadSchema).max(50).default([]),
  acknowledged: z.literal(true),
})

/**
 * Jornada v2 (T19, FR-03) — business_identity: o usuário conta sobre o negócio
 * SEM colar uma fonte (nome + endereço + descrição). É o caminho ALTERNATIVO ao
 * accept do `source_progress` (que satisfaz a identidade pelo site/IG). `name` é
 * obrigatório (espelha `project.name`/`builder_projects.name`); `address` e
 * `description` são opcionais e têm lar canônico em `identity.*`. Todos
 * re-sanitizados (trim/clamp) server-side. → confirmation `businessIdentity`.
 */
export const businessIdentityPayloadSchema = z.object({
  cardKey: z.literal('business_identity'),
  name: z.string().min(1).max(80),
  address: z.string().min(1).max(300).optional(),
  description: z.string().min(1).max(500).optional(),
})

/**
 * Jornada v2 (T24, FR-05/FR-22) — agent_review: card COMPOSTO da fase Revisar que
 * funde persona + serviços + horários numa única confirmação consolidada (NFR-07:
 * 1 decisão obrigatória, 1 ACK turn em vez de 3). Reusa os MESMOS shapes dos cards
 * individuais (`persona` espelha `agentPersonaPayloadSchema.persona`; `offered`/
 * `notOffered` espelham `services`; `preset`/`schedule`/`timezone`/`outOfHours`
 * espelham `business_hours`) — o handler compõe os exports puros de
 * `handlers/apply/{persona,services,hours}.ts` num único write org-scoped.
 *
 * O bloco OPCIONAL `disclosure` (vindo da seção avançada — antiga IdentityTab) é
 * aplicado NO MESMO handler sobre `BuilderProject.metadata.identityCard` (1 POST
 * real, sem segundo request ao PATCH /builder/identity). `customText` só é
 * significativo quando `mode === 'custom'`; o lib normaliza/clamp server-side.
 *
 * O default de horários ("sempre aberto", decisão 3 da spec §9) vive no COMPONENTE
 * (T43), não aqui — `schedule` é opaco/`unknown` igual ao card individual.
 * → confirmations `persona` + `services` + `hours` (validação granular FR-22).
 */
export const agentReviewPayloadSchema = z.object({
  cardKey: z.literal('agent_review'),
  // Espelha agentPersonaPayloadSchema.persona (mesmos campos opcionais + clamps).
  persona: z
    .object({
      name: z.string().min(1).max(120).optional(),
      tone: z.string().min(1).max(120).optional(),
      style: z.string().min(1).max(120).optional(),
      greeting: z.string().min(1).max(2000).optional(),
      speechMode: z.enum(['assistant', 'first_person', 'secretary']).optional(),
    })
    .default({}),
  // Espelha servicesPayloadSchema (re-trim/dedupe server-side).
  offered: z.array(z.string().min(1)).default([]),
  notOffered: z.array(z.string().min(1)).default([]),
  // Espelha businessHoursPayloadSchema (`schedule` opaco — o card o serializa).
  preset: z.string().min(1).max(120).optional(),
  schedule: z.unknown(),
  timezone: z.string().min(1).max(120).optional(),
  outOfHours: z.enum(['reply_notice', 'silent']).optional(),
  // Seção avançada OPCIONAL (disclosure → metadata.identityCard, sem 2º request).
  disclosure: z
    .object({
      mode: z.enum(['ai_explicit', 'human_passthrough', 'custom']),
      customText: z.string().max(600).optional(),
    })
    .optional(),
})

/**
 * Registry of per-card payload schemas. ADD a card here (W3) and the cardKey
 * enum + discriminated union below pick it up automatically. Keyed by the
 * literal `cardKey` each schema carries in its discriminator field.
 */
export const CARD_PAYLOAD_SCHEMAS = {
  agent_approval: agentApprovalPayloadSchema,
  tool_selection: toolSelectionPayloadSchema,
  channel: channelPayloadSchema,
  agent_persona: agentPersonaPayloadSchema,
  services: servicesPayloadSchema,
  business_hours: businessHoursPayloadSchema,
  pricing: pricingPayloadSchema,
  handoff: handoffPayloadSchema,
  calendar_connect: calendarConnectPayloadSchema,
  activation_mode: activationModePayloadSchema,
  preview_summary: previewSummaryPayloadSchema,
  quick_reply_chips: quickReplyChipsPayloadSchema,
  source_progress: sourceProgressPayloadSchema,
  silenced_contacts: silencedContactsPayloadSchema,
  business_identity: businessIdentityPayloadSchema,
  agent_review: agentReviewPayloadSchema,
} as const

/** All currently-registered card keys (derived from the registry). */
export const CARD_KEYS = Object.keys(CARD_PAYLOAD_SCHEMAS) as [
  CardKey,
  ...CardKey[],
]

export type CardKey = keyof typeof CARD_PAYLOAD_SCHEMAS

// ==========================================
// Route param + body schemas
// ==========================================

/**
 * Path params for the submit route. `id` is the BuilderProject id (the route is
 * `/projects/:id/cards/:cardKey/submit`); `cardKey` must be a registered card.
 */
export const cardSubmitParamsSchema = z.object({
  id: z.string().uuid(),
  cardKey: z.enum(
    Object.keys(CARD_PAYLOAD_SCHEMAS) as [CardKey, ...CardKey[]],
  ),
})
export type CardSubmitParams = z.infer<typeof cardSubmitParamsSchema>

/**
 * Discriminated union over `cardKey` of every registered card payload. New
 * variants flow in from CARD_PAYLOAD_SCHEMAS without rewriting this line.
 */
export const cardSubmitBodySchema = z.discriminatedUnion('cardKey', [
  agentApprovalPayloadSchema,
  toolSelectionPayloadSchema,
  channelPayloadSchema,
  agentPersonaPayloadSchema,
  servicesPayloadSchema,
  businessHoursPayloadSchema,
  pricingPayloadSchema,
  handoffPayloadSchema,
  calendarConnectPayloadSchema,
  activationModePayloadSchema,
  previewSummaryPayloadSchema,
  quickReplyChipsPayloadSchema,
  sourceProgressPayloadSchema,
  silencedContactsPayloadSchema,
  businessIdentityPayloadSchema,
  agentReviewPayloadSchema,
])
export type CardSubmitBody = z.infer<typeof cardSubmitBodySchema>

// ==========================================
// Inferred per-card payload types (exported for handler/FE reuse)
// ==========================================

export type AgentApprovalPayload = z.infer<typeof agentApprovalPayloadSchema>
export type ToolSelectionPayload = z.infer<typeof toolSelectionPayloadSchema>
export type ChannelPayload = z.infer<typeof channelPayloadSchema>
export type AgentPersonaPayload = z.infer<typeof agentPersonaPayloadSchema>
export type ServicesPayload = z.infer<typeof servicesPayloadSchema>
export type BusinessHoursPayload = z.infer<typeof businessHoursPayloadSchema>
export type PricingItemPayload = z.infer<typeof pricingItemPayloadSchema>
export type PricingPayload = z.infer<typeof pricingPayloadSchema>
export type TeamMemberPayload = z.infer<typeof teamMemberPayloadSchema>
export type HandoffPayload = z.infer<typeof handoffPayloadSchema>
export type CalendarConnectPayload = z.infer<typeof calendarConnectPayloadSchema>
export type ActivationModePayload = z.infer<typeof activationModePayloadSchema>
export type PreviewSummaryPayload = z.infer<typeof previewSummaryPayloadSchema>
export type QuickReplyChipsPayload = z.infer<typeof quickReplyChipsPayloadSchema>
export type SourceProgressPayload = z.infer<typeof sourceProgressPayloadSchema>
export type SilencedContactItemPayload = z.infer<
  typeof silencedContactItemPayloadSchema
>
export type SilencedContactsPayload = z.infer<
  typeof silencedContactsPayloadSchema
>
export type BusinessIdentityPayload = z.infer<
  typeof businessIdentityPayloadSchema
>
export type AgentReviewPayload = z.infer<typeof agentReviewPayloadSchema>
