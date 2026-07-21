/**
 * oRPC SPIKE — exemplo de client com TanStack Query (TYPECHECK-ONLY).
 *
 * Objetivo (critério 2 do gate): provar a inferência de tipos ponta a ponta —
 * do handler no servidor até o `data` do useQuery no componente — sem nenhum
 * tipo escrito à mão.
 *
 * Equivalência com o client atual do Igniter:
 *   Igniter:  api.messages.list.useQuery({ query: { sessionId } })
 *   oRPC:     useQuery(orpc.messages.list.queryOptions({ input: { sessionId } }))
 *
 * NOTA DE ARQUITETURA (migração real): aqui importamos o router do servidor
 * para tipagem E para o OpenAPILink. Num app real, para não arrastar código de
 * servidor para o bundle do browser, o padrão oRPC é extrair o contrato
 * (`@orpc/contract` / minifyContractRouter) — passo mecânico documentado no
 * GATE-REPORT. Para o propósito deste arquivo (typecheck da inferência), o
 * import direto é suficiente e fiel: os tipos são os mesmos.
 */
'use client'

import { useQuery } from '@tanstack/react-query'
import { createORPCClient } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi-client/fetch'
import type { JsonifiedClient } from '@orpc/openapi-client'
import type { ContractRouterClient } from '@orpc/contract'
import { createTanstackQueryUtils } from '@orpc/tanstack-query'
import { spikeRouter } from './messages.router'

// O link aponta para o mount do spike; na migração real seria '/api/v1' e as
// URLs chamadas pelo browser seriam exatamente as de hoje (GET /api/v1/messages?...).
const link = new OpenAPILink(spikeRouter, {
  url: 'http://localhost:3000/api/v1',
})

// JsonifiedClient reflete a serialização JSON (Date -> string etc.) — mais
// honesto que o tipo cru do Prisma para consumo via HTTP/OpenAPI.
const client: JsonifiedClient<ContractRouterClient<typeof spikeRouter>> = createORPCClient(link)

const orpc = createTanstackQueryUtils(client)

export function MessagesListExample({ sessionId }: { sessionId: string }) {
  // `data` é inferido do retorno do handler no servidor:
  //   { data: Message[] } (com Date serializado para string via Jsonified).
  const { data, isLoading, error } = useQuery(
    orpc.messages.list.queryOptions({
      input: { sessionId, limit: 20, offset: 0 },
    }),
  )

  // Prova de inferência (nada disso tem anotação manual):
  //  - messages: array de Message serializado
  //  - m.content: string, m.createdAt: string (Date jsonificado), m.author:
  //    enum MessageAuthor — se o schema do Prisma mudar, isto quebra em
  //    compile-time.
  // data = { data: { data: Message[] }, error: null } — o envelope Igniter
  // (ver envelope.ts) também flui tipado até o client.
  const messages = data?.data.data ?? []

  if (isLoading) return <p>Carregando…</p>
  if (error) return <p>Erro: {error.message}</p>

  return (
    <ul>
      {messages.map((m) => (
        <li key={m.id}>
          [{m.createdAt}] {m.author}: {m.content}
        </li>
      ))}
    </ul>
  )
}

export function SessionsListExample() {
  const { data } = useQuery(
    orpc.messages.listSessions.queryOptions({
      input: { status: 'active', limit: 10, offset: 0 },
    }),
  )

  return <p>{data?.data.data.length ?? 0} sessões ativas</p>
}
