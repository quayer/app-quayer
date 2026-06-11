"use client"

/**
 * Builder Cards — "Usar sugestão" chip + "sugerido da conversa" badge (T95, FR-23)
 *
 * Two SMALL presentational primitives shared by the three `agent_review` sections
 * (and available to `business_identity`), both token-driven (zero hard-coded color)
 * and `any`-free:
 *
 *   <SuggestedBadge>      — the static "sugerido da conversa" tag (T43). Rendered
 *      next to a field whose mount-time value came from `capturedProposals` (origin
 *      `'proposed'`). It is purely informative: it never acts on the field.
 *
 *   <UseSuggestionChip>   — the LATE-proposal affordance (T95). When a proposal for
 *      a field arrives AFTER the card mounted (detected by `detectLateProposals` in
 *      `prefill.ts`), the field surfaces this clickable chip. Clicking is the ONLY
 *      way the suggestion is applied — applying is ALWAYS an explicit, per-field
 *      user action; the helper never re-prefills nor overwrites typing.
 *
 * Disappearance rule (T95): the chip is rendered by the host ONLY while a late
 * proposal exists for that field. The host removes it the instant the user applies
 * it (the host stops passing the proposal) or submits the card (the section
 * unmounts). This component owns no timing — it renders iff the host gives it a
 * proposal.
 *
 * Contract: plan §4.2 (specs/jornada-builder-v2/plan.md).
 */

import * as React from "react"
import { Sparkles } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

/**
 * The static "sugerido da conversa" badge (T43). Marks a field whose CURRENT value
 * was pre-filled from `capturedProposals` at mount (origin `'proposed'`); a field
 * the user owns/confirmed renders WITHOUT this badge. Inline, brand-subtle, tiny.
 */
export function SuggestedBadge({ tokens }: { tokens: AppTokens }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none"
      style={{
        backgroundColor: tokens.brandSubtle,
        borderColor: tokens.brandBorder,
        color: tokens.brandText,
      }}
    >
      <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
      sugerido da conversa
    </span>
  )
}

/**
 * The "Usar sugestão" chip (T95). Surfaces a LATE proposal for a single field; the
 * `label` should name the field/value being offered (e.g. "Usar sugestão: Comercial").
 * Clicking calls `onApply` — the host then applies the proposal to THAT field only
 * and stops rendering the chip. Disabled while the chat is streaming.
 *
 * Presentational only: it owns no state and never reads/writes the proposal — the
 * host decides whether it shows and what applying does (always explicit, per field).
 */
export function UseSuggestionChip({
  label,
  onApply,
  disabled = false,
  tokens,
}: {
  /** Human label of the offered value, e.g. `Usar sugestão: "acolhedor e direto"`. */
  label: string
  /** Fired on click — host applies the proposal to one field and drops the chip. */
  onApply: () => void
  disabled?: boolean
  tokens: AppTokens
}) {
  return (
    <button
      type="button"
      onClick={onApply}
      disabled={disabled}
      className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor: tokens.brandSubtle,
        borderColor: tokens.brandBorder,
        color: tokens.brandText,
      }}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      {label}
    </button>
  )
}
