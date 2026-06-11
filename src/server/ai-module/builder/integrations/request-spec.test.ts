/**
 * Tests for the pure request-spec core (Integration Builder, Wave 1 — T42).
 *
 * Hermetic: no DB, no network, no mocks — every export here is pure and
 * deterministic. We drive each function with crafted RequestSpec / credential /
 * param fixtures and assert against the REAL behavior of `request-spec.ts`
 * (read at T42 time), not assumptions.
 *
 * Covers:
 *   1. resolvePlaceholders — credentials/params substitution, missing→'', multi
 *      tokens, non-string params.
 *   2. buildRequest — bearer/header/query/basic auth, placeholder resolution in
 *      url/headers/query/body, GET produces no body.
 *   3. maskSecret — last-4 reveal, short/empty fully masked (no length leak).
 *   4. classifyError — 401/403/404, transport kinds, 2xx, 5xx; STATIC diagnoses.
 *   5. NFR-01 no-leak proof — sanitizeForLog drops secrets; classifyError never
 *      interpolates a canary.
 */

import { describe, it, expect } from 'vitest'
import {
  resolvePlaceholders,
  buildRequest,
  maskSecret,
  classifyError,
  sanitizeForLog,
  type BuiltRequest,
  type ErrorClassification,
} from './request-spec'
import type { RequestSpec, RequestAuth } from './integration.schemas'

// ----------------------------------------------------------------------------
// Fixtures
// ----------------------------------------------------------------------------

/** Build a RequestSpec with a given auth + optional overrides; everything else
 * is a sane default. Keeps individual tests focused on one variable. */
function makeSpec(auth: RequestAuth, overrides: Partial<RequestSpec> = {}): RequestSpec {
  return {
    method: 'POST',
    url: 'https://api.example.com/v1/resource',
    auth,
    ...overrides,
  }
}

const CANARY = 'SECRET_CANARY_9999'

// ============================================================================
// 1. resolvePlaceholders
// ============================================================================

describe('resolvePlaceholders', () => {
  it('replaces a {{credentials.x}} token from the credentials map', () => {
    const out = resolvePlaceholders('Bearer {{credentials.api_key}}', {
      credentials: { api_key: 'abc123' },
      params: {},
    })
    expect(out).toBe('Bearer abc123')
  })

  it('replaces a {{params.y}} token from the params map', () => {
    const out = resolvePlaceholders('/users/{{params.userId}}', {
      credentials: {},
      params: { userId: 'u-42' },
    })
    expect(out).toBe('/users/u-42')
  })

  it('resolves a missing credentials key to empty string (no throw)', () => {
    const out = resolvePlaceholders('X={{credentials.nope}}', {
      credentials: {},
      params: {},
    })
    expect(out).toBe('X=')
  })

  it('resolves a missing params key to empty string (no throw)', () => {
    const out = resolvePlaceholders('X={{params.nope}}', {
      credentials: {},
      params: {},
    })
    expect(out).toBe('X=')
  })

  it('replaces multiple tokens (credentials + params) in one string', () => {
    const out = resolvePlaceholders(
      '{{params.host}}/{{params.path}}?key={{credentials.api_key}}',
      {
        credentials: { api_key: 'K' },
        params: { host: 'h', path: 'p' },
      },
    )
    expect(out).toBe('h/p?key=K')
  })

  it('tolerates whitespace inside the braces', () => {
    const out = resolvePlaceholders('{{ credentials.api_key }}', {
      credentials: { api_key: 'spaced' },
      params: {},
    })
    expect(out).toBe('spaced')
  })

  it('stringifies a numeric param', () => {
    const out = resolvePlaceholders('n={{params.count}}', {
      credentials: {},
      params: { count: 7 },
    })
    expect(out).toBe('n=7')
  })

  it('stringifies a boolean param', () => {
    const out = resolvePlaceholders('b={{params.flag}}', {
      credentials: {},
      params: { flag: true },
    })
    expect(out).toBe('b=true')
  })

  it('collapses null / undefined / object params to empty string', () => {
    const ctx = {
      credentials: {},
      params: { a: null, b: undefined, c: { nested: 1 } },
    }
    expect(resolvePlaceholders('a={{params.a}}', ctx)).toBe('a=')
    expect(resolvePlaceholders('b={{params.b}}', ctx)).toBe('b=')
    expect(resolvePlaceholders('c={{params.c}}', ctx)).toBe('c=')
  })

  it('leaves a malformed/hostile token verbatim (charset guard)', () => {
    const tpl = '{{credentials.../etc}}'
    const out = resolvePlaceholders(tpl, { credentials: {}, params: {} })
    expect(out).toBe(tpl)
  })

  it('ignores an unknown source prefix (only credentials|params match)', () => {
    const tpl = '{{env.SECRET}}'
    const out = resolvePlaceholders(tpl, { credentials: {}, params: {} })
    expect(out).toBe(tpl)
  })
})

