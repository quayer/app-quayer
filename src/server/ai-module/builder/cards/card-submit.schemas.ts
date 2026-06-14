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
import { conversationBlueprintEditableSchema } from '../playbook/blueprint.schema'

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
  name: z.string().min(3).max(80).optional(),
  description: z.string().min(20).max(800).optional(),
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
 * Jornada v2 (T31, plan §3.3) — knowledge/media acks: cartões da fase Revisar que
 * o usuário usa para RECONHECER explicitamente o passo opcional de base de
 * conhecimento / catálogo de mídia (espelha o padrão `silenced_contacts`/
 * `source_progress`: a única ação é um `'ack'`). Os steps `knowledge`/`media`
 * também são satisfeitos por dados REAIS (fonte/texto ingerido, imagesCount > 0)
 * sem card obrigatório — o ack é só o caminho "não vou anexar nada, seguir".
 *
 * Cada um flipa o sentinel server-side homônimo (`confirmations.knowledge` /
 * `confirmations.media`) via `applyConfirmation` — nunca pelo body. São toggles
 * leves: entram na allowlist de silent-submit (T90), então o flip persiste sem
 * turno LLM. NÃO entram no `cardSubmitBodySchema` (a união consumida pelo
 * `applyCardSubmit`); o `card-submit.routes.ts` os despacha para handlers próprios
 * em `handlers/apply/journey-v2.ts` (que possuem o write org-scoped) — assim o
 * exhaustiveness guard do entrypoint segue intocado.
 */
export const knowledgeAckPayloadSchema = z.object({
  cardKey: z.literal('knowledge'),
  action: z.literal('ack'),
})

export const mediaAckPayloadSchema = z.object({
  cardKey: z.literal('media'),
  action: z.literal('ack'),
})

/**
 * FR-PRO-01 (F1 — Mensagens proativas, design-time) — proactive: o toggle
 * SILENCIOSO da CAPACIDADE "Mensagens proativas" da seção Capacidades (FR-43). NÃO
 * é um card de jornada (sem `action`, sem ACK conversacional) — é um toggle como
 * handoff/pricing/calendar: entra em `SILENT_ALLOWED_CARD_KEYS` e persiste sem
 * turno LLM (FR-29). Os 3 presets em linguagem de negócio (FR-49) são booleans com
 * default `false` (capacidade opt-in, desligada por padrão). Despachado por handler
 * próprio (`apply/journey-v2.ts:applyProactive`) via `card-submit.routes.ts`, FORA
 * da união do entrypoint (exhaustiveness guard intocado, igual aos acks T31). F1 só
 * recomenda+persiste — NENHUM envio (runtime F2-F4 é épico próprio). →
 * `builderState.proactive` (subtree, SEM sentinel — é capacidade, não passo).
 */
export const proactivePayloadSchema = z.object({
  cardKey: z.literal('proactive'),
  followUp: z.boolean().default(false),
  reminders: z.boolean().default(false),
  importantDates: z.boolean().default(false),
})

/**
 * Integration Builder (W2) — integration_proposal: the user CONFIRMS the
 * proposed integration. Confirm-only, exactly like `agent_approval`: there is no
 * client-supplied data to trust. The proposal itself (which integration, scopes,
 * config) lives in `builderState` server-side and is NEVER read from the body.
 * Like the T31 acks, this is registered in the map (so `CARD_KEYS`/the param enum
 * recognize the route) but its dispatch lives outside `applyCardSubmit`'s union.
 */
export const integrationProposalPayloadSchema = z.object({
  cardKey: z.literal('integration_proposal'),
  action: z.literal('confirm'),
})

/**
 * Integration Builder (W2) — integration_credentials: field-by-field credential
 * values the user fills for the chosen integration. `values` is an opaque
 * string→string map (e.g. `{ apiKey: '...', accountSid: '...' }`); the handler
 * ENCRYPTS each value before persistence and they are NEVER stored in
 * `builderState`. Registered in the map only (dispatch outside the entrypoint
 * union), same as the T31 acks.
 */
