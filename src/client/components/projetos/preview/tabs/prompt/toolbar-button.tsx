"use client"

import type { AppTokens } from "./prompt-types"

export function ToolbarButton({
  children,
  tokens,
  onClick,
  title,
}: {
  children: React.ReactNode
  tokens: AppTokens
  onClick: () => void
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium transition-colors"
      style={{ color: tokens.textSecondary }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = tokens.hoverBg
        e.currentTarget.style.color = tokens.textPrimary
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent"
        e.currentTarget.style.color = tokens.textSecondary
      }}
    >
      {children}
    </button>
  )
}
