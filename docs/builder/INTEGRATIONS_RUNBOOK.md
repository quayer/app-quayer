---
Criado: 2026-06-11
Atualizado: 2026-06-11
Revisar em: mudança no schema custom_integrations/integration_test_calls, no executor (integration-executor.ts) ou na taxonomia de outcome (request-spec.ts)
Relacionados:
  - prisma/schema.prisma
  - src/lib/feature-flags/integration-builder.ts
  - src/server/ai-module/builder/integrations/integration-lifecycle.routes.ts
  - src/server/ai-module/builder/integrations/test-call.runner.ts
  - src/server/ai-module/builder/integrations/request-spec.ts
  - src/server/ai-module/ai-agents/tools/integration-executor.ts
  - src/server/ai-module/ai-agents/tools/custom-tools.ts
  - src/server/ai-module/builder/tools/propose-integration.tool.ts
---

# Integration Builder — Operational Runbook

**Escopo:** Integration Builder (ferramentas HTTP personalizadas que o meta-agente
investiga/propõe e o usuário ativa). Cobre métricas de funil (NFR-06), taxonomia
de erros, procedimentos de pausa/rollback e a nota de segurança das credenciais.

**Mantenedor:** Gabriel (solo founder).

**Operação:** sem painel admin — tudo via Claude Code + Prisma/Supabase MCP + SQL
direto. As queries abaixo rodam em Postgres e são copy-pasteáveis.

**Modelos envolvidos (nomes reais — `prisma/schema.prisma`):**

| Modelo Prisma | Tabela | Colunas-chave usadas aqui |
|---|---|---|
| `CustomIntegration` | `custom_integrations` | `status` (enum `draft\|validated\|active\|paused\|error`), `templateSlug`, `lastTestAt`, `lastTestStatus`, `lastTestErrorClass`, `lastErrorAt`, `lastErrorCode`, `deletedAt`, `organizationId`, `agentToolId` |
| `IntegrationTestCall` | `integration_test_calls` | `integrationId`, `organizationId`, `outcome`, `httpStatus`, `durationMs`, `createdAt` |
| `BuilderToolCall` | `builder_tool_calls` | `toolName`, `status`, `createdAt` (sem `organizationId` — ver nota no §1) |
| `AgentTool` | `agent_tools` | `isActive` (espelha `status === 'active'` por construção) |

> **Convenção das colunas:** o schema usa nomes **camelCase** mapeados sem
> `@@map` de coluna, então no Postgres eles são **case-sensitive** e precisam de
> aspas duplas: `"organizationId"`, `"toolName"`, `"lastErrorAt"`, `"deletedAt"`.
> Sempre filtre integrações ativas/visíveis por `"deletedAt" IS NULL`
> (soft-delete sobrevive para auditoria — ver §3).

> **Validação:** todas as queries deste runbook foram executadas contra o
> Postgres local de dev (`DATABASE_URL`, via `pg`) e rodaram **sem erro** —
> usam apenas colunas/tabelas reais do schema. Tabelas vazias retornam 0/0 rows,
> o que é esperado num ambiente sem integrações criadas.

---

## 1. Funnel queries (NFR-06)

O funil do Integration Builder é: **requisição → draft → validada → ativa**, com
uma trilha lateral de **falhas**. Cada métrica abaixo é independente e
filtra por `organizationId` quando a tabela tem tenant.

> **Nota sobre `builder_tool_calls`:** essa tabela segue o padrão leve do builder
> (sem FK, sem `organizationId` próprio — ver CLAUDE.md). A contagem de
> requisições de integração é **global por toolName**; se precisar por org, faça
> o JOIN via `messageId → builder_project_messages → conversation → projeto`.
> Para o funil de funil agregado (`custom_integrations`) o `organizationId` está
> disponível direto.

Substitua `:org` por um `organizationId` real (uuid). Os exemplos usam o
placeholder literal `'00000000-0000-0000-0000-000000000000'` para colar e testar.

