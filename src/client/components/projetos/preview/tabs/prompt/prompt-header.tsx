"use client"

import { AlertCircle, Check, Hash, Loader2, Sparkles } from "lucide-react"
import type { AppTokens, SaveState } from "./prompt-types"
import { formatNumber } from "./prompt-utils"

interface PromptHeaderProps {
  tokens: AppTokens
  charCount: number
  value: string
  isDirty: boolean
  saveState: SaveState
  now: number
}

export function PromptHeader({
  tokens,
  charCount,
  value,
  isDirty,
  saveState,
  now,
}: PromptHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2
            className="text-lg font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            Prompt do agente
          </h2>
          {value.length > 0 && (
            <span
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: tokens.brandSubtle,
                color: tokens.brand,
              }}
            >
              <Sparkles className="h-2.5 w-2.5" />
              Gerado pelo Builder
            </span>
          )}
        </div>
        <p
          className="mt-0.5 text-[13px]"
          style={{ color: tokens.textSecondary }}
        >
          Edite o system prompt. Alteracoes sao salvas automaticamente.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {/* Character count badge */}
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums"
          style={{
            backgroundColor: tokens.bgSurface,
            color: tokens.textTertiary,
            border: `1px solid ${tokens.divider}`,
          }}
        >
          <Hash className="h-3 w-3" />
          {formatNumber(charCount)} caracteres
        </span>
        <SaveIndicator
          tokens={tokens}
          saveState={saveState}
          now={now}
          isDirty={isDirty}
          value={value}
        />
      </div>
    </div>
  )
}

function SaveIndicator({
  tokens,
  saveState,
  now,
  isDirty,
  value,
}: {
  tokens: AppTokens
  saveState: SaveState
  now: number
  isDirty: boolean
  value: string
}) {
  if (saveState.kind === "error") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px]"
        style={{ color: "#ef4444" }}
        aria-live="assertive"
        title={saveState.message}
      >
        <AlertCircle className="h-3 w-3" />
        Falha ao salvar
      </span>
    )
  }
  if (saveState.kind === "saving") {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px]"
        style={{ color: tokens.textTertiary }}
        aria-live="polite"
      >
        <Loader2 className="h-3 w-3 animate-spin" />
        Salvando...
      </span>
    )
  }
  if (saveState.kind === "saved") {
    const secs = Math.max(0, Math.floor((now - saveState.at) / 1000))
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px]"
        style={{ color: tokens.textTertiary }}
        aria-live="polite"
      >
        <Check className="h-3 w-3" style={{ color: "#22c55e" }} />
        salvo ha {secs}s
      </span>
    )
  }
  if (!isDirty && value.length > 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[11px]"
        style={{ color: tokens.textTertiary }}
      >
        <Check className="h-3 w-3" style={{ color: tokens.textDisabled }} />
        sem alteracoes
      </span>
    )
  }
  return null
}
