/**
 * API Logger Middleware
 *
 * Wraps Next.js route handlers to persist every API request (method, path,
 * status, duration, IP, user-agent) via {@link loggerService}.
 *
 * Logging is fire-and-forget so it never blocks the response. Errors during
 * persistence fall back to console so they never crash the request.
 *
 * Used by `src/app/api/v1/[[...all]]/route.ts` to instrument the entire
 * Igniter.js surface area.
 */

import type { LogLevel } from '@prisma/client'
import { loggerService } from './logger.service'

type RouteHandler = (req: Request, ...args: unknown[]) => Promise<Response> | Response

export function withApiLogger(method: string, handler: RouteHandler): RouteHandler {
  return async (req, ...args) => {
    const start = Date.now()
    let response: Response | undefined
    let caughtError: unknown

    try {
      response = await handler(req, ...args)
      return response
    } catch (err) {
      caughtError = err
      throw err
    } finally {
      // Fire and forget — never block the response.
      void persistApiLog({
        method,
        req,
        response,
        durationMs: Date.now() - start,
        error: caughtError instanceof Error ? caughtError : undefined,
      })
    }
  }
}

interface PersistArgs {
  method: string
  req: Request
  response: Response | undefined
  durationMs: number
  error: Error | undefined
}

async function persistApiLog({ method, req, response, durationMs, error }: PersistArgs): Promise<void> {
  try {
    const url = new URL(req.url)
    const status = response?.status ?? (error ? 500 : 0)
    const level = pickLevel(status, error)

    await loggerService.log(level, `${method} ${url.pathname} → ${status} (${durationMs}ms)`, {
      source: 'api',
      action: `${method} ${url.pathname}`,
      context: {
        requestPath: url.pathname + url.search,
        requestMethod: method,
        statusCode: status,
        duration: durationMs,
        ipAddress: extractIp(req),
        userAgent: req.headers.get('user-agent') ?? undefined,
      },
      stackTrace: error?.stack,
      tags: ['api', `status:${status}`, `method:${method.toLowerCase()}`],
    })
  } catch (err) {
    // Last-resort fallback — don't propagate logging failures.
    console.error('[api-logger] log persistence failed:', err)
  }
}

function pickLevel(status: number, error: Error | undefined): LogLevel {
  if (error || status >= 500) return 'ERROR'
  if (status >= 400) return 'WARN'
  return 'INFO'
}

function extractIp(req: Request): string | undefined {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = req.headers.get('x-real-ip')
  return real ?? undefined
}
