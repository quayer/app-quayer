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
  invalidateRefinement,
  type BuilderState,
  type DeepPartial,
} from '../builder-state'
import {
  CHANNEL_KEYS,
  type CardSubmitBody,
  type ChannelKey,
  type AgentApprovalPayload,
} from '../card-submit.schemas'
import { trackJourneyEvent } from '@/server/services/journey-events'
import {
  applyBusinessIdentity,
  applyMission,
  applyBuildMode,
  applyQualification,
  applyRestrictions,
  applyDiagnosis,
  applyConversationBlueprint,
  generateConversationBlueprintFromCard,
  applyAgentReview,
  applyTestDrive,
  applyChannelPlatform,
  applyPublishedNextSteps,
} from './apply/journey-v2'
// W3 (Revisar) per-card handlers extracted from this entrypoint (T22 split):
// pure `(state, payload) => CardApplication` mirrors of the former locals.
import { applyAgentPersona } from './apply/persona'
import { applyServices } from './apply/services'
import { applyBusinessHours } from './apply/hours'
import { applyChannel } from './apply/channel'
import { applyHandoff } from './apply/handoff'
import { applyPricing } from './apply/pricing'
import { applyCalendarConnect } from './apply/calendar'
import { applyActivationMode } from './apply/activation'
import { applyPreviewSummary } from './apply/preview-summary'
import { applyQuickReplyChips } from './apply/quick-reply'
import { applySourceProgress } from './apply/source-progress'
import { applySilencedContacts } from './apply/silenced-contacts'
// Integration Builder (W2, T24) — the two integration cards own their write
// (encrypt + CustomIntegration.credentials + test) OUTSIDE this switch, same as
// the T31 knowledge/media acks. They are NOT in `CardSubmitBody`, so the branch
// below dispatches them BEFORE the union switch (keeping the exhaustiveness guard
// intact). 🚨 No credential value ever reaches builderState / the ACK turn.
import { applyIntegrationCard } from './apply-integration-cards'
import type {
  IntegrationProposalPayload,
  IntegrationCredentialsPayload,
} from '../card-submit.schemas'

export { applyPricing } from './apply/pricing'

// ---------------------------------------------------------------------------
// Args / result
// ---------------------------------------------------------------------------

export interface ApplyCardSubmitArgs {
  /** BuilderProject id (the route `:id`). */
  projectId: string
  /** Tenant boundary — the caller's currentOrgId. */
  organizationId: string
  /**
   * Already-validated card payload. Discriminated on cardKey: the union switch
   * handles `CardSubmitBody`; the two integration cards (W2, T24) are dispatched
   * to their own handler BEFORE the switch (they own their write — encrypt +
   * CustomIntegration.credentials + test — and never touch builderState).
   */
  body: CardSubmitBody | IntegrationProposalPayload | IntegrationCredentialsPayload
  /**
   * Acting user id — stamped as `createdById`/`requestedById` by the integration
   * card handlers (W2, T24). Optional so the existing journey/Revisar cards (which
   * never need it) keep their call sites untouched.
   */
  userId?: string
}

/**
 * Granular per-section validation errors for the composite `agent_review` card
 * (T24/FR-22). When a section fails, the handler returns these instead of a
 * monolithic card error and performs NO partial write — the client (T43)
 * preserves the local state of the valid sections and highlights only the
 * failing one. Carried on the `invalid` failure variant so the existing route
 * (which maps `invalid → badRequest(message)`) stays untouched while the client
 * reads the structured `errors`.
 */
export interface AgentReviewSectionErrors {
  persona?: string
  services?: string
  hours?: string
}

export type ApplyCardSubmitResult =
  | { ok: true; cardInstruction: string; conversationId: string }
  | {
      ok: false
      reason: 'not_found' | 'forbidden' | 'invalid'
      message: string
      /** Granular per-section errors (agent_review/FR-22) — no partial write. */
      errors?: AgentReviewSectionErrors
    }

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

const REFINEMENT_INVALIDATING_CARDS = new Set<string>([
  'agent_approval',
  'tool_selection',
  'channel',
  'agent_persona',
  'services',
  'business_hours',
  'pricing',
  'handoff',
  'calendar_connect',
  'activation_mode',
  'source_progress',
  'silenced_contacts',
])

function maybeInvalidateRefinementForCard(
  state: BuilderState,
  cardKey: string,
): BuilderState {
  if (!REFINEMENT_INVALIDATING_CARDS.has(cardKey)) return state
  return invalidateRefinement(
    state,
    `O card ${cardKey} alterou o contexto testado pelo refinamento.`,
  )
}

/**
 * Trim, drop empties, and dedupe a free-text string list (order-preserving).
 * Transversal helper re-imported by extracted apply handlers
 * (services/handoff/activation/source). Single source of truth.
 */
