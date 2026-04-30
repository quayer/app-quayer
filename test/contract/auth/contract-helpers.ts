/**
 * Contract Test Helpers — US-108
 *
 * These helpers enable "shape contract" tests against the Quayer auth API.
 *
 * GOAL
 * ----
 * Detect breaking response-shape changes BEFORE the frontend breaks in
 * production. The contract is enforced two ways:
 *
 *   1. assertContract(schema, response)
 *      Parses the response through a Zod schema. If a field is missing,
 *      renamed, or mistyped, the test fails immediately.
 *
 *   2. compareSnapshot(name, shape)
 *      A wrapper around `expect(...).toMatchSnapshot()` that snapshots the
 *      KEYS / TYPES of the response. New fields cause the snapshot to drift
 *      and force a manual review.
 *
 * INVOCATION STRATEGY
 * -------------------
 * `invokeAction()` calls the running dev server over HTTP via fetch. We chose
 * HTTP (not direct Igniter handler invocation) because:
 *   - It mirrors what the frontend actually does (cookies, CSRF, middleware).
 *   - The existing US-106B integration tests in `test/api/auth.test.ts` already
 *     use this exact pattern with `BASE_URL` + `fetch()`, so contract tests
 *     stay consistent and require no extra wiring.
 *   - Direct router invocation would bypass middleware that contract tests
 *     SHOULD exercise (e.g. content negotiation, error envelopes).
 *
 * The `BASE_URL` defaults to `http://localhost:3000/api/v1` and can be
 * overridden via `API_BASE_URL`.
 *
 * NOTE: contract tests are SHAPE tests, not behaviour tests. They do not check
 * rate limits, side effects, or DB state. Behaviour belongs in `test/api/`.
 */
import { expect } from 'vitest'
import type { z } from 'zod'

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1'

/**
 * Igniter wraps successful responses in `{ data: { success, data, message? } }`.
 * This is the envelope shape every contract assertion has to peel away first.
 */
export interface IgniterEnvelope<T = unknown> {
  success: boolean
  data: T
  message?: string
}

/**
 * Make a real HTTP call to a Quayer auth action and return the parsed JSON.
 *
 * @param actionPath  Path under `/api/v1`, e.g. `/auth/login-otp`.
 * @param input       JSON body for POST/PATCH actions. Pass `undefined` for GET.
 * @param init        Optional extra fetch init (headers, method override, etc).
 * @returns           Raw parsed JSON. Caller is responsible for unwrapping.
 *
 * @throws Error if the response is not JSON parseable. HTTP error STATUS does
 *               NOT throw — contract tests want to inspect both 2xx and 4xx
 *               envelopes for shape regressions.
 */
export async function invokeAction(
  actionPath: string,
  input?: unknown,
  init: RequestInit = {}
): Promise<{ status: number; body: unknown }> {
  const headers = new Headers(init.headers)
  if (input !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  // X-API-Key bypass mirrors what test/api/auth.test.ts uses for CSRF skip.
  if (!headers.has('X-API-Key')) {
    headers.set('X-API-Key', 'test-bypass')
  }

  const method = init.method ?? (input !== undefined ? 'POST' : 'GET')

  const res = await fetch(`${BASE_URL}${actionPath}`, {
    ...init,
    method,
    headers,
    body: input !== undefined ? JSON.stringify(input) : undefined,
  })

  let body: unknown
  try {
    body = await res.json()
  } catch (err) {
    throw new Error(
      `Contract: response from ${actionPath} was not JSON (status ${res.status}): ${(err as Error).message}`
    )
  }

  return { status: res.status, body }
}

/**
 * Unwrap the Igniter `{ data: { success, data } }` envelope so callers can
 * assert against the inner payload directly. Returns the raw value if the
 * envelope is absent (e.g. error responses sometimes use `{ error: ... }`).
 */
export function unwrapEnvelope(body: unknown): unknown {
  if (
    body !== null &&
    typeof body === 'object' &&
    'data' in body &&
    typeof (body as { data: unknown }).data === 'object' &&
    (body as { data: { success?: unknown } }).data !== null &&
    'success' in (body as { data: Record<string, unknown> }).data
  ) {
    const inner = (body as { data: IgniterEnvelope }).data
    return inner.data
  }
  return body
}

/**
 * Parse a response payload through a Zod schema and return the typed result.
 *
 * Use this when the frontend has a real response Zod schema and we want a
 * hard, type-checked contract. If the codebase grows response schemas later,
 * the test bodies do not have to change — only the schema import does.
 *
 * @throws ZodError if the shape does not match.
 */
export function assertContract<T>(schema: z.ZodSchema<T>, response: unknown): T {
  const result = schema.safeParse(response)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(
      `Contract violation: response did not match schema.\n${issues}\n\nRaw payload:\n${JSON.stringify(response, null, 2)}`
    )
  }
  return result.data
}

/**
 * Build a "shape descriptor" for snapshot comparison.
 *
 * Instead of snapshotting raw values (which would diff on every test run
 * because of UUIDs, timestamps, JWTs), we snapshot only the KEYS and the
 * primitive TYPE of each leaf. This catches:
 *   - field added         (new key in shape)
 *   - field removed       (key vanishes)
 *   - field renamed       (one key disappears, another appears)
 *   - field type changed  (string -> number, etc.)
 *
 * It tolerates value churn and runs deterministically.
 */
export function describeShape(value: unknown): unknown {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return ['<empty array>']
    // Only inspect the first element — arrays in API responses are
    // homogeneous in our codebase.
    return [describeShape(value[0])]
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = describeShape((value as Record<string, unknown>)[key])
    }
    return out
  }
  return typeof value
}

/**
 * Snapshot the shape of a payload. On first run, vitest writes the snapshot
 * file. On subsequent runs the test fails if the shape drifted.
 *
 * NEVER edit the generated `__snapshots__` file by hand. To accept an
 * intentional change, regenerate with `vitest --update-snapshots` (aka `-u`).
 */
export function compareSnapshot(name: string, shape: unknown): void {
  expect(describeShape(shape), `contract shape: ${name}`).toMatchSnapshot(name)
}