// ============================================================================
// 2. buildRequest
// ============================================================================

describe('buildRequest', () => {
  it('bearer auth → Authorization: Bearer <secret> header', () => {
    const spec = makeSpec({ type: 'bearer', credentialKey: 'api_key' })
    const built = buildRequest(spec, { api_key: 'tok_abc' }, {})
    expect(built.headers.Authorization).toBe('Bearer tok_abc')
    expect(built.url).toBe('https://api.example.com/v1/resource')
  })

  it('header auth → secret under the configured custom header', () => {
    const spec = makeSpec({
      type: 'header',
      headerName: 'X-Api-Key',
      credentialKey: 'api_key',
    })
    const built = buildRequest(spec, { api_key: 'tok_abc' }, {})
    expect(built.headers['X-Api-Key']).toBe('tok_abc')
    // No Authorization header for the header variant.
    expect(built.headers.Authorization).toBeUndefined()
  })

  it('header auth is a no-op when headerName is absent', () => {
    const spec = makeSpec({ type: 'header', credentialKey: 'api_key' })
    const built = buildRequest(spec, { api_key: 'tok_abc' }, {})
    expect(JSON.stringify(built.headers)).not.toContain('tok_abc')
  })

  it('query auth → secret appended as a query param on the URL', () => {
    const spec = makeSpec({
      type: 'query',
      queryParam: 'apikey',
      credentialKey: 'api_key',
    })
    const built = buildRequest(spec, { api_key: 'tok abc' }, {})
    // First query param uses '?', value is URL-encoded.
    expect(built.url).toBe(
      'https://api.example.com/v1/resource?apikey=tok%20abc',
    )
    // Secret must NOT land in a header in the query variant.
    expect(built.headers.Authorization).toBeUndefined()
  })

  it('query auth uses & when the URL already has a query string', () => {
    const spec = makeSpec(
      { type: 'query', queryParam: 'apikey', credentialKey: 'api_key' },
      { url: 'https://api.example.com/v1/resource?page=1' },
    )
    const built = buildRequest(spec, { api_key: 'K' }, {})
    expect(built.url).toBe(
      'https://api.example.com/v1/resource?page=1&apikey=K',
    )
  })

  it('query auth is a no-op when queryParam is absent', () => {
    const spec = makeSpec({ type: 'query', credentialKey: 'api_key' })
    const built = buildRequest(spec, { api_key: 'K' }, {})
    expect(built.url).toBe('https://api.example.com/v1/resource')
  })

  it('basic auth → Authorization: Basic <base64(user:pass)>', () => {
    const spec = makeSpec({ type: 'basic', credentialKey: 'creds' })
    const built = buildRequest(spec, { creds: 'user:pass' }, {})
    const expected = Buffer.from('user:pass', 'utf8').toString('base64')
    expect(built.headers.Authorization).toBe(`Basic ${expected}`)
    // Sanity: the literal user:pass is not present verbatim in the header.
    expect(built.headers.Authorization).not.toContain('user:pass')
  })

  it('resolves placeholders in url, headers, query params and body', () => {
    const spec = makeSpec(
      { type: 'bearer', credentialKey: 'api_key' },
      {
        url: 'https://api.example.com/{{params.tenant}}/resource',
        headers: { 'X-Trace': '{{params.trace}}', 'X-Static': 'fixed' },
        queryParams: { q: '{{params.query}}' },
        bodyTemplate: '{"name":"{{params.name}}","key":"{{credentials.api_key}}"}',
      },
    )
    const built = buildRequest(
      spec,
      { api_key: 'KEY' },
      { tenant: 'acme', trace: 't-1', query: 'hello', name: 'Bob' },
    )
    expect(built.url).toBe('https://api.example.com/acme/resource?q=hello')
    expect(built.headers['X-Trace']).toBe('t-1')
    expect(built.headers['X-Static']).toBe('fixed')
    expect(built.headers.Authorization).toBe('Bearer KEY')
    expect(built.body).toBe('{"name":"Bob","key":"KEY"}')
  })

  it('POST resolves a bodyTemplate into body', () => {
    const spec = makeSpec(
      { type: 'bearer', credentialKey: 'api_key' },
      { method: 'POST', bodyTemplate: '{"a":1}' },
    )
    const built = buildRequest(spec, { api_key: 'K' }, {})
    expect(built.body).toBe('{"a":1}')
  })

  it('GET (query method) produces no body even if a bodyTemplate is present', () => {
    const spec = makeSpec(
      { type: 'bearer', credentialKey: 'api_key' },
      { method: 'GET', bodyTemplate: '{"ignored":true}' },
    )
    const built: BuiltRequest = buildRequest(spec, { api_key: 'K' }, {})
    expect(built.method).toBe('GET')
    expect(built.body).toBeUndefined()
    expect('body' in built).toBe(false)
  })

  it('POST without a bodyTemplate produces no body key', () => {
    const spec = makeSpec({ type: 'bearer', credentialKey: 'api_key' })
    const built = buildRequest(spec, { api_key: 'K' }, {})
    expect('body' in built).toBe(false)
  })

  it('missing credential resolves the injected secret to empty string (no throw)', () => {
    const spec = makeSpec({ type: 'bearer', credentialKey: 'absent' })
    const built = buildRequest(spec, {}, {})
    expect(built.headers.Authorization).toBe('Bearer ')
  })
})

