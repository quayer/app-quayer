/**
 * business-hours.service — cálculo DETERMINÍSTICO de horário comercial (#2).
 *
 * Port do `compute_state` do Orayon.Profissoes (api/orayon_sdr/infra/business_hours.py),
 * adaptado à FORMA do Quayer: cada dia é uma janela aberta [start,end] MENOS uma
 * lista de `breaks` (intervalos recortados). Aqui convertemos isso em "janelas
 * abertas" (lista de [início,fim]) e aplicamos o mesmo algoritmo.
 *
 * Usado pelo `transfer_to_human` para devolver ao LLM um contexto de atendimento
 * (`atendimento` + `orientacao`) — este módulo NUNCA gera texto ao cliente; o LLM
 * compõe a mensagem natural a partir da `orientacao`.
 *
 * PURE e fail-open: schedule malformado/ausente → 'always_closed' (nunca lança).
 * tz via Intl (sem dependência externa). `nowMs` injetável para testes.
 */

export type BusinessStatus =
  | 'open'
  | 'before_open'
  | 'break'
  | 'closed_today'
  | 'closed_holiday'
  | 'always_closed'

export interface BusinessState {
  status: BusinessStatus
  isOpen: boolean
  /** "segunda-feira, 14:35" (no fuso do agente). */
  nowLabel: string
  /** "às 13:00 de hoje" | "amanhã às 09:00" | "quarta-feira às 08:00" | null. */
  nextOpenLabel: string | null
  /** Nudge para o LLM: o que mencionar ao lead (próxima abertura, etc.). */
  orientacao: string
  timeZone: string
}

const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const WEEKDAY_PT = [
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
  'domingo',
] as const

const DAY_MS = 86_400_000

// ---------------------------------------------------------------------------
// Coerção do schedule (opaco) → janelas abertas por dia, em minutos-do-dia
// ---------------------------------------------------------------------------

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** "HH:MM" → minutos do dia; retorna `fallback` se inválido. */
function hhmmToMin(v: unknown, fallback: number): number {
  if (typeof v !== 'string') return fallback
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim())
  if (!m) return fallback
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback
  return h * 60 + min
}

/** Janelas ABERTAS de um dia = [start,end] menos os `breaks` (e `lunch` legado). */
export function dayOpenWindows(rawDay: unknown): Array<[number, number]> {
  if (!isObj(rawDay) || rawDay.open === false) return []

  const start = hhmmToMin(rawDay.start, 540) // 09:00
  const end = hhmmToMin(rawDay.end, 1080) // 18:00
  if (end <= start) return []

  const rawBreaks: unknown[] = Array.isArray(rawDay.breaks) ? rawDay.breaks : []
  if (isObj(rawDay.lunch)) rawBreaks.push(rawDay.lunch) // back-compat pré-G11

  const breaks = rawBreaks
    .filter(isObj)
    .map((b) => [hhmmToMin(b.start, -1), hhmmToMin(b.end, -1)] as [number, number])
    .filter(([s, e]) => s >= 0 && e > s)
    .sort((a, b) => a[0] - b[0])

  const windows: Array<[number, number]> = []
  let cursor = start
  for (const [bs, be] of breaks) {
    const s = Math.max(bs, start)
    const e = Math.min(be, end)
    if (e <= s) continue
    if (s > cursor) windows.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (cursor < end) windows.push([cursor, end])
  return windows
}

function windowsFor(monIdx: number, schedule: Record<string, unknown>): Array<[number, number]> {
  return dayOpenWindows(schedule[WEEKDAY_KEYS[monIdx]!])
}

// ---------------------------------------------------------------------------
// "Agora" no fuso do agente (via Intl) — monIdx (Seg=0..Dom=6) + minutos + data
// ---------------------------------------------------------------------------

interface ZonedNow {
  monIdx: number
  minutes: number
  year: number
  month: number
  day: number
}

function getZonedNow(utcMs: number, timeZone: string): ZonedNow {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]))
  const year = Number(p.year)
  const month = Number(p.month)
  const day = Number(p.day)
  const hour = Number(p.hour) % 24 // h23 pode dar '24' em alguns engines
  const minute = Number(p.minute)
  // Seg=0..Dom=6 a partir do getUTCDay (Dom=0..Sáb=6) da data de calendário.
  const monIdx = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7
  return { monIdx, minutes: hour * 60 + minute, year, month, day }
}

