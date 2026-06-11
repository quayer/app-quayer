---
Criado: 2026-06-10
Atualizado: 2026-06-10
Revisar em: ao iniciar o /break desta spec, ou mudança em custom-tools.ts / card-submit.schemas.ts
Relacionados:
  - specs/integration-builder/spec.md
  - specs/jornada-builder-v2/spec.md
  - src/server/ai-module/builder/tools/create-custom-tool.tool.ts
  - src/server/ai-module/ai-agents/tools/custom-tools.ts
---

# Plano Técnico — Integration Builder

Agente investigador que transforma "quero conectar com o RD Station" em ferramenta custom validada por teste real, com credenciais guiadas e cifradas. Constrói SOBRE os quick-wins shipped (derivação de capacidades, fonte única de progresso, reopen-from-summary) — nada deles é re-planejado.

## 1. Stack & dependências

**Zero dependências npm novas.** Tudo resolve com o que existe:

| Necessidade | Solução existente (arquivo âncora) |
|---|---|
| Busca web da investigação | Tavily via `src/server/ai-module/builder/sub-agents/niche-researcher/tavily-client.ts` (client canônico, retry+timeout+cache) |
| Cache por plataforma | Idiom Redis fail-open de `src/server/ai-module/builder/services/tavily-cache.ts` |
| LLM do sub-agente | `runLLMSubAgent` em `src/server/ai-module/builder/sub-agents/base.ts` (provider/BYOK resolution prontos) |
| Criptografia de credenciais | `encrypt()/decrypt()` AES de `src/lib/crypto.ts` (mesmo padrão de OrganizationProvider e do `webhookSecret` atual) |
| SSRF guard | Write-side: `isWebhookUrlSafe` + `isResolvedIpSafe` de `create-custom-tool.tool.ts` (HTTPS-only + pós-DNS). Runtime: guard próprio do executor (ver §3/§5 — `assertPublicHttpUrl` de text-extraction.ts aceita http deliberadamente e `safeFetch` é GET-shaped, logo NÃO são reusados crus para requests autenticadas) |
| Rate limit | `src/server/ai-module/ai-agents/infra/rate-limit.service.ts` — quotas novas como contador **fixed-window** (idiom INCR+PEXPIRE de `checkWithIncrFallback`, rate-limit.service.ts:114-128), não o token bucket de refill contínuo (ver §5) |
| HTTP externo | `fetch` nativo com `AbortSignal.timeout` (como `custom-tools.ts` já faz) |
| Feature flag | Idiom `src/lib/feature-flags/auth-v3.ts` (off | percentage:N | on + cookie override) |
| Auditoria | Modelo `AuditLog` existente (prisma/schema.prisma:844) |

Sem fila nova (decisão 5 da spec §9): retry de produção é 1 retry inline no executor; a investigação roda inline no turno do meta-agente (30s budget, como o `research_niche` atual) — NÃO usa BullMQ no MVP porque o resultado precisa voltar no mesmo turno SSE.

## 2. Modelo de dados (DESCRITO — não executar; ver §9 Aprovação)

**Decisão central: novo modelo `CustomIntegration` 1:1 com `AgentTool`, em vez de estender `AgentTool`.** Razões: (a) `AgentTool` (schema.prisma:1792) é o catálogo que o runtime lê em `getCustomTools` (custom-tools.ts:135) — mantê-lo intocado preserva o runtime e o playground sem refactor; (b) lifecycle, credenciais cifradas, proveniência da investigação e diagnóstico não pertencem a um catálogo flat; (c) o espelhamento `status === 'active'` ⇄ `AgentTool.isActive` faz FR-08 valer por construção, pois `getCustomTools` já filtra `isActive: true` e relê o DB a cada turno ("pausar remove uso imediatamente" — FR-07).

**Rejeitado: guardar credenciais em `OrganizationProvider`** (schema.prisma:1281). Ele serve BYOK/calendar com unique `(org, category, provider, builderProjectId, priority)` e alimenta o picker de chaves (`builder/credential/credential.routes.ts`) — integrações arbitrárias poluiriam essa superfície e o constraint não comporta N integrações da mesma "plataforma".

### Modelo `CustomIntegration` (tabela `custom_integrations`)

- `id` uuid PK
- `organizationId` (FK Organization, Cascade) — **toda query filtra por ele**
- `builderProjectId` (FK BuilderProject, Cascade) — integração nasce no contexto de um projeto
- `agentToolId` String? `@unique` (FK AgentTool, **onDelete: SetNull**) — o registro runtime; criado junto, com `isActive=false`. **Nullable de propósito**: no DELETE da integração o `AgentTool` é **hard-deletado** (libera o nome snake_case preso pelo `@@unique([organizationId, name])` de schema.prisma:1807 — sem isso, recriar a mesma integração falharia para sempre no check de unicidade de create-custom-tool.tool.ts:221-234), e o SetNull deixa a `CustomIntegration` soft-deletada viva com `agentToolId=null`, preservando a auditoria (displayName, research, timestamps, who-did-what). Unique parcial em Postgres aceita múltiplos NULLs, então N integrações deletadas coexistem.
- `templateSlug` String? — `'rd-station' | 'generic-webhook'` ou null (investigada)
- `displayName` String — nome leigo ("Enviar leads para o RD Station")
- `status` enum `IntegrationStatus` default `draft` — `draft | validated | active | paused | error`
- `triggerDescription` String? — gatilho em linguagem natural (FR-09); na ativação é composto na `AgentTool.description`, que é exatamente o que o LLM lê para decidir quando chamar (custom-tools.ts:162)
- `requestSpec` Json — espec declarativa da chamada: método, URL, scheme de auth (`bearer | header | query | basic`), headers/body templates com placeholders `{{credentials.*}}`/`{{params.*}}`, mapeamento de parâmetros da tool, `testPayload` marcado como teste (FR-06)
- `credentialFields` Json — metadata NÃO-secreta: `[{ key, label, whereToGet (passo-a-passo pt-BR), formatRegex, placeholder }]` (FR-05)
- `credentials` Json? — APENAS valores, cada um cifrado individualmente com `encrypt()` de `src/lib/crypto.ts` (NFR-01)
- `research` Json? — snapshot da investigação (endpoints + fontes citadas) para auditoria de FR-02
- `lastTestAt` DateTime?, `lastTestStatus` String?, `lastTestErrorClass` String? — classe do erro, NUNCA payload
- `lastErrorAt` DateTime?, `lastErrorCode` String? — writeback de falha em produção (FR-10)
- `createdById` String, `validatedById` String?, `activatedById` String?, com timestamps correspondentes (FR-12)
- `deletedAt` DateTime? — soft delete (auditoria sobrevive à remoção; o `AgentTool` correspondente NÃO sobrevive — ver `agentToolId` acima)
- `createdAt`/`updatedAt`

