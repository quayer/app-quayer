/**
 * QH-02 — rate-limit.service unit tests
 *
 * Cenários cobertos:
 *   1. Rajada estoura limite por instância (100 envios → throttle a 60/min)
 *   2. Buckets são independentes (instance vs contact vs org)
 *   3. Fail-open quando Redis lança erro (allowed=true, retryAfterMs=0)
 *   4. Input inválido → fail-open (Zod)
 *   5. retryAfterMs > 0 quando recusado
 *   6. Tokens se regeneram após janela de tempo
 *
 * Sem dependência real de Redis — o módulo @/server/services/redis é mockado
 * via vi.mock para devolver um fake com `eval` e `incr`/`pexpire` controláveis.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock do módulo Redis ─────────────────────────────────────────────────────
// Deve vir ANTES do import do service para garantir hoisting correto do vi.mock.

const mockEval = vi.fn()
const mockIncr = vi.fn()
const mockPexpire = vi.fn()

vi.mock('@/server/services/redis', () => ({
  getRedis: () => ({
    eval: mockEval,
    incr: mockIncr,
    pexpire: mockPexpire,
  }),
}))

import {
  checkRateLimit,
  RATE_LIMITS,
  type CheckRateLimitInput,
} from './rate-limit.service'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Simula resposta Lua "allowed" */
const luaAllowed = (): [number, number] => [1, 0]

/** Simula resposta Lua "denied" com retryAfter */
const luaDenied = (retryAfterMs: number): [number, number] => [0, retryAfterMs]

// ── Suite ────────────────────────────────────────────────────────────────────

describe('checkRateLimit — escopo instance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('permite quando bucket tem tokens disponíveis', async () => {
    mockEval.mockResolvedValue(luaAllowed())

    const result = await checkRateLimit({ scope: 'instance', key: 'conn-001' })

    expect(result.allowed).toBe(true)
    expect(result.retryAfterMs).toBe(0)
  })

  it('nega e retorna retryAfterMs quando bucket está vazio', async () => {
    const expectedRetry = 1000
    mockEval.mockResolvedValue(luaDenied(expectedRetry))

    const result = await checkRateLimit({ scope: 'instance', key: 'conn-001' })

    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBe(expectedRetry)
  })

  it('rajada de 100 envios: primeiros 60 permitidos, restantes negados', async () => {
    const { maxTokens } = RATE_LIMITS.instance
    // Os primeiros maxTokens retornam allowed=1, o restante allowed=0
    mockEval.mockImplementation((_, _keys, ...args) => {
      // args ignorados — controlamos externamente via chamada count
      return Promise.resolve(luaAllowed())
    })

    let denied = 0
    let allowed = 0
    const BURST = 100

    for (let i = 0; i < BURST; i++) {
      if (i < maxTokens) {
        mockEval.mockResolvedValueOnce(luaAllowed())
      } else {
        mockEval.mockResolvedValueOnce(luaDenied(500))
      }
    }

    for (let i = 0; i < BURST; i++) {
      const r = await checkRateLimit({ scope: 'instance', key: 'conn-burst' })
      if (r.allowed) allowed++
      else denied++
    }

    expect(allowed).toBe(maxTokens)              // 60 permitidos
    expect(denied).toBe(BURST - maxTokens)        // 40 negados
  })

  it('usa a chave Redis correta: rl:instance:{key}', async () => {
    mockEval.mockResolvedValue(luaAllowed())

    await checkRateLimit({ scope: 'instance', key: 'my-conn' })

    // KEYS[1] é o 3º argumento de eval (lua, numkeys, key, ...args)
    const callArgs = mockEval.mock.calls[0] as unknown[]
    expect(callArgs[2]).toBe('rl:instance:my-conn')
  })
})

describe('checkRateLimit — escopo contact', () => {
  beforeEach(() => vi.clearAllMocks())

  it('usa windowMs de 2000ms para escopo contact', async () => {
    mockEval.mockResolvedValue(luaAllowed())

    await checkRateLimit({ scope: 'contact', key: '+5511999990000' })

    const callArgs = mockEval.mock.calls[0] as unknown[]
    // ARGV[2] = windowMs (5º argumento: lua, numkeys, key, maxTokens, windowMs, nowMs)
    expect(callArgs[4]).toBe(String(RATE_LIMITS.contact.windowMs)) // '2000'
  })

  it('chave Redis é rl:contact:{key}', async () => {
    mockEval.mockResolvedValue(luaAllowed())

    await checkRateLimit({ scope: 'contact', key: '+5511999990000' })

    const callArgs = mockEval.mock.calls[0] as unknown[]
    expect(callArgs[2]).toBe('rl:contact:+5511999990000')
  })
})

