/**
 * Unit tests do business-hours.service (cálculo de horário comercial do handoff).
 * Determinístico via nowMs injetado. tz='UTC' p/ a maioria + 1 caso SP (offset).
 */

import { describe, it, expect } from 'vitest'
import {
  computeBusinessState,
  dayOpenWindows,
  businessStateToDict,
} from './business-hours.service'

// Schedule comercial: Seg–Sex 09–18 com pausa 12–13; fim de semana fechado.
const COMMERCIAL = {
  mon: { open: true, start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] },
  tue: { open: true, start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] },
  wed: { open: true, start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] },
  thu: { open: true, start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] },
  fri: { open: true, start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] },
  sat: { open: false, start: '09:00', end: '18:00' },
  sun: { open: false, start: '09:00', end: '18:00' },
}

// 2026-06-08 = segunda-feira. 06-13 = sábado.
const MON = (h: number, m = 0) => Date.UTC(2026, 5, 8, h, m)
const SAT = (h: number, m = 0) => Date.UTC(2026, 5, 13, h, m)

describe('dayOpenWindows', () => {
  it('subtrai breaks da janela aberta → janelas em minutos', () => {
    expect(
      dayOpenWindows({ open: true, start: '09:00', end: '18:00', breaks: [{ start: '12:00', end: '13:00' }] }),
    ).toEqual([
      [540, 720], // 09:00–12:00
      [780, 1080], // 13:00–18:00
    ])
  })

  it('dia fechado → []', () => {
    expect(dayOpenWindows({ open: false, start: '09:00', end: '18:00' })).toEqual([])
  })

  it('lê o `lunch` legado (pré-G11) como break', () => {
    expect(
      dayOpenWindows({ open: true, start: '09:00', end: '18:00', lunch: { start: '12:00', end: '13:00' } }),
    ).toEqual([
      [540, 720],
      [780, 1080],
    ])
  })
})

describe('computeBusinessState (tz UTC)', () => {
  it('dentro da janela → open', () => {
    const s = computeBusinessState(COMMERCIAL, 'UTC', [], MON(10))
    expect(s.status).toBe('open')
    expect(s.isOpen).toBe(true)
    expect(s.nextOpenLabel).toBeNull()
  })

  it('na pausa (12:30) → break, próxima abertura 13:00 de hoje', () => {
    const s = computeBusinessState(COMMERCIAL, 'UTC', [], MON(12, 30))
    expect(s.status).toBe('break')
    expect(s.nextOpenLabel).toBe('às 13:00 de hoje')
  })

  it('antes de abrir (08:00) → before_open', () => {
    const s = computeBusinessState(COMMERCIAL, 'UTC', [], MON(8))
    expect(s.status).toBe('before_open')
    expect(s.nextOpenLabel).toBe('às 09:00 de hoje')
  })

  it('depois de fechar (19:00) → closed_today, abre amanhã 09:00', () => {
    const s = computeBusinessState(COMMERCIAL, 'UTC', [], MON(19))
    expect(s.status).toBe('closed_today')
    expect(s.nextOpenLabel).toBe('amanhã às 09:00')
  })

  it('sábado → fechado, próxima abertura segunda-feira', () => {
    const s = computeBusinessState(COMMERCIAL, 'UTC', [], SAT(10))
    expect(s.isOpen).toBe(false)
    expect(s.nextOpenLabel).toBe('segunda-feira às 09:00')
  })

  it('feriado hoje (segunda) → closed_holiday', () => {
    const s = computeBusinessState(COMMERCIAL, 'UTC', ['2026-06-08'], MON(10))
    expect(s.status).toBe('closed_holiday')
    expect(s.nextOpenLabel).toBe('amanhã às 09:00')
  })

  it('schedule vazio → always_closed', () => {
    const s = computeBusinessState({}, 'UTC', [], MON(10))
    expect(s.status).toBe('always_closed')
    expect(s.nextOpenLabel).toBeNull()
  })
})

describe('computeBusinessState (tz America/Sao_Paulo, offset)', () => {
  it('Seg 14:00 UTC = 11:00 SP → open (janela manhã 09–12)', () => {
    const s = computeBusinessState(COMMERCIAL, 'America/Sao_Paulo', [], MON(14))
    expect(s.status).toBe('open')
  })

  it('Seg 16:00 UTC = 13:00 SP → na pausa? não (13:00 reabre) → open', () => {
    // 13:00 SP é exatamente o reinício da tarde → dentro de [13:00,18:00].
    const s = computeBusinessState(COMMERCIAL, 'America/Sao_Paulo', [], MON(16))
    expect(s.status).toBe('open')
  })
})

describe('businessStateToDict', () => {
  it('serializa os campos esperados pelo tool_result', () => {
    const s = computeBusinessState(COMMERCIAL, 'UTC', [], MON(19))
    const d = businessStateToDict(s)
    expect(d).toMatchObject({
      status: 'closed_today',
      aberto: false,
      proximo_aberto: 'amanhã às 09:00',
      timezone: 'UTC',
    })
    expect(typeof d.orientacao_resposta).toBe('string')
  })
})