Índices: `@@index([organizationId, status])` (lista do painel + count do limite de 3 ativas), `@@index([builderProjectId])`, `@@index([organizationId, deletedAt])`.

### Modelo `IntegrationTestCall` (tabela `integration_test_calls`)

Histórico de chamadas de teste (FR-12, sem payloads sensíveis): `id`, `integrationId` (FK Cascade), `organizationId`, `requestedById`, `outcome` (`success | auth_error | not_found | timeout | schema_error | network | redirect | blocked`), `httpStatus` Int?, `durationMs` Int, `createdAt`. Índice `@@index([integrationId, createdAt])`.

### Relações adicionadas (additivas)

`AgentTool.customIntegration CustomIntegration?` (lado oposto do FK unique, agora nullable); `BuilderProject.customIntegrations[]`; `Organization.customIntegrations[]`.

### Migration (descrita)

Uma migration: `CREATE TYPE "IntegrationStatus"`, `CREATE TABLE custom_integrations`, `CREATE TABLE integration_test_calls`, índices acima. Nenhum `ALTER` em tabela existente (FKs vivem nas tabelas novas). Sem backfill: tools custom v1 existentes continuam funcionando sem linha em `custom_integrations` (o branch novo do runtime só ativa quando a linha existe).

### Estado conversacional (Zod, sem migration)

`builderStateSchema` (`builder/cards/builder-state.ts:267`) ganha campo additivo `integration: { proposed?: {...proposta investigada/template...}, draftIntegrationId?: string }` — espelha o idiom anti-alucinação de `sourceIngestion.proposed` (proposta gravada server-side pelo tool, confirmada só pelo card). **Sem nova `ConfirmationKey` e sem novo passo em QUAYER_STEPS** (`state/next-pending-step.ts`): integração é opcional e nunca bloqueia a jornada — o step-engine e o readiness (fonte única shipped, `use-project-readiness.ts`) ficam intocados. Escrita atômica espelhando `patchSourceIngestionAtomic` (`sources/builder-state-db.ts:280`). **Credenciais JAMAIS passam pelo builderState** (JSONB de conversa não é lugar de segredo).

## 3. API Igniter

Novo submódulo `src/server/ai-module/builder/integrations/` composto em `builder.controller.ts` (que "só COMPÕE rotas" — builder.controller.ts:12), seguindo o shape de `pricing/pricing.routes.ts` e `credential/credential.routes.ts` (`authOrApiKeyProcedure({ required: true })`, `currentOrgId` obrigatório, `loadProject` org-scoped).

**`integrations.routes.ts`** (≤400 linhas; se passar, separa templates em arquivo próprio):

- `GET /builder/integrations?projectId=` (query `listIntegrations`) — lista do projeto com status, displayName, trigger, `lastTest*`, credenciais MASCARADAS (só `key` + últimos 4 chars decifrados via helper; nunca o valor)
- `GET /builder/integrations/templates` (query `listIntegrationTemplates`) — catálogo curado para o "+ Integração"
- `POST /builder/integrations` (mutation `createIntegration`) — caminho painel/template: body Zod `{ projectId, templateSlug | proposalFromState, displayName }`; cria `CustomIntegration` draft + `AgentTool` `isActive=false` (nome snake_case validado, unique org como em create-custom-tool.tool.ts:221)
- `PATCH /builder/integrations/:id/credentials` (mutation) — body com valores; valida `formatRegex` por campo, cifra com `encrypt()`, grava; nunca ecoa de volta
- `POST /builder/integrations/:id/test` (mutation `testIntegration`) — roda o test-call runner; retorna `{ outcome, diagnosis }` (diagnóstico leigo); rate-limited
- `POST /builder/integrations/:id/activate` (mutation) — gate server-side: exige **`project.aiAgentId` presente** (badRequest "Projeto ainda não tem agente publicado", mesmo padrão de credential.routes.ts:52-54 e coerente com o AdvancedTab `requiresAgent: true` de tab-registry.tsx:158 — sem isso, uma integração ativada antes do `create_agent` nunca entraria em `enabledTools`, pois o create-agent.tool.ts:132 seta `enabledTools` do zero, e ficaria "ativa" porém morta) + `status='validated'` + último teste success + **limite 3 ativas/org checado dentro de transação** (decisão 2 da spec §9); espelha `isActive=true` no AgentTool, escreve trigger na description e garante o nome em `AIAgentConfig.enabledTools` via `reconcileEnabledTools` (`deploy/enabled-tools-derivation.ts:94` — o set-merge que PRESERVA entradas custom, invariante já documentado lá). No fluxo conversacional a ordem natural já põe a ativação depois do agente existir; integração validada antes do agente fica em `validated` até o usuário ativar pós-deploy.
- `POST /builder/integrations/:id/pause` / `/resume` — `isActive=false/true` no AgentTool + status; resume re-exige teste recente OK
- `DELETE /builder/integrations/:id` — soft delete (`deletedAt`) da `CustomIntegration` + **hard delete do `AgentTool`** (FK SetNull preserva a linha de auditoria e libera o nome para recriação — ver §2) + remove a key de `enabledTools` via reconcile ANTES do delete (se `project.aiAgentId` existir; com agente ausente, não há reconcile a fazer)

