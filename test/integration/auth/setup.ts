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
 * hooks itself. Migrations are applied by `npm run test:db:up` before the
 * suite runs (see `scripts/test/db-up.sh`).
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

/** Par double-submit sintético usado por callAction (header + cookie). */
const CSRF_TEST_TOKEN = 'integration-test-csrf-token-0123456789ab';

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
    // csrfProcedure (double-submit) protege as mutations de verify-*-otp:
    // header x-csrf-token deve bater com o cookie csrf_token. Enviamos o par
    // válido por padrão — rotas sem CSRF ignoram; testes que queiram exercitar
    // a falha de CSRF podem sobrescrever via init.headers.
    'x-csrf-token': CSRF_TEST_TOKEN,
    ...(init.headers ?? {}),
  };
  if (!headers.cookie) {
    headers.cookie = `csrf_token=${CSRF_TEST_TOKEN}`;
  } else if (!headers.cookie.includes('csrf_token=')) {
    headers.cookie = `${headers.cookie}; csrf_token=${CSRF_TEST_TOKEN}`;
  }

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

  // Shape real do @igniter-js/core atual (IgniterResponseProcessor.toResponse):
  //   response.success(x) / .json(x)   -> { data: x, error: null }
  //   response.notFound(msg) / helpers -> { data: null, error: { message, code } }
  //   response.status(4xx).json(x)     -> { data: x, error: null } com status de erro
  // Normalizamos para o envelope { success, data } | { success, error } que os
  // testes consomem; formatos antigos ({ success, ... }) seguem aceitos.
  let envelope: IgniterEnvelope<T> | null = null;
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if ('success' in b) {
      envelope = b as unknown as IgniterEnvelope<T>;
    } else if (b.data && typeof b.data === 'object' && 'success' in (b.data as Record<string, unknown>)) {
      envelope = b.data as unknown as IgniterEnvelope<T>;
    } else if ('data' in b && 'error' in b) {
      if (b.error != null || !response.ok) {
        const rawError =
          b.error ??
          (b.data && typeof b.data === 'object' && 'error' in (b.data as Record<string, unknown>)
            ? (b.data as Record<string, unknown>).error
            : { message: `HTTP ${response.status}` });
        const error =
          rawError && typeof rawError === 'object'
            ? (rawError as { code?: string; message?: string })
            : { message: String(rawError) };
        envelope = { success: false, error };
      } else {
        envelope = { success: true, data: b.data as T };
      }
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    body,
    envelope,
  };
}
