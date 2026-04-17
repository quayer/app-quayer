"use client"

/**
 * BuilderWorkingBanner — persistent strip shown above the tab strip whenever
 * the Builder assistant has at least one tool call still executing. Purely
 * presentational; visibility is driven by `getBannerState` in the parent.
 */

import { Loader2 } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

export function BuilderWorkingBanner() {
  const { tokens } = useAppTokens()

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex shrink-0 items-center gap-2 px-4 py-2 text-[12px] font-medium"
      style={{
        backgroundColor: tokens.brandSubtle,
        color: tokens.brandText,
        borderBottom: `1px solid ${tokens.divider}`,
      }}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      <span>Builder esta trabalhando — aguarde um momento...</span>
    </div>
  )
}