**Serviços** (cada ≤500 linhas, separados por responsabilidade):
- `integration.repository.ts` — CRUD org-scoped + counts (3 ativas)
- `request-spec.ts` — PURO: resolução de placeholders, máscara, mapeamento classe-de-erro → diagnóstico pt-BR (`401/403` → "a chave parece inválida; confira o passo 2", `404` → endpoint, `timeout`, `schema`, `redirect` → "o endereço da API redirecionou a chamada; revise a URL da integração")
- `test-call.runner.ts` — orquestra: decifra credenciais, chama o executor compartilhado em modo teste, persiste `IntegrationTestCall` + transição de status, AuditLog
- `templates/` — `integration-template.types.ts` (Zod do shape), `rd-station.template.ts`, `generic-webhook.template.ts`, `index.ts` (registry tipado). **Templates versionados em código**, não DB: revisáveis em PR, tipados, sem curadoria humana/admin-UI no MVP (decisão 4 da spec §9)

**Executor compartilhado (paridade FR-08 por construção):** `src/server/ai-module/ai-agents/tools/integration-executor.ts` com `runIntegrationCall(spec, credentials, params, { mode: 'test' | 'production' })` — único lugar que monta a request real. Política de rede própria (não reusa `safeFetch` de text-extraction.ts, que é GET-shaped com headers fixos e aceita http deliberadamente):
- **HTTPS obrigatório** na URL da spec (validado na escrita por `isWebhookUrlSafe` E revalidado no executor a cada chamada);
- **Pós-DNS por chamada**: equivalente runtime de `isResolvedIpSafe` (create-custom-tool.tool.ts:126) — lookup do host imediatamente antes do fetch, bloqueando RFC1918/metadata/loopback (o check na escrita não protege contra DNS-rebinding posterior);
- **`redirect: 'manual'` e NENHUM follow**: 3xx em chamada autenticada vira classe de erro `redirect` com diagnóstico leigo — eliminando por inteiro o vetor de redirect para host interno ou https→http com credenciais (não existe "2º request");
- timeout via `AbortSignal.timeout`, cap de resposta como `readCapped` (custom-tools.ts:226), 1 retry inline só em produção para `5xx/network/timeout`.

**Branch do `getCustomTools` (mudança explícita na query):** a query atual (custom-tools.ts:135-151) EXCLUIRIA as integrações novas por construção — filtra `webhookUrl: { not: null }` (a integração não tem webhookUrl; o `requestSpec` vive em `CustomIntegration`) e o select não traz `id` (sem o qual não há join por `agentToolId`). A mudança: (a) incluir `id` no select; (b) trocar o filtro por `OR: [{ webhookUrl: { not: null } }, { customIntegration: { status: 'active', deletedAt: null } }]` (ou, equivalente, segunda query de `CustomIntegration` ativas por `agentToolId` e união em memória); (c) rows com integração ativa delegam o `execute` ao executor (decifrando credenciais por chamada); rows sem integração seguem o caminho webhook v1 — **corrigindo de passagem o bug atual em que o `webhookSecret` cifrado é enviado cru no header** (create-custom-tool.tool.ts:244 cifra; custom-tools.ts:178-179 não decifra). Falha em produção após retry: retorno estruturado `{ success:false, userFacingHint }` (o execute "NEVER throws" — contrato em custom-tools.ts:12) + writeback fail-open `status='error'` + `lastErrorCode` (FR-10).

**Sub-agente investigador:** `src/server/ai-module/builder/sub-agents/integration-researcher/` espelhando `niche-researcher.sub-agent.ts` (fases validate → Tavily → síntese LLM JSON → parse → fontes). Diferenças deliberadas: (a) **NÃO degrada para conhecimento-LLM** — endpoint cuja `sourceUrl` não esteja entre os snippets buscados é DESCARTADO no pós-parse (guardrail "nunca inventar endpoint sem fonte", FR-02); investigação vazia → caminho webhook genérico (FR-11); (b) cache do RESULTADO sintetizado em Redis keyed por slug da plataforma, TTL 7 dias, fail-open (idiom tavily-cache.ts; o cache de 1h do tavily-client continua valendo para as buscas cruas); (c) quota 10 investigações/org/dia via contador fixed-window novo em `rate-limit.service.ts` (ver §5; cache hit não consome quota).

**Tools do meta-agente** (em `builder/tools/`, registradas em `tools/index.ts` atrás da flag):
- `propose_integration.tool.ts` — input: pedido/nome da plataforma; resolve template OU chama o investigador (com quota); grava a proposta em `builderState.integration.proposed` (escrita atômica) e retorna o card `integration_proposal` no tool result (idiom `requiresApproval` de build-tool.ts)
- `test_integration.tool.ts` — fino: delega ao `test-call.runner` para o chat narrar o resultado
- `create_custom_tool` v1 permanece registrado (zero código morto, compat) — o prompt do meta-agente (`builder/prompts/whatsapp-agent-system-prompt.ts`) é atualizado para preferir `propose_integration` quando a flag está ON

