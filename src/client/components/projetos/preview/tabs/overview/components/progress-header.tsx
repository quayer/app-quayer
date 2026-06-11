"use client"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

export function ProgressHeader({
  doneCount,
  totalCount,
  pct,
  tokens,
}: {
  doneCount: number
  totalCount: number
  /**
   * Percentual canônico vindo do readiness (`completenessPct`). Quando
   * presente, a barra usa ELE (fonte única — FR-18) em vez da razão local.
   */
  pct?: number
  tokens: AppTokens
}) {
  const barPct = pct ?? (totalCount > 0 ? (doneCount / totalCount) * 100 : 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          Progresso
        </span>
        {/* Texto e barra derivam do MESMO número: o completenessPct exclui
            passos não-aplicáveis do denominador, então "X de N" com N bruto
            contradizia a barra (ex.: "13 de 15" com barra em 93%). */}
        <span
          className="text-[12px] font-medium"
          style={{ color: tokens.textSecondary }}
        >
          {Math.round(barPct)}% concluído
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: tokens.hoverBg }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${barPct}%`,
            backgroundColor: tokens.brand,
          }}
        />
      </div>
    </div>
  )
}