// ============================================================================
// 3. maskSecret
// ============================================================================

describe('maskSecret', () => {
  it('reveals only the last 4 chars of a long secret', () => {
    expect(maskSecret('sk_live_abcdef1234')).toBe('••••1234')
  })

  it('masks a value exactly 5 chars long down to last 4', () => {
    expect(maskSecret('abcde')).toBe('••••bcde')
  })

  it('fully masks a 4-char value without leaking length', () => {
    expect(maskSecret('1234')).toBe('••••')
  })

  it('fully masks a short value (length not leaked)', () => {
    expect(maskSecret('ab')).toBe('••••')
  })

  it('fully masks an empty value', () => {
    expect(maskSecret('')).toBe('••••')
  })

  it('does not leak the full secret for any masked value', () => {
    const secret = 'super-long-secret-value-XYZ'
    const masked = maskSecret(secret)
    expect(masked).not.toBe(secret)
    expect(masked).not.toContain('super')
    // Only the last 4 chars are revealed.
    expect(masked.endsWith(secret.slice(-4))).toBe(true)
  })
})

// ============================================================================
// 4. classifyError
// ============================================================================

describe('classifyError', () => {
  it('401 → auth_error with a credential re-check hint', () => {
    const r: ErrorClassification = classifyError({ httpStatus: 401 })
    expect(r.outcome).toBe('auth_error')
    expect(r.diagnosis).toMatch(/chave/i)
    expect(r.diagnosis).toMatch(/verifique/i)
  })

  it('403 → auth_error (same re-check hint)', () => {
    const r = classifyError({ httpStatus: 403 })
    expect(r.outcome).toBe('auth_error')
    expect(r.diagnosis).toMatch(/chave/i)
  })

  it('404 → not_found', () => {
    const r = classifyError({ httpStatus: 404 })
    expect(r.outcome).toBe('not_found')
    expect(r.diagnosis).toMatch(/URL/)
  })

  it("kind 'timeout' → timeout", () => {
    const r = classifyError({ kind: 'timeout' })
    expect(r.outcome).toBe('timeout')
    expect(r.diagnosis).toMatch(/demorou/i)
  })

  it("kind 'schema' → schema_error", () => {
    const r = classifyError({ kind: 'schema' })
    expect(r.outcome).toBe('schema_error')
    expect(r.diagnosis).toMatch(/formato inesperado/i)
  })

  it("kind 'network' → network", () => {
    const r = classifyError({ kind: 'network' })
    expect(r.outcome).toBe('network')
  })

  it("kind 'redirect' → redirect with a 'revise a URL' style diagnosis", () => {
    const r = classifyError({ kind: 'redirect' })
    expect(r.outcome).toBe('redirect')
    expect(r.diagnosis).toMatch(/redirecionad/i)
    expect(r.diagnosis).toMatch(/Revise a URL/i)
  })

  it('a 2xx → success', () => {
    expect(classifyError({ httpStatus: 200 }).outcome).toBe('success')
    expect(classifyError({ httpStatus: 204 }).outcome).toBe('success')
    expect(classifyError({ httpStatus: 299 }).outcome).toBe('success')
  })

  it('5xx → network (generic retry)', () => {
    expect(classifyError({ httpStatus: 500 }).outcome).toBe('network')
    expect(classifyError({ httpStatus: 503 }).outcome).toBe('network')
  })

  it('transport kind takes precedence over an HTTP status', () => {
    const r = classifyError({ httpStatus: 200, kind: 'timeout' })
    expect(r.outcome).toBe('timeout')
  })

  it('no actionable signal → generic error with retry hint', () => {
    const r = classifyError({})
    expect(r.outcome).toBe('error')
    expect(r.diagnosis).toMatch(/Tente novamente/i)
  })

  it('an unhandled 4xx (e.g. 400) → generic error', () => {
    expect(classifyError({ httpStatus: 400 }).outcome).toBe('error')
  })

  it('diagnosis strings are STATIC — no submitted value is interpolated', () => {
    // Drive every path with a httpStatus/kind that we ALSO smuggle as a fake
    // "value": the status number must never appear inside the prose diagnosis.
    const samples: ErrorClassification[] = [
      classifyError({ httpStatus: 401 }),
      classifyError({ httpStatus: 403 }),
      classifyError({ httpStatus: 404 }),
      classifyError({ httpStatus: 500 }),
      classifyError({ httpStatus: 200 }),
      classifyError({ kind: 'timeout' }),
      classifyError({ kind: 'schema' }),
      classifyError({ kind: 'network' }),
      classifyError({ kind: 'redirect' }),
      classifyError({}),
    ]
    // Two calls with identical input always yield identical diagnosis (no
    // per-call interpolation of dynamic data).
    expect(classifyError({ httpStatus: 401 }).diagnosis).toBe(
      classifyError({ httpStatus: 401 }).diagnosis,
    )
    // No diagnosis contains a raw status code or transport-kind token.
    for (const s of samples) {
      expect(s.diagnosis).not.toMatch(/\b401\b|\b403\b|\b404\b|\b500\b|\b200\b/)
      expect(s.diagnosis.toLowerCase()).not.toContain('httpstatus')
    }
  })
})

