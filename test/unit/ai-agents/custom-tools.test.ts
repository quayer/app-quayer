/**
 * Unit tests for getCustomTools + jsonSchemaToZod.
 *
 * Mocks:
 *   - `@/server/services/database` — agentTool.findMany
 *   - global `fetch`
 *   - `dns` — the v1 webhook path re-runs the post-DNS SSRF guard per call
 *     (FASE A / FIX 2), so `dns.promises.lookup` must be deterministic here.
 *
 * We exercise the Vercel AI SDK `tool()` by calling its `.execute()` directly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Database mock ----------------------------------------------------------
const findManyMock = vi.fn()
vi.mock('@/server/services/database', () => ({
  database: {
    agentTool: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}))

// --- DNS mock (post-DNS SSRF guard) -----------------------------------------
const dnsLookupMock = vi.fn()
vi.mock('dns', () => ({
  promises: {
    lookup: (...args: unknown[]) => dnsLookupMock(...args),
  },
}))

import {
  getCustomTools,
  jsonSchemaToZod,
  isWebhookUrlBlocked,
} from '@/server/ai-module/ai-agents/tools/custom-tools'
import type { ToolExecutionContext } from '@/server/ai-module/ai-agents/tools/builtin-tools'

const ctx: ToolExecutionContext = {
  sessionId: 's1',
  contactId: 'c1',
  connectionId: 'conn1',
  organizationId: 'org1',
}

// Minimal helper: call the tool's execute() regardless of AI-SDK shape.
function execOf(t: unknown): (input: unknown) => Promise<unknown> {
  const fn = (t as { execute?: (...a: any[]) => Promise<unknown> }).execute
  if (typeof fn !== 'function') {
    throw new Error('tool.execute missing')
  }
  // AI SDK v6 passes (input, options) — our tools ignore options.
  return (input: unknown) => fn(input, {} as any)
}

beforeEach(() => {
  findManyMock.mockReset()
  vi.restoreAllMocks()
  // Default: hostname resolves to a public IP so the post-DNS guard passes.
  // SSRF-specific tests override this per test.
  dnsLookupMock.mockReset()
  dnsLookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})

// ---------------------------------------------------------------------------
// jsonSchemaToZod
// ---------------------------------------------------------------------------

describe('jsonSchemaToZod', () => {
  it('enforces required fields and accepts missing optional fields', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order id' },
        qty: { type: 'number' },
        gift: { type: 'boolean' },
      },
      required: ['orderId', 'qty'],
    })

    // Missing required → fails
    expect(schema.safeParse({}).success).toBe(false)

    // All required present, optional missing → passes
    expect(schema.safeParse({ orderId: 'A1', qty: 2 }).success).toBe(true)

    // Wrong types → fails
    expect(schema.safeParse({ orderId: 1, qty: 2 }).success).toBe(false)
  })

  it('returns z.unknown() for missing/invalid schema', () => {
    const schema = jsonSchemaToZod(undefined)
    expect(schema.safeParse('anything').success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isWebhookUrlBlocked
// ---------------------------------------------------------------------------

describe('isWebhookUrlBlocked', () => {
  it('blocks localhost and private ranges and non-https', () => {
    expect(isWebhookUrlBlocked('http://example.com/x')).toBe(true)
    expect(isWebhookUrlBlocked('https://localhost/x')).toBe(true)
    expect(isWebhookUrlBlocked('https://127.0.0.1/x')).toBe(true)
    expect(isWebhookUrlBlocked('https://10.0.0.4/x')).toBe(true)
    expect(isWebhookUrlBlocked('https://192.168.1.1/x')).toBe(true)
    expect(isWebhookUrlBlocked('not a url')).toBe(true)
  })

  it('allows public https urls', () => {
    expect(isWebhookUrlBlocked('https://api.example.com/hook')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// getCustomTools
// ---------------------------------------------------------------------------

describe('getCustomTools', () => {
  it('short-circuits without a DB call when enabledTools is empty', async () => {
    const result = await getCustomTools([], ctx)
    expect(result).toEqual({})
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('happy path: invokes webhook and returns parsed JSON', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        name: 'lookup_order',
        description: 'Looks up an order',
        parameters: {
          type: 'object',
          properties: { orderId: { type: 'string' } },
          required: ['orderId'],
        },
        webhookUrl: 'https://api.example.com/hook',
        webhookSecret: 's3cr3t',
        webhookTimeout: 5000,
      },
    ])

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ orderTotal: 42 }),
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const tools = await getCustomTools(['lookup_order'], ctx)
    expect(Object.keys(tools)).toEqual(['lookup_order'])

    const out = await execOf(tools.lookup_order)({ orderId: 'A1' })
    expect(out).toEqual({ success: true, data: { orderTotal: 42 } })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://api.example.com/hook')
    expect(init.method).toBe('POST')
    expect(init.headers['X-Webhook-Secret']).toBe('s3cr3t')
    expect(init.body).toBe(JSON.stringify({ orderId: 'A1' }))
  })

  it('omits X-Webhook-Secret header when no secret stored', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        name: 't1',
        description: 'd',
        parameters: { type: 'object', properties: {}, required: [] },
        webhookUrl: 'https://api.example.com/hook',
        webhookSecret: null,
        webhookTimeout: 5000,
      },
    ])
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const tools = await getCustomTools(['t1'], ctx)
    await execOf(tools.t1)({})
    const init = fetchSpy.mock.calls[0][1]
    expect(init.headers['X-Webhook-Secret']).toBeUndefined()
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('returns structured error when webhook returns 500', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        name: 't1',
        description: 'd',
        parameters: { type: 'object', properties: {}, required: [] },
        webhookUrl: 'https://api.example.com/hook',
        webhookSecret: null,
        webhookTimeout: 5000,
      },
    ])
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'boom',
      } as unknown as Response),
    )

    const tools = await getCustomTools(['t1'], ctx)
    const out = (await execOf(tools.t1)({})) as {
      success: boolean
      status?: number
      error?: string
    }
    expect(out.success).toBe(false)
    expect(out.status).toBe(500)
    expect(out.error).toMatch(/500/)
  })

  it('returns TIMEOUT code when fetch throws AbortError', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        name: 't1',
        description: 'd',
        parameters: { type: 'object', properties: {}, required: [] },
        webhookUrl: 'https://api.example.com/hook',
        webhookSecret: null,
        webhookTimeout: 5000,
      },
    ])
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr))

    const tools = await getCustomTools(['t1'], ctx)
    const out = (await execOf(tools.t1)({})) as {
      success: boolean
      code?: string
    }
    expect(out.success).toBe(false)
    expect(out.code).toBe('TIMEOUT')
  })

  it('blocks SSRF-flagged webhook URLs at runtime', async () => {
    findManyMock.mockResolvedValueOnce([
      {
        name: 't1',
        description: 'd',
        parameters: { type: 'object', properties: {}, required: [] },
        webhookUrl: 'http://localhost:3000/x',
        webhookSecret: null,
        webhookTimeout: 5000,
      },
    ])
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const tools = await getCustomTools(['t1'], ctx)
    const out = (await execOf(tools.t1)({})) as {
      success: boolean
      error?: string
    }
    expect(out.success).toBe(false)
    expect(out.error).toMatch(/security policy/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Post-DNS SSRF guard (FASE A / FIX 2 — DNS rebinding)
// ---------------------------------------------------------------------------

describe('getCustomTools — post-DNS SSRF guard (v1 webhook)', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    name: 't1',
    description: 'd',
    parameters: { type: 'object', properties: {}, required: [] },
    webhookUrl: 'https://rebind.attacker.example/hook',
    webhookSecret: null,
    webhookTimeout: 5000,
    ...over,
  })

  it('bloqueia em runtime URL cujo DNS resolve para IP privado — fetch nunca é chamado', async () => {
    findManyMock.mockResolvedValueOnce([row()])
    // Hostname passa no regex (não é literal privado) mas resolve para IP interno.
    dnsLookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const tools = await getCustomTools(['t1'], ctx)
    const out = (await execOf(tools.t1)({})) as { success: boolean; error?: string }

    expect(out.success).toBe(false)
    expect(out.error).toMatch(/security policy/)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(dnsLookupMock).toHaveBeenCalledWith('rebind.attacker.example', { all: true })
  })

  it('bloqueia quando QUALQUER IP resolvido é privado (rebinding com A record misto)', async () => {
    findManyMock.mockResolvedValueOnce([row()])
    dnsLookupMock.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 }, // metadata endpoint
    ])
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const tools = await getCustomTools(['t1'], ctx)
    const out = (await execOf(tools.t1)({})) as { success: boolean }

    expect(out.success).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('falha de DNS é fail-closed: bloqueia sem chamar fetch', async () => {
    findManyMock.mockResolvedValueOnce([row()])
    dnsLookupMock.mockRejectedValue(new Error('NXDOMAIN'))
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const tools = await getCustomTools(['t1'], ctx)
    const out = (await execOf(tools.t1)({})) as { success: boolean }

    expect(out.success).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('o guard roda A CADA chamada (não é cacheado): 2ª execução re-resolve o DNS', async () => {
    findManyMock.mockResolvedValueOnce([row()])
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const tools = await getCustomTools(['t1'], ctx)
    const exec = execOf(tools.t1)

    // 1ª chamada: DNS público → passa.
    await exec({})
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // 2ª chamada: o atacante re-apontou o DNS para IP interno → bloqueia.
    dnsLookupMock.mockResolvedValue([{ address: '192.168.0.10', family: 4 }])
    const out = (await exec({})) as { success: boolean }
    expect(out.success).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(1) // nenhum fetch novo
    expect(dnsLookupMock).toHaveBeenCalledTimes(2)
  })

  it('fetch do webhook v1 usa redirect manual (3xx vira falha estruturada, não é seguido)', async () => {
    findManyMock.mockResolvedValueOnce([row()])
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 302,
      text: async () => '',
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchSpy)

    const tools = await getCustomTools(['t1'], ctx)
    const out = (await execOf(tools.t1)({})) as { success: boolean; status?: number }

    expect(out.success).toBe(false)
    expect(out.status).toBe(302)
    const init = fetchSpy.mock.calls[0][1]
    expect(init.redirect).toBe('manual')
  })
})