**Cards (card-submit):** dois cardKeys novos no registry de `cards/card-submit.schemas.ts` (entra no `CARD_PAYLOAD_SCHEMAS` + união discriminada, padrão documentado no header do arquivo):
- `integration_proposal` — `{ action: 'confirm' }` apenas; o handler lê a proposta **do estado server-side** (nunca do body) e cria draft + AgentTool, gravando `draftIntegrationId`
- `integration_credentials` — valores campo-a-campo; o handler **desvia do caminho padrão de persistir builderState**: valida formato, cifra, grava em `CustomIntegration.credentials`, dispara o teste e devolve `cardInstruction` com o diagnóstico (o template do diagnóstico NUNCA interpola valores submetidos — `cardInstruction` vira turno SSE persistido em `BuilderProjectMessage`, ver teste de não-vazamento em §7). Branch em arquivo próprio `handlers/apply-integration-cards.ts` para não estourar o limite de `apply-card-submit.ts`

## 4. Frontend

**Rotas:** nenhuma rota nova — tudo vive no workspace `src/app/projetos/[id]/page.tsx` existente.

**Cards do chat** (client components, `src/client/components/projetos/chat/cards/integration/`):
- `integration-proposal-card.tsx` — proposta em linguagem leiga: o que faz, quando o agente usa, quais dados envia (NFR-03 LGPD), fontes citadas com link, CTA "Confirmar"/"Agora não". ≤300 linhas
- `integration-credentials-card.tsx` + `credential-field-input.tsx` — campo-a-campo com instrução "onde pegar" expandível, validação de formato inline, input mascarado (type password + reveal momentâneo), estado de teste (rodando/sucesso/diagnóstico leigo com "Re-testar")
- **Wiring — UM modo só, deliberadamente:** renderização INLINE via ToolCallCard keyed por toolName (`propose_integration`/`test_integration`) — o modo 4 do `card-registry.tsx:35` ("cards NOT in this registry at all", mesmo idiom de `agent_approval`). **SEM entrada no CARD_REGISTRY**: o registry hoje só alimenta active-step e reopen-from-summary do `preview_summary`, e integração não é seção do summary — registrar seria peso morto. Reabertura/edição pós-conversa acontece pela **IntegrationsSection do painel** (abaixo), não pelo chat. Os 2 branches novos em `tool-call-card.tsx` (295 linhas hoje, limite 300) delegam IMEDIATAMENTE aos componentes de `cards/integration/` — o dispatcher ganha ~2 linhas por card e fica dentro do limite. Submit encadeia pelo `onSubmitCard` do ActiveStepCard/chat-panel já existente

**Painel — superfície e fallback (ponto 7 da tarefa):** componente autocontido `integrations-section.tsx` (+ `use-integrations.ts` hook no idiom de `use-project-readiness.ts`) em `preview/tabs/advanced/`, montado dentro do `AdvancedTab` (tab-registry.tsx:155) **como fallback standalone** — o MVP não bloqueia na reforma da jornada v2. O componente recebe só `projectId` e callbacks, ficando prop-compatível para ser re-hospedado pela superfície de Capacidades (FR-06 da jornada-builder-v2) quando ela existir; a migração futura é mover o mount, não reescrever. Conteúdo: lista com badge de estado (rascunho/validada/ativa/pausada/com erro — FR-07), ações (Testar, Pausar/Retomar, Editar credenciais, Remover com confirm), e CTA "+ Integração" que abre o picker de templates OU envia mensagem pré-formatada ao chat para o fluxo conversacional.

**RSC vs client:** tudo client ("use client", como todo `preview/tabs/` e `chat/cards/`) — estado interativo + React Query via client Igniter. **Loading**: skeleton de lista (3 linhas). **Erro**: banner com retry (idiom dos banners de `preview/banners/`). **Empty**: ilustração + copy "Conecte seu agente às suas ferramentas" + CTA. Estados de teste no card: spinner com timeout visual, sucesso (check verde), falha (diagnóstico leigo + passo sugerido).

**Feature flag:** `src/lib/feature-flags/integration-builder.ts` espelhando `auth-v3.ts` (`NEXT_PUBLIC_INTEGRATION_BUILDER` off|percentage:N|on + cookie override p/ QA). Gates: registro das tools novas em `buildBuilderToolset` (tools/index.ts:48), seção do painel, e checagem defensiva nas rotas novas (404 quando off). **v1 (`create_custom_tool` + webhook runtime) permanece 100% funcional com flag off.**

## 5. Segurança

