/**
 * circuit-breaker.service — unit tests (QH-06)
 *
 * Cobre:
 *   1. CLOSED → OPEN após 5 falhas na janela
 *   2. OPEN bloqueia tentativas
 *   3. HALF_OPEN após expirar a janela de 300s
 *   4. Sucesso em HALF_OPEN reseta para CLOSED
 *   5. Falha em HALF_OPEN reabre (OPEN)
 *   6. Fail-open quando Redis lança erro
 *   7. Sucesso em CLOSED mantém CLOSED
 *   8. Input inválido → fail-open
 *
 * Tempo controlado via vi.useFakeTimers().
 * Redis mockado via vi.hoisted() + vi.mock().
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/ai-agents/infra/circuit-breaker.service.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  FAILURE_THRESHOLD,
  FAILURE_WINDOW_SECONDS,
  OPEN_DURATION_SECONDS,
} from './circuit-breaker.service'

// ── vi.hoisted: mocks antes do hoisting de vi.mock ────────────────────────────

const { mockGet, mockSet, mockDel, mockIncr, mockExpire, mockWarn } = vi.hoisted(
  () => ({
    mockGet: vi.fn<() => Promise<string | null>>(),
    mockSet: vi.fn<() => Promise<string>>(),
    mockDel: vi.fn<() => Promise<number>>(),
    mockIncr: vi.fn<() => Promise<number>>(),
    mockExpire: vi.fn<() => Promise<number>>(),
    mockWarn: vi.fn(),
  }),
)

vi.mock('@/server/services/redis', () => ({
  getRedis: () => ({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    incr: mockIncr,
    expire: mockExpire,
  }),
}))

vi.mock('@/server/services/logger', () => ({
  logger: {
    warn: mockWarn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// ── Import do serviço (após mocks) ─────────────────────────────────────────────

import { canAttempt, recordSuccess, recordFailure } from './circuit-breaker.service'

// ── Fixtures ───────────────────────────────────────────────────────────────────

const INPUT = { provider: 'openai', model: 'gpt-4o' }

const FAILURES_KEY = `circuit:openai:gpt-4o:failures`
const OPENED_AT_KEY = `circuit:openai:gpt-4o:opened_at`

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Simula circuit CLOSED: sem chave opened_at. */
function mockCircuitClosed(): void {
  mockGet.mockResolvedValue(null)
}

/** Simula circuit OPEN: opened_at agora (estado aberto recentemente). */
function mockCircuitOpen(nowSec: number): void {
  // opened_at = nowSec → elapsed = 0 < OPEN_DURATION_SECONDS
  mockGet.mockResolvedValue(String(nowSec))
}

/** Simula circuit HALF_OPEN: opened_at há mais de OPEN_DURATION_SECONDS. */
function mockCircuitHalfOpen(nowSec: number): void {
  const openedAt = nowSec - OPEN_DURATION_SECONDS - 1
  mockGet.mockResolvedValue(String(openedAt))
}

// ── Suites ─────────────────────────────────────────────────────────────────────

describe('canAttempt', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('CLOSED → allowed: true', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    mockCircuitClosed()

    const result = await canAttempt(INPUT)

    expect(result).toEqual({ allowed: true, state: 'closed' })
  })

  it('OPEN → allowed: false', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    vi.setSystemTime(now)
    mockCircuitOpen(Math.floor(now.getTime() / 1000))

    const result = await canAttempt(INPUT)

    expect(result).toEqual({ allowed: false, state: 'open' })
  })

  it('HALF_OPEN (após 300s) → allowed: true', async () => {
    const now = new Date('2026-01-01T00:05:01Z') // 301s depois
    vi.setSystemTime(now)
    mockCircuitHalfOpen(Math.floor(now.getTime() / 1000))

    const result = await canAttempt(INPUT)

    expect(result).toEqual({ allowed: true, state: 'half_open' })
  })

  it('fail-open quando Redis lança erro', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    mockGet.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await canAttempt(INPUT)

    expect(result).toEqual({ allowed: true, state: 'closed' })
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('fail-open'),
    )
  })

  it('input inválido (provider vazio) → fail-open', async () => {
    const result = await canAttempt({ provider: '', model: 'gpt-4o' })

    expect(result).toEqual({ allowed: true, state: 'closed' })
    expect(mockGet).not.toHaveBeenCalled()
  })
})

