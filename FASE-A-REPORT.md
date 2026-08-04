---
title: "FASE A — Correção dos 3 achados críticos (Quayer)"
data: 2026-07-21
branch: fix/fase-a-seguranca
base: 1319bbce56c9778da54da0dac9900f0dea049f8f (feat/builder-onda3, HEAD local de produção)
status: concluído — 3/3 fixes, 111/111 testes passando
---

# FASE A — Relatório

Branch `fix/fase-a-seguranca`, 1 commit por fix, sobre o commit exato de produção
`1319bbc` (mesmo SHA do repo principal). **Nada foi pushado.** O working tree do
repo principal em OneDrive não foi tocado.

## FIX 1 — 🔴 Assinatura do webhook Cloud API nunca verificada

Commit `2bc72b7` — `fix(webhooks): Verify Cloud API webhook signature and remove default verify token`

```
src/app/api/v1/webhooks/cloudapi/[instanceId]/route.test.ts | 281 +++ (novo)
src/app/api/v1/webhooks/cloudapi/[instanceId]/route.ts      |  61 +-
2 files changed, 338 insertions(+), 4 deletions(-)
```

O que mudou:

- **POST**: o raw body é lido UMA única vez (`request.text()`) antes de qualquer
  `JSON.parse`; a assinatura `X-Hub-Signature-256` é verificada sobre esses bytes
  com `verifyWebhookSignature` (HMAC-SHA256 + `timingSafeEqual`, que existia sem
  call site em `cloudapi.normalizer.ts:287`). Assinatura inválida ou ausente com
  secret configurado → **401 sem processar**.
- **GET**: removido o default hardcoded `'quayer-cloudapi-verify'`. O verify token
  agora vem da conexão (`cloudApiVerifyToken`, armazenado cifrado — decrypt com
  tolerância a row legada em claro) com fallback no env
  `CLOUDAPI_WEBHOOK_VERIFY_TOKEN`; sem nenhum dos dois → **403**.

### Decisões que merecem revisão do founder

1. **Fonte do app secret = env `CLOUDAPI_APP_SECRET` (global da plataforma), não
   por conexão.** O schema Prisma NÃO tem campo de app secret Cloud API na
   `Connection` (só o Instagram tem `igAppSecret`). Como o webhook da Cloud API é
   assinado pelo app secret do **Meta App da plataforma** (um por deployment, não
   por tenant), o env é o modelo correto hoje. Se um dia houver múltiplos Meta
   Apps (BYO-app por tenant), será preciso adicionar uma coluna
   `cloudApiAppSecret` + migração — deixei fora do escopo.
2. **Política sem secret configurado: aceita + warning estruturado** (uma linha,
   com `connectionId`): `"Cloud API webhook accepted WITHOUT signature
   verification — CLOUDAPI_APP_SECRET not configured"`. Escolha conservadora para
   não derrubar deployments/tenants que nunca cadastraram o secret. **Ação
   recomendada**: cadastrar `CLOUDAPI_APP_SECRET` em produção e depois promover o
   warning a rejeição (fail-closed).
3. **GET prefere o token da conexão ao env** — permite verify token por tenant já
   cadastrado pelo Builder funcionar sem env global.

### Testes (9/9 ✅)

`npx vitest run "src/app/api/v1/webhooks/cloudapi/[instanceId]/route.test.ts"`
— 9 passed. Cobrem: assinatura válida aceita (200 + processamento); inválida 401
sem processar; ausente com secret 401; payload adulterado com assinatura do
original 401 (prova de raw-body); sem secret aceita com warning contendo
`connectionId`; GET 403 sem token (inclusive tentando o antigo default); GET env
token OK; GET token da conexão (cifrado) preferido; GET token errado 403.

## FIX 2 — 🔴 DNS rebinding no webhook v1 de custom tools

Commit `abfd254` — `fix(ai-tools): Block DNS rebinding in v1 custom tool webhooks at runtime`

```
src/server/ai-module/ai-agents/tools/custom-tools.ts         |  18 +-
src/server/ai-module/ai-agents/tools/integration-executor.ts |   5 +-
src/server/ai-module/ai-agents/tools/custom-tools.test.ts    |   3 + (mock atualizado)
test/unit/ai-agents/custom-tools.test.ts                     | 117 +++
4 files changed, 141 insertions(+), 2 deletions(-)
```

O que mudou (menor diff, sem refatorar além do necessário):

- `areResolvedIpsSafe` do `integration-executor.ts` (guard pós-DNS por chamada:
  resolve TODOS os IPs, qualquer IP privado/loopback/link-local/metadata bloqueia,
  falha de DNS é fail-closed) foi **exportada** e é chamada no execute do webhook
  v1 em `custom-tools.ts`, depois do guard de regex existente e antes do fetch.
  Obs.: o executor está em `tools/integration-executor.ts` (a auditoria citava
  `services/` — mesmo arquivo, path diferente).
- O fetch v1 ganhou `redirect: 'manual'`: um 3xx não é mais seguido (não pode
  re-apontar a request para host interno após o guard) e cai no branch `!res.ok`
  existente como falha estruturada.

### Decisões que merecem revisão do founder

1. **TOCTOU residual**: o guard resolve o DNS e o fetch em seguida faz o próprio
   lookup — janela de corrida teórica idêntica à do integration-executor (padrão
   do repo, replicado conforme o escopo). Eliminar de vez exigiria pin de IP no
   agent/dispatcher HTTP — fica como melhoria futura.
