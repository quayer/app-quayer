"use client"

/**
 * Controles de apresentação da aba Avançado — extraídos de advanced-tab.tsx
 * para manter o componente principal dentro do guideline de tamanho.
 */

import * as React from "react"
import { Badge } from "@/client/components/ui/badge"
import { Input } from "@/client/components/ui/input"
import { Switch } from "@/client/components/ui/switch"
import { useAppTokens } from "@/client/hooks/use-app-tokens"

export function SectionTitle({ title }: { title: string }) {
  const { tokens } = useAppTokens()
  return (
    <h4
      className="text-[11px] font-semibold uppercase tracking-[0.14em]"
      style={{ color: tokens.textTertiary }}
    >
      {title}
    </h4>
  )
}

export function SwitchCard({
  icon: Icon,
  title,
  description,
  enabled,
  badge,
  onChange,
}: {
  icon: React.ElementType
  title: string
  description: string
  enabled: boolean
  badge: string
  onChange: (value: boolean) => void
}) {
  const { tokens } = useAppTokens()
  return (
    <article
      className="flex min-h-[120px] flex-col justify-between rounded-lg border p-4"
      style={{
        borderColor: enabled ? tokens.brand : tokens.divider,
        backgroundColor: tokens.bgSurface,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: tokens.bgElevated, color: tokens.textSecondary }}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </div>
        <Switch checked={enabled} onCheckedChange={onChange} aria-label={title} />
      </div>

      <div className="mt-3 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h5 className="text-sm font-medium" style={{ color: tokens.textPrimary }}>
            {title}
          </h5>
          <Badge variant={enabled ? "secondary" : "outline"}>
            {enabled ? "Ativo" : "Inativo"}
          </Badge>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: tokens.textSecondary }}>
          {description}
        </p>
        <p className="text-[11px]" style={{ color: tokens.textTertiary }}>
          {badge}
        </p>
      </div>
    </article>
  )
}

/**
 * Input numérico que NÃO clampa a cada tecla: mantém o texto livre durante a
 * edição (dá para apagar o campo e digitar outro valor) e só valida/clampa no
 * blur ou Enter. Valor inválido/vazio volta ao último valor commitado.
 */
export function NumberSettingInput({
  value,
  min,
  max,
  onCommit,
  "aria-label": ariaLabel,
}: {
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
  "aria-label"?: string
}) {
  const [text, setText] = React.useState(() => String(value))

  React.useEffect(() => {
    setText(String(value))
  }, [value])

  const commit = React.useCallback(() => {
    const parsed = Number(text)
    if (text.trim() === "" || !Number.isFinite(parsed)) {
      setText(String(value))
      return
    }
    const clamped = Math.min(max, Math.max(min, Math.round(parsed)))
    setText(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }, [text, value, min, max, onCommit])

  return (
    <Input
      type="number"
      min={min}
      max={max}
      value={text}
      aria-label={ariaLabel}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur()
      }}
    />
  )
}
