---
Criado: 2026-06-11
Atualizado: 2026-06-11
Revisar em: a cada onda concluída
Relacionados:
  - specs/jornada-builder-v2/spec.md
  - specs/jornada-builder-v2/plan.md
---

# Tasks — Jornada Builder v2: "Configure por exceção"

Quebra do `plan.md` (ondas 0–7) em 76 tarefas atômicas. Quick-wins já shipped em 2026-06-10 (derivação de capacidades, `set_project_basics` ampliado, prefills, reopen-from-summary, fonte única de progresso, ativação+silêncio encadeados, agenda honesta/FR-11, nome curto/FR-04) **NÃO viram tarefas** — são dependência.

**Correções de path vs plan.md (verificadas no código em 2026-06-11):**
- `apply-card-submit.ts` está em `src/server/ai-module/builder/cards/handlers/` (hoje **960 linhas**, não 876 — ainda mais acima do máx 800 de service).
- O método de duplicação é `builderProjectRepository.duplicate` (`projects.repository.ts:557`), exposto pela action `duplicateProject` em `projects/routes/crud.routes.ts:445`.
- E2E vive em `test/e2e/` (playwright.config.ts `testDir: './test/e2e'`) — specs novas em `test/e2e/builder/`.
- Banner em `chat/handlers/build-journey-banner.ts`; playground stream do runtime em `src/server/ai-module/ai-agents/runtime/playground-stream.ts`; rota do playground do Builder em `projects/routes/playground.routes.ts`; webhook em `src/server/communication/webhooks/uazapi/resolve-connection.ts`.

## Checklist final (verificado na quebra)

- [x] **Todos os FRs com tarefas**: FR-01 (T15/T21), FR-02 (T06/T23/T39), FR-03 (T19/T38), FR-04 (shipped), FR-05 (T24/T43), FR-06/07 (T28/T44), FR-08 (T44 reusa handoff-card opt-in), FR-09 (shipped + T45), FR-10 (shipped, derivação), FR-11 (shipped), FR-12 (T15/T46), FR-13 (T29/T30), FR-14 (T52), FR-15 (T14/T34/T47), FR-16 (T32/T48), FR-17 (shipped + cards individuais mantidos em T40–T42), FR-18 (T49–T51), FR-19 (T53–T55), FR-20 (T46), FR-21 (T56/T73).
- [x] **Critérios de aceitação (spec §8) com testes**: itens 1/3 → T67; item 2 → T64; itens 4–6 → T68; item 7 → shipped (agenda honesta) + T68; itens 8/9/13 → T70; item 10 → shipped (reopen) + T67; item 11 → T49–T51 + T62; item 12 → T72; item 14 → T59/T74.
- [x] **Nenhuma tarefa edita** `igniter.client.ts` / `igniter.schema.ts` (auto-gerados).
- [x] **Aprovações marcadas (plan §9)**: T01/T02 (schema Prisma + migration ⚠️), T07 (env var nova ⚠️), T56 (deleção de arquivo ⚠️), T76 (rollout prod ⚠️). Novas deps npm: NENHUMA em nenhuma tarefa.
- [x] **Cascatas de doc viraram tarefas próprias**: T03 (ERD + tabela Prisma do CLAUDE.md), T07 (.env.example + SECRETS.md), T73 (docs/deprecated/IDENTITY_TAB.md).
- [x] **Ordem CLAUDE.md dentro de cada onda**: schema → migration → Zod → repository → routes/controller → frontend (ver Mapa de execução).
- [x] **Invariantes de regressão v1 (NFR-03)**: `next-pending-step.test.ts` e `enabled-tools-derivation.test.ts` permanecem verdes SEM edição (critérios em T12, T17, T27) + spec E2E T62.

---

## Fase 1 — Dados (Prisma + builderState)

- [ ] **T01 [Onda 0]** — Modelo Prisma `BuilderJourneyEvent` ⚠️ APROVAÇÃO (mudança de schema)
  - **Arquivo**: prisma/schema.prisma
  - **Depende de**: —
  - **O que fazer**: Novo modelo conforme plan §2.1 (padrão leve de `BuilderToolCall`): id uuid, organizationId, projectId (sem FK), journeyVersion Int, event VarChar(60), metadata Json?, createdAt; índices `@@index([organizationId, event, createdAt])` + `@@index([projectId, createdAt])`; `@@map("builder_journey_events")`. SEM unique constraint (eventos repetem).
  - **Critério**: `npx prisma validate` passa; modelo tem exatamente os 2 índices e nenhuma relation.
  - **Paralelo**: sequencial

- [ ] **T02 [Onda 0]** — Migration `builder_journey_events` ⚠️ APROVAÇÃO
  - **Arquivo**: prisma/migrations/<timestamp>_builder_journey_events/migration.sql
  - **Depende de**: T01
  - **O que fazer**: Gerar a ÚNICA migration do plano (`npx prisma migrate dev --name builder_journey_events`): 1 `CREATE TABLE` + 2 `CREATE INDEX`. Nunca `db push --accept-data-loss`.
  - **Critério**: SQL contém só CREATE TABLE + 2 índices; migration aplica limpo no Postgres de teste (`npm run test:db:up` + migrate); `npx tsc --noEmit` verde após `prisma generate`.
  - **Paralelo**: sequencial

- [ ] **T03 [Onda 0]** — Cascata de docs do schema: ERD + tabela Prisma do CLAUDE.md
  - **Arquivo**: docs/ERD.md (+ CLAUDE.md seção "Modelos Prisma Relevantes")
  - **Depende de**: T01
  - **O que fazer**: Adicionar `BuilderJourneyEvent`/`builder_journey_events` ao ERD e à tabela do CLAUDE.md (cascata obrigatória das regras críticas). Bump do frontmatter `Atualizado` no ERD.
  - **Critério**: `grep builder_journey_events docs/ERD.md CLAUDE.md` retorna match nos dois.
  - **Paralelo**: [P] (com T02)

- [ ] **T04 [Onda 0]** — `journeyVersion` no Zod do builderState
  - **Arquivo**: src/server/ai-module/builder/cards/builder-state.ts
  - **Depende de**: —
  - **O que fazer**: Adicionar `journeyVersion: z.union([z.literal(1), z.literal(2)]).default(1)` ao schema do builderState (plan §2.2 item 1 — chave de rollout POR PROJETO, sem coluna nova). Mudança 100% aditiva; `parseBuilderState` backfilla legados para 1.
  - **Critério**: testes existentes de `builder-state` verdes; `npx tsc --noEmit`; parse de JSONB legado retorna `journeyVersion: 1` (teste formal em T57).
  - **Paralelo**: [P]

- [ ] **T05 [Onda 1]** — 5 sentinels novos em `confirmationsSchema`
  - **Arquivo**: src/server/ai-module/builder/cards/builder-state.ts
  - **Depende de**: T04
  - **O que fazer**: Adicionar `businessIdentity`, `testDrive`, `knowledge`, `media`, `publishedNextSteps` (todos `.default(false)`) em `confirmationsSchema`, com doc no arquivo reforçando: resolvidos SÓ server-side via `applyConfirmation`, nunca vêm do body (plan §2.2 item 3 + §5).
  - **Critério**: `npx tsc --noEmit`; testes existentes verdes; os 5 defaults false cobertos em T61.
  - **Paralelo**: sequencial (mesmo arquivo que T04)