- **Auth/roles:** `authOrApiKeyProcedure({ required: true })` + `currentOrgId` em toda rota (padrão pricing.routes.ts:60-66). **Gate de lifecycle (activate/pause/resume/delete/credentials), regra exata:** `user.role === UserRole.ADMIN` (role GLOBAL da plataforma, `'admin'` — auth.interfaces.ts:28) **OU** membership `UserOrganization.role === OrganizationRole.MASTER` (`'MASTER'` — src/lib/auth/roles.ts:6; schema.prisma:144). **`MANAGER` e `USER` NÃO entram no MVP** (podem listar e ver estados; lifecycle é do dono — a persona "admin da org" da spec §3 mapeia para `MASTER` no código). O role da membership é obtido por `findFirst` em `UserOrganization` filtrado por `userId + organizationId` (padrão organization.routes.ts:59). Importante: NÃO existe membership "admin" — as taxonomias são distintas (global: `admin|user`; org: `MASTER|MANAGER|USER`). Gate additivo ao padrão atual das rotas builder (que não role-gateiam), justificado pela persona da spec §3; coberto por teste de rota 403 (§7).
- **Multi-tenant (NFR-02):** todo `findFirst/findMany/update` filtra `organizationId`; `agentToolId`/`builderProjectId` revalidados contra a org (padrão credential.routes.ts:60).
- **Credenciais (NFR-01):** cifradas por campo com `encrypt()` (`src/lib/crypto.ts`); decifradas apenas dentro do executor/runner no momento da chamada; helper único de máscara (últimos 4); o GET de lista nunca retorna valores; o card nunca recebe valores de volta (editar = sobrescrever); diagnósticos e `IntegrationTestCall` guardam só classe de erro/status — **um helper `sanitizeForLog` é o único caminho de log do executor**, testado para nunca conter `credentials.*`.
- **SSRF (política do executor, sem reuso cru):** write-side `isWebhookUrlSafe` (create-custom-tool.tool.ts:35, HTTPS-only, bloqueio RFC1918/metadata/loopback + pós-DNS `isResolvedIpSafe`) na criação/edição da spec. Runtime-side, o executor implementa guard próprio: (a) `assertPublicHttpUrl` de text-extraction.ts NÃO é suficiente sozinho — ele aceita http E https deliberadamente (text-extraction.ts:148-149, para FAQ legados), o que ENFRAQUECERIA o invariante em request com credenciais; o executor exige **https sempre**; (b) `safeFetch` de text-extraction.ts é GET-shaped (headers fixos UA/accept, sem method/body — text-extraction.ts:266-279) e não serve para POST autenticado; (c) o executor usa `redirect: 'manual'` e **não segue redirect nenhum** em chamada com credenciais — 3xx vira classe de erro `redirect` (elimina o vetor inteiro: não há reenvio de headers porque não há 2º request); (d) re-resolve DNS **por chamada** (equivalente runtime de `isResolvedIpSafe`) — o check só na escrita não protege contra rebinding posterior.
- **Validação:** Zod em todo body (união discriminada de card-submit + schemas de rota); `requestSpec` validado contra schema fechado (sem URL template arbitrário vindo do LLM sem passar no guard); proposta confirmada lida do estado server-side, nunca do body (anti-spoof, idiom apply-card-submit.ts:7 "never trust the body").
- **Rate limit (NFR-05):** quotas novas em `rate-limit.service.ts` como **contador fixed-window** (INCR+PEXPIRE, o idiom já existente em `checkWithIncrFallback`, rate-limit.service.ts:114-128, exposto como função dedicada de quota ao lado do bucket): `integrationResearch` 10/24h/org (decisão 3 spec §9) e `integrationTest` 30/h/org (anti-abuso contra APIs de terceiros). **NÃO usar o token bucket Lua para estas quotas**: o refill é contínuo (rate-limit.service.ts:85-89, `refillRate = maxTokens/windowMs`), o que permitiria ~20 investigações/dia e ~60 testes/h no pior caso — com fixed-window, "o 11º pedido do dia é recusado" vale literalmente. **Atenção sinalizada:** isso edita `rate-limit.service.ts`, módulo compartilhado quente do runtime WhatsApp — mudança additiva (escopo/função nova, buckets existentes intocados), coberta por teste unit e destacada no PR. Fail-open documentado (consistente com o serviço) — risco aceito, ver §8.
- **Limite 3 ativas/org:** função única `assertActiveIntegrationQuota` no repository, chamada dentro da transação do activate (rota E caminho conversacional passam pelo mesmo service).
- **CSRF:** coberto pelo double-submit global existente (rotas mutation padrão Igniter, como todas as rotas builder).
- **Payload de teste (FR-06):** `requestSpec.testPayload` com marcação explícita de teste (ex.: nome "TESTE Quayer — pode ignorar") para nunca poluir o CRM do cliente com lead real.

## 6. Observabilidade

- **Logs estruturados:** executor e runner logam `{ integrationId, organizationId, mode, outcome, httpStatus, durationMs, attempt }` via `sanitizeForLog` (prefixo `[integration-executor]`, padrão dos logs de `enabled-tools-derivation.ts:236`); investigador loga `{ platformSlug, cacheHit, sourceCount, droppedEndpoints }`.
- **Auditoria (FR-12):** linha em `AuditLog` (schema.prisma:844) para cada transição — `integration.created|credentials_updated|test_run|validated|activated|paused|resumed|deleted` com `resource='custom_integration'`, `resourceId`, `userId`, `organizationId`, `metadata` sem segredos. Histórico de testes detalhado em `IntegrationTestCall`.
- **Métricas de funil (NFR-06 / spec §2):** deriváveis por query sem infra nova — pedidos (tool calls `propose_integration` em `builder_tool_calls`), propostas (drafts criados), validadas (`IntegrationTestCall.outcome='success'` distinct), ativas (`status='active'`), falhas em produção (`lastErrorAt` + logs). Taxa de sucesso de validação por plataforma = group by `templateSlug`/plataforma em `IntegrationTestCall`.
- **Sinal ao dono (FR-10):** estado `error` visível no painel (badge) — sem sistema de notificação novo no MVP; aviso adicional fica para quando houver infra de notificação.

## 7. Testes

