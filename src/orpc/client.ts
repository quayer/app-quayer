/**
 * oRPC — client tipado do frontend (substitui `api` de src/igniter.client.ts).
 *
 * Segue src/orpc/client.example.tsx, com a diferença de arquitetura já
 * documentada lá: em vez de importar o router do servidor (que arrastaria
 * Prisma & cia. para o bundle do browser), o runtime usa o CONTRATO minificado
 * gerado por `npm run orpc:contract` (src/orpc/contract.json) e a TIPAGEM vem
 * de `import type` (apagado na compilação — zero código de servidor no bundle).
 *
 * Equivalência com o client Igniter:
 *   Igniter:  api.builder.renameProject.useMutation(); mutate({ params: { id }, body: { name } })
 *   oRPC:     useMutation(orpc.builder.renameProject.mutationOptions()); mutate({ id, name })
 *   Igniter:  const { data, error } = await api.auth.loginOTP.mutate({ body })
 *   oRPC:     const { data } = await client.auth.loginOTP(body)   // erro agora é THROW
 *
 * DELTAS em relação ao client Igniter (documentados no CUTOVER-REPORT):
 *   1. ERRO: o client Igniter resolvia `{ data, error }`; o oRPC LANÇA
 *      `ORPCError` (com .message, .status, .code, .data). Use orpcErrorMessage()
 *      para extrair mensagem amigável.
 *   2. Hooks TanStack: `data` do useQuery/useMutation é o ENVELOPE de wire
 *      `{ data: P, error: null }` (o client Igniter desembrulhava um nível).
 *   3. CSRF: este client injeta `x-csrf-token` do cookie em toda request
 *      (o client Igniter não injetava — endpoints com csrfProcedure eram
 *      chamados via fetch cru; esses fetches continuam intocados).
 */
import { createORPCClient } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import type { JsonifiedClient } from '@orpc/openapi-client'
import type { ContractRouterClient } from '@orpc/contract'
import type { AnyContractRouter } from '@orpc/contract'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { getCsrfToken } from '@/client/hooks/use-csrf-token'
import contractJson from './contract.json'
import type { appRouter } from './router'

// Mesma resolução de base URL do client Igniter aposentado.
const baseURL =
  typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_IGNITER_API_URL || 'http://localhost:3000'

const link = new OpenAPILink(contractJson as unknown as AnyContractRouter, {
  url: `${baseURL}/api/v1`,
  headers: () => {
    const token = getCsrfToken()
    return token ? { 'x-csrf-token': token } : {}
  },
})

/**
 * Client imperativo: `await client.builder.renameProject({ id, name })`.
 * JsonifiedClient reflete a serialização JSON (Date -> string etc.).
 */
export const client: JsonifiedClient<ContractRouterClient<typeof appRouter>> =
  createORPCClient(link)

/**
 * Utils TanStack Query: `useQuery(orpc.builder.getMetrics.queryOptions({ input: { id } }))`.
 */
export const orpc = createTanstackQueryUtils(client)

/**
 * Extrai mensagem amigável de um erro do client oRPC (ORPCError ou rede).
 * Substitui os leitores do shape Igniter `{ error: { message, details } }`.
 */
export function orpcErrorMessage(error: unknown, fallback = 'Erro inesperado'): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}
