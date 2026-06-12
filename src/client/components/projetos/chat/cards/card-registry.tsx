"use client"

/**
 * Builder Cards — Card Registry (Orayon Uplift, W3 Wire)
 *
 * Source of truth that maps each new W3 `CardKey` to the React component that
 * renders it, plus the journey `stepId` (StepId) the card advances, a header
 * title, and a lucide icon. Mirrors the `tab-registry.tsx` idiom (centralized
 * descriptor table + lookup helpers) so chat-panel never grows an if-chain per
 * card.
 *
 * The pinned ACTIVE-STEP slot in chat-panel reads `readiness.step.id`
 * (a `StepId` from the deterministic step-engine) and resolves the card to show
 * via {@link getCardForStep}. Direct lookup by key uses {@link getCardDescriptor}.
 *
 * CARD DRIVE MODES — four ways a card reaches the screen:
 *  1. ACTIVE-STEP-DRIVEN (8 cards): resolved by `getCardForStep` from the
 *     step-engine. Each carries a `stepId` and appears in {@link STEP_TO_CARD}:
 *     `agent_persona`, `services`, `business_hours`, `pricing`, `handoff`
 *     (Onda 2 — fusão de qualification + team + handoff_pairing),
 *     `calendar_connect`, `activation_mode`, `preview_summary`, plus
 *     `source_progress` (→ `source_ingestion`) and `silenced_contacts` (both
 *     OPTIONAL steps). They are the only descriptors `getCardForStep` may return.
 *  2. REOPENED (FR-17, jornada-builder-v2): "Ajustar" on a `preview_summary`
 *     section resolves that section's card BY KEY via {@link getCardDescriptor}
 *     and re-renders it in the pinned slot (ActiveStepCard) pre-filled with the
 *     current builderState, temporarily substituting the active-step card.
 *     Re-submit goes through the normal card-submit endpoint; the step-engine
 *     is unaffected (the confirmation was already true and stays true).
 *  3. TRANSIENT (1 card): `quick_reply_chips` — a quick-answer prompt with NO
 *     `stepId` and no sentinel; it routes as a normal chat turn. The Builder can
 *     emit it through the `quick_reply_chips` tool, and ToolCallCard renders the
 *     registered component inline. It is EXPLICITLY excluded from the active-step
 *     mapping (see {@link STEP_TO_CARD}) so it never surfaces in the pinned slot.
 *  4. INLINE / LEGACY (2 cards): `tool_selection`, `channel`
 *     keep their inline rendering inside `ToolCallCard` (chat-panel.tsx) for
 *     backward compat — they are NOT in this registry at all.
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (card catalog) +
 *           src/server/ai-module/builder/state/readiness.types.ts (StepId).
 */

import type { ComponentType } from "react"
import {
  CalendarPlus,
  CheckCircle2,
  Clock,
  FlaskConical,
  Headset,
  Instagram,
  KeyRound,
  ListChecks,
  MapPin,
  MessageCircle,
  PartyPopper,
  ShieldOff,
  Sparkles,
  Store,
  Tag,
  UserRound,
  Wrench,
} from "lucide-react"

import type { StepId } from "@/server/ai-module/builder/state/readiness.types"

import type { CardComponentProps, CardDescriptor, CardKey } from "./types"

import { AgentApprovalCard } from "./agent-approval-card"
import { AgentPersonaCard } from "./agent-persona-card"
import { AgentReviewCard } from "./agent-review-card"
import { ServicesOfferedCard } from "./services-offered-card"
import { BusinessHoursCard } from "./business-hours-card"
import { PricingCard } from "./pricing-card"
import { HandoffCard } from "./handoff-card"
import { CalendarConnectCard } from "./calendar-connect-card"
import { ActivationModeCard } from "./activation-mode-card"
import { PreviewSummaryCard } from "./preview-summary-card"
import { QuickReplyChipsCard } from "./quick-reply-chips-card"
import { SourceProgressCard } from "./source-progress-card"
import { SilencedContactsCard } from "./silenced-contacts-card"
import { BusinessIdentityCard } from "./business-identity-card"
import { TestDriveCard } from "./test-drive-card"
import { ChannelPlatformCard } from "./channel-platform-card"
import { WhatsAppConnectCard } from "./whatsapp-connect-card"
import { InstagramConnectCard } from "./instagram-connect-card"
import { PublishedNextStepsCard } from "./published-next-steps-card"

