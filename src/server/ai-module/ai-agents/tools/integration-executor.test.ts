/**
 * Integration Builder — unit tests for the shared HTTP executor (Wave 1, T43).
 *
 * Exercises `runIntegrationCall`'s SSRF policy (https-only + post-DNS IP guard),
 * the production single-retry semantics (5xx | network | timeout), the manual
 * redirect block, the response read cap, and the never-throws contract — all
 * against the REAL implementation, mocking only the two side-effects it touches:
 *
 *  - DNS: the executor does `import { promises as dns } from 'dns'` then
 *    `dns.lookup(host, { all: true })`. We `vi.mock('dns', ...)` and supply
 *    `promises.lookup`, matching that exact API. Default resolves a PUBLIC IP;
 *    individual tests override to a private/loopback/metadata IP to hit the guard.
 *  - fetch: `global` fetch, read via `res.text()` inside `readCapped`. We stub it
 *    with `vi.stubGlobal('fetch', vi.fn())` and return a minimal `{ status, text }`
 *    shape (the executor only reads `res.status` and `res.text()`).
 *
 * Zero `any`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// --- DNS mock: matches `import { promises as dns } from 'dns'` in the source. ---
// `dns.lookup(host, { all: true })` -> Array<{ address: string; family: number }>.
const dnsLookupMock = vi.fn()
vi.mock('dns', () => ({
  promises: {
    lookup: (...args: unknown[]) => dnsLookupMock(...args),
  },
}))

// Silence the executor's structured logger (console-based) during the suite.
vi.mock('@/server/services/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { runIntegrationCall } from './integration-executor'
import type { RequestSpec } from '../../builder/integrations/integration.schemas'

// ---------------------------------------------------------------------------
// Fixtures / helpers
// ---------------------------------------------------------------------------

const PUBLIC_IP = '93.184.216.34'

/** A minimal valid https GET spec — passes the scheme + SSRF gates by default. */
function httpsSpec(overrides: Partial<RequestSpec> = {}): RequestSpec {
  return {
    method: 'GET',
    url: 'https://api.example.com/v1/resource',
    auth: { type: 'bearer', credentialKey: 'api_key' },
    ...overrides,
  } as RequestSpec
}

const CREDENTIALS = { api_key: 'secret-token-1234' }
const PARAMS: Record<string, unknown> = {}

function prodOpts() {
  return { mode: 'production' as const, integrationId: 'integ-1', organizationId: 'org-1' }
}
function testOpts() {
  return { mode: 'test' as const, integrationId: 'integ-1', organizationId: 'org-1' }
}

/** Minimal fetch Response stand-in: the executor only reads `status` + `text()`. */
function fakeResponse(status: number, body = ''): Response {
  return {
    status,
    text: async () => body,
  } as unknown as Response
}

/** An error whose `name` makes `transportKindOf` classify it as our timeout. */
function abortError(): Error {
  const err = new Error('The operation was aborted due to timeout')
  err.name = 'AbortError'
  return err
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  // Default DNS resolution is a single PUBLIC IP so the SSRF guard passes.
  dnsLookupMock.mockResolvedValue([{ address: PUBLIC_IP, family: 4 }])
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// 1. Success
// ---------------------------------------------------------------------------

describe('runIntegrationCall — success', () => {
  it('200 → outcome "success", httpStatus 200, durationMs present', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, '{"ok":true}'))

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('success')
    expect(result.httpStatus).toBe(200)
    expect(typeof result.durationMs).toBe('number')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.bodySnippet).toBe('{"ok":true}')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Manual redirect is always requested (no-follow policy).
    expect(fetchMock.mock.calls[0]?.[1]?.redirect).toBe('manual')
  })
})

// ---------------------------------------------------------------------------
// 2. 4xx — no retry
// ---------------------------------------------------------------------------

