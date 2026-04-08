/**
 * Integration test setup for auth endpoints (US-106B).
 *
 * Strategy: DIRECT INVOCATION via Igniter's `nextRouteHandlerAdapter`.
 *
 * Why direct invocation:
 *   `nextRouteHandlerAdapter(AppRouter)` returns plain async functions
 *   `(request: Request) => Promise<Response>`. We can construct a standard
 *   Fetch `Request` in-process and call `POST(request)` without booting a
 *   real Next.js server. This is the lightest-weight option, has no port
 *   coordination, and exercises the actual router/controller stack including
 *   Zod validation, procedures, and response shaping.
 *
 * Alternatives considered:
 *   - HTTP fetch against `next dev` (used by `test/api/auth.test.ts`): heavier,
 *     requires `npm run dev` running on port 3000.
 *   - Importing the controller and calling `handler()` directly: bypasses
 *     Igniter's request parsing / Zod validation, defeats integration purpose.
 *
 * Path resolution: Igniter is configured with `basePath: '/api/v1'` (see
 * `src/igniter.ts`). Auth controller has `path: '/auth'`. Each action declares
 * its own `path`, e.g. `/login-otp`. Final URL: `/api/v1/auth/login-otp`.
 *
 * This file is imported by individual test files; it does not register vitest
 * hooks itself (the global integration setup in `test/api/setup.ts` already
 * runs `prisma migrate deploy`).
 */
import { nextRouteHandlerAdapter } from '@igniter-js/core/adapters';
import { AppRouter } from '@/igniter.router';

/**
 * Cached adapter handlers. Built once per process. The same `AppRouter` is
 * reused across every test file (Igniter is stateless beyond DB/store).
 */
const handlers = nextRouteHandlerAdapter(AppRouter);

/**
 * Base URL used purely so the constructed `Request` is well-formed. The host
 * does not matter — the adapter only inspects the path against the configured
 * `basePath`.
 */
const BASE_URL = 'http://localhost/api/v1';

export type IgniterEnvelope<T> =
  | { success: true; data: T; error?: undefined }
  | { success: false; data?: undefined; error: { code?: string; message?: string; [k: string]: unknown } };

export interface CallResult<T> {
  status: number;
  ok: boolean;
  /** Raw JSON body returned by the route. */
  body: unknown;
  /** Best-effort unwrapped envelope (`response.success` shape). */
  envelope: IgniterEnvelope<T> | null;
}

/**
 * Invoke an Igniter action by its path. The `path` argument is the path under
 * `/api/v1`, e.g. `/auth/login-otp`. Method defaults to `POST` (auth mutations).
 *
 * @example
 *   const res = await callAction<{ sent: boolean }>('/auth/login-otp', {
 *     body: { email: 'foo@bar.com' },
 *   });
 */
export async function callAction<T = unknown>(
  path: string,
  init: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<CallResult<T>> {
  const method = init.method ?? 'POST';
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    // turnstileProcedure on signupOTP requires a token; tests run with the
    // procedure disabled by NODE_ENV=test in source. We still send a stub
    // header in case the procedure is enabled in the future.
    'x-turnstile-token': 'test-bypass',
    ...(init.headers ?? {}),
  };

  const request = new Request(`${BASE_URL}${path}`, {
    method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const handler = handlers[method];
  const response = await handler(request);

  let body: unknown = null;
  const text = await response.text();
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  // Igniter wraps `response.success(x)` as either `{ success, data }` or
  // `{ data: { success, data } }` depending on adapter version. Normalize.
  let envelope: IgniterEnvelope<T> | null = null;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if ('success' in b) {
      envelope = b as unknown as IgniterEnvelope<T>;
    } else if (b.data && typeof b.data === 'object' && 'success' in (b.data as Record<string, unknown>)) {
      envelope = b.data as unknown as IgniterEnvelope<T>;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    body,
    envelope,
  };
}