### 1.1 Requisições de integração (intenção do usuário)

Toda vez que o meta-agente chama `propose_integration` (após investigar e exibir
o card), grava-se um `builder_tool_calls` com `toolName = 'propose_integration'`.

```sql
-- Quantas propostas de integração foram geradas (global, todos os tenants)
SELECT count(*)::int AS integration_requests
FROM builder_tool_calls
WHERE "toolName" = 'propose_integration';
```

```sql
-- Apenas propostas que SUCEDERAM (o card foi efetivamente emitido)
SELECT count(*)::int AS proposals_succeeded
FROM builder_tool_calls
WHERE "toolName" = 'propose_integration'
  AND status = 'success';
```

### 1.2 Drafts criados

Um draft nasce quando o usuário aceita criar a integração (`status = 'draft'`).

```sql
SELECT count(*)::int AS drafts
FROM custom_integrations
WHERE "organizationId" = '00000000-0000-0000-0000-000000000000'
  AND status = 'draft'
  AND "deletedAt" IS NULL;
```

### 1.3 Validadas (passaram em pelo menos um teste com sucesso)

"Validada" = teve **pelo menos um** `IntegrationTestCall` com `outcome = 'success'`.
Use `DISTINCT` porque uma integração pode ter vários test calls.

```sql
SELECT count(DISTINCT ci.id)::int AS validated
FROM custom_integrations ci
JOIN integration_test_calls tc ON tc."integrationId" = ci.id
WHERE ci."organizationId" = '00000000-0000-0000-0000-000000000000'
  AND tc.outcome = 'success'
  AND ci."deletedAt" IS NULL;
```

> Alternativa mais barata (sem JOIN) usando o stamp materializado no próprio
> registro — `status = 'validated'` OU `lastTestStatus = 'success'`:
>
> ```sql
> SELECT count(*)::int AS validated
> FROM custom_integrations
> WHERE "organizationId" = '00000000-0000-0000-0000-000000000000'
>   AND "lastTestStatus" = 'success'
>   AND "deletedAt" IS NULL;
> ```

### 1.4 Ativas (no ar, expostas ao runtime)

```sql
SELECT count(*)::int AS active
FROM custom_integrations
WHERE "organizationId" = '00000000-0000-0000-0000-000000000000'
  AND status = 'active'
  AND "deletedAt" IS NULL;
```

### 1.5 Falhas

Uma integração é "falha" se já teve um erro de produção (`lastErrorAt` não nulo)
**ou** se está parada em estado de erro (`status = 'error'`).

```sql
SELECT count(*)::int AS failed
FROM custom_integrations
WHERE "organizationId" = '00000000-0000-0000-0000-000000000000'
  AND ("lastErrorAt" IS NOT NULL OR status = 'error')
  AND "deletedAt" IS NULL;
```

### 1.6 Funil completo em uma linha

```sql
SELECT
  (SELECT count(*) FROM builder_tool_calls
     WHERE "toolName" = 'propose_integration')        AS requests,
  count(*) FILTER (WHERE status = 'draft')             AS drafts,
  count(*) FILTER (WHERE status = 'validated')         AS validated,
  count(*) FILTER (WHERE status = 'active')            AS active,
  count(*) FILTER (WHERE status = 'paused')            AS paused,
  count(*) FILTER (WHERE status = 'error'
               OR "lastErrorAt" IS NOT NULL)           AS failed
FROM custom_integrations
WHERE "organizationId" = '00000000-0000-0000-0000-000000000000'
  AND "deletedAt" IS NULL;
```

### 1.7 Taxa de sucesso por `templateSlug`

Mostra, por template (`rd-station`, `generic-webhook`, ou `NULL` = investigada do
zero), quantos test calls tiveram sucesso sobre o total.

