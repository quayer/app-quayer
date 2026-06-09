/**
 * calendar_list_slots — builtin calendar tool.
 *
 * Diferença para check_availability: aqui o agente NÃO precisa montar uma janela
 * ISO. Ele pede "os próximos N dias" e a tool devolve os horários LIVRES já
 * limitados ao horário comercial (workdayStartHour–workdayEndHour, opcionalmente
 * pulando fins de semana), do dia de hoje em diante. É a forma conveniente de
 * oferecer horários ("tenho terça 14h, quarta 9h..."). Para validar UM horário
 * específico antes de criar evento, use check_availability/create_event.
 *
 * Reaproveita queryFreeBusy (google-calendar-client) e computeFreeSlots
 * (check-availability) — só adiciona a montagem das janelas diárias por timezone.
 *
 * Degradação graciosa igual às demais: sem agenda conectada → success:false
 * 'Agenda não conectada'.
 *
 * Premissa de timezone: usa o IANA timeZone para converter "hora de parede"
 * (ex.: 09:00 local) em instante UTC. O cálculo é robusto para zonas sem DST
 * (ex.: America/Sao_Paulo). Em zonas com horário de verão, transições no exato
 * limite da janela podem deslocar 1h — aceitável para sugestão de horários.
 *
 * Exporta:
 *   - listSlotsInputSchema
 *   - buildWorkingWindows(...)         ← núcleo puro e testável
 *   - executeListSlots(ctx, input, now)
 *   - createListSlotsTool(ctx)         ← spread em createBuiltinTools()
 */

import { tool } from 'ai'
import { z } from 'zod'
import type { ToolExecutionContext } from '@/server/ai-module/ai-agents/tools/builtin-tools'
import { resolveCalendarAccess } from '@/lib/calendar/calendar-credential-resolver'
import { queryFreeBusy } from './google-calendar-client'
import { computeFreeSlots, type AvailabilitySlot } from './check-availability'

const DAY_MS = 86_400_000

// ---------------------------------------------------------------------------
// Input schema
// ---------------------------------------------------------------------------

export const listSlotsInputSchema = z
  .object({
    daysAhead: z
      .number()
      .int()
      .min(1)
      .max(14)
      .default(5)
      .describe('Quantos dias à frente considerar, contando hoje (1–14, padrão 5).'),
    slotMinutes: z
      .number()
      .int()
      .min(15)
      .max(480)
      .default(60)
      .describe('Duração de cada slot livre em minutos (15–480, padrão 60).'),
    maxSlots: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(8)
      .describe('Máximo de slots livres a retornar no total (1–20, padrão 8).'),
    workdayStartHour: z
      .number()
      .int()
      .min(0)
      .max(23)
      .default(9)
      .describe('Hora de início do expediente, hora local (0–23, padrão 9).'),
    workdayEndHour: z
      .number()
      .int()
      .min(1)
      .max(24)
      .default(18)
      .describe('Hora de fim do expediente, hora local (1–24, padrão 18).'),
    timeZone: z
      .string()
      .default('America/Sao_Paulo')
      .describe('IANA timezone do expediente (padrão "America/Sao_Paulo").'),
    includeWeekends: z
      .boolean()
      .default(false)
      .describe('Se true, inclui sábado e domingo. Padrão false (só dias úteis).'),
  })
  .refine((v) => v.workdayEndHour > v.workdayStartHour, {
    message: 'workdayEndHour deve ser maior que workdayStartHour.',
    path: ['workdayEndHour'],
  })

export type ListSlotsInput = z.infer<typeof listSlotsInputSchema>

export interface ListSlotsResult {
  success: boolean
  message: string
  slots?: AvailabilitySlot[]
  count?: number
}

export interface DailyWindow {
  startMs: number
  endMs: number
}

// ---------------------------------------------------------------------------
// Timezone helpers (dependency-free, via Intl)
// ---------------------------------------------------------------------------

/** Ano/mês/dia (calendário local) de um instante UTC em um dado timezone. */
function getZonedYmd(utcMs: number, timeZone: string): {
  year: number
  month: number
  day: number
} {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utcMs)).map((p) => [p.type, p.value]),
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  }
}

/** Offset (ms) do timezone em relação a UTC para um dado instante. */
function getOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const p = Object.fromEntries(
    dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]),
  )
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  )
  return asUtc - utcMs
}