- [ ] **T06 [Onda 3]** — Namespace `capturedProposals` + helper `clearCapturedProposals`
  - **Arquivo**: src/server/ai-module/builder/cards/builder-state.ts
  - **Depende de**: T05
  - **O que fazer**: Adicionar namespace top-level `capturedProposals` (NÃO `proposals` — colisão de leitura com `proposal` singular existente, linhas 29-32) com shape opcional por domínio `{persona?, services?, hours?, pricing?, handoff?{mode,reason}, activation?}`, max-lengths e whitelist de domínios (plan §2.2 item 2). Exportar `clearCapturedProposals(state, domain)` que remove a chave do domínio por spread — o `deepMerge` de `patchBuilderState` NUNCA deleta chaves; proibido confiar no patch para limpar.
  - **Critério**: `clearCapturedProposals` remove só o domínio dado (teste T65); `deepMerge` intocado; `npx tsc --noEmit`.
  - **Paralelo**: sequencial (mesmo arquivo)

## Fase 2 — Validação (flag + env)

- [ ] **T07 [Onda 0]** — Env `BUILDER_JOURNEY_V2` + cascata SECRETS ⚠️ APROVAÇÃO (env var nova — plan §9)
  - **Arquivo**: .env.example (+ docs/infra/SECRETS.md)
  - **Depende de**: —
  - **O que fazer**: Documentar `BUILDER_JOURNEY_V2=off` (valores `off | on | percentage:N`) no .env.example com comentário do cookie de override `builder-v2-override`; atualizar docs/infra/SECRETS.md (cascata obrigatória `.env.example` → SECRETS.md do CLAUDE.md).
  - **Critério**: `grep BUILDER_JOURNEY_V2 .env.example docs/infra/SECRETS.md` retorna match nos dois; frontmatter de SECRETS.md com `Atualizado` bumpado.
  - **Paralelo**: [P]

- [ ] **T08 [Onda 0]** — Feature flag `builder-v2.ts`
  - **Arquivo**: src/lib/feature-flags/builder-v2.ts
  - **Depende de**: —
  - **O que fazer**: Espelhar o idiom de `src/lib/feature-flags/auth-v3.ts`: env `off | on | percentage:N` + cookie override `builder-v2-override` + hash SHA-256 estável. **Seed do percentage = `organizationId`** (coorte estável por org — plan §1).
  - **Critério**: unit T58 verde; `npx tsc --noEmit`; zero deps npm novas.
  - **Paralelo**: [P]

## Fase 3 — Backend

### Onda 0 — Fundações dark

- [ ] **T09 [Onda 0]** — Serviço `trackJourneyEvent` (funil NFR-04)
  - **Arquivo**: src/server/services/journey-events.ts
  - **Depende de**: T02
  - **O que fazer**: `trackJourneyEvent({ organizationId, projectId, journeyVersion, event, metadata? })` fire-and-forget com try/catch interno que NUNCA lança (padrão fail-open de `hasActiveCalendarConnection`). Vocabulário FECHADO em union TS (plan §6.2): `journey_started | identity_done | review_done | agent_created | test_done | test_skipped | channel_connected | published | next_steps_ack`. Metadata só com shape tipado SEM campos livres — proibido telefone/nome de contato (NFR-02/LGPD).
  - **Critério**: unit T59 (erro de DB não lança; metadata fora do contrato rejeitado em tipo); `npx tsc --noEmit`.
  - **Paralelo**: sequencial

- [ ] **T10 [Onda 0]** — Seed `journeyVersion` + `journey_started` em `createWithInitialMessage`
  - **Arquivo**: src/server/ai-module/builder/projects/projects.repository.ts
  - **Depende de**: T04, T08, T09
  - **O que fazer**: No `$transaction` de `createWithInitialMessage` (:28), gravar `journeyVersion` no builderState inicial decidido pelo flag (on/percentage por orgId → 2; off → 1) e emitir `journey_started` com a versão congelada. Logs com prefixo `[journey-v2]`.
  - **Critério**: criação com flag off grava `journeyVersion: 1` e com cookie override on grava 2; evento `journey_started` persiste em `builder_journey_events`; suíte existente verde (tudo invisível ao usuário).
  - **Paralelo**: sequencial

- [ ] **T11 [Onda 0]** — Herança de versão no `duplicate` + `journey_started`
  - **Arquivo**: src/server/ai-module/builder/projects/projects.repository.ts (método `duplicate`, :557)
  - **Depende de**: T10
  - **O que fazer**: `duplicate` cria BuilderProject SEM conversa/builderState — sem tratamento, clone de projeto v2 cairia no default 1 na criação lazy da conversa (downgrade silencioso, plan §2.2 item 1). Ler a versão do builderState da conversa do projeto-fonte e garantir que o ponto de criação lazy da conversa do clone receba a versão herdada (não o default); emitir `journey_started` na duplicação.
  - **Critério**: unit T60 — duplicar projeto v2 → conversa do clone nasce com `journeyVersion: 2`; evento emitido; duplicar v1 permanece v1.
  - **Paralelo**: sequencial

### Onda 1 — Engine v2 + leitura

- [ ] **T12 [Onda 1]** — Extrair `step-helpers.ts` compartilhado
  - **Arquivo**: src/server/ai-module/builder/state/step-helpers.ts (de next-pending-step.ts)
  - **Depende de**: —
  - **O que fazer**: Mover `confirmed` (:83) e `hasText` (:87) para o novo arquivo e exportar a interface `StepDefinition` (:56, hoje local); `next-pending-step.ts` passa a importar de lá. Proibido duplicar — é o anti-fork do risco R1.
  - **Critério**: `state/next-pending-step.test.ts` verde **SEM nenhuma edição**; `npx tsc --noEmit`.
  - **Paralelo**: [P]

- [ ] **T13 [Onda 1]** — Estender `StepId` + tipo `Readiness.journey`
  - **Arquivo**: src/server/ai-module/builder/state/readiness.types.ts
  - **Depende de**: —
  - **O que fazer**: (a) Re-grep cinto de segurança: confirmar que NÃO existe switch exaustivo sobre `StepId` (risco R3). (b) Adicionar à union (aditivo): `business_identity`, `agent_review`, `test_drive`, `whatsapp_connect`, `published_next_steps`, `knowledge`, `media`. (c) `Readiness` ganha campo opcional `journey?: { version: 2; activePhaseId: PhaseId; phases: [...] }` com `PhaseId = 'conhecer'|'revisar'|'testar'|'lancar'` (plan §3.1). Campos v1 permanecem SEMPRE populados.
  - **Critério**: re-grep documentado no PR (zero switch exaustivo); `npx tsc --noEmit` verde em todo o repo (prova de que consumidores toleram a extensão).
  - **Paralelo**: [P]

- [ ] **T14 [Onda 1]** — Sinais `hasLiveDeployment` + `hasConnectedWhatsAppInstance` no resolver
  - **Arquivo**: src/server/ai-module/builder/state/readiness-resolver.ts
  - **Depende de**: T13
  - **O que fazer**: Adicionar ao `StepEngineContext` e ao `Promise.all` (:74-97) dois counts indexados: `hasLiveDeployment` (BuilderDeployment status `live` por projectId+org) e `hasConnectedWhatsAppInstance` (Connection com organizationId + channel WHATSAPP + **status `CONNECTED`** + **projectId do projeto**). NÃO reusar `hasWhatsAppInstance` (:85-88, conta presença sem status — auto-completaria no QR gerado). O blocker `channel` v1 permanece no sinal antigo (NFR-03).
  - **Critério**: ambos org-scoped; `next-pending-step.test.ts` verde sem edição; coberto por T61 (DISCONNECTED não completa).
  - **Paralelo**: sequencial

