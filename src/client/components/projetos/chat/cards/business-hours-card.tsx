"use client"

/**
 * Builder Cards — business_hours (Orayon Uplift, W3)
 *
 * Presentational card for the `business_hours` key. Lets the user pick a preset
 * (24/7, comercial seg-sex 09-18, or custom). "Custom" reveals a per-weekday
 * time-range editor with an optional lunch break per day. Serializes a clean
 * `WeeklySchedule` into `payload.schedule` and submits
 * `{ preset, schedule, timezone }` UP via props.onSubmit — it NEVER fetches
 * (chat-panel owns POST + SSE).
 *
 * Styling matches the existing chat-panel cards via CardShell + useAppTokens.
 *
 * Contract (CARD CONTRACTS): cardKey 'business_hours'
 *   payload  → { preset, schedule, timezone }
 *   owns     → hours.* (preset, schedule, timezone)
 *   sentinel → confirmations.hours
 */

import * as React from "react"
import { Clock } from "lucide-react"

import { Switch } from "@/client/components/ui/switch"
import type { CardComponentProps } from "./types"
import { CardShell } from "./card-shell"

// ==========================================
// Local serialized schedule shape (card-owned)
// ==========================================

/** Day-of-week keys in display order (Mon → Sun). */
const WEEKDAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const

type WeekdayKey = (typeof WEEKDAYS)[number]

const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Segunda",
  tue: "Terça",
  wed: "Quarta",
  thu: "Quinta",
  fri: "Sexta",
  sat: "Sábado",
  sun: "Domingo",
}

/** One serialized day in the schedule. `open: false` ⇒ closed (no ranges). */
interface DaySchedule {
  open: boolean
  /** Working window. */
  start: string
  end: string
  /** Optional lunch break (carved out of [start,end]). */
  lunch?: { start: string; end: string }
}

/** The full week, keyed by weekday. This is what goes into `payload.schedule`. */
type WeeklySchedule = Record<WeekdayKey, DaySchedule>

type HoursPreset = "24_7" | "commercial" | "custom"

/** EXACT submit payload for cardKey 'business_hours'. */
export interface BusinessHoursPayload {
  preset: HoursPreset
  schedule: WeeklySchedule
  timezone: string
}

// ==========================================
// Defaults / presets
// ==========================================

const DEFAULT_TIMEZONE = "America/Sao_Paulo"
const DEFAULT_OPEN = "09:00"
const DEFAULT_CLOSE = "18:00"
const DEFAULT_LUNCH_START = "12:00"
const DEFAULT_LUNCH_END = "13:00"

function closedDay(): DaySchedule {
  return { open: false, start: DEFAULT_OPEN, end: DEFAULT_CLOSE }
}

function openDay(
  start = DEFAULT_OPEN,
  end = DEFAULT_CLOSE,
  lunch?: { start: string; end: string },
): DaySchedule {
  return lunch ? { open: true, start, end, lunch } : { open: true, start, end }
}

/** 24/7: every day open all day, no lunch. */
function build24x7(): WeeklySchedule {
  return WEEKDAYS.reduce((acc, day) => {
    acc[day] = openDay("00:00", "23:59")
    return acc
  }, {} as WeeklySchedule)
}

/** Comercial: Mon-Fri 09-18, weekend closed. */
function buildCommercial(): WeeklySchedule {
  return WEEKDAYS.reduce((acc, day) => {
    const weekend = day === "sat" || day === "sun"
    acc[day] = weekend ? closedDay() : openDay(DEFAULT_OPEN, DEFAULT_CLOSE)
    return acc
  }, {} as WeeklySchedule)
}

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
// Pre-fill from BuilderState (best-effort, non-throwing)
// ==========================================

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function asTime(v: unknown, fallback: string): string {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : fallback
}

