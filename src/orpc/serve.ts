/**
 * oRPC — handler HTTP compartilhado (produção + testes).
 *
 * Extraído do antigo mount de teste `src/app/api/v1/[[...rest]]/route.ts`
 * (aposentado no cutover). O prefixo agora é o de produção: `/api/v1`.
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
 * Usado por:
 *   - `src/app/api/v1/[[...all]]/route.ts` (catch-all de produção) para tudo
 *     que NÃO for uma das 4 rotas SSE que permanecem no Igniter.
 *   - Suites `*.orpc.test.ts` (importam GET/POST/... daqui diretamente).
 */
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { ResponseHeadersPlugin } from '@orpc/server/plugins'
import { ZodSmartCoercionPlugin } from '@orpc/zod'
import { appRouter } from '@/orpc/router'
import type { SpikeInitialContext } from '@/orpc/base'

// Cast de TRANSIÇÃO: o router mistura procedures oRPC cruas do app e
// procedures @caravela/core (instaladas via link file:, com árvore de tipos
// própria) — runtime-compatíveis ({ headers, resHeaders } + marcador
// '~orpc'), mas nominalmente distintas para o tsc (dual-package do link).
// O vitest deduplica os pacotes @orpc em runtime (resolve.dedupe). Morre
// quando @caravela/core for dependência publicada (uma árvore só).
const handler = new OpenAPIHandler<SpikeInitialContext>(
  appRouter as never,
  {
    // Coerção automática de query strings -> tipos do schema (equivale ao
    // comportamento do adapter do Igniter; os z.coerce dos schemas originais
    // continuam funcionando de qualquer forma).
    // ResponseHeadersPlugin: faz o merge do context.resHeaders (cookies de
    // auth/CSRF escritos pelos handlers via cookieWriter) no response final.
    plugins: [new ZodSmartCoercionPlugin(), new ResponseHeadersPlugin()],
  } as never,
)

export const ORPC_PREFIX = '/api/v1' as const

/**
 * Delegado ao OpenAPIHandler preservando o Request cru (body/headers não são
 * lidos antes da delegação — o handler consome o stream original).
 */
export async function handleOrpcRequest(request: Request): Promise<Response> {
  const { response } = await handler.handle(request, {
    prefix: ORPC_PREFIX,
    context: {
      headers: request.headers,
      resHeaders: new Headers(),
    },
  })

  return response ?? Response.json({ error: 'Not Found' }, { status: 404 })
}

// Exports com nomes de método HTTP para as suites de teste, que importam
// `{ GET, POST, ... }` e chamam como um route handler do Next.
export const GET = handleOrpcRequest
export const POST = handleOrpcRequest
export const PUT = handleOrpcRequest
export const PATCH = handleOrpcRequest
export const DELETE = handleOrpcRequest
