---
titulo: "SPIKE oRPC — Relatório do gate go/no-go (fork Igniter.js × migração oRPC)"
data: 2026-07-21
branch: spike/orpc-messages
autor: spike-engineer (Claude)
status: veredito-preliminar
---

# SPIKE oRPC — GATE REPORT

Migração mecânica do controller `messages` (3 actions, o menor do app) de
Igniter.js para oRPC **1.14.8**, com provas de typecheck, teste in-process e
inferência de tipos no client.

## Resumo executivo

**VEREDITO PRELIMINAR: a mecânica CONFIRMA os critérios do gate.** As 3 actions
foram portadas 1:1 (mesmos schemas Zod, mesmas queries Prisma, mesma semântica
de auth), as URLs `/api/v1/*` são preserváveis via `.route({ method, path })` +
`prefix` no mount, os tipos fluem ponta a ponta sem anotação manual, e a
`authProcedure` tem equivalente direto em middleware oRPC reusando os mesmos
utilitários de JWT/banco. Nenhum bloqueador técnico encontrado no escopo
testado. A única área que NÃO mapeia 1:1 é SSE (3 rotas no app) — ver análise
honesta abaixo; há fallback trivial (manter como route handlers Next puros).

## 1. Tabela action × esforço

Tempos são de porte real medido nesta sessão (leitura do original já feita;
inclui escrever e ver compilar). Linhas contam o arquivo portado sem os
comentários de documentação do spike (código efetivo).

| Action | Original (Igniter) | oRPC | Esforço real | Linhas orig -> port | Mapeou 1:1 | Exigiu adaptação | Sem equivalente |
|---|---|---|---|---|---|---|---|
| `list` GET `/api/v1/messages` | `igniter.query` + `query:` zod + `use:[authProcedure]` | `.route({GET,'/messages'})` + `.input(zod)` + `base.use(requireAuth)` | ~6 min | ~52 -> ~55 | schema Zod (copiado), queries Prisma (copiadas), namespace `messages.list` | `response.badRequest/notFound/success` -> `throw ORPCError(...)` / `return obj`; leitura de `request.query` some (o `input` já chega validado/tipado) | — |
| `getById` GET `/api/v1/messages/:id` | path `/:id`, `request.params` manual | path `/messages/{id}`, `id` entra no `.input` | ~4 min | ~32 -> ~35 | query Prisma, semântica 404 | sintaxe de param `:id` -> `{id}`; validação do param ganhou schema (antes era if manual) | — |
| `listSessions` GET `/api/v1/messages/sessions` | rota estática convivendo com `/:id` | idem; radix router do oRPC dá precedência a segmento estático (provado por teste) | ~4 min | ~42 -> ~45 | schema, query, ordenação | nenhuma além do padrão acima | — |
| `authProcedure({required:true})` (custo único, não por action) | procedure Igniter que estende contexto ou retorna `Response` 401 | `base.middleware` que estende contexto via `next({context})` ou lança `ORPCError('UNAUTHORIZED')` | ~15 min | 294 (arquivo com 2 procedures) -> 129 (só a required) | **reusa** `validateBearerToken`, `database`, `AuthRepository`, `getCustomRolePermissions` — zero validação reimplementada; extração de token copiada 1:1 | retorno de erro vira `throw`; extensão de contexto vira `next({context})` | — |
| Catch-all + mount (custo único) | `src/app/api/v1/[[...all]]/route.ts` (adapter Igniter) | `OpenAPIHandler` + `prefix` (novo arquivo, não conflitante) | ~10 min | — -> 51 | conceito idêntico (catch-all Next) | — | — |

**Esforço médio por action: ~5 min e ~+3 linhas por action** (delta de linhas
praticamente zero; o corpo do handler é copiado). Custos únicos (base,
middleware de auth, catch-all): ~25–30 min, pagos uma vez.

### Extrapolação para 135 actions (ESTIMATIVA — ressalva obrigatória)

135 actions × ~5–10 min (usando o dobro do medido como margem para actions com
body/mutations, procedures adicionais e SSE-adjacentes) = **~11 a 22 horas de
porte mecânico**, mais custos únicos: middlewares equivalentes das demais
procedures (`adminProcedure`, `authOrApiKeyProcedure`, etc. — cada uma ~15 min
pelo padrão comprovado aqui), contrato/client split e ajuste dos call-sites do
client React (`api.x.y.useQuery` -> `useQuery(orpc.x.y.queryOptions(...))`,
substituição textual regular). Ressalva: o `messages` é o menor e mais simples
controller do app (3 GETs); a extrapolação é estimativa, não medição —
controllers com upload, webhooks e SSE terão cauda mais longa.

