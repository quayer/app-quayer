"use client"

import { ClipboardCopy, RefreshCw } from "lucide-react"
import type { AppTokens } from "./prompt-types"

interface PromptActionsProps {
  tokens: AppTokens
  onRegenerate: () => void
  onCopy: () => void | Promise<void>
}

export function PromptActions({
  tokens,
  onRegenerate,
  onCopy,
}: PromptActionsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onRegenerate}
        className="inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-medium transition-opacity hover:opacity-90"
        style={{
          backgroundColor: tokens.brand,
          color: tokens.textInverse,
        }}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Regenerar com Builder
      </button>
      <button
        type="button"
        onClick={() => {
          void onCopy()
        }}
        className="inline-flex h-9 items-center gap-2 rounded-lg border px-4 text-[13px] font-medium transition-colors"
        style={{
          borderColor: tokens.border,
          color: tokens.textPrimary,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = tokens.hoverBg
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent"
        }}
      >
        <ClipboardCopy className="h-3.5 w-3.5" />
        Copiar Prompt
      </button>
    </div>
  )
}
