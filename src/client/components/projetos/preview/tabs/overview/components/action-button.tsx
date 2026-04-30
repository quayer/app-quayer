"use client"

import type { Bot } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

export function ActionButton({
  icon: Icon,
  label,
  onClick,
  primary = false,
  tokens,
}: {
  icon: typeof Bot
  label: string
  onClick: () => void
  primary?: boolean
  tokens: AppTokens
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-[13px] font-medium transition-colors"
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
        if (!primary) {
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