## 2. Preservação de URL rota a rota (critério 1)

Como o mount funciona no oRPC: cada procedure declara o path completo relativo
ao prefixo em `.route({ method, path })`; o `OpenAPIHandler.handle(request,
{ prefix })` remove o prefixo do pathname e casa o restante contra a tabela de
rotas. **URL final = prefix + path.**

| URL original (Igniter, produção) | Declaração oRPC | URL com mount real (`prefix:'/api/v1'`) | Preservada? |
|---|---|---|---|
| `GET /api/v1/messages` | `.route({method:'GET', path:'/messages'})` | `GET /api/v1/messages` | SIM |
| `GET /api/v1/messages/:id` | `.route({method:'GET', path:'/messages/{id}'})` | `GET /api/v1/messages/:id` (mesma URL concreta; só a *notação* interna muda) | SIM |
| `GET /api/v1/messages/sessions` | `.route({method:'GET', path:'/messages/sessions'})` | `GET /api/v1/messages/sessions` | SIM (precedência estático>param provada por teste) |

No spike o mount usa `prefix:'/api/orpc-spike'` (arquivo novo
`src/app/api/orpc-spike/[[...rest]]/route.ts`) apenas para não conflitar com o
Igniter ainda ativo em `/api/v1`; na migração real o mesmo arquivo vai para
`src/app/api/v1/[[...all]]/route.ts` com `prefix:'/api/v1'` — nada mais muda.

## 3. Como os tipos fluem (critério 2)

Cadeia provada por `tsc --noEmit` (0 erros) em `src/orpc-spike/client.example.tsx`:

1. Handler no servidor retorna `{ data: messages }` (tipo vem do Prisma).
2. `spikeRouter` carrega os tipos dos handlers.
3. `createORPCClient` + `OpenAPILink` tipa o client como
   `JsonifiedClient<ContractRouterClient<typeof spikeRouter>>` — `Jsonified`
   reflete a serialização HTTP (`Date` -> `string`), mais honesto que o tipo cru.
4. `createTanstackQueryUtils(client)` gera `orpc.messages.list.queryOptions()`.
5. No componente, `useQuery(...)` infere `data: { data: Message[] } | undefined`
   — `m.author` resolve para o enum `MessageAuthor` do Prisma; mudou o schema,
   quebra em compile-time. Nenhum tipo escrito à mão em nenhum ponto.
6. `.input()` também flui: `input: { sessionId: string; limit?: number; ... }`
   com autocomplete no call-site.

Nota de arquitetura (mecânica, não bloqueador): para o bundle do browser não
arrastar código de servidor, a migração real extrai o contrato
(`@orpc/contract` / `minifyContractRouter`) — passo padrão documentado do oRPC.

## 4. authProcedure -> middleware oRPC (critério 4)

Equivalência completa, reusando os MESMOS utilitários do app
(`src/orpc-spike/auth.middleware.ts`):

- Extração de token (header `Authorization` OU cookie httpOnly `accessToken`):
  código copiado 1:1 da procedure original.
- Validação: `validateBearerToken` de `@/lib/auth/jwt` — o mesmo módulo, mesma
  verificação de assinatura/issuer/audience. O teste assina com o
  `signAccessToken` real do app.
- Usuário/orgs/CustomRole: mesmas queries Prisma da procedure original,
  incluindo `getCustomRolePermissions` e o shape `context.auth.{session,repository,customRole}`.
- Diferenças de sintaxe (semântica preservada): negar = `throw new
  ORPCError('UNAUTHORIZED')` (o handler HTTP converte em 401) em vez de
  `return Response.json(...,{status:401})`; estender contexto = `next({context})`
  em vez de retornar objeto. `required:false` é trivial (retornar user null em
  vez de lançar) — não portado por não ser usado pelo `messages`.

## 5. Provas executadas

| Prova | Resultado |
|---|---|
| `npx tsc --noEmit` baseline (antes de qualquer arquivo do spike, após `prisma generate`) | **0 erros** |
| `npx tsc --noEmit` depois do spike (inclui os 7 arquivos novos — confirmado via `--listFilesOnly`) | **0 erros** (nenhum erro adicionado) |
| `npx vitest run --config src/orpc-spike/vitest.config.spike.ts` | **7/7 verdes, primeira execução**: 200+shape `{data:[...]}` com JWT válido; 401 sem token; 401 token inválido; 404 sessão de outra org; precedência `/messages/sessions` sobre `/messages/{id}`; path param; auth via cookie |
| Inferência no client | `client.example.tsx` typecheck-only com `useQuery` — ver §3 |

