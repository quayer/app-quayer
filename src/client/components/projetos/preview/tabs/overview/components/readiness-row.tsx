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
    <div className="flex items-start gap-2.5">
      <div
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: item.met ? tokens.successSubtle : tokens.dangerSubtle,
        }}
      >
        {item.met ? (
          <Check className="h-3 w-3" style={{ color: tokens.success }} aria-hidden="true" />
        ) : (
          <X className="h-3 w-3" style={{ color: tokens.danger }} aria-hidden="true" />
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <span
          className="text-[13px]"
          style={{
            color: item.met ? tokens.textPrimary : tokens.textSecondary,
          }}
        >
          {item.label}
          <span className="sr-only">{item.met ? " — atendido" : " — pendente"}</span>
        </span>
        {!item.met && item.detail && (
          <span
            className="text-[11px] leading-snug"
            style={{ color: tokens.textTertiary }}
          >
            {item.detail}
          </span>
        )}
      </div>
    </div>
  )
}
