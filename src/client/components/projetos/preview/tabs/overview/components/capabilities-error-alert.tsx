"use client"

import { AlertCircle } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

export function CapabilitiesErrorAlert({
  message,
  tokens,
}: {
  message: string
  tokens: AppTokens
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border px-3 py-2 text-[12px]"
      style={{
        borderColor: tokens.danger,
        backgroundColor: tokens.dangerSubtle,
        color: tokens.dangerText,
      }}
    >
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}
