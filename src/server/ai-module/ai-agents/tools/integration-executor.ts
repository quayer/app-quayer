/**
 * Integration Builder — shared HTTP executor (Wave 1, T10)
 *
 * THE single place a declarative integration request is assembled AND sent. It
 * takes a validated `RequestSpec` (T04), the stored credential values, and the
 * runtime/LLM-supplied params, builds the concrete request via T09's pure
 * `buildRequest`, enforces this module's OWN SSRF policy, performs the call, and
 * classifies the outcome into a leiga (plain-language) pt-BR diagnosis.
 *
 * THIS EXECUTOR HAS ITS OWN SSRF POLICY — it does NOT reuse text-extraction's
 * `safeFetch`. The policy, revalidated on EVERY call, is:
 *  - HTTPS ONLY: the URL scheme is re-parsed and re-checked per call; any
 *    non-`https:` scheme is `blocked`. The ONLY exception is the T32 E2E
 *    allowlist (`isHostAllowedForTest`): under `NODE_ENV==='test'` a host listed
 *    in `INTEGRATION_TEST_ALLOWED_HOSTS` bypasses BOTH the https check and the IP
 *    guard so an E2E fixture on `http://127.0.0.1:PORT` can be reached. In ANY
 *    other NODE_ENV the env var is ignored by construction — strictly https-only.
 *  - PER-CALL POST-DNS IP GUARD: the hostname is resolved (`dns.lookup`, ALL
 *    addresses) BEFORE the fetch, and if ANY resolved IP is private / loopback /
 *    link-local / unique-local / cloud-metadata the call is `blocked`. This
 *    mirrors `isResolvedIpSafe` in `create-custom-tool.tool.ts` but checks every
 *    resolved address (DNS-rebinding hardening), not just the first.
 *  - MANUAL REDIRECT: `redirect: 'manual'` is passed to `fetch`; a 3xx response
 *    is treated as `redirect` (blocked for safety) and `fetch` is called EXACTLY
 *    once for that attempt — we never follow a redirect to a re-pointed host.
 *  - NEVER THROWS: every failure path (build error, DNS failure, abort, network,
 *    parse) is caught and mapped to an `IntegrationOutcome` via `classifyError`.
 *    The function ALWAYS resolves with an `IntegrationCallResult`.
 *
 * LOGGING: the ONLY structured log shape is `sanitizeForLog(...)` (T09's strict
 * whitelist) prefixed `[integration-executor]`. Headers, bodies, credentials,
 * and any URL-with-query are NEVER logged. `bodySnippet` is returned for schema
 * validation ONLY and is never passed to the logger.
 *
 * Zero `any`.
 */

import { promises as dns } from 'dns'
import { isIPv4 } from 'net'
import { logger } from '@/server/services/logger'
import {
  buildRequest,
  classifyError,
  sanitizeForLog,
} from '../../builder/integrations/request-spec'
import type { RequestSpec } from '../../builder/integrations/integration.schemas'

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/** Coarse, value-free outcome of a single integration call. */
export type IntegrationOutcome =
  | 'success'
  | 'auth_error'
  | 'not_found'
  | 'timeout'
  | 'schema_error'
  | 'network'
  | 'redirect'
  | 'blocked'

/**
 * Result of {@link runIntegrationCall}. `diagnosis` is a STATIC leiga pt-BR
 * string from `classifyError` (never interpolates a submitted value). `bodySnippet`
 * is the capped response body kept for downstream SCHEMA validation only — it is
 * NEVER logged.
 */
export interface IntegrationCallResult {
  outcome: IntegrationOutcome
  httpStatus?: number
  durationMs: number
  /** Leiga pt-BR explanation, via `classifyError`. Safe to surface to the user. */
  diagnosis: string
  /** Capped response body for schema validation ONLY — NEVER logged. */
  bodySnippet?: string
}

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Response body read cap (mirrors `custom-tools.ts` MAX_RESPONSE_BYTES). */
const MAX_RESPONSE_BYTES = 8 * 1024 // 8 KB

/** Per-call timeout. `test` runs interactively so it gets a slightly longer budget. */
const TIMEOUT_MS = { test: 15_000, production: 10_000 } as const

// ---------------------------------------------------------------------------
// SSRF policy — OWN to this executor (not text-extraction's safeFetch)
// ---------------------------------------------------------------------------

