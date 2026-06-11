---
Criado: 2026-06-11
Atualizado: 2026-06-11
Revisar em: a cada onda concluída
Relacionados:
  - specs/integration-builder/spec.md
  - specs/integration-builder/plan.md
---

# Tasks — Integration Builder

Quebra do plano técnico em 60 tarefas atômicas, organizadas por FASE do template e tagueadas por **Onda de entrega** (plan §10). Execução via `/execute` segue o "Mapa de execução por onda" no final.

## Checklist de cobertura (verificado na quebra)

- [x] **Todos os FRs com tarefas:** FR-01 (T22/T25/T37) · FR-02 (T26/T27/T39) · FR-03 (T22/T39) · FR-04 (T13/T16/T37) · FR-05 (T13/T35/T38/T40) · FR-06 (T14/T17/T18) · FR-07 (T18/T20/T36) · FR-08 (T20/T45/T56) · FR-09 (T18) · FR-10 (T31/T36) · FR-11 (T13/T30/T55) · FR-12 (T01/T14/T18)
- [x] **Critérios de aceitação da spec §8 com testes:** unit T42–T52 + E2E T53–T56 + sweep T60 (não-vazamento NFR-01)
- [x] **Nenhuma tarefa edita `igniter.client.ts` / `igniter.schema.ts`** (auto-gerados) — rotas novas entram via composição em `builder.controller.ts` (T19)
- [x] **Aprovações marcadas:** T01 + T02 (⚠️ schema Prisma + migration — aprovar ANTES da Onda 1, plan §9)
- [x] **Cascade de docs do CLAUDE.md como tarefas da Onda 1:** T03 (ERD + tabela Prisma do CLAUDE.md), T57 (.env.example + SECRETS.md), T58 (tool-engineer.skill.md)
- [x] **Itens de atenção do plan §9 sinalizados:** T12/T29 (edição additiva de `rate-limit.service.ts`, módulo quente do runtime), T15/T47 (role-gate novo nas rotas builder), T20/T58 (fix webhookSecret v1 — **JÁ aplicado em código**, custom-tools.ts:179-188; resta doc + teste)
- [x] **Limites de tamanho (docs/FILE_SIZE_GUIDELINES.md):** routes ≤400 (split T16/T17/T18 prevê extração), services ≤500, componentes ≤300 (tool-call-card.tsx hoje em 283 linhas)

---

## Fase 1 — Dados

- [ ] **T01 [Onda 1]** — ⚠️ APROVAÇÃO — Schema Prisma: `CustomIntegration` + `IntegrationTestCall` + enum
  - **Arquivo**: prisma/schema.prisma
  - **Depende de**: — (aprovação humana do schema ANTES de iniciar)
  - **O que fazer**: Adicionar enum `IntegrationStatus` (`draft|validated|active|paused|error`), modelo `CustomIntegration` (tabela `custom_integrations`, campos exatos do plan §2 — destaque: `agentToolId String? @unique` FK **SetNull**, `credentials Json?`, `deletedAt`) e `IntegrationTestCall` (tabela `integration_test_calls`); relações inversas additivas em `AgentTool` (schema.prisma:1792), `BuilderProject` e `Organization`; índices `@@index([organizationId, status])`, `@@index([builderProjectId])`, `@@index([organizationId, deletedAt])`, `@@index([integrationId, createdAt])`.
  - **Critério**: `npx prisma validate` OK; `npx prisma format` sem diff inesperado; nenhum campo novo em tabelas existentes (só relações inversas).
  - **Paralelo**: sequencial

- [ ] **T02 [Onda 1]** — ⚠️ APROVAÇÃO — Migration `custom_integrations`
  - **Arquivo**: prisma/migrations/<timestamp>_custom_integrations/migration.sql
  - **Depende de**: T01
  - **O que fazer**: Gerar migration via `npx prisma migrate dev --name custom_integrations` — `CREATE TYPE "IntegrationStatus"` + 2 `CREATE TABLE` + índices. **Sem `ALTER` em tabela existente** (FKs vivem nas tabelas novas) e sem backfill (plan §2).
  - **Critério**: `npx prisma migrate status` limpo no dev; inspecionar o SQL gerado: zero `ALTER TABLE` em tabelas pré-existentes.
  - **Paralelo**: sequencial

- [ ] **T03 [Onda 1]** — Cascade de docs: ERD + tabela Prisma do CLAUDE.md
  - **Arquivo**: docs/ERD.md (+ CLAUDE.md)
  - **Depende de**: T01
  - **O que fazer**: Documentar `CustomIntegration`/`IntegrationTestCall`/`IntegrationStatus` no ERD (com a semântica do `agentToolId` nullable + hard-delete do AgentTool no DELETE) e adicionar linha na tabela "Modelos Prisma Relevantes" do CLAUDE.md. Atualizar frontmatter doc-freshness.
  - **Critério**: ambos os arquivos citam os 2 modelos novos; regra crítica do CLAUDE.md satisfeita antes do commit da Onda 1.
  - **Paralelo**: [P]

## Fase 2 — Validação (Zod)

- [ ] **T04 [Onda 1]** — `integration.schemas.ts`: Zod de requestSpec, credentialFields e bodies de rota
  - **Arquivo**: src/server/ai-module/builder/integrations/integration.schemas.ts
  - **Depende de**: T01
  - **O que fazer**: Schema FECHADO de `requestSpec` (método, URL, auth `bearer|header|query|basic`, headers/body templates com placeholders `{{credentials.*}}`/`{{params.*}}`, mapeamento de parâmetros, `testPayload` com marcação de teste — plan §2/§5); `credentialFields` (`key, label, whereToGet, formatRegex, placeholder`); bodies Zod das mutations (create/credentials/etc.); tipos TS derivados.
  - **Critério**: `npx tsc --noEmit` verde; schema rejeita requestSpec com chave desconhecida (strict).
  - **Paralelo**: [P] (com T02)

