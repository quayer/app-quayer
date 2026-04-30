"use client"

import * as React from "react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import { useChatActions } from "./chat-action-context"
import type { QuickReplyChip } from "./utils/parse-quick-reply"

interface QuickReplyBarProps {
  chips: QuickReplyChip[]
  tokens: AppTokens
  /** Lock all chips when this message is not the last (prevents re-send after reload) */
  allDisabled?: boolean
}

/**
 * QuickReplyBar — renders numbered action chips from assistant messages.
 *
 * Chips replace plain numbered lists like "Próximos passos:\n1. ...\n2. ..."
 * with interactive buttons. After click, the selected chip highlights and
 * others are disabled (transcript immutability pattern used across all cards).
 *
 * Uses useChatActions() for sendMessage — safe when rendered outside a
 * ChatActionProvider (returns null gracefully).
 */
export function QuickReplyBar({ chips, tokens, allDisabled }: QuickReplyBarProps) {
  const actions = useChatActions()
  const [clicked, setClicked] = React.useState<number | null>(null)
  // Fade-in on mount so chips don't flash in abruptly after streaming ends
  const [visible, setVisible] = React.useState(false)
  React.useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30)
    return () => clearTimeout(t)
  }, [])

  const handleClick = React.useCallback(
    (chip: QuickReplyChip) => {
      if (clicked !== null || allDisabled || !actions || actions.isStreaming) return
      setClicked(chip.index)
      actions.sendMessage(chip.message)
    },
    [actions, clicked, allDisabled],
  )

  if (chips.length === 0) return null

  return (
    <div
      className="mt-3 flex flex-wrap gap-2 transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
      role="group"
      aria-label="Opções de resposta rápida"
    >
      {chips.map((chip) => {
        const isSelected = clicked === chip.index
        const isDisabled = allDisabled || (clicked !== null && !isSelected)

        return (
          <QuickReplyChipButton
            key={chip.index}
            chip={chip}
            isSelected={isSelected}
            isDisabled={isDisabled}
            tokens={tokens}
            onClick={handleClick}
          />
        )
      })}
    </div>
  )
}

// ── Internal chip button ────────────────────────────────────────────────────

interface ChipButtonProps {
  chip: QuickReplyChip
  isSelected: boolean
  isDisabled: boolean
  tokens: AppTokens
  onClick: (chip: QuickReplyChip) => void
}

function QuickReplyChipButton({
  chip,
  isSelected,
  isDisabled,
  tokens,
  onClick,
}: ChipButtonProps) {
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => onClick(chip)}
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2"
      style={{
        borderColor: isSelected ? tokens.brand : tokens.border,
        backgroundColor: isSelected ? tokens.brandSubtle : "transparent",
        color: isSelected ? tokens.brand : tokens.textPrimary,
        opacity: isDisabled ? 0.38 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
      }}
      onMouseEnter={(e) => {
        if (isDisabled || isSelected) return
        e.currentTarget.style.backgroundColor = tokens.hoverBg
        e.currentTarget.style.borderColor = tokens.brand
      }}
      onMouseLeave={(e) => {
        if (isDisabled || isSelected) return
        e.currentTarget.style.backgroundColor = "transparent"
        e.currentTarget.style.borderColor = tokens.border
      }}
      aria-pressed={isSelected}
    >
      <IndexBadge index={chip.index} isSelected={isSelected} tokens={tokens} />
      {chip.label}
    </button>
  )
}

function IndexBadge({
  index,
  isSelected,
  tokens,
}: {
  index: number
  isSelected: boolean
  tokens: AppTokens
}) {
  return (
    <span
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold"
      style={{
        backgroundColor: isSelected ? tokens.brand : tokens.hoverBg,
        color: isSelected ? tokens.textInverse : tokens.textTertiary,
      }}
      aria-hidden
    >
      {index}
    </span>
  )
}
