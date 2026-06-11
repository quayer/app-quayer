/**
 * Integration Builder — request-spec PURE core (Wave 1, T09)
 *
 * Placeholder-resolution + error-classification + log-sanitization primitives
 * shared by the executor (T10) and the validation runner (T14). This module is
 * the deterministic, side-effect-free heart of "build a call from a declarative
 * spec": given a `RequestSpec` (T04), the stored credential values, and the
 * runtime/LLM-supplied params, it assembles a `{ url, method, headers, body }`
 * descriptor WITHOUT touching the network, the DB, the clock, or any global.
 *
 * PURITY CONTRACT (load-bearing — do not relax):
 *  - NO IO: no `fetch`, no DB, no filesystem, no `node:crypto`, no timers,
 *    no `Date.now()`, no env reads. Base64 via `Buffer` is the only Node touch.
 *  - DETERMINISTIC: same inputs → same outputs, always. This is what makes the
 *    module unit-testable in isolation (T42).
 *  - The functions here only ASSEMBLE and CLASSIFY. They do NOT enforce the URL
 *    scheme (https), SSRF/host allow-listing, redirect policy, or timeouts —
 *    that is the executor's job (T10). `request-spec.ts` is the first gate's
 *    mechanics, never the only gate.
 *
 * SECURITY INVARIANTS:
 *  - `classifyError` diagnosis strings are STATIC pt-BR templates. They NEVER
 *    interpolate any submitted value (no secret, no param, no URL, no header).
 *    This is a hard requirement: a diagnosis surfaced to the user/logs must not
 *    be able to leak a credential or smuggle attacker-controlled text.
 *  - `sanitizeForLog` is the SINGLE sanctioned log shape for the executor. It is
 *    a strict WHITELIST: only a known-safe set of keys survives; everything else
 *    (including `credentials.*`, headers, bodies, tokens) is dropped. The
 *    executor must route every structured log through this function so a raw
 *    secret can never reach a log sink.
 *  - `maskSecret` is the only helper used wherever a secret might be displayed;
 *    it reveals at most the last 4 chars.
 *
 * Zero `any`. No IO. Imports only the `RequestSpec` / `RequestAuth` TYPES (T04).
 */

import type { RequestSpec, RequestAuth } from './integration.schemas'

// ============================================================================
// 1. Placeholder resolution
// ============================================================================

/**
 * Matches `{{credentials.<key>}}` and `{{params.<key>}}` tokens.
 *
 * `<key>` is restricted to a conservative identifier charset so a malformed or
 * hostile token (e.g. `{{credentials.../etc}}`) does not match and is left
 * verbatim rather than silently resolving to something unexpected. Whitespace
 * inside the braces is tolerated (`{{ credentials.foo }}`).
 */
const PLACEHOLDER_RE = /\{\{\s*(credentials|params)\.([a-zA-Z0-9_]+)\s*\}\}/g

/**
 * Stringify a resolved `params` value for substitution into a string template.
 * Strings pass through; numbers/booleans use their natural form; `null`/
 * `undefined` and objects collapse to empty string (the caller decides whether
 * an empty resolution is an error). Kept deterministic and IO-free.
 */
