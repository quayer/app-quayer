"use client"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

export function ProgressHeader({
  doneCount,
  totalCount,
  tokens,
}: {
  doneCount: number
  totalCount: number
  tokens: AppTokens
}) {
  const pct = totalCount > 0 ? (doneCount / totalCount) * 100 : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          Progresso
        </span>
        <span
          className="text-[12px] font-medium"
          style={{ color: tokens.textSecondary }}
        >
          {doneCount} de {totalCount} concluídas
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: tokens.hoverBg }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: tokens.brand,
          }}
        />
      </div>
    </div>
  )
}
