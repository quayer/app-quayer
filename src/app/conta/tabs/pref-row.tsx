'use client'

/**
 * PrefRow — switch row shared by NotificacoesTab and OtpMethodsSection.
 * Structural extraction from conta-client.tsx (no behavior change).
 */

import { Label } from '@/client/components/ui/label'
import { Switch } from '@/client/components/ui/switch'

export function PrefRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string
  label: string
  description: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="space-y-0.5 flex-1 min-w-0">
        <Label
          htmlFor={id}
          className={`text-sm font-medium leading-none ${disabled ? 'text-muted-foreground cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}
