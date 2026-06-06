/**
 * Builder Module — Canonical BuilderState (Orayon Uplift, W2 foundation)
 *
 * Single deterministic source of truth for a Builder conversation. Holds every
 * card-owned field plus the `*_confirmed` sentinels that the step-engine reads
 * to compute `nextPendingStep`. Persisted as `BuilderProjectConversation.builderState`
 * (JSONB, nullable — legacy rows lazily backfill to DEFAULT_BUILDER_STATE).
 *
 * This file is imported by BOTH server (state engine, card-submit handler) and
 * frontend (card descriptors). Keep it dependency-free: only `zod` + TS. No DB,
 * no IO, no `any`.
 *
 * Contract: spec docs/builder/ORAYON_UPLIFT_SPEC.md (card catalog + decisions).
 */

import { z } from 'zod'

// ==========================================
// Leaf schemas (grouped by domain area)
// ==========================================

/** Project identity gathered from the very first turns. */
export const projectStateSchema = z.object({
  name: z.string().optional(),
  objective: z.string().optional(),
})

/** Agent proposal (name + one-liner) approved via agent_approval card. */
export const proposalStateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
})

/** agent_persona card → AIAgentConfig.
 *
 * Onda C (G7): `speechMode` (OPCIONAL) é o estilo de voz escolhido no passo A do
 * wizard de persona (assistant | first_person | secretary). Dirige o template
 * DETERMINÍSTICO de "Sugerir nova" saudação no frontend e dá contexto à copy.
 * É opcional em todo lugar e NUNCA gateia o passo `persona` (o sentinel já o faz).
 */
export const personaStateSchema = z.object({
  name: z.string().optional(),
  tone: z.string().optional(),
  style: z.string().optional(),
  greeting: z.string().optional(),
  speechMode: z.enum(['assistant', 'first_person', 'secretary']).optional(),
})

/** services_oferece_nao card → prompt. */
export const servicesStateSchema = z.object({
  offered: z.array(z.string()).default([]),
  notOffered: z.array(z.string()).default([]),
})

/** business_hours card → builderState (presets + manual schedule). */
export const hoursStateSchema = z.object({
  preset: z.string().optional(),
  // Free-form weekly schedule shape (card owns its serialization). Kept opaque
  // here so the card can evolve without churning the canonical type.
  schedule: z.unknown().optional(),
  timezone: z.string().optional(),
})

/**
 * A single pricing line item (BRL stored in cents).
 *
 * Onda B additions:
 *  - `priceMaxCents` (G4) — OPTIONAL ceiling of a range. `priceCents` is the FLOOR
 *    (min); when the global `disclosureStyle === 'average'` the agent says
 *    "entre R$ {priceCents} e R$ {priceMaxCents}". Only meaningful for 'average';
 *    the handler drops it otherwise so the JSONB never holds a stray ceiling.
 *  - `imageUrl` (G5b) — OPTIONAL https URL of the service photo (visual catalog).
 *    Resolved by EITHER the multipart uploader (Supabase signed URL) OR a pasted
 *    URL; both land here as a validated https string.
 */
export const pricingItemSchema = z.object({
  name: z.string(),
  priceCents: z.number().int().nonnegative(),
  category: z.string().optional(),
  priceMaxCents: z.number().int().nonnegative().optional(),
  imageUrl: z.string().url().max(2000).optional(),
})

/**
 * pricing card → PriceList + PriceItem.
 *
 * Onda B additions:
 *  - `disclosureStyle` (G4) — how the AGENT speaks the price: exact / from /
 *    average (range) / none. Global to the card (not per item). Default 'exact'.
 *  - `minTicketCents` (G5a) — OPTIONAL global minimum ticket ("tem valor mínimo?")
 *    in cents; omitted when there is none.
 */
export const pricingStateSchema = z.object({
  items: z.array(pricingItemSchema).default([]),
  currency: z.string().default('BRL'),
  disclosureStyle: z
    .enum(['exact', 'from', 'average', 'none'])
    .default('exact'),
  minTicketCents: z.number().int().nonnegative().optional(),
})

/** qualification_action card → deploy gate; qualification_steps → prompt. */
export const qualificationStateSchema = z.object({
  action: z.enum(['notify_team', 'book_appointment', 'lead_only']).optional(),
  steps: z.array(z.string()).default([]),
})

/** A team member slot for the round-robin (roleta). */
export const teamMemberSchema = z.object({
  userId: z.string().optional(),
  name: z.string().optional(),
  // G6 — WhatsApp do membro (OPCIONAL, já normalizado para E.164-BR pelo handler).
  // É por esse número que o agente notifica a pessoa quando o lead cai no rodízio
  // dela. Coexiste com userId/name; uma linha só-nome (legado) continua válida.
  whatsapp: z.string().optional(),
  position: z.number().int().nonnegative(),
})

