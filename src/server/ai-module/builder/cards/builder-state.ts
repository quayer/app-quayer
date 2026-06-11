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
  // Onda 3d — comportamento FORA do horário (OPCIONAL, additivo): `reply_notice`
  // = o agente responde avisando que está fora do horário; `silent` = fica em
  // silêncio até reabrir. Ausente = comportamento legado (default no frontend é
  // 'reply_notice'). `parseBuilderState` já preenche defaults — additivo é seguro.
  outOfHours: z.enum(['reply_notice', 'silent']).optional(),
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

/** A team member slot for the round-robin (roleta). Reusado por handoffStateSchema. */
export const teamMemberSchema = z.object({
  userId: z.string().optional(),
  name: z.string().optional(),
  // G6 — WhatsApp do membro (OPCIONAL, já normalizado para E.164-BR pelo handler).
  // É por esse número que o agente notifica a pessoa quando o lead cai no rodízio
  // dela. Coexiste com userId/name; uma linha só-nome (legado) continua válida.
  whatsapp: z.string().optional(),
  // F0 (warm transfer) — Connection.id da instância WhatsApp PRÓPRIA do membro
  // (pareada por QR). Quando presente, o handoff faz warm transfer: a conexão do
  // membro manda a 1ª mensagem ao cliente. Validado no runtime (tenant-scoped, fail-open).
  connectionId: z.string().optional(),
  position: z.number().int().nonnegative(),
})

/**
 * handoff card (Onda 2) — FUSÃO de qualification_action + qualification_steps +
 * team_structure + handoff_pairing num único card de 4 seções.
 *
 * Materializado no deploy: `solo`→routing self; `roleta`/`departamentos`→department;
 * `nenhum`→sem handoff. `alsoSchedule` é ORTOGONAL ao modo (qualquer modo pode também
 * agendar) e é quem gateia o card de calendário (no lugar do antigo action==='book_appointment').
 */
export const handoffModeSchema = z.enum([
  'solo',
  'roleta',
  'departamentos',
  'nenhum',
])

export const handoffStateSchema = z.object({
  mode: handoffModeSchema.optional(),
  alsoSchedule: z.boolean().default(false),
  // Roteiro de qualificação — perguntas antes de passar o bastão (era qualification.steps).
  steps: z.array(z.string()).default([]),
  departmentName: z.string().optional(),
  departmentType: z.string().optional(),
  members: z.array(teamMemberSchema).default([]),
  // Mensagem de abertura do warm transfer (era team.openingMessage). Vazio = default do warm-transfer.ts.
  openingMessage: z.string().optional(),
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
  synthesisStatus: z.enum(['pending', 'running', 'ready', 'error']).optional(),
  synthesisError: z.string().optional(),
  synthesisAttempts: z.number().int().nonnegative().optional(),
})

/** Proposed synthesis written by the source-enrich pipeline (anti-hallucination:
 *  these are PROPOSED only — owned fields/sentinels commit only via "Aceitar").
 *
 *  `address`/`description` (Onda E): endereço completo e descrição (1-2 frases)
 *  do negócio, extraídos APENAS quando fundamentados no texto da fonte (mesma
 *  regra anti-alucinação dos demais). No accept eles vão para `identity.*`. */
export const sourceProposalSchema = z.object({
  businessName: z.string().optional(),
  services: z.array(z.string()).optional(),
  audience: z.string().optional(),
  differentiators: z.array(z.string()).optional(),
  tone: z.string().optional(),
  address: z.string().optional(),
  description: z.string().optional(),
})

/** source_progress card → KnowledgeSource + builderState. */
export const sourceIngestionStateSchema = z.object({
  sources: z.array(sourceIngestionItemSchema).default([]),
  proposed: sourceProposalSchema.optional(),
})

/**
 * Integration Builder W1 (T06) — proposta de integração externa proposta na
 * conversa, espelhando o idiom de `sourceIngestion.proposed` (PROPOSED only).
 *
 * 🚨 CRÍTICO (NFR-03 transparência + segurança): VALORES de credenciais NUNCA
 * são gravados no builderState — esta subárvore guarda APENAS a proposta + uma
 * referência (`draftIntegrationId`) ao rascunho. As credenciais reais vivem
 * cifradas em `CustomIntegration.credentials`.
 */
export const integrationProposalSchema = z.object({
  platform: z.string(), // human label of the platform, e.g. "RD Station"
  templateSlug: z.string().optional(),
  triggerDescription: z.string().optional(), // when the agent uses it (natural language)
  whatDataSent: z.string().optional(), // plain-language: what data is sent (NFR-03 transparency)
  sources: z
    .array(z.object({ title: z.string().optional(), url: z.string() }))
    .optional(), // cited sources (investigator path, W3)
})

