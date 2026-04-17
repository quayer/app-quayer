"use client"

import { Check, Loader2 } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { Stage } from "../types"

export function StageRow({
  stage,
  isLast,
  tokens,
}: {
  stage: Stage
  isLast: boolean
  tokens: AppTokens
}) {
  const isDone = stage.status === "done"
  const isActive = stage.status === "active"

  let circleBg: string
  let circleColor: string
  if (isDone) {
    circleBg = "rgba(34,197,94,0.15)"
    circleColor = "#22c55e"
  } else if (isActive) {
    circleBg = tokens.brandSubtle
    circleColor = tokens.brand
  } else {
    circleBg = tokens.hoverBg
    circleColor = tokens.textDisabled
  }

  let statusText: string
  let statusColor: string
  if (isDone) {
    statusText = "Concluído"
    statusColor = "#4ade80"
  } else if (isActive) {
    statusText = "Em progresso"
    statusColor = tokens.brand
  } else {
    statusText = "Pendente"
    statusColor = tokens.textDisabled
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-3"
      style={{
        borderLeft: isActive ? `3px solid ${tokens.brand}` : "3px solid transparent",
        borderBottom: isLast ? "none" : `1px solid ${tokens.divider}`,
        backgroundColor: isActive ? tokens.brandSubtle : "transparent",
      }}
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
        style={{
          backgroundColor: circleBg,
          color: circleColor,
        }}
      >
        {isDone ? (
          <Check className="h-3.5 w-3.5" />
        ) : isActive ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          stage.number
        )}
      </div>

      <div className="min-w-0 flex-1">
        <span
          className="text-[13px] font-medium"
          style={{
            color: isDone || isActive ? tokens.textPrimary : tokens.textTertiary,
          }}
        >
          {stage.title}
        </span>
        {stage.detail && isDone && (
          <span
            className="ml-2 text-[11px]"
            style={{ color: tokens.textTertiary }}
          >
            — {stage.detail}
          </span>
        )}
      </div>

      <span
        className="shrink-0 text-[11px] font-medium"
        style={{ color: statusColor }}
      >
        {statusText}
      </span>
    </div>
  )
}
