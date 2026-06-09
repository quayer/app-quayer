"use client"

/**
 * Builder Cards — business_hours (Orayon Uplift W3 · G11 Onda C)
 *
 * Presentational card for the `business_hours` key. Lets the user pick a preset
 * (24/7, comercial seg-sex 09-18, or custom). "Custom" reveals a per-weekday
 * time-range editor where each open day can carve out MULTIPLE breaks (G11 —
 * the single optional lunch became a `breaks[]` list, e.g. lunch + a recurring
 * meeting). A mini-phone summary (SchedulePreviewPhone) shows each day's
 * effective window live, and the day row hovered/focused is highlighted in it.
 *
 * Serializes a clean `WeeklySchedule` into `payload.schedule` and submits
 * `{ preset, schedule, timezone }` UP via props.onSubmit — it NEVER fetches
 * (chat-panel owns POST + SSE). The submit payload SHAPE is unchanged; only the
 * opaque `schedule` now carries `breaks[]` instead of `lunch`.
 *
 * Backward-compat: a pre-G11 day saved as `{ lunch }` is coerced into `breaks[0]`
 * by `coerceDay` (schedule-shape.ts), so old saves render unchanged.
 *
 * Styling matches the existing chat-panel cards via CardShell + useAppTokens.
 *
 * Contract (CARD CONTRACTS): cardKey 'business_hours'
 *   payload  → { preset, schedule, timezone }
 *   owns     → hours.* (preset, schedule, timezone)
 *   sentinel → confirmations.hours
 */

import * as React from "react"
import { Clock, Plus, X } from "lucide-react"

import { Switch } from "@/client/components/ui/switch"

import { CardShell } from "./card-shell"
import type { CardComponentProps } from "./types"
import { SchedulePreviewPhone } from "./business-hours/SchedulePreviewPhone"
import {
  DEFAULT_BREAK_END,
  DEFAULT_BREAK_START,
  DEFAULT_TIMEZONE,
  MAX_BREAKS_PER_DAY,
  WEEKDAYS,
  WEEKDAY_LABELS,
  build24x7,
  buildCommercial,
  coerceSchedule,
  normalizePreset,
  openDay,
  type BreakInterval,
  type DaySchedule,
  type HoursPreset,
  type WeekdayKey,
  type WeeklySchedule,
} from "./business-hours/schedule-shape"

/** Comportamento do agente FORA do horário de atendimento (Onda 3d). */
export type OutOfHoursBehavior = "reply_notice" | "silent"

/** EXACT submit payload for cardKey 'business_hours'. */
export interface BusinessHoursPayload {
  preset: HoursPreset
  schedule: WeeklySchedule
  timezone: string
  // Onda 3d — fora do horário: responde avisando ('reply_notice') ou fica em
  // silêncio ('silent'). Pré-preenchido de value.hours.outOfHours (default reply_notice).
  outOfHours: OutOfHoursBehavior
}

const OUT_OF_HOURS_OPTIONS: ReadonlyArray<{
  key: OutOfHoursBehavior
  label: string
  hint: string
}> = [
  {
    key: "reply_notice",
    label: "Responde avisando",
    hint: "Fora do horário, avisa que está fora do expediente",
  },
  {
    key: "silent",
    label: "Fica em silêncio",
    hint: "Fora do horário, não responde até reabrir",
  },
]

const PRESET_OPTIONS: ReadonlyArray<{
  key: HoursPreset
  label: string
  hint: string
}> = [
  { key: "24_7", label: "24/7", hint: "Sempre disponível, todos os dias" },
  {
    key: "commercial",
    label: "Comercial",
    hint: "Seg a Sex, 09:00 às 18:00",
  },
  {
    key: "custom",
    label: "Personalizado",
    hint: "Defina cada dia manualmente",
  },
]

// ==========================================
// Component
// ==========================================