/**
 * T32 env-gated E2E allowlist.
 *
 * `INTEGRATION_TEST_ALLOWED_HOSTS` is a comma-separated list of hostnames (or
 * `host:port`) that an E2E fixture server is reachable on (e.g. `localhost`,
 * `localhost:43117`, `127.0.0.1:43117`). When a host is allowlisted, the
 * executor BYPASSES the https-only check AND the post-DNS private-IP guard for
 * THAT host only — letting an E2E test hit a `http://127.0.0.1:PORT` fixture.
 *
 * SAFETY BY CONSTRUCTION: the var is read ONLY when `NODE_ENV === 'test'`. In
 * EVERY other NODE_ENV (production, development, …) {@link isHostAllowedForTest}
 * short-circuits to `false` BEFORE the var is even consulted — so setting the
 * var in production has ZERO effect; the executor stays strictly https-only with
 * the full IP guard. T32 wires THIS function only; the call sites are unchanged.
 *
 * NODE_ENV is fixed per-process, so the parsed allowlist is memoized once.
 */

/** True only when this process is a test process (vitest pins `NODE_ENV='test'`). */
function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test'
}

/** Lazily-parsed allowlist memo. `null` = not parsed yet (parse-once guard). */
let allowedTestHostsMemo: ReadonlySet<string> | null = null

/**
 * Parse `INTEGRATION_TEST_ALLOWED_HOSTS` ONCE into a normalized set. Each entry
 * is lower-cased and trimmed; blanks are dropped. Entries may be a bare hostname
 * (`localhost`) or `host:port` (`localhost:43117`) — both forms are stored as
 * given so either can be matched. Only ever reached under `NODE_ENV==='test'`.
 */
function getAllowedTestHosts(): ReadonlySet<string> {
  if (allowedTestHostsMemo !== null) return allowedTestHostsMemo
  const raw = process.env.INTEGRATION_TEST_ALLOWED_HOSTS ?? ''
  const entries = raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => h.length > 0)
  allowedTestHostsMemo = new Set(entries)
  return allowedTestHostsMemo
}

/**
 * Should `host` (hostname, lower-cased) — optionally bound to `port` — bypass
 * the SSRF guards? Returns `false` for EVERY host unless `NODE_ENV==='test'`
 * AND the host (by bare hostname OR `host:port`) is in the env allowlist. The
 * NODE_ENV gate runs FIRST, so outside test the env var is ignored entirely.
 */
function isHostAllowedForTest(host: string, port: string): boolean {
  if (!isTestEnv()) return false
  const allowed = getAllowedTestHosts()
  if (allowed.size === 0) return false
  if (allowed.has(host)) return true
  return port.length > 0 && allowed.has(`${host}:${port}`)
}

/** IPv4 ranges that must never be reachable (private / loopback / link-local / metadata). */
const PRIVATE_IPV4_RANGES: ReadonlyArray<RegExp> = [
  /^0\./, // 0.0.0.0/8 "this network"
  /^127\./, // 127.0.0.0/8 loopback
  /^10\./, // 10.0.0.0/8 private
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12 private
  /^192\.168\./, // 192.168.0.0/16 private
  /^169\.254\./, // 169.254.0.0/16 link-local + cloud metadata (169.254.169.254)
]

/**
 * Classify a single resolved IP literal as unsafe (private / loopback /
 * link-local / unique-local / metadata). Handles both IPv4 and IPv6 literals;
 * the v6 matcher tolerates an IPv4-mapped suffix (`::ffff:10.0.0.1`).
 */
function isPrivateAddress(address: string): boolean {
  if (isIPv4(address)) {
    return PRIVATE_IPV4_RANGES.some((re) => re.test(address))
  }

  // IPv6 (lower-cased for the range matchers).
  const v6 = address.toLowerCase()
  if (v6 === '::1' || v6 === '::') return true // loopback / unspecified
  if (/^fe[89ab][0-9a-f]:/.test(v6)) return true // fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true // fc00::/7 unique-local

  // IPv4-mapped IPv6 (`::ffff:a.b.c.d`) — re-check the embedded v4.
  const mapped = v6.match(/:((?:\d{1,3}\.){3}\d{1,3})$/)
  if (mapped && isIPv4(mapped[1])) {
    return PRIVATE_IPV4_RANGES.some((re) => re.test(mapped[1]))
  }

  return false
}