- [ ] **T05 [Onda 1]** — Tipos Zod de template de integração
  - **Arquivo**: src/server/ai-module/builder/integrations/templates/integration-template.types.ts
  - **Depende de**: T04
  - **O que fazer**: Schema `IntegrationTemplate` (slug, displayName, descrição leiga, requestSpec, credentialFields com passo-a-passo pt-BR, triggerDescription default) validável por Zod, reusando os schemas de T04.
  - **Critério**: `npx tsc --noEmit` verde.
  - **Paralelo**: sequencial

- [ ] **T06 [Onda 1]** — Campo additivo `integration` no builderState
  - **Arquivo**: src/server/ai-module/builder/cards/builder-state.ts
  - **Depende de**: —
  - **O que fazer**: Adicionar ao `builderStateSchema` (builder-state.ts:267) o campo opcional `integration: { proposed?: {...}, draftIntegrationId?: string }` espelhando o idiom `sourceIngestion.proposed`. **Sem nova ConfirmationKey, sem novo passo em QUAYER_STEPS** (plan §2). Credenciais JAMAIS neste estado.
  - **Critério**: `npm run test:unit -- builder-state` verde (testes existentes intactos) + tsc.
  - **Paralelo**: [P]

- [ ] **T07 [Onda 2]** — cardKeys novos no registry de card-submit
  - **Arquivo**: src/server/ai-module/builder/cards/card-submit.schemas.ts
  - **Depende de**: T04
  - **O que fazer**: Adicionar `integration_proposal` (`{ action: 'confirm' }` apenas) e `integration_credentials` (valores campo-a-campo) ao `CARD_PAYLOAD_SCHEMAS` (card-submit.schemas.ts:296) — a união discriminada e o enum derivam automaticamente (padrão do header do arquivo).
  - **Critério**: tsc verde; testes existentes de card-submit continuam verdes.
  - **Paralelo**: sequencial

## Fase 3 — Backend

### Onda 1 — fundação + caminho template

- [ ] **T08 [Onda 1]** — Feature flag `integration-builder`
  - **Arquivo**: src/lib/feature-flags/integration-builder.ts (+ .test.ts colocated)
  - **Depende de**: —
  - **O que fazer**: Espelhar `src/lib/feature-flags/auth-v3.ts`: `NEXT_PUBLIC_INTEGRATION_BUILDER` com `off|percentage:N|on` + cookie override para QA. Incluir o teste unit (espelho do de auth-v3: parseFlag/percentage/override).
  - **Critério**: `npm run test:unit -- integration-builder` verde.
  - **Paralelo**: [P]

- [ ] **T09 [Onda 1]** — `request-spec.ts` (módulo PURO)
  - **Arquivo**: src/server/ai-module/builder/integrations/request-spec.ts
  - **Depende de**: T04
  - **O que fazer**: Resolução de placeholders (`credentials.*`/`params.*`), helper único de máscara (últimos 4 chars), mapeamento classe-de-erro → diagnóstico leigo pt-BR (`401/403`→chave inválida+passo, `404`→endpoint, `timeout`, `schema`, `network`, `redirect`→revisar URL) e `sanitizeForLog` (único caminho de log do executor — nunca contém `credentials.*`). Templates de diagnóstico SEM interpolação de valores submetidos.
  - **Critério**: tsc verde; coberto por T42.
  - **Paralelo**: sequencial

- [ ] **T10 [Onda 1]** — Executor compartilhado `integration-executor.ts`
  - **Arquivo**: src/server/ai-module/ai-agents/tools/integration-executor.ts
  - **Depende de**: T09
  - **O que fazer**: `runIntegrationCall(spec, credentials, params, { mode: 'test'|'production' })` — único lugar que monta a request. Política própria (plan §3/§5, NÃO reusar `safeFetch`/`assertPublicHttpUrl` de text-extraction): HTTPS obrigatório revalidado por chamada; pós-DNS por chamada (equivalente runtime de `isResolvedIpSafe`, create-custom-tool.tool.ts:126 — bloqueia RFC1918/metadata/loopback); `redirect: 'manual'` sem follow (3xx → classe `redirect`); `AbortSignal.timeout`; cap de resposta como `readCapped` (custom-tools.ts:234); 1 retry inline SÓ em produção para `5xx/network/timeout`; never-throws; logs estruturados via `sanitizeForLog` (`[integration-executor]` `{integrationId, organizationId, mode, outcome, httpStatus, durationMs, attempt}`).
  - **Critério**: tsc verde; coberto por T43.
  - **Paralelo**: sequencial

- [ ] **T11 [Onda 1]** — `integration.repository.ts`
  - **Arquivo**: src/server/ai-module/builder/integrations/integration.repository.ts
  - **Depende de**: T02, T04
  - **O que fazer**: CRUD 100% org-scoped (todo `findFirst/findMany/update` filtra `organizationId`); `assertActiveIntegrationQuota` (count de 3 ativas DENTRO de transação, soft-deleted não conta); criação de draft + `AgentTool` `isActive=false` (nome snake_case, unique org como create-custom-tool.tool.ts:221); delete composto = soft delete da `CustomIntegration` + **hard delete do `AgentTool`** (SetNull preserva auditoria e libera o nome — plan §2).
  - **Critério**: tsc verde; coberto por T44.
  - **Paralelo**: [P] (com T09/T10)

- [ ] **T12 [Onda 1]** — Quota fixed-window no rate-limit (escopo `integrationTest`)
  - **Arquivo**: src/server/ai-module/ai-agents/infra/rate-limit.service.ts
  - **Depende de**: —
  - **O que fazer**: Expor função dedicada de quota **fixed-window** (idiom INCR+PEXPIRE de `checkWithIncrFallback`, rate-limit.service.ts:114) ao lado do token bucket — NÃO usar o bucket de refill contínuo (plan §5). Registrar escopo `integrationTest` 30/h/org. **Mudança additiva: buckets existentes `instance/contact/org` intocados** (módulo compartilhado quente do runtime WhatsApp — sinalizar no PR). Fail-open documentado.
  - **Critério**: `npm run test:unit -- rate-limit` — testes existentes verdes; cobertura nova em T49.
  - **Paralelo**: [P]