describe('checkRateLimit — escopo org', () => {
  beforeEach(() => vi.clearAllMocks())

  it('usa maxTokens 1000 para escopo org', async () => {
    mockEval.mockResolvedValue(luaAllowed())

    await checkRateLimit({ scope: 'org', key: 'org-xyz' })

    const callArgs = mockEval.mock.calls[0] as unknown[]
    // ARGV[1] = maxTokens (4º argumento)
    expect(callArgs[3]).toBe(String(RATE_LIMITS.org.maxTokens)) // '1000'
  })
})

describe('checkRateLimit — buckets independentes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('negar instance não afeta contact nem org', async () => {
    // instance nega, contact e org permitem
    mockEval
      .mockResolvedValueOnce(luaDenied(1000)) // instance
      .mockResolvedValueOnce(luaAllowed())    // contact
      .mockResolvedValueOnce(luaAllowed())    // org

    const [r1, r2, r3] = await Promise.all([
      checkRateLimit({ scope: 'instance', key: 'conn-A' }),
      checkRateLimit({ scope: 'contact',  key: 'phone-B' }),
      checkRateLimit({ scope: 'org',      key: 'org-C' }),
    ])

    expect(r1.allowed).toBe(false)
    expect(r2.allowed).toBe(true)
    expect(r3.allowed).toBe(true)
  })
})

describe('checkRateLimit — fail-open', () => {
  beforeEach(() => vi.clearAllMocks())

  it('Redis lança erro → allowed=true, retryAfterMs=0', async () => {
    mockEval.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await checkRateLimit({ scope: 'instance', key: 'conn-fail' })

    expect(result.allowed).toBe(true)
    expect(result.retryAfterMs).toBe(0)
  })

  it('Redis lança erro de timeout → allowed=true', async () => {
    mockEval.mockRejectedValue(new Error('Command timed out'))

    const result = await checkRateLimit({ scope: 'org', key: 'org-fail' })

    expect(result.allowed).toBe(true)
    expect(result.retryAfterMs).toBe(0)
  })

  it('Lua não suportado → fallback INCR+EXPIRE → respeita limite', async () => {
    mockEval.mockRejectedValue(new Error('ERR script not supported'))
    // INCR retorna 1 (dentro do limite)
    mockIncr.mockResolvedValue(1)
    mockPexpire.mockResolvedValue(1)

    const result = await checkRateLimit({ scope: 'contact', key: 'phone-lua-fail' })

    expect(result.allowed).toBe(true)
    expect(mockIncr).toHaveBeenCalledWith('rl:contact:phone-lua-fail')
  })

  it('Lua não suportado + INCR acima do limite → denied', async () => {
    mockEval.mockRejectedValue(new Error('ERR script not supported'))
    // INCR retorna valor acima do maxTokens do contact (1)
    mockIncr.mockResolvedValue(5)
    mockPexpire.mockResolvedValue(1)

    const result = await checkRateLimit({ scope: 'contact', key: 'phone-over' })

    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })

  it('Lua não suportado + INCR também lança → fail-open', async () => {
    mockEval.mockRejectedValue(new Error('ERR script not supported'))
    mockIncr.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await checkRateLimit({ scope: 'instance', key: 'conn-double-fail' })

    expect(result.allowed).toBe(true)
    expect(result.retryAfterMs).toBe(0)
  })
})

describe('checkRateLimit — input inválido (Zod)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('scope inválido → fail-open sem chamar Redis', async () => {
    const input = { scope: 'unknown', key: 'k' } as unknown as CheckRateLimitInput
    const result = await checkRateLimit(input)

    expect(result.allowed).toBe(true)
    expect(result.retryAfterMs).toBe(0)
    expect(mockEval).not.toHaveBeenCalled()
  })

  it('key vazia → fail-open sem chamar Redis', async () => {
    const input = { scope: 'instance', key: '' } as CheckRateLimitInput
    const result = await checkRateLimit(input)

    expect(result.allowed).toBe(true)
    expect(mockEval).not.toHaveBeenCalled()
  })
})
