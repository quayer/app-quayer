/**
 * oRPC SPIKE — catch-all Next.js (App Router) para o router do spike.
 *
 * COMO O PREFIXO/MOUNT FUNCIONA NO oRPC:
 *   - Cada procedure declara seu path ABSOLUTO relativo ao prefixo via
 *     `.route({ method, path })` (ex.: '/messages', '/messages/{id}').
 *   - O OpenAPIHandler recebe `prefix` em `handle(request, { prefix })`:
 *     ele remove o prefixo do pathname da request e casa o restante contra a
 *     tabela de rotas declarada nas procedures (radix router; segmentos
 *     estáticos têm precedência sobre params — coberto por teste).
 *   - URL final = prefix + route.path.
 *
 * PROVA DE PRESERVAÇÃO DE /api/v1/*:
 *   Na migração real este arquivo vive em src/app/api/v1/[[...all]]/route.ts
 *   (substituindo o catch-all do Igniter) com prefix: '/api/v1', e os paths
 *   declarados nas procedures são exatamente os paths hoje servidos pelo
 *   Igniter. No spike o mount usa /api/orpc-spike apenas para NÃO conflitar
 *   com o Igniter ainda ativo em /api/v1 — a tabela de rotas é idêntica.
 *
 * Equivalente Igniter substituído: nextRouteHandlerAdapter(AppRouter) em
 * src/app/api/v1/[[...all]]/route.ts.
 */
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { ZodSmartCoercionPlugin } from '@orpc/zod'
import { spikeRouter } from '@/orpc-spike/messages.router'

const handler = new OpenAPIHandler(spikeRouter, {
  // Coerção automática de query strings -> tipos do schema (equivale ao
  // comportamento do adapter do Igniter; os z.coerce dos schemas originais
  // continuam funcionando de qualquer forma).
  plugins: [new ZodSmartCoercionPlugin()],
})

const SPIKE_PREFIX = '/api/orpc-spike' as const

async function handle(request: Request): Promise<Response> {
  const { response } = await handler.handle(request, {
    prefix: SPIKE_PREFIX,
    context: {
      headers: request.headers,
    },
  })

  return response ?? Response.json({ error: 'Not Found' }, { status: 404 })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