- [ ] **T13 [Onda 1]** — Templates RD Station + webhook genérico + registry
  - **Arquivo**: src/server/ai-module/builder/integrations/templates/ (rd-station.template.ts, generic-webhook.template.ts, index.ts)
  - **Depende de**: T05
  - **O que fazer**: Template RD Station (requestSpec real da API de conversões/leads, credentialFields com passo-a-passo pt-BR de onde obter o token, `testPayload` marcado "TESTE Quayer — pode ignorar") + template webhook genérico (FR-11, usuário informa a URL) + `index.ts` registry tipado. Versionados em código, não DB (decisão 4 da spec §9).
  - **Critério**: tsc verde; coberto por T46.
  - **Paralelo**: [P]

- [ ] **T14 [Onda 1]** — `test-call.runner.ts`
  - **Arquivo**: src/server/ai-module/builder/integrations/test-call.runner.ts
  - **Depende de**: T10, T11
  - **O que fazer**: Orquestrar o teste: decifrar credenciais (`decrypt` de src/lib/crypto.ts) somente aqui, chamar o executor em `mode: 'test'`, persistir `IntegrationTestCall` (outcome/httpStatus/durationMs, SEM payloads), transição de status (`draft→validated` em sucesso; falha permanece), gravar `AuditLog` `integration.test_run` (schema.prisma:844, metadata sem segredos). Retornar `{ outcome, diagnosis }` leigo via request-spec.ts.
  - **Critério**: tsc verde; coberto por T44/T51.
  - **Paralelo**: sequencial

- [ ] **T15 [Onda 1]** — Helper de role-gate de lifecycle
  - **Arquivo**: src/server/ai-module/builder/integrations/integration-access.ts
  - **Depende de**: —
  - **O que fazer**: `assertIntegrationLifecycleRole(user, organizationId)`: permite `user.role === UserRole.ADMIN` (global) OU membership `UserOrganization.role === OrganizationRole.MASTER` (findFirst por userId+organizationId, padrão organization.routes.ts). `MANAGER`/`USER` ficam FORA do lifecycle no MVP (plan §5 — taxonomias distintas, não existe membership "admin").
  - **Critério**: tsc verde; coberto por T47.
  - **Paralelo**: [P]

- [ ] **T16 [Onda 1]** — Rotas parte 1: list / templates / create
  - **Arquivo**: src/server/ai-module/builder/integrations/integrations.routes.ts
  - **Depende de**: T08, T11, T13
  - **O que fazer**: `GET /builder/integrations?projectId=` (status, displayName, trigger, `lastTest*`, credenciais MASCARADAS — nunca valores), `GET /builder/integrations/templates`, `POST /builder/integrations` (template ou `proposalFromState`; cria draft + AgentTool inativo). Padrão `authOrApiKeyProcedure({ required: true })` + `currentOrgId` + `loadProject` org-scoped (shape de pricing.routes.ts/credential.routes.ts). Checagem defensiva da flag (404 quando off).
  - **Critério**: tsc verde; rota list responde 200 autenticado em dev.
  - **Paralelo**: sequencial

- [ ] **T17 [Onda 1]** — Rotas parte 2: credentials / test
  - **Arquivo**: src/server/ai-module/builder/integrations/integrations.routes.ts
  - **Depende de**: T12, T14, T15, T16
  - **O que fazer**: `PATCH /:id/credentials` (valida `formatRegex` por campo, cifra com `encrypt()` campo a campo, grava, NUNCA ecoa de volta; role-gate T15) e `POST /:id/test` (runner T14; quota `integrationTest` fixed-window T12; retorna `{outcome, diagnosis}`). AuditLog `credentials_updated`/`test_run`.
  - **Critério**: tsc verde; resposta do PATCH não contém nenhum valor submetido (inspecionar shape).
  - **Paralelo**: sequencial

- [ ] **T18 [Onda 1]** — Rotas parte 3: activate / pause / resume / delete
  - **Arquivo**: src/server/ai-module/builder/integrations/integrations.routes.ts (extrair `integration-lifecycle.routes.ts` se passar de 400 linhas)
  - **Depende de**: T17
  - **O que fazer**: `POST /:id/activate` — gates server-side: `project.aiAgentId` presente (badRequest "Projeto ainda não tem agente publicado", padrão credential.routes.ts) + `status='validated'` + último teste success + `assertActiveIntegrationQuota` na MESMA transação; espelha `isActive=true` no AgentTool, compõe `triggerDescription` na `AgentTool.description` (FR-09) e garante o nome em `enabledTools` via `reconcileEnabledTools` (deploy/enabled-tools-derivation.ts). `pause`/`resume` (`isActive` + status; resume re-exige teste recente OK). `DELETE` — remove key de `enabledTools` (se `aiAgentId` existir) ANTES do delete composto do repository. AuditLog por transição (`activated|paused|resumed|deleted`). Role-gate T15 em todas.
  - **Critério**: tsc verde; coberto por T47/T48.
  - **Paralelo**: sequencial

- [ ] **T19 [Onda 1]** — Compor rotas no builder.controller.ts
  - **Arquivo**: src/server/ai-module/builder/builder.controller.ts
  - **Depende de**: T16, T17, T18
  - **O que fazer**: Spread das rotas novas no controller (que "só COMPÕE rotas"). NÃO editar igniter.client.ts/igniter.schema.ts — regeneram sozinhos no dev server.
  - **Critério**: `npx tsc --noEmit` verde; `GET /api/v1/builder/integrations/templates` responde em dev.
  - **Paralelo**: sequencial