**Unit (Vitest, colocados `*.test.ts` ao lado, padrão do repo):**
- `request-spec.test.ts` — resolução de placeholders (credentials/params), máscara, mapeamento erro→diagnóstico leigo por classe (401/403/404/timeout/schema/network/redirect), **prova de não-vazamento** (nenhum output contém valor de credencial)
- `integration-executor.test.ts` — fetch mockado: sucesso, 4xx sem retry, 5xx/timeout com exatamente 1 retry em produção e 0 em teste, SSRF bloqueado (URL http recusada; IP resolvido privado recusado por chamada), **redirect 302 para host interno OU https→http é bloqueado** (vira outcome `redirect`, fetch chamado exatamente 1 vez — credenciais nunca aparecem num 2º request porque ele não existe), cap de resposta, never-throws
- `custom-tools` branch — **AgentTool SEM webhookUrl mas COM `CustomIntegration` ativa É exposto ao LLM; AgentTool sem webhookUrl E sem integração NÃO é** (prova da mudança de query do §3); row v1 com webhookUrl segue o caminho webhook com `webhookSecret` DECIFRADO no header
- `integration-researcher.sub-agent.test.ts` — espelho de `niche-researcher.sub-agent.test.ts`: input inválido, Tavily indisponível → resultado vazio (NUNCA endpoints de conhecimento-LLM), pós-parse descarta endpoint sem fonte correspondente, cache hit pula rede e quota
- `templates/index.test.ts` — todo template do registry passa no Zod de `IntegrationTemplate`; RD Station tem testPayload marcado como teste
- `integration.repository.test.ts` — quota 3 ativas (incluindo soft-deleted não conta), org-scoping, **recriação pós-delete**: deletar integração (soft) hard-deleta o AgentTool e libera o nome — criar nova integração com o MESMO nome snake_case funciona, e a linha soft-deletada permanece com `agentToolId=null` para auditoria
- `apply-integration-cards.test.ts` — proposal confirm lê do estado (ignora body forjado); credentials cifra antes de gravar e nunca toca builderState; transições de status corretas; **não-vazamento fim-a-fim do handler**: submeter credencial com valor sentinela (`SECRET_CANARY_123`) e assertar que o sentinela NÃO aparece em NENHUM output do handler — builderState persistido, `cardInstruction` retornado e qualquer mensagem/ACK persistida (o `cardInstruction` vira turno SSE gravado em `BuilderProjectMessage.content/toolResults` JSONB, schema.prisma:1903-1910 — um template de diagnóstico que interpolasse o valor vazaria por esse caminho; o grep do sentinela no resultado completo fecha esse vetor)
- `card-submit.schemas` — payloads novos na união (extensão dos testes existentes)
- `integrations.routes` role-gate — **403 para membership `MANAGER`/`USER` em activate/pause/resume/delete/credentials; 200 para `MASTER` e para `admin` global**
- `rate-limit` quotas — fixed-window: o 11º `integrationResearch` na mesma janela de 24h é recusado (sem refill contínuo); escopos/buckets existentes do runtime intocados
- `enabled-tools` writeback — activate faz ensure via `reconcileEnabledTools`, delete faz remove, pause NÃO toca enabledTools (já coberto o set-merge em si nos testes shipped); activate sem `project.aiAgentId` retorna badRequest
- `integration-builder` flag — espelho de `auth-v3` (parseFlag/percentage/override)

**E2E (Playwright, fluxos):**
1. **Template via painel:** "+ Integração" → RD Station → credenciais com instruções → teste falha (chave inválida) com diagnóstico leigo e permanece rascunho → chave válida → ativa → badge "ativa" → pausar → some do agente
2. **Fluxo conversacional:** "quero mandar leads para o RD Station" no chat → card de proposta com fontes → confirmar → card de credenciais → teste OK → ativa
3. **Webhook genérico (FR-11):** plataforma desconhecida sem docs → caminho assistido de URL → mesmo gate de teste
4. **Paridade (FR-08):** integração ativa aparece no playground; pausada não aparece
- **Fixtures:** fetch server-side não é interceptável pelo Playwright — sobe um fixture HTTP local (rota Next de teste OU servidor do harness) que simula respostas RD Station (200/401/404/timeout), liberado pelo SSRF guard SOMENTE via allowlist env-gated `INTEGRATION_TEST_ALLOWED_HOSTS` ativa apenas em `NODE_ENV=test`/CI (nunca em prod). Fixtures de DB: org + projeto + agente publicado (reusar fixtures e2e existentes do builder).

## 8. Riscos & alternativas