```sql
SELECT
  ci."templateSlug",
  count(tc.id) FILTER (WHERE tc.outcome = 'success')::int       AS successes,
  count(tc.id)::int                                             AS total,
  round(
    100.0 * count(tc.id) FILTER (WHERE tc.outcome = 'success')
    / NULLIF(count(tc.id), 0),
    1
  )                                                             AS success_rate_pct
FROM custom_integrations ci
LEFT JOIN integration_test_calls tc ON tc."integrationId" = ci.id
WHERE ci."organizationId" = '00000000-0000-0000-0000-000000000000'
  AND ci."deletedAt" IS NULL
GROUP BY ci."templateSlug"
ORDER BY total DESC;
```

### 1.8 Distribuição de outcomes dos test calls (diagnóstico de qualidade)

```sql
SELECT
  tc.outcome,
  count(*)::int                       AS n,
  round(avg(tc."durationMs"))::int    AS avg_ms
FROM integration_test_calls tc
WHERE tc."organizationId" = '00000000-0000-0000-0000-000000000000'
GROUP BY tc.outcome
ORDER BY n DESC;
```

---

## 2. Classes de erro e diagnósticos

O executor compartilhado (`integration-executor.ts` → `request-spec.ts:classifyError`)
classifica TODA chamada — teste e produção — em uma das oito classes da union
fechada `IntegrationOutcome`. O valor é gravado em:

- `integration_test_calls.outcome` (cada teste);
- `custom_integrations.lastTestStatus` (último teste — o código do outcome);
- `custom_integrations.lastTestErrorClass` (mesma classe, `NULL` em sucesso);
- `custom_integrations.lastErrorCode` (writeback de produção — ver §3).

O diagnóstico leigo (pt-BR) é uma **string estática** — NUNCA interpola valor
submetido (sem vazamento de segredo/URL/param). Precedência: sinal de transporte
(timeout/redirect/schema/network) vence o HTTP status.

| `outcome` | Disparo (sinal) | Diagnóstico leigo (estático, pt-BR) | Causa típica |
|---|---|---|---|
| `success` | HTTP 2xx **ou** `successWhen.httpStatusIn` casado | "A integração respondeu com sucesso." | Tudo certo. |
| `auth_error` | HTTP **401 / 403** | "A chave de acesso parece inválida ou expirada. Verifique se a chave foi copiada corretamente e ainda é válida." | Credencial errada, expirada, escopo insuficiente, ou copiada com espaço. **Recuperação: re-submeter a credencial e re-testar.** |
| `not_found` | HTTP **404** | "O endereço (URL) da integração não foi encontrado. Confirme se o endpoint está correto." | URL/endpoint errado no `requestSpec`, recurso removido no destino. |
| `timeout` | `AbortError`/`TimeoutError` (15s teste, 10s prod) | "A integração demorou demais para responder. Tente novamente em instantes." | Destino lento/instável. Em produção há **1 retry** automático. |
| `schema_error` | Resposta inesperada/não-parseável | "A integração respondeu em um formato inesperado. Verifique a configuração e tente novamente." | `requestSpec` legado/inválido (re-parse falhou), formato de resposta divergente. |
| `network` | Falha de transporte sem status, **ou qualquer 5xx**, ou erro genérico não classificado | "Não foi possível concluir a chamada à integração. Tente novamente em instantes." | DNS/conexão caiu, destino com 5xx. Em produção há **1 retry**. |
| `redirect` | Resposta **3xx** (redirect manual, nunca seguido) | "A chamada foi redirecionada e bloqueada por segurança. Revise a URL da integração." | URL aponta para algo que redireciona (http→https, host antigo). Corrigir a URL final. |
| `blocked` | Bloqueio da **política SSRF** do executor (não-https, ou IP privado/loopback/link-local/metadata pós-DNS, antes de qualquer fetch) | (reaproveita o template `network`: "Não foi possível concluir a chamada à integração…") | URL `http://`, host interno/privado, ou DNS-rebinding. **Por design** — não há recuperação além de usar uma URL pública https. |