- [ ] **T20 [Onda 1]** — Branch do `getCustomTools` (mudança explícita de query)
  - **Arquivo**: src/server/ai-module/ai-agents/tools/custom-tools.ts
  - **Depende de**: T02, T10
  - **O que fazer**: (a) incluir `id` no select; (b) trocar filtro `webhookUrl: { not: null }` (custom-tools.ts:142) por `OR: [{ webhookUrl: { not: null } }, { customIntegration: { status: 'active', deletedAt: null } }]`; (c) rows com integração ativa delegam o `execute` ao executor T10 (decifrando credenciais por chamada); rows v1 seguem o caminho webhook. **Nota:** o fix do `webhookSecret` decifrado JÁ está aplicado (custom-tools.ts:179-188) — apenas preservar e cobrir por teste (T45). Falha em produção: `{ success:false, userFacingHint }` (contrato "NEVER throws") + writeback fail-open `status='error'` + `lastErrorCode` (refinado em T31).
  - **Critério**: `npm run test:unit -- custom-tools` verde (existentes + T45).
  - **Paralelo**: sequencial

### Onda 2 — fluxo conversacional

- [ ] **T21 [Onda 2]** — Escrita atômica de `integration.proposed`
  - **Arquivo**: src/server/ai-module/builder/integrations/integration-state-db.ts
  - **Depende de**: T06
  - **O que fazer**: `patchIntegrationStateAtomic` espelhando `patchSourceIngestionAtomic` (sources/builder-state-db.ts) — read+merge+write race-safe APENAS do subtree `integration` (proposed/draftIntegrationId). Credenciais jamais passam por aqui.
  - **Critério**: tsc verde; teste unit do merge (mesmo estilo do de builder-state-db).
  - **Paralelo**: sequencial

- [ ] **T22 [Onda 2]** — Tool `propose_integration` (caminho template)
  - **Arquivo**: src/server/ai-module/builder/tools/propose-integration.tool.ts
  - **Depende de**: T13, T21
  - **O que fazer**: Input = pedido/nome da plataforma; nesta onda resolve apenas TEMPLATE (investigador entra em T30); grava proposta em `builderState.integration.proposed` via T21 e retorna card `integration_proposal` no tool result (idiom `requiresApproval` de build-tool.ts). Proposta declara o que faz, quando usa, QUAIS dados envia (NFR-03).
  - **Critério**: tsc verde; coberto por T51 (anti-spoof) e E2E T54.
  - **Paralelo**: [P] (com T23)

- [ ] **T23 [Onda 2]** — Tool `test_integration` (fina)
  - **Arquivo**: src/server/ai-module/builder/tools/test-integration.tool.ts
  - **Depende de**: T14
  - **O que fazer**: Delegar ao `test-call.runner` e devolver `{ outcome, diagnosis }` para o chat narrar. Sem lógica própria.
  - **Critério**: tsc verde.
  - **Paralelo**: [P] (com T22)

- [ ] **T24 [Onda 2]** — Handler dedicado `apply-integration-cards.ts` + dispatch
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply-integration-cards.ts (+ branch mínimo em apply-card-submit.ts)
  - **Depende de**: T07, T14, T21
  - **O que fazer**: `integration_proposal`: lê a proposta DO ESTADO server-side (nunca do body — idiom "never trust the body"), cria draft + AgentTool via repository, grava `draftIntegrationId`. `integration_credentials`: DESVIA do patch padrão de builderState — valida formato, cifra, grava em `CustomIntegration.credentials`, dispara o teste (T14) e devolve `cardInstruction` com diagnóstico SEM interpolar valores (vira turno SSE persistido em `BuilderProjectMessage`).
  - **Critério**: tsc verde; coberto por T51 (sentinela).
  - **Paralelo**: sequencial

- [ ] **T25 [Onda 2]** — Registrar tools no toolset + prompt do meta-agente
  - **Arquivo**: src/server/ai-module/builder/tools/index.ts (+ src/server/ai-module/builder/prompts/whatsapp-agent-system-prompt.ts)
  - **Depende de**: T08, T22, T23
  - **O que fazer**: Registrar `propose_integration`/`test_integration` em `buildBuilderToolset` (tools/index.ts:48) ATRÁS da flag; atualizar o prompt para preferir `propose_integration` quando flag ON (a menção atual a `create_custom_tool` está em whatsapp-agent-system-prompt.ts:150). `create_custom_tool` v1 permanece registrado (compat).
  - **Critério**: `npm run test:unit -- whatsapp-agent-system-prompt` verde; com flag off, toolset idêntico ao atual.
  - **Paralelo**: sequencial

### Onda 3 — investigador

- [ ] **T26 [Onda 3]** — Prompt do investigador
  - **Arquivo**: src/server/ai-module/builder/sub-agents/integration-researcher/integration-researcher.prompt.ts
  - **Depende de**: —
  - **O que fazer**: Prompt de síntese JSON espelhando `niche-researcher.prompt.ts`: extrai endpoints/auth/credenciais da plataforma a partir dos snippets Tavily, exigindo `sourceUrl` por endpoint; instruções pt-BR de "onde pegar" cada credencial.
  - **Critério**: tsc verde.
  - **Paralelo**: [P]

- [ ] **T27 [Onda 3]** — Sub-agente `integration-researcher`
  - **Arquivo**: src/server/ai-module/builder/sub-agents/integration-researcher/integration-researcher.sub-agent.ts (+ index.ts)
  - **Depende de**: T26, T28
  - **O que fazer**: Fases validate → Tavily (`tavily-client.ts` canônico) → síntese via `runLLMSubAgent` (base.ts) → parse → fontes, espelhando niche-researcher. Diferença deliberada: **NÃO degrada para conhecimento-LLM** — endpoint cuja `sourceUrl` não esteja entre os snippets é DESCARTADO no pós-parse (FR-02); investigação vazia → sinaliza caminho webhook genérico (FR-11). Logs `{platformSlug, cacheHit, sourceCount, droppedEndpoints}`.
  - **Critério**: tsc verde; coberto por T52.
  - **Paralelo**: sequencial