export const integrationCredentialsPayloadSchema = z.object({
  cardKey: z.literal('integration_credentials'),
  values: z.record(z.string(), z.string()),
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
 * Jornada v3 (mission-first — mission-first-v3.md, FR-37/FR-48) — mission: o
 * usuário escolhe a MISSÃO do agente numa ÚNICA decisão (card de JORNADA com ACK
 * conversacional, igual a `business_identity` — entra na união do entrypoint, NÃO
 * é silent). `key` é o bundle escolhido (obrigatório); `label` é o rótulo humano
 * em linguagem de negócio (FR-49); `role`/`objective` são a resolução INTERNA
 * (strings — o handler mapeia para os enums fechados do funil); `addons` são as
 * capacidades extras ligadas na escolha; `custom` marca o caminho "montar do zero".
 * Tudo RE-sanitizado server-side (trim/clamp/dedupe). → `builderState.mission` /
 * confirmation `mission`.
 */
export const missionPayloadSchema = z.object({
  cardKey: z.literal('mission'),
  key: z.string().min(1).max(120),
  label: z.string().max(160).optional(),
  role: z.string().max(60).optional(),
  objective: z.string().max(60).optional(),
  // Cap de 12 add-ons (cada um curto) contra balão da coluna JSONB; re-trim/dedupe
  // server-side no handler. Default [] espelha `missionStateSchema.addons`.
  addons: z.array(z.string().min(1).max(60)).max(12).default([]),
  custom: z.boolean().optional(),
})

/**
 * Jornada v3 (mission-first — FR-39/FR-49) — build_mode: o usuário escolhe COMO
 * quer construir o agente numa ÚNICA decisão (card de JORNADA com ACK conversacional,
 * igual a `mission`/`business_identity` — entra na união do entrypoint, NÃO é silent).
 * `mode` é uma escolha entre 3 valores em linguagem de negócio (FR-49):
 *   - 'recomendado' (default, pré-selecionado no card) → "Montar direto com boas práticas".
 *   - 'pesquisa' → "Pesquisar antes de sugerir".
 *   - 'livre' → "Quero orientar a montagem".
 * Sem dado livre a confiar além do enum. → `builderState.buildMode` /
 * confirmation `buildMode`.
 */
export const buildModePayloadSchema = z.object({
  cardKey: z.literal('build_mode'),
  mode: z.enum(['recomendado', 'pesquisa', 'livre']),
})

/**
 * FR-44 (critérios de qualificação — backlog #10) — qualification: o usuário
 * escolhe (multi-seleção) QUAIS dados o agente coleta de cada contato para
 * considerar o atendimento bom (nome, prazo de compra, faixa de orçamento, etc.).
 * Card de JORNADA com ACK conversacional (entra na união do entrypoint, igual a
 * mission/business_identity). `fields` é a lista de campos escolhidos — bounded
 * (cap 24 itens, cada um curto) e RE-trim/dedupe/clamp server-side. Pode vir vazia
 * (o usuário confirma sem marcar nada). → `builderState.qualification` /
 * confirmation `qualification`.
 */
export const qualificationPayloadSchema = z.object({
  cardKey: z.literal('qualification'),
  fields: z.array(z.string().min(1).max(120)).max(24).default([]),
})

/**
 * FR-44 (restrições comerciais — backlog #3) — restrictions: o usuário escolhe COMO
 * o agente trata uma fonte que aparece 100% vendida/esgotada. Card de JORNADA com
 * ACK conversacional (entra na união do entrypoint, igual a qualification/mission).
 * `soldOutStrategy` espelha o enum de `SoldOutConversationStrategy` (designer-input.ts)
 * — a MESMA decisão que a v2 tomava inline no `conversation_blueprint.contextDecision`.
 * `note` é uma observação livre opcional do usuário (clampada server-side). →
 * `builderState.restrictions` / confirmation `restrictions`.
 */
export const restrictionsPayloadSchema = z.object({
  cardKey: z.literal('restrictions'),
  soldOutStrategy: z.enum([
    'interest_list',
    'human_confirm',
    'available_confirmed',
  ]),
  note: z.string().min(1).max(300).optional(),
})

/**
 * FR-46 (diagnóstico do Modo Pesquisa — backlog #9) — diagnosis: card READ-MOSTLY
 * da fase Conhecer (surge DEPOIS de build_mode/source e ANTES de mission, quando
 * `buildMode === 'pesquisa'`). É um ACK puro, igual a `published_next_steps`/
 * `knowledge`/`media`: a única ação é `'ack'` e flipa `confirmations.diagnosis`
 * server-side. NÃO há dado do client a confiar — o card só EXIBE o que já sabemos
 * do negócio (derivado do builderState) e o usuário reconhece para seguir.
 * DEGRADAÇÃO GRACIOSA (FR-47): mesmo sem pesquisa externa, o card mostra o que há.
 * Card de JORNADA com ACK conversacional (entra na união do entrypoint, igual a
 * test_drive/business_identity — NÃO é silent). → confirmation `diagnosis`.
 */
export const diagnosisPayloadSchema = z.object({
  cardKey: z.literal('diagnosis'),
  action: z.literal('ack'),
})

/**
 * Jornada v2 (T32, plan §3.3 item 3) — test_drive: gate SOFT da fase Testar. O
 * usuário ou TESTOU o agente (`'tested'`) ou optou por PUBLICAR SEM TESTAR
 * (`'skip'`). Ambas as ações flipam o MESMO sentinel `confirmations.testDrive`
 * (o passo é satisfeito), mas o handler ramifica a copy do ACK e o evento de
 * funil: `tested` → `test_done`, `skip` → `test_skipped` (o LLM NUNCA promete
 * que validou — plan §3.3). Não há dado do client a confiar além da ação.
 * → confirmation `testDrive`.
 */
export const testDrivePayloadSchema = z.object({
  cardKey: z.literal('test_drive'),
  action: z.enum(['tested', 'skip']),
})

/**
 * Jornada v2 (T32/T91, FR-24/25, plan §3.3 item 5) — channel_platform: card da
 * fase Lançar que define EM QUE canais o agente vai atender. `platforms` é a
 * lista (mín. 1) de plataformas escolhidas; `whatsappMode` é o nível 2 do
 * WhatsApp (QR pareado vs. Cloud API) — IG não tem nível 2.
 *
 * O cross-field refine (`whatsappMode` obrigatório quando `platforms` inclui
 * `'whatsapp'`) vive em `channelPlatformRefine`/`channelPlatformSubmitSchema`
 * abaixo — NÃO no schema do registry: `z.discriminatedUnion` (zod 3) exige
 * `ZodObject`s crus com discriminador literal e REJEITA o `ZodEffects` que um
 * `.refine()` produz. Por isso o objeto cru entra na união (discriminação por
 * `cardKey`) e o handler RE-VALIDA o refine server-side (nunca confia no body
 * — o padrão deste módulo). Pós-5b, o contrato aceita 1 ou 2 plataformas.
 * A UI pré-seleciona
 * `'qr'` (T96). O handler grava `channel.platforms`+`channel.whatsappMode` e
 * flipa `channelPlatform`; o engine v2 (T15) lê `platforms` para surfar os
 * passos de conexão condicionalmente.
 * → confirmation `channelPlatform`.
 */
export const channelPlatformPayloadSchema = z.object({
  cardKey: z.literal('channel_platform'),
  platforms: z.array(z.enum(['whatsapp', 'instagram'])).min(1),
  whatsappMode: z.enum(['qr', 'cloud']).optional(),
})

/**
 * Cross-field invariant do `channel_platform` (FR-24/25): `whatsappMode` é
 * obrigatório sempre que `'whatsapp'` está entre as plataformas. Função PURA
 * exportada para o handler (`apply/journey-v2.ts`) re-validar server-side e para
 * o `channelPlatformSubmitSchema` (refine standalone, p/ tipagem/FE).
 */
export function channelPlatformWhatsappModeOk(p: {
  platforms: readonly ('whatsapp' | 'instagram')[]
  whatsappMode?: 'qr' | 'cloud'
}): boolean {
  return !p.platforms.includes('whatsapp') || p.whatsappMode !== undefined
}

/**
 * Versão com refine do `channel_platform` (não entra em nenhuma união — só para
 * uso standalone/tipagem do FE). O `safeParse` do route usa o objeto cru e o
 * handler chama `channelPlatformWhatsappModeOk` para o mesmo efeito server-side.
 */
export const channelPlatformSubmitSchema = channelPlatformPayloadSchema.refine(
  channelPlatformWhatsappModeOk,
  {
    message: 'whatsappMode é obrigatório quando WhatsApp está entre as plataformas',
    path: ['whatsappMode'],
  },
)

/**
 * Jornada v2 (T32, FR-16, plan §3.3) — published_next_steps: card TERMINAL da
 * fase Lançar (surfa só pós-publicação). A única ação é um `'ack'` informativo
 * (mesmo padrão dos acks `knowledge`/`media`): flipa `confirmations.publishedNextSteps`
 * e emite o evento de funil `next_steps_ack`. Sem dado do client a confiar.
 * → confirmation `publishedNextSteps`.
 */
export const publishedNextStepsPayloadSchema = z.object({
  cardKey: z.literal('published_next_steps'),
  action: z.literal('ack'),
})

/**
 * Jornada v2 (T24, FR-05/FR-22) — agent_review: card COMPOSTO da fase Revisar que
 * funde persona + serviços + horários + aprovação de criação numa única confirmação
 * consolidada (NFR-07: 1 decisão obrigatória, 1 ACK turn em vez de 4). Reusa os MESMOS shapes dos cards
 * individuais (`persona` espelha `agentPersonaPayloadSchema.persona`; `offered`/
 * `notOffered` espelham `services`; `preset`/`schedule`/`timezone`/`outOfHours`
 * espelham `business_hours`) — o handler compõe os exports puros de
 * `handlers/apply/{persona,services,hours}.ts` num único write org-scoped.
 *
 * O bloco OPCIONAL `disclosure` (vindo da seção avançada de identidade) é
 * aplicado NO MESMO handler sobre `BuilderProject.metadata.identityCard` (1 POST
 * real, sem segundo request ao PATCH /builder/identity). `customText` só é
 * significativo quando `mode === 'custom'`; o lib normaliza/clamp server-side.
 *
 * O default de horários ("sempre aberto", decisão 3 da spec §9) vive no COMPONENTE
 * (T43), não aqui — `schedule` é opaco/`unknown` igual ao card individual.
 * O handler também deriva/preserva `proposal.{name,description}` e flipa
 * `confirmations.agentApproved`, removendo a necessidade de um segundo card
 * `agent_approval` no fluxo v2 normal.
 * → confirmations `persona` + `services` + `hours` + `agentApproved` (validação granular FR-22).
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
 * Builder Playbook — conversation_blueprint: card que aprova o roteiro
 * conversacional antes do prompt final. `generate` cria uma proposta quando o
 * active-step card aparece vazio; `approve` carrega o blueprint editado pelo
 * usuário. O handler normaliza/valida server-side, grava `status: approved` e
 * carimba `approvedAt`. Não há sentinel novo: o engine v2 lê
 * `builderState.conversationBlueprint.status === 'approved'`.
 *
 * Mantemos um único `ZodObject` porque a união externa é discriminada por
 * `cardKey`; unions internas aqui quebrariam a montagem do registry em Zod 3.
 */
export const conversationBlueprintContextDecisionSchema = z.object({
  kind: z.literal('sold_out'),
  strategy: z.enum(['interest_list', 'human_confirm', 'available_confirmed']),
  note: z.string().min(1).max(300).optional(),
})

export const conversationBlueprintPayloadSchema = z.object({
  cardKey: z.literal('conversation_blueprint'),
  action: z.enum(['generate', 'approve']),
  blueprint: conversationBlueprintEditableSchema.optional(),
  contextDecision: conversationBlueprintContextDecisionSchema.optional(),
})

/**
 * Builder Playbook — refinement: ação determinística para rodar o Refinando a
 * partir do active-step card. Diferente de cards de confirmação, este payload
 * não flipa sentinel; o handler executa o pipeline `runProjectRefinement` e
 * grava `builderState.refinement`.
 */
export const refinementPayloadSchema = z.object({
  cardKey: z.literal('refinement'),
  action: z.literal('run'),
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
  // T117 (mission-first v3) — card de JORNADA com ACK conversacional, despachado
  // pelo switch do `applyCardSubmit` (está na união do entrypoint), igual a
  // business_identity.
  mission: missionPayloadSchema,
  // FR-39 (mission-first v3) — card de JORNADA com ACK conversacional, despachado
  // pelo switch do `applyCardSubmit` (está na união do entrypoint), igual a mission.
  build_mode: buildModePayloadSchema,
  // FR-44 — critérios de qualificação. Card de JORNADA com ACK conversacional,
  // despachado pelo switch do `applyCardSubmit` (está na união do entrypoint),
  // igual a mission/build_mode.
  qualification: qualificationPayloadSchema,
  // FR-44 (backlog #3) — restrições comerciais. Card de JORNADA com ACK
  // conversacional, despachado pelo switch do `applyCardSubmit` (está na união do
  // entrypoint), igual a qualification.
  restrictions: restrictionsPayloadSchema,
  // FR-46 (backlog #9) — diagnóstico do Modo Pesquisa. Card READ-MOSTLY de ACK,
  // despachado pelo switch do `applyCardSubmit` (está na união do entrypoint),
  // igual a test_drive/business_identity.
  diagnosis: diagnosisPayloadSchema,
  conversation_blueprint: conversationBlueprintPayloadSchema,
  agent_review: agentReviewPayloadSchema,
  // T32/T91 — cards das fases Testar/Lançar. Despachados pelo switch do
  // `applyCardSubmit` (estão na união do entrypoint), com ACK conversacional.
  test_drive: testDrivePayloadSchema,
  channel_platform: channelPlatformPayloadSchema,
  published_next_steps: publishedNextStepsPayloadSchema,
  // R09 — Refinando: registrado aqui para que `CARD_KEYS` reconheça o card; o
  // despacho vive no `card-submit.routes.ts` em handler próprio, fora do union do
  // entrypoint, porque executa o pipeline determinístico de validação.
  refinement: refinementPayloadSchema,
  // T31 — acks dos passos opcionais Conhecimento/Mídia. Registrados aqui para que
  // `CARD_KEYS`/`cardSubmitParamsSchema` reconheçam os cardKeys da rota; o despacho
  // vive no `card-submit.routes.ts` (handlers próprios), fora do `applyCardSubmit`.
  knowledge: knowledgeAckPayloadSchema,
  media: mediaAckPayloadSchema,
  // Integration Builder (W2) — confirm + credential cards. Registrados aqui para
  // que `CARD_KEYS`/`cardSubmitParamsSchema` reconheçam os cardKeys da rota; o
  // despacho vive em handlers próprios (fora do `applyCardSubmit`), igual aos
  // acks T31 — assim o exhaustiveness guard do entrypoint segue intocado.
  integration_proposal: integrationProposalPayloadSchema,
  integration_credentials: integrationCredentialsPayloadSchema,
  // FR-PRO-01 (F1) — toggle SILENCIOSO da capacidade "Mensagens proativas".
  // Registrado aqui para que `CARD_KEYS`/`cardSubmitParamsSchema` reconheçam o
  // cardKey da rota; o despacho vive no `card-submit.routes.ts` (handler próprio
  // `applyProactive`), fora da união do entrypoint, igual aos acks T31.
  proactive: proactivePayloadSchema,
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
 * Discriminated union over `cardKey` of the cards dispatched by `applyCardSubmit`.
 *
 * INTENTIONALLY does NOT list `refinement`/`knowledge`/`media`: those are routed
 * directly by `card-submit.routes.ts` to their own handlers, so the entrypoint's
 * exhaustiveness guard (`const _never: never = body`) stays valid without editing
 * it. The ROUTE accepts them via `cardSubmitRouteBodySchema` below (the wider
 * parse gate).
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
  missionPayloadSchema,
  buildModePayloadSchema,
  qualificationPayloadSchema,
  restrictionsPayloadSchema,
  diagnosisPayloadSchema,
  conversationBlueprintPayloadSchema,
  agentReviewPayloadSchema,
  testDrivePayloadSchema,
  channelPlatformPayloadSchema,
  publishedNextStepsPayloadSchema,
])
export type CardSubmitBody = z.infer<typeof cardSubmitBodySchema>

// ==========================================
// Silent-submit (T90, FR-29) — ackMode + route body + allowlist
// ==========================================

/**
 * FR-29 — modo de ACK do card-submit. `conversational` (default) mantém o
 * comportamento atual: aplica o estado E transmite o turno do meta-agente pela
 * SSE. `silent` aplica o estado e responde JSON simples (`{ ok, builderState }`)
 * SEM `ensureBuilderAgent`/`buildSseResponse` — zero turno/custo LLM. É o modo
 * OBRIGATÓRIO dos toggles da superfície de Capacidades (plan §4.3).
 */
export const ackModeSchema = z
  .enum(['conversational', 'silent'])
  .default('conversational')
export type AckMode = z.infer<typeof ackModeSchema>

/**
 * Esquema TOP-LEVEL para extrair só o `ackMode` do corpo (parse independente do
 * payload do card — `ackMode` não é discriminador). `.passthrough()` deixa o
 * restante do corpo intocado; o card em si é validado pelo `cardSubmitRouteBodySchema`.
 */
export const cardSubmitAckEnvelopeSchema = z
  .object({ ackMode: ackModeSchema })
  .passthrough()

/**
 * Allowlist SERVER-SIDE de cardKeys que aceitam `ackMode: 'silent'` (T90/plan §4.3 +
 * §5): os toggles da superfície de Capacidades. Qualquer card da JORNADA com
 * `silent` é rejeitado com 400 — o ACK conversacional é parte do contrato da
 * jornada e não pode ser pulado. `knowledge`/`media` são opt-in leves (acks), então
 * entram aqui junto de handoff/pricing/calendar/tool_selection.
 */
export const SILENT_ALLOWED_CARD_KEYS: ReadonlySet<string> = new Set<string>([
  'handoff',
  'pricing',
  'calendar_connect',
  'tool_selection',
  'knowledge',
  'media',
  // FR-PRO-01 (F1) — toggle silencioso da capacidade "Mensagens proativas" (FR-29:
  // persiste sem turno LLM, como os demais toggles de Capacidades).
  'proactive',
])

/**
 * Payload de card aceito pela ROTA: a união do `applyCardSubmit` MAIS os acks
 * `knowledge`/`media` (T31). É o gate de parse do `card-submit.routes.ts` — mais
 * largo que `cardSubmitBodySchema` (que o entrypoint consome). Discriminado por
 * `cardKey`; o `ackMode` é o único campo extra preservado no parse da rota para
 * não ser removido pelo validator do Igniter antes do handler.
 */
const cardSubmitRoutePayloadSchema = z.discriminatedUnion('cardKey', [
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
  missionPayloadSchema,
  buildModePayloadSchema,
  qualificationPayloadSchema,
  restrictionsPayloadSchema,
  diagnosisPayloadSchema,
  conversationBlueprintPayloadSchema,
  refinementPayloadSchema,
  agentReviewPayloadSchema,
  testDrivePayloadSchema,
  channelPlatformPayloadSchema,
  publishedNextStepsPayloadSchema,
  knowledgeAckPayloadSchema,
  mediaAckPayloadSchema,
  // Integration Builder (W2) — confirm + credential cards, despachados por
  // handler próprio (`apply-integration-cards.ts`) via `card-submit.routes.ts`,
  // fora da união do entrypoint (exhaustiveness guard intocado, igual T31).
  integrationProposalPayloadSchema,
  integrationCredentialsPayloadSchema,
  // FR-PRO-01 (F1) — toggle silencioso da capacidade "Mensagens proativas",
  // despachado por handler próprio (`apply/journey-v2.ts:applyProactive`) via
  // `card-submit.routes.ts`, fora da união do entrypoint (igual aos acks T31).
  proactivePayloadSchema,
])

const cardSubmitRouteAckSchema = z.object({
  ackMode: ackModeSchema.optional(),
})

export const cardSubmitRouteBodySchema = z.intersection(
  cardSubmitRoutePayloadSchema,
  cardSubmitRouteAckSchema,
)
export type CardSubmitRouteBody = z.infer<typeof cardSubmitRouteBodySchema>

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
export type MissionPayload = z.infer<typeof missionPayloadSchema>
export type BuildModePayload = z.infer<typeof buildModePayloadSchema>
export type QualificationPayload = z.infer<typeof qualificationPayloadSchema>
export type RestrictionsPayload = z.infer<typeof restrictionsPayloadSchema>
export type DiagnosisPayload = z.infer<typeof diagnosisPayloadSchema>
export type ConversationBlueprintPayload = z.infer<
  typeof conversationBlueprintPayloadSchema
>
export type RefinementPayload = z.infer<typeof refinementPayloadSchema>
export type AgentReviewPayload = z.infer<typeof agentReviewPayloadSchema>
export type TestDrivePayload = z.infer<typeof testDrivePayloadSchema>
export type ChannelPlatformPayload = z.infer<
  typeof channelPlatformPayloadSchema
>
export type PublishedNextStepsPayload = z.infer<
  typeof publishedNextStepsPayloadSchema
>
export type KnowledgeAckPayload = z.infer<typeof knowledgeAckPayloadSchema>
export type MediaAckPayload = z.infer<typeof mediaAckPayloadSchema>
export type IntegrationProposalPayload = z.infer<
  typeof integrationProposalPayloadSchema
>
export type IntegrationCredentialsPayload = z.infer<
  typeof integrationCredentialsPayloadSchema
>
export type ProactivePayload = z.infer<typeof proactivePayloadSchema>