2. Um 3xx agora é falha estruturada para o LLM (`success:false, status:3xx`).
   Webhooks de clientes atrás de redirects permanentes vão precisar atualizar a
   URL cadastrada.

### Testes (53/53 ✅ nos 3 arquivos tocados)

`npx vitest run test/unit/ai-agents/custom-tools.test.ts
src/server/ai-module/ai-agents/tools/custom-tools.test.ts
src/server/ai-module/ai-agents/tools/integration-executor.test.ts` — 53 passed.
Novos (5): DNS→IP privado bloqueado em runtime sem fetch; A records mistos
(público + 169.254.169.254) bloqueado; NXDOMAIN fail-closed; guard re-roda A CADA
chamada (2ª chamada com DNS re-apontado é bloqueada); `redirect: 'manual'`
presente e 302 vira falha estruturada. Baselines pré-mudança: 10/10 e 13/13 —
o mock de `./integration-executor` no teste colocalizado precisou expor
`areResolvedIpsSafe` (3 linhas), sem mudança de comportamento dos casos antigos.

## FIX 3 — 🟠 persistMessage com create seco → loop de 500

Commit `17c012f` — `fix(webhooks): Treat P2002 in persistMessage as idempotent dedup`

```
src/server/communication/webhooks/uazapi/process-inbound.ts      |  71 ++--
src/server/communication/webhooks/uazapi/process-inbound.test.ts | 138 +++ (novo)
2 files changed, 193 insertions(+), 16 deletions(-)
```

O que mudou:

- `persistMessage` captura P2002 (duck-typed em `err.code`, mesmo padrão de
  `runtime-decision.service.ts` / `ensure-builder-agent.ts`), busca a Message
  existente por `waMessageId` e **retorna o id dela sem erro**, com log `info`
  estruturado — mesma semântica do upsert de `src/lib/webhook/processor.ts:172`.
  Qualquer outro erro continua propagando; o edge case "P2002 mas a row sumiu
  entre o create e a busca" propaga o erro original (não mascara).

### Decisão que merece revisão do founder

- Optei por **create + catch P2002 + findUnique** (conforme pedido na auditoria)
  em vez de trocar para `upsert`. Comportamento idêntico no dedup; o create
  continua sendo o caminho quente sem custo extra.

### Testes (5/5 novos ✅; 23/23 com os relacionados)

`npx vitest run src/server/communication/webhooks/uazapi/process-inbound.test.ts
src/server/communication/webhooks/uazapi/resolve-connection.test.ts
test/unit/webhook/processor.test.ts` — 23 passed. Novos: caminho feliz; P2002 →
retorna id existente sem exceção + log; reentrega dupla retorna o MESMO id;
erro não-P2002 propaga; P2002 com row sumida propaga.

## Rodada final de regressão

`npx vitest run` nos 8 arquivos de teste de todos os módulos tocados (incluindo a
suíte completa da rota uazapi, 26 testes, que importa `process-inbound`):
**8 files / 111 tests — todos passando.** Nenhum teste existente estava quebrado
no baseline antes das mudanças.

## Notas de ambiente (importante para integrar o trabalho)

1. **O `.git` do repo principal (OneDrive) está corrompido**: 152 objetos soltos
   viraram placeholders cloud-only do OneDrive e o provedor de nuvem NÃO está em
   execução na máquina → qualquer comando git que toque neles morre com
   `fatal: mmap failed: Invalid argument` (foi isso que quebrou o
   `git worktree add`). Eu **não modifiquei** o repo principal (a política de
   permissões também bloqueia): recuperei 109 dos 152 objetos do remote GitHub e
   os deixei verificados (SHA idêntico) no alternate `C:/tmp/git-local-objects`;
   os 43 restantes são histórico local não pushado (lista em
   `C:/tmp/shas-notfound.txt`). **Correção sugerida**: iniciar/logar o OneDrive
   para hidratar os 152, OU remover os 109 placeholders (o conteúdo já está no
   alternate) e aceitar os 43 como perda de histórico local.
2. Por isso, `C:/dev/quayer-fase-a` é um **repo standalone** (não um worktree):
   contém o commit `1319bbc` EXATO (objetos exportados do repo principal +
   5 blobs de `public/*.svg` recuperados do remote, tudo verificado por SHA),
   marcado shallow em `1319bbc` — equivalente a um `clone --depth 1` da base.
   Para trazer os commits para o repo principal (depois de saneado o item 1):
   `git -C <repo-principal> fetch C:/dev/quayer-fase-a fix/fase-a-seguranca:fix/fase-a-seguranca`.
   (Existe uma branch `fix/fase-a-seguranca` vazia apontando para `1319bbc` no
   repo principal, criada pelo worktree add que falhou — o fetch acima a
   atualiza por fast-forward.)
3. **npm install**: o install limpo falhou com ERESOLVE (peer deps do
   `@igniter-js/adapter-bullmq` vs `@igniter-js/core`) → instalei com
   `--legacy-peer-deps`. Isso alterou o `package-lock.json` local; a alteração
   ficou **fora dos commits** (fora do escopo dos 3 fixes). Alguns postinstall
   (sharp, esbuild, unrs-resolver, prisma) ficaram pendentes pela política
   `allow-scripts` do npm; rodei `npx prisma generate` manualmente (necessário
   para o `tsc --noEmit` do pre-commit husky passar — baseline, não relacionado
   aos fixes).