describe('recordFailure', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockSet.mockResolvedValue('OK')
    mockDel.mockResolvedValue(1)
    mockExpire.mockResolvedValue(1)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('4 falhas em CLOSED não abre o circuit', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    mockCircuitClosed()
    mockIncr.mockResolvedValue(FAILURE_THRESHOLD - 1) // 4ª falha

    await recordFailure(INPUT)

    // opened_at NÃO deve ser setado
    expect(mockSet).not.toHaveBeenCalledWith(
      OPENED_AT_KEY,
      expect.any(String),
    )
  })

  it('5ª falha em CLOSED → OPEN (set opened_at + del failures)', async () => {
    const now = new Date('2026-01-01T00:00:00Z')
    vi.setSystemTime(now)
    mockCircuitClosed()
    mockIncr.mockResolvedValue(FAILURE_THRESHOLD) // 5ª falha

    await recordFailure(INPUT)

    const expectedNowSec = String(Math.floor(now.getTime() / 1000))
    expect(mockSet).toHaveBeenCalledWith(OPENED_AT_KEY, expectedNowSec)
    expect(mockDel).toHaveBeenCalledWith(FAILURES_KEY)
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('OPEN'),
    )
  })

  it('primeira falha define TTL na janela de falhas', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    mockCircuitClosed()
    mockIncr.mockResolvedValue(1) // primeira falha

    await recordFailure(INPUT)

    expect(mockExpire).toHaveBeenCalledWith(FAILURES_KEY, FAILURE_WINDOW_SECONDS)
  })

  it('não define TTL novamente para falhas 2+', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    mockCircuitClosed()
    mockIncr.mockResolvedValue(3) // 3ª falha

    await recordFailure(INPUT)

    expect(mockExpire).not.toHaveBeenCalled()
  })

  it('falha em HALF_OPEN reabre o circuit (OPEN) sem incrementar contador', async () => {
    const now = new Date('2026-01-01T00:06:00Z')
    vi.setSystemTime(now)
    mockCircuitHalfOpen(Math.floor(now.getTime() / 1000))

    await recordFailure(INPUT)

    const expectedNowSec = String(Math.floor(now.getTime() / 1000))
    // Reabre setando opened_at com timestamp atual
    expect(mockSet).toHaveBeenCalledWith(OPENED_AT_KEY, expectedNowSec)
    expect(mockDel).toHaveBeenCalledWith(FAILURES_KEY)
    // Não deve incrementar contador de falhas
    expect(mockIncr).not.toHaveBeenCalled()
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('HALF_OPEN'),
    )
  })

  it('fail-silent quando Redis lança erro em recordFailure', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    mockGet.mockRejectedValue(new Error('Redis timeout'))

    // Não deve lançar
    await expect(recordFailure(INPUT)).resolves.toBeUndefined()
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('fail-open'),
    )
  })

  it('input inválido → no-op (sem Redis)', async () => {
    await recordFailure({ provider: 'openai', model: '' })

    expect(mockGet).not.toHaveBeenCalled()
    expect(mockIncr).not.toHaveBeenCalled()
  })
})

describe('recordSuccess', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockDel.mockResolvedValue(2)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sucesso em CLOSED → deleta failures e opened_at (reset completo)', async () => {
    await recordSuccess(INPUT)

    expect(mockDel).toHaveBeenCalledWith(FAILURES_KEY, OPENED_AT_KEY)
  })

  it('sucesso em HALF_OPEN → mesma operação de reset (fecha o circuit)', async () => {
    // Behavior is identical regardless of state — del both keys
    await recordSuccess(INPUT)

    expect(mockDel).toHaveBeenCalledWith(FAILURES_KEY, OPENED_AT_KEY)
  })

  it('fail-silent quando Redis lança erro em recordSuccess', async () => {
    mockDel.mockRejectedValue(new Error('ECONNRESET'))

    await expect(recordSuccess(INPUT)).resolves.toBeUndefined()
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('fail-open'),
    )
  })

  it('input inválido (model vazio) → no-op, sem chamar Redis', async () => {
    await recordSuccess({ provider: 'openai', model: '' })

    expect(mockDel).not.toHaveBeenCalled()
  })
})

describe('fluxo completo: CLOSED → OPEN → HALF_OPEN → CLOSED', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mockSet.mockResolvedValue('OK')
    mockDel.mockResolvedValue(2)
    mockExpire.mockResolvedValue(1)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('5 falhas abrem o circuit; bloqueia; após 300s meio-aberto; sucesso fecha', async () => {
    const t0 = new Date('2026-01-01T00:00:00Z')
    vi.setSystemTime(t0)

    // ── Fase 1: CLOSED, 5 falhas → OPEN ────────────────────────────────────
    mockCircuitClosed()
    mockIncr.mockResolvedValue(FAILURE_THRESHOLD) // 5ª falha
    await recordFailure(INPUT)

    const nowSec = Math.floor(t0.getTime() / 1000)
    expect(mockSet).toHaveBeenCalledWith(OPENED_AT_KEY, String(nowSec))

    // ── Fase 2: OPEN bloqueia ────────────────────────────────────────────────
    mockCircuitOpen(nowSec) // simula estado OPEN
    const blocked = await canAttempt(INPUT)
    expect(blocked).toEqual({ allowed: false, state: 'open' })

    // ── Fase 3: Avança 301s → HALF_OPEN ─────────────────────────────────────
    vi.advanceTimersByTime((OPEN_DURATION_SECONDS + 1) * 1000)
    const t1 = new Date(t0.getTime() + (OPEN_DURATION_SECONDS + 1) * 1000)
    mockCircuitHalfOpen(Math.floor(t1.getTime() / 1000))

    const probeAllowed = await canAttempt(INPUT)
    expect(probeAllowed).toEqual({ allowed: true, state: 'half_open' })

    // ── Fase 4: Sucesso fecha o circuit ──────────────────────────────────────
    vi.clearAllMocks()
    mockDel.mockResolvedValue(2)
    await recordSuccess(INPUT)

    expect(mockDel).toHaveBeenCalledWith(FAILURES_KEY, OPENED_AT_KEY)
  })

  it('falha em HALF_OPEN reabre; nova tentativa bloqueada', async () => {
    const t0 = new Date('2026-01-01T00:00:00Z')
    vi.setSystemTime(t0)

    // Circuito já aberto há 301s (HALF_OPEN)
    const nowSec = Math.floor(t0.getTime() / 1000)
    mockCircuitHalfOpen(nowSec)
    mockSet.mockResolvedValue('OK')

    await recordFailure(INPUT) // falha na prova → reabre

    expect(mockSet).toHaveBeenCalledWith(OPENED_AT_KEY, String(nowSec))

    // Agora está OPEN novamente
    mockCircuitOpen(nowSec)
    const result = await canAttempt(INPUT)
    expect(result).toEqual({ allowed: false, state: 'open' })
  })
})
