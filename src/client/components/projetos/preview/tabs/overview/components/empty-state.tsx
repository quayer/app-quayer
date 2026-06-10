"use client"

import { Sparkles } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import { EmptyState as DsEmptyState } from "@/client/components/ds/empty-state"

export function EmptyState({ tokens }: { tokens: AppTokens }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <DsEmptyState
        variant="plain"
        className="py-6"
        icon={<Sparkles className="h-5 w-5" />}
        title="Comece conversando com o Builder"
        description="Descreva o agente que você quer criar no chat. O Builder vai configurar tudo para você, passo a passo."
        descriptionClassName="max-w-xs"
        tokens={tokens}
      />
    </div>
  )
}
