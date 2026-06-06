/**
 * Unit tests do apify-runner.
 *
 *  - 2xx → retorna os dataset items (e [] se o corpo não for array).
 *  - não-2xx → lança ApifyHttpError CARREGANDO o status (p/ o classificador de
 *    retry distinguir 429/5xx de 4xx) e o retryAfterMs do header quando presente.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'

import { runActorSync, ApifyHttpError } from './apify-runner'

function mockFetch(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(res as unknown as Response)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('runActorSync', () => {
  it('200 → retorna os items do dataset', async () => {
    mockFetch(200, [{ a: 1 }, { a: 2 }])
    const items = await runActorSync('apify~x', { foo: 'bar' }, 'tok')
    expect(items).toEqual([{ a: 1 }, { a: 2 }])
  })

  it('200 com corpo não-array → retorna []', async () => {
    mockFetch(200, { not: 'array' })
    expect(await runActorSync('apify~x', {}, 'tok')).toEqual([])
  })

  it('429 → lança ApifyHttpError com status 429 e retryAfterMs do header', async () => {
    mockFetch(429, { error: 'rate' }, { 'retry-after': '3' })
    await expect(runActorSync('apify~x', {}, 'tok')).rejects.toMatchObject({
      name: 'ApifyHttpError',
      status: 429,
      retryAfterMs: 3000,
    })
  })

  it('500 → lança ApifyHttpError com status 500 (sem retryAfterMs)', async () => {
    mockFetch(500, { error: 'boom' })
    const err = await runActorSync('apify~x', {}, 'tok').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApifyHttpError)
    expect((err as ApifyHttpError).status).toBe(500)
    expect((err as ApifyHttpError).retryAfterMs).toBeUndefined()
  })

  it('404 → lança status 404 (4xx, o caller NÃO deve retentar)', async () => {
    mockFetch(404, { error: 'not found' })
    await expect(runActorSync('apify~x', {}, 'tok')).rejects.toMatchObject({
      status: 404,
    })
  })
})
