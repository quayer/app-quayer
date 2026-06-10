"use client"

/**
 * ErrorBanner — strip shown above the tab content when the LATEST Builder
 * tool call returned an error-shaped result. Purely presentational: the parent
 * (PreviewPanel) owns the lifecycle — auto-dismiss após ~10s, dismiss ao trocar
 * de tab, e um novo erro (novo message id) re-abre o banner. Dismissing calls
 * back to the parent so a new error id can re-open the banner. Uses the DS
 * feedback tokens (--q-danger*) so contrast follows the theme (WCAG AA).
 */

import { AlertTriangle } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

interface ErrorBannerProps {
  message?: string
  onDismiss: () => void
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  const { tokens } = useAppTokens()
  const text = message?.trim()
    ? message
    : "Algo deu errado na última operação. Veja detalhes no chat."

  return (
    <div
      role="alert"
      className="flex shrink-0 items-center gap-2 px-4 py-2 text-[12px] font-medium"
      style={{
        backgroundColor: tokens.dangerSubtle,
        color: tokens.dangerText,
        borderBottom: `1px solid ${tokens.divider}`,
      }}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 truncate">{text}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors"
        style={{ color: tokens.dangerText }}
      >
        Ocultar
      </button>
    </div>
  )
}
