/**
 * contact-lock.service — unit tests (QH-04)
 *
 * Cobre:
 *   1. Aquisição livre (chave inexistente) → acquired: true + token UUID
 *   2. Segunda aquisição bloqueada enquanto lock ativo → acquired: false
 *   3. Release com token correto libera (Lua retorna 1)
 *   4. Release com token errado não apaga (Lua retorna 0) + loga warn
 *   5. Fail-open: Redis lança na aquisição → acquired: true, token: null
 *   6. Fail-open: token null na aquisição → release é no-op (sem throw)
 *   7. Release com Redis indisponível → no-op, nunca lança
 *   8. Input inválido na aquisição → fail-open (Zod)
 *   9. Input inválido no release → no-op (Zod, cobre token=null path)
 *  10. Isolamento de chave: contatos diferentes não se bloqueiam
 *
 * Rodar:
 *   npx vitest run src/server/ai-module/ai-agents/infra/contact-lock.service.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted: cria mocks antes do hoisting de vi.mock ──────────────────────

const { mockSet, mockEval, mockWarn, mockInfo } = vi.hoisted(() => ({
  mockSet: vi.fn(),
  mockEval: vi.fn(),
  mockWarn: vi.fn(),
  mockInfo: vi.fn(),
}))

// ── Mocks de módulo ───────────────────────────────────────────────────────────

vi.mock('@/server/services/redis', () => ({
  getRedis: () => ({ set: mockSet, eval: mockEval }),
}))

vi.mock('@/server/services/logger', () => ({
  logger: {
    warn: mockWarn,
    info: mockInfo,
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// ── Import do serviço (após mocks) ────────────────────────────────────────────

import {
  acquireContactLock,
  releaseContactLock,
} from './contact-lock.service'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE = {
  organizationId: 'org-abc-123',
  contactPhone: '+5511999990001',
}

const EXPECTED_KEY = `wa:lock:${BASE.organizationId}:${BASE.contactPhone}`

// ── Suite: acquireContactLock ─────────────────────────────────────────────────

describe('acquireContactLock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── 1. Aquisição livre ────────────────────────────────────────────────────

  describe('1. aquisição livre — lock disponível', () => {
    it('retorna acquired: true e um token UUID quando SET NX tem sucesso', async () => {
      mockSet.mockResolvedValueOnce('OK')

      const result = await acquireContactLock(BASE)

      expect(result.acquired).toBe(true)
      expect(result.token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
    })

    it('chama redis.set com PX (TTL em ms) e NX na ordem correta', async () => {
      mockSet.mockResolvedValueOnce('OK')

      await acquireContactLock(BASE)

      expect(mockSet).toHaveBeenCalledOnce()
      // ioredis exige: set(key, value, 'PX', ms, 'NX')
      const [key, _token, px, ttlMs, nx] = mockSet.mock.calls[0]
      expect(key).toBe(EXPECTED_KEY)
      expect(px).toBe('PX')
      expect(typeof ttlMs).toBe('number')
      expect(ttlMs).toBeGreaterThan(0)
      expect(nx).toBe('NX')
    })

    it('TTL customizado é repassado ao Redis', async () => {
      mockSet.mockResolvedValueOnce('OK')

      await acquireContactLock({ ...BASE, ttlMs: 5_000 })

      // ordem: (key, token, 'PX', ttlMs, 'NX')
      const [, , , ttlMs] = mockSet.mock.calls[0]
      expect(ttlMs).toBe(5_000)
    })

    it('tokens de aquisições distintas são únicos', async () => {
      mockSet.mockResolvedValue('OK')

      const r1 = await acquireContactLock(BASE)
      const r2 = await acquireContactLock(BASE)

      expect(r1.token).not.toBe(r2.token)
    })
  })

  // ── 2. Lock bloqueado por outro turno ─────────────────────────────────────

  describe('2. lock bloqueado — outra instância detém o lock', () => {
    it('retorna acquired: false quando SET NX retorna null', async () => {
      mockSet.mockResolvedValueOnce(null)

      const result = await acquireContactLock(BASE)

      expect(result.acquired).toBe(false)
      expect(result.token).toBeNull()
    })

    it('loga info ao detectar turno concorrente', async () => {
      mockSet.mockResolvedValueOnce(null)

      await acquireContactLock(BASE)

      expect(mockInfo).toHaveBeenCalledOnce()
      expect(mockInfo).toHaveBeenCalledWith(
        expect.stringContaining('concorrente'),
        expect.objectContaining({ organizationId: BASE.organizationId }),
      )
    })
  })

  // ── 5. Fail-open: Redis lança erro ────────────────────────────────────────

  describe('5. fail-open — Redis indisponível na aquisição', () => {
    it('retorna acquired: true e token: null quando Redis lança', async () => {
      mockSet.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      const result = await acquireContactLock(BASE)

      expect(result.acquired).toBe(true)
      expect(result.token).toBeNull()
    })

    it('loga warn descrevendo o erro', async () => {
      mockSet.mockRejectedValueOnce(new Error('Connection timed out'))

      await acquireContactLock(BASE)

      expect(mockWarn).toHaveBeenCalledOnce()
      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining('fail-open'),
        expect.objectContaining({ error: 'Connection timed out' }),
      )
    })

    it('nunca lança exceção mesmo com Redis fora', async () => {
      mockSet.mockRejectedValueOnce(new Error('Redis is down'))

      await expect(acquireContactLock(BASE)).resolves.not.toThrow()
    })
  })

  // ── 8. Input inválido (Zod) ───────────────────────────────────────────────

  describe('8. input inválido — fail-open via Zod', () => {
    it('organizationId vazio → fail-open (acquired: true, token: null)', async () => {
      const result = await acquireContactLock({ organizationId: '', contactPhone: '+5511' })

      expect(result.acquired).toBe(true)
      expect(result.token).toBeNull()
      expect(mockSet).not.toHaveBeenCalled()
    })

    it('contactPhone vazio → fail-open, Redis não chamado', async () => {
      const result = await acquireContactLock({ organizationId: 'org-1', contactPhone: '' })

      expect(result.acquired).toBe(true)
      expect(result.token).toBeNull()
      expect(mockSet).not.toHaveBeenCalled()
    })
  })

  // ── 10. Isolamento de chave ───────────────────────────────────────────────

  describe('10. isolamento — contatos diferentes não se bloqueiam', () => {
    it('dois contatos distintos geram chaves diferentes', async () => {
      mockSet.mockResolvedValue('OK')

      await acquireContactLock({ ...BASE, contactPhone: '+5511111110001' })
      await acquireContactLock({ ...BASE, contactPhone: '+5511222220002' })

      const [key1] = mockSet.mock.calls[0]
      const [key2] = mockSet.mock.calls[1]
      expect(key1).not.toBe(key2)
      expect(key1).toContain('+5511111110001')
      expect(key2).toContain('+5511222220002')
    })
  })
})

// ── Suite: releaseContactLock ─────────────────────────────────────────────────

describe('releaseContactLock', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── 3. Release com token correto ──────────────────────────────────────────

  describe('3. release com token correto', () => {
    it('chama eval com o script Lua, a chave e o token', async () => {
      mockEval.mockResolvedValueOnce(1)

      await releaseContactLock({ ...BASE, token: 'tok-abc' })

      expect(mockEval).toHaveBeenCalledOnce()
      const [_script, numKeys, key, token] = mockEval.mock.calls[0]
      expect(numKeys).toBe(1)
      expect(key).toBe(EXPECTED_KEY)
      expect(token).toBe('tok-abc')
    })

    it('não loga warn quando Lua retorna 1 (apagou com sucesso)', async () => {
      mockEval.mockResolvedValueOnce(1)

      await releaseContactLock({ ...BASE, token: 'tok-abc' })

      expect(mockWarn).not.toHaveBeenCalled()
    })
  })

  // ── 4. Release com token errado ───────────────────────────────────────────

  describe('4. release com token errado — compare-and-delete falha', () => {
    it('loga warn quando Lua retorna 0 (token diferente)', async () => {
      mockEval.mockResolvedValueOnce(0)

      await releaseContactLock({ ...BASE, token: 'token-errado' })

      expect(mockWarn).toHaveBeenCalledOnce()
      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining('token não bateu'),
        expect.objectContaining({ organizationId: BASE.organizationId }),
      )
    })

    it('não lança exceção com token errado', async () => {
      mockEval.mockResolvedValueOnce(0)

      await expect(
        releaseContactLock({ ...BASE, token: 'wrong-token' }),
      ).resolves.toBeUndefined()
    })
  })

  // ── 6. Token null do fail-open → no-op ───────────────────────────────────

  describe('6. token null (fail-open path) → no-op silencioso', () => {
    it('token string vazia → no-op, Redis não chamado', async () => {
      // token vazio falha no ReleaseInputSchema (min(1)) → Zod descarta → no-op
      await releaseContactLock({ ...BASE, token: '' })

      expect(mockEval).not.toHaveBeenCalled()
      expect(mockWarn).not.toHaveBeenCalled()
    })
  })

  // ── 7. Redis indisponível no release ─────────────────────────────────────

  describe('7. Redis indisponível no release', () => {
    it('loga warn mas nunca lança quando Redis falha', async () => {
      mockEval.mockRejectedValueOnce(new Error('ECONNRESET'))

      await expect(
        releaseContactLock({ ...BASE, token: 'tok-valid' }),
      ).resolves.toBeUndefined()

      expect(mockWarn).toHaveBeenCalledOnce()
      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining('indisponível'),
        expect.objectContaining({ error: 'ECONNRESET' }),
      )
    })
  })

  // ── 9. Input inválido no release (Zod) ───────────────────────────────────

  describe('9. input inválido no release — Zod no-op', () => {
    it('organizationId vazio → no-op, Redis não chamado', async () => {
      await releaseContactLock({ organizationId: '', contactPhone: '+5511', token: 'tok' })

      expect(mockEval).not.toHaveBeenCalled()
    })

    it('contactPhone vazio → no-op, Redis não chamado', async () => {
      await releaseContactLock({ organizationId: 'org-1', contactPhone: '', token: 'tok' })

      expect(mockEval).not.toHaveBeenCalled()
    })
  })
})

// ── Suite: fluxo ponta-a-ponta (sequência acquire → release) ─────────────────

describe('fluxo ponta-a-ponta', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adquire, e após release com token certo o lock é liberado (1 Lua call)', async () => {
    mockSet.mockResolvedValueOnce('OK')
    mockEval.mockResolvedValueOnce(1)

    const { acquired, token } = await acquireContactLock(BASE)

    expect(acquired).toBe(true)
    expect(token).not.toBeNull()

    await releaseContactLock({ ...BASE, token: token! })

    expect(mockEval).toHaveBeenCalledOnce()
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it('fail-open: token null → release é no-op (eval não chamado)', async () => {
    mockSet.mockRejectedValueOnce(new Error('Redis offline'))

    const { acquired, token } = await acquireContactLock(BASE)

    expect(acquired).toBe(true)
    expect(token).toBeNull()

    // Simula o try/finally do caller: token null → string vazia → Zod rejeita → no-op
    await releaseContactLock({ ...BASE, token: token ?? '' })

    expect(mockEval).not.toHaveBeenCalled()
  })
})