| Risco / trade-off | Mitigação / decisão |
|---|---|
| **Bug latente v1**: `webhookSecret` cifrado enviado cru (create-custom-tool.tool.ts:244 vs custom-tools.ts:178-179) — corrigir muda comportamento de webhooks v1 existentes que possam ter se adaptado ao ciphertext | Corrigir na Onda 1 com decrypt + log de aviso; verificar em prod se existe alguma row com webhookSecret antes (provável zero uso real); atualizar o contrato documentado em `builder/skills/tool-engineer.skill.md:58-71` (header X-Webhook-Secret agora recebe o valor decifrado) |
| Credenciais via card-submit poderiam vazar para o JSONB do builderState OU pelo `cardInstruction` persistido em `BuilderProjectMessage` se o diagnóstico interpolasse valores | Handler dedicado (`apply-integration-cards.ts`) que NÃO passa pelo patch de estado + templates de diagnóstico sem interpolação de valores; teste unit com sentinela cobre estado E cardInstruction E mensagens persistidas |
| LLM citar fonte real com endpoint errado (guardrail de fontes não é prova de corretude) | O gate REAL é FR-06: teste obrigatório contra a API; investigação errada morre no diagnóstico, nunca em produção |
| Race no limite de 3 ativas (duas ativações simultâneas) | Count + update na mesma transação Prisma; janela residual aceita (limite é salvaguarda, não billing) |
| Expressividade do `requestSpec` (RD Station aceita api_key em query; outros exigem OAuth) | Schema fechado cobre bearer/header/query/basic; OAuth explicitamente fora do MVP (spec §7) — entra por template depois |
| APIs cuja URL responde 3xx legítimo (executor não segue redirect com credenciais) | Classe de erro `redirect` com diagnóstico leigo orientando corrigir a URL na spec/template (apontar a URL final); trade-off aceito — seguir redirect com credenciais é o vetor SSRF que decidimos eliminar por inteiro |
| Dependência da jornada v2 para a superfície de Capacidades | Fallback em AdvancedTab desenhado para re-hospedagem (mount-move, não rewrite); risco residual: UX inferior se v2 atrasar |
| Quota/rate-limit fail-open se Redis cair; edição de `rate-limit.service.ts` toca módulo compartilhado do runtime WhatsApp | Fail-open consistente com o serviço (pior caso = custo Tavily extra, não incidente de segurança); mudança additiva (função/escopos de quota fixed-window ao lado do bucket, sem tocar os buckets `instance/contact/org`), coberta por teste e sinalizada no PR |
| E2E com allowlist de host de teste pode vazar para prod | Allowlist só lida quando `NODE_ENV=test`; teste unit do guard prova que env de prod ignora a var |
| **Alternativa rejeitada — estender `AgentTool`** com lifecycle/credenciais | Misturaria catálogo runtime com workflow de criação; cada campo novo arrisca o caminho quente de `getCustomTools`; migration em tabela viva |
| **Alternativa rejeitada — manter o AgentTool no DELETE (só isActive=false)** | Prenderia o nome snake_case para sempre no `@@unique([organizationId, name])` — recriar a mesma integração falharia; hard-delete do AgentTool + FK SetNull preserva a auditoria na `CustomIntegration` soft-deletada e libera o nome (renome com sufixo `_deleted_<ts>` foi considerado e rejeitado: deixa lixo no catálogo) |
| **Alternativa rejeitada — ensure de integrações no create_agent/deploy saga** (em vez do gate de `aiAgentId` no activate) | Mais robusta, porém amplia o blast radius da saga shipped; o gate no activate é suficiente no MVP (painel já é `requiresAgent: true` e o fluxo conversacional ordena ativação pós-agente); reavaliar se telemetria mostrar ativações frustradas |
| **Alternativa rejeitada — fila BullMQ para investigação** (idiom source-enrich.queue.ts) | Resultado precisa voltar no mesmo turno SSE do meta-agente; 30s de budget inline já é o padrão do `research_niche`; decisão 5 da spec §9 veta fila nova |
| **Alternativa rejeitada — templates em DB** | Sem curadoria humana nem admin-UI no MVP (decisão 4); código versionado é revisável e tipado |
| **Alternativa rejeitada — novo passo no QUAYER_STEPS** | Integração é opcional; tocar o step-engine/readiness shipped hoje aumentaria o blast radius sem valor de UX |

## 9. Aprovação necessária (checklist CLAUDE.md)

- [ ] **Mudança de schema Prisma** — 2 modelos novos (`CustomIntegration`, `IntegrationTestCall`), 1 enum (`IntegrationStatus`), 3 relações inversas additivas (AgentTool/BuilderProject/Organization) + migration correspondente. **Requer aprovação antes da Onda 1.**
- [ ] **Cascade de docs OBRIGATÓRIO pré-commit (regras críticas do CLAUDE.md)** — na Onda 1, junto do código:
  - `docs/ERD.md` + tabela de modelos Prisma no `CLAUDE.md` (schema mudou);
  - `.env.example` + `docs/infra/SECRETS.md` (novas env vars `NEXT_PUBLIC_INTEGRATION_BUILDER` e `INTEGRATION_TEST_ALLOWED_HOSTS`, test-only);
  - `src/server/ai-module/builder/skills/tool-engineer.skill.md:58-71` (contrato do header `X-Webhook-Secret` passa a ser o valor DECIFRADO — fix do bug v1).
- [ ] **Novas deps npm** — NENHUMA. (Sem aprovação necessária.)
- [ ] **Deleção de arquivos** — NENHUMA. (Sem aprovação necessária.)
- [ ] Itens de atenção (não bloqueantes, sinalizar no PR): correção do bug do `webhookSecret` v1 (mudança de comportamento); role-gate de lifecycle (`admin` global OU membership `MASTER` — novo padrão nas rotas builder); edição additiva de `rate-limit.service.ts` (módulo compartilhado do runtime WhatsApp).

## 10. Fases de entrega (ondas shippáveis para o /break)

**Onda 1 — Fundação + caminho template pelo painel** (ordem CLAUDE.md: schema → migration → Zod → interfaces → repository → routes → controller → frontend)
Schema+migration aprovados; Zod (`integration.schemas.ts`, template types, builderState additivo); repository; executor compartilhado (política SSRF própria: https-only, sem redirect-follow, pós-DNS por chamada; com fix do webhookSecret); test-call runner + diagnósticos; templates rd-station + generic-webhook; rotas (list/templates/create/credentials/test/activate/pause/delete, com role-gate e gate de `aiAgentId` no activate) compostas no controller; flag; **mudança de query + branch do `getCustomTools`** (select `id`, OR webhook|integração ativa); `integrations-section.tsx` no AdvancedTab; **cascade de docs do §9** (ERD, CLAUDE.md, SECRETS, tool-engineer.skill.md).
*Pronto quando:* criar RD Station via painel, testar (falha → diagnóstico leigo + rascunho; sucesso → validada), ativar (gate + limite 3 + agente publicado), agente usa no playground E produção (paridade), pausar remove no turno seguinte, deletar libera o nome para recriação, auditoria registrada, credenciais mascaradas e ausentes de logs.

