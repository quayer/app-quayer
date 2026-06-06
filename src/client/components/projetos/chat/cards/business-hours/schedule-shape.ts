/**
 * Builder Cards — business_hours · schedule shape (G11, Onda C)
 *
 * PURE (no React). The serialized weekly-schedule types + best-effort coercion
 * helpers for the `business_hours` card. Lifted out of `business-hours-card.tsx`
 * so the card JSX shrinks, mirroring the `pricing/` subfolder convention.
 *
 * G11 extends the per-day shape: the single optional `lunch` becomes a
 * `breaks[]` list (multiple intervals carved out of [start,end]). Backward-compat
 * is non-negotiable — `coerceDay` reads BOTH the legacy `{ lunch }` shape (seeded
 * into `breaks[0]`) AND the new `{ breaks: [{start,end}] }` shape, so any schedule
 * a user saved before G11 still renders. NEW writes only ever emit `breaks[]`.
 *
 * The whole `WeeklySchedule` is serialized verbatim into `payload.schedule`,
 * which the backend treats as opaque `z.unknown()` — so adding `breaks[]` needs
 * NO backend schema change.
 *
 * Every helper is best-effort and NEVER throws (the card renders untrusted,
 * possibly-malformed persisted JSON on first paint).
 */

// ==========================================
// Weekday vocabulary
// ==========================================

/** Day-of-week keys in display order (Mon → Sun). */
export const WEEKDAYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const

export type WeekdayKey = (typeof WEEKDAYS)[number]

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Segunda",
  tue: "Terça",
  wed: "Quarta",
  thu: "Quinta",
  fri: "Sexta",
  sat: "Sábado",
  sun: "Domingo",
}

// ==========================================
// Types
// ==========================================

/** One time interval carved out of a day's open window (e.g. lunch, a meeting). */
export interface BreakInterval {
  start: string
  end: string
}

/**
 * One serialized day in the schedule. `open: false` ⇒ closed (no ranges).
 *
 * `breaks` is the G11 shape (zero or more intervals removed from [start,end]).
 * `lunch` is kept READABLE on coerce for backward-compat with pre-G11 saves, but
 * NEW writes never set it — `coerceDay` folds a legacy `lunch` into `breaks[0]`.
 */
export interface DaySchedule {
  open: boolean
  /** Working window. */
  start: string
  end: string
  /** Intervals carved out of [start,end]. Capped at {@link MAX_BREAKS_PER_DAY}. */
  breaks?: BreakInterval[]
  /** @deprecated legacy single-lunch shape — read-only, folded into breaks[]. */
  lunch?: BreakInterval
}

/** The full week, keyed by weekday. This is what goes into `payload.schedule`. */
export type WeeklySchedule = Record<WeekdayKey, DaySchedule>

export type HoursPreset = "24_7" | "commercial" | "custom"

// ==========================================
// Defaults / constants
// ==========================================

export const DEFAULT_TIMEZONE = "America/Sao_Paulo"
export const DEFAULT_OPEN = "09:00"
export const DEFAULT_CLOSE = "18:00"
export const DEFAULT_BREAK_START = "12:00"
export const DEFAULT_BREAK_END = "13:00"

/** Hard cap on breaks per day (UI-only guard). */
export const MAX_BREAKS_PER_DAY = 4

// ==========================================
// Builders
// ==========================================

export function closedDay(): DaySchedule {
  return { open: false, start: DEFAULT_OPEN, end: DEFAULT_CLOSE }
}

export function openDay(
  start = DEFAULT_OPEN,
  end = DEFAULT_CLOSE,
  breaks?: BreakInterval[],
): DaySchedule {
  const cleaned = (breaks ?? []).slice(0, MAX_BREAKS_PER_DAY)
  return cleaned.length > 0
    ? { open: true, start, end, breaks: cleaned }
    : { open: true, start, end }
}

