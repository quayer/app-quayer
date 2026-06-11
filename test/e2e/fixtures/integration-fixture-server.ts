/**
 * Integration Builder — E2E HTTP fixture server (Wave 4, T33)
 *
 * A REAL local HTTP server that stands in for RD Station (and any other
 * declarative integration target) during E2E tests of the integration
 * executor (`src/server/ai-module/ai-agents/tools/integration-executor.ts`).
 *
 * WHY A REAL SERVER (not a Playwright network mock): the executor runs
 * SERVER-SIDE — it does its own `fetch` from the Next.js process, which is
 * NOT on the page's network stack, so `page.route(...)` can never intercept
 * it. The only way to drive the executor's outcomes (success / auth_error /
 * not_found / timeout) deterministically from an E2E spec is to point the
 * integration at a real local endpoint and have THAT endpoint decide the reply.
 *
 * HOW THE SPEC REACHES THIS SERVER: the executor enforces HTTPS-only + a
 * post-DNS private-IP guard on EVERY call. Both are bypassed ONLY when
 * `NODE_ENV==='test'` AND the target host is listed in
 * `INTEGRATION_TEST_ALLOWED_HOSTS` (T32). So the spec must:
 *   1. start this server,
 *   2. register its `.host` (`127.0.0.1:<port>`) in
 *      `INTEGRATION_TEST_ALLOWED_HOSTS`,
 *   3. configure the integration's request URL to point at this server's
 *      `.url` instead of the real `https://api.rd.services` host.
 * The executor lower-cases the hostname and matches against `host` and
 * `host:port`, which is exactly why `.host` is exposed as `127.0.0.1:<port>`.
 *
 * RESPONSE ROUTING — the test drives the outcome via a signal it controls:
 *   - the `api_key` query param (mirrors the RD Station template, which carries
 *     `?api_key=...` injected by the executor from `credentials.api_key`), OR
 *   - a path segment (so a test can drive a case without crafting the query).
 *
 * Routing table (path takes precedence over api_key when both are present):
 *   - path `/timeout`                              → NEVER responds (socket held
 *     open) so the executor's `AbortSignal.timeout(15s)` fires → `timeout`.
 *   - path `/notfound`                             → 404 → `not_found`.
 *   - path `/unauthorized` OR api_key 'invalid-key'→ 401 `{"errors":"invalid token"}`
 *                                                    → `auth_error`.
 *   - path `/ok` OR api_key 'valid-key'            → 200 `{"event_uuid":"fixture-123"}`
 *                                                    → `success` (RD-style).
 *   - any other path (incl. `/platform/conversions`
 *     with no recognized api_key) / default        → 200 success body.
 *
 * The RD Station conversions path (`/platform/conversions`) is therefore
 * accepted as a catch-all: with `api_key=valid-key` it succeeds, with
 * `api_key=invalid-key` it 401s — matching the real API's behavior closely
 * enough to exercise the executor end-to-end.
 *
 * LIFECYCLE: `startIntegrationFixtureServer()` binds 127.0.0.1:0 (ephemeral
 * port) and resolves once listening; `close()` resolves once fully closed.
 * Because `/timeout` deliberately holds a socket open forever, `close()` must
 * forcibly destroy every live connection or the test process would hang on
 * exit — see the socket-tracking note on `close()`.
 *
 * Implemented with the Node `http` module only (no express). Zero `any`.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Socket } from 'node:net'

/**
 * Handle to a running fixture server. `host` is the `127.0.0.1:<port>` form to
 * drop into `INTEGRATION_TEST_ALLOWED_HOSTS`; `url` is the base origin to point
 * the integration's request URL at.
 */
export interface IntegrationFixtureServer {
  /** Base origin, e.g. `http://127.0.0.1:54321`. Point the integration here. */
  url: string
  /** `127.0.0.1:<port>` — register this in `INTEGRATION_TEST_ALLOWED_HOSTS`. */
  host: string
  /** The ephemeral port the server bound to. */
  port: number
  /** Fully stop the server, forcibly destroying any held-open (`/timeout`) sockets. */
  close: () => Promise<void>
}