/** Coerce one persisted day (opaque JSON) into a DaySchedule. */
function coerceDay(raw: unknown): DaySchedule {
  if (!isObject(raw)) return closedDay()
  const open = raw.open !== false // default open unless explicitly closed
  const start = asTime(raw.start, DEFAULT_OPEN)
  const end = asTime(raw.end, DEFAULT_CLOSE)
  let lunch: { start: string; end: string } | undefined
  if (isObject(raw.lunch)) {
    lunch = {
      start: asTime(raw.lunch.start, DEFAULT_LUNCH_START),
      end: asTime(raw.lunch.end, DEFAULT_LUNCH_END),
    }
  }
  return open ? openDay(start, end, lunch) : closedDay()
}

/** Coerce the opaque persisted `hours.schedule` into a full WeeklySchedule. */
function coerceSchedule(raw: unknown): WeeklySchedule | null {
  if (!isObject(raw)) return null
  let sawAny = false
  const out = WEEKDAYS.reduce((acc, day) => {
    if (day in raw) {
      sawAny = true
      acc[day] = coerceDay(raw[day])
    } else {
      acc[day] = closedDay()
    }
    return acc
  }, {} as WeeklySchedule)
  return sawAny ? out : null
}

function normalizePreset(raw: string | undefined): HoursPreset {
  if (raw === "24_7" || raw === "commercial" || raw === "custom") return raw
  return "commercial"
}

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

  const toggleLunch = React.useCallback((day: WeekdayKey, enabled: boolean) => {
    setSchedule((current) => {
      const prev = current[day]
      const next: DaySchedule = enabled
        ? {
            ...prev,
            lunch: prev.lunch ?? {
              start: DEFAULT_LUNCH_START,
              end: DEFAULT_LUNCH_END,
            },
          }
        : { open: prev.open, start: prev.start, end: prev.end }
      return { ...current, [day]: next }
    })
  }, [])

  const patchLunch = React.useCallback(
    (day: WeekdayKey, patch: Partial<{ start: string; end: string }>) => {
      setSchedule((current) => {
        const prev = current[day]
        if (!prev.lunch) return current
        return {
          ...current,
          [day]: { ...prev, lunch: { ...prev.lunch, ...patch } },
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

  const handleConfirm = React.useCallback(() => {
    if (disabled) return
    onSubmit({
      preset,
      schedule: buildSubmitSchedule(),
      timezone: timezone.trim() || DEFAULT_TIMEZONE,
    })
  }, [buildSubmitSchedule, disabled, onSubmit, preset, timezone])

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
        <div className="mt-4 flex flex-col gap-2">
          {WEEKDAYS.map((day) => {
            const cfg = schedule[day]
            const hasLunch = Boolean(cfg.lunch)
            return (
              <div
                key={day}
                className="rounded-md border p-3"
                style={{
                  backgroundColor: tokens.bgBase,
                  borderColor: tokens.divider,
                }}
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

                {/* Lunch break (only for open days) */}
                {cfg.open && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-1">
                    <label className="flex items-center gap-2">
                      <Switch
                        checked={hasLunch}
                        disabled={disabled}
                        onCheckedChange={(checked) =>
                          toggleLunch(day, checked)
                        }
                        aria-label={`Pausa de almoço ${WEEKDAY_LABELS[day]}`}
                      />
                      <span
                        className="text-[12px]"
                        style={{ color: tokens.textSecondary }}
                      >
                        Pausa de almoço
                      </span>
                    </label>
                    {hasLunch && cfg.lunch && (
                      <div className="flex flex-wrap items-center gap-2">
                        <TimeField
                          tokens={tokens}
                          value={cfg.lunch.start}
                          disabled={disabled}
                          ariaLabel={`Início do almoço ${WEEKDAY_LABELS[day]}`}
                          onChange={(v) => patchLunch(day, { start: v })}
                        />
                        <span
                          className="text-[12px]"
                          style={{ color: tokens.textTertiary }}
                        >
                          às
                        </span>
                        <TimeField
                          tokens={tokens}
                          value={cfg.lunch.end}
                          disabled={disabled}
                          ariaLabel={`Fim do almoço ${WEEKDAY_LABELS[day]}`}
                          onChange={(v) => patchLunch(day, { end: v })}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
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
