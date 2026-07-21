/**
 * Catch-all /api/v1/* — CUTOVER Quayer→oRPC (projeto Caravela).
 *
 * Desde o cutover, o oRPC serve TODA a superfície /api/v1/* EXCETO as 4 rotas
 * SSE listadas em {@link SSE_ROUTES_IGNITER}, que continuam no Igniter até a
 * fase 4 (porte de streaming). O roteamento decide por método + pathname e
 * delega o Request CRU (body/headers intocados) ao handler escolhido.
 */
import { AppRouter } from '@/igniter.router'
import { nextRouteHandlerAdapter } from '@igniter-js/core/adapters'
import { withApiLogger } from '@/lib/logs/api-logger.middleware'
import { handleOrpcRequest } from '@/orpc/serve'

// Wiring do Igniter mantido EXCLUSIVAMENTE para as rotas SSE abaixo.
const igniterAdapter = nextRouteHandlerAdapter(AppRouter)

/**
 * SSE_ROUTES_IGNITER — TEMPORÁRIO (remover na fase 4, junto com a
 * aposentadoria do Igniter, após o cutover estabilizar em produção).
 *
 * As 4 rotas que respondem Server-Sent Events e por isso permanecem no
 * Igniter (o oRPC ainda não porta esses streams):
 *   1. GET  /api/v1/logs/stream                                  (logs-sse.controller)
 *   2. POST /api/v1/builder/projects/:id/playground/stream       (builder.playgroundStream)
 *   3. POST /api/v1/builder/projects/:id/chat/message            (builder.sendMessage)
 *   4. POST /api/v1/builder/projects/:id/cards/:cardKey/submit   (builder.submitCard — SSE no ACK conversational)
 */
const SSE_ROUTES_IGNITER: ReadonlyArray<{ method: string; pattern: RegExp }> = [
  { method: 'GET', pattern: /^\/api\/v1\/logs\/stream\/?$/ },
  { method: 'POST', pattern: /^\/api\/v1\/builder\/projects\/[^/]+\/playground\/stream\/?$/ },
  { method: 'POST', pattern: /^\/api\/v1\/builder\/projects\/[^/]+\/chat\/message\/?$/ },
  { method: 'POST', pattern: /^\/api\/v1\/builder\/projects\/[^/]+\/cards\/[^/]+\/submit\/?$/ },
]

function isSseIgniterRoute(method: string, pathname: string): boolean {
  return SSE_ROUTES_IGNITER.some(
    (route) => route.method === method && route.pattern.test(pathname),
  )
}

type NextRouteHandler = (req: Request, ...args: unknown[]) => Promise<Response> | Response

function createHandler(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'): NextRouteHandler {
  const igniterHandler = igniterAdapter[method] as NextRouteHandler
  return async (request: Request, ...args: unknown[]) => {
    const { pathname } = new URL(request.url)
    if (isSseIgniterRoute(method, pathname)) {
      return igniterHandler(request, ...args)
    }
    return handleOrpcRequest(request)
  }
}

export const GET = withApiLogger('GET', createHandler('GET'))
export const POST = withApiLogger('POST', createHandler('POST'))
export const PUT = withApiLogger('PUT', createHandler('PUT'))
export const DELETE = withApiLogger('DELETE', createHandler('DELETE'))
export const PATCH = withApiLogger('PATCH', createHandler('PATCH'))
