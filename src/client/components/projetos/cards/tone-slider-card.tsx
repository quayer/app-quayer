"use client"

import * as React from "react"
import { Check, SlidersHorizontal } from "lucide-react"

import { Button } from "@/client/components/ui/button"
import { Card, CardContent } from "@/client/components/ui/card"
import { Slider } from "@/client/components/ui/slider"
import type { AppTokens } from "@/client/hooks/use-app-tokens"

export interface ToneValues {
  formality: number
  energy: number
  emoji: number
  verbosity: number
}

interface ToneSliderCardProps {
  initialTone: ToneValues
  tokens: AppTokens
  onApply?: (tone: ToneValues) => void
  disabled?: boolean
}

const AXES: Array<{
  key: keyof ToneValues
  leftLabel: string
  rightLabel: string
  heading: string
}> = [
  {
    key: "formality",
    heading: "Formalidade",
    leftLabel: "Casual",
    rightLabel: "Formal",
  },
  {
    key: "energy",
    heading: "Energia",
    leftLabel: "Calmo",
    rightLabel: "Empolgado",
  },
  {
    key: "emoji",
    heading: "Emojis",
    leftLabel: "Nenhum",
    rightLabel: "Muitos",
  },
  {
    key: "verbosity",
    heading: "Detalhe",
    leftLabel: "Direto",
    rightLabel: "Verboso",
  },
]

/**
 * ToneSliderCard — 4 sliders (0-1) so the user can dial in prompt tone
 * with numerical precision instead of fuzzy English. Emits a ToneValues
 * object on Apply — the adapter translates it into a chat message that
 * triggers update_agent_prompt downstream.
 */
export function ToneSliderCard({
  initialTone,
  tokens,
  onApply,
  disabled = false,
}: ToneSliderCardProps) {
  const [values, setValues] = React.useState<ToneValues>(initialTone)

  const handleChange = (key: keyof ToneValues, next: number[]) => {
    const n = next[0]
    if (typeof n !== "number") return
    setValues((prev) => ({ ...prev, [key]: n / 100 }))
  }

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
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-[13px] font-semibold"
              style={{ color: tokens.textPrimary }}
            >
              Ajuste de tom
            </p>
            <p
              className="truncate text-[11px]"
              style={{ color: tokens.textTertiary }}
            >
              Mexa os sliders e aplique para re-gerar o prompt
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 px-4 py-4">
          {AXES.map((axis) => (
            <div key={axis.key} className="flex flex-col gap-1.5">
              <p
                className="text-[12px] font-medium"
                style={{ color: tokens.textPrimary }}
              >
                {axis.heading}
              </p>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[Math.round(values[axis.key] * 100)]}
                onValueChange={(v) => handleChange(axis.key, v)}
                disabled={disabled}
              />
              <div
                className="flex items-center justify-between text-[10px]"
                style={{ color: tokens.textTertiary }}
              >
                <span>{axis.leftLabel}</span>
                <span>{axis.rightLabel}</span>
              </div>
            </div>
          ))}
        </div>

        <div
          className="flex items-center justify-end gap-2 border-t px-4 py-3"
          style={{ borderColor: tokens.divider }}
        >
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-lg text-[13px] font-medium"
            style={{
              backgroundColor: tokens.brand,
              color: tokens.textInverse,
            }}
            onClick={() => onApply?.(values)}
            disabled={disabled}
          >
            <Check className="h-3.5 w-3.5" />
            Aplicar ajustes
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