describe('runIntegrationCall — 4xx never retries', () => {
  it('401 → outcome "auth_error", fetch called exactly once (even in production)', async () => {
    fetchMock.mockResolvedValue(fakeResponse(401, 'unauthorized'))

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('auth_error')
    expect(result.httpStatus).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('404 → outcome "not_found", fetch called once', async () => {
    fetchMock.mockResolvedValue(fakeResponse(404, 'nope'))

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('not_found')
    expect(result.httpStatus).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// 3. Retry semantics: production retries 5xx | network throw | timeout exactly
//    once; test mode never retries.
// ---------------------------------------------------------------------------

describe('runIntegrationCall — production single retry / test zero retry', () => {
  // --- 5xx ---
  it('5xx in production → exactly 1 retry (fetch called twice)', async () => {
    fetchMock.mockResolvedValue(fakeResponse(500, 'boom'))

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('network')
    expect(result.httpStatus).toBe(500)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('5xx in test → 0 retries (fetch called once)', async () => {
    fetchMock.mockResolvedValue(fakeResponse(503, 'unavailable'))

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, testOpts())

    expect(result.outcome).toBe('network')
    expect(result.httpStatus).toBe(503)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('production retry that succeeds on the 2nd attempt → success', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(500, 'boom'))
      .mockResolvedValueOnce(fakeResponse(200, 'ok'))

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('success')
    expect(result.httpStatus).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  // --- network throw ---
  it('network throw in production → exactly 1 retry (fetch called twice)', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('network')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('network throw in test → 0 retries (fetch called once)', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, testOpts())

    expect(result.outcome).toBe('network')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // --- timeout (AbortError) ---
  it('timeout (AbortError) in production → exactly 1 retry (fetch called twice)', async () => {
    fetchMock.mockRejectedValue(abortError())

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('timeout')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('timeout (AbortError) in test → 0 retries (fetch called once)', async () => {
    fetchMock.mockRejectedValue(abortError())

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, testOpts())

    expect(result.outcome).toBe('timeout')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// 4. Non-https scheme → blocked BEFORE fetch
// ---------------------------------------------------------------------------

describe('runIntegrationCall — https-only', () => {
  it('http:// URL → outcome "blocked", fetch NOT called', async () => {
    const spec = httpsSpec({ url: 'http://api.example.com/v1/resource' })

    const result = await runIntegrationCall(spec, CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('blocked')
    expect(fetchMock).not.toHaveBeenCalled()
    // The scheme gate runs before DNS resolution too.
    expect(dnsLookupMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 5. Post-DNS IP guard — private / loopback / metadata → blocked before fetch
// ---------------------------------------------------------------------------

describe('runIntegrationCall — post-DNS SSRF guard', () => {
  it.each([
    ['loopback', '127.0.0.1'],
    ['private 10/8', '10.0.0.1'],
    ['cloud metadata', '169.254.169.254'],
  ])('DNS resolves to %s (%s) → outcome "blocked", fetch NOT called', async (_label, ip) => {
    dnsLookupMock.mockResolvedValue([{ address: ip, family: 4 }])

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('blocked')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ANY private address among multiple records → blocked (DNS-rebinding hardening)', async () => {
    // One public + one private: the guard must reject if ANY is private.
    dnsLookupMock.mockResolvedValue([
      { address: PUBLIC_IP, family: 4 },
      { address: '192.168.1.10', family: 4 },
    ])

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('blocked')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('DNS failure → treated as unsafe → blocked, fetch NOT called', async () => {
    dnsLookupMock.mockRejectedValue(new Error('ENOTFOUND'))

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('blocked')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 6. Manual redirect — 3xx → "redirect", fetch called EXACTLY once (no follow)
// ---------------------------------------------------------------------------

describe('runIntegrationCall — manual redirect', () => {
  it('302 → outcome "redirect", httpStatus 302, fetch called exactly once', async () => {
    fetchMock.mockResolvedValue(fakeResponse(302, ''))

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('redirect')
    expect(result.httpStatus).toBe(302)
    // redirect is NOT retryable even in production.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// 7. Response read cap — large body is truncated, call still resolves success
// ---------------------------------------------------------------------------

describe('runIntegrationCall — response read cap', () => {
  const MAX_RESPONSE_BYTES = 8 * 1024 // mirror the source constant

  it('body larger than the cap → success, bodySnippet sliced to the cap', async () => {
    const huge = 'a'.repeat(MAX_RESPONSE_BYTES * 4)
    fetchMock.mockResolvedValue(fakeResponse(200, huge))

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('success')
    expect(result.bodySnippet).toBeDefined()
    expect(result.bodySnippet?.length).toBe(MAX_RESPONSE_BYTES)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('body at/under the cap → returned in full (not truncated)', async () => {
    const body = 'b'.repeat(MAX_RESPONSE_BYTES) // exactly the cap → not sliced
    fetchMock.mockResolvedValue(fakeResponse(200, body))

    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, prodOpts())

    expect(result.outcome).toBe('success')
    expect(result.bodySnippet?.length).toBe(MAX_RESPONSE_BYTES)
  })
})

// ---------------------------------------------------------------------------
// 8. Never-throws — an unexpected fetch error resolves to an outcome
// ---------------------------------------------------------------------------

describe('runIntegrationCall — never throws', () => {
  it('unexpected fetch error → resolves to a "network" outcome, never rejects', async () => {
    fetchMock.mockImplementation(() => {
      throw new Error('totally unexpected synchronous explosion')
    })

    // Must NOT reject. In test mode, exactly one attempt is made.
    const result = await runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, testOpts())

    expect(result.outcome).toBe('network')
    expect(typeof result.durationMs).toBe('number')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('a non-Error throw value still resolves (does not escape runIntegrationCall)', async () => {
    fetchMock.mockImplementation(() => {
      throw 'string-shaped failure'
    })

    await expect(
      runIntegrationCall(httpsSpec(), CREDENTIALS, PARAMS, testOpts()),
    ).resolves.toMatchObject({ outcome: 'network' })
  })
})

// ---------------------------------------------------------------------------
// 9. T32 — env-gated E2E allowlist (`INTEGRATION_TEST_ALLOWED_HOSTS`)
//
// The allowlist is parsed ONCE per module instance (memoized) and is read ONLY
// under NODE_ENV==='test'. To exercise BOTH NODE_ENV values within one process
// we `vi.resetModules()` + dynamic-import a FRESH executor after stubbing env,
// so the memo is rebuilt against the stubbed NODE_ENV. The top-level `vi.mock`
// factories (dns, logger) re-apply to the fresh module graph automatically.
// ---------------------------------------------------------------------------

describe('runIntegrationCall — T32 env-gated test allowlist', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  /** Reset modules, stub env, then dynamic-import a fresh executor + re-stub fetch. */
  async function loadFreshExecutor(env: Record<string, string>) {
    vi.resetModules()
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    // The fresh module graph reuses the hoisted vi.mock('dns')/logger factories.
    const mod = await import('./integration-executor')
    // Re-establish the global fetch stub for the fresh module's `global.fetch`.
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    return mod.runIntegrationCall
  }

  it('NODE_ENV=production: allowlist var is IGNORED — localhost stays blocked (plan §8)', async () => {
    // Even with the var explicitly set, production must ignore it by construction.
    const run = await loadFreshExecutor({
      NODE_ENV: 'production',
      INTEGRATION_TEST_ALLOWED_HOSTS: 'localhost',
    })
    // localhost would resolve to a loopback IP; assert the guard still triggers.
    dnsLookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])

    const spec = httpsSpec({ url: 'http://localhost:43117/fixture' })
    const result = await run(spec, CREDENTIALS, PARAMS, prodOpts())

    // Blocked on the https-only gate before any fetch (var ignored in prod).
    expect(result.outcome).toBe('blocked')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('NODE_ENV=test + host allowlisted: BYPASSES https + IP guard → 200 yields "success"', async () => {
    const run = await loadFreshExecutor({
      NODE_ENV: 'test',
      INTEGRATION_TEST_ALLOWED_HOSTS: 'localhost,127.0.0.1:43117',
    })
    // The fixture is an http loopback server — both guards must be bypassed.
    dnsLookupMock.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
    fetchMock.mockResolvedValue(fakeResponse(200, '{"ok":true}'))

    const spec = httpsSpec({ url: 'http://localhost:43117/fixture' })
    const result = await run(spec, CREDENTIALS, PARAMS, testOpts())

    expect(result.outcome).toBe('success')
    expect(result.httpStatus).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // DNS guard skipped entirely for the allowlisted host.
    expect(dnsLookupMock).not.toHaveBeenCalled()
  })

  it('NODE_ENV=test but host NOT allowlisted: full guard still applies (http blocked)', async () => {
    const run = await loadFreshExecutor({
      NODE_ENV: 'test',
      INTEGRATION_TEST_ALLOWED_HOSTS: 'localhost',
    })

    // A different host than the allowlisted one → no bypass; http is blocked.
    const spec = httpsSpec({ url: 'http://evil.example.com/x' })
    const result = await run(spec, CREDENTIALS, PARAMS, testOpts())

    expect(result.outcome).toBe('blocked')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('NODE_ENV=test with var UNSET: no bypass — http still blocked', async () => {
    const run = await loadFreshExecutor({ NODE_ENV: 'test' })

    const spec = httpsSpec({ url: 'http://localhost:43117/fixture' })
    const result = await run(spec, CREDENTIALS, PARAMS, testOpts())

    expect(result.outcome).toBe('blocked')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
