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
 *     `stepId` and no sentinel; it routes as a normal chat turn. Its descriptor
 *     stays registered for direct lookup, but it is EXPLICITLY excluded from the
 *     active-step mapping (see {@link STEP_TO_CARD}) so it can never surface in
 *     the pinned slot — chips-parsing was never wired through that path.
 *  4. INLINE / LEGACY (3 cards): `agent_approval`, `tool_selection`, `channel`
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
  Headset,
  KeyRound,
  ListChecks,
  ShieldOff,
  Sparkles,
  Tag,
  UserRound,
  Wrench,
} from "lucide-react"

import type { StepId } from "@/server/ai-module/builder/state/readiness.types"

import type { CardComponentProps, CardDescriptor, CardKey } from "./types"

import { AgentPersonaCard } from "./agent-persona-card"
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

/**
 * The `CardKey`s this registry renders — the 11 catalog cards. Excludes the 3
 * legacy keys (rendered inline in ToolCallCard).
 */
export type RegisteredW3CardKey =
  | "agent_persona"
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
  agent_persona: {
    cardKey: "agent_persona",
    stepId: "persona",
    title: "Personalidade do agente",
    icon: <UserRound className="h-4 w-4" />,
    component: AgentPersonaCard as ComponentType<CardComponentProps>,
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
    title: "Horário de atendimento",
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
}

/**
 * Card keys that must NEVER be surfaced by the active-step slot, regardless of
 * whether they carry a `stepId`. `quick_reply_chips` is a TRANSIENT prompt whose
 * chips-parsing was never wired through the active-step path, so excluding it
 * here guarantees `getCardForStep` can never return it — even if a `stepId` is
 * added to its descriptor by mistake later.
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
 * legacy keys (agent_approval/tool_selection/channel), which render inline in
 * ToolCallCard and are not in this registry. `quick_reply_chips` and
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
 * (`project_identity`, `objective` — free-text; `tools`, `channel`,
 * `agent_approval` — rendered inline in ToolCallCard, not in this registry).
 */
export function getCardForStep(
  stepId: StepId,
): CardDescriptor | undefined {
  return STEP_TO_CARD[stepId]
}
