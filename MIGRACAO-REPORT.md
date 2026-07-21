# Relatório da Migração Quayer → oRPC (Etapa 1 — Projeto Caravela)

**Data:** 2026-07-21 · **Branch:** `spike/orpc-messages` · **Status:** Etapa 1 de código CONCLUÍDA (131/135 actions)

## Sumário executivo

Os 8 controllers Igniter foram portados para oRPC com paridade de contrato:
mesmas URLs `/api/v1/*`, mesmos schemas Zod, mesmos serviços/repositórios e o
envelope de sucesso Igniter (`{data, error: null}`) preservado byte a byte via
helper `ok()`. As 4 actions restantes são SSE/streaming e ficam no Igniter até
a fase 4 por decisão de arquitetura (viram route handlers Next puros no
cutover, como `/logs/stream`).

**Suites finais:** oRPC `197/197` verdes · `npm run test:api` `17/17` verdes.

## Tabela controller × actions × estado

| Controller | Actions | Migradas | Pulada (SSE) | Estado |
|---|---:|---:|---:|---|
| messages | 3 | 3 | — | ✅ completo (spike do gate) |
| deviceSessions | 3 | 3 | — | ✅ completo |
| departments | 5 | 5 | — | ✅ completo (primeiro colocalizado) |
| providers | 6 | 6 | — | ✅ completo |
| logs | 8 | 7 | 1 (`stream`) | ✅ completo (SSE fica no Igniter) |
| auth | 38 | 38 | — | ✅ completo (8 subdomínios)¹ |
| builder | 72 | 69 | 3 | ✅ completo (lotes B1–B6) |
| **Total** | **135** | **131** | **4** | **Etapa 1 encerrada (código)** |

¹ O comentário anterior do agregador dizia "36 actions"; a contagem
autoritativa (grep de `igniter.query|mutation` × `.route()` no oRPC) é 38 = 38.

### Builder — detalhamento dos lotes (commits desta sessão)

| Lote | Sub-áreas | Actions | Commit |
|---|---|---:|---|
| B1 | projects (crud, prompt, metrics, channel, proactive-history) | 19 | `142ead7` (sessão anterior) |
| B2 | chat (listMessages, getReadiness, compact) + cards (parseSheet) | 4 | `dc4b731` |
| B3 | sources (3) + source-images (3) + media (2) + knowledge (3) + knowledge-source (3) | 14 | `ac22f59` |
| B4 | channel-credentials (2) + provision-whatsapp (1) + refresh-qr (1) + deploy (4) | 8 | `e72a2ab` |
| B5 | identity (2) + calendar (3) + events-preview (1) + connections (1) + pricing (4) + credential (3) + capabilities (1) | 15 | `e753307` |
| B6 | integrations list/create/creds/test (5) + lifecycle (4) | 9 | `add8a28` |

Todos os commits foram pushados para `origin/spike/orpc-messages` após cada
lote (backup autorizado — o `.git` local é frágil).

## Actions puladas (SSE — ficam no Igniter até a fase 4)

| Action | URL | Motivo |
|---|---|---|
| `logs.stream` | `GET /api/v1/logs/stream` | SSE puro (já decidido em lote anterior) |
| `builder.playgroundStream` | `POST /api/v1/builder/projects/:id/playground/stream` | SSE puro |
| `builder.sendMessage` | `POST /api/v1/builder/projects/:id/chat/message` | SSE (`buildSseResponse`) |
| `builder.submitCard` | `POST /api/v1/builder/projects/:id/cards/:cardKey/submit` | O ACK em `ackMode: 'conversational'` (default) responde SSE pelo mesmo pipeline do chat; a URL não pode ser dividida entre routers, então a action inteira permanece no Igniter (o caminho `silent` JSON vai junto) |

No cutover (fase 4) essas 4 viram route handlers Next puros nas mesmas URLs.

## Deltas aceitos e documentados

1. **Shape do corpo de ERRO** — status HTTP idênticos, mas o corpo de erros
   lançados via `ORPCError` tem o shape oRPC, não o do Igniter. Consumidores
   auditados só leem o status em erros. A decisão `CaravelaError` é para o
   `@caravela/core` futuro — sem retrofit agora.
