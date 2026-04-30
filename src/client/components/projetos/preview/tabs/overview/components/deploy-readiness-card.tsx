"use client"

import { Rocket } from "lucide-react"
import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { PreviewTab } from "@/client/components/projetos/types"
import type { ReadinessItem } from "../types"
import { ReadinessRow } from "./readiness-row"

interface DeployReadinessCardProps {
  readiness: ReadinessItem[]
  readinessMet: number
  onTabChange?: (tab: PreviewTab) => void
  tokens: AppTokens
}

export function DeployReadinessCard({
  readiness,
  readinessMet,
  onTabChange,
  tokens,
}: DeployReadinessCardProps) {
  return (
    <Card
      className="overflow-hidden border p-0 shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <CardContent className="p-5">
        <h3
          className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          Prontidão para Deploy
        </h3>

        <div className="flex flex-col gap-2.5">
          {readiness.map((item) => (
            <ReadinessRow key={item.label} item={item} tokens={tokens} />
          ))}
        </div>

        <div
          className="mt-4 flex items-center justify-between border-t pt-4"
          style={{ borderColor: tokens.divider }}
        >
          <span
            className="text-[13px] font-medium"
            style={{ color: tokens.textSecondary }}
          >
            {readinessMet} de {readiness.length} requisitos atendidos
          </span>
          <button
            type="button"
            disabled={readinessMet < readiness.length}
            onClick={() => onTabChange?.("deploy")}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3.5 text-[12px] font-semibold transition-opacity disabled:opacity-40"
            style={{
              backgroundColor: tokens.brand,
              color: tokens.textInverse,
            }}
          >
            <Rocket className="h-3.5 w-3.5" />
            Publicar
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