/**
 * The `CardKey`s this registry renders — the catalog cards. Excludes the 2
 * legacy keys (rendered inline in ToolCallCard) and `byok_guided` (blocker-driven,
 * rendered outside the active-step slot — not a step/submit card).
 */
export type RegisteredW3CardKey =
  | "agent_approval"
  | "agent_persona"
  | "agent_review"
  | "services"
  | "business_hours"
  | "pricing"
  | "handoff"
  | "calendar_connect"
  | "activation_mode"
  | "preview_summary"
  | "quick_reply_chips"
  | "source_progress"
  | "silenced_contacts"
  | "business_identity"
  | "test_drive"
  | "channel_platform"
  | "whatsapp_connect"
  | "instagram_connect"
  | "published_next_steps"

/**
 * The registry. Heterogeneous by design — each component narrows `TPayload`
 * differently, so the descriptor stores the component as
 * `ComponentType<CardComponentProps<any>>` (the single `any` lives at the
 * storage boundary in `CardDescriptor`, never in a card implementation).
 *
 * `stepId` is the QUAYER_STEPS / StepId that the card completes. It is omitted
 * for cards that do not gate a journey step (`quick_reply_chips` is a transient
 * prompt with no sentinel, so it never maps to an active step).
 */
export const CARD_REGISTRY: Record<RegisteredW3CardKey, CardDescriptor> = {
  agent_approval: {
    // Jornada v2: deterministic card for the approval step. The legacy
    // `propose_agent_creation` tool can still render an inline proposal, but the
    // step no longer depends on the LLM calling that tool to show a card.
    cardKey: "agent_approval",
    stepId: "agent_approval",
    title: "Aprovar agente",
    icon: <Sparkles className="h-4 w-4" />,
    component: AgentApprovalCard as ComponentType<CardComponentProps>,
  },
  agent_persona: {
    cardKey: "agent_persona",
    stepId: "persona",
    title: "Personalidade do agente",
    icon: <UserRound className="h-4 w-4" />,
    component: AgentPersonaCard as ComponentType<CardComponentProps>,
  },
  agent_review: {
    // Jornada v2 (T43, FR-05/FR-22) — ACTIVE-STEP card da fase "Revisar". Card
    // COMPOSTO que funde persona + serviços + horários numa única confirmação
    // (NFR-07) + seção avançada de disclosure. Surfa como step `agent_review`,
    // cujo isDone (journey-v2 engine) exige persona && services && hours.
    cardKey: "agent_review",
    stepId: "agent_review",
    title: "Revisar o agente",
    icon: <Sparkles className="h-4 w-4" />,
    component: AgentReviewCard as ComponentType<CardComponentProps>,
  },
  services: {
    cardKey: "services",
    stepId: "services",
    title: "Serviços do agente",
    icon: <Wrench className="h-4 w-4" />,
    component: ServicesOfferedCard as ComponentType<CardComponentProps>,
  },
  business_hours: {
    cardKey: "business_hours",
    stepId: "business_hours",
    title: "Horário da equipe humana",
    icon: <Clock className="h-4 w-4" />,
    component: BusinessHoursCard as ComponentType<CardComponentProps>,
  },
  pricing: {
    cardKey: "pricing",
    stepId: "pricing",
    title: "Tabela de preços",
    icon: <Tag className="h-4 w-4" />,
    component: PricingCard as ComponentType<CardComponentProps>,
  },
  handoff: {
    // Onda 2 — FUSÃO de qualification_action + qualification_steps +
    // team_structure + handoff_pairing num único card de 4 seções (modo + roster
    // + roteiro + agenda). Mapeia para o StepId 'handoff' do step-engine.
    cardKey: "handoff",
    stepId: "handoff",
    title: "Passagem para humano",
    icon: <Headset className="h-4 w-4" />,
    component: HandoffCard as ComponentType<CardComponentProps>,
  },
  calendar_connect: {
    cardKey: "calendar_connect",
    stepId: "calendar",
    title: "Conectar agenda",
    icon: <CalendarPlus className="h-4 w-4" />,
    component: CalendarConnectCard as ComponentType<CardComponentProps>,
  },
  activation_mode: {
    cardKey: "activation_mode",
    stepId: "activation",
    title: "Modo de ativação",
    icon: <KeyRound className="h-4 w-4" />,
    component: ActivationModeCard as ComponentType<CardComponentProps>,
  },
  preview_summary: {
    cardKey: "preview_summary",
    stepId: "summary",
    title: "Tudo certo?",
    icon: <CheckCircle2 className="h-4 w-4" />,
    component: PreviewSummaryCard as ComponentType<CardComponentProps>,
  },
  quick_reply_chips: {
    // TRANSIENT card: no stepId — a quick-answer prompt that carries no sentinel
    // and never gates a journey step (it routes as a normal user turn). It is
    // also hard-excluded from the active-step mapping via ACTIVE_STEP_EXCLUDED,
    // so getCardForStep can never surface it in the pinned slot.
    cardKey: "quick_reply_chips",
    title: "Respostas rápidas",
    icon: <ListChecks className="h-4 w-4" />,
    component: QuickReplyChipsCard as ComponentType<CardComponentProps>,
  },
  source_progress: {
    cardKey: "source_progress",
    stepId: "source_ingestion",
    title: "Fontes do negócio",
    icon: <Sparkles className="h-4 w-4" />,
    component: SourceProgressCard as ComponentType<CardComponentProps>,
  },
  silenced_contacts: {
    // G1 — OPTIONAL step `silenced_contacts`. The step-engine surfaces it in the
    // active-step slot (like the source override) only when it applies — activation
    // confirmed with mode `all_except_blacklist` and not yet acknowledged. It never
    // gates deploy and clears the instant the user submits (even an empty list).
    cardKey: "silenced_contacts",
    stepId: "silenced_contacts",
    title: "Contatos em silêncio",
    icon: <ShieldOff className="h-4 w-4" />,
    component: SilencedContactsCard as ComponentType<CardComponentProps>,
  },
  business_identity: {
    // Jornada v2 (T38, FR-03) — ACTIVE-STEP card da fase "Conhecer". Surfa como
    // step `business_identity` quando o projeto v2 não tem fonte colada: o usuário
    // conta rápido sobre o negócio (nome + endereço? + descrição?) em vez de
    // colar um site/IG. O engine v2 dá isDone via confirmations.businessIdentity
    // OU confirmed('source').
    cardKey: "business_identity",
    stepId: "business_identity",
    title: "Conte sobre o negócio",
    icon: <Store className="h-4 w-4" />,
    component: BusinessIdentityCard as ComponentType<CardComponentProps>,
  },
  test_drive: {
    // Jornada v2 (T46, FR-20) — ACTIVE-STEP card da fase "Testar". Gate SOFT:
    // convida a testar o agente no playground antes de publicar, com escape
    // explícito ("Publicar sem testar"). Surfa como step `test_drive`.
    cardKey: "test_drive",
    stepId: "test_drive",
    title: "Que tal testar o agente?",
    icon: <FlaskConical className="h-4 w-4" />,
    component: TestDriveCard as ComponentType<CardComponentProps>,
  },
  channel_platform: {
    // Jornada v2 (T96, FR-24/25) — primeiro card da fase "Lançar": onde o agente
    // vai atender (WhatsApp/Instagram) + modo de conexão do WhatsApp. Surfa como
    // step `channel_platform`.
    cardKey: "channel_platform",
    stepId: "channel_platform",
    title: "Onde seu agente vai atender?",
    icon: <MapPin className="h-4 w-4" />,
    component: ChannelPlatformCard as ComponentType<CardComponentProps>,
  },
  whatsapp_connect: {
    // Jornada v2 (T47, FR-15/27/30/34) — ACTIVE-STEP card da fase "Lançar":
    // conexão do WhatsApp (QR pareado ou Cloud API). Conclusão por autodetecção
    // server-side (sem submit). Surfa como step `whatsapp_connect`.
    cardKey: "whatsapp_connect",
    stepId: "whatsapp_connect",
    title: "Conectar o WhatsApp",
    icon: <MessageCircle className="h-4 w-4" />,
    component: WhatsAppConnectCard as ComponentType<CardComponentProps>,
  },
  instagram_connect: {
    // Jornada v2 (T97, FR-24/25) — card condicional da fase "Lançar": conexão do
    // Instagram (só caminho oficial Meta, sem nível 2). Conclusão por autodetecção
    // server-side (sem submit). Surfa como step `instagram_connect`.
    cardKey: "instagram_connect",
    stepId: "instagram_connect",
    title: "Conectar o Instagram",
    icon: <Instagram className="h-4 w-4" />,
    component: InstagramConnectCard as ComponentType<CardComponentProps>,
  },
  published_next_steps: {
    // Jornada v2 (T48, FR-16) — card TERMINAL da fase "Lançar": surfa pós-publicação
    // e entrega os próximos passos (testar do celular, ver Atividade, pausar). Ação
    // única `ack` (não bloqueia a jornada). Surfa como step `published_next_steps`.
    cardKey: "published_next_steps",
    stepId: "published_next_steps",
    title: "Seu agente está no ar!",
    icon: <PartyPopper className="h-4 w-4" />,
    component: PublishedNextStepsCard as ComponentType<CardComponentProps>,
  },
}

