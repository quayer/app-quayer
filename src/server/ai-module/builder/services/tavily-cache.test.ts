/**
 * Unit tests do cache compartilhado de buscas Tavily (fail-open, TTL 1h).
 *
 *  - Key determinística, namespaced e sensível a query/maxResults/searchDepth.
 *  - read: hit retorna itens; miss/erro/Redis-nulo/lixo retorna null.
 *  - write: SET com EX 3600; não grava lista vazia; nulo/erro não propaga.
 */

import { describe, it, expect, vi } from 'vitest'

import {
  tavilyCacheKey,
  readTavilyCache,
  writeTavilyCache,
  type TavilyCacheItem,
} from './tavily-cache'

const ITEMS: TavilyCacheItem[] = [
  { title: 'Quayer', url: 'https://quayer.ai', snippet: 'builder ia' },
]

describe('tavilyCacheKey', () => {
  it('é determinística e namespaced (tavily:<sha256>)', () => {
    const a = tavilyCacheKey('clínica odontológica', 3, 'basic')
    const b = tavilyCacheKey('clínica odontológica', 3, 'basic')
    expect(a).toBe(b)
    expect(a).toMatch(/^tavily:[0-9a-f]{64}$/)
  })

  it('normaliza case/espaços da query', () => {
    expect(tavilyCacheKey('  Padaria  ', 3, 'basic')).toBe(
      tavilyCacheKey('padaria', 3, 'basic'),
    )
  })

  it('muda quando maxResults ou searchDepth mudam', () => {
    expect(tavilyCacheKey('x', 3, 'basic')).not.toBe(tavilyCacheKey('x', 5, 'basic'))
    expect(tavilyCacheKey('x', 3, 'basic')).not.toBe(tavilyCacheKey('x', 3, 'advanced'))
  })
})

describe('readTavilyCache', () => {
  it('retorna os itens no hit', async () => {
    const get = vi.fn().mockResolvedValue(JSON.stringify(ITEMS))
    const redis = { get } as unknown as Parameters<typeof readTavilyCache>[0]
    expect(await readTavilyCache(redis, 'k')).toEqual(ITEMS)
    expect(get).toHaveBeenCalledWith('k')
  })

  it('retorna null no miss', async () => {
    const get = vi.fn().mockResolvedValue(null)
    const redis = { get } as unknown as Parameters<typeof readTavilyCache>[0]
    expect(await readTavilyCache(redis, 'k')).toBeNull()
  })

  it('rejeita JSON que não é array de itens bem-formados', async () => {
    const get = vi.fn().mockResolvedValue(JSON.stringify([{ title: 'x', url: 'y' }]))
    const redis = { get } as unknown as Parameters<typeof readTavilyCache>[0]
    expect(await readTavilyCache(redis, 'k')).toBeNull()
  })

  it('fail-open (null) quando o client é null', async () => {
    expect(await readTavilyCache(null, 'k')).toBeNull()
  })

  it('fail-open (null) quando redis.get lança', async () => {
    const get = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const redis = { get } as unknown as Parameters<typeof readTavilyCache>[0]
    expect(await readTavilyCache(redis, 'k')).toBeNull()
  })
})

describe('writeTavilyCache', () => {
  it('grava com SET EX 3600', async () => {
    const set = vi.fn().mockResolvedValue('OK')
    const redis = { set } as unknown as Parameters<typeof writeTavilyCache>[0]
    await writeTavilyCache(redis, 'k', ITEMS)
    expect(set).toHaveBeenCalledTimes(1)
    const [key, value, exFlag, ttl] = set.mock.calls[0]
    expect(key).toBe('k')
    expect(value).toBe(JSON.stringify(ITEMS))
    expect(exFlag).toBe('EX')
    expect(ttl).toBe(3600)
  })

  it('não grava lista vazia (não mascara zero-result transitório)', async () => {
    const set = vi.fn()
    const redis = { set } as unknown as Parameters<typeof writeTavilyCache>[0]
    await writeTavilyCache(redis, 'k', [])
    expect(set).not.toHaveBeenCalled()
  })

  it('não propaga com client null nem em erro do Redis', async () => {
    await expect(writeTavilyCache(null, 'k', ITEMS)).resolves.toBeUndefined()
    const set = vi.fn().mockRejectedValue(new Error('down'))
    const redis = { set } as unknown as Parameters<typeof writeTavilyCache>[0]
    await expect(writeTavilyCache(redis, 'k', ITEMS)).resolves.toBeUndefined()
  })
})