function stringifyParam(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

/**
 * Replace every `{{credentials.<key>}}` / `{{params.<key>}}` token in `template`
 * with the matching value from `ctx`. A MISSING key resolves to the empty string
 * — this function does not throw; the caller may treat residual empties as an
 * error. Single regex pass, deterministic, no IO.
 *
 * @param template - the raw string (URL, header value, body template, …).
 * @param ctx.credentials - `{{credentials.<key>}}` source (stored secrets).
 * @param ctx.params - `{{params.<key>}}` source (runtime/LLM-supplied params).
 * @returns the template with all recognized tokens substituted.
 */
export function resolvePlaceholders(
  template: string,
  ctx: { credentials: Record<string, string>; params: Record<string, unknown> },
): string {
  return template.replace(PLACEHOLDER_RE, (_match, source: string, key: string) => {
    if (source === 'credentials') {
      const value = ctx.credentials[key]
      return typeof value === 'string' ? value : ''
    }
    // source === 'params'
    return stringifyParam(ctx.params[key])
  })
}

// ============================================================================
// 2. Request assembly
// ============================================================================

/** HTTP methods that carry a request body. */
const METHODS_WITH_BODY: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH'])

/** The assembled, ready-to-send descriptor. Carries no secrets beyond what the
 * spec asked to inject — it is NOT a log shape (use `sanitizeForLog` for logs). */
export interface BuiltRequest {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

/**
 * Append a query parameter to a URL string, picking `?` vs `&` based on whether
 * the URL already has a query string. Pure string manipulation — it does NOT
 * parse or validate the URL (that is the executor's job, T10).
 */
function appendQueryParam(url: string, key: string, value: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
}

/**
 * Apply the auth injection described by `auth` onto the in-progress URL/headers.
 *
 * Conventions (mirror `requestAuthSchema` in T04):
 *  - 'bearer' → `Authorization: Bearer <cred[credentialKey]>`
 *  - 'header' → `<headerName>: <cred[credentialKey]>` (no-op if `headerName` absent)
 *  - 'query'  → append `?<queryParam>=<cred[credentialKey]>` (no-op if absent)
 *  - 'basic'  → `Authorization: Basic <base64(cred[credentialKey])>` where the
 *               convention is that `credentialKey` holds the combined
 *               `user:pass` string (the schema's documented `basic` contract).
 *
 * A missing credential value resolves to empty string here (assembly does not
 * throw); the executor decides whether an empty secret aborts the call. Returns
 * the possibly-rewritten URL; mutates `headers` in place.
 */
function applyAuth(
  url: string,
  headers: Record<string, string>,
  auth: RequestAuth,
  credentials: Record<string, string>,
): string {
  const secret = credentials[auth.credentialKey] ?? ''

  switch (auth.type) {
    case 'bearer':
      headers.Authorization = `Bearer ${secret}`
      return url
    case 'header':
      if (auth.headerName) headers[auth.headerName] = secret
      return url
    case 'query':
      if (auth.queryParam) return appendQueryParam(url, auth.queryParam, secret)
      return url
    case 'basic':
      // Convention: `credentialKey` holds the literal `user:pass` string.
      headers.Authorization = `Basic ${Buffer.from(secret, 'utf8').toString('base64')}`
      return url
  }
}

/**
 * Assemble a declarative `RequestSpec` into a concrete request descriptor:
 * resolve URL/header/query/body placeholders, append static query params, and
 * inject the credential per `spec.auth.type`.
 *
 * This function ONLY assembles. It does NOT perform the request and does NOT
 * validate the URL scheme/host/IP or redirect policy — those guards live in the
 * executor (T10). It is pure and deterministic.
 *
 * @param spec - the declarative call spec (validated upstream by T04).
 * @param credentials - stored secret values keyed by credential field `key`.
 * @param params - runtime/LLM-supplied params for `{{params.*}}` tokens.
 * @returns `{ url, method, headers, body? }` ready for the executor to send.
 */
export function buildRequest(
  spec: RequestSpec,
  credentials: Record<string, string>,
  params: Record<string, unknown>,
): BuiltRequest {
  const ctx = { credentials, params }

  // 1. URL: resolve placeholders, then append static query params.
  let url = resolvePlaceholders(spec.url, ctx)
  if (spec.queryParams) {
    for (const [key, rawValue] of Object.entries(spec.queryParams)) {
      url = appendQueryParam(url, key, resolvePlaceholders(rawValue, ctx))
    }
  }

  // 2. Headers: resolve every header value's placeholders.
  const headers: Record<string, string> = {}
  if (spec.headers) {
    for (const [name, rawValue] of Object.entries(spec.headers)) {
      headers[name] = resolvePlaceholders(rawValue, ctx)
    }
  }

  // 3. Auth injection (may rewrite the URL, mutates headers in place).
  url = applyAuth(url, headers, spec.auth, credentials)

  // 4. Body: only for methods that carry one, only if a template exists.
  let body: string | undefined
  if (METHODS_WITH_BODY.has(spec.method) && typeof spec.bodyTemplate === 'string') {
    body = resolvePlaceholders(spec.bodyTemplate, ctx)
  }

  return body === undefined
    ? { url, method: spec.method, headers }
    : { url, method: spec.method, headers, body }
}

// ============================================================================
// 3. Secret masking
// ============================================================================

/**
 * Mask a secret for display, revealing at most the LAST 4 chars, e.g.
 * `••••1234`. Empty or short (≤ 4 char) values become all dots so the length of
 * a short secret is not leaked. The single helper reused everywhere a secret
 * might be surfaced (UI "filled?" hints, debug breadcrumbs).
 *
 * @param value - the raw secret (may be empty).
 * @returns the masked representation.
 */
export function maskSecret(value: string): string {
  const DOT = '•'
  if (value.length <= 4) return DOT.repeat(4)
  return `${DOT.repeat(4)}${value.slice(-4)}`
}

// ============================================================================
// 4. Error classification
// ============================================================================

/** The classified outcome of an integration call attempt. */
export interface ErrorClassification {
  outcome: string
  diagnosis: string
}

/**
 * STATIC pt-BR diagnosis templates. These strings NEVER interpolate any
 * submitted value — that is a hard security requirement (no secret/param/URL
 * leakage through a surfaced diagnosis). Each maps 1:1 to an `outcome`.
 */
const DIAGNOSIS = {
  success: 'A integração respondeu com sucesso.',
  auth_error:
    'A chave de acesso parece inválida ou expirada. Verifique se a chave foi copiada corretamente e ainda é válida.',
  not_found:
    'O endereço (URL) da integração não foi encontrado. Confirme se o endpoint está correto.',
  timeout:
    'A integração demorou demais para responder. Tente novamente em instantes.',
  schema_error:
    'A integração respondeu em um formato inesperado. Verifique a configuração e tente novamente.',
  network:
    'Não foi possível concluir a chamada à integração. Tente novamente em instantes.',
  redirect:
    'A chamada foi redirecionada e bloqueada por segurança. Revise a URL da integração.',
  error:
    'Ocorreu um erro ao chamar a integração. Tente novamente em instantes.',
} as const

/**
 * Classify the outcome of an integration call into an `outcome` code + a STATIC
 * leiga (plain-language) pt-BR `diagnosis`. Inputs are coarse signals — an HTTP
 * status and/or a transport `kind` — and NEVER any submitted value, so the
 * output can never carry a secret.
 *
 * Precedence: a transport `kind` (timeout/network/schema/redirect) is decided
 * before HTTP status, since those occur when there is no usable response.
 *
 *  - kind 'timeout'   → `timeout`
 *  - kind 'redirect'  → `redirect` (call was redirected → blocked for safety)
 *  - kind 'schema'    → `schema_error` (unexpected/unparsable response)
 *  - kind 'network'   → `network`
 *  - 401 / 403        → `auth_error` (re-check the credential)
 *  - 404              → `not_found`
 *  - 2xx              → `success`
 *  - other 5xx / rest → `network` (generic "tente novamente")
 *
 * @param input.httpStatus - HTTP status code, when a response was received.
 * @param input.kind - transport-level failure kind, when there was no response.
 * @returns `{ outcome, diagnosis }` with a static, value-free diagnosis.
 */
export function classifyError(input: {
  httpStatus?: number
  kind?: 'timeout' | 'network' | 'schema' | 'redirect'
}): ErrorClassification {
  // Transport-level signals take precedence (no usable HTTP response).
  switch (input.kind) {
    case 'timeout':
      return { outcome: 'timeout', diagnosis: DIAGNOSIS.timeout }
    case 'redirect':
      return { outcome: 'redirect', diagnosis: DIAGNOSIS.redirect }
    case 'schema':
      return { outcome: 'schema_error', diagnosis: DIAGNOSIS.schema_error }
    case 'network':
      return { outcome: 'network', diagnosis: DIAGNOSIS.network }
    default:
      break
  }

  const status = input.httpStatus
  if (typeof status === 'number') {
    if (status === 401 || status === 403) {
      return { outcome: 'auth_error', diagnosis: DIAGNOSIS.auth_error }
    }
    if (status === 404) {
      return { outcome: 'not_found', diagnosis: DIAGNOSIS.not_found }
    }
    if (status >= 200 && status < 300) {
      return { outcome: 'success', diagnosis: DIAGNOSIS.success }
    }
    // Other 5xx (and any non-2xx not specially handled) → generic retry.
    if (status >= 500) {
      return { outcome: 'network', diagnosis: DIAGNOSIS.network }
    }
  }

  // No actionable signal → generic error with a retry hint.
  return { outcome: 'error', diagnosis: DIAGNOSIS.error }
}

// ============================================================================
// 5. Log sanitization (single sanctioned log shape)
// ============================================================================

/**
 * The ONLY keys allowed to survive `sanitizeForLog`. Strict whitelist: anything
 * not listed here is dropped, so a raw header/body/credential can never reach a
 * log sink even if a caller passes it by mistake. Extend ONLY with fields that
 * are provably free of submitted/secret values.
 */
const LOG_WHITELIST: ReadonlySet<string> = new Set([
  'integrationId',
  'organizationId',
  'mode',
  'outcome',
  'httpStatus',
  'durationMs',
  'attempt',
])

/**
 * Belt-and-suspenders: even within the whitelist, reject any key that *looks*
 * like a secret. This guards against the whitelist being widened carelessly.
 */
const SECRET_KEY_RE = /credential|secret|token|password|authorization/i

/**
 * Produce the single sanctioned structured-log shape for the executor. Returns a
 * shallow copy containing ONLY whitelisted, secret-free keys — every other key
 * (headers, bodies, `credentials.*`, tokens, …) is dropped. This is the one log
 * path the executor uses, guaranteeing a raw secret can never be logged.
 *
 * @param fields - candidate log fields (may include unsafe values).
 * @returns a new object with only known-safe keys retained.
 */
export function sanitizeForLog(
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (!LOG_WHITELIST.has(key)) continue
    if (SECRET_KEY_RE.test(key)) continue
    safe[key] = value
  }
  return safe
}
