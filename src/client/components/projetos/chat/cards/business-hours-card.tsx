"use client"

/**
 * Builder Cards — business_hours (Orayon Uplift W3 · G11 Onda C · split T42)
 *
 * Standalone card for the `business_hours` key, kept for the reopen flow (FR-17).
 * As of Jornada v2 / T42 the entire FORM BODY (preset picker, per-weekday editor
 * with multiple breaks, live SchedulePreviewPhone, timezone, out-of-hours) lives
 * in the reusable `review/hours-section.tsx` — this card is now a THIN wrapper
 * that adds the CardShell chrome plus its own confirm/dismiss footer, so the same
 * inputs serve both this card and the composed `agent_review` card (T43) with
 * zero duplication.
 *
 * The section is CONTROLLED-OUTPUT: it emits the built `BusinessHoursPayload` via
 * `onChange` on mount and on every edit; this card keeps the latest one and POSTs
 * it on confirm (it NEVER fetches — chat-panel owns POST + SSE).
 *
 * Prefill precedence (owned > capturedProposals > default equipe 24/7) and the
 * default both live in the section (spec §9 decisão 3).
 *
 * Contract (CARD CONTRACTS): cardKey 'business_hours'
 *   payload  → { preset, schedule, timezone, outOfHours }
 *   owns     → hours.* (preset, schedule, timezone, outOfHours)
 *   sentinel → confirmations.hours
 */

import * as React from "react"
import { Clock } from "lucide-react"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import {
  HoursSection,
  type BusinessHoursPayload,
  type OutOfHoursBehavior,
} from "./review/hours-section"

// Re-export the section's payload types so existing importers of the card keep
// their public API (the SHAPE is unchanged from the pre-split card).
export type { BusinessHoursPayload, OutOfHoursBehavior }

export function BusinessHoursCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<BusinessHoursPayload>) {
  // The section emits its built payload up via onChange; we keep the latest one
  // in a ref so the confirm action submits exactly what the editor shows without
  // re-rendering the shell on every keystroke.
  const payloadRef = React.useRef<BusinessHoursPayload | null>(null)
  const handleChange = React.useCallback((payload: BusinessHoursPayload) => {
    payloadRef.current = payload
  }, [])

  const handleConfirm = React.useCallback(() => {
    if (disabled) return
    if (payloadRef.current) onSubmit(payloadRef.current)
  }, [disabled, onSubmit])

  return (
    <CardShell
      tokens={tokens}
      icon={<Clock className="h-4 w-4" />}
      title="Horário da equipe humana"
      reason="A IA responde 24/7. Defina quando a equipe comercial pode assumir ou retornar."
      actions={[
        {
          label: "Confirmar horário da equipe",
          onClick: handleConfirm,
          variant: "primary",
          disabled,
        },
        ...(onDismiss
          ? [
              {
                label: "Agora não",
                onClick: onDismiss,
                variant: "secondary" as const,
                disabled,
              },
            ]
          : []),
      ]}
    >
      <HoursSection
        value={value}
        disabled={disabled}
        tokens={tokens}
        onChange={handleChange}
      />
    </CardShell>
  )
}

export default BusinessHoursCard
