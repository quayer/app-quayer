"use client"

/**
 * Builder Cards — quick_reply_chips (Orayon Uplift, W3)
 *
 * Renders the LLM's proposed quick answers as tappable chips. Tapping a chip
 * routes the chosen `value` through the card-submit endpoint as a NORMAL user
 * turn — NOT the legacy free-text `onSend`. The backend handler echoes `value`
 * back as the user's answer; this card owns NO builderState slice and flips NO
 * confirmation sentinel (transient, no sentinel).
 *
 * PRESENTATIONAL: like every W3 card it only renders + calls `onSubmit(payload)`.
 * The chat-panel (Wire phase) owns POST + SSE; it parses the tool-result into
 * `chips` and wraps the `{ value }` payload with the `cardKey` discriminator
 * (`quickReplyChipsPayloadSchema` server-side).
 *
 * Contract: docs/builder/ORAYON_UPLIFT_SPEC.md (card catalog → quick_reply_chips).
 */

import * as React from "react"
import { MessageSquareReply } from "lucide-react"

import type { CardComponentProps } from "./types"
import { CardShell } from "./card-shell"

// ==========================================
// Payload + chip proposal shapes
// ==========================================

/**
 * The payload this card fires UP via `onSubmit`. EXACTLY the contract for
 * `quick_reply_chips`: the chosen chip's `value`. The Wire phase wraps this with
 * `cardKey: 'quick_reply_chips'` to satisfy the backend discriminated union
 * (`quickReplyChipsPayloadSchema`).
 */
export interface QuickReplyChipsPayload {
  value: string
}

/**
 * A single proposed quick answer. `value` is the text routed back as the user's
 * turn; `label` is the (optional) display text — falls back to `value`. The chip
 * set is LLM-proposed + transient, so it is NOT part of BuilderState — the Wire
 * phase parses it out of the tool-result and passes it as `chips`.
 */
export interface QuickReplyChip {
  value: string
  label?: string
}

/**
 * Props: the framework `CardComponentProps<QuickReplyChipsPayload>` plus the
 * transient `chips` proposal (and an optional prompt line). `chips` accepts
 * loose shapes (`string[]` or `{value,label}[]`) so the Wire phase can hand a
 * lightly-parsed tool-result straight through; this card re-normalizes them.
 */
export interface QuickReplyChipsCardProps
  extends CardComponentProps<QuickReplyChipsPayload> {
  /** The LLM-proposed quick answers. Loose by design (see normalizeChips). */
  chips?: ReadonlyArray<QuickReplyChip | string>
  /** Optional question/prompt shown above the chips (the card's "reason"). */
  prompt?: string
}

// ==========================================
// Normalization (defensive — chips are LLM-proposed)
// ==========================================

/**
 * Coerce a loose chip array (strings or partial objects, possibly from a raw
 * tool-result) into deduped, trimmed {@link QuickReplyChip}s. Drops empties.
 */
function normalizeChips(
  input: ReadonlyArray<QuickReplyChip | string> | undefined,
): QuickReplyChip[] {
  if (!input || input.length === 0) return []

  const seen = new Set<string>()
  const out: QuickReplyChip[] = []

  for (const raw of input) {
    let value: string
    let label: string | undefined

    if (typeof raw === "string") {
      value = raw.trim()
    } else if (raw && typeof raw === "object") {
      value = typeof raw.value === "string" ? raw.value.trim() : ""
      const rawLabel = typeof raw.label === "string" ? raw.label.trim() : ""
      label = rawLabel.length > 0 ? rawLabel : undefined
    } else {
      continue
    }

    if (value.length === 0 || seen.has(value)) continue
    seen.add(value)
    out.push(label ? { value, label } : { value })
  }

  return out
}

// ==========================================
// Component
// ==========================================

/**
 * QuickReplyChipsCard — tappable quick-answer chips. Tapping a chip fires
 * `onSubmit({ value })` ONCE (latched against double-taps) and blocks further
 * taps while `disabled` (chat streaming). Renders nothing if there are no chips
 * to propose — there is no useful empty state for a transient prompt.
 */
export function QuickReplyChipsCard({
  value: builderState,
  disabled = false,
  onSubmit,
  tokens,
  chips,
  prompt,
}: QuickReplyChipsCardProps) {
  // `builderState` is the full canonical state; this card owns no slice of it,
  // so it is intentionally unused beyond satisfying the framework contract.
  void builderState

  const normalized = React.useMemo(() => normalizeChips(chips), [chips])

  // Latch so a tapped chip can't fire twice (the card is removed/replaced by the
  // ACK turn, but guard against a re-render racing the disable).
  const [submitted, setSubmitted] = React.useState<string | null>(null)

  const handleTap = React.useCallback(
    (chipValue: string) => {
      if (disabled || submitted !== null) return
      setSubmitted(chipValue)
      onSubmit({ value: chipValue })
    },
    [disabled, submitted, onSubmit],
  )

  if (normalized.length === 0) return null

  const locked = disabled || submitted !== null

  return (
    <CardShell
      icon={<MessageSquareReply className="h-4 w-4" />}
      title="Respostas rápidas"
      reason={prompt ?? "Toque em uma opção para responder."}
      tokens={tokens}
    >
      <div className="flex flex-wrap gap-2">
        {normalized.map((chip) => {
          const isChosen = submitted === chip.value
          return (
            <button
              key={chip.value}
              type="button"
              disabled={locked}
              aria-pressed={isChosen}
              onClick={() => handleTap(chip.value)}
              className="rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: isChosen ? tokens.brand : tokens.bgBase,
                borderColor: isChosen ? tokens.brand : tokens.divider,
                color: isChosen ? tokens.textInverse : tokens.textPrimary,
              }}
            >
              {chip.label ?? chip.value}
            </button>
          )
        })}
      </div>
    </CardShell>
  )
}

export default QuickReplyChipsCard