/** Converte "hora de parede" local (Y-M-D H:m no timeZone) para instante UTC. */
function wallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, 0, 0)
  const o1 = getOffsetMs(guess, timeZone)
  let utc = guess - o1
  // segunda passada para assentar em bordas de offset
  const o2 = getOffsetMs(utc, timeZone)
  if (o2 !== o1) utc = guess - o2
  return utc
}

// ---------------------------------------------------------------------------
// Working windows (pure)
// ---------------------------------------------------------------------------

/**
 * Monta as janelas de expediente [start, end] para os próximos `daysAhead` dias
 * a partir de `nowMs`. O dia de hoje tem o início recortado para `nowMs` (não
 * oferece horário no passado). Fins de semana são pulados se !includeWeekends.
 */
export function buildWorkingWindows(
  nowMs: number,
  daysAhead: number,
  workdayStartHour: number,
  workdayEndHour: number,
  timeZone: string,
  includeWeekends: boolean,
): DailyWindow[] {
  const windows: DailyWindow[] = []

  for (let d = 0; d < daysAhead; d++) {
    const { year, month, day } = getZonedYmd(nowMs + d * DAY_MS, timeZone)

    // Dia da semana do calendário local (0=Dom … 6=Sáb).
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
    if (!includeWeekends && (weekday === 0 || weekday === 6)) continue

    let startMs = wallTimeToUtcMs(year, month, day, workdayStartHour, timeZone)
    const endMs = wallTimeToUtcMs(year, month, day, workdayEndHour, timeZone)

    if (d === 0) startMs = Math.max(startMs, nowMs) // hoje: nada no passado
    if (endMs > startMs) windows.push({ startMs, endMs })
  }

  return windows
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export async function executeListSlots(
  ctx: ToolExecutionContext,
  input: ListSlotsInput,
  nowMs: number = Date.now(),
): Promise<ListSlotsResult> {
  const {
    daysAhead,
    slotMinutes,
    maxSlots,
    workdayStartHour,
    workdayEndHour,
    timeZone,
    includeWeekends,
  } = input

  const access = await resolveCalendarAccess(ctx.organizationId)
  if (!access) {
    return { success: false, message: 'Agenda não conectada' }
  }

  const windows = buildWorkingWindows(
    nowMs,
    daysAhead,
    workdayStartHour,
    workdayEndHour,
    timeZone,
    includeWeekends,
  )
  if (windows.length === 0) {
    return {
      success: true,
      slots: [],
      count: 0,
      message: 'Sem dias úteis na janela solicitada.',
    }
  }

  const spanStart = new Date(windows[0]!.startMs).toISOString()
  const spanEnd = new Date(windows[windows.length - 1]!.endMs).toISOString()

  try {
    const busy = await queryFreeBusy(
      access.accessToken,
      access.calendarId,
      spanStart,
      spanEnd,
      timeZone,
    )

    const slots: AvailabilitySlot[] = []
    const slotMs = slotMinutes * 60_000
    for (const w of windows) {
      if (slots.length >= maxSlots) break
      const remaining = maxSlots - slots.length
      slots.push(...computeFreeSlots(w.startMs, w.endMs, busy, slotMs, remaining))
    }

    if (slots.length === 0) {
      return {
        success: true,
        slots: [],
        count: 0,
        message: 'Nenhum horário livre encontrado nos próximos dias.',
      }
    }

    return {
      success: true,
      slots,
      count: slots.length,
      message: `${slots.length} horário(s) livre(s) nos próximos dias.`,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido'
    console.error('[calendar_list_slots] Failed:', msg)
    return { success: false, message: `Erro ao consultar agenda: ${msg}` }
  }
}

// ---------------------------------------------------------------------------
// Tool factory (spread into createBuiltinTools())
// ---------------------------------------------------------------------------

export function createListSlotsTool(ctx: ToolExecutionContext) {
  return tool({
    description:
      'Lista os horários LIVRES da agenda nos próximos dias, já dentro do ' +
      'horário comercial (e pulando fins de semana por padrão). Use para oferecer ' +
      'opções de horário ao cliente sem precisar montar datas manualmente. ' +
      'Se a agenda não estiver conectada, retorna success:false — nesse caso use ' +
      'schedule_appointment para registrar a intenção.',
    inputSchema: listSlotsInputSchema,
    execute: async (input) => executeListSlots(ctx, input),
  })
}