- [ ] **T15 [Onda 1]** — Engine v2: `QUAYER_PHASES` + definições de steps
  - **Arquivo**: src/server/ai-module/builder/state/journey-v2.ts
  - **Depende de**: T05, T12, T13
  - **O que fazer**: Criar o arquivo com as 4 fases e steps do plan §3.2 — Conhecer: `objective` → `business_identity` (isDone: `confirmations.businessIdentity` OU `confirmed('source')`) → `source_ingestion` (opcional, override do slot ativo); Revisar: `agent_review` (isDone: persona && services && hours — SEM sentinel novo) → `agent_approval` → `knowledge` (opcional) → `media` (opcional); Testar: `test_drive` (gate SOFT); Lançar: `activation` → `whatsapp_connect` (isDone: `ctx.hasConnectedWhatsAppInstance`, sem sentinel) → `summary` → `published_next_steps` (terminal, surfa com `hasLiveDeployment && !confirmations.publishedNextSteps`). REUSA `computeBlockers`/`FIELD_OWNERSHIP` (exports :372/:331) e helpers de T12 — zero fork.
  - **Critério**: `npx tsc --noEmit`; nenhum import duplicando primitivos do v1 (review de PR); função pura sem IO.
  - **Paralelo**: sequencial

- [ ] **T16 [Onda 1]** — Engine v2: `nextPendingStepV2` + completeness + `isDeployReady` + payload `journey`
  - **Arquivo**: src/server/ai-module/builder/state/journey-v2.ts
  - **Depende de**: T15
  - **O que fazer**: Implementar `nextPendingStepV2(state, ctx)` retornando step ativo + montagem do payload `journey` (fases com status done/active/pending); `completenessPct` monotônico (mesma fórmula sobre os steps aplicáveis) e `isDeployReady` = required das fases 1-4 (exceto terminal) + zero blockers (mesmo contrato v1).
  - **Critério**: unit T61 verde (ordem, sinais, monotonicidade, blockers).
  - **Paralelo**: sequencial

- [ ] **T17 [Onda 1]** — Branch por versão no resolver + `journey` no getReadiness
  - **Arquivo**: src/server/ai-module/builder/state/readiness-resolver.ts
  - **Depende de**: T14, T16
  - **O que fazer**: `state.journeyVersion === 2 ? nextPendingStepV2(state, ctx) : nextPendingStep(state, ctx)`; popular `readiness.journey` apenas no branch v2. Campos v1 (`step`, `steps`, `completenessPct`, `isDeployReady`, `blockers`, `fieldOwnership`, `builderState`) SEMPRE populados nos dois branches. Log `[journey-v2]` no branch.
  - **Critério**: `next-pending-step.test.ts` verde sem edição; projeto v1 recebe resposta byte-equivalente à atual (sem campo `journey`); projeto com override v2 recebe `journey` com 4 fases.
  - **Paralelo**: sequencial

- [ ] **T18 [Onda 1]** — Banner v2-aware
  - **Arquivo**: src/server/ai-module/builder/chat/handlers/build-journey-banner.ts
  - **Depende de**: T16
  - **O que fazer**: Quando `readiness.journey` existe, o cabeçalho `# PRÓXIMO PASSO` inclui a fase ativa ("Fase 2 de 4 — Revisar") — mudança puramente aditiva no renderer puro (plan §3.5).
  - **Critério**: `build-journey-banner.test.ts` existente verde + caso novo com `journey` presente; render v1 inalterado.
  - **Paralelo**: [P]

### Onda 2 — Conhecer

- [ ] **T19 [Onda 2]** — Card `business_identity` server-side (payload + handler)
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/journey-v2.ts (novo) + cards/card-submit.schemas.ts
  - **Depende de**: T05, T09, T13
  - **O que fazer**: Registrar payload `{ cardKey, name: string(1..80), address?: string(1..300), description?: string(1..500) }` no registry per-card e criar handler em **arquivo NOVO** `handlers/apply/journey-v2.ts` (o entrypoint tem 960 linhas > máx 800 — guideline proíbe edição >30 linhas; o dispatch no switch do entrypoint fica <30 linhas): grava `identity.*` + espelha `project.name`/`builder_projects.name` (padrão transacional de `set-project-basics.tool.ts` :149-202), limpa `capturedProposals` do domínio quando T06 existir (nesta onda ainda sem o namespace — deixar hook claro), flipa `businessIdentity` via `applyConfirmation`, emite `identity_done`. Re-sanitização server-side (trims/clamps).
  - **Critério**: unit T63; exhaustiveness guard do union força o branch; `updateMany` org-scoped.
  - **Paralelo**: sequencial

- [ ] **T20 [Onda 2]** — Evento `identity_done` no accept de source
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply-card-submit.ts (accept de source, ~:796)
  - **Depende de**: T09
  - **O que fazer**: No handler que flipa `applyConfirmation(state, 'source')`, emitir `identity_done` (a fonte satisfaz a identidade — FR-03/plan §6.2). Edição pontual <30 linhas no entrypoint (permitida pelo guideline).
  - **Critério**: accept de source grava o evento; `apply-card-submit.test.ts` verde.
  - **Paralelo**: [P]

- [ ] **T21 [Onda 2]** — Chips na fase Conhecer (`journey-rules`)
  - **Arquivo**: src/server/ai-module/builder/prompts/journey-rules.ts
  - **Depende de**: —
  - **O que fazer**: Adicionar regra instruindo o meta-agente a usar `quick_reply_chips` nas perguntas de texto livre da fase Conhecer (decisão do plan §3.5: MANTER chips — schema+handler+componente já existem end-to-end).
  - **Critério**: testes existentes de prompts/banner verdes; regra presente no system prompt gerado (snapshot/assert).
  - **Paralelo**: [P]

### Onda 3 — Revisar

- [ ] **T22 [Onda 3]** — Split de `apply-card-submit.ts`: extrair `handlers/apply/{persona,services,hours}.ts`
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/persona.ts (+services.ts, hours.ts; entrypoint vira dispatch)
  - **Depende de**: —
  - **O que fazer**: Pré-requisito do guideline (960 > máx 800): mover `applyAgentPersona`/`applyServices`/`applyBusinessHours` (funções locais ~:327-417) para exports PUROS em 3 arquivos; `apply-card-submit.ts` fica com switch/dispatch + helpers transversais (plan §3.3).
  - **Critério**: `apply-card-submit.test.ts` verde sem mudança de comportamento; entrypoint abaixo de 800 linhas; `npx tsc --noEmit`.
  - **Paralelo**: sequencial (antes de T24)

- [ ] **T23 [Onda 3]** — Tool `propose_field_values`
  - **Arquivo**: src/server/ai-module/builder/tools/propose-field-values.tool.ts (+ registro em tools/index.ts)
  - **Depende de**: T06
  - **O que fazer**: Irmã da `set_project_basics` (mesmo `$transaction` read-modify-write org-scoped), grava SÓ `capturedProposals.*` (zod com max-lengths por campo + whitelist de domínios — LLM nunca grava shape arbitrário). Description: "use quando o usuário mencionar horários/serviços/preços/transferência em texto livre — a proposta aparece prefillada no card para CONFIRMAÇÃO; nunca confirme por ele". NUNCA flipa sentinel.
  - **Critério**: unit cobrindo whitelist + atomicidade; `BuilderToolCall` loga a invocação (automático); `npx tsc --noEmit`.
  - **Paralelo**: sequencial

