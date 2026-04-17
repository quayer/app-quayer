"use client"

/**
 * ErrorBanner — persistent strip shown above the tab strip when a recent
 * Builder tool call returned an error-shaped result. Dismissing calls back
 * to the parent so a new error id can re-open the banner. No danger token
 * exists in the DS yet — inline rgba follows the pattern used elsewhere
 * (see `prompt-insights-section.tsx`).
 */

import { AlertTriangle } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

interface ErrorBannerProps {
  onDismiss: () => void
}

export function ErrorBanner({ onDismiss }: ErrorBannerProps) {
  const { tokens } = useAppTokens()

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-2 px-4 py-2 text-[12px] font-medium"
      style={{
        backgroundColor: "rgba(239,68,68,0.10)",
        color: "#ef4444",
        borderBottom: `1px solid ${tokens.divider}`,
      }}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="flex-1">
        Algo deu errado na ultima operacao. Veja detalhes no chat ou tente
        novamente.
      </span>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded px-2 py-0.5 text-[11px] font-semibold transition-colors hover:bg-[rgba(239,68,68,0.12)]"
        style={{ color: "#ef4444" }}
      >
        Ocultar
      </button>
    </div>
  )
}