**Onda 2 — Fluxo conversacional**
`propose_integration` + `test_integration` tools (flag-gated em tools/index.ts); cardKeys `integration_proposal`/`integration_credentials` no registry de card-submit + handler dedicado; cards client inline via ToolCallCard (modo 4 apenas, sem entrada no CARD_REGISTRY; branches do dispatcher delegando a `cards/integration/`); prompt do meta-agente atualizado; escrita atômica de `integration.proposed`.
*Pronto quando:* "quero mandar leads pro RD Station" no chat completa proposta→credenciais→teste→ativação sem sair da conversa; body forjado no submit não cria nada fora da proposta server-side; sentinela de credencial não aparece em estado, cardInstruction nem mensagens persistidas.

**Onda 3 — Investigador**
Sub-agente `integration-researcher` (Tavily + síntese + descarte de endpoint sem fonte); cache Redis 7d por plataforma; quota 10/dia/org (contador fixed-window novo no rate-limit, não token bucket); `propose_integration` passa a cair no investigador quando não há template; fallback assistido para webhook genérico quando investigação vazia (FR-11).
*Pronto quando:* plataforma fora do catálogo gera proposta com fontes citadas e clicáveis; sem docs utilizáveis → caminho webhook genérico com o MESMO gate; o 11º pedido na janela de 24h é recusado com mensagem leiga (literal, por fixed-window); pedido repetido usa cache (sem custo Tavily).

**Onda 4 — Robustez de produção + observabilidade + E2E**
Writeback `status='error'` + degrade neutro ao lead refinados; queries de funil documentadas; suíte E2E completa (4 fluxos + fixture server); revisão de logs (prova de não-vazamento); doc de runbook.
*Pronto quando:* todos os critérios de aceitação da spec §8 passam; E2E verde no CI; checklist de segurança (NFR-01) verificado.

---

### Arquivos críticos para a implementação
- `c:/Users/gabri/OneDrive/Documentos/Projetos/quayer-app/prisma/schema.prisma`
- `c:/Users/gabri/OneDrive/Documentos/Projetos/quayer-app/src/server/ai-module/ai-agents/tools/custom-tools.ts`
- `c:/Users/gabri/OneDrive/Documentos/Projetos/quayer-app/src/server/ai-module/builder/cards/card-submit.schemas.ts`
- `c:/Users/gabri/OneDrive/Documentos/Projetos/quayer-app/src/server/ai-module/builder/sub-agents/niche-researcher/niche-researcher.sub-agent.ts`
- `c:/Users/gabri/OneDrive/Documentos/Projetos/quayer-app/src/server/ai-module/builder/builder.controller.ts`
- `c:/Users/gabri/OneDrive/Documentos/Projetos/quayer-app/src/server/ai-module/ai-agents/infra/rate-limit.service.ts`

## Veredito do crítico

**Verdict:** `aprovado_com_ressalvas` — **8 issues incorporadas** (todas com evidência arquivo:linha), nenhuma rejeitada:

1. Query do `getCustomTools` excluiria integrações por construção (`webhookUrl: { not: null }` + select sem `id`) → mudança de query explícita no §3 + teste unit de exposição.
2. Conflito `agentToolId` não-nullable × soft delete × `@@unique(org,name)` → FK nullable com SetNull + hard-delete do AgentTool no DELETE (§2/§3) + teste de recriação.
3. Reuso cru de `assertPublicHttpUrl`/`safeFetch` enfraqueceria SSRF (http aceito, GET-shaped, sem re-resolve DNS) → política própria do executor: https-only, `redirect:'manual'` sem follow, pós-DNS por chamada (§3/§5) + teste de redirect bloqueado.
4. Token bucket de refill contínuo permitiria ~2x as quotas → contadores fixed-window (idiom `checkWithIncrFallback`) + sinalização da edição em módulo compartilhado do runtime (§5).
5. "admin|master" misturava taxonomias (decidido: gate = `admin` global OU membership `MASTER`; `MANAGER` fica fora do lifecycle no MVP) (§5) + teste 403.
6. Activate antes do agente existir deixaria integração "ativa" morta → gate `project.aiAgentId` no activate (§3); ensure via saga registrado como alternativa rejeitada (§8).
7. Cascade de docs do CLAUDE.md omitido → ERD.md, tabela Prisma do CLAUDE.md, .env.example + SECRETS.md, tool-engineer.skill.md agora obrigatórios na Onda 1 (§9/§10).
8. Wiring de cards conflatava modos 3 e 4 do card-registry → decidido modo 4 apenas (inline via ToolCallCard, sem CARD_REGISTRY; reopen pelo painel; dispatcher ≤300 linhas) (§4). Bônus da issue de testes: prova de não-vazamento estendida ao `cardInstruction`/mensagens persistidas com valor sentinela (§7).

**Confirmações do crítico (resumo):** bug do webhookSecret v1 é real (cifra na escrita, envia cru no header); decisão de modelo novo 1:1 coerente com o schema real (custom tools vivem em AgentTool); FR-07/FR-08 valem por construção (`getCustomTools` relê o DB por turno e é o MESMO no playground e produção); idioms de builderState/card-submit/reconcileEnabledTools conferidos e compatíveis; toda a infra citada na tabela de stack existe nos caminhos indicados; zero conflitos de nome (`CustomIntegration`/`IntegrationStatus`/tabelas novas); zero deps npm; ondas shippáveis com flag off mantendo v1 viva.