- [ ] **T24 [Onda 3]** — Card composto `agent_review` server-side (payload + handler)
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/journey-v2.ts + cards/card-submit.schemas.ts
  - **Depende de**: T06, T19, T22
  - **O que fazer**: Payload `{ cardKey, persona, offered, notOffered, hours, disclosure?: {mode, customText?} }` (shapes dos cards individuais). Handler compõe os exports puros de `apply/{persona,services,hours}.ts` num ÚNICO write (1 `updateMany` org-scoped) flipando `persona`+`services`+`hours`, limpa `capturedProposals.{persona,services,hours}` via `clearCapturedProposals` (clear EXPLÍCITO), aplica `disclosure` opcional no MESMO handler via `normalizeIdentityCard`+`mergeIdentityCardIntoMetadata` de `@/lib/agent-identity-card` sobre `BuilderProject.metadata.identityCard` (1 POST real, sem segundo request ao PATCH identity). Emite `review_done`.
  - **Critério**: unit T66 — exatamente 3 sentinels flipados em 1 write; clear explícito; disclosure no metadata; default de horários NÃO vive no handler (vive no componente).
  - **Paralelo**: sequencial

- [ ] **T25 [Onda 3]** — `create_agent`: disclosure no prompt + evento `agent_created`
  - **Arquivo**: src/server/ai-module/builder/tools/create-agent.tool.ts
  - **Depende de**: T24
  - **O que fazer**: Ao materializar o systemPrompt, aplicar `injectDisclosureIntoPrompt(metadata.identityCard)` (hoje só em `identity.routes.ts:102-114` `if (project.aiAgentId)` — no v2 o disclosure é decidido ANTES do agente existir; plan §4.5). Emitir `trackJourneyEvent('agent_created')`. Sem mudança quando `identityCard` ausente.
  - **Critério**: agente criado após agent_review com disclosure tem o texto injetado no systemPrompt; sem identityCard → prompt idêntico ao atual; evento gravado.
  - **Paralelo**: sequencial

- [ ] **T26 [Onda 3]** — Proposta de handoff por nicho regulado
  - **Arquivo**: src/server/ai-module/builder/tools/research-niche.tool.ts
  - **Depende de**: T06
  - **O que fazer**: Quando o nicho pesquisado é regulado (advocacia/saúde — decisão 1 da spec §9), gravar `capturedProposals.handoff = { mode, reason }` com a justificativa da proposta (plan §2.2 item 2). NUNCA flipa o sentinel `handoff`.
  - **Critério**: unit — nicho regulado popula proposta com reason; nicho comum não grava nada; sentinel intocado.
  - **Paralelo**: [P]

### Onda 4 — Capacidades

- [ ] **T27 [Onda 4]** — Extração client-safe `enabled-tools-derivation.pure.ts`
  - **Arquivo**: src/server/ai-module/builder/deploy/enabled-tools-derivation.pure.ts
  - **Depende de**: —
  - **O que fazer**: Mover `derive{Pricing,Handoff,Calendar}ToolChanges` + `reconcileEnabledTools` para arquivo dependency-free (sem import de `database`/Prisma); re-exportar do arquivo original — imports existentes intactos (plan §4.4).
  - **Critério**: `enabled-tools-derivation.test.ts` verde **SEM edição**; o `.pure.ts` não importa nada de `src/server/services/database`.
  - **Paralelo**: [P]

- [ ] **T28 [Onda 4]** — Query `getCapabilities`
  - **Arquivo**: src/server/ai-module/builder/capabilities/capabilities.routes.ts (+ registro em builder.controller.ts)
  - **Depende de**: —
  - **O que fazer**: `GET /builder/projects/:id/capabilities` sob `authOrApiKeyProcedure({ required: true })`, org-scoped: `{ customTools (AgentTool type CUSTOM org-scoped: id/name/description/isActive), mediaImagesCount, calendarConnected (reusa hasActiveCalendarConnection), knowledgeSourceCount }`. NENHUMA escrita (toggles derivam do builderState que o readiness já entrega — NFR-05). Compor no controller via spread (composer pattern).
  - **Critério**: rota responde 401 sem auth e 404 cross-org; `npm run test:api` (se contrato coberto) ou unit do resolver; `npx tsc --noEmit`. NÃO editar igniter.client/schema (auto-gerados pelo dev server).
  - **Paralelo**: [P]

- [ ] **T29 [Onda 4]** — Backfill RAG no `create_agent` (risco R7 / FR-13)
  - **Arquivo**: src/server/ai-module/builder/tools/create-agent.tool.ts
  - **Depende de**: T25 (mesmo arquivo)
  - **O que fazer**: Ler `project.metadata.knowledgeCollectionId` e setar `ragCollectionId`+`useRAG` no agente criado — fecha o gap do lazy `wireCollectionToProject` (`knowledge/knowledge-helpers.ts:67-86`, só roda `if (project.aiAgentId)`): no v2 a fonte é colada ANTES do agente existir.
  - **Critério**: fonte ingerida antes do create_agent → agente nasce com `ragCollectionId` setado e `useRAG: true` (unit); sem collection → comportamento atual.
  - **Paralelo**: sequencial

- [ ] **T30 [Onda 4]** — Passo `materialize_knowledge` na saga + correção de comentário stale
  - **Arquivo**: src/server/ai-module/builder/deploy/deploy-flow.orchestrator.ts (+ comentário em src/server/ai-module/ai-agents/runtime/playground-stream.ts:104-106)
  - **Depende de**: T29
  - **O que fazer**: Adicionar passo idempotente na saga que garante `ragCollectionId`+`useRAG` quando o projeto tem collection (rede DUPLA com o backfill de T29). Corrigir o comentário stale do `playground-stream.ts` ("o vínculo acontece na saga de deploy" — hoje falso, passa a ser verdadeiro).
  - **Critério**: re-rodar a saga não duplica nada (idempotente); deploy de projeto com fonte pré-agente publica COM RAG (gate `prepare-agent-call.ts:208` satisfeito); comentário atualizado.
  - **Paralelo**: sequencial

- [ ] **T31 [Onda 4]** — Acks `knowledge`/`media` server-side
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/journey-v2.ts + cards/card-submit.schemas.ts
  - **Depende de**: T19
  - **O que fazer**: Payloads `{ cardKey, action: 'ack' }` para `knowledge` e `media` flipando os sentinels (padrão `silenced_contacts`) — os steps também são satisfeitos por dados reais (fonte/texto, imagesCount>0) sem card obrigatório (plan §3.3).
  - **Critério**: unit — ack flipa o sentinel; dados reais completam o step sem ack (coberto em T61).
  - **Paralelo**: sequencial (mesmo arquivo que T24)

### Onda 5 — Testar + Lançar

- [ ] **T32 [Onda 5]** — Cards `test_drive` + `published_next_steps` server-side
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/journey-v2.ts + cards/card-submit.schemas.ts
  - **Depende de**: T19
  - **O que fazer**: `test_drive`: `{ cardKey, action: 'tested' | 'skip' }` flipa `testDrive` com ACK distinto para skip (LLM não promete validação — plan §3.3 item 3); emite `test_done`/`test_skipped`. `published_next_steps`: `{ cardKey, action: 'ack' }` flipa `publishedNextSteps`; emite `next_steps_ack`.
  - **Critério**: unit T69 (copy do ACK distinta por action); eventos gravados.
  - **Paralelo**: sequencial

