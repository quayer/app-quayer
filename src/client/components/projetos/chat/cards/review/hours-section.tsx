"use client"

/**
 * Builder Cards — review/hours-section (Jornada v2 · T42)
 *
 * The `business_hours` form BODY extracted out of `business-hours-card.tsx` so the
 * SAME inputs serve both surfaces with ZERO duplication:
 *   - the standalone `business-hours-card.tsx` (kept for reopen — FR-17), which
 *     wraps this section in a CardShell with its own confirm/dismiss actions, and
 *   - the composed `agent_review` card (T43), which renders the three review
 *     sections and submits ONE payload.
 *
 * This is a CONTROLLED-OUTPUT section: it owns its internal form state (preset /
 * schedule / timezone / out-of-hours) and emits the built `BusinessHoursPayload`
 * UP via `onChange` on mount and on every edit. The host owns the submit/POST —
 * the section NEVER fetches and renders no footer buttons.
 *
 * PREFILL PRECEDENCE (plan §7, line 153 — `owned > capturedProposals > default`):
 *   1. owned        — a persisted/confirmed `value.hours` (preset/schedule/tz)
 *   2. capturedProposals — `value.capturedProposals.hours.preset` (preset only)
 *   3. default      — equipe humana 24/7, spec §9 decisão 3. The default lives
 *                     HERE in the component (not in the handler), so an untouched
 *                     review does not imply the AI ever stops answering.
 *
 * The submit payload SHAPE is unchanged from the pre-T42 card:
 * `{ preset, schedule, timezone, outOfHours }`.
 */

import * as React from "react"
import { Plus, X } from "lucide-react"

import { Switch } from "@/client/components/ui/switch"

import type { CardComponentProps } from "../types"
import type { PrefillOrigin } from "../prefill"
import { SuggestedBadge, UseSuggestionChip } from "../use-suggestion-chip"
import { SchedulePreviewPhone } from "../business-hours/SchedulePreviewPhone"
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
} from "../business-hours/schedule-shape"

/** Comportamento quando a equipe humana está fora do horário (Onda 3d). */
export type OutOfHoursBehavior = "reply_notice" | "silent"

/** EXACT submit payload for cardKey 'business_hours'. */
export interface BusinessHoursPayload {
  preset: HoursPreset
  schedule: WeeklySchedule
  timezone: string
  // Onda 3d — fora do horário da equipe: a IA continua 24/7; este campo define
  // como ela gerencia expectativa de atendimento humano.
  outOfHours: OutOfHoursBehavior
}

const OUT_OF_HOURS_OPTIONS: ReadonlyArray<{
  key: OutOfHoursBehavior
  label: string
  hint: string
}> = [
  {
    key: "reply_notice",
    label: "Avisar prazo humano",
    hint: "A IA continua atendendo e informa quando a equipe retorna",
  },
  {
    key: "silent",
    label: "Não acionar humano",
    hint: "A IA responde sozinha e não promete retorno imediato da equipe",
  },
]

const PRESET_OPTIONS: ReadonlyArray<{
  key: HoursPreset
  label: string
  hint: string
}> = [
  { key: "24_7", label: "Equipe 24/7", hint: "Há pessoas disponíveis todos os dias" },
  {
    key: "commercial",
    label: "Equipe comercial",
    hint: "Seg a Sex, 09:00 às 18:00",
  },
  {
    key: "custom",
    label: "Personalizado",
    hint: "Defina cada dia manualmente",
  },
]

/**
 * Props for the controlled-output hours section. Mirrors `CardComponentProps`
 * but trades `onSubmit`/`onDismiss` for `onChange` — the host owns submission.
 */
export interface HoursSectionProps {
  value: CardComponentProps["value"]
  disabled?: boolean
  tokens: CardComponentProps["tokens"]
  /** Fires the latest built payload up on mount and on every edit. */
  onChange: (payload: BusinessHoursPayload) => void
  /** T95 — an hours proposal that arrived AFTER mount (`{ preset }`); offers a
   *  "Usar sugestão" chip that sets the preset on click. `undefined` = no chip. */
  lateProposal?: { preset?: string }
}

/**
 * Resolve the initial preset following `owned > capturedProposals > default`.
 *
 * - owned: a persisted `hours.preset` (any non-empty value the user/agent saved)
 *   OR a confirmed `confirmations.hours` (the review was already submitted).
 * - capturedProposals: `capturedProposals.hours.preset` from the conversation.
 * - default: "24_7" ("sempre aberto", spec §9 decisão 3) — lives HERE.
 *
 * `normalizePreset` is reused for value validation; the only NEW behavior vs the
 * pre-T42 card is the default landing on "24_7" instead of "commercial".
 */
function resolveInitialPreset(value: HoursSectionProps["value"]): {
  preset: HoursPreset
  origin: PrefillOrigin
} {
  const owned = value.hours.preset
  if (typeof owned === "string" && owned.length > 0) {
    return { preset: normalizePreset(owned), origin: "owned" }
  }
  // Confirmed without an explicit preset string still counts as owned; keep the
  // engine's normalize fallback (commercial) so a confirmed-but-blank state never
  // silently flips back to the default.
  if (value.confirmations.hours) {
    return { preset: normalizePreset(owned), origin: "owned" }
  }

  const proposed = value.capturedProposals?.hours?.preset
  if (typeof proposed === "string" && proposed.length > 0) {
    return { preset: normalizePreset(proposed), origin: "proposed" }
  }

  // Default: equipe humana 24/7 — no owned data, no proposal.
  return { preset: "24_7", origin: "default" }
}

