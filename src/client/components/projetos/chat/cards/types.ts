/**
 * Builder Cards — Framework types (Orayon Uplift, W3)
 *
 * The contract every card component (W3) implements against, plus the registry
 * descriptor shape. Cards are PRESENTATIONAL: they render `value` (the canonical
 * BuilderState) and call `onSubmit(payload)` — they NEVER fetch directly. The
 * chat-panel owns POST + SSE (it submits the card and consumes the ACK turn on
 * the same wire); `use-card-submit.ts` is only the standalone fallback.
 *
 * Type-only import of `BuilderState` from the server canonical file: this is the
 * single source of truth for field paths and is dependency-free (zod + TS, no
 * IO), so importing the TYPE into the client introduces no runtime coupling.
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (card catalog).
 */

import type { ComponentType, ReactNode } from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { BuilderState } from "@/server/ai-module/builder/cards/builder-state"
// Import the backend's registered-card key set so the compile-time assertion
// below stays in lockstep with `card-submit.schemas.ts CARD_KEYS`.
import type { CardKey as RegisteredCardKey } from "@/server/ai-module/builder/cards/card-submit.schemas"

export type { BuilderState }

/**
 * Every card key the FE catalog renders. This is the FRONTEND-facing union — it
 * is a SUPERSET of {@link RegisteredCardKey} (the backend submit registry) while
 * W3 lands card-by-card: each component agent registers its backend payload
 * schema in `card-submit.schemas.ts`, growing `RegisteredCardKey` toward this
 * set. `preview_summary` is a confirm-only card; `quick_reply_chips` carries no
 * sentinel and routes as a normal chat turn (handled by chat-panel, not POST).
 *
 * Keys mirror the spec's card catalog (docs/builder/ORAYON_UPLIFT_SPEC.md) and
 * the W2 keys already in the backend registry (`agent_approval`,
 * `tool_selection`, `channel`).
 */
export type CardKey =
  | "agent_approval"
  | "tool_selection"
  | "channel"
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
  | "business_identity"
  | "agent_review"
  | "knowledge"
  | "media"
  | "test_drive"
  | "channel_platform"
  | "whatsapp_connect"
  | "instagram_connect"
  | "published_next_steps"

/**
 * Compile-time assertion that every backend-registered key is also a valid FE
 * `CardKey`. If a W3 agent registers a key in the backend that the FE catalog
 * does not know about, this line fails `tsc` — keeping the two lists aligned.
 */
type _AssertRegisteredKeysAreCardKeys = RegisteredCardKey extends CardKey
  ? true
  : never
const _registeredKeysAreCardKeys: _AssertRegisteredKeysAreCardKeys = true
void _registeredKeysAreCardKeys

/**
 * Props every card component receives. `TPayload` is the card's own submit
 * payload shape (see CARD CONTRACTS in the spec / the agent brief). Defaults to
 * `unknown` so the descriptor can hold a heterogeneous registry of cards.
 *
 * - `projectId`  — BuilderProject id; cards pass it through to onSubmit/helpers.
 * - `cardKey`    — this card's key (also the submit-route path segment).
 * - `value`      — the FULL canonical BuilderState; cards read their own slice
 *                  (e.g. `value.persona`, `value.confirmations.persona`).
 * - `disabled`   — true while the chat is streaming; blocks re-submit.
 * - `onSubmit`   — fire the typed payload UP to chat-panel (it owns POST + SSE).
 * - `onDismiss`  — optional "skip / not now" affordance.
 * - `tokens`     — the resolved design-token object (same one cards in
 *                  chat-panel consume via `useAppTokens().tokens`).
 */
export interface CardComponentProps<TPayload = unknown> {
  projectId: string
  cardKey: CardKey
  value: BuilderState
  disabled?: boolean
  onSubmit: (payload: TPayload) => void
  onDismiss?: () => void
  tokens: AppTokens
}

/**
 * Registry entry describing one card. The renderer (`card-registry.tsx`, a peer
 * file) maps a `cardKey` → descriptor and renders `component`.
 *
 * `component` is intentionally `ComponentType<CardComponentProps<any>>`: the
 * registry is heterogeneous (each card narrows `TPayload` differently), so the
 * single `any` lives ONLY here at the storage boundary. Card implementations
 * themselves stay fully typed via `CardComponentProps<TheirPayload>`.
 *
 * - `cardKey` — discriminator; matches the component's `props.cardKey`.
 * - `stepId`  — optional QUAYER_STEPS id this card advances (journey banner).
 * - `title`   — header label shown in the card shell.
 * - `icon`    — header icon node (a lucide icon element, like chat-panel cards).
 */
export interface CardDescriptor {
  cardKey: CardKey
  stepId?: string
  title: string
  icon: ReactNode
  component: ComponentType<CardComponentProps<any>>
}