- [ ] **T33 [Onda 5]** — Auto-flip de `testDrive` no caminho real (helper compartilhado)
  - **Arquivo**: src/server/ai-module/ai-agents/runtime/playground-stream.ts (+ helper compartilhado + src/server/ai-module/builder/tools/run-playground-test.tool.ts)
  - **Depende de**: T05, T09
  - **O que fazer**: No primeiro turno bem-sucedido do playground do projeto, write atômico FAIL-OPEN (try/catch — NUNCA quebra o stream) flipando `testDrive` se ainda false + evento `test_done`; `run-playground-test.tool.ts` flipa pelo MESMO helper (proibido duplicar). O CTA do card leva à tab Testar que usa `POST /projects/:id/playground/stream` (stateless) — por isso o flip vive aqui.
  - **Critério**: unit T69 — erro de DB no flip não quebra o stream; segundo turno não re-flipa; ambos os caminhos usam o helper único.
  - **Paralelo**: sequencial

- [ ] **T34 [Onda 5]** — Rota `POST /builder/channel/refresh-qr`
  - **Arquivo**: src/server/ai-module/builder/channel/refresh-qr.routes.ts (+ registro em builder.controller.ts)
  - **Depende de**: —
  - **O que fazer**: Rota autenticada (`authOrApiKeyProcedure({ required: true })`, body `{ connectionId }`, connection SEMPRE resolvida org-scoped) que regenera o QR de Connection EXISTENTE espelhando a lógica do `POST /api/v1/instances/share/[token]` (route.ts:69-117): novo QR na UAZAPI + renova `shareTokenExpiresAt`. NÃO cria instância nem Connection (provisioning não é idempotente — plan §3.6).
  - **Critério**: chamada repetida não cria instância nova no broker nem linha Connection; 404 para connectionId de outra org; `npx tsc --noEmit`.
  - **Paralelo**: [P]

- [ ] **T35 [Onda 5]** — Evento `channel_connected` no webhook UAZ
  - **Arquivo**: src/server/communication/webhooks/uazapi/resolve-connection.ts
  - **Depende de**: T09
  - **O que fazer**: Emitir `channel_connected` na TRANSIÇÃO para `CONNECTED` (:66-73, 156) — fire-and-forget, fail-open, sem PII no metadata.
  - **Critério**: transição → CONNECTED grava o evento uma vez; webhook nunca falha por erro de telemetria; testes do webhook verdes.
  - **Paralelo**: [P]

- [ ] **T36 [Onda 5]** — Evento `published` na saga
  - **Arquivo**: src/server/ai-module/builder/deploy/deploy-flow.orchestrator.ts
  - **Depende de**: T09
  - **O que fazer**: Emitir `published` quando o deployment vira status `live` (plan §6.2), fail-open.
  - **Critério**: deploy bem-sucedido grava o evento; falha de telemetria não falha a saga; testes da saga verdes.
  - **Paralelo**: [P]

## Fase 4 — Frontend

- [ ] **T37 [Onda 1]** — Overview renderiza fases quando `journey` presente
  - **Arquivo**: src/client/components/projetos/preview/tabs/overview/helpers/readiness-adapters.ts (+ componentes da overview tocados)
  - **Depende de**: T17
  - **O que fazer**: Quando `readiness.journey` existe, os adapters renderizam as 4 fases com seus steps (status done/active/pending); sem `journey` (v1), render atual byte-idêntico (NFR-03).
  - **Critério**: projeto com override v2 navega as 4 fases na Overview usando os cards existentes mapeados (critério da Onda 1); snapshot/render v1 inalterado.
  - **Paralelo**: sequencial

- [ ] **T38 [Onda 2]** — Componente `business-identity-card.tsx` + registry
  - **Arquivo**: src/client/components/projetos/chat/cards/business-identity-card.tsx (+ entrada em card-registry.tsx `STEP_TO_CARD`)
  - **Depende de**: T19
  - **O que fazer**: Card com prefill de `identity.*`/`project.name`/`capturedProposals` (quando existir); vazio = formulário em branco com hint (plan §4.1). Registrar `stepId: business_identity` no `STEP_TO_CARD` (:207).
  - **Critério**: ≤300 linhas; card surfa como step ativo em projeto v2 sem fonte; submit chega ao handler T19; `npm run lint`.
  - **Paralelo**: sequencial

- [ ] **T39 [Onda 3]** — Helper de precedência `prefill.ts`
  - **Arquivo**: src/client/components/projetos/chat/cards/prefill.ts
  - **Depende de**: T06
  - **O que fazer**: Helper PURO com a regra única `owned confirmado > capturedProposals.<domínio> > default` (FR-02, plan §4.2) + flag de origem para o badge "sugerido da conversa". Os `capturedProposals` chegam no `builderState` que o `ActiveStepCard` já entrega (zero fetch extra — NFR-05).
  - **Critério**: unit simples co-localizado cobrindo as 3 precedências; `npx tsc --noEmit`.
  - **Paralelo**: [P]

- [ ] **T40 [Onda 3]** — Extrair `persona-section.tsx`
  - **Arquivo**: src/client/components/projetos/chat/cards/review/persona-section.tsx (+ refactor de agent-persona-card.tsx)
  - **Depende de**: —
  - **O que fazer**: Extrair a lógica de formulário do `agent-persona-card.tsx` para seção reutilizável; o card individual passa a importá-la (zero duplicação — permanece para o reopen FR-17). Manter as 3 opções de "jeito de falar" (spec §9 pendente 5 — sem decisão, preservar comportamento atual).
  - **Critério**: card individual renderiza/submete idêntico (testes react existentes verdes); `npm run lint`.
  - **Paralelo**: [P]

- [ ] **T41 [Onda 3]** — Extrair `services-section.tsx`
  - **Arquivo**: src/client/components/projetos/chat/cards/review/services-section.tsx (+ refactor de services-offered-card.tsx)
  - **Depende de**: —
  - **O que fazer**: Mesmo padrão de T40 para o card de serviços.
  - **Critério**: idem T40.
  - **Paralelo**: [P]

- [ ] **T42 [Onda 3]** — Extrair `hours-section.tsx` + default "sempre aberto"
  - **Arquivo**: src/client/components/projetos/chat/cards/review/hours-section.tsx (+ refactor de business-hours-card.tsx)
  - **Depende de**: —
  - **O que fazer**: Mesmo padrão de T40 para horários, com prefill default "sempre aberto" (decisão 3 da spec §9 — o default vive no COMPONENTE, não no handler).
  - **Critério**: idem T40 + default aplicado quando sem dado owned/proposto.
  - **Paralelo**: [P]

- [ ] **T43 [Onda 3]** — Card composto `agent-review-card.tsx` + registry
  - **Arquivo**: src/client/components/projetos/chat/cards/agent-review-card.tsx (+ entrada em card-registry.tsx)
  - **Depende de**: T24, T39, T40, T41, T42
  - **O que fazer**: Orquestrador FINO compondo as 3 seções + seção avançada de disclosure (modos `ai_explicit`/`human_passthrough`/`custom` + aceite, migrada da IdentityTab); prefill via T39 com badge "sugerido da conversa" em valores de `capturedProposals` (owned renderiza sem badge); 1 POST único para o handler T24.
  - **Critério**: ≤300 linhas (orquestrador); 1 única confirmação obrigatória (NFR-07); badge aparece só em propostos; `npm run lint`.
  - **Paralelo**: sequencial

