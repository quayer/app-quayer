"use client"

/**
 * AskBuilderButton — reusable "Pedir ao Builder" CTA.
 *
 * Dispatches the same `builder:focus-chat` custom event the chat panel already
 * listens to (see `chat-panel.tsx` + `use-prompt-actions.ts`). Any tab that
 * wants to hand the conversation off to the Builder agent with a pre-filled
 * message can drop this button in place — no prop drilling through workspace.
 */

import { Sparkles } from "lucide-react"
import { useCallback } from "react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

export interface AskBuilderButtonProps {
  tokens: AppTokens
  /** Template injected into the chat input. */
  message: string
  /** Visible label — defaults to "Pedir ao Builder". */
  label?: string
  /** small = 28px height / compact padding. default = 36px. */
  variant?: "default" | "small"
  /** Optional aria-label override for accessibility. */
  ariaLabel?: string
}

export function AskBuilderButton({
  tokens,
  message,
  label = "Pedir ao Builder",
  variant = "default",
  ariaLabel,
}: AskBuilderButtonProps) {
  const handleClick = useCallback(() => {
    if (typeof window === "undefined") return
    window.dispatchEvent(
      new CustomEvent("builder:focus-chat", {
        detail: { message },
      }),
    )
  }, [message])

  const isSmall = variant === "small"

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel ?? label}
      className={
        isSmall
          ? "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-medium transition-colors"
          : "inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-[13px] font-medium transition-colors"
      }
      style={{
        backgroundColor: tokens.brandSubtle,
        borderColor: tokens.brandBorder,
        color: tokens.brandText,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = tokens.brand
        e.currentTarget.style.color = tokens.textInverse
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = tokens.brandSubtle
        e.currentTarget.style.color = tokens.brandText
      }}
    >
      <Sparkles
        className={isSmall ? "h-3 w-3" : "h-3.5 w-3.5"}
        aria-hidden="true"
      />
      {label}
    </button>
  )
}
