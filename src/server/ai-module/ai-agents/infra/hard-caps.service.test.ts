/**
 * hard-caps.service — unit tests (QH-03)
 *
 * Cobre:
 *   1. Abaixo do limite → exceeded: false
 *   2. Exatamente no limite → exceeded: true
 *   3. Acima do limite → exceeded: true
 *   4. Override de limite por parâmetro
 *   5. Fail-open quando Redis lança erro
 *   6. Fail-open quando input Zod inválido
 *   7. Redis retorna null → fallback para currentCostUsd
 *   8. incrementSessionCost: caminho feliz + fail-silent em erro Redis
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  checkSessionCostCap,
  incrementSessionCost,
  DEFAULT_SESSION_COST_CAP_USD,
  REDIS_COST_KEY_PREFIX,
} from './hard-caps.service'

// ── Mock do módulo Redis ───────────────────────────────────────────────────────

const mockGet = vi.fn<() => Promise<string | null>>()
const mockIncrByFloat = vi.fn<() => Promise<number>>()
const mockExpire = vi.fn<() => Promise<number>>()

vi.mock('@/server/services/redis', () => ({
  getRedis: () => ({
    get: mockGet,
    incrbyfloat: mockIncrByFloat,
    expire: mockExpire,
  }),
}))

// Mock logger para silenciar output nos testes
vi.mock('@/server/services/logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// ── Fixtures ───────────────────────────────────────────────────────────────────

const BASE_INPUT = {
  sessionId: 'sess-abc-123',
  organizationId: 'org-xyz-456',
  currentCostUsd: 0,
}

// ── Suite ──────────────────────────────────────────────────────────────────────

describe('checkSessionCostCap', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Por padrão, Redis retorna null (chave inexistente)
    mockGet.mockResolvedValue(null)
  })

  describe('abaixo do limite (default $2.00)', () => {
    it('custo 0 → exceeded: false', async () => {
      mockGet.mockResolvedValue(null)
      const result = await checkSessionCostCap({ ...BASE_INPUT, currentCostUsd: 0 })

      expect(result.exceeded).toBe(false)
      expect(result.limitUsd).toBe(DEFAULT_SESSION_COST_CAP_USD)
      expect(result.reason).toBeUndefined()
    })

    it('custo $1.99 (Redis) → exceeded: false', async () => {
      mockGet.mockResolvedValue('1.99')
      const result = await checkSessionCostCap({ ...BASE_INPUT, currentCostUsd: 0 })

      expect(result.exceeded).toBe(false)
      expect(result.limitUsd).toBe(DEFAULT_SESSION_COST_CAP_USD)
    })

    it('custo $0.50 (currentCostUsd, Redis null) → exceeded: false', async () => {
      mockGet.mockResolvedValue(null)
      const result = await checkSessionCostCap({ ...BASE_INPUT, currentCostUsd: 0.5 })

      expect(result.exceeded).toBe(false)
    })
  })

  describe('no limite / acima do limite', () => {
    it('custo exatamente $2.00 (Redis) → exceeded: true', async () => {
      mockGet.mockResolvedValue('2.00')
      const result = await checkSessionCostCap({ ...BASE_INPUT, currentCostUsd: 0 })

      expect(result.exceeded).toBe(true)
      expect(result.limitUsd).toBe(DEFAULT_SESSION_COST_CAP_USD)
      expect(result.reason).toContain('$2.00')
    })

    it('custo $2.50 (Redis) → exceeded: true com reason', async () => {
      mockGet.mockResolvedValue('2.50')
      const result = await checkSessionCostCap({ ...BASE_INPUT, currentCostUsd: 0 })

      expect(result.exceeded).toBe(true)
      expect(result.reason).toBeDefined()
      expect(result.reason).toContain('limite')
    })

    it('Redis null mas currentCostUsd >= limite → exceeded: true', async () => {
      mockGet.mockResolvedValue(null)
      const result = await checkSessionCostCap({
        ...BASE_INPUT,
        currentCostUsd: 2.0,
      })

      expect(result.exceeded).toBe(true)
    })

    it('custo $5.00 (Redis) → exceeded: true independente do currentCostUsd', async () => {
      mockGet.mockResolvedValue('5.00')
      const result = await checkSessionCostCap({
        ...BASE_INPUT,
        currentCostUsd: 0.01,
      })

      expect(result.exceeded).toBe(true)
    })
  })

  describe('override de limite', () => {
    it('limitUsd: 1.00 — custo $1.01 (Redis) → exceeded: true', async () => {
      mockGet.mockResolvedValue('1.01')
      const result = await checkSessionCostCap({
        ...BASE_INPUT,
        currentCostUsd: 0,
        limitUsd: 1.0,
      })

      expect(result.exceeded).toBe(true)
      expect(result.limitUsd).toBe(1.0)
    })

    it('limitUsd: 10.00 — custo $2.50 (Redis) → exceeded: false', async () => {
      mockGet.mockResolvedValue('2.50')
      const result = await checkSessionCostCap({
        ...BASE_INPUT,
        currentCostUsd: 0,
        limitUsd: 10.0,
      })

      expect(result.exceeded).toBe(false)
      expect(result.limitUsd).toBe(10.0)
    })

    it('limitUsd: 0.10 — custo $0.05 → exceeded: false', async () => {
      mockGet.mockResolvedValue('0.05')
      const result = await checkSessionCostCap({
        ...BASE_INPUT,
        currentCostUsd: 0,
        limitUsd: 0.1,
      })

      expect(result.exceeded).toBe(false)
    })
  })

  describe('fail-open em erros', () => {
    it('Redis.get lança → fail-open (exceeded: false, usa currentCostUsd < limite)', async () => {
      mockGet.mockRejectedValue(new Error('Redis connection refused'))

      const result = await checkSessionCostCap({
        ...BASE_INPUT,
        currentCostUsd: 0.50,
      })

      // currentCostUsd < limite default → exceeded false mesmo com Redis falhando
      expect(result.exceeded).toBe(false)
      expect(result.limitUsd).toBe(DEFAULT_SESSION_COST_CAP_USD)
    })

    it('Redis.get lança e currentCostUsd >= limite → exceeded: true (fallback correto)', async () => {
      mockGet.mockRejectedValue(new Error('Redis timeout'))

      const result = await checkSessionCostCap({
        ...BASE_INPUT,
        currentCostUsd: 3.00,
      })

      expect(result.exceeded).toBe(true)
    })

    it('input inválido (sessionId vazio) → fail-open, exceeded: false', async () => {
      const result = await checkSessionCostCap({
        sessionId: '',
        organizationId: 'org-xyz',
        currentCostUsd: 99,
      })

      expect(result.exceeded).toBe(false)
    })

    it('input inválido (currentCostUsd negativo) → fail-open', async () => {
      const result = await checkSessionCostCap({
        sessionId: 'sess-1',
        organizationId: 'org-1',
        currentCostUsd: -1,
      })

      expect(result.exceeded).toBe(false)
    })
  })

  describe('Redis key prefix', () => {
    it('consulta a chave correta no Redis', async () => {
      mockGet.mockResolvedValue(null)
      await checkSessionCostCap({ ...BASE_INPUT, sessionId: 'sess-test-99' })

      expect(mockGet).toHaveBeenCalledWith(`${REDIS_COST_KEY_PREFIX}sess-test-99`)
    })
  })
})

describe('incrementSessionCost', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockIncrByFloat.mockResolvedValue(1.5)
    mockExpire.mockResolvedValue(1)
  })

  it('incrementa chave Redis e renova TTL', async () => {
    await incrementSessionCost('sess-abc', 0.05)

    expect(mockIncrByFloat).toHaveBeenCalledWith(
      `${REDIS_COST_KEY_PREFIX}sess-abc`,
      0.05,
    )
    expect(mockExpire).toHaveBeenCalledWith(
      `${REDIS_COST_KEY_PREFIX}sess-abc`,
      expect.any(Number),
    )
  })

  it('custo 0 → não chama Redis (no-op)', async () => {
    await incrementSessionCost('sess-abc', 0)

    expect(mockIncrByFloat).not.toHaveBeenCalled()
    expect(mockExpire).not.toHaveBeenCalled()
  })

  it('Redis lança erro → fail-silent (não propaga)', async () => {
    mockIncrByFloat.mockRejectedValue(new Error('Redis down'))

    await expect(incrementSessionCost('sess-abc', 0.10)).resolves.toBeUndefined()
  })
})