function dateKeyOf(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Próxima abertura (caminha até 14 dias)
// ---------------------------------------------------------------------------

interface NextOpen {
  offset: number
  startMin: number
  monIdx: number
}

function findNextOpen(
  now: ZonedNow,
  nowMs: number,
  timeZone: string,
  schedule: Record<string, unknown>,
  holidays: Set<string>,
): NextOpen | null {
  for (let offset = 0; offset < 14; offset++) {
    // Data de calendário local no offset (recomputa via Intl p/ robustez de fuso).
    const z = getZonedNow(nowMs + offset * DAY_MS, timeZone)
    if (holidays.has(dateKeyOf(z.year, z.month, z.day))) continue
    const wins = windowsFor(z.monIdx, schedule)
    for (const [s] of wins) {
      if (offset === 0 && s <= now.minutes) continue
      return { offset, startMin: s, monIdx: z.monIdx }
    }
  }
  return null
}

function nextOpenLabel(n: NextOpen): string {
  const hhmm = minToHHMM(n.startMin)
  if (n.offset === 0) return `às ${hhmm} de hoje`
  if (n.offset === 1) return `amanhã às ${hhmm}`
  return `${WEEKDAY_PT[n.monIdx]} às ${hhmm}`
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export function computeBusinessState(
  rawSchedule: unknown,
  timeZone: string = 'America/Sao_Paulo',
  holidayList: string[] = [],
  nowMs: number = Date.now(),
): BusinessState {
  const tz = timeZone || 'America/Sao_Paulo'
  const schedule = isObj(rawSchedule) ? rawSchedule : {}
  const holidays = new Set(holidayList)
  const now = getZonedNow(nowMs, tz)
  const nowLabel = `${WEEKDAY_PT[now.monIdx]}, ${minToHHMM(now.minutes)}`

  const closed = (status: BusinessStatus, orientacao: string, label: string | null): BusinessState => ({
    status,
    isOpen: false,
    nowLabel,
    nextOpenLabel: label,
    orientacao,
    timeZone: tz,
  })

  // Degenerado: nenhuma janela em nenhum dia.
  const anyWindow = WEEKDAY_KEYS.some((_, i) => windowsFor(i, schedule).length > 0)
  if (!anyWindow) {
    return closed(
      'always_closed',
      'O atendimento não tem horário configurado. Confirme a transferência e informe que a equipe responderá assim que possível, sem prometer prazo.',
      null,
    )
  }

  const todayKey = dateKeyOf(now.year, now.month, now.day)
  if (holidays.has(todayKey)) {
    const nxt = findNextOpen(now, nowMs, tz, schedule, holidays)
    return closed(
      'closed_holiday',
      nxt
        ? `Hoje é feriado. Confirme a transferência informando que a equipe responderá ${nextOpenLabel(nxt)}.`
        : 'Hoje é feriado. Confirme a transferência informando que a equipe responderá assim que possível.',
      nxt ? nextOpenLabel(nxt) : null,
    )
  }

  const wins = windowsFor(now.monIdx, schedule)
  if (wins.length > 0) {
    // Dentro de alguma janela?
    for (const [s, e] of wins) {
      if (s <= now.minutes && now.minutes < e) {
        return {
          status: 'open',
          isOpen: true,
          nowLabel,
          nextOpenLabel: null,
          orientacao:
            'Atendimento aberto. Confirme a transferência de forma curta e direta. Não mencione horário.',
          timeZone: tz,
        }
      }
    }
    const firstStart = wins[0]![0]
    const lastEnd = wins[wins.length - 1]![1]
    if (now.minutes < firstStart) {
      return closed(
        'before_open',
        `Atendimento ainda não abriu hoje. Confirme a transferência informando que a equipe responderá a partir de às ${minToHHMM(firstStart)} de hoje.`,
        `às ${minToHHMM(firstStart)} de hoje`,
      )
    }
    if (now.minutes >= lastEnd) {
      const nxt = findNextOpen(now, nowMs, tz, schedule, holidays)
      return closed(
        'closed_today',
        nxt
          ? `Atendimento já encerrou hoje. Confirme a transferência informando que a equipe responderá ${nextOpenLabel(nxt)}.`
          : 'Atendimento encerrado. Confirme a transferência informando que a equipe responderá assim que possível.',
        nxt ? nextOpenLabel(nxt) : null,
      )
    }
    // Em um intervalo entre janelas = pausa (almoço é o caso comum).
    for (let i = 0; i < wins.length - 1; i++) {
      if (wins[i]![1] <= now.minutes && now.minutes < wins[i + 1]![0]) {
        const next = wins[i + 1]![0]
        return closed(
          'break',
          `Atendimento em pausa (intervalo). Confirme a transferência informando que a equipe responderá a partir de às ${minToHHMM(next)} de hoje.`,
          `às ${minToHHMM(next)} de hoje`,
        )
      }
    }
  }

  // Sem janelas hoje (ex.: domingo) → próxima abertura.
  const nxt = findNextOpen(now, nowMs, tz, schedule, holidays)
  return closed(
    'closed_today',
    nxt
      ? `Atendimento fechado hoje. Confirme a transferência informando que a equipe responderá ${nextOpenLabel(nxt)}.`
      : 'Atendimento fechado. Confirme a transferência informando que a equipe responderá assim que possível.',
    nxt ? nextOpenLabel(nxt) : null,
  )
}

/** Serialização para o tool_result do transfer_to_human. */
export function businessStateToDict(s: BusinessState): Record<string, unknown> {
  return {
    status: s.status,
    aberto: s.isOpen,
    agora: s.nowLabel,
    proximo_aberto: s.nextOpenLabel,
    orientacao_resposta: s.orientacao,
    timezone: s.timeZone,
  }
}