/** 24/7: every day open all day, no breaks. */
export function build24x7(): WeeklySchedule {
  return WEEKDAYS.reduce((acc, day) => {
    acc[day] = openDay("00:00", "23:59")
    return acc
  }, {} as WeeklySchedule)
}

/** Comercial: Mon-Fri 09-18, weekend closed. */
export function buildCommercial(): WeeklySchedule {
  return WEEKDAYS.reduce((acc, day) => {
    const weekend = day === "sat" || day === "sun"
    acc[day] = weekend ? closedDay() : openDay(DEFAULT_OPEN, DEFAULT_CLOSE)
    return acc
  }, {} as WeeklySchedule)
}

// ==========================================
// Coercion (best-effort, NEVER throws)
// ==========================================

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Coerce an arbitrary value into an `HH:MM` string, falling back when invalid. */
export function asTime(v: unknown, fallback: string): string {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : fallback
}

/** Coerce one raw interval ({start,end}) into a BreakInterval, or null. */
function coerceInterval(raw: unknown): BreakInterval | null {
  if (!isObject(raw)) return null
  return {
    start: asTime(raw.start, DEFAULT_BREAK_START),
    end: asTime(raw.end, DEFAULT_BREAK_END),
  }
}

/**
 * Coerce one persisted day (opaque JSON) into a DaySchedule.
 *
 * Backward-compat: reads BOTH `breaks: [{start,end}]` (G11) AND the legacy
 * `lunch: {start,end}` (pre-G11). A legacy `lunch` is seeded as `breaks[0]` so
 * an old save renders identically. If both are present, `breaks` wins and the
 * legacy `lunch` is appended only if it is not already represented.
 */
export function coerceDay(raw: unknown): DaySchedule {
  if (!isObject(raw)) return closedDay()
  const open = raw.open !== false // default open unless explicitly closed
  if (!open) return closedDay()

  const start = asTime(raw.start, DEFAULT_OPEN)
  const end = asTime(raw.end, DEFAULT_CLOSE)

  const collected: BreakInterval[] = []

  // New shape: breaks[]
  if (Array.isArray(raw.breaks)) {
    for (const entry of raw.breaks) {
      const interval = coerceInterval(entry)
      if (interval) collected.push(interval)
    }
  }

  // Legacy shape: a single { lunch } → seed into breaks[0] if not already there.
  const legacyLunch = coerceInterval(raw.lunch)
  if (legacyLunch) {
    const dup = collected.some(
      (b) => b.start === legacyLunch.start && b.end === legacyLunch.end,
    )
    if (!dup) collected.unshift(legacyLunch)
  }

  return openDay(start, end, collected)
}

/** Coerce the opaque persisted `hours.schedule` into a full WeeklySchedule. */
export function coerceSchedule(raw: unknown): WeeklySchedule | null {
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

export function normalizePreset(raw: string | undefined): HoursPreset {
  if (raw === "24_7" || raw === "commercial" || raw === "custom") return raw
  return "commercial"
}

// ==========================================
// Human summary (used by the hover preview)
// ==========================================

/**
 * A short human label for a single day's effective availability: the open
 * window minus every break. Closed days say "Fechado". Best-effort — never
 * throws; malformed breaks are simply listed as-is.
 *
 * Examples:
 *   { open:false }                                   → "Fechado"
 *   { open:true, 09:00–18:00 }                       → "09:00 às 18:00"
 *   { open:true, 09:00–18:00, breaks:[12:00–13:00] } → "09:00 às 18:00 (pausa 12:00–13:00)"
 */
export function daySummary(day: DaySchedule): string {
  if (!day.open) return "Fechado"
  const window = `${day.start} às ${day.end}`
  const breaks = day.breaks ?? []
  if (breaks.length === 0) return window
  const label = breaks.length === 1 ? "pausa" : "pausas"
  const list = breaks.map((b) => `${b.start}–${b.end}`).join(", ")
  return `${window} (${label} ${list})`
}