export function BusinessHoursCard({
  value,
  disabled = false,
  onSubmit,
  onDismiss,
  tokens,
}: CardComponentProps<BusinessHoursPayload>) {
  const hours = value.hours

  const initialPreset = React.useMemo(
    () => normalizePreset(hours.preset),
    [hours.preset],
  )
  const initialSchedule = React.useMemo<WeeklySchedule>(() => {
    const persisted = coerceSchedule(hours.schedule)
    if (persisted) return persisted
    if (initialPreset === "24_7") return build24x7()
    return buildCommercial()
  }, [hours.schedule, initialPreset])

  const [preset, setPreset] = React.useState<HoursPreset>(initialPreset)
  const [timezone, setTimezone] = React.useState<string>(
    hours.timezone && hours.timezone.length > 0
      ? hours.timezone
      : DEFAULT_TIMEZONE,
  )
  // The editable per-day schedule (only used/shown when preset === "custom",
  // but kept seeded so toggling to custom shows sensible defaults).
  const [schedule, setSchedule] =
    React.useState<WeeklySchedule>(initialSchedule)
  // Which day row the cursor/focus is on — drives the preview highlight.
  const [highlightDay, setHighlightDay] = React.useState<WeekdayKey | null>(
    null,
  )
  // Onda 3d — comportamento fora do horário, pré-preenchido do state (default
  // 'reply_notice' quando ausente). É additivo: states legados caem no default.
  const [outOfHours, setOutOfHours] = React.useState<OutOfHoursBehavior>(
    hours.outOfHours === "silent" ? "silent" : "reply_notice",
  )

  const agentName =
    typeof value.persona?.name === "string" && value.persona.name.trim()
      ? value.persona.name.trim()
      : "Seu agente"

  const selectPreset = React.useCallback((next: HoursPreset) => {
    setPreset(next)
    if (next === "24_7") setSchedule(build24x7())
    else if (next === "commercial") setSchedule(buildCommercial())
    // "custom": keep current schedule so the editor reflects what's there.
  }, [])

  const patchDay = React.useCallback(
    (day: WeekdayKey, patch: Partial<DaySchedule>) => {
      setSchedule((current) => ({
        ...current,
        [day]: { ...current[day], ...patch },
      }))
    },
    [],
  )

  /** Replace the whole breaks[] array for a day (capped). */
  const setDayBreaks = React.useCallback(
    (day: WeekdayKey, breaks: BreakInterval[]) => {
      setSchedule((current) => {
        const prev = current[day]
        return {
          ...current,
          // Re-run openDay so an empty list drops the `breaks` key entirely.
          [day]: openDay(prev.start, prev.end, breaks),
        }
      })
    },
    [],
  )

  const addBreak = React.useCallback(
    (day: WeekdayKey) => {
      setSchedule((current) => {
        const prev = current[day]
        const existing = prev.breaks ?? []
        if (existing.length >= MAX_BREAKS_PER_DAY) return current
        const next = [
          ...existing,
          { start: DEFAULT_BREAK_START, end: DEFAULT_BREAK_END },
        ]
        return {
          ...current,
          [day]: openDay(prev.start, prev.end, next),
        }
      })
    },
    [],
  )

  const removeBreak = React.useCallback(
    (day: WeekdayKey, index: number) => {
      setSchedule((current) => {
        const prev = current[day]
        const existing = prev.breaks ?? []
        const next = existing.filter((_, i) => i !== index)
        return {
          ...current,
          [day]: openDay(prev.start, prev.end, next),
        }
      })
    },
    [],
  )

  const patchBreak = React.useCallback(
    (day: WeekdayKey, index: number, patch: Partial<BreakInterval>) => {
      setSchedule((current) => {
        const prev = current[day]
        const existing = prev.breaks ?? []
        if (index < 0 || index >= existing.length) return current
        const next = existing.map((b, i) =>
          i === index ? { ...b, ...patch } : b,
        )
        return {
          ...current,
          [day]: openDay(prev.start, prev.end, next),
        }
      })
    },
    [],
  )

  /** Serialize the final clean schedule for submission. */
  const buildSubmitSchedule = React.useCallback((): WeeklySchedule => {
    if (preset === "24_7") return build24x7()
    if (preset === "commercial") return buildCommercial()
    return schedule
  }, [preset, schedule])

  /** The schedule the preview reflects (preset-derived or live custom). */
  const previewSchedule = React.useMemo<WeeklySchedule>(() => {
    if (preset === "24_7") return build24x7()
    if (preset === "commercial") return buildCommercial()
    return schedule
  }, [preset, schedule])

  const handleConfirm = React.useCallback(() => {
    if (disabled) return
    onSubmit({
      preset,
      schedule: buildSubmitSchedule(),
      timezone: timezone.trim() || DEFAULT_TIMEZONE,
      outOfHours,
    })
  }, [buildSubmitSchedule, disabled, onSubmit, outOfHours, preset, timezone])

  return (
    <CardShell
      tokens={tokens}
      icon={<Clock className="h-4 w-4" />}
      title="Horário de atendimento"
      reason="Quando o agente deve atender ativamente? Escolha um preset ou personalize cada dia."
      actions={[
        {
          label: "Confirmar horário",
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
      {/* Preset selector */}
      <div className="grid gap-2 sm:grid-cols-3">
        {PRESET_OPTIONS.map((option) => {
          const active = preset === option.key
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => selectPreset(option.key)}
              className="rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                backgroundColor: active ? tokens.brandSubtle : tokens.bgBase,
                borderColor: active ? tokens.brand : tokens.divider,
              }}
            >
              <span
                className="block text-[13px] font-medium"
                style={{ color: tokens.textPrimary }}
              >
                {option.label}
              </span>
              <span
                className="mt-1 block text-[11px] leading-relaxed"
                style={{ color: tokens.textSecondary }}
              >
                {option.hint}
              </span>
            </button>
          )
        })}
      </div>

      {/* Per-weekday editor (custom only) */}
      {preset === "custom" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_minmax(220px,280px)]">
          <div className="flex flex-col gap-2">
            {WEEKDAYS.map((day) => {
              const cfg = schedule[day]
              const dayBreaks = cfg.breaks ?? []
              const canAdd = dayBreaks.length < MAX_BREAKS_PER_DAY
              return (
                <div
                  key={day}
                  className="rounded-md border p-3 transition-colors"
                  style={{
                    backgroundColor: tokens.bgBase,
                    borderColor:
                      highlightDay === day ? tokens.brand : tokens.divider,
                  }}
                  onMouseEnter={() => setHighlightDay(day)}
                  onMouseLeave={() =>
                    setHighlightDay((cur) => (cur === day ? null : cur))
                  }
                  onFocusCapture={() => setHighlightDay(day)}
                  onBlurCapture={() =>
                    setHighlightDay((cur) => (cur === day ? null : cur))
                  }
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex w-28 shrink-0 items-center gap-2">
                      <Switch
                        checked={cfg.open}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                          patchDay(day, { open: checked })
                        }
                        aria-label={`Atender ${WEEKDAY_LABELS[day]}`}
                      />
                      <span
                        className="text-[13px] font-medium"
                        style={{ color: tokens.textPrimary }}
                      >
                        {WEEKDAY_LABELS[day]}
                      </span>
                    </label>

                    {cfg.open ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <TimeField
                          tokens={tokens}
                          value={cfg.start}
                          disabled={disabled}
                          ariaLabel={`Abertura ${WEEKDAY_LABELS[day]}`}
                          onChange={(v) => patchDay(day, { start: v })}
                        />
                        <span
                          className="text-[12px]"
                          style={{ color: tokens.textTertiary }}
                        >
                          às
                        </span>
                        <TimeField
                          tokens={tokens}
                          value={cfg.end}
                          disabled={disabled}
                          ariaLabel={`Fechamento ${WEEKDAY_LABELS[day]}`}
                          onChange={(v) => patchDay(day, { end: v })}
                        />
                      </div>
                    ) : (
                      <span
                        className="text-[12px]"
                        style={{ color: tokens.textTertiary }}
                      >
                        Fechado
                      </span>
                    )}
                  </div>

                  {/* Breaks (only for open days) */}
                  {cfg.open && (
                    <div className="mt-2 flex flex-col gap-2 pl-1">
                      {dayBreaks.map((brk, index) => (
                        <div
                          key={index}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <span
                            className="w-14 shrink-0 text-[12px]"
                            style={{ color: tokens.textSecondary }}
                          >
                            Pausa
                          </span>
                          <TimeField
                            tokens={tokens}
                            value={brk.start}
                            disabled={disabled}
                            ariaLabel={`Início da pausa ${index + 1} ${WEEKDAY_LABELS[day]}`}
                            onChange={(v) =>
                              patchBreak(day, index, { start: v })
                            }
                          />
                          <span
                            className="text-[12px]"
                            style={{ color: tokens.textTertiary }}
                          >
                            às
                          </span>
                          <TimeField
                            tokens={tokens}
                            value={brk.end}
                            disabled={disabled}
                            ariaLabel={`Fim da pausa ${index + 1} ${WEEKDAY_LABELS[day]}`}
                            onChange={(v) => patchBreak(day, index, { end: v })}
                          />
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => removeBreak(day, index)}
                            aria-label={`Remover pausa ${index + 1} ${WEEKDAY_LABELS[day]}`}
                            className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                            style={{
                              borderColor: tokens.divider,
                              color: tokens.textTertiary,
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}

                      {canAdd && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => addBreak(day)}
                          className="flex w-fit items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                          style={{
                            borderColor: tokens.divider,
                            color: tokens.brandText,
                            backgroundColor: tokens.bgSurface,
                          }}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar intervalo
                        </button>
                      )}
                      {!canAdd && (
                        <span
                          className="text-[11px]"
                          style={{ color: tokens.textTertiary }}
                        >
                          Máximo de {MAX_BREAKS_PER_DAY} intervalos por dia.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Live mini-phone summary (open window minus every break). */}
          <div className="flex flex-col gap-2">
            <span
              className="text-[11px] font-medium uppercase tracking-wide"
              style={{ color: tokens.textTertiary }}
            >
              Prévia da semana
            </span>
            <SchedulePreviewPhone
              schedule={previewSchedule}
              agentName={agentName}
              highlightDay={highlightDay}
              tokens={tokens}
            />
          </div>
        </div>
      )}

      {/* Timezone */}
      <div className="mt-4">
        <label
          htmlFor="business-hours-timezone"
          className="mb-1 block text-[12px] font-medium"
          style={{ color: tokens.textSecondary }}
        >
          Fuso horário
        </label>
        <input
          id="business-hours-timezone"
          type="text"
          value={timezone}
          disabled={disabled}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder={DEFAULT_TIMEZONE}
          className="h-9 w-full max-w-xs rounded-md border px-3 text-[13px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            backgroundColor: tokens.bgBase,
            borderColor: tokens.divider,
            color: tokens.textPrimary,
          }}
        />
      </div>

      {/* Out-of-hours behavior (Onda 3d) */}
      <div className="mt-4">
        <span
          className="mb-1 block text-[12px] font-medium"
          style={{ color: tokens.textSecondary }}
        >
          Fora do horário
        </span>
        <div
          className="grid gap-2 sm:grid-cols-2"
          role="radiogroup"
          aria-label="Comportamento fora do horário"
        >
          {OUT_OF_HOURS_OPTIONS.map((option) => {
            const active = outOfHours === option.key
            return (
              <button
                key={option.key}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => setOutOfHours(option.key)}
                className="rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  backgroundColor: active ? tokens.brandSubtle : tokens.bgBase,
                  borderColor: active ? tokens.brand : tokens.divider,
                }}
              >
                <span
                  className="block text-[13px] font-medium"
                  style={{ color: tokens.textPrimary }}
                >
                  {option.label}
                </span>
                <span
                  className="mt-1 block text-[11px] leading-relaxed"
                  style={{ color: tokens.textSecondary }}
                >
                  {option.hint}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </CardShell>
  )
}

// ==========================================
// TimeField — native <input type="time"> styled with tokens
// ==========================================

function TimeField({
  value,
  onChange,
  disabled,
  ariaLabel,
  tokens,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  ariaLabel: string
  tokens: CardComponentProps["tokens"]
}) {
  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 rounded-md border px-2 text-[13px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        backgroundColor: tokens.bgSurface,
        borderColor: tokens.divider,
        color: tokens.textPrimary,
      }}
    />
  )
}

export default BusinessHoursCard