- [ ] **T28 [Onda 3]** — Cache Redis 7d do resultado sintetizado
  - **Arquivo**: src/server/ai-module/builder/integrations/integration-research-cache.ts
  - **Depende de**: —
  - **O que fazer**: Cache fail-open keyed por slug da plataforma, TTL 7 dias (idiom de tavily-cache.ts; o cache de 1h do tavily-client continua valendo para buscas cruas). Cache hit não consome quota.
  - **Critério**: tsc verde; coberto por T52.
  - **Paralelo**: [P] (com T26)

- [ ] **T29 [Onda 3]** — Escopo `integrationResearch` 10/24h no rate-limit
  - **Arquivo**: src/server/ai-module/ai-agents/infra/rate-limit.service.ts
  - **Depende de**: T12
  - **O que fazer**: Registrar escopo `integrationResearch` 10/24h/org na função de quota fixed-window de T12 (decisão 3 da spec §9). Additivo; buckets do runtime intocados.
  - **Critério**: `npm run test:unit -- rate-limit` verde; "11º na janela é recusado" coberto em T52.
  - **Paralelo**: [P]

- [ ] **T30 [Onda 3]** — `propose_integration` cai no investigador + fallback FR-11
  - **Arquivo**: src/server/ai-module/builder/tools/propose-integration.tool.ts
  - **Depende de**: T27, T28, T29
  - **O que fazer**: Sem template → consulta cache (T28) → investigador (T27) com quota T29 (cache hit não consome); proposta investigada inclui fontes citadas; investigação vazia → propor caminho webhook genérico assistido com o MESMO gate de teste; quota estourada → mensagem leiga de recusa.
  - **Critério**: tsc verde; coberto por T52 e E2E T55.
  - **Paralelo**: sequencial

### Onda 4 — robustez de produção

- [ ] **T31 [Onda 4]** — Writeback de erro em produção refinado
  - **Arquivo**: src/server/ai-module/ai-agents/tools/custom-tools.ts (branch de integração)
  - **Depende de**: T20
  - **O que fazer**: Refinar o caminho de falha pós-retry: writeback fail-open `status='error'` + `lastErrorAt`/`lastErrorCode` na `CustomIntegration` + `userFacingHint` neutro ao lead (nunca erro técnico — FR-10/NFR-07); falha de writeback não derruba o turno.
  - **Critério**: teste unit do branch: falha 5xx persistente → outcome `{success:false}`, status vira `error`, nenhum throw.
  - **Paralelo**: sequencial

- [ ] **T32 [Onda 4]** — Allowlist E2E env-gated no guard do executor
  - **Arquivo**: src/server/ai-module/ai-agents/tools/integration-executor.ts
  - **Depende de**: T10
  - **O que fazer**: `INTEGRATION_TEST_ALLOWED_HOSTS` lida SOMENTE quando `NODE_ENV=test`/CI libera hosts do fixture no SSRF guard; em prod a var é ignorada por construção.
  - **Critério**: teste unit: com `NODE_ENV=production` + var setada, host do fixture continua bloqueado (plan §8).
  - **Paralelo**: [P]

- [ ] **T33 [Onda 4]** — Fixture HTTP simulando RD Station para E2E
  - **Arquivo**: test/e2e/fixtures/integration-fixture-server.ts
  - **Depende de**: T32
  - **O que fazer**: Servidor HTTP local do harness (fetch server-side não é interceptável pelo Playwright) com rotas que simulam 200/401/404/timeout da API RD Station; iniciado/derrubado pelos specs E2E; host registrado em `INTEGRATION_TEST_ALLOWED_HOSTS`.
  - **Critério**: spec smoke sobe o fixture e recebe 200/401 conforme a rota.
  - **Paralelo**: sequencial

## Fase 4 — Frontend

- [ ] **T34 [Onda 1]** — Hook `use-integrations.ts`
  - **Arquivo**: src/client/components/projetos/preview/tabs/advanced/use-integrations.ts
  - **Depende de**: T19
  - **O que fazer**: Hook React Query via client Igniter (idiom de `preview/tabs/overview/hooks/use-project-readiness.ts`): lista por projectId + mutations (create/credentials/test/activate/pause/resume/delete) com invalidation.
  - **Critério**: tsc verde.
  - **Paralelo**: sequencial

- [ ] **T35 [Onda 1]** — `credential-field-input.tsx` (compartilhado painel+chat)
  - **Arquivo**: src/client/components/projetos/chat/cards/integration/credential-field-input.tsx
  - **Depende de**: T04
  - **O que fazer**: Campo de credencial reusável: label, instrução "onde pegar" expandível (passo-a-passo pt-BR), validação de `formatRegex` inline, input mascarado (type password + reveal momentâneo). "use client". Usado pelo dialog do painel (T38, Onda 1) e pelo card do chat (T40, Onda 2).
  - **Critério**: tsc verde; ≤300 linhas.
  - **Paralelo**: [P]

- [ ] **T36 [Onda 1]** — `integrations-section.tsx` no AdvancedTab
  - **Arquivo**: src/client/components/projetos/preview/tabs/advanced/integrations-section.tsx (+ mount em advanced-tab.tsx)
  - **Depende de**: T34
  - **O que fazer**: Seção autocontida (recebe só `projectId` + callbacks — prop-compatível para re-hospedagem na superfície de Capacidades da jornada v2): lista com badge de estado (rascunho/validada/ativa/pausada/com erro — FR-07), ações (Testar, Pausar/Retomar, Editar credenciais, Remover com confirm), estados loading (skeleton 3 linhas)/erro (banner retry)/empty (copy + CTA). Gate pela flag (some quando off). Montar no `AdvancedTab` (tab-registry.tsx:158 já é `requiresAgent: true`).
  - **Critério**: tsc verde; ≤300 linhas; com flag off a seção não renderiza.
  - **Paralelo**: sequencial

- [ ] **T37 [Onda 1]** — Picker de templates "+ Integração"
  - **Arquivo**: src/client/components/projetos/preview/tabs/advanced/integration-template-picker.tsx
  - **Depende de**: T36
  - **O que fazer**: CTA "+ Integração" abre picker do catálogo (`listIntegrationTemplates`) OU envia mensagem pré-formatada ao chat para o fluxo conversacional; selecionar template chama `createIntegration`.
  - **Critério**: tsc verde; criar RD Station via picker gera draft visível na lista.
  - **Paralelo**: [P] (com T38)