2. **409 do updatePrompt** — o payload de conflito (prompt atual do servidor)
   viaja no `data` do `ORPCError('CONFLICT')` com o MESMO shape interno; o
   call-site migra junto com o client no cutover.
3. **Validação de params via `.input()`** — UUIDs inválidos continuam 400, mas
   o corpo do erro de validação é o do oRPC (era o do Zod/Igniter). Rotas cujo
   original só checava presença (knowledge, pricing, credential, deploy status)
   mantiveram `z.string().min(1)` sem endurecer para UUID.
4. **502 do refresh-qr** — `response.status(502).json({error})` virou
   `ORPCError('BAD_GATEWAY')`: status 502 preservado, corpo no shape oRPC.
5. **Colisão de chave `status`** — no controller Igniter, o spread de
   `calendarRoutes.status` sombreava `deployRoutes.status` no client
   (`api.builder.status` = calendar). No oRPC as chaves precisam ser únicas
   para as duas rotas existirem: o do deploy foi chaveado como `deployStatus`
   (as URLs, distintas, ficam ambas vivas — estritamente melhor que o Igniter).

## Mecânicas novas resolvidas nesta sessão

- **Feature-flag gate no oRPC** (integrations): o cookie de override QA é lido
  de `context.headers` (não mais de `request`); flag off ⇒ `NOT_FOUND` opaco,
  idêntico ao original.
- **Role-gate reusável** (`assertLifecycleRoleOrThrow` / `sessionUser`):
  ADMIN global curto-circuita, MASTER da org via membership — exportados de
  `integrations.orpc.ts` e reusados pelo lifecycle.
- **Delegates defensivos pré-migration** (BuilderDeployment,
  CalendarConnection): padrão `getX(): Delegate | null` copiado 1:1 — a
  degradação para warning-payload/404 é coberta por teste.
- **Transação com quota** (activate): `assertActiveIntegrationQuota` dentro do
  MESMO `$transaction` da ativação, preservando a atomicidade do gate ≤3.
- **Sign-on-read fail-safe** (source-images/media): assinatura por item em
  try/catch (`imageUrl/url = null` sem derrubar a lista), `storageKey` nunca
  exposto — coberto por teste que falha uma assinatura e verifica a outra.

## Segurança verificada nos testes (amostra)

- Credenciais BYOK: encrypt SEMPRE antes do persist; GET mascara
  (`configured` + `last4`), token cru nunca aparece na resposta (asserção
  explícita por string).
- Integrations: credenciais write-only; a list é presence-only (ciphertext
  jamais ecoado — asserção explícita).
- Multi-tenant: 403/404 cross-org testados em chat, sheet-parse, sources,
  imagens, mídia, knowledge-source, pricing e capabilities.
- Admin-only: rollback de deploy nega user comum (403) e exige posse via
  project org-scoped.

## O que falta para declarar a Etapa 1 encerrada

1. **Cutover do catch-all** — apontar `/api/v1/*` (hoje servido pelo Igniter)
   para o handler oRPC em produção, mantendo o Igniter apenas para as 4 rotas
   SSE até a fase 4. Hoje o oRPC atende em `/api/orpc` (paridade provada
   in-process nos testes).
2. **Migração dos call-sites do client** — o frontend ainda usa o client
   Igniter (`api.builder.*` etc.); trocar para o client oRPC remove também o
   envelope `ok()` numa passada única (decisão registrada para a SPEC-CORE).
3. **Fase 4 (SSE)** — converter as 4 actions SSE em route handlers Next puros
   nas mesmas URLs e desligar o Igniter de vez.
4. **Regressão E2E manual/staging** — a paridade foi provada por testes
   in-process (197 oRPC + 17 test:api); um smoke em staging com o FE real
   fecha o risco residual dos shapes de erro (delta 1–3).
5. **Decisão CaravelaError** — formalizar no `@caravela/core` o shape de erro
   definitivo antes de remover o delta aceito.
