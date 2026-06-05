/**
 * trace-context.service — unit tests (QH-13)
 *
 * Cobre:
 *   (a) newTraceId — gera string no formato UUID v4
 *   (b) withTrace + getTraceId — round-trip: attach no producer, extract no consumer
 *   (c) getTraceId de payload sem trace → undefined (fail-open)
 *   (d) getTraceId de carrier malformado → undefined (fail-open)
 *   (e) withTrace não muta o payload original
 *   (f) getTraceCarrier — extrai carrier completo (id + ts + meta)
 *   (g) isValidTraceId — aceita UUID v4 válido, rejeita outros formatos
 *
 * Mocks via vi.hoisted: logger é mockado antes do hoisting de vi.mock.
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/ai-agents/infra/trace-context.service.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted: cria mocks antes do hoisting de vi.mock ───────────────────────

const { mockLoggerInfo } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
}))

// ── Mocks de módulo ────────────────────────────────────────────────────────────

vi.mock('@/server/services/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// ── Import do serviço (após mocks) ────────────────────────────────────────────

import {
  newTraceId,
  isValidTraceId,
  withTrace,
  getTraceId,
  getTraceCarrier,
} from './trace-context.service'

// ── UUID v4 regex (referência de teste) ───────────────────────────────────────

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// ── Helpers ───────────────────────────────────────────────────────────────────

function basePayload(): { organizationId: string; sourceIds: string[] } {
  return { organizationId: 'org-1', sourceIds: ['src-a', 'src-b'] }
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('newTraceId', () => {
  it('(a) gera string no formato UUID v4 estável', () => {
    const id = newTraceId()
    expect(typeof id).toBe('string')
    expect(UUID_V4_RE.test(id)).toBe(true)
  })

  it('gera ids únicos a cada chamada', () => {
    const ids = Array.from({ length: 20 }, () => newTraceId())
    const unique = new Set(ids)
    expect(unique.size).toBe(20)
  })

  it('tem exatamente 36 caracteres (8-4-4-4-12 + 4 hifens)', () => {
    expect(newTraceId()).toHaveLength(36)
  })
})

describe('isValidTraceId', () => {
  it('(g) aceita UUID v4 minúsculo', () => {
    // UUID v4 genuíno — terceiro grupo começa com '4', quarto começa com 8/9/a/b
    expect(isValidTraceId('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true)
    // UUID v1 — terceiro grupo começa com '1', não '4'
    expect(isValidTraceId('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(false)
  })

  it('rejeita string vazia', () => {
    expect(isValidTraceId('')).toBe(false)
  })

  it('rejeita UUID v1 (terceiro grupo não começa com 4)', () => {
    expect(isValidTraceId('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(false)
  })

  it('rejeita string aleatória sem hifens', () => {
    expect(isValidTraceId('abc123')).toBe(false)
  })
})

describe('withTrace', () => {
  beforeEach(() => vi.clearAllMocks())

  it('(b) round-trip: getTraceId extrai o traceId anexado por withTrace', () => {
    const traceId = newTraceId()
    const payload = withTrace(traceId, { sessionId: 'sess-1' }, basePayload())

    const extracted = getTraceId(payload as unknown as Record<string, unknown>)
    expect(extracted).toBe(traceId)
  })

  it('(e) não muta o payload original', () => {
    const original = basePayload()
    const traceId = newTraceId()

    withTrace(traceId, {}, original)

    expect(original).not.toHaveProperty('_trace')
    expect(original).toEqual({ organizationId: 'org-1', sourceIds: ['src-a', 'src-b'] })
  })

  it('preserva todos os campos do payload base no objeto retornado', () => {
    const traceId = newTraceId()
    const result = withTrace(traceId, {}, basePayload())

    expect(result.organizationId).toBe('org-1')
    expect(result.sourceIds).toEqual(['src-a', 'src-b'])
  })

  it('inclui meta no carrier _trace', () => {
    const traceId = newTraceId()
    const meta = { sessionId: 'sess-99', contactPhone: '+5511900000000' }
    const result = withTrace(traceId, meta, {})

    const carrier = getTraceCarrier(result as unknown as Record<string, unknown>)
    expect(carrier?.meta).toEqual(meta)
  })

  it('loga info com traceId ao anexar', () => {
    const traceId = newTraceId()
    withTrace(traceId, { sessionId: 'sess-x' }, {})

    expect(mockLoggerInfo).toHaveBeenCalledOnce()
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      expect.stringContaining('traceId'),
      expect.objectContaining({ traceId }),
    )
  })

  it('o campo ts do carrier é uma string ISO datetime válida', () => {
    const before = new Date()
    const traceId = newTraceId()
    const result = withTrace(traceId, {}, {})
    const after = new Date()

    const carrier = getTraceCarrier(result as unknown as Record<string, unknown>)
    const ts = new Date(carrier?.ts ?? '')
    expect(Number.isNaN(ts.getTime())).toBe(false)
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime())
  })
})

describe('getTraceId', () => {
  it('(b) extrai traceId de payload com _trace válido', () => {
    const traceId = newTraceId()
    const payload = withTrace(traceId, {}, {})
    expect(getTraceId(payload as unknown as Record<string, unknown>)).toBe(traceId)
  })

  it('(c) retorna undefined quando payload não tem _trace', () => {
    const payload: Record<string, unknown> = { organizationId: 'org-1' }
    expect(getTraceId(payload)).toBeUndefined()
  })

  it('(c) retorna undefined para payload vazio {}', () => {
    expect(getTraceId({})).toBeUndefined()
  })

  it('(d) retorna undefined quando _trace.id tem formato inválido (carrier malformado)', () => {
    const payload: Record<string, unknown> = {
      _trace: { id: 'not-a-uuid', ts: new Date().toISOString() },
    }
    expect(getTraceId(payload)).toBeUndefined()
  })

  it('(d) retorna undefined quando _trace não é objeto', () => {
    expect(getTraceId({ _trace: 'plain-string' })).toBeUndefined()
    expect(getTraceId({ _trace: 42 })).toBeUndefined()
    expect(getTraceId({ _trace: null })).toBeUndefined()
  })

  it('(d) retorna undefined quando _trace.ts não é datetime ISO', () => {
    const payload: Record<string, unknown> = {
      _trace: { id: newTraceId(), ts: 'not-a-date' },
    }
    expect(getTraceId(payload)).toBeUndefined()
  })

  it('nunca lança mesmo que _trace seja um objeto arbitrário', () => {
    const payload: Record<string, unknown> = { _trace: { nested: { deep: true } } }
    expect(() => getTraceId(payload)).not.toThrow()
    expect(getTraceId(payload)).toBeUndefined()
  })
})

describe('getTraceCarrier', () => {
  it('(f) extrai carrier completo com id, ts e meta', () => {
    const traceId = newTraceId()
    const meta = { sessionId: 'sess-abc' }
    const payload = withTrace(traceId, meta, {})

    const carrier = getTraceCarrier(payload as unknown as Record<string, unknown>)
    expect(carrier).not.toBeUndefined()
    expect(carrier?.id).toBe(traceId)
    expect(carrier?.meta).toEqual(meta)
    expect(typeof carrier?.ts).toBe('string')
  })

  it('retorna undefined quando _trace ausente', () => {
    expect(getTraceCarrier({})).toBeUndefined()
  })

  it('nunca lança', () => {
    expect(() => getTraceCarrier({ _trace: undefined })).not.toThrow()
  })
})