- [ ] **T38 [Onda 1]** — Dialog de credenciais + teste no painel
  - **Arquivo**: src/client/components/projetos/preview/tabs/advanced/integration-credentials-dialog.tsx
  - **Depende de**: T35, T36
  - **O que fazer**: Dialog campo-a-campo usando `credential-field-input` (T35); submit → PATCH credentials → POST test; estados de teste (spinner com timeout visual, check verde, diagnóstico leigo + "Re-testar"). Editar = sobrescrever (valores nunca voltam do servidor).
  - **Critério**: tsc verde; fluxo manual em dev: chave inválida → diagnóstico leigo, permanece rascunho.
  - **Paralelo**: [P] (com T37)

- [ ] **T39 [Onda 2]** — `integration-proposal-card.tsx` (chat)
  - **Arquivo**: src/client/components/projetos/chat/cards/integration/integration-proposal-card.tsx
  - **Depende de**: T22
  - **O que fazer**: Card inline da proposta em linguagem leiga: o que faz, quando o agente usa, QUAIS dados envia (NFR-03), fontes citadas com link, CTA "Confirmar"/"Agora não". Submit via `onSubmitCard` existente do chat-panel/ActiveStepCard.
  - **Critério**: tsc verde; ≤300 linhas.
  - **Paralelo**: [P] (com T40)

- [ ] **T40 [Onda 2]** — `integration-credentials-card.tsx` (chat)
  - **Arquivo**: src/client/components/projetos/chat/cards/integration/integration-credentials-card.tsx
  - **Depende de**: T24, T35
  - **O que fazer**: Card campo-a-campo reutilizando `credential-field-input` (T35); estado de teste (rodando/sucesso/diagnóstico leigo + Re-testar); nunca exibe valores retornados (não há).
  - **Critério**: tsc verde; ≤300 linhas.
  - **Paralelo**: [P] (com T39)

- [ ] **T41 [Onda 2]** — Branches no dispatcher `tool-call-card.tsx` (modo 4, sem CARD_REGISTRY)
  - **Arquivo**: src/client/components/projetos/chat/tool-call-card.tsx
  - **Depende de**: T39, T40
  - **O que fazer**: 2 branches keyed por toolName (`propose_integration`/`test_integration`) delegando IMEDIATAMENTE aos componentes de `cards/integration/` (~2 linhas por card — arquivo hoje com 283 linhas, limite 300). **SEM entrada no CARD_REGISTRY** (card-registry.tsx — integração não é seção do preview_summary; reopen é pelo painel).
  - **Critério**: tsc verde; arquivo ≤300 linhas; `card-registry.tsx` sem diff.
  - **Paralelo**: sequencial

## Fase 5 — Testes

- [ ] **T42 [Onda 1]** — `request-spec.test.ts`
  - **Arquivo**: src/server/ai-module/builder/integrations/request-spec.test.ts
  - **Depende de**: T09
  - **O que fazer**: Resolução de placeholders, máscara (últimos 4), mapeamento erro→diagnóstico por classe (401/403/404/timeout/schema/network/redirect), prova de não-vazamento (nenhum output contém valor de credencial; `sanitizeForLog` nunca contém `credentials.*`).
  - **Critério**: `npm run test:unit -- request-spec` verde.
  - **Paralelo**: [P]

- [ ] **T43 [Onda 1]** — `integration-executor.test.ts`
  - **Arquivo**: src/server/ai-module/ai-agents/tools/integration-executor.test.ts
  - **Depende de**: T10
  - **O que fazer**: Fetch mockado: sucesso; 4xx sem retry; 5xx/timeout com exatamente 1 retry em produção e 0 em teste; URL http recusada; IP resolvido privado recusado POR CHAMADA; **redirect 302 (host interno OU https→http) bloqueado — outcome `redirect`, fetch chamado exatamente 1 vez**; cap de resposta; never-throws.
  - **Critério**: `npm run test:unit -- integration-executor` verde.
  - **Paralelo**: [P]

- [ ] **T44 [Onda 1]** — `integration.repository.test.ts`
  - **Arquivo**: src/server/ai-module/builder/integrations/integration.repository.test.ts
  - **Depende de**: T11
  - **O que fazer**: Quota 3 ativas (soft-deleted não conta); org-scoping; **recriação pós-delete**: delete soft-deleta a integração, hard-deleta o AgentTool, libera o nome snake_case — criar nova com o MESMO nome funciona e a linha soft-deletada permanece com `agentToolId=null`.
  - **Critério**: `npm run test:unit -- integration.repository` verde.
  - **Paralelo**: [P]

- [ ] **T45 [Onda 1]** — Extensão de `custom-tools.test.ts` (branch de exposição)
  - **Arquivo**: src/server/ai-module/ai-agents/tools/custom-tools.test.ts
  - **Depende de**: T20
  - **O que fazer**: AgentTool SEM webhookUrl COM CustomIntegration ativa É exposto ao LLM; sem webhookUrl E sem integração NÃO é; integração pausada não é; row v1 com webhookUrl segue caminho webhook com `webhookSecret` DECIFRADO no header (cobre o fix de custom-tools.ts:179-188).
  - **Critério**: `npm run test:unit -- custom-tools` verde.
  - **Paralelo**: [P]

- [ ] **T46 [Onda 1]** — `templates/index.test.ts`
  - **Arquivo**: src/server/ai-module/builder/integrations/templates/index.test.ts
  - **Depende de**: T13
  - **O que fazer**: Todo template do registry passa no Zod de `IntegrationTemplate`; RD Station tem `testPayload` marcado como teste.
  - **Critério**: `npm run test:unit -- templates` verde.
  - **Paralelo**: [P]