> Observação: a classe interna `error` de `classifyError` (sem sinal acionável)
> é **estreitada para `network`** pelo executor (`toOutcome`), então
> `integration_test_calls.outcome` só carrega os 8 valores acima — nunca `error`
> literal. O `status = 'error'` do **registro** (§3) é uma coisa diferente: é o
> estado de vida da integração, não um outcome de chamada.

---

## 3. Procedimento de pausa / rollback

Três níveis, do mais amplo (toda a feature) ao mais cirúrgico (uma integração).

### 3.1 Desligar a feature inteira (kill-switch)

A flag `NEXT_PUBLIC_INTEGRATION_BUILDER` (`src/lib/feature-flags/integration-builder.ts`)
governa o rollout por tenant (seed = `organizationId`). Valores aceitos:
`off` | `on` | `percentage:N`.

**Para pausar o Integration Builder em produção:**

1. Setar `NEXT_PUBLIC_INTEGRATION_BUILDER=off` no `.env` do ambiente.
2. Redeploy/restart do container (é `NEXT_PUBLIC_*` → embedado no bundle, exige
   rebuild/restart, não só reload).

Efeito: `isIntegrationBuilderEnabled()` retorna `false`, e **todas** as rotas de
lifecycle (`activate`/`pause`/`resume`/`delete`) e de criação respondem
`404 "Recurso indisponível"`. As integrações **já ativas continuam funcionando no
runtime** (a flag protege as rotas do Builder, não o catálogo de tools do agente)
— para tirar do ar de fato, use 3.2/3.3.

> **Override de QA sem mexer no env:** cookie
> `integration-builder-override=on|off` tem precedência sobre a flag. Útil para
> testar uma org isolada. Não usar em prod como kill-switch.

### 3.2 Pausar UMA integração (remoção do runtime no próximo turno)

`POST /api/v1/builder/integrations/:id/pause` →
`custom_integrations.status = 'paused'` e, na MESMA transação, `agent_tools.isActive = false`.

Por que o runtime para de usar na hora: o carregador de tools custom
(`getCustomTools`/`custom-tools.ts`) só monta o `execute` de integrações onde
`AgentTool.isActive = true`. Como `status === 'active'` ⇔ `isActive = true` por
construção, **pausar tira a tool do catálogo no próximo turno do agente** —
nenhuma chamada nova é montada. O `pause` NÃO mexe no `enabledTools` do agente
(a tool fica anexada, só inativa), então o `resume` é barato.

```sql
-- Verificar o que está ativo antes de pausar (org-scoped)
SELECT id, "displayName", status, "agentToolId"
FROM custom_integrations
WHERE "organizationId" = '00000000-0000-0000-0000-000000000000'
  AND status = 'active'
  AND "deletedAt" IS NULL;
```

> Use a rota HTTP, não UPDATE manual: a rota é quem garante o espelhamento
> atômico em `agent_tools.isActive` + o `AuditLog`. Um `UPDATE` cru no
> `custom_integrations.status` deixaria a `AgentTool` dessincronizada.

**Reativar:** `POST /api/v1/builder/integrations/:id/resume` — **re-exige** um
teste recente com `lastTestStatus = 'success'`; senão retorna
`"Teste a integração com sucesso antes de reativar."` Em sucesso volta a `active`
e re-garante a tool no `enabledTools`.

### 3.3 Estado `error` (writeback de produção) e como recuperar

Quando uma chamada **de produção** (runtime do agente, não o teste) volta com
`outcome != 'success'`, o `buildIntegrationExecute` (`custom-tools.ts`) faz um
writeback **fail-open** (best-effort, nunca derruba o turno):

```text
custom_integrations.status      = 'error'
custom_integrations.lastErrorAt = now()
custom_integrations.lastErrorCode = httpStatus (string) ?? outcome
```

Semântica: `error` é um **estado de quarentena** — a integração saiu de `active`,
mas a `AgentTool` NÃO foi tocada por esse writeback (o writeback só altera o
`custom_integrations`). O `status='error'` é o sinal humano de "algo quebrou em
produção, investigue".

**Diagnosticar:**