- [ ] **T44 [Onda 4]** — `capabilities-section.tsx` na Overview
  - **Arquivo**: src/client/components/projetos/preview/tabs/overview/components/capabilities-section.tsx
  - **Depende de**: T27, T28
  - **O que fazer**: Seção da Overview (decisão: NÃO é tab nova) com linhas: Conhecimento (SEMPRE ativo, sem toggle, link p/ tab Conhecimento — FR-07), Transferir (estado de `builderState.handoff.mode`; proposta de nicho regulado = toggle pré-ligado com badge + reason de `capturedProposals.handoff`), Preços, Agenda, Fotos (`mediaImagesCount`), Integrações (`customTools`, empty state). Usa as funções puras de T27 para mostrar o que o agente saberá fazer (sem segunda fonte de verdade).
  - **Critério**: ≤300 linhas; estados dos toggles derivam do builderState do readiness (zero fetch extra além do getCapabilities); `npm run lint`.
  - **Paralelo**: sequencial

- [ ] **T45 [Onda 4]** — Toggles abrem cards inline + submit roteado pela `submitCard` do chat
  - **Arquivo**: src/client/components/projetos/preview/tabs/overview/components/capabilities-section.tsx (+ exposição da submitCard de use-chat-stream.ts via evento `builder:submit-card` ou prop içada)
  - **Depende de**: T44
  - **O que fazer**: Ligar um toggle EXPANDE inline o card correspondente (`handoff-card`/`pricing-card`/`calendar-connect-card`) submetendo pelo MESMO endpoint card-submit, OBRIGATORIAMENTE através da `submitCard` do `use-chat-stream` (consumo ÚNICO do SSE + ACK no histórico vivo do chat — risco R2/plan §4.3). Defensivo: validar que o stream fecha limpo se o chat estiver desmontado.
  - **Critério**: ligar roleta pela Overview expõe config inline e o ACK aparece no chat aberto sem reload (asserção do E2E T68); nenhum consumidor paralelo do SSE.
  - **Paralelo**: sequencial

- [ ] **T46 [Onda 5]** — `test-drive-card.tsx` + registry
  - **Arquivo**: src/client/components/projetos/chat/cards/test-drive-card.tsx (+ card-registry.tsx)
  - **Depende de**: T32
  - **O que fazer**: CTA primário "Abrir teste" (troca para tab Testar via `onTabChange`), secundário "Já testei", escape explícito "Publicar sem testar" (decisão 2 da spec §9); disabled com MOTIVO enquanto `!agentExists` (FR-20).
  - **Critério**: ≤300 linhas; estados cobertos; submit chega ao handler T32 com action correta.
  - **Paralelo**: [P]

- [ ] **T47 [Onda 5]** — `whatsapp-connect-card.tsx` + registry
  - **Arquivo**: src/client/components/projetos/chat/cards/whatsapp-connect-card.tsx (+ card-registry.tsx)
  - **Depende de**: T14, T34
  - **O que fazer**: Estados: loading (chama o provisioning existente UMA única vez, APENAS quando o projeto não tem Connection — lookup org-scoped por projectId, plan §3.6a); QR visível + "Gerar novamente" via rota `refresh-qr` com throttle client de 30s (§3.6b); erro com retry honesto (NFR-06); conectado por autodetecção (`hasConnectedWhatsAppInstance` no readiness com polling — T51). Reusa o visual de `chat/whatsapp-qr-card.tsx` (que permanece para o tool-result inline v1).
  - **Critério**: ≤300 linhas; clicar "Gerar novamente" N vezes não cria instância nova (asserção E2E T70); card vira "conectado" sem reload quando o webhook seta CONNECTED.
  - **Paralelo**: sequencial

- [ ] **T48 [Onda 5]** — `published-next-steps-card.tsx` + registry
  - **Arquivo**: src/client/components/projetos/chat/cards/published-next-steps-card.tsx (+ card-registry.tsx)
  - **Depende de**: T32
  - **O que fazer**: FR-16: testar do celular (deep-link wa.me), ver Atividade (`onTabChange`), como pausar; ação única `ack` (informativo).
  - **Critério**: ≤300 linhas; surfa só pós-publicação (engine T15); ack remove do slot.
  - **Paralelo**: [P]

- [ ] **T49 [Onda 5]** — Unificação do readiness: workspace dono ÚNICO da query
  - **Arquivo**: src/client/components/projetos/workspace.tsx (+ preview/tab-registry.tsx `TabRenderContext`)
  - **Depende de**: T17
  - **O que fazer**: Içar a query de readiness para `workspace.tsx` (1 fetch); `PreviewPanel`/`OverviewTab` E `ChatPanel` recebem `readiness` + `refetchReadiness` por prop/context (estender `TabRenderContext`). FR-18: fonte única.
  - **Critério**: exatamente 1 request de readiness no carregamento do workspace (network assert no E2E); Overview e chat exibem o MESMO estado.
  - **Paralelo**: sequencial

- [ ] **T50 [Onda 5]** — `use-chat-stream` consome o readiness içado (remoção do `READINESS_QUERY`)
  - **Arquivo**: src/client/components/projetos/chat/use-chat-stream.ts
  - **Depende de**: T49
  - **O que fazer**: Remover o `READINESS_QUERY` interno (:78, :202-207); os triggers existentes (refetch em SSE finish e pós-card-submit) passam a chamar o `refetchReadiness` içado — comportamento preservado.
  - **Critério**: grep `READINESS_QUERY` zero matches; card pinado no chat continua atualizando após submit/SSE finish; testes react do chat verdes.
  - **Paralelo**: sequencial

- [ ] **T51 [Onda 5]** — Polling 5s condicionado ao step `whatsapp_connect`
  - **Arquivo**: src/client/components/projetos/workspace.tsx (hook unificado de readiness)
  - **Depende de**: T50
  - **O que fazer**: `refetchInterval` de 5s APENAS enquanto o step ativo é `whatsapp_connect` (senão mantém focus+turno+triggers). Com a unificação, o polling alcança o card pinado no chat — é a autodetecção do QR (plan §4.4, risco R4).
  - **Critério**: com step ativo ≠ whatsapp_connect, zero polling (network assert); com QR na tela, card detecta conexão em ≤5s no E2E T70.
  - **Paralelo**: sequencial

- [ ] **T52 [Onda 5]** — Activation prefill default "responder todas" (FR-14)
  - **Arquivo**: src/client/components/projetos/chat/cards/activation-mode-card.tsx
  - **Depende de**: —
  - **O que fazer**: Card abre com `mode='all'` pré-selecionado (ajuste opcional na fase Lançar; silenciados já encadeados via `onSubmitCard` shipped).
  - **Critério**: render default com "todas as mensagens" selecionado; testes react do card verdes.
  - **Paralelo**: [P]

- [ ] **T53 [Onda 6]** — Campo `visibleWhen` no tab-registry + filtro no painel
  - **Arquivo**: src/client/components/projetos/preview/tab-registry.tsx (+ ponto de render das tabs no preview-panel)
  - **Depende de**: T49
  - **O que fazer**: Novo campo opcional `visibleWhen?: (ctx: { project; readiness }) => boolean`; em projetos v2 (`readiness.journey` presente) tabs não-acionáveis ficam INVISÍVEIS (filtradas, não locked); em v1 o comportamento locked atual permanece intocado (NFR-03).
  - **Critério**: unit T71 — v2 filtra, v1 locked; `npx tsc --noEmit`.
  - **Paralelo**: sequencial

