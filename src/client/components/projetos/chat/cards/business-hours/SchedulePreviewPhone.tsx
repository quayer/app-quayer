"use client"

/**
 * Builder Cards — business_hours · SchedulePreviewPhone (G11, Onda C)
 *
 * A mini-phone, WhatsApp-style summary of the configured weekly schedule. Reuses
 * the bubble look from `agent-persona-card.tsx`'s WhatsAppPreview (a faux chat
 * header + an incoming agent bubble), but the body lists each day's effective
 * window (open hours minus every break), rendered live from the current
 * `schedule` state.
 *
 * Presentational + token-driven only. No fetching, no state. Driven entirely by
 * props so it can be shown on hover/focus of a day row OR as a persistent compact
 * summary panel.
 */

import * as React from "react"
import { Clock } from "lucide-react"

import type { AppTokens } from "@/client/hooks/use-app-tokens"

import {
  WEEKDAYS,
  WEEKDAY_LABELS,
  daySummary,
  type WeekdayKey,
  type WeeklySchedule,
} from "./schedule-shape"

interface SchedulePreviewPhoneProps {
  /** The live schedule being edited/previewed. */
  schedule: WeeklySchedule
  /** Display name for the faux chat header (e.g. the agent/business name). */
  agentName: string
  /** When set, that day's row is emphasized (the one being hovered/focused). */
  highlightDay?: WeekdayKey | null
  tokens: AppTokens
}

/**
 * SchedulePreviewPhone — mini WhatsApp card listing each day's effective
 * availability. Closed days are muted. The highlighted day (the row under the
 * cursor/focus) is brought forward with the brand-subtle background.
 */
export function SchedulePreviewPhone({
  schedule,
  agentName,
  highlightDay,
  tokens,
}: SchedulePreviewPhoneProps) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        backgroundColor: tokens.bgBase,
        borderColor: tokens.divider,
      }}
    >
      {/* Faux chat header — mirrors agent-persona-card's WhatsAppPreview. */}
      <div className="mb-2 flex items-center gap-2">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{
            backgroundColor: tokens.brandSubtle,
            color: tokens.brand,
          }}
        >
          <Clock className="h-3.5 w-3.5" />
        </div>
        <div className="flex min-w-0 flex-col">
          <span
            className="truncate text-[12px] font-semibold"
            style={{ color: tokens.textPrimary }}
          >
            {agentName}
          </span>
          <span className="text-[10px]" style={{ color: tokens.successText }}>
            horário de atendimento
          </span>
        </div>
      </div>

      {/* Incoming bubble holding the per-day breakdown. */}
      <div className="flex">
        <div
          className="relative w-full max-w-[92%] rounded-lg rounded-tl-sm px-3 py-2"
          style={{
            backgroundColor: tokens.bgSurface,
            borderColor: tokens.divider,
            borderWidth: 1,
          }}
        >
          <ul className="flex flex-col gap-1">
            {WEEKDAYS.map((day) => {
              const cfg = schedule[day]
              const summary = daySummary(cfg)
              const closed = !cfg.open
              const active = highlightDay === day
              return (
                <li
                  key={day}
                  className="flex items-baseline justify-between gap-3 rounded px-1 py-0.5 transition-colors"
                  style={{
                    backgroundColor: active
                      ? tokens.brandSubtle
                      : "transparent",
                  }}
                >
                  <span
                    className="shrink-0 text-[12px] font-medium"
                    style={{
                      color: closed
                        ? tokens.textTertiary
                        : tokens.textPrimary,
                    }}
                  >
                    {WEEKDAY_LABELS[day]}
                  </span>
                  <span
                    className="text-right text-[12px] leading-snug"
                    style={{
                      color: closed
                        ? tokens.textTertiary
                        : tokens.textSecondary,
                      fontStyle: closed ? "italic" : "normal",
                    }}
                  >
                    {summary}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

export default SchedulePreviewPhone