/**
 * Post-DNS guard, re-run per call. Resolves `hostname` to ALL addresses and
 * returns false if ANY of them is private/reserved (DNS-rebinding hardening —
 * an attacker controlling DNS can't slip one internal A record past us). A DNS
 * failure is treated as UNSAFE (closed by default). Mirrors and tightens
 * `isResolvedIpSafe` in `create-custom-tool.tool.ts`.
 */
async function areResolvedIpsSafe(hostname: string): Promise<boolean> {
  try {
    const records = await dns.lookup(hostname, { all: true })
    if (records.length === 0) return false
    return !records.some((r) => isPrivateAddress(r.address))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Response read cap (mirrors custom-tools.ts readCapped)
// ---------------------------------------------------------------------------

/**
 * Read a `fetch` Response body as text but stop after `maxBytes` to prevent a
 * malicious target from exhausting memory. The per-call timeout already bounds
 * the read; a hard slice is sufficient.
 */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const text = await res.text()
  return text.length > maxBytes ? text.slice(0, maxBytes) : text
}

// ---------------------------------------------------------------------------
// Outcome helpers
// ---------------------------------------------------------------------------

/** `classifyError` returns an open `string`; narrow it to our closed union. */
function toOutcome(raw: string): IntegrationOutcome {
  switch (raw) {
    case 'success':
    case 'auth_error':
    case 'not_found':
    case 'timeout':
    case 'schema_error':
    case 'network':
    case 'redirect':
      return raw
    default:
      // `classifyError`'s generic `error` (and anything unforeseen) maps to the
      // closest member of our union: a generic retryable network failure.
      return 'network'
  }
}

/** Transport-failure kinds that are eligible for the single production retry. */
type TransportKind = 'timeout' | 'network' | 'schema' | 'redirect'

/** Was a fetch error an AbortError (our timeout) vs a generic network failure? */
function transportKindOf(err: unknown): 'timeout' | 'network' {
  const name = (err as { name?: string } | null)?.name
  return name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'network'
}

/**
 * The result of ONE network attempt. `retryable` tells the caller whether a
 * production retry is permitted (5xx | network | timeout). `bodySnippet` is only
 * present for a response that was actually read.
 */
interface AttemptResult {
  outcome: IntegrationOutcome
  httpStatus?: number
  diagnosis: string
  bodySnippet?: string
  retryable: boolean
}

/**
 * Perform exactly ONE network attempt against an already-built, already-guarded
 * request. Never throws — fetch/parse errors are caught and classified. Calls
 * `fetch` AT MOST once (manual redirect → no follow).
 */
async function attemptOnce(
  built: { url: string; method: string; headers: Record<string, string>; body?: string },
  spec: RequestSpec,
  timeoutMs: number,
): Promise<AttemptResult> {
  try {
    const res = await fetch(built.url, {
      method: built.method,
      headers: built.headers,
      body: built.body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    })

    // Manual redirect: a 3xx is blocked for safety (we never follow to a
    // re-pointed host). `fetch` was called exactly once to get here.
    if (res.status >= 300 && res.status < 400) {
      const { outcome, diagnosis } = classifyError({ kind: 'redirect' })
      return { outcome: toOutcome(outcome), httpStatus: res.status, diagnosis, retryable: false }
    }

    // Read (capped) for both success-schema validation and error context.
    const bodySnippet = await readCapped(res, MAX_RESPONSE_BYTES)

    // Success: 2xx OR an explicit `successWhen.httpStatusIn` match.
    const allowedStatuses = spec.successWhen?.httpStatusIn
    const isSuccess =
      (res.status >= 200 && res.status < 300) ||
      (Array.isArray(allowedStatuses) && allowedStatuses.includes(res.status))

    if (isSuccess) {
      const { outcome, diagnosis } = classifyError({ httpStatus: 200 })
      return { outcome: toOutcome(outcome), httpStatus: res.status, diagnosis, bodySnippet, retryable: false }
    }

    // Non-success HTTP status: classify (401/403→auth, 404→not_found, 5xx→network).
    const { outcome, diagnosis } = classifyError({ httpStatus: res.status })
    return {
      outcome: toOutcome(outcome),
      httpStatus: res.status,
      diagnosis,
      bodySnippet,
      retryable: res.status >= 500, // only 5xx is retryable; 4xx never.
    }
  } catch (err) {
    // Thrown fetch error with NO status → classify by transport kind.
    const kind = transportKindOf(err)
    const { outcome, diagnosis } = classifyError({ kind })
    return { outcome: toOutcome(outcome), diagnosis, retryable: true }
  }
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

/**
 * Assemble (via T09 `buildRequest`), guard (this module's OWN SSRF policy), send,
 * and classify a single declarative integration call. NEVER throws — all errors
 * map to an `IntegrationOutcome`. See the file header for the full policy.
 *
 * @param spec        - the declarative call spec (validated upstream by T04).
 * @param credentials - stored secret values keyed by credential field `key`.
 * @param params      - runtime/LLM-supplied params for `{{params.*}}` tokens.
 * @param opts.mode   - `'test'` (longer timeout, ZERO retries) vs `'production'`
 *                      (one inline retry for 5xx|network|timeout only).
 * @param opts.integrationId / opts.organizationId - log/tenant correlation only.
 * @returns an `IntegrationCallResult` (resolves, never rejects).
 */
export async function runIntegrationCall(
  spec: RequestSpec,
  credentials: Record<string, string>,
  params: Record<string, unknown>,
  opts: { mode: 'test' | 'production'; integrationId: string; organizationId: string },
): Promise<IntegrationCallResult> {
  const startedAt = Date.now()
  const timeoutMs = TIMEOUT_MS[opts.mode]

  /** Emit the ONE sanctioned structured log shape (T09 whitelist). */
  const log = (outcome: IntegrationOutcome, httpStatus: number | undefined, attempt: number) => {
    logger.info(
      '[integration-executor] call finished',
      sanitizeForLog({
        integrationId: opts.integrationId,
        organizationId: opts.organizationId,
        mode: opts.mode,
        outcome,
        httpStatus,
        durationMs: Date.now() - startedAt,
        attempt,
      }),
    )
  }

  // --- 1. Assemble (pure, T09). A malformed spec throws → map to network. -----
  let built: { url: string; method: string; headers: Record<string, string>; body?: string }
  try {
    built = buildRequest(spec, credentials, params)
  } catch {
    const { diagnosis } = classifyError({ kind: 'network' })
    log('network', undefined, 1)
    return { outcome: 'network', durationMs: Date.now() - startedAt, diagnosis }
  }

  // --- 2. HTTPS-only, revalidated per call. -----------------------------------
  let parsed: URL
  try {
    parsed = new URL(built.url)
  } catch {
    const { diagnosis } = classifyError({ kind: 'network' })
    log('blocked', undefined, 1)
    return { outcome: 'blocked', durationMs: Date.now() - startedAt, diagnosis }
  }

  const host = parsed.hostname.toLowerCase()
  const allowedForTest = isHostAllowedForTest(host, parsed.port)

  if (parsed.protocol !== 'https:' && !allowedForTest) {
    const { diagnosis } = classifyError({ kind: 'network' })
    log('blocked', undefined, 1)
    return { outcome: 'blocked', durationMs: Date.now() - startedAt, diagnosis }
  }

  // --- 3. Post-DNS IP guard, per call, ALL addresses (DNS-rebinding hardening). -
  if (!allowedForTest) {
    const ipsSafe = await areResolvedIpsSafe(host)
    if (!ipsSafe) {
      const { diagnosis } = classifyError({ kind: 'network' })
      log('blocked', undefined, 1)
      return { outcome: 'blocked', durationMs: Date.now() - startedAt, diagnosis }
    }
  }

  // --- 4. Send (manual redirect, capped read, timeout). -----------------------
  let attempt = 1
  let result = await attemptOnce(built, spec, timeoutMs)

  // --- 5. Exactly ONE inline retry, production-only, for 5xx|network|timeout. --
  const RETRYABLE_OUTCOMES: ReadonlySet<IntegrationOutcome> = new Set([
    'network',
    'timeout',
  ])
  const shouldRetry =
    opts.mode === 'production' &&
    result.retryable &&
    RETRYABLE_OUTCOMES.has(result.outcome)

  if (shouldRetry) {
    attempt = 2
    result = await attemptOnce(built, spec, timeoutMs)
  }

  log(result.outcome, result.httpStatus, attempt)

  return {
    outcome: result.outcome,
    httpStatus: result.httpStatus,
    durationMs: Date.now() - startedAt,
    diagnosis: result.diagnosis,
    bodySnippet: result.bodySnippet,
  }
}