- [ ] **T54 [Onda 6]** — Regras de visibilidade por tab (FR-19)
  - **Arquivo**: src/client/components/projetos/preview/tab-registry.tsx
  - **Depende de**: T53
  - **O que fazer**: Aplicar `visibleWhen` por entrada: Visão geral/Conhecimento/Mídias na fase Revisar; Testar quando `agentExists`; Publicar pelo `deploy-gate.ts` compartilhado (shipped); Atividade mantém `requiresPublished`; Config/Avançado a partir de Revisar (plan §4.4).
  - **Critério**: E2E T72 — nenhuma tab visível-porém-bloqueada em v2; tabs aparecem por fase.
  - **Paralelo**: sequencial

- [ ] **T55 [Onda 6]** — Chat fullscreen na fase Conhecer
  - **Arquivo**: src/client/components/projetos/workspace.tsx
  - **Depende de**: T49
  - **O que fazer**: Renderizar só o `ChatPanel` (sem split) enquanto `readiness.journey?.activePhaseId === 'conhecer'`; split revela com transição na entrada de Revisar. Branch ESTRITAMENTE atrás de `readiness.journey !== undefined` (risco R8 — zero impacto v1).
  - **Critério**: E2E T72 — primeira tela do projeto v2 só conversa; E2E T62 — layout v1 intacto.
  - **Paralelo**: [P] (com T53/T54)

- [ ] **T56 [Onda 6]** — Remoção da IdentityTab ⚠️ APROVAÇÃO (deleção de arquivo)
  - **Arquivo**: src/client/components/projetos/preview/tabs/identity/identity-tab.tsx (DELETAR) + remoção do embed em prompt-tab.tsx (:29, :73) + entrada no tab-registry
  - **Depende de**: T24, T25
  - **O que fazer**: Deletar a superfície duplicada (FR-21) — o disclosure já vive no agent_review (T24/T43) e o `create_agent` injeta no prompt (T25). O endpoint PATCH `/builder/identity/:projectId` PERMANECE para edição pós-criação. Doc deprecated em T73.
  - **Critério**: `npx tsc --noEmit` + `grep -r IdentityTab src/` zero refs; `npm run lint`; build passa.
  - **Paralelo**: sequencial

## Fase 5 — Testes

- [ ] **T57 [Onda 0]** — Unit: `journeyVersion` default + backfill legado
  - **Arquivo**: src/server/ai-module/builder/cards/builder-state.test.ts (ou co-localizado existente)
  - **Depende de**: T04
  - **O que fazer**: `parseBuilderState` de JSONB legado retorna `journeyVersion: 1`; estado novo aceita 2; valor inválido cai no default.
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T58 [Onda 0]** — Unit: flag `builder-v2`
  - **Arquivo**: src/lib/feature-flags/builder-v2.test.ts
  - **Depende de**: T08
  - **O que fazer**: Parse on/off/percentage + override cookie + hash estável por organizationId (espelho do teste do auth-v3).
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T59 [Onda 0]** — Unit: `journey-events` nunca lança
  - **Arquivo**: src/server/services/journey-events.test.ts
  - **Depende de**: T09
  - **O que fazer**: Erro de DB não propaga (fail-open); vocabulário fechado (evento fora da union não compila — assert de tipo); metadata com chave fora do contrato rejeitado.
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T60 [Onda 0]** — Unit: `duplicate` herda v2 sem downgrade
  - **Arquivo**: src/server/ai-module/builder/projects/projects.repository.test.ts (ou co-localizado)
  - **Depende de**: T11
  - **O que fazer**: Duplicar projeto v2 → conversa do clone nasce `journeyVersion: 2` (criação lazy respeita herança); evento `journey_started` emitido; duplicar v1 → permanece 1.
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T61 [Onda 1]** — Unit: engine `journey-v2`
  - **Arquivo**: src/server/ai-module/builder/state/journey-v2.test.ts
  - **Depende de**: T16
  - **O que fazer**: Plan §7.1: ordem das fases; `business_identity` satisfeito por `confirmations.source`; `test_drive` flipado por tested E skip; `whatsapp_connect` done APENAS por `hasConnectedWhatsAppInstance` (Connection DISCONNECTED NÃO completa); `published_next_steps` surfa só com `hasLiveDeployment`; completeness monotônico; `isDeployReady` exige blockers zerados; sentinels novos default false.
  - **Critério**: `npm run test:unit` verde E `state/next-pending-step.test.ts` verde SEM edição (prova NFR-03).
  - **Paralelo**: sequencial

- [ ] **T62 [Onda 1]** — E2E: regressão v1 com flag off
  - **Arquivo**: test/e2e/builder/builder-v1-regressao.spec.ts
  - **Depende de**: T17
  - **O que fazer**: Flag off → jornada v1 completa intocada (NFR-03): sem campo `journey`, layout split desde o início, tabs locked (não filtradas). Re-rodar a cada onda subsequente.
  - **Critério**: `npm run test:e2e` (project local) verde.
  - **Paralelo**: sequencial

- [ ] **T63 [Onda 2]** — Unit: handler `business_identity`
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/journey-v2.test.ts
  - **Depende de**: T19
  - **O que fazer**: Espelha nome no projeto (transacional); flipa `businessIdentity`; sanitização (lengths/trims); `identity_done` emitido; cross-org rejeitado.
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T64 [Onda 2]** — E2E: jornada sem site
  - **Arquivo**: test/e2e/builder/builder-v2-sem-site.spec.ts
  - **Depende de**: T38, T21
  - **O que fazer**: Fixture org seedada + cookie `builder-v2-override=on`: business_identity preenchido pela conversa → agente de teste responde "onde fica?" (critério §8 item 2).
  - **Critério**: `npm run test:e2e` verde.
  - **Paralelo**: sequencial

- [ ] **T65 [Onda 3]** — Unit: `capturedProposals` + clear explícito
  - **Arquivo**: src/server/ai-module/builder/cards/builder-state.test.ts
  - **Depende de**: T06
  - **O que fazer**: Parse/backfill legado; `clearCapturedProposals` remove SÓ o domínio dado; teste de regressão do invariante "deepMerge nunca deleta".
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T66 [Onda 3]** — Unit: handler `agent_review`
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/journey-v2.test.ts
  - **Depende de**: T24
  - **O que fazer**: Flipa exatamente persona+services+hours em 1 write; limpa `capturedProposals` explicitamente; disclosure opcional aplicado em `metadata.identityCard`; `review_done` emitido.
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T67 [Onda 3]** — E2E: jornada com site
  - **Arquivo**: test/e2e/builder/builder-v2-com-site.spec.ts
  - **Depende de**: T43, T23
  - **O que fazer**: 2 perguntas → fonte aceita → agent_review PREFILLADO (badge "sugerido da conversa") → teste responde → publicar; nenhum dado pedido duas vezes (critérios §8 itens 1 e 3).
  - **Critério**: `npm run test:e2e` verde.
  - **Paralelo**: sequencial

- [ ] **T68 [Onda 4]** — E2E: Capacidades
  - **Arquivo**: test/e2e/builder/builder-v2-capacidades.spec.ts
  - **Depende de**: T45, T30
  - **O que fazer**: Conhecimento sempre-on sem toggle; transferir OFF por default publica e responde sozinho; ligar roleta expõe config inline e o ACK aparece no chat aberto (consumo único do stream); agente publicado COM RAG quando a fonte veio antes do agente (critérios §8 itens 4-6).
  - **Critério**: `npm run test:e2e` verde.
  - **Paralelo**: sequencial