/** team_structure card → Department + DepartmentMember. */
export const teamStateSchema = z.object({
  departmentName: z.string().optional(),
  departmentType: z.string().optional(),
  members: z.array(teamMemberSchema).default([]),
})

/** calendar_connect card → CalendarConnection. */
export const calendarStateSchema = z.object({
  connectionId: z.string().optional(),
  status: z.string().optional(),
})

/** activation_mode card → AIAgentConfig (mode enum + keywords). */
export const activationStateSchema = z.object({
  mode: z.string().optional(),
  keywords: z.array(z.string()).default([]),
})

/** A single "paste your site/IG" source being ingested.
 *
 * Onda D (G2 visão/imagens): `imagesStatus`/`imagesCount` são um ESPELHO LEVE do
 * catálogo visual extraído da fonte. Ambos OPCIONAIS (default undefined): D1 só
 * estende o schema (mudança 100% aditiva — não quebra states legados nem o
 * DEFAULT_BUILDER_STATE); a ESCRITA fica em D2 (patchSourceIngestionAtomic
 * estendido). As imagens em si vivem na tabela `knowledge_images`, não aqui. */
export const sourceIngestionItemSchema = z.object({
  value: z.string(),
  type: z.enum(['url', 'instagram']),
  status: z.string(),
  sourceId: z.string().optional(),
  imagesStatus: z.enum(['pending', 'running', 'ready', 'error']).optional(),
  imagesCount: z.number().int().nonnegative().optional(),
})

/** Proposed synthesis written by the source-enrich pipeline (anti-hallucination:
 *  these are PROPOSED only — owned fields/sentinels commit only via "Aceitar"). */
export const sourceProposalSchema = z.object({
  businessName: z.string().optional(),
  services: z.array(z.string()).optional(),
  audience: z.string().optional(),
  differentiators: z.array(z.string()).optional(),
  tone: z.string().optional(),
})

/** source_progress card → KnowledgeSource + builderState. */
export const sourceIngestionStateSchema = z.object({
  sources: z.array(sourceIngestionItemSchema).default([]),
  proposed: sourceProposalSchema.optional(),
})

/**
 * G1 — um único contato silenciado: o nome é opcional (livre), o `whatsapp` é o
 * número canônico em E.164-BR (resolvido server-side pelo handler). É a lista de
 * pessoas que o agente NUNCA responde automaticamente (sócio, fornecedor, família).
 */
export const silencedContactItemSchema = z.object({
  name: z.string().optional(),
  whatsapp: z.string(),
})

/**
 * G1 — silenced_contacts card → builderState. `acknowledged` registra que o passo
 * (OPCIONAL) foi reconhecido, tanto via "confirmar" quanto via "não tenho ninguém"
 * (lista vazia é válida, espelha o source_progress accept:true).
 */
export const silencedContactsStateSchema = z.object({
  contacts: z.array(silencedContactItemSchema).default([]),
  acknowledged: z.boolean().default(false),
})

// ==========================================
// Confirmation sentinels (server-resolved booleans)
// ==========================================

/**
 * The `*_confirmed` flags the step-engine consumes. NEVER trust a value coming
 * from a request body — these are resolved server-side per organizationId.
 * Each defaults to false so an empty/legacy state reports "everything pending".
 */
export const confirmationsSchema = z.object({
  agentApproved: z.boolean().default(false),
  tools: z.boolean().default(false),
  channel: z.boolean().default(false),
  persona: z.boolean().default(false),
  services: z.boolean().default(false),
  hours: z.boolean().default(false),
  pricing: z.boolean().default(false),
  qualificationAction: z.boolean().default(false),
  qualificationSteps: z.boolean().default(false),
  team: z.boolean().default(false),
  calendar: z.boolean().default(false),
  activation: z.boolean().default(false),
  summary: z.boolean().default(false),
  source: z.boolean().default(false),
  // G1 — passo OPCIONAL: vira true quando o usuário confirma a lista de contatos
  // silenciados (mesmo vazia). Nunca bloqueia a jornada nem isDeployReady.
  silencedContacts: z.boolean().default(false),
})

// ==========================================
// Top-level BuilderState
// ==========================================

export const builderStateSchema = z.object({
  project: projectStateSchema.default({}),
  proposal: proposalStateSchema.default({}),
  selectedCapabilityKeys: z.array(z.string()).default([]),
  selectedToolKeys: z.array(z.string()).default([]),
  selectedChannelKey: z.string().optional(),
  persona: personaStateSchema.default({}),
  services: servicesStateSchema.default({ offered: [], notOffered: [] }),
  hours: hoursStateSchema.default({}),
  pricing: pricingStateSchema.default({
    items: [],
    currency: 'BRL',
    disclosureStyle: 'exact',
  }),
  qualification: qualificationStateSchema.default({ steps: [] }),
  team: teamStateSchema.default({ members: [] }),
  calendar: calendarStateSchema.default({}),
  activation: activationStateSchema.default({ keywords: [] }),
  sourceIngestion: sourceIngestionStateSchema.default({ sources: [] }),
  // G1 — contatos silenciados (passo OPCIONAL). Default vazio + não-reconhecido.
  silencedContacts: silencedContactsStateSchema.default({
    contacts: [],
    acknowledged: false,
  }),
  confirmations: confirmationsSchema.default({}),
})