/** Build the schedule a preset implies (custom keeps the seeded/persisted one). */
function scheduleForPreset(
  preset: HoursPreset,
  custom: WeeklySchedule,
): WeeklySchedule {
  if (preset === "24_7") return build24x7()
  if (preset === "commercial") return buildCommercial()
  return custom
}

/**
 * HoursSection — the `business_hours` editor body, reusable across the standalone
 * card and the composed `agent_review` card. Controlled-output: emits the built
 * payload via `onChange`; renders no footer (the host owns submit).
 */
export function HoursSection({
  value,
  disabled = false,
  tokens,
  onChange,
  lateProposal,
}: HoursSectionProps) {
  const hours = value.hours

  // Mount-only resolution (FR-23): congela preset + origem na primeira render. A
  // `lateProposal` que chegar depois NÃO re-resolve — vira chip "Usar sugestão".
  const initial = React.useMemo(
    () => resolveInitialPreset(value),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const initialPreset = initial.preset
  const presetOrigin = initial.origin
  const initialSchedule = React.useMemo<WeeklySchedule>(() => {
    const persisted = coerceSchedule(hours.schedule)
    if (persisted) return persisted
    return scheduleForPreset(initialPreset, buildCommercial())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  /** The schedule a submit serializes (preset-derived or live custom). */
  const submitSchedule = React.useMemo<WeeklySchedule>(
    () => scheduleForPreset(preset, schedule),
    [preset, schedule],
  )

  // Emit the latest payload UP on mount and whenever any field changes. The host
  // keeps it and decides WHEN to POST (this section never fetches).
  React.useEffect(() => {
    onChange({
      preset,
      schedule: submitSchedule,
      timezone: timezone.trim() || DEFAULT_TIMEZONE,
      outOfHours,
    })
  }, [onChange, outOfHours, preset, submitSchedule, timezone])

  const selectPreset = React.useCallback((next: HoursPreset) => {
    setPreset(next)
    if (next === "24_7") setSchedule(build24x7())
    else if (next === "commercial") setSchedule(buildCommercial())
    // "custom": keep current schedule so the editor reflects what's there.
  }, [])

  // T95 — proposta TARDIA de horários: o chip só aparece quando há um preset
  // proposto DIFERENTE do selecionado; aplicar (clique) seleciona esse preset.
  const proposedPreset =
    typeof lateProposal?.preset === "string" && lateProposal.preset.length > 0
      ? normalizePreset(lateProposal.preset)
      : undefined
  const showHoursChip = proposedPreset !== undefined && proposedPreset !== preset
  const applyProposedHours = React.useCallback(() => {
    if (proposedPreset) selectPreset(proposedPreset)
  }, [proposedPreset, selectPreset])

  const patchDay = React.useCallback(
    (day: WeekdayKey, patch: Partial<DaySchedule>) => {
      setSchedule((current) => ({
        ...current,
        [day]: { ...current[day], ...patch },
      }))
    },
    [],
  )

  const addBreak = React.useCallback((day: WeekdayKey) => {
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
  }, [])

  const removeBreak = React.useCallback((day: WeekdayKey, index: number) => {
    setSchedule((current) => {
      const prev = current[day]
      const existing = prev.breaks ?? []
      const next = existing.filter((_, i) => i !== index)
      return {
        ...current,
        [day]: openDay(prev.start, prev.end, next),
      }
    })
  }, [])

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

  const proposedLabel = proposedPreset
    ? (PRESET_OPTIONS.find((o) => o.key === proposedPreset)?.label ??
      proposedPreset)
    : ""

  return (
    <div className="flex flex-col gap-4">
      {/* Preset selector */}
      <div className="flex flex-col gap-2">
        {presetOrigin === "proposed" && (
          <span className="flex items-center gap-2">
            <span
              className="text-[12px] font-medium"
              style={{ color: tokens.textSecondary }}
            >
              Horário
            </span>
            <SuggestedBadge tokens={tokens} />
          </span>
        )}
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
        {showHoursChip && (
          <UseSuggestionChip
            label={`Usar sugestão: ${proposedLabel}`}
            onApply={applyProposedHours}
            disabled={disabled}
            tokens={tokens}
          />
        )}
      </div>

      {/* Per-weekday editor (custom only) */}
      {preset === "custom" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(220px,280px)]">
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
              schedule={submitSchedule}
              agentName={agentName}
              highlightDay={highlightDay}
              tokens={tokens}
            />
          </div>
        </div>
      )}

      {/* Timezone */}
      <div>
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
      <div>
        <span
          className="mb-1 block text-[12px] font-medium"
          style={{ color: tokens.textSecondary }}
        >
          Fora do horário da equipe
        </span>
        <div
          className="grid gap-2 sm:grid-cols-2"
          role="radiogroup"
          aria-label="Comportamento fora do horário da equipe"
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
    </div>
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

export default HoursSection
