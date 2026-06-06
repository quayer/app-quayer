/**
 * Unit tests do cache de embedding de query (fail-open, key por modelo+sha256).
 *
 *  - Key determinística e namespaced por modelo.
 *  - read: hit retorna o vetor; miss/erro/Redis-nulo retorna null (fail-open).
 *  - read: rejeita JSON que não é vetor de números (defesa contra lixo no cache).
 *  - write: SET com EX 86400; Redis-nulo/erro/vetor-vazio não propaga nem chama.
 */

import { describe, it, expect, vi } from 'vitest'

import {
  embeddingCacheKey,
  readEmbeddingCache,
  writeEmbeddingCache,
} from './embedding-cache'

const MODEL = 'text-embedding-3-small'

describe('embeddingCacheKey', () => {
  it('é determinística e namespaced por modelo + sha256 do texto', () => {
    const a = embeddingCacheKey(MODEL, 'tem estacionamento?')
    const b = embeddingCacheKey(MODEL, 'tem estacionamento?')
    expect(a).toBe(b)
    expect(a).toMatch(/^embed:text-embedding-3-small:[0-9a-f]{64}$/)
  })

  it('muda quando o texto ou o modelo mudam', () => {
    expect(embeddingCacheKey(MODEL, 'a')).not.toBe(embeddingCacheKey(MODEL, 'b'))
    expect(embeddingCacheKey('model-x', 'a')).not.toBe(embeddingCacheKey('model-y', 'a'))
  })
})

describe('readEmbeddingCache', () => {
  it('retorna o vetor no hit', async () => {
    const vector = [0.1, 0.2, 0.3]
    const get = vi.fn().mockResolvedValue(JSON.stringify(vector))
    const redis = { get } as unknown as Parameters<typeof readEmbeddingCache>[0]

    const out = await readEmbeddingCache(redis, MODEL, 'qual o horário?')

    expect(out).toEqual(vector)
    expect(get).toHaveBeenCalledWith(embeddingCacheKey(MODEL, 'qual o horário?'))
  })

  it('retorna null no miss (Redis sem a key)', async () => {
    const get = vi.fn().mockResolvedValue(null)
    const redis = { get } as unknown as Parameters<typeof readEmbeddingCache>[0]
    expect(await readEmbeddingCache(redis, MODEL, 'x')).toBeNull()
  })

  it('rejeita JSON que não é vetor de números (lixo no cache)', async () => {
    const get = vi.fn().mockResolvedValue(JSON.stringify({ not: 'a vector' }))
    const redis = { get } as unknown as Parameters<typeof readEmbeddingCache>[0]
    expect(await readEmbeddingCache(redis, MODEL, 'x')).toBeNull()
  })

  it('rejeita vetor com NaN/Infinity', async () => {
    const get = vi.fn().mockResolvedValue('[1, null, 2]')
    const redis = { get } as unknown as Parameters<typeof readEmbeddingCache>[0]
    expect(await readEmbeddingCache(redis, MODEL, 'x')).toBeNull()
  })

  it('fail-open (null) quando o client é null', async () => {
    expect(await readEmbeddingCache(null, MODEL, 'x')).toBeNull()
  })

  it('fail-open (null) quando redis.get lança (Redis fora do ar)', async () => {
    const get = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const redis = { get } as unknown as Parameters<typeof readEmbeddingCache>[0]
    expect(await readEmbeddingCache(redis, MODEL, 'x')).toBeNull()
  })

  it('fail-open (null) e não chama Redis quando o texto é vazio', async () => {
    const get = vi.fn()
    const redis = { get } as unknown as Parameters<typeof readEmbeddingCache>[0]
    expect(await readEmbeddingCache(redis, MODEL, '')).toBeNull()
    expect(get).not.toHaveBeenCalled()
  })
})

describe('writeEmbeddingCache', () => {
  it('grava o vetor com SET EX 86400', async () => {
    const set = vi.fn().mockResolvedValue('OK')
    const redis = { set } as unknown as Parameters<typeof writeEmbeddingCache>[0]

    await writeEmbeddingCache(redis, MODEL, 'tem foto?', [0.1, 0.2])

    expect(set).toHaveBeenCalledTimes(1)
    const [key, value, exFlag, ttl] = set.mock.calls[0]
    expect(key).toBe(embeddingCacheKey(MODEL, 'tem foto?'))
    expect(value).toBe(JSON.stringify([0.1, 0.2]))
    expect(exFlag).toBe('EX')
    expect(ttl).toBe(86400)
  })

  it('não grava (nem chama Redis) quando o vetor é vazio', async () => {
    const set = vi.fn()
    const redis = { set } as unknown as Parameters<typeof writeEmbeddingCache>[0]
    await writeEmbeddingCache(redis, MODEL, 'x', [])
    expect(set).not.toHaveBeenCalled()
  })

  it('não propaga quando o client é null', async () => {
    await expect(writeEmbeddingCache(null, MODEL, 'x', [0.1])).resolves.toBeUndefined()
  })

  it('swallows erro do Redis (best-effort)', async () => {
    const set = vi.fn().mockRejectedValue(new Error('Redis down'))
    const redis = { set } as unknown as Parameters<typeof writeEmbeddingCache>[0]
    await expect(writeEmbeddingCache(redis, MODEL, 'x', [0.1])).resolves.toBeUndefined()
  })
})