Observação sobre o teste: mocka apenas o banco (mesmo padrão dos testes
existentes do módulo em `src/server/communication/messages/*.test.ts`); JWT e
roteamento são reais, e a request atravessa o route handler Next de verdade.

## 6. SSE — análise honesta (o app tem 3 rotas SSE)

Rotas SSE reais do app (todas retornam `Response` crua com `ReadableStream` e
headers `text/event-stream` de dentro de uma action Igniter):
1. `src/server/features-module/logs/controllers/logs-sse.controller.ts` (GET `/logs/stream`)
2. `src/server/ai-module/builder/chat/sse-stream.ts` (chat do builder)
3. `src/server/ai-module/builder/projects/routes/playground.routes.ts` (playground)

Avaliação do Event Iterator do oRPC (pela doc, não testado neste spike):
- O caminho idiomático é o handler virar `async function*` com `yield` de
  eventos tipados (`eventIterator(schema)`); o handler HTTP serve como SSE e o
  client oRPC consome com tipos + reconexão (`withEventMeta` para id/retry).
- **O que NÃO mapeia 1:1**: os streams atuais emitem *named events* SSE
  (`event: connected`, `event: log`, heartbeats manuais `:\n\n`). O event
  iterator do oRPC controla o formato do wire (eventos `message`/`error`/`done`)
  — um consumidor `EventSource` externo que escute nomes de evento custom
  precisaria mudar, e heartbeat manual sai do controle do handler. Portar =
  reescrever o corpo do stream como generator + migrar o consumidor junto:
  esforço real, não substituição textual (~1–2 h por rota, estimativa).
- **Fallback de risco zero**: essas 3 rotas nem precisam entrar no oRPC — são
  `Response` cruas; podem virar route handlers Next.js puros nas mesmas URLs
  (`src/app/api/v1/logs/stream/route.ts`, etc.), convivendo com o catch-all
  oRPC (rota estática do Next vence o catch-all). URL preservada, zero
  reescrita de protocolo. Recomendado para a primeira onda da migração.

## 7. Bloqueadores encontrados

**Técnicos do oRPC: nenhum.** Registros operacionais (não são do oRPC):
- `npm install` puro falha por peer-dep (`@igniter-js/adapter-bullmq` exige
  `zod@3.23.8` vs `zod@^3.25.76` do app) — o repo assume `legacyPeerDeps`
  (chave em `package.json` que o npm CLI não honra); usar
  `npm install --legacy-peer-deps`. Irônico e favorável ao gate: é o pin de zod
  do próprio ecossistema Igniter que trava o upgrade de zod do app.
- `prisma generate` precisa rodar manualmente (postinstall bloqueado por
  allow-scripts) antes do typecheck.
- Infra da máquina: o `.git` do repo principal (em OneDrive) tem 152 objetos
  loose desidratados pelo OneDrive (cliente desinstalado) -> `git worktree add`
  quebra com `mmap failed`. O worktree foi materializado via checkout por
  caminho; 5 blobs são irrecuperáveis localmente, todos SVGs default do
  template Next (`public/{file,globe,next,vercel,window}.svg`) — ausentes do
  working tree do spike, mantidos FORA dos commits, sem efeito em build/teste.
  Esses 5 blobs existem no histórico remoto (clone de recuperação em
  `C:/dev/quayer-clone.git`).

## 8. Veredito preliminar

**A mecânica CONFIRMA o gate — recomendação preliminar: MIGRAR para oRPC, não
forkar o Igniter.js.**
1. URLs `/api/v1/*` preserváveis rota a rota (provado com tabela + teste de
   roteamento, incluindo precedência estático×param).
2. Tipos ponta a ponta funcionando sem anotação manual (tsc 0 erros, useQuery
   inferido).
3. Esforço por action pequeno e mecânico (~5 min, delta de linhas ~0; padrão de
   conversão textual repetível).
4. `authProcedure` tem equivalente direto reusando os utilitários do app.

Cauda de risco a validar na onda 1 da migração (fora do escopo deste spike):
mutations com body, upload (rotas builder), webhooks, `authOrApiKeyProcedure`,
e a decisão por rota SSE (event iterator × route handler Next puro).
