"use client"

import { Bot } from "lucide-react"
import type { AppTokens } from "./prompt-types"
import { EmptyState } from "@/client/components/ds/empty-state"

export function PromptEmptyState({
  children,
  tokens,
  onOpenChat,
}: {
  children: React.ReactNode
  tokens: AppTokens
  onOpenChat?: () => void
}) {
  return (
    <EmptyState
      variant="plain"
      className="mx-auto min-h-[280px] max-w-md justify-center"
      icon={<Bot className="h-5 w-5" />}
      description={children}
      tokens={tokens}
      action={
        onOpenChat ? (
          <button
            type="button"
            onClick={onOpenChat}
            className="mt-3 text-[13px] underline underline-offset-2"
            style={{ color: tokens.brand }}
          >
            Abrir chat →
          </button>
        ) : undefined
      }
    />
  )
}