- [ ] **T69 [Onda 5]** — Unit: `test_drive` + auto-flip fail-open
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/journey-v2.test.ts (+ teste do helper no playground-stream)
  - **Depende de**: T32, T33
  - **O que fazer**: Skip vs tested (copy do ACK distinta); auto-flip do playgroundStream é fail-open (erro de DB não quebra o stream); helper único usado pelos dois caminhos; eventos test_done/test_skipped.
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T70 [Onda 5]** — E2E: Testar + Lançar
  - **Arquivo**: test/e2e/builder/builder-v2-lancamento.spec.ts
  - **Depende de**: T46, T47, T48, T51, T52
  - **O que fazer**: Teste oferecido ANTES da ativação; "Publicar sem testar" funciona; QR re-apresentável até conectar SEM criar segunda instância (refresh-qr); pós-publicação mostra próximos passos (critérios §8 itens 8, 9, 13).
  - **Critério**: `npm run test:e2e` verde; assert de instância única no broker (mock UAZ).
  - **Paralelo**: sequencial

- [ ] **T71 [Onda 6]** — Unit: `visibleWhen` v2 vs locked v1
  - **Arquivo**: src/client/components/projetos/preview/tab-registry.test.ts (ou teste react co-localizado)
  - **Depende de**: T54
  - **O que fazer**: v2 (`journey` presente) → tab não-acionável FILTRADA; v1 → locked atual (regressão).
  - **Critério**: `npm run test:react` verde.
  - **Paralelo**: [P]

- [ ] **T72 [Onda 6]** — E2E: UI progressiva
  - **Arquivo**: test/e2e/builder/builder-v2-progressivo.spec.ts
  - **Depende de**: T54, T55
  - **O que fazer**: Primeira tela só conversa (fullscreen Conhecer); tabs aparecem por fase; NENHUMA tab visível-porém-bloqueada em v2 (critério §8 item 12).
  - **Critério**: `npm run test:e2e` verde + re-run de T62 (v1 intacta).
  - **Paralelo**: sequencial

## Fase 6 — Observabilidade & polish

- [ ] **T73 [Onda 6]** — Doc deprecated da IdentityTab (cascata CLAUDE.md)
  - **Arquivo**: docs/deprecated/IDENTITY_TAB.md
  - **Depende de**: T56
  - **O que fazer**: Documentar a remoção (o que era, por que saiu, onde o disclosure vive agora — agent_review/T24 + create_agent/T25, endpoint PATCH preservado, como ressuscitar via git) com frontmatter doc-freshness.
  - **Critério**: arquivo existe com frontmatter completo; refs à IdentityTab removidas de docs ativas.
  - **Paralelo**: [P]

- [ ] **T74 [Onda 7]** — Queries do funil (dashboard ops)
  - **Arquivo**: docs/builder/JOURNEY_V2_FUNNEL.md
  - **Depende de**: T09
  - **O que fazer**: Documentar as queries SQL do funil por fase (agregação `MIN(createdAt)` por (projectId, event), por org e global; metas da spec §2: conclusão, tempo até primeiro teste) para operação via Claude Code/MCP Supabase (sem admin UI).
  - **Critério**: queries executam no Postgres de homol e retornam o funil; frontmatter doc-freshness.
  - **Paralelo**: [P]

- [ ] **T75 [Onda 7]** — Monitor de drafts v1 + issue de sunset
  - **Arquivo**: docs/builder/JOURNEY_V2_FUNNEL.md (query JSONB) + issue no repositório
  - **Depende de**: T17
  - **O que fazer**: Query operacional por `builderState->>'journeyVersion'` para contar drafts v1 ativos; criar a issue de sunset JÁ nesta onda (quando drafts v1 = 0 por 60 dias: remover paths v1-only, o branch do resolver e o flag — plan §10 Onda 7).
  - **Critério**: query funciona; issue criada com critério de gatilho explícito.
  - **Paralelo**: [P]

- [ ] **T76 [Onda 7]** — Rollout gradual `percentage:10 → 50 → 100` ⚠️ APROVAÇÃO (deploy prod)
  - **Arquivo**: env de homol/prod (`BUILDER_JOURNEY_V2`) — operacional, sem código
  - **Depende de**: T62, T64, T67, T68, T70, T72 (todas as ondas + E2E verdes)
  - **O que fazer**: Subir o flag em prod por etapas (seed=organizationId, projetos NOVOS), monitorando o funil (T74) entre etapas. Seguir release-checklist (gate test:all + baselines + rollback plan).
  - **Critério**: 100% de projetos novos em v2 com funil medindo as metas da spec §2; zero regressão v1 reportada.
  - **Paralelo**: sequencial

---

## Mapa de execução por onda

Sequência de execução do /execute (dentro de cada onda, tarefas na ordem listada; [P] podem rodar em paralelo entre si quando as dependências permitem):

| Onda | Sequência de tarefas | Total |
|---|---|---|
| **Onda 0 — Fundações dark** | T01 → T02 → (T03 ∥ T04 ∥ T07 ∥ T08) → T09 → T10 → T11 → (T57 ∥ T58 ∥ T59 ∥ T60) | 13 |
| **Onda 1 — Engine v2 + leitura** | T05 → (T12 ∥ T13) → T14 → T15 → T16 → T17 → (T18 ∥ T37) → T61 → T62 | 11 |
| **Onda 2 — Conhecer** | T19 → (T20 ∥ T21) → T38 → T63 → T64 | 6 |
| **Onda 3 — Revisar** | T06 → (T22 ∥ T23* ∥ T26 ∥ T39 ∥ T40 ∥ T41 ∥ T42) → T24 → T25 → T43 → (T65 ∥ T66) → T67 — *T23/T26/T39 dependem de T06 | 14 |
| **Onda 4 — Capacidades** | (T27 ∥ T28) → T29 → T30 → T31 → T44 → T45 → T68 | 8 |
| **Onda 5 — Testar + Lançar** | T32 → T33 → (T34 ∥ T35 ∥ T36 ∥ T52) → (T46 ∥ T48) → T49 → T50 → T51 → T47 → T69 → T70 | 14 |
| **Onda 6 — UI progressiva + limpeza** | T53 → (T54 ∥ T55) → T56 → (T71 ∥ T73) → T72 | 7 |
| **Onda 7 — Rollout & convergência** | (T74 ∥ T75) → T76 | 3 |

Gate entre ondas: critério "Pronto quando" do plan §10 + `npm run lint && npx tsc --noEmit && npm run test:unit` verdes; E2E da onda verde antes de abrir a próxima.

## Perguntas em aberto

1. **Onda 7 incluída apesar do prompt do /break citar "ondas 0-6"**: o plan.md (fonte principal) define a Onda 7 (rollout & convergência) — incluída como T74–T76; T74/T75 são doc/ops leves e T76 é puramente operacional, gated por aprovação de prod. Se a intenção era cortar a Onda 7 do escopo do /execute, remover T74–T76 do mapa.
2. **Nome das fases na UI (spec §9 pendente 8)**: tarefas usam "Conhecer / Revisar / Testar / Lançar" como copy default; os títulos vivem em `QUAYER_PHASES` (T15) — troca de copy posterior é pontual, sem refactor.
3. **Spec §9 pendentes 5 e 6 (jeito de falar; avisar sem pausar)**: o plano não decide; T40 preserva as 3 opções de persona e o handoff-card mantém "avisar sem pausar" como opção avançada existente — qualquer corte é decisão de produto fora desta quebra.
