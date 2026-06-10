"use client"

import type { Bot } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

export function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary = false,
  disabled = false,
  title,
  tokens,
}: {
  icon: typeof Bot
  label: string
  onClick: () => void
  primary?: boolean
  /** FR-20: estados desabilitados explicam o porquê via `title`. */
  disabled?: boolean
  title?: string
  tokens: AppTokens
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={
        primary
          ? {
              backgroundColor: tokens.brand,
              borderColor: tokens.brand,
              color: tokens.textInverse,
            }
          : {
              backgroundColor: "transparent",
              borderColor: tokens.border,
              color: tokens.textPrimary,
            }
      }
      onMouseEnter={(e) => {
        if (!primary && !disabled) {
          e.currentTarget.style.backgroundColor = tokens.hoverBg
        }
      }}
      onMouseLeave={(e) => {
        if (!primary) {
          e.currentTarget.style.backgroundColor = "transparent"
        }
      }}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}