export function sanitizeStringList(values: readonly string[]): string[] {
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

/**
 * Porta SERVER-SIDE de `phone-br.ts normalizeBrPhone` (G6/G1): normaliza um
 * telefone brasileiro digitado livre para E.164 (`+55DDDNNNNNNNN`) SEM depender
 * de DOM. Mantém PARIDADE EXATA com a normalização do frontend (mesma regex de
 * validação `^\+\d{10,15}$`) para que FE e BE concordem sobre o que é um número
 * válido. Só retorna um número quando há confiança na forma; caso contrário
 * `undefined` — telefone é OPCIONAL, então simplesmente o omitimos.
 *
 * Exported as a transversal helper re-imported by extracted apply handlers
 * (handoff/silenced_contacts). Single source of truth.
 */
export function normalizeWhatsappBr(raw: string | undefined): string | undefined {
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

// ---------------------------------------------------------------------------
// Per-card application — returns the next state + the ACK instruction
// ---------------------------------------------------------------------------

/**
 * The result of applying a card to the builder state: the next state + the pt-BR
 * ACK note that seeds the LLM turn. Exported so the extracted per-card handlers
 * (`apply/*.ts`, T22 split) share one canonical shape.
 */
export interface CardApplication {
  next: BuilderState
  cardInstruction: string
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : undefined
}

function applyAgentApproval(
  state: BuilderState,
  payload: Pick<AgentApprovalPayload, 'name' | 'description'>,
): CardApplication {
  const name = cleanText(payload.name) ?? cleanText(state.proposal.name)
  const description =
    cleanText(payload.description) ?? cleanText(state.proposal.description)
  const patched =
    name || description
      ? patchBuilderState(state, {
          proposal: {
            ...(name ? { name } : {}),
            ...(description ? { description } : {}),
          },
        })
      : state
  const next = applyConfirmation(patched, 'agentApproved')
  const proposalNote =
    name || description
      ? ` Proposta aprovada: ${[
          name ? `nome "${name}"` : null,
          description ? `descrição "${description}"` : null,
        ]
          .filter(Boolean)
          .join(', ')}.`
      : ''
  return {
    next,
    cardInstruction:
      'O usuário CONFIRMOU a criação do agente proposto pelo card de aprovação. ' +
      (proposalNote ? `${proposalNote} ` : '') +
      'Prossiga com create_agent usando o nome e a descrição aprovados — não peça nova confirmação. ' +
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

  // Integration Builder (W2, T24) — the two integration cards DIVERT from the
  // generic builderState patch: their handler does its own org-scoped write
  // (encrypt + CustomIntegration.credentials + validation test) and NEVER touches
  // builderState with a credential value. They are not part of `CardSubmitBody`,
  // so dispatch them here (org ownership already proven above) before the union
  // switch — mirrors how the route routes the T31 knowledge/media acks.
  if (
    body.cardKey === 'integration_proposal' ||
    body.cardKey === 'integration_credentials'
  ) {
    return applyIntegrationCard(
      {
        projectId,
        organizationId,
        conversationId: conversation.id,
        // The route always threads the acting user for integration cards.
        userId: args.userId ?? '',
      },
      body,
    )
  }

  // null/garbage/partial → DEFAULT_BUILDER_STATE (never throws).
  const current = parseBuilderState(conversation.builderState)

  let application: CardApplication
  switch (body.cardKey) {
    case 'agent_approval':
      application = applyAgentApproval(current, body)
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
    case 'handoff':
      application = applyHandoff(current, body)
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
      // T20 (FR-03) — a fonte aceita SATISFAZ a identidade do negócio (caminho
      // equivalente ao card business_identity). Fire-and-forget, nunca lança.
      await trackJourneyEvent({
        organizationId,
        projectId,
        journeyVersion: current.journeyVersion,
        event: 'identity_done',
      })
      break
    case 'silenced_contacts':
      // `acknowledged: true` is guaranteed by the Zod literal — replace the
      // silenced-contacts list wholesale + flip `silencedContacts`. Empty is OK.
      application = applySilencedContacts(current, body.contacts)
      break
    case 'business_identity':
      // Journey v2 (T19/FR-03): owns its OWN transactional write (builderState +
      // builder_projects.name mirror) and emits `identity_done`. Return early —
      // the generic write below is for the pure (state) => application handlers.
      return applyBusinessIdentity({
        conversationId: conversation.id,
        projectId,
        organizationId,
        current,
        payload: body,
      })
    case 'mission':
      // Jornada v3 (mission-first/T117/FR-37/FR-48): card de JORNADA com ACK
      // conversacional. Own write transacional org-scoped (substitui o subtree
      // builderState.mission + flipa `mission`) e emite `mission_selected`.
      // Return early — o write genérico abaixo é para os handlers puros (state)=>app.
      return applyMission({
        conversationId: conversation.id,
        projectId,
        organizationId,
        current,
        payload: body,
      })
    case 'build_mode':
      // Jornada v3 (mission-first/FR-39): card de JORNADA com ACK conversacional.
      // Own write transacional org-scoped (grava o escalar builderState.buildMode +
      // flipa `buildMode`); SEM evento de funil. Return early — o write genérico
      // abaixo é para os handlers puros (state)=>application.
      return applyBuildMode({
        conversationId: conversation.id,
        projectId,
        organizationId,
        current,
        payload: body,
      })
    case 'qualification':
      // FR-44 (critérios de qualificação): card de JORNADA com ACK conversacional.
      // Own write transacional org-scoped (substitui o subtree builderState.qualification
      // + flipa `qualification`); SEM evento de funil. Return early — o write genérico
      // abaixo é para os handlers puros (state)=>application.
      return applyQualification({
        conversationId: conversation.id,
        projectId,
        organizationId,
        current,
        payload: body,
      })
    case 'restrictions':
      // FR-44 (restrições comerciais — backlog #3): card de JORNADA com ACK
      // conversacional. Own write transacional org-scoped (substitui o subtree
      // builderState.restrictions + flipa `restrictions`); SEM evento de funil. A
      // decisão gravada também destrava o gate do conversation_blueprint. Return
      // early — o write genérico abaixo é para os handlers puros (state)=>application.
      return applyRestrictions({
        conversationId: conversation.id,
        projectId,
        organizationId,
        current,
        payload: body,
      })
    case 'diagnosis':
      // FR-46 (diagnóstico do Modo Pesquisa — backlog #9): card READ-MOSTLY de ACK.
      // Own write transacional org-scoped (flipa `diagnosis` via applySentinelAck,
      // com guarda NFR-12 missionFirst); SEM evento de funil. Return early — o write
      // genérico abaixo é para os handlers puros (state)=>application.
      return applyDiagnosis({
        projectId,
        organizationId,
        current,
      })
    case 'conversation_blueprint':
      // Builder Playbook: generate proposed route or approve it before prompt
      // generation. Own write — return early.
      if (body.action === 'generate') {
        return generateConversationBlueprintFromCard({
          conversationId: conversation.id,
          projectId,
          organizationId,
          userId: args.userId,
          current,
          contextDecision: body.contextDecision,
        })
      }
      if (!body.blueprint) {
        return {
          ok: false,
          reason: 'invalid',
          message: 'Plano de atendimento é obrigatório para aprovação.',
        }
      }
      return applyConversationBlueprint({
        conversationId: conversation.id,
        organizationId,
        current,
        payload: {
          blueprint: body.blueprint,
          contextDecision: body.contextDecision,
        },
      })
    case 'agent_review':
      // Journey v2 (T24/FR-05/FR-22): composite card. Owns its OWN transactional
      // write (persona+services+hours+agentApproved in 1 updateMany + optional
      // disclosure on metadata.identityCard), clears capturedProposals, and emits
      // `review_done`.
      // Granular per-section validation → no partial write. Return early.
      return applyAgentReview({
        conversationId: conversation.id,
        projectId,
        organizationId,
        current,
        payload: body,
      })
    case 'test_drive':
      // Journey v2 (T32/FR-16): soft gate da fase Testar. Flipa `testDrive` e
      // emite test_done/test_skipped por ação. Own write — return early.
      return applyTestDrive({
        projectId,
        organizationId,
        journeyVersion: current.journeyVersion,
        payload: body,
      })
    case 'channel_platform':
      // Journey v2 (T91/FR-24/25/26): grava channel.platforms+whatsappMode,
      // aceita 1 ou 2 plataformas e flipa channelPlatform. Own write.
      return applyChannelPlatform({
        conversationId: conversation.id,
        organizationId,
        current,
        payload: body,
      })
    case 'published_next_steps':
      // Journey v2 (T32/FR-16): card terminal pós-publicação. Flipa
      // `publishedNextSteps` e emite next_steps_ack. Own write — return early.
      return applyPublishedNextSteps({
        projectId,
        organizationId,
        journeyVersion: current.journeyVersion,
      })
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
  const nextState = maybeInvalidateRefinementForCard(application.next, body.cardKey)

  await database.builderProjectConversation.updateMany({
    where: { id: conversation.id, organizationId },
    data: { builderState: nextState as unknown as Prisma.InputJsonValue },
  })

  return {
    ok: true,
    conversationId: conversation.id,
    cardInstruction: application.cardInstruction,
  }
}
