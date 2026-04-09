"use client"

/**
 * PromptTab — editor manual do system prompt do agente
 *
 * Tema reativo via useAppTokens. Auto-save stubado (2s debounce)
 * até o endpoint de prompt-versions existir.
 */

import { useEffect, useRef, useState } from "react"
import { Bot, Save, MessageSquare, Check, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/client/components/ui/card"
import { Textarea } from "@/client/components/ui/textarea"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { WorkspaceProject } from "@/client/components/projetos/types"

interface PromptTabProps {
  project: WorkspaceProject
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }

// TODO: replace with GET /api/v1/builder/prompt-versions?agentId=...
const MOCK_VERSIONS: Array<{
  id: string
  version: number
  label: string
  at: string
}> = [
  { id: "v2", version: 2, label: "Ajuste de tom formal", at: "há 2h" },
  { id: "v1", version: 1, label: "Versão inicial", at: "há 1d" },
]

export function PromptTab({ project }: PromptTabProps) {
  const { tokens } = useAppTokens()
  const initial = project.aiAgent?.systemPrompt ?? ""
  const [value, setValue] = useState(initial)
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" })
  const [tick, setTick] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (value === initial) return
    if (timerRef.current) clearTimeout(timerRef.current)
    setSaveState({ kind: "saving" })
    timerRef.current = setTimeout(() => {
      // TODO: POST /api/v1/builder/prompt-versions
      setSaveState({ kind: "saved", at: Date.now() })
    }, 2000)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [value, initial])

  useEffect(() => {
    if (saveState.kind !== "saved") return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [saveState.kind])

  if (!project.aiAgent) {
    return (
      <EmptyState tokens={tokens}>
        Aguardando o Builder criar o agente. Continue a conversa no chat.
      </EmptyState>
    )
  }

  const SaveIndicator = () => {
    if (saveState.kind === "saving") {
      return (
        <span
          className="inline-flex items-center gap-1.5 text-[11px]"
          style={{ color: tokens.textTertiary }}
          aria-live="polite"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          salvando…
        </span>
      )
    }
    if (saveState.kind === "saved") {
      const secs = Math.max(0, Math.floor((Date.now() - saveState.at) / 1000))
      void tick
      return (
        <span
          className="inline-flex items-center gap-1.5 text-[11px]"
          style={{ color: tokens.textTertiary }}
          aria-live="polite"
        >
          <Check className="h-3 w-3" style={{ color: tokens.brand }} />
          salvo há {secs}s
        </span>
      )
    }
    return null
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2
            className="text-lg font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            Prompt do agente
          </h2>
          <p
            className="mt-0.5 text-[13px]"
            style={{ color: tokens.textSecondary }}
          >
            Edite o system prompt. Alterações são salvas automaticamente.
          </p>
        </div>
        <SaveIndicator />
      </div>

      {/* Editor card */}
      <div
        className="rounded-2xl border transition-all focus-within:shadow-[0_0_0_3px_rgba(255,214,10,0.15)]"
        style={{
          backgroundColor: tokens.bgSurface,
          borderColor: tokens.borderStrong,
        }}
      >
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Escreva o system prompt do agente…"
          className="min-h-[340px] resize-none border-0 bg-transparent font-mono text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
          style={{ color: tokens.textPrimary }}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            console.log("[prompt-tab] save checkpoint stub")
          }}
          className="inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[13px] font-medium transition-opacity hover:opacity-90"
          style={{
            backgroundColor: tokens.brand,
            color: tokens.textInverse,
          }}
        >
          <Save className="h-3.5 w-3.5" />
          Salvar checkpoint
        </button>
        <button
          type="button"
          onClick={() => {
            console.log("[prompt-tab] continue in chat stub")
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
          <MessageSquare className="h-3.5 w-3.5" />
          Continuar no chat
        </button>
      </div>

      {/* Version history */}
      <section>
        <h3
          className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: tokens.textTertiary }}
        >
          Versões anteriores
        </h3>
        <div className="flex flex-col gap-2">
          {MOCK_VERSIONS.map((v) => (
            <Card
              key={v.id}
              className="border p-0 shadow-none"
              style={{
                backgroundColor: tokens.bgSurface,
                borderColor: tokens.divider,
              }}
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[13px] font-semibold"
                    style={{ color: tokens.textPrimary }}
                  >
                    v{v.version} — {v.label}
                  </div>
                  <div
                    className="mt-0.5 text-[11px]"
                    style={{ color: tokens.textTertiary }}
                  >
                    {v.at}
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  className="text-[12px] opacity-50"
                  style={{ color: tokens.textTertiary }}
                  title="Restore em breve"
                >
                  Restaurar
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

function EmptyState({
  children,
  tokens,
}: {
  children: React.ReactNode
  tokens: ReturnType<typeof useAppTokens>["tokens"]
}) {
  return (
    <div className="mx-auto flex min-h-[280px] max-w-md flex-col items-center justify-center gap-3 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-2xl"
        style={{
          backgroundColor: tokens.brandSubtle,
          color: tokens.brand,
        }}
      >
        <Bot className="h-5 w-5" />
      </div>
      <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
        {children}
      </p>
    </div>
  )
}