- [ ] **T47 [Onda 1]** — Teste de role-gate das rotas
  - **Arquivo**: src/server/ai-module/builder/integrations/integrations.routes.test.ts
  - **Depende de**: T18, T19
  - **O que fazer**: 403 para membership `MANAGER`/`USER` em activate/pause/resume/delete/credentials; 200 para `MASTER` e para `admin` global; list/estados visíveis para todos os membros. (Padrão de deploy.routes.test.ts.)
  - **Critério**: `npm run test:unit -- integrations.routes` verde.
  - **Paralelo**: [P]

- [ ] **T48 [Onda 1]** — Teste de gates do activate + writeback de enabledTools
  - **Arquivo**: src/server/ai-module/builder/integrations/integration-lifecycle.test.ts
  - **Depende de**: T18
  - **O que fazer**: Activate sem `project.aiAgentId` → badRequest; activate faz ensure via `reconcileEnabledTools`; delete faz remove; pause NÃO toca enabledTools; activate exige validated + último teste success; 4ª ativação recusada dentro da transação.
  - **Critério**: `npm run test:unit -- integration-lifecycle` verde.
  - **Paralelo**: [P]

- [ ] **T49 [Onda 1]** — Teste das quotas fixed-window
  - **Arquivo**: src/server/ai-module/ai-agents/infra/rate-limit.service.test.ts (extensão)
  - **Depende de**: T12
  - **O que fazer**: Quota fixed-window: 31º `integrationTest` na mesma hora recusado SEM refill contínuo; janela expira e libera; escopos/buckets existentes do runtime intocados (testes atuais permanecem verdes).
  - **Critério**: `npm run test:unit -- rate-limit` verde.
  - **Paralelo**: [P]

- [ ] **T50 [Onda 2]** — Extensão dos testes de card-submit.schemas
  - **Arquivo**: src/server/ai-module/builder/cards/card-submit.schemas.test.ts (extensão)
  - **Depende de**: T07
  - **O que fazer**: Payloads `integration_proposal`/`integration_credentials` aceitos na união discriminada; payload malformado rejeitado.
  - **Critério**: `npm run test:unit -- card-submit.schemas` verde.
  - **Paralelo**: [P]

- [ ] **T51 [Onda 2]** — `apply-integration-cards.test.ts` (sentinela de não-vazamento)
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply-integration-cards.test.ts
  - **Depende de**: T24
  - **O que fazer**: Proposal confirm lê do estado server-side (body forjado ignorado — nada criado fora da proposta); credentials cifra antes de gravar e NUNCA toca builderState; transições de status corretas; **fim-a-fim com `SECRET_CANARY_123`**: o sentinela NÃO aparece em builderState persistido, `cardInstruction` retornado, nem em nenhuma mensagem/ACK persistida (grep do sentinela no resultado completo — fecha o vetor `BuilderProjectMessage` JSONB).
  - **Critério**: `npm run test:unit -- apply-integration-cards` verde.
  - **Paralelo**: [P]

- [ ] **T52 [Onda 3]** — `integration-researcher.sub-agent.test.ts` + quota literal
  - **Arquivo**: src/server/ai-module/builder/sub-agents/integration-researcher/integration-researcher.sub-agent.test.ts
  - **Depende de**: T27, T29, T30
  - **O que fazer**: Espelho do niche-researcher.sub-agent.test.ts: input inválido; Tavily indisponível → resultado vazio (NUNCA endpoints de conhecimento-LLM); pós-parse descarta endpoint sem fonte correspondente; cache hit pula rede E quota; **o 11º `integrationResearch` na janela de 24h é recusado (literal, fixed-window)** com mensagem leiga.
  - **Critério**: `npm run test:unit -- integration-researcher` verde.
  - **Paralelo**: sequencial

- [ ] **T53 [Onda 4]** — E2E fluxo 1: template via painel
  - **Arquivo**: test/e2e/builder/integration-template-painel.spec.ts
  - **Depende de**: T33, T38
  - **O que fazer**: "+ Integração" → RD Station → credenciais com instruções → teste falha (chave inválida no fixture) → diagnóstico leigo + permanece rascunho → chave válida → ativa → badge "ativa" → pausar → some do agente. Fixtures de DB: org + projeto + agente publicado (reusar fixtures e2e existentes).
  - **Critério**: `npm run test:e2e -- integration-template-painel` verde local.
  - **Paralelo**: [P]

- [ ] **T54 [Onda 4]** — E2E fluxo 2: conversacional
  - **Arquivo**: test/e2e/builder/integration-conversational.spec.ts
  - **Depende de**: T33, T41
  - **O que fazer**: "quero mandar leads para o RD Station" no chat → card de proposta com fontes → confirmar → card de credenciais → teste OK → ativa, sem sair da conversa.
  - **Critério**: `npm run test:e2e -- integration-conversational` verde local.
  - **Paralelo**: [P]

- [ ] **T55 [Onda 4]** — E2E fluxo 3: webhook genérico (FR-11)
  - **Arquivo**: test/e2e/builder/integration-generic-webhook.spec.ts
  - **Depende de**: T30, T33
  - **O que fazer**: Plataforma desconhecida sem docs → caminho assistido de URL → MESMO gate de teste → ativação.
  - **Critério**: `npm run test:e2e -- integration-generic-webhook` verde local.
  - **Paralelo**: [P]

- [ ] **T56 [Onda 4]** — E2E fluxo 4: paridade playground (FR-08)
  - **Arquivo**: test/e2e/builder/integration-parity.spec.ts
  - **Depende de**: T33, T53
  - **O que fazer**: Integração ativa aparece no playground; pausada NÃO aparece (mesmo `getCustomTools` em playground e produção).
  - **Critério**: `npm run test:e2e -- integration-parity` verde local.
  - **Paralelo**: [P]

## Fase 6 — Observabilidade & polish

