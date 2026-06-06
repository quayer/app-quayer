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

function okResponse(items: Array<{ title?: string; url: string; content?: string }>) {
  return {
    ok: true,
    status: 200,
    text: async () => '',
    json: async () => ({ results: items }),
  } as unknown as Response
}

function errResponse(status: number) {
  return {
    ok: false,
    status,
    text: async () => 'body',
    json: async () => ({}),
  } as unknown as Response
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

describe('searchTavily — retry de falhas transitórias', () => {
  const prev = process.env.TAVILY_API_KEY

  beforeEach(() => {
    process.env.TAVILY_API_KEY = 'tvly-test'
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (prev === undefined) delete process.env.TAVILY_API_KEY
    else process.env.TAVILY_API_KEY = prev
  })

  it('5xx transitório re-tenta e tem sucesso na 2ª tentativa', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(errResponse(503))
      .mockResolvedValueOnce(okResponse([{ url: 'https://a.com', title: 'A', content: 'c' }]))

    const result = await searchTavily('x')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.results).toHaveLength(1)
    expect(result.results[0].url).toBe('https://a.com')
  })

  it('5xx persistente esgota o retry → HTTP_ERROR com 2 fetches', async () => {
    const fetchSpy = mockFetchStatus(500)

    const result = await searchTavily('x')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('HTTP_ERROR')
  })

  it('429 NÃO re-tenta (1 fetch) — quota não melhora martelando', async () => {
    const fetchSpy = mockFetchStatus(429)

    const result = await searchTavily('x')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('RATE_LIMITED')
  })

  it('4xx (ex.: 401) NÃO re-tenta (1 fetch) — erro definitivo', async () => {
    const fetchSpy = mockFetchStatus(401)

    const result = await searchTavily('x')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('HTTP_ERROR')
  })

  it('erro de rede transitório re-tenta e recupera', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(okResponse([{ url: 'https://b.com', title: 'B' }]))

    const result = await searchTavily('x')

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
  })

  it('timeout/abort do caller NÃO re-tenta (AbortError)', async () => {
    const abortErr = new Error('The operation was aborted')
    abortErr.name = 'AbortError'
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortErr)

    const result = await searchTavily('x')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('NETWORK')
  })
})
