/**
 * Unit tests da tool calendar_list_slots.
 *
 *  - buildWorkingWindows: pula fim de semana, recorta o dia de hoje para "agora",
 *    e respeita o expediente. Testado em tz='UTC' para determinismo.
 *  - executeListSlots: degrada sem agenda; com agenda + freebusy vazio, devolve
 *    os slots do expediente.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/calendar/calendar-credential-resolver', () => ({
  resolveCalendarAccess: vi.fn(),
}))
vi.mock('./google-calendar-client', () => ({
  queryFreeBusy: vi.fn(),
}))

import { resolveCalendarAccess } from '@/lib/calendar/calendar-credential-resolver'
import { queryFreeBusy } from './google-calendar-client'
import {
  buildWorkingWindows,
  executeListSlots,
  type ListSlotsInput,
} from './list-slots'
import type { ToolExecutionContext } from '../builtin-tools'

const mockedResolve = vi.mocked(resolveCalendarAccess)
const mockedFreeBusy = vi.mocked(queryFreeBusy)

function ctx(): ToolExecutionContext {
  return {
    sessionId: 's',
    contactId: 'c',
    connectionId: 'conn',
    organizationId: 'org-1',
  }
}

function input(over: Partial<ListSlotsInput> = {}): ListSlotsInput {
  return {
    daysAhead: 5,
    slotMinutes: 60,
    maxSlots: 8,
    workdayStartHour: 9,
    workdayEndHour: 18,
    timeZone: 'UTC',
    includeWeekends: false,
    ...over,
  }
}

// Seg 2026-06-08 — base de referência (UTC).
const MON_JUN_8_2026 = Date.UTC(2026, 5, 8, 12, 0, 0)

beforeEach(() => {
  mockedResolve.mockReset()
  mockedFreeBusy.mockReset()
})

describe('buildWorkingWindows', () => {
  it('pula fim de semana e recorta o dia de hoje para "agora"', () => {
    const windows = buildWorkingWindows(MON_JUN_8_2026, 7, 9, 18, 'UTC', false)

    // Seg, Ter, Qua, Qui, Sex (sáb 13 e dom 14 fora)
    expect(windows).toHaveLength(5)
    // Hoje: início recortado para 12:00 (now), fim às 18:00
    expect(windows[0]!.startMs).toBe(Date.UTC(2026, 5, 8, 12, 0))
    expect(windows[0]!.endMs).toBe(Date.UTC(2026, 5, 8, 18, 0))
    // Amanhã (terça): expediente cheio 9–18
    expect(windows[1]!.startMs).toBe(Date.UTC(2026, 5, 9, 9, 0))
    expect(windows[1]!.endMs).toBe(Date.UTC(2026, 5, 9, 18, 0))
  })

  it('inclui fim de semana quando includeWeekends=true', () => {
    const windows = buildWorkingWindows(MON_JUN_8_2026, 7, 9, 18, 'UTC', true)
    expect(windows).toHaveLength(7)
  })

  it('descarta o dia de hoje se "agora" já passou do expediente', () => {
    const lateMonday = Date.UTC(2026, 5, 8, 20, 0) // 20:00, depois das 18:00
    const windows = buildWorkingWindows(lateMonday, 2, 9, 18, 'UTC', false)
    // Hoje (seg) descartado → primeiro é terça
    expect(windows).toHaveLength(1)
    expect(windows[0]!.startMs).toBe(Date.UTC(2026, 5, 9, 9, 0))
  })
})

describe('executeListSlots', () => {
  it('degrada quando a agenda não está conectada', async () => {
    mockedResolve.mockResolvedValue(null)
    const res = await executeListSlots(ctx(), input(), MON_JUN_8_2026)
    expect(res).toEqual({ success: false, message: 'Agenda não conectada' })
    expect(mockedFreeBusy).not.toHaveBeenCalled()
  })

  it('com freebusy vazio, devolve os slots do expediente', async () => {
    mockedResolve.mockResolvedValue({ accessToken: 't', calendarId: 'cal' } as never)
    mockedFreeBusy.mockResolvedValue([])

    const monday9 = Date.UTC(2026, 5, 8, 9, 0)
    const res = await executeListSlots(
      ctx(),
      input({
        daysAhead: 1,
        slotMinutes: 60,
        maxSlots: 3,
        workdayStartHour: 9,
        workdayEndHour: 12,
        includeWeekends: true,
      }),
      monday9,
    )

    expect(res.success).toBe(true)
    expect(res.count).toBe(3)
    expect(res.slots?.[0]?.start).toBe(new Date(Date.UTC(2026, 5, 8, 9, 0)).toISOString())
    expect(res.slots?.[2]?.end).toBe(new Date(Date.UTC(2026, 5, 8, 12, 0)).toISOString())
  })
})
