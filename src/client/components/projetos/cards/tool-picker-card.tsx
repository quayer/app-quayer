"use client"

import * as React from "react"
import {
  Bell,
  Calendar,
  Check,
  Headphones,
  Tag,
  UserPlus,
  Wrench,
} from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Card, CardContent } from "@/client/components/ui/card"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

export type ToolIcon = "calendar" | "tag" | "user-plus" | "headphones" | "bell"

export interface ToolOption {
  key: string
  title: string
  description: string
  icon: ToolIcon
  recommended: boolean
}

interface ToolPickerCardProps {
  tools: ToolOption[]
  tokens: AppTokens
  /** Called with the final selected tool keys when user clicks Aplicar */
  onApply?: (selectedKeys: string[]) => void
  disabled?: boolean
  reason?: string | null
}

const ICON_MAP: Record<ToolIcon, React.ElementType> = {
  calendar: Calendar,
  tag: Tag,
  "user-plus": UserPlus,
  headphones: Headphones,
  bell: Bell,
}

/**
 * ToolPickerCard — multi-select picker for real agent capabilities. The
 * `recommended` flag pre-checks an option. User toggles, then clicks
 * Aplicar; the adapter translates the selection into a follow-up chat
 * message listing the chosen tool keys.
 */
export function ToolPickerCard({
  tools,
  tokens,
  onApply,
  disabled = false,
  reason,
}: ToolPickerCardProps) {
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(tools.filter((t) => t.recommended).map((t) => t.key)),
  )

  const toggle = (key: string) => {
    if (disabled) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectedCount = selected.size

  return (
    <Card
      className="overflow-hidden border shadow-none"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.border,
        borderRadius: "16px",
      }}
    >
      <CardContent className="p-0">
        <div
          className="flex items-center gap-2.5 px-4 py-3"
          style={{ backgroundColor: tokens.hoverBg }}
        >
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: tokens.brandSubtle,
              color: tokens.brand,
            }}
          >
            <Wrench className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[13px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              Capacidades do agente
            </p>
            <p
              className="truncate text-[11px]"
              style={{ color: tokens.textTertiary }}
            >
              {reason ?? "Escolha o que seu agente pode fazer"}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 px-3 py-3">
          {tools.map((t) => {
            const Icon = ICON_MAP[t.icon]
            const isSelected = selected.has(t.key)
            return (
              <button
                key={t.key}
                type="button"
                disabled={disabled}
                onClick={() => toggle(t.key)}
                className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  borderColor: isSelected
                    ? tokens.brandBorder
                    : tokens.border,
                  backgroundColor: isSelected
                    ? tokens.brandSubtle
                    : "transparent",
                }}
              >
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: isSelected
                      ? tokens.brand
                      : tokens.hoverBg,
                    color: isSelected
                      ? tokens.textInverse
                      : tokens.textSecondary,
                  }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p
                      className="text-[13px] font-medium"
                      style={{
                        color: isSelected
                          ? tokens.brandText
                          : tokens.textPrimary,
                      }}
                    >
                      {t.title}
                    </p>
                    {t.recommended && (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                        style={{
                          backgroundColor: tokens.brandSubtle,
                          color: tokens.brand,
                        }}
                      >
                        sugerido
                      </span>
                    )}
                  </div>
                  <p
                    className="text-[11px]"
                    style={{ color: tokens.textTertiary }}
                  >
                    {t.description}
                  </p>
                </div>
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border"
                  style={{
                    borderColor: isSelected
                      ? tokens.brand
                      : tokens.border,
                    backgroundColor: isSelected
                      ? tokens.brand
                      : "transparent",
                    color: tokens.textInverse,
                  }}
                  aria-hidden
                >
                  {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                </div>
              </button>
            )
          })}
        </div>

        <div
          className="flex items-center justify-between gap-2 border-t px-4 py-3"
          style={{ borderColor: tokens.divider }}
        >
          <span
            className="text-[11px]"
            style={{ color: tokens.textTertiary }}
          >
            {selectedCount} selecionada{selectedCount === 1 ? "" : "s"}
          </span>
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-lg text-[13px] font-medium"
            style={{
              backgroundColor: tokens.brand,
              color: tokens.textInverse,
            }}
            onClick={() => onApply?.(Array.from(selected))}
            disabled={disabled || selectedCount === 0}
          >
            <Check className="h-3.5 w-3.5" />
            Ativar capacidades
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
