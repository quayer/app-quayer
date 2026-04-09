"use client"

import { Calendar } from "lucide-react"
import { useAppTokens } from "@/client/hooks/use-app-tokens"
import type { CommunityEvent } from "@/server/ai-module/content/content.data"

interface EventsSidebarProps {
  events: CommunityEvent[]
}

const MONTHS_PT = [
  "JAN", "FEV", "MAR", "ABR", "MAI", "JUN",
  "JUL", "AGO", "SET", "OUT", "NOV", "DEZ",
]

function formatTimeRange(startISO: string, endISO: string): string {
  const start = new Date(startISO)
  const end = new Date(endISO)
  const fmt = (d: Date) =>
    `${d.getHours().toString().padStart(2, "0")}h${
      d.getMinutes() > 0 ? d.getMinutes().toString().padStart(2, "0") : "00"
    }`
  return `${fmt(start)} - ${fmt(end)}`
}

function formatDateParts(iso: string): { day: string; month: string } {
  const d = new Date(iso)
  return {
    day: d.getDate().toString().padStart(2, "0"),
    month: MONTHS_PT[d.getMonth()] ?? "",
  }
}

/**
 * EventsSidebar — painel lateral direito com próximos eventos.
 *
 * Tema reativo via useAppTokens. Visual: cards elevated com data-chip
 * (dia grande + mês tiny brand). Heading Instrument Serif.
 */
export function EventsSidebar({ events }: EventsSidebarProps) {
  const { tokens } = useAppTokens()

  return (
    <aside
      className="hidden xl:flex xl:w-[320px] xl:shrink-0 xl:flex-col xl:gap-4 xl:p-6"
      aria-label="Próximos eventos"
      style={{ borderLeft: `1px solid ${tokens.divider}` }}
    >
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4" style={{ color: tokens.brand }} />
        <h2
          className="text-lg font-semibold"
          style={{
            color: tokens.textPrimary,
            fontFamily:
              "var(--font-display), Georgia, 'Times New Roman', serif",
            letterSpacing: "-0.01em",
          }}
        >
          Próximos Eventos
        </h2>
      </div>

      {events.length === 0 ? (
        <p className="text-sm" style={{ color: tokens.textTertiary }}>
          Nenhum evento programado por enquanto.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => {
            const { day, month } = formatDateParts(event.startsAt)
            const time = formatTimeRange(event.startsAt, event.endsAt)
            return (
              <li key={event.id}>
                <article
                  className="flex gap-3 rounded-xl border p-3 transition-colors"
                  style={{
                    backgroundColor: tokens.bgSurface,
                    borderColor: tokens.divider,
                  }}
                >
                  <div
                    className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-lg border"
                    style={{
                      backgroundColor: tokens.bgElevated,
                      borderColor: tokens.border,
                    }}
                  >
                    <span
                      className="text-xl font-bold leading-none"
                      style={{ color: tokens.textPrimary }}
                    >
                      {day}
                    </span>
                    <span
                      className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: tokens.brand }}
                    >
                      {month}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <h3
                      className="line-clamp-2 text-[13px] font-semibold leading-snug"
                      style={{ color: tokens.textPrimary }}
                    >
                      {event.title}
                    </h3>
                    <p
                      className="text-[11px]"
                      style={{ color: tokens.textTertiary }}
                    >
                      {time}
                    </p>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