```sql
SELECT id, "displayName", "templateSlug",
       "lastErrorAt", "lastErrorCode", "lastTestStatus"
FROM custom_integrations
WHERE "organizationId" = '00000000-0000-0000-0000-000000000000'
  AND status = 'error'
  AND "deletedAt" IS NULL
ORDER BY "lastErrorAt" DESC NULLS LAST;
```

Cruze o `lastErrorCode` com a tabela do §2 (ex.: `401`/`403` → credencial;
`404` → URL; `timeout`/`network` → destino instável).

**Recuperar:** rode um **novo teste** (`POST /api/v1/builder/integrations/:id/test`,
via tool `test_integration` no chat ou via rota). Em sucesso, o
`recordTestResult` carimba `lastTestStatus = 'success'`, zera o
`lastTestErrorClass`, e promove `draft|validated → validated` (NUNCA rebaixa
`active`/`paused`/`error` automaticamente). Depois reative com `resume` (§3.2) —
que exige justamente esse `lastTestStatus = 'success'`. Em resumo:
**re-test → resume**.

### 3.4 Remover de vez

`DELETE /api/v1/builder/integrations/:id` — tira a key do `enabledTools` (se houver
agente), faz **soft-delete** do `CustomIntegration` (`deletedAt` setado, sobrevive
para auditoria) e **hard-delete** da `AgentTool` (libera o nome do `@@unique`). Por
isso toda query operacional filtra `"deletedAt" IS NULL`.

---

## 4. Nota de segurança — credenciais

Verificável no código; invariantes load-bearing:

1. **Cifradas por valor.** Cada credencial é cifrada individualmente
   (`lib/crypto.encrypt`) e gravada em `custom_integrations.credentials` como
   `{ key: ciphertext }`. NUNCA vivem no `builderState`. A decifragem acontece em
   exatamente **dois sites** (test runner e executor de produção), por chamada,
   sem cache de plaintext, e o mapa decifrado nunca deixa o frame do chamador.

2. **Mascaradas na UI.** Leituras retornam metadata do campo + um flag
   "filled?", NUNCA o valor. Onde um segredo precisa ser exibido, usa-se
   `maskSecret()` (`request-spec.ts`), que revela no máximo os últimos 4 chars
   (`••••1234`); valores ≤4 chars viram só pontos (não vaza o comprimento).

3. **Ausentes dos logs (whitelist).** A ÚNICA forma estruturada de log do
   executor é `sanitizeForLog()` (`request-spec.ts`), um **whitelist estrito**:
   só sobrevivem `integrationId`, `organizationId`, `mode`, `outcome`,
   `httpStatus`, `durationMs`, `attempt`. Qualquer outra chave (headers, body,
   `credentials.*`, tokens) é descartada — e há um cinto-e-suspensório
   (`SECRET_KEY_RE`) que rejeita chaves que "pareçam" segredo mesmo se o
   whitelist for ampliado por engano. O `bodySnippet` da resposta é usado só para
   validação de schema e **nunca** passa pelo logger.

4. **Diagnósticos estáticos.** As strings de `classifyError` são templates fixos
   em pt-BR — nunca interpolam valor submetido, então um diagnóstico exibido ao
   usuário ou logado não pode carregar uma credencial nem texto controlado pelo
   destino.

5. **SSRF por construção.** O executor é **https-only** e roda um guard pós-DNS
   em TODOS os IPs resolvidos (anti DNS-rebinding), bloqueando privado/loopback/
   link-local/metadata, com `redirect: 'manual'` (3xx vira `redirect`/`blocked`,
   nunca seguido). Falhas viram `blocked`, sem expor o motivo exato.

**Conferência rápida (não deve retornar nada sensível):** os `AuditLog` de
`integration.test_run` / `integration.activated` / etc. carregam metadata
value-free por construção (só `outcome`/`httpStatus`/`durationMs`/`displayName`).
Nenhuma tabela do Integration Builder armazena credencial em claro.
