/**
 * idempotency.service — unit tests (QH-01)
 *
 * Cobre:
 *   (a) primeira chamada com par (connectionId, waMessageId) → não-duplicado
 *   (b) segunda chamada com mesmo par → duplicado
 *   (c) Redis lançando erro → fail-open (isDuplicate: false) sem throw
 *
 * Mocks via vi.hoisted() para que as referências estejam disponíveis antes
 * do hoisting de vi.mock (requisito do Vitest).
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/ai-agents/infra/idempotency.service.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted: cria os mocks antes do hoisting de vi.mock ────────────────────

const { mockSet, mockWarn, mockInfo } = vi.hoisted(() => {
  return {
    mockSet: vi.fn(),
    mockWarn: vi.fn(),
    mockInfo: vi.fn(),
  }
})

// ── Mocks de módulo ────────────────────────────────────────────────────────────

vi.mock('@/server/services/redis', () => ({
  getRedis: () => ({ set: mockSet }),
}))

vi.mock('@/server/services/logger', () => ({
  logger: {
    warn: mockWarn,
    info: mockInfo,
  },
}))

// ── Import do serviço (após mocks declarados) ─────────────────────────────────

import { checkAndMarkProcessed } from './idempotency.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_INPUT = {
  connectionId: 'conn-abc123',
  waMessageId: 'wamid.ABC123XYZ',
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('checkAndMarkProcessed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── (a) Primeira ocorrência ────────────────────────────────────────────────

  describe('(a) primeira vez — mensagem nova', () => {
    it('retorna isDuplicate: false quando SET NX bem-sucedido (retorna "OK")', async () => {
      // SET NX cria a chave → retorna 'OK'
      mockSet.mockResolvedValueOnce('OK')

      const result = await checkAndMarkProcessed(BASE_INPUT)

      expect(result).toEqual({ isDuplicate: false })
    })

    it('chama redis.set com os parâmetros corretos (NX + TTL 86400s)', async () => {
      mockSet.mockResolvedValueOnce('OK')

      await checkAndMarkProcessed(BASE_INPUT)

      expect(mockSet).toHaveBeenCalledOnce()
      expect(mockSet).toHaveBeenCalledWith(
        `wa:dedup:${BASE_INPUT.connectionId}:${BASE_INPUT.waMessageId}`,
        '1',
        'EX',
        86400, // 24h em segundos
        'NX',
      )
    })

    it('não loga warn quando primeira ocorrência', async () => {
      mockSet.mockResolvedValueOnce('OK')

      await checkAndMarkProcessed(BASE_INPUT)

      expect(mockWarn).not.toHaveBeenCalled()
    })
  })

  // ── (b) Segunda ocorrência (duplicado) ────────────────────────────────────

  describe('(b) segunda vez — mensagem duplicada', () => {
    it('retorna isDuplicate: true quando SET NX falha (chave já existe → retorna null)', async () => {
      // SET NX encontra a chave existente → retorna null (não cria)
      mockSet.mockResolvedValueOnce(null)

      const result = await checkAndMarkProcessed(BASE_INPUT)

      expect(result).toEqual({ isDuplicate: true })
    })

    it('loga info ao detectar duplicata', async () => {
      mockSet.mockResolvedValueOnce(null)

      await checkAndMarkProcessed(BASE_INPUT)

      expect(mockInfo).toHaveBeenCalledOnce()
      expect(mockInfo).toHaveBeenCalledWith(
        expect.stringContaining('duplicada'),
        expect.objectContaining({
          connectionId: BASE_INPUT.connectionId,
          waMessageId: BASE_INPUT.waMessageId,
        }),
      )
    })

    it('simula sequência: 1ª chamada não-dup → 2ª chamada dup', async () => {
      // 1ª: chave criada
      mockSet.mockResolvedValueOnce('OK')
      const first = await checkAndMarkProcessed(BASE_INPUT)
      expect(first).toEqual({ isDuplicate: false })

      // 2ª: chave já existe
      mockSet.mockResolvedValueOnce(null)
      const second = await checkAndMarkProcessed(BASE_INPUT)
      expect(second).toEqual({ isDuplicate: true })

      expect(mockSet).toHaveBeenCalledTimes(2)
    })
  })

  // ── (c) Redis falhando — fail-open ────────────────────────────────────────

  describe('(c) Redis falhando — fail-open', () => {
    it('retorna isDuplicate: false quando redis.set lança Error', async () => {
      mockSet.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      const result = await checkAndMarkProcessed(BASE_INPUT)

      expect(result).toEqual({ isDuplicate: false })
    })

    it('loga warn descrevendo o erro de Redis', async () => {
      const redisError = new Error('Connection timed out')
      mockSet.mockRejectedValueOnce(redisError)

      await checkAndMarkProcessed(BASE_INPUT)

      expect(mockWarn).toHaveBeenCalledOnce()
      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining('fail-open'),
        expect.objectContaining({
          error: 'Connection timed out',
        }),
      )
    })

    it('nunca lança exceção quando Redis falha', async () => {
      mockSet.mockRejectedValueOnce(new Error('Redis is down'))

      await expect(checkAndMarkProcessed(BASE_INPUT)).resolves.not.toThrow()
    })

    it('fail-open mesmo para erros não-Error (string, null, undefined)', async () => {
      mockSet.mockRejectedValueOnce('raw string error')

      const result = await checkAndMarkProcessed(BASE_INPUT)

      expect(result).toEqual({ isDuplicate: false })
      expect(mockWarn).toHaveBeenCalledOnce()
    })
  })

  // ── Validação Zod ─────────────────────────────────────────────────────────

  describe('validação de input (Zod)', () => {
    it('connectionId vazio → fail-open (sem throw) + warn de validação', async () => {
      const result = await checkAndMarkProcessed({
        connectionId: '',
        waMessageId: 'wamid.XYZ',
      })

      expect(result).toEqual({ isDuplicate: false })
      // Redis nunca deve ser chamado com input inválido
      expect(mockSet).not.toHaveBeenCalled()
      expect(mockWarn).toHaveBeenCalledOnce()
    })

    it('waMessageId vazio → fail-open + warn, Redis não chamado', async () => {
      const result = await checkAndMarkProcessed({
        connectionId: 'conn-123',
        waMessageId: '',
      })

      expect(result).toEqual({ isDuplicate: false })
      expect(mockSet).not.toHaveBeenCalled()
      expect(mockWarn).toHaveBeenCalledOnce()
    })
  })

  // ── Isolamento de chave por connectionId ──────────────────────────────────

  describe('isolamento por connectionId', () => {
    it('mesmo waMessageId com connectionId diferente → chaves distintas (ambas novas)', async () => {
      mockSet.mockResolvedValue('OK')

      const r1 = await checkAndMarkProcessed({
        connectionId: 'conn-A',
        waMessageId: 'wamid.SAME',
      })
      const r2 = await checkAndMarkProcessed({
        connectionId: 'conn-B',
        waMessageId: 'wamid.SAME',
      })

      expect(r1).toEqual({ isDuplicate: false })
      expect(r2).toEqual({ isDuplicate: false })

      const calls = mockSet.mock.calls
      expect(calls[0][0]).toBe('wa:dedup:conn-A:wamid.SAME')
      expect(calls[1][0]).toBe('wa:dedup:conn-B:wamid.SAME')
    })
  })
})