/** Small, RD-style success body so the executor's schema/snippet path is exercised. */
const SUCCESS_BODY = JSON.stringify({ event_uuid: 'fixture-123' })
/** 401 body shaped like RD Station's auth error, drives the `auth_error` diagnosis. */
const UNAUTHORIZED_BODY = JSON.stringify({ errors: 'invalid token' })
/** 404 body. */
const NOT_FOUND_BODY = JSON.stringify({ errors: 'not found' })

/** Drain (and discard) any request body so the connection can be reused/closed cleanly. */
function drainRequest(req: IncomingMessage): void {
  req.resume()
}

/** Write a JSON response with the given status and body. */
function sendJson(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body).toString(),
  })
  res.end(body)
}

/**
 * Decide and send the response for one request. Path segment wins over the
 * `api_key` query param; everything unrecognized falls through to success.
 *
 * The `/timeout` branch intentionally does NOTHING with `res` — the socket is
 * held open so the executor's `AbortSignal.timeout` fires. The open socket is
 * tracked by the server-level connection set and destroyed on `close()`.
 */
function route(req: IncomingMessage, res: ServerResponse): void {
  // `req.url` is a path+query relative to origin; a dummy base makes it parseable.
  const parsed = new URL(req.url ?? '/', 'http://127.0.0.1')
  const pathname = parsed.pathname
  const apiKey = parsed.searchParams.get('api_key')

  // --- 1. Path-driven cases (explicit, win over api_key). ---
  if (pathname === '/timeout') {
    // Never respond. Hold the socket; `close()` will destroy it.
    drainRequest(req)
    return
  }
  if (pathname === '/notfound') {
    drainRequest(req)
    sendJson(res, 404, NOT_FOUND_BODY)
    return
  }
  if (pathname === '/unauthorized') {
    drainRequest(req)
    sendJson(res, 401, UNAUTHORIZED_BODY)
    return
  }
  if (pathname === '/ok') {
    drainRequest(req)
    sendJson(res, 200, SUCCESS_BODY)
    return
  }

  // --- 2. api_key-driven cases (mirror the RD Station ?api_key=... contract). ---
  if (apiKey === 'invalid-key') {
    drainRequest(req)
    sendJson(res, 401, UNAUTHORIZED_BODY)
    return
  }
  if (apiKey === 'valid-key') {
    drainRequest(req)
    sendJson(res, 200, SUCCESS_BODY)
    return
  }

  // --- 3. Default: success (also covers /platform/conversions with no signal). ---
  drainRequest(req)
  sendJson(res, 200, SUCCESS_BODY)
}

/**
 * Start the fixture server on an ephemeral 127.0.0.1 port. Resolves once the
 * server is listening, with a handle exposing `url`, `host`, `port`, `close`.
 */
export async function startIntegrationFixtureServer(): Promise<IntegrationFixtureServer> {
  const server = createServer(route)

  // Track every live socket so `close()` can forcibly destroy held-open
  // `/timeout` connections — `server.close()` alone waits for in-flight
  // requests to finish and would hang forever on a `/timeout` socket.
  const sockets = new Set<Socket>()
  server.on('connection', (socket: Socket) => {
    sockets.add(socket)
    socket.on('close', () => {
      sockets.delete(socket)
    })
  })

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error): void => reject(err)
    server.once('error', onError)
    // port 0 → OS assigns an ephemeral port; bind to loopback only.
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', onError)
      resolve()
    })
  })

  const address = server.address()
  if (address === null || typeof address === 'string') {
    // Should never happen for a TCP server bound to a port; fail loud.
    await new Promise<void>((resolve) => server.close(() => resolve()))
    throw new Error('integration-fixture-server: expected a TCP AddressInfo after listen()')
  }
  const port = (address as AddressInfo).port
  const host = `127.0.0.1:${port}`
  const url = `http://${host}`

  const close = (): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      // Stop accepting new connections and wait for the server to fully close.
      server.close((err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
      // Forcibly destroy any held-open sockets (the `/timeout` route) so the
      // `server.close()` callback can fire and the test process can exit.
      // Prefer the built-in helper when available (Node 18.2+); fall back to
      // iterating the tracked set for older runtimes.
      const closeAll = (server as { closeAllConnections?: () => void }).closeAllConnections
      if (typeof closeAll === 'function') {
        closeAll.call(server)
      } else {
        for (const socket of sockets) socket.destroy()
        sockets.clear()
      }
    })
  }

  return { url, host, port, close }
}
