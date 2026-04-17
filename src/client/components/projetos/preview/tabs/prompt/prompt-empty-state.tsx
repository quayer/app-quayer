"use client"

import { Bot } from "lucide-react"
import type { AppTokens } from "./prompt-types"

export function PromptEmptyState({
  children,
  tokens,
}: {
  children: React.ReactNode
  tokens: AppTokens
}) {
  return (
    <div className="mx-auto flex min-h-[280px] max-w-md flex-col items-center justify-center gap-3 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: tokens.brandSubtle,
          color: tokens.brand,
        }}
      >
        <Bot className="h-5 w-5" />
      </div>
      <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
        {children}
      </p>
    </div>
  )
}
