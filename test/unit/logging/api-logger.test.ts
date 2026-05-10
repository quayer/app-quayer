/**
 * Unit tests for `withApiLogger` (src/lib/logs/api-logger.middleware.ts).
 *
 * We mock `loggerService.log` so no DB is touched. Logging is fire-and-forget
 * inside the middleware, so each test awaits a microtask flush via
 * `vi.waitFor` before asserting on the spy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logs/logger.service', () => ({
  loggerService: {
    log: vi.fn().mockResolvedValue(null),
  },
}))

import { loggerService } from '@/lib/logs/logger.service'
import { withApiLogger } from '@/lib/logs/api-logger.middleware'

const logMock = loggerService.log as ReturnType<typeof vi.fn>

function makeRequest(
  url: string,
  init?: { headers?: Record<string, string> }
): Request {
  return new Request(url, { headers: init?.headers })
}

async function flushLogger() {
  await vi.waitFor(() => expect(logMock).toHaveBeenCalled())
}

describe('withApiLogger', () => {
  beforeEach(() => {
    logMock.mockClear()
    logMock.mockResolvedValue(null)
  })

  it('returns the response produced by the wrapped handler', async () => {
    const handler = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }))
    const wrapped = withApiLogger('GET', handler)

    const res = await wrapped(makeRequest('http://localhost/api/v1/health'))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(handler).toHaveBeenCalledOnce()
  })

  it('persists an INFO-level entry for 2xx responses', async () => {
    const handler = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const wrapped = withApiLogger('GET', handler)

    await wrapped(makeRequest('http://localhost/api/v1/foo?bar=1'))
    await flushLogger()

    const [level, message, options] = logMock.mock.calls[0]
    expect(level).toBe('INFO')
    expect(message).toMatch(/^GET \/api\/v1\/foo → 200 \(\d+ms\)$/)
    expect(options.source).toBe('api')
    expect(options.action).toBe('GET /api/v1/foo')
    expect(options.context.requestMethod).toBe('GET')
    expect(options.context.requestPath).toBe('/api/v1/foo?bar=1')
    expect(options.context.statusCode).toBe(200)
    expect(options.context.duration).toBeGreaterThanOrEqual(0)
    expect(options.tags).toEqual(expect.arrayContaining(['api', 'status:200', 'method:get']))
  })

  it('uses WARN for 4xx responses', async () => {
    const handler = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    const wrapped = withApiLogger('POST', handler)

    await wrapped(makeRequest('http://localhost/api/v1/auth/login'))
    await flushLogger()

    expect(logMock.mock.calls[0][0]).toBe('WARN')
    expect(logMock.mock.calls[0][2].context.statusCode).toBe(401)
  })

  it('uses ERROR for 5xx responses', async () => {
    const handler = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    const wrapped = withApiLogger('GET', handler)

    await wrapped(makeRequest('http://localhost/api/v1/anything'))
    await flushLogger()

    expect(logMock.mock.calls[0][0]).toBe('ERROR')
  })

  it('captures thrown errors, sets status 500 and re-throws', async () => {
    const boom = new Error('handler exploded')
    const handler = vi.fn().mockRejectedValue(boom)
    const wrapped = withApiLogger('GET', handler)

    await expect(
      wrapped(makeRequest('http://localhost/api/v1/explode'))
    ).rejects.toBe(boom)
    await flushLogger()

    const [level, , options] = logMock.mock.calls[0]
    expect(level).toBe('ERROR')
    expect(options.context.statusCode).toBe(500)
    expect(options.stackTrace).toBe(boom.stack)
  })

  it('extracts client IP from x-forwarded-for (first hop)', async () => {
    const handler = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const wrapped = withApiLogger('GET', handler)

    await wrapped(
      makeRequest('http://localhost/api/v1/x', {
        headers: { 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' },
      })
    )
    await flushLogger()

    expect(logMock.mock.calls[0][2].context.ipAddress).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    const handler = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const wrapped = withApiLogger('GET', handler)

    await wrapped(
      makeRequest('http://localhost/api/v1/x', {
        headers: { 'x-real-ip': '10.0.0.1' },
      })
    )
    await flushLogger()

    expect(logMock.mock.calls[0][2].context.ipAddress).toBe('10.0.0.1')
  })

  it('captures user-agent header when present', async () => {
    const handler = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const wrapped = withApiLogger('GET', handler)

    await wrapped(
      makeRequest('http://localhost/api/v1/x', {
        headers: { 'user-agent': 'QuayerTest/1.0' },
      })
    )
    await flushLogger()

    expect(logMock.mock.calls[0][2].context.userAgent).toBe('QuayerTest/1.0')
  })

  it('does not throw when loggerService.log fails (last-resort console fallback)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logMock.mockRejectedValueOnce(new Error('db down'))

    const handler = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    const wrapped = withApiLogger('GET', handler)

    // Wrapper must still resolve and return the response cleanly.
    const res = await wrapped(makeRequest('http://localhost/api/v1/x'))
    expect(res.status).toBe(200)

    // Console fallback fires once the rejected promise settles.
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalled())
    expect(consoleSpy.mock.calls[0][0]).toContain('[api-logger]')

    consoleSpy.mockRestore()
  })
})