- [ ] **T57 [Onda 1]** — Cascade de docs: .env.example + SECRETS.md
  - **Arquivo**: .env.example (+ docs/infra/SECRETS.md)
  - **Depende de**: T08
  - **O que fazer**: Documentar `NEXT_PUBLIC_INTEGRATION_BUILDER` (flag) e `INTEGRATION_TEST_ALLOWED_HOSTS` (test-only, ignorada fora de NODE_ENV=test) nos dois arquivos, com frontmatter doc-freshness atualizado em SECRETS.md (regra crítica do CLAUDE.md: `.env.example` mudou → SECRETS.md).
  - **Critério**: ambos citam as 2 vars com nota "test-only"/rotação N/A.
  - **Paralelo**: [P]

- [ ] **T58 [Onda 1]** — Cascade de docs: contrato do X-Webhook-Secret na skill
  - **Arquivo**: src/server/ai-module/builder/skills/tool-engineer.skill.md
  - **Depende de**: —
  - **O que fazer**: Atualizar linhas 58 e 71: o header `X-Webhook-Secret` recebe o valor **DECIFRADO** (o fix já está em custom-tools.ts:179-188, com fail-open para rows legadas em claro). Sinalizar a mudança de comportamento v1 no PR (plan §8/§9). Verificar em homol/prod se existe row com `webhookSecret` antes do deploy (provável zero).
  - **Critério**: skill descreve o contrato decifrado; frontmatter atualizado.
  - **Paralelo**: [P]

- [ ] **T59 [Onda 4]** — Runbook + queries de funil
  - **Arquivo**: docs/builder/INTEGRATIONS_RUNBOOK.md
  - **Depende de**: T31
  - **O que fazer**: Documentar (com frontmatter doc-freshness): queries de funil do NFR-06 (pedidos via `builder_tool_calls`, drafts, validadas via `IntegrationTestCall.outcome='success'` distinct, ativas, falhas via `lastErrorAt`; taxa de sucesso por `templateSlug`), classes de erro e diagnósticos, procedimento de pausa/rollback (flag off), semântica do estado `error`.
  - **Critério**: queries executam no Postgres dev sem erro.
  - **Paralelo**: [P]

- [ ] **T60 [Onda 4]** — Sweep final de não-vazamento + checklist NFR-01
  - **Arquivo**: — (verificação cross-arquivo; ajustes pontuais onde achar vazamento)
  - **Depende de**: T51, T53, T54
  - **O que fazer**: Revisão de logs do executor/runner/handler (todo log passa por `sanitizeForLog`); rodar fluxo com credencial sentinela e grepar logs/DB (`builder_project_messages`, `integration_test_calls`, `audit_logs`) pelo sentinela; conferir checklist da spec §8 ("credenciais cifradas, mascaradas na UI e ausentes de logs — verificável").
  - **Critério**: grep do sentinela retorna zero ocorrências fora de `custom_integrations.credentials` (cifrado); `npm run test:all` verde.
  - **Paralelo**: sequencial

---

## Mapa de execução por onda

Sequência para o `/execute` (itens entre `{}` podem rodar em paralelo):

**Onda 1 — Fundação + caminho template pelo painel (33 tarefas)**
`T01 → T02 → {T03, T04, T06, T08, T12, T15, T58} → T05 → {T09, T11, T13} → T10 → T14 → T16 → T17 → T18 → T19 → T20 → {T34, T35} → T36 → {T37, T38} → {T42, T43, T44, T45, T46, T47, T48, T49} → T57`
*Gate de saída:* criar RD Station via painel, testar (falha → diagnóstico leigo; sucesso → validada), ativar (gates + limite 3), paridade playground/produção, pausar remove no turno seguinte, deletar libera o nome, auditoria registrada, credenciais mascaradas e ausentes de logs. Flag off = v1 intacta.

**Onda 2 — Fluxo conversacional (11 tarefas)**
`T07 → T21 → {T22, T23} → T24 → T25 → {T39, T40} → T41 → {T50, T51}`
*Gate de saída:* proposta→credenciais→teste→ativação sem sair do chat; body forjado não cria nada; sentinela ausente de estado/cardInstruction/mensagens.

**Onda 3 — Investigador (7 tarefas)**
`{T26, T28, T29} → T27 → T30 → T52`
*Gate de saída:* plataforma fora do catálogo gera proposta com fontes clicáveis; sem docs → webhook genérico com o mesmo gate; 11º pedido/24h recusado literal; pedido repetido usa cache.

**Onda 4 — Robustez + observabilidade + E2E (9 tarefas)**
`T31 → T32 → T33 → {T53, T54, T55, T56} → T59 → T60`
*Gate de saída:* critérios de aceitação da spec §8 todos passando; E2E verde no CI; checklist NFR-01 verificado.

---

## Perguntas em aberto

1. **Componente de credencial na Onda 1 (default adotado):** o plan §4 lista `credential-field-input.tsx` junto dos cards do chat (Onda 2), mas o gate de saída da Onda 1 exige entrada de credenciais pelo painel. Default adotado: T35 constrói o componente compartilhado já na Onda 1 (no path `chat/cards/integration/` previsto pelo plano) e o dialog do painel (T38) o consome; o card do chat (T40, Onda 2) reusa. Reverter = duplicar um form simples no painel.
2. **Onda da quota `integrationTest` (default adotado):** o plan §10 só cita quota na Onda 3 (research), mas o §3 marca a rota `POST /:id/test` como "rate-limited" na Onda 1. Default adotado: helper fixed-window + escopo `integrationTest` na Onda 1 (T12); escopo `integrationResearch` na Onda 3 (T29).
3. **Forma do fixture E2E (default adotado):** o plan §7 deixa "rota Next de teste OU servidor do harness". Default adotado: servidor HTTP do harness em `test/e2e/fixtures/` (T33) — zero código de teste no bundle Next.
4. **Fix do webhookSecret v1 (registro, não ambiguidade):** o plano agenda o fix para a Onda 1, mas ele JÁ está aplicado no código (custom-tools.ts:179-188, decrypt com fail-open). As tarefas foram ajustadas: T20 preserva, T45 cobre com teste, T58 atualiza a doc do contrato (única parte realmente pendente).