/**
 * Card keys that must NEVER be surfaced by the active-step slot, regardless of
 * whether they carry a `stepId`. `quick_reply_chips` is a TRANSIENT prompt
 * rendered inline from tool output, so excluding it here guarantees
 * `getCardForStep` can never return it — even if a `stepId` is added to its
 * descriptor by mistake later.
 */
const ACTIVE_STEP_EXCLUDED: ReadonlySet<CardKey> = new Set<CardKey>([
  "quick_reply_chips",
])

/**
 * Reverse index `stepId` → descriptor, built once from CARD_REGISTRY so the two
 * never drift. Only cards that carry a `stepId` AND are not active-step-excluded
 * (see {@link ACTIVE_STEP_EXCLUDED}) appear here.
 */
const STEP_TO_CARD: Partial<Record<StepId, CardDescriptor>> = (() => {
  const out: Partial<Record<StepId, CardDescriptor>> = {}
  for (const descriptor of Object.values(CARD_REGISTRY)) {
    if (descriptor.stepId && !ACTIVE_STEP_EXCLUDED.has(descriptor.cardKey)) {
      out[descriptor.stepId as StepId] = descriptor
    }
  }
  return out
})()

/**
 * Look up a card descriptor by its `cardKey`. Returns `undefined` only for the
 * legacy keys (tool_selection/channel), which render inline in ToolCallCard and
 * are not in this registry. `quick_reply_chips` and
 * `source_progress` ARE registered, so they resolve here.
 *
 * This is ALSO the reopen lookup (drive mode 2 / FR-17): ActiveStepCard
 * resolves the card reopened by the summary's "Ajustar" through this function.
 */
export function getCardDescriptor(
  cardKey: CardKey,
): CardDescriptor | undefined {
  return (CARD_REGISTRY as Record<string, CardDescriptor>)[cardKey]
}

/**
 * Resolve the card to render for a given journey `stepId` (from
 * `readiness.step.id`). Returns `undefined` for steps with no card
 * (`project_identity`, `objective` — free-text; `tools`, `channel` — rendered
 * inline in ToolCallCard, not in this registry).
 */
export function getCardForStep(
  stepId: StepId,
): CardDescriptor | undefined {
  return STEP_TO_CARD[stepId]
}
