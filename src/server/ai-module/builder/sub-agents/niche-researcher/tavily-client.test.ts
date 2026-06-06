/**
 * Unit tests do tavily-client — foco no tratamento de HTTP 429.
 *
 * 429 (rate-limit/quota) é transitório e o caller pode logar/alertar diferente,
 * então tem reason próprio (RATE_LIMITED) — distinto do HTTP_ERROR genérico.
 *
 * Redis é mockado (cache miss limpo) para o teste não tentar conectar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/server/services/redis', () => ({
  getRedis: () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
  }),
}))

import { searchTavily } from './tavily-client'

function mockFetchStatus(status: number) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false,
    status,
    text: async () => 'body',
    json: async () => ({}),
  } as unknown as Response)
}

describe('searchTavily — HTTP error mapping', () => {
  const prev = process.env.TAVILY_API_KEY

  beforeEach(() => {
    process.env.TAVILY_API_KEY = 'tvly-test'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (prev === undefined) delete process.env.TAVILY_API_KEY
    else process.env.TAVILY_API_KEY = prev
  })

  it('429 → reason RATE_LIMITED (distinto de HTTP_ERROR)', async () => {
    mockFetchStatus(429)
    const result = await searchTavily('clínica odontológica')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('RATE_LIMITED')
  })

  it('500 → reason HTTP_ERROR (mantém o caminho genérico)', async () => {
    mockFetchStatus(500)
    const result = await searchTavily('x')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('HTTP_ERROR')
  })

  it('sem TAVILY_API_KEY → NO_API_KEY sem chamar fetch', async () => {
    delete process.env.TAVILY_API_KEY
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('fetch should not be called'))
    const result = await searchTavily('x')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('NO_API_KEY')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
