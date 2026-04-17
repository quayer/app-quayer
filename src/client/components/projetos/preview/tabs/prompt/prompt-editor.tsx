"use client"

import { useMemo, useRef } from "react"
import {
  ClipboardCopy,
  Maximize2,
  Minimize2,
  RefreshCw,
} from "lucide-react"
import { Textarea } from "@/client/components/ui/textarea"
import { ToolbarButton } from "./toolbar-button"
import type { AppTokens } from "./prompt-types"

interface PromptEditorProps {
  tokens: AppTokens
  value: string
  onChange: (v: string) => void
  lineCount: number
  expanded: boolean
  onToggleExpand: () => void
  onRegenerate: () => void
  onCopy: () => void | Promise<void>
}

export function PromptEditor({
  tokens,
  value,
  onChange,
  lineCount,
  expanded,
  onToggleExpand,
  onRegenerate,
  onCopy,
}: PromptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  return (
    <div
      className="overflow-hidden rounded-2xl border transition-all focus-within:shadow-[0_0_0_3px_rgba(255,214,10,0.15)]"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.borderStrong,
      }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-1 border-b px-3 py-1.5"
        style={{ borderColor: tokens.divider }}
      >
        <ToolbarButton
          tokens={tokens}
          onClick={onRegenerate}
          title="Regenerar com Builder"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Regenerar</span>
        </ToolbarButton>
        <ToolbarButton
          tokens={tokens}
          onClick={() => {
            void onCopy()
          }}
          title="Copiar prompt"
        >
          <ClipboardCopy className="h-3.5 w-3.5" />
          <span>Copiar</span>
        </ToolbarButton>
        <div className="flex-1" />
        <ToolbarButton
          tokens={tokens}
          onClick={onToggleExpand}
          title={expanded ? "Reduzir editor" : "Expandir editor"}
        >
          {expanded ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </ToolbarButton>
      </div>

      {/* Editor with line numbers */}
      <div className="flex">
        <LineNumbers count={lineCount} tokens={tokens} />
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="O Builder gerara o prompt automaticamente durante a conversa. Voce tambem pode escrever manualmente aqui."
          className={`flex-1 resize-none border-0 bg-transparent font-mono text-[13px] leading-relaxed shadow-none focus-visible:ring-0 ${
            expanded ? "min-h-[600px]" : "min-h-[340px]"
          }`}
          style={{ color: tokens.textPrimary }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// LineNumbers — CSS-driven gutter
// ---------------------------------------------------------------------------

function LineNumbers({
  count,
  tokens,
}: {
  count: number
  tokens: AppTokens
}) {
  const lines = useMemo(() => {
    const arr: number[] = []
    for (let i = 1; i <= count; i++) arr.push(i)
    return arr
  }, [count])

  return (
    <div
      className="pointer-events-none select-none border-r py-2 pr-2 text-right font-mono text-[11px] leading-relaxed"
      style={{
        color: tokens.textDisabled,
        borderColor: tokens.divider,
        minWidth: "3rem",
      }}
      aria-hidden
    >
      {lines.map((n) => (
        <div key={n}>{n}</div>
      ))}
    </div>
  )
}
