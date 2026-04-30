"use client"

import { Check, X } from "lucide-react"
import type { AppTokens } from "@/client/hooks/use-app-tokens"
import type { ReadinessItem } from "../types"

export function ReadinessRow({
  item,
  tokens,
}: {
  item: ReadinessItem
  tokens: AppTokens
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: item.met
            ? "rgba(34,197,94,0.15)"
            : "rgba(239,68,68,0.12)",
        }}
      >
        {item.met ? (
          <Check className="h-3 w-3" style={{ color: "#22c55e" }} />
        ) : (
          <X className="h-3 w-3" style={{ color: "#f87171" }} />
        )}
      </div>
      <span
        className="text-[13px]"
        style={{
          color: item.met ? tokens.textPrimary : tokens.textSecondary,
        }}
      >
        {item.label}
      </span>
    </div>
  )
}
