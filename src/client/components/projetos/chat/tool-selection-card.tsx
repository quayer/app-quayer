"use client"

/**
 * ToolSelectionCard — inline card for the `propose_tool_selection` tool call.
 * Structural extraction from chat-panel.tsx (no behavior change).
 */

import * as React from "react"
import {
  Bell,
  Calendar,
  Check,
  Headphones,
  Info,
  Sparkles,
  Tag,
  UserPlus,
} from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

import type { CardKey } from "./cards/types"
import { getToolSelection, toolHelpText } from "./tool-call-helpers"

function ToolIcon({ icon }: { icon?: string }) {
  const className = "h-4 w-4"
  if (icon === "calendar") return <Calendar className={className} />
  if (icon === "tag") return <Tag className={className} />
  if (icon === "user-plus") return <UserPlus className={className} />
  if (icon === "headphones") return <Headphones className={className} />
  if (icon === "bell") return <Bell className={className} />
  return <Sparkles className={className} />
}

export function ToolSelectionCard({
  selection,
  tokens,
  onSubmitCard,
  disabled = false,
  selectedCapabilityKeys,
  selectedToolKeys,
}: {
  selection: NonNullable<ReturnType<typeof getToolSelection>>
  tokens: ReturnType<typeof useAppTokens>["tokens"]
  /** Card-action protocol submit — flips the `tool_selection` sentinel. */
  onSubmitCard: (cardKey: CardKey, payload: Record<string, unknown>) => void
  /** True while the assistant is streaming — blocks re-submitting the card. */
  disabled?: boolean
  /**
   * FR-17 (jornada-builder-v2) — seleção JÁ persistida no builderState
   * (`value.selectedCapabilityKeys` / `value.selectedToolKeys`). Quando
   * não-vazia, pré-seleciona em vez dos recomendados, para reabrir o card
   * preenchido com a decisão atual. Props OPCIONAIS/retro-compatíveis: sem
   * elas o comportamento legado (recommended) permanece.
   */
  selectedCapabilityKeys?: string[]
  selectedToolKeys?: string[]
}) {
  const recommended = React.useMemo(
    () =>
      selection.tools
        .filter((tool) => tool.recommended)
        .map((tool) => tool.key),
    [selection.tools],
  )
  // Pré-seleção: persistido (capabilityKeys, filtrado pelo catálogo ATUAL —
  // o catálogo server-side pode mudar/enxugar) → derivado dos toolKeys
  // persistidos → recommended. Nunca depende de chaves específicas do catálogo.
  const [selected, setSelected] = React.useState<string[]>(() => {
    const catalog = new Set(selection.tools.map((tool) => tool.key))
    const persisted = (selectedCapabilityKeys ?? []).filter((key) =>
      catalog.has(key),
    )
    if (persisted.length > 0) return persisted

    const persistedToolKeys = new Set(selectedToolKeys ?? [])
    if (persistedToolKeys.size > 0) {
      const derived = selection.tools
        .filter((tool) => tool.toolKeys.some((key) => persistedToolKeys.has(key)))
        .map((tool) => tool.key)
      if (derived.length > 0) return derived
    }

    return recommended
  })

  const toggleTool = React.useCallback((key: string) => {
    setSelected((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    )
  }, [])

  // Submit the typed payload via the card-action protocol (no free-text build).
  // `capabilityKeys` = curated catalog ids the user picked (tool.key);
  // `toolKeys` = the underlying BUILTIN_TOOL_NAMES, flattened + deduped. Both are
  // RE-VALIDATED server-side. An empty selection is a valid deterministic
  // "no extra tools" apply.
  const applySelection = React.useCallback(() => {
    const picked = selection.tools.filter((tool) => selected.includes(tool.key))
    const capabilityKeys = picked.map((tool) => tool.key)
    const toolKeys = Array.from(
      new Set(picked.flatMap((tool) => tool.toolKeys)),
    )

    onSubmitCard("tool_selection", {
      action: "apply",
      capabilityKeys,
      toolKeys,
    })
  }, [onSubmitCard, selected, selection.tools])

  return (
    <div
      className="max-w-[95%] rounded-lg border p-4"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold" style={{ color: tokens.textPrimary }}>
            Escolher ferramentas
          </p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: tokens.textSecondary }}>
            {selection.reason ??
              "Selecione o que este agente poderá fazer além de responder mensagens."}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {selection.tools.map((tool) => {
          const checked = selected.includes(tool.key)
          return (
            <button
              key={tool.key}
              type="button"
              role="checkbox"
              aria-checked={checked}
              disabled={disabled}
              onClick={() => toggleTool(tool.key)}
              className="group rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: checked ? tokens.brandSubtle : tokens.bgBase,
                borderColor: checked ? tokens.brand : tokens.divider,
              }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                  style={{
                    backgroundColor: checked ? tokens.brand : tokens.hoverBg,
                    color: checked ? tokens.textInverse : tokens.textSecondary,
                  }}
                >
                  <ToolIcon icon={tool.icon} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: tokens.textPrimary }}
                    >
                      {tool.title}
                    </span>
                    {tool.recommended && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: tokens.hoverBg,
                          color: tokens.textTertiary,
                        }}
                      >
                        recomendado
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed" style={{ color: tokens.textSecondary }}>
                    {tool.description}
                  </p>
                  <p className="mt-2 flex gap-1.5 text-[11px] leading-relaxed" style={{ color: tokens.textTertiary }}>
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{tool.note ?? toolHelpText(tool.key)}</span>
                  </p>
                </div>
                <span
                  aria-hidden="true"
                  className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                  style={{
                    backgroundColor: checked ? tokens.brand : "transparent",
                    borderColor: checked ? tokens.brand : tokens.divider,
                    color: checked ? tokens.textInverse : "transparent",
                  }}
                >
                  {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1.5 text-[12px]"
          onClick={applySelection}
          disabled={disabled}
        >
          <Check className="h-3.5 w-3.5" />
          Aplicar seleção
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-[12px]"
          // "No extra tools" is a deterministic empty apply (flips the same
          // sentinel) — not a free-text turn.
          onClick={() =>
            onSubmitCard("tool_selection", {
              action: "apply",
              capabilityKeys: [],
              toolKeys: [],
            })
          }
          disabled={disabled}
        >
          Sem ferramentas agora
        </Button>
      </div>
    </div>
  )
}
