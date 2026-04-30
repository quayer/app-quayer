"use client"

import { Sparkles } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

export function EmptyState({ tokens }: { tokens: AppTokens }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <h3
          className="text-sm font-semibold"
          style={{ color: tokens.textPrimary }}
        >
          Comece conversando com o Builder
        </h3>
        <p
          className="max-w-xs text-[13px]"
          style={{ color: tokens.textSecondary }}
        >
          Descreva o agente que você quer criar no chat. O Builder vai
          configurar tudo para você, passo a passo.
        </p>
      </div>
    </div>
  )
}