// ==========================================
// Types
// ==========================================

export type ProjectState = z.infer<typeof projectStateSchema>
export type ProposalState = z.infer<typeof proposalStateSchema>
export type PersonaState = z.infer<typeof personaStateSchema>
export type ServicesState = z.infer<typeof servicesStateSchema>
export type HoursState = z.infer<typeof hoursStateSchema>
export type PricingItem = z.infer<typeof pricingItemSchema>
export type PricingState = z.infer<typeof pricingStateSchema>
export type QualificationState = z.infer<typeof qualificationStateSchema>
export type TeamMember = z.infer<typeof teamMemberSchema>
export type TeamState = z.infer<typeof teamStateSchema>
export type CalendarState = z.infer<typeof calendarStateSchema>
export type ActivationState = z.infer<typeof activationStateSchema>
export type SourceIngestionItem = z.infer<typeof sourceIngestionItemSchema>
export type SourceProposal = z.infer<typeof sourceProposalSchema>
export type SourceIngestionState = z.infer<typeof sourceIngestionStateSchema>
export type SilencedContactItem = z.infer<typeof silencedContactItemSchema>
export type SilencedContactsState = z.infer<typeof silencedContactsStateSchema>
export type BuilderConfirmations = z.infer<typeof confirmationsSchema>
export type BuilderState = z.infer<typeof builderStateSchema>

/** Confirmation sentinel keys — the canonical names cards/engine reference. */
export type ConfirmationKey = keyof BuilderConfirmations

// ==========================================
// DEFAULT_BUILDER_STATE
// ==========================================

/**
 * Fully-resolved empty state. Built by parsing `{}` through the schema so the
 * defaults stay in lockstep with the Zod definitions (single source).
 * Deep-frozen to prevent accidental shared-reference mutation.
 */
export const DEFAULT_BUILDER_STATE: BuilderState = deepFreeze(
  builderStateSchema.parse({})
)

// ==========================================
// Pure helpers (no IO, no `any`)
// ==========================================

/**
 * Mark a single confirmation sentinel as true, returning a NEW state.
 * Pure — never mutates the input.
 */
export function applyConfirmation(
  state: BuilderState,
  key: ConfirmationKey
): BuilderState {
  return {
    ...state,
    confirmations: { ...state.confirmations, [key]: true },
  }
}

/** Recursive partial used by patchBuilderState. */
export type DeepPartial<T> = T extends ReadonlyArray<unknown>
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  )
}

// Operates on `unknown` (no inference from the patch) so the recursive types
// stay sound; the single cast happens at the patchBuilderState boundary.
function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    // Arrays and primitives are replaced wholesale (last-write-wins).
    return patch === undefined ? base : patch
  }

  const out: Record<string, unknown> = { ...base }
  for (const [key, patchValue] of Object.entries(patch)) {
    if (patchValue === undefined) continue
    const baseValue = base[key]
    if (isPlainObject(baseValue) && isPlainObject(patchValue)) {
      out[key] = deepMerge(baseValue, patchValue)
    } else {
      out[key] = patchValue
    }
  }
  return out
}

/**
 * Deep-merge a partial into the state, returning a NEW state. Plain objects are
 * merged recursively; arrays and scalars are replaced wholesale. Pure.
 */
export function patchBuilderState(
  state: BuilderState,
  partial: DeepPartial<BuilderState>
): BuilderState {
  return deepMerge(state, partial) as BuilderState
}

/**
 * Coerce any persisted JSON (including null/undefined or a partial legacy row)
 * into a fully-resolved BuilderState. MUST NEVER THROW — on any failure it
 * backfills to DEFAULT_BUILDER_STATE. Accepts a JSON string or a parsed value.
 */
export function parseBuilderState(json: unknown): BuilderState {
  if (json === null || json === undefined) {
    return cloneDefault()
  }

  let candidate: unknown = json
  if (typeof json === 'string') {
    try {
      candidate = JSON.parse(json)
    } catch {
      return cloneDefault()
    }
  }

  // safeParse fills every missing field via the schema defaults, so a partial
  // legacy object is upgraded rather than rejected.
  const result = builderStateSchema.safeParse(candidate)
  return result.success ? result.data : cloneDefault()
}

// ==========================================
// Internal utilities
// ==========================================

function cloneDefault(): BuilderState {
  // DEFAULT_BUILDER_STATE is frozen — hand back a writable parse() copy so
  // callers can freely patch the result.
  return builderStateSchema.parse({})
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
    Object.freeze(value)
  }
  return value
}