// ============================================================================
// 5. No-leak proof (NFR-01)
// ============================================================================

describe('NFR-01 — no secret leak through logs or diagnoses', () => {
  it('sanitizeForLog drops every secret-ish key and never emits the canary value', () => {
    const safe = sanitizeForLog({
      // Whitelisted, safe to keep:
      integrationId: 'int-1',
      organizationId: 'org-1',
      mode: 'test',
      outcome: 'auth_error',
      httpStatus: 401,
      durationMs: 123,
      attempt: 1,
      // Unsafe — must be dropped:
      credentials: { api_key: CANARY },
      credentialKey: 'api_key',
      secret: CANARY,
      token: CANARY,
      password: CANARY,
      authorization: `Bearer ${CANARY}`,
      Authorization: `Bearer ${CANARY}`,
      headers: { Authorization: `Bearer ${CANARY}` },
      body: `{"key":"${CANARY}"}`,
      url: `https://api.example.com?apikey=${CANARY}`,
      params: { secretParam: CANARY },
    })

    const serialized = JSON.stringify(safe)

    // The canary value never survives.
    expect(serialized).not.toContain(CANARY)

    // No surviving key matches the secret pattern.
    for (const key of Object.keys(safe)) {
      expect(key).not.toMatch(/credential|secret|token|password|authorization/i)
    }

    // The known-safe whitelist DID survive (sanity: we didn't drop everything).
    expect(safe.integrationId).toBe('int-1')
    expect(safe.outcome).toBe('auth_error')
    expect(safe.httpStatus).toBe(401)
    // Non-whitelisted keys are gone entirely.
    expect('headers' in safe).toBe(false)
    expect('body' in safe).toBe(false)
    expect('url' in safe).toBe(false)
    expect('credentials' in safe).toBe(false)
  })

  it('a whitelisted-but-secret-looking key is still dropped (belt-and-suspenders)', () => {
    // 'authorization' would never be whitelisted, but prove the SECRET_KEY_RE
    // guard rejects it even if it somehow appeared alongside a safe value.
    const safe = sanitizeForLog({ authorization: CANARY, outcome: 'ok' })
    expect('authorization' in safe).toBe(false)
    expect(JSON.stringify(safe)).not.toContain(CANARY)
  })

  it('a built request injecting the canary is never reflected by classifyError diagnoses', () => {
    // Build a request that injects the canary as the bearer secret...
    const spec = makeSpec({ type: 'bearer', credentialKey: 'api_key' })
    const built = buildRequest(spec, { api_key: CANARY }, {})
    expect(built.headers.Authorization).toBe(`Bearer ${CANARY}`)

    // ...then prove no diagnosis path can carry that value (diagnoses are static
    // and take no submitted value as input).
    const diagnoses = [
      classifyError({ httpStatus: 401 }).diagnosis,
      classifyError({ httpStatus: 403 }).diagnosis,
      classifyError({ httpStatus: 404 }).diagnosis,
      classifyError({ httpStatus: 500 }).diagnosis,
      classifyError({ httpStatus: 200 }).diagnosis,
      classifyError({ kind: 'timeout' }).diagnosis,
      classifyError({ kind: 'redirect' }).diagnosis,
      classifyError({ kind: 'schema' }).diagnosis,
      classifyError({ kind: 'network' }).diagnosis,
      classifyError({}).diagnosis,
    ]
    for (const d of diagnoses) {
      expect(d).not.toContain(CANARY)
    }
  })
})