export const integrationStateSchema = z.object({
  proposed: integrationProposalSchema.optional(),
  draftIntegrationId: z.string().optional(),
})

/**
 * Identidade do negócio (Onda E) — campos OWNED sem card próprio: endereço físico
 * e descrição curta (1-2 frases) do negócio/empreendimento. Hoje são gravados
 * EXCLUSIVAMENTE pelo accept do `source_progress` (apply-card-submit), seguindo o
 * mesmo padrão anti-alucinação dos demais campos do proposal: a síntese só escreve
 * `sourceIngestion.proposed.{address,description}`; o flip para cá acontece no
 * "Aceitar" — coberto pelo sentinel existente `confirmations.source` (sem sentinel
 * novo: o passo source já gateia esses campos, e eles NUNCA gateiam a jornada).
 * Mudança 100% aditiva — `parseBuilderState` backfilla `{}` em states legados.
 */
export const identityStateSchema = z.object({
  address: z.string().optional(),
  description: z.string().optional(),
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

/**
 * Jornada v2 (T86, FR-24/25, plan §2.2 item 4) — canal em 2 níveis.
 *
 * `platforms` é a lista de canais escolhidos no card `channel_platform` (T91);
 * `whatsappMode` é o nível 2 do WhatsApp (QR pareado vs. Cloud API) — IG não tem
 * nível 2. A pré-seleção de modo vive na UI (T96), não no schema. O engine v2
 * (T15) lê `state.channel?.platforms` para surfar os passos de conexão de forma
 * condicional. 100% aditivo: states legados sem `channel` parseiam para undefined
 * (o namespace é OPCIONAL no top-level, sem default) e seguem válidos.
 */
export const channelStateSchema = z.object({
  platforms: z.array(z.enum(['whatsapp', 'instagram'])).optional(),
  whatsappMode: z.enum(['qr', 'cloud']).optional(),
})

/**
 * Jornada v2 (T06, FR-02, plan §2.2 item 2) — `capturedProposals` é a generalização
 * do invariante de `sourceIngestion.proposed`: valores PROPOSTOS por captura de conversa
 * (tool `propose_field_values`) ou por nicho regulado (`research-niche`), que NUNCA
 * flipam sentinels e só viram OWNED no submit do card correspondente (confirmação humana
 * obrigatória — o "configure por exceção"). O prefill dos cards lê
 * `capturedProposals.<domínio>` como fallback abaixo do owned confirmado (FR-02).
 *
 * Naming: `capturedProposals`, NÃO `proposals` — o state já tem `proposal` (singular,
 * nome/descrição do agente, linhas 29-32); um plural a um caractere de distância seria
 * armadilha de leitura/review.
 *
 * SEGURANÇA: cada domínio é um sub-schema FECHADO com max-lengths e o conjunto de
 * domínios é uma WHITELIST estrutural (chaves extras são descartadas pelo safeParse) —
 * o LLM nunca grava shape arbitrário. Limpeza no submit é remoção EXPLÍCITA via
 * `clearCapturedProposals` (o `deepMerge` de `patchBuilderState` ignora `undefined` e
 * nunca deleta chaves). 100% aditivo: states legados parseiam para `undefined`.
 */
const CAPTURED_TEXT_MAX = 300

export const capturedPersonaProposalSchema = z.object({
  name: z.string().max(CAPTURED_TEXT_MAX).optional(),
  tone: z.string().max(CAPTURED_TEXT_MAX).optional(),
  greeting: z.string().max(CAPTURED_TEXT_MAX).optional(),
})

export const capturedServicesProposalSchema = z.object({
  offered: z.array(z.string().max(CAPTURED_TEXT_MAX)).max(50).optional(),
})

export const capturedHoursProposalSchema = z.object({
  preset: z.string().max(CAPTURED_TEXT_MAX).optional(),
})

export const capturedPricingProposalSchema = z.object({
  items: z.array(pricingItemSchema).max(100).optional(),
})

export const capturedHandoffProposalSchema = z.object({
  mode: handoffModeSchema.optional(),
  // Justificativa da proposta por nicho regulado (research-niche.tool.ts → T26).
  reason: z.string().max(CAPTURED_TEXT_MAX).optional(),
})

export const capturedActivationProposalSchema = z.object({
  mode: z.string().max(CAPTURED_TEXT_MAX).optional(),
})

export const capturedProposalsSchema = z.object({
  persona: capturedPersonaProposalSchema.optional(),
  services: capturedServicesProposalSchema.optional(),
  hours: capturedHoursProposalSchema.optional(),
  pricing: capturedPricingProposalSchema.optional(),
  handoff: capturedHandoffProposalSchema.optional(),
  activation: capturedActivationProposalSchema.optional(),
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
  // Onda 2 — handoff unificado (modo + roster + roteiro + agenda). Substitui os
  // antigos qualificationAction / qualificationSteps / team / handoffPairing.
  handoff: z.boolean().default(false),
  calendar: z.boolean().default(false),
  activation: z.boolean().default(false),
  summary: z.boolean().default(false),
  source: z.boolean().default(false),
  // G1 — passo OPCIONAL: vira true quando o usuário confirma a lista de contatos
  // silenciados (mesmo vazia). Nunca bloqueia a jornada nem isDeployReady.
  silencedContacts: z.boolean().default(false),
  // ──────────────────────────────────────────────────────────────────────────
  // Jornada v2 (T05, plan §2.2 item 3 + §5) — 7 sentinels novos. Como TODOS os
  // sentinels deste schema, são resolvidos EXCLUSIVAMENTE server-side via
  // `applyConfirmation`: NUNCA chegam pelo body de uma request (o handler de
  // card-submit os ignora na entrada e só o passo correspondente os flipa).
  // Cada um default false → um state vazio/legado reporta "tudo pendente".
  // ──────────────────────────────────────────────────────────────────────────
  businessIdentity: z.boolean().default(false),
  testDrive: z.boolean().default(false),
  knowledge: z.boolean().default(false),
  media: z.boolean().default(false),
  publishedNextSteps: z.boolean().default(false),
  channelPlatform: z.boolean().default(false),
  // FR-30 — sentinel-ESPELHO de monotonicidade do WhatsApp: uma vez que uma
  // conexão UAZ foi estabelecida com sucesso, este flag fica true para sempre e
  // a jornada nunca regride o passo de conexão. Flipado fail-open pelo webhook
  // UAZ (T35, onda 5); como os demais, jamais vem do body.
  whatsappConnectedOnce: z.boolean().default(false),
})

// ==========================================
// Top-level BuilderState
// ==========================================

export const builderStateSchema = z.object({
  // Jornada v2 (plan §2.2 item 1) — chave de rollout POR PROJETO, carregada no
  // próprio BuilderState (sem coluna nova em BuilderProject): o engine puro já
  // consome o state e a query ops de convergência é viável via JSONB
  // (`builderState->>'journeyVersion'`). Seedada na criação/duplicação do
  // projeto; `parseBuilderState` backfilla legados para 1. Additivo e seguro.
  journeyVersion: z.union([z.literal(1), z.literal(2)]).default(1),
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
  handoff: handoffStateSchema.default({
    alsoSchedule: false,
    steps: [],
    members: [],
  }),
  calendar: calendarStateSchema.default({}),
  activation: activationStateSchema.default({ keywords: [] }),
  sourceIngestion: sourceIngestionStateSchema.default({ sources: [] }),
  // Integration Builder W1 (T06, plan §2) — proposta de integração externa.
  // OPCIONAL e SEM default: states legados/vazios parseiam para `integration:
  // undefined` (mantém válidos) e o subtree fica AUSENTE até W2 escrever. NÃO é
  // um passo de jornada (sem ConfirmationKey, sem QUAYER_STEPS). 🚨 NUNCA guarda
  // valores de credenciais — só proposta + draftIntegrationId (ref ao rascunho);
  // credenciais reais vivem cifradas em CustomIntegration.credentials.
  integration: integrationStateSchema.optional(),
  // Onda E — identidade do negócio (address/description) gravada no accept do
  // source_progress. Additivo: legados parseiam para {}.
  identity: identityStateSchema.default({}),
  // G1 — contatos silenciados (passo OPCIONAL). Default vazio + não-reconhecido.
  silencedContacts: silencedContactsStateSchema.default({
    contacts: [],
    acknowledged: false,
  }),
  // T86 — canal em 2 níveis (FR-24/25). OPCIONAL e SEM default: um state vazio/
  // legado parseia para `channel: undefined`; o engine v2 lê `state.channel?.platforms`.
  channel: channelStateSchema.optional(),
  // T06 — propostas capturadas da conversa (FR-02). OPCIONAL e SEM default: um state
  // vazio/legado parseia para `capturedProposals: undefined`. NUNCA flipa sentinels;
  // o prefill dos cards lê isto como fallback e o submit limpa via `clearCapturedProposals`.
  capturedProposals: capturedProposalsSchema.optional(),
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
export type TeamMember = z.infer<typeof teamMemberSchema>
export type HandoffMode = z.infer<typeof handoffModeSchema>
export type HandoffState = z.infer<typeof handoffStateSchema>
export type CalendarState = z.infer<typeof calendarStateSchema>
export type ActivationState = z.infer<typeof activationStateSchema>
export type SourceIngestionItem = z.infer<typeof sourceIngestionItemSchema>
export type SourceProposal = z.infer<typeof sourceProposalSchema>
export type SourceIngestionState = z.infer<typeof sourceIngestionStateSchema>
export type IdentityState = z.infer<typeof identityStateSchema>
export type SilencedContactItem = z.infer<typeof silencedContactItemSchema>
export type SilencedContactsState = z.infer<typeof silencedContactsStateSchema>
export type ChannelState = z.infer<typeof channelStateSchema>
export type CapturedProposals = z.infer<typeof capturedProposalsSchema>
/** Whitelist de domínios de `capturedProposals` — o que `clearCapturedProposals` aceita. */
export type CapturedProposalDomain = keyof CapturedProposals
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

/**
 * T06 (FR-02) — Remove a proposta capturada de UM domínio, retornando um NOVO state.
 * É uma deleção EXPLÍCITA por spread porque o `deepMerge` de `patchBuilderState` ignora
 * `undefined` e NUNCA apaga chaves — confiar no patch para "limpar" deixaria a proposta
 * confirmada zumbi no JSONB e re-aparecendo como badge "sugerido da conversa". Os cards
 * (business_identity, agent_review, etc.) chamam isto no submit, depois que o valor vira
 * owned. Pura, nunca muta o input. No-op quando o namespace/domínio já está ausente —
 * e quando o namespace fica vazio, ele é removido por inteiro (sem `{}` órfão).
 */
export function clearCapturedProposals(
  state: BuilderState,
  domain: CapturedProposalDomain
): BuilderState {
  if (state.capturedProposals?.[domain] === undefined) return state
  // Spread sem a chave do domínio (deleção real, não merge).
  const { [domain]: _removed, ...rest } = state.capturedProposals
  const hasRemaining = Object.values(rest).some((v) => v !== undefined)
  if (!hasRemaining) {
    // Namespace esvaziou: remove `capturedProposals` por inteiro (sem `{}` órfão).
    const { capturedProposals: _drop, ...stateRest } = state
    return stateRest
  }
  return { ...state, capturedProposals: rest }
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
 * Onda 2 — migra estado legado (qualification/team + sentinels antigos) para o
 * `handoff` unificado, ANTES do safeParse (que descartaria os campos antigos).
 * Pura, nunca lança. Retorna o input inalterado quando já está no novo formato
 * ou não há nada legado a migrar.
 *
 * Mapeamento (spec Q1-Q3): notify_team → roleta se há membros, senão solo;
 * book_appointment → solo + alsoSchedule; lead_only → solo. Preserva steps,
 * roster e openingMessage; herda a confirmação para a jornada NÃO re-exibir o passo.
 */
export function migrateLegacyHandoff(raw: unknown): unknown {
  if (!isPlainObject(raw)) return raw
  if (isPlainObject(raw.handoff)) return raw // já no novo formato

  const qualification = isPlainObject(raw.qualification)
    ? raw.qualification
    : undefined
  const team = isPlainObject(raw.team) ? raw.team : undefined
  if (!qualification && !team) return raw // nada legado a migrar

  const action =
    qualification && typeof qualification.action === 'string'
      ? qualification.action
      : undefined
  const members: unknown[] =
    team && Array.isArray(team.members) ? (team.members as unknown[]) : []
  const hasMembers = members.length > 0

  let mode: string | undefined
  if (action === 'notify_team') mode = hasMembers ? 'roleta' : 'solo'
  else if (action === 'book_appointment' || action === 'lead_only') mode = 'solo'

  const handoff: Record<string, unknown> = {
    alsoSchedule: action === 'book_appointment',
    steps:
      qualification && Array.isArray(qualification.steps)
        ? (qualification.steps as unknown[])
        : [],
    members,
  }
  if (mode) handoff.mode = mode
  if (team && typeof team.departmentName === 'string') {
    handoff.departmentName = team.departmentName
  }
  if (team && typeof team.departmentType === 'string') {
    handoff.departmentType = team.departmentType
  }
  if (team && typeof team.openingMessage === 'string') {
    handoff.openingMessage = team.openingMessage
  }

  const conf = isPlainObject(raw.confirmations) ? raw.confirmations : {}
  const handoffConfirmed =
    conf.qualificationAction === true ||
    conf.qualificationSteps === true ||
    conf.team === true ||
    conf.handoffPairing === true

  // Descarta os campos legados; safeParse já remove as confirmations antigas.
  const next: Record<string, unknown> = { ...raw }
  delete next.qualification
  delete next.team
  next.handoff = handoff
  next.confirmations = { ...conf, handoff: handoffConfirmed }
  return next
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

  // Onda 2 — migra estado legado (qualification/team → handoff) antes do parse.
  const migrated = migrateLegacyHandoff(candidate)

  // safeParse fills every missing field via the schema defaults, so a partial
  // legacy object is upgraded rather than rejected.
  const result = builderStateSchema.safeParse(migrated)
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
