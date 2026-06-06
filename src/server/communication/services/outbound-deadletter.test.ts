/**
 * Unit tests do inspetor read-only da dead-letter outbound.
 *
 * Cobre: parse newest-first + summary, entrada corrompida (pula sem quebrar),
 * fail-open (Redis down → ok:false), list vazia e clamp do limit.
 * O Redis é mockado — LLEN/LRANGE apenas, nada destrutivo.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const redis = vi.hoisted(() => ({
  llen: vi.fn(),
  lrange: vi.fn(),
}))

vi.mock('@/server/services/redis', () => ({
  getRedis: () => redis,
}))

import {
  inspectDeadLetter,
  type DeadLetterPayload,
} from './outbound-deadletter'

function entry(over: Partial<DeadLetterPayload>): string {
  return JSON.stringify({
    organizationId: 'org_1',
    phone: '5511999999999',
    text: 'oi',
    error: 'boom',
    timestamp: '2026-06-06T00:00:00.000Z',
    ...over,
  })
}

describe('inspectDeadLetter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna entradas newest-first + total (LLEN) + summary por org/erro', async () => {
    redis.llen.mockResolvedValue(3)
    redis.lrange.mockResolvedValue([
      entry({ organizationId: 'org_A', error: 'timeout', timestamp: '2026-06-06T03:00:00.000Z' }),
      entry({ organizationId: 'org_A', error: 'timeout', timestamp: '2026-06-06T02:00:00.000Z' }),
      entry({ organizationId: 'org_B', error: 'http 500', timestamp: '2026-06-06T01:00:00.000Z' }),
    ])

    const r = await inspectDeadLetter()

    expect(r.ok).toBe(true)
    expect(r.total).toBe(3)
    expect(r.returned).toBe(3)
    expect(r.byOrg).toEqual({ org_A: 2, org_B: 1 })
    expect(r.byError).toEqual({ timeout: 2, 'http 500': 1 })
    expect(r.newest).toBe('2026-06-06T03:00:00.000Z')
    expect(r.oldest).toBe('2026-06-06T01:00:00.000Z')
  })

  it('pula entrada corrompida sem derrubar a inspeção', async () => {
    redis.llen.mockResolvedValue(2)
    redis.lrange.mockResolvedValue([entry({ organizationId: 'org_ok' }), 'not-json{'])

    const r = await inspectDeadLetter()

    expect(r.ok).toBe(true)
    expect(r.total).toBe(2)
    expect(r.returned).toBe(1)
    expect(r.byOrg).toEqual({ org_ok: 1 })
  })

  it('fail-open: Redis down → ok:false com campos zerados (não lança)', async () => {
    redis.llen.mockRejectedValue(new Error('redis down'))

    const r = await inspectDeadLetter()

    expect(r.ok).toBe(false)
    expect(r.total).toBe(0)
    expect(r.returned).toBe(0)
    expect(r.entries).toEqual([])
  })

  it('list vazia → ok:true, returned 0, sem newest/oldest', async () => {
    redis.llen.mockResolvedValue(0)
    redis.lrange.mockResolvedValue([])

    const r = await inspectDeadLetter()

    expect(r.ok).toBe(true)
    expect(r.returned).toBe(0)
    expect(r.newest).toBeUndefined()
    expect(r.oldest).toBeUndefined()
  })

  it('clampa o limit: pede 0 → usa 1 (LRANGE 0..0)', async () => {
    redis.llen.mockResolvedValue(5)
    redis.lrange.mockResolvedValue([entry({})])

    await inspectDeadLetter({ limit: 0 })

    expect(redis.lrange).toHaveBeenCalledWith('outbound:deadletter', 0, 0)
  })

  it('clampa o limit ao cap 1000 (LRANGE 0..999)', async () => {
    redis.llen.mockResolvedValue(5)
    redis.lrange.mockResolvedValue([])

    await inspectDeadLetter({ limit: 99999 })

    expect(redis.lrange).toHaveBeenCalledWith('outbound:deadletter', 0, 999)
  })
})
