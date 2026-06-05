/**
 * Unit tests for inbound webhook resilience helpers (Orayon patterns).
 *
 *  - Idempotent dedup: sha256(instance:messageId) claimed via SET NX EX; first
 *    delivery processes, retries are flagged duplicate; Redis failure fails open.
 *  - Operator takeover: stamps ChatSession.aiBlockedUntil = now + 15min; DB
 *    failure is swallowed (best-effort).
 */

import { describe, it, expect, vi } from 'vitest'
import {
  computeInboundDedupHash,
  isDuplicateInbound,
  pauseAiForOperatorTakeover,
  OPERATOR_TAKEOVER_PAUSE_MS,
} from './inbound-resilience'

describe('computeInboundDedupHash', () => {
  it('is deterministic for the same instance+messageId', () => {
    const a = computeInboundDedupHash('inst-1', 'wamid.123')
    const b = computeInboundDedupHash('inst-1', 'wamid.123')
    expect(a).toBe(b)
    // sha256 hex = 64 chars
    expect(a).toHaveLength(64)
  })

  it('differs when instance or messageId differ', () => {
    expect(computeInboundDedupHash('inst-1', 'm')).not.toBe(
      computeInboundDedupHash('inst-2', 'm'),
    )
    expect(computeInboundDedupHash('inst-1', 'a')).not.toBe(
      computeInboundDedupHash('inst-1', 'b'),
    )
  })
})

describe('isDuplicateInbound', () => {
  it('returns false (not duplicate) on first delivery — SET NX succeeds', async () => {
    const set = vi.fn().mockResolvedValue('OK')
    const redis = { set } as unknown as Parameters<typeof isDuplicateInbound>[0]

    const dup = await isDuplicateInbound(redis, 'inst-1', 'wamid.1')

    expect(dup).toBe(false)
    expect(set).toHaveBeenCalledTimes(1)
    const [key, value, exFlag, ttl, nxFlag] = set.mock.calls[0]
    expect(key).toMatch(/^dedup:wa:[0-9a-f]{64}$/)
    expect(value).toBe('1')
    expect(exFlag).toBe('EX')
    expect(ttl).toBe(86400)
    expect(nxFlag).toBe('NX')
  })

  it('returns true (duplicate) when SET NX returns null (key already existed)', async () => {
    const set = vi.fn().mockResolvedValue(null)
    const redis = { set } as unknown as Parameters<typeof isDuplicateInbound>[0]

    const dup = await isDuplicateInbound(redis, 'inst-1', 'wamid.1')

    expect(dup).toBe(true)
  })

  it('fails open (false) when Redis client is null', async () => {
    expect(await isDuplicateInbound(null, 'inst-1', 'wamid.1')).toBe(false)
  })

  it('fails open (false) when redis.set throws (Redis down)', async () => {
    const set = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const redis = { set } as unknown as Parameters<typeof isDuplicateInbound>[0]

    expect(await isDuplicateInbound(redis, 'inst-1', 'wamid.1')).toBe(false)
  })

  it('fails open (false) when instanceId or messageId is empty', async () => {
    const set = vi.fn()
    const redis = { set } as unknown as Parameters<typeof isDuplicateInbound>[0]

    expect(await isDuplicateInbound(redis, '', 'wamid.1')).toBe(false)
    expect(await isDuplicateInbound(redis, 'inst-1', '')).toBe(false)
    expect(set).not.toHaveBeenCalled()
  })
})

describe('pauseAiForOperatorTakeover', () => {
  it('stamps aiBlockedUntil = now + 15min and a reason', async () => {
    const update = vi.fn().mockResolvedValue({})
    const db = { chatSession: { update } }
    const now = 1_000_000_000_000

    const result = await pauseAiForOperatorTakeover(db, 'session-1', now)

    expect(result).toEqual(new Date(now + OPERATOR_TAKEOVER_PAUSE_MS))
    expect(update).toHaveBeenCalledTimes(1)
    const arg = update.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'session-1' })
    expect(arg.data.aiBlockedUntil).toEqual(new Date(now + OPERATOR_TAKEOVER_PAUSE_MS))
    expect(arg.data.aiBlockReason).toBe('operator_takeover')
  })

  it('uses a 15-minute cooldown window', () => {
    expect(OPERATOR_TAKEOVER_PAUSE_MS).toBe(15 * 60 * 1000)
  })

  it('returns null and swallows the error when the DB update throws', async () => {
    const update = vi.fn().mockRejectedValue(new Error('db down'))
    const db = { chatSession: { update } }

    const result = await pauseAiForOperatorTakeover(db, 'session-1')

    expect(result).toBeNull()
  })

  it('returns null without touching the DB when sessionId is empty', async () => {
    const update = vi.fn()
    const db = { chatSession: { update } }

    expect(await pauseAiForOperatorTakeover(db, '')).toBeNull()
    expect(update).not.toHaveBeenCalled()
  })
})
