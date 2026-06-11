---
Criado: 2026-06-11
Atualizado: 2026-06-11
Revisar em: a cada onda concluída
Relacionados:
  - specs/jornada-builder-v2/spec.md
  - specs/jornada-builder-v2/plan.md
---

# Tasks — Jornada Builder v2: "Configure por exceção"

Quebra do `plan.md` (ondas 0–7 + **Onda 5b**) em **109 tarefas atômicas**. Quick-wins já shipped em 2026-06-10 (derivação de capacidades, `set_project_basics` ampliado, prefills, reopen-from-summary, fonte única de progresso, ativação+silêncio encadeados, agenda honesta/FR-11, nome curto/FR-04) **NÃO viram tarefas** — são dependência.

**Delta 2026-06-11 integrado** (decisões do founder — spec §9 decisões 5–10, plan adendo §10): canal em 2 níveis (`channel_platform` + nível 2 WhatsApp QR/Cloud, IG sem nível 2), multi-canal simultâneo como **Onda 5b**, 11 mitigações da revisão sênior (silent-submit, monotonicidade, summary v2-aware, arquivamento de drafts, kill-switch, agent_review granular, proposta tardia, LLM mock, teto de polling, purge 180d, gate de âncoras por onda), BYOK guiado e animação da revelação. **Tarefas novas: T77–T106**; **tarefas alteradas pelo delta: T05, T13, T14, T15, T16, T24, T35, T39, T43, T45, T47, T51, T61, T62, T66, T68, T70, T72, T75, T76 (gate da Onda 5b adicionado às deps)**. **Delta share 2026-06-11 (FR-34, conexão delegável por link): T107–T109** — share da Agenda na config inline (connect-link 7 dias), bloco de share no card do WhatsApp (shareLink 15 min, "Gerar novamente" renova QR+token juntos) e E2E dos fluxos delegados.

**Correções de path vs plan.md (verificadas no código em 2026-06-11):**
- `apply-card-submit.ts` está em `src/server/ai-module/builder/cards/handlers/` (hoje **960 linhas**, não 876 — ainda mais acima do máx 800 de service).
- O método de duplicação é `builderProjectRepository.duplicate` (`projects.repository.ts:557`), exposto pela action `duplicateProject` em `projects/routes/crud.routes.ts:445`.
- E2E vive em `test/e2e/` (playwright.config.ts `testDir: './test/e2e'`) — specs novas em `test/e2e/builder/`.
- Banner em `chat/handlers/build-journey-banner.ts`; playground stream do runtime em `src/server/ai-module/ai-agents/runtime/playground-stream.ts`; rota do playground do Builder em `projects/routes/playground.routes.ts`; webhook em `src/server/communication/webhooks/uazapi/resolve-connection.ts`.

## Checklist final (verificado na quebra; delta 2026-06-11 incorporado)

- [x] **Todos os FRs com tarefas**: FR-01 (T15/T21), FR-02 (T06/T23/T39), FR-03 (T19/T38), FR-04 (shipped), FR-05 (T24/T43), FR-06/07 (T28/T44), FR-08 (T44 reusa handoff-card opt-in), FR-09 (shipped + T45), FR-10 (shipped, derivação), FR-11 (shipped), FR-12 (T15/T46), FR-13 (T29/T30), FR-14 (T52), FR-15 (T14/T34/T47), FR-16 (T32/T48), FR-17 (shipped + cards individuais mantidos em T40–T42), FR-18 (T49–T51), FR-19 (T53–T55), FR-20 (T46), FR-21 (T56/T73), **FR-22 (T24/T43/T66), FR-23 (T39/T95), FR-24/25 (T86/T91/T96/T97), FR-26 (Onda 5b: T92–T94/T104/T105), FR-27 (T47/T51), FR-28 (T99), FR-29 (T90/T45/T102), FR-30 (T05/T15/T35/T61/T100), FR-31 (T98), FR-32 (T101), FR-33 (T106/T75), **FR-34 (T107/T108/T109)**.
- [x] **NFRs novos com tarefas**: NFR-08 kill-switch (T87/T62), NFR-09 LLM mock (T89 — pré-requisito de TODOS os E2E v2), NFR-10 retenção (T88).
- [x] **Critérios de aceitação (spec §8) com testes**: itens 1/3 → T67; item 2 → T64; itens 4–6 → T68; item 7 → shipped (agenda honesta) + T68; itens 8/9/13 → T70; item 10 → shipped (reopen) + T67; item 11 → T49–T51 + T62; item 12 → T72; item 14 → T59/T74; **canal nível 1→2 + teto de polling → T70; multi-canal → T105; silent-submit → T68/T102; monotonicidade → T61 + T100; summary v2-aware → T98 (+ assert em T70); erros granulares → T66/T67; proposta tardia → T39/T95 (+ assert em T67); BYOK guiado → T99 (+ assert em T70); animação/reduced-motion → T72; kill-switch → T62; purge 180d → T88; arquivamento 90d → T106**.
- [x] **Gate de revalidação de âncoras (plan §10, risco 11)**: T77–T85 — a 1ª tarefa de TODA onda (0, 1, 2, 3, 4, 5, 5b, 6, 7) re-grepa os paths/linhas citados pelo plano para a onda; âncora quebrada = corrigir plan/tasks ANTES de codar.
- [x] **Nenhuma tarefa edita** `igniter.client.ts` / `igniter.schema.ts` (auto-gerados).
- [x] **Aprovações marcadas (plan §9)**: T01/T02 (schema Prisma + migration ⚠️), T07 (env var nova ⚠️), T56 (deleção de arquivo ⚠️), T76 (rollout prod ⚠️), **T87 (env kill-switch ⚠️ — aprovada 2026-06-11), T88 (cron novo no worker ⚠️ — aprovado 2026-06-11), T92 (semântica do attach/Onda 5b ⚠️ — aprovada 2026-06-11)**. Novas deps npm: NENHUMA em nenhuma tarefa (animação FR-32 em CSS puro).
- [x] **Cascatas de doc viraram tarefas próprias**: T03 (ERD + tabela Prisma do CLAUDE.md), T07 (.env.example + SECRETS.md), **T87 (.env.example + SECRETS.md do kill-switch)**, T73 (docs/deprecated/IDENTITY_TAB.md).
- [x] **Ordem CLAUDE.md dentro de cada onda**: schema → migration → Zod → repository → routes/controller → frontend (ver Mapa de execução).
- [x] **Invariantes de regressão v1 (NFR-03)**: `next-pending-step.test.ts` e `enabled-tools-derivation.test.ts` permanecem verdes SEM edição (critérios em T12, T17, T27) + spec E2E T62 (que também cobre o kill-switch NFR-08); **Onda 5b re-roda a suíte inteira v1/v2 (regressão do 1-canal — T105)**.

---

## Fase 0 — Gates de onda: revalidação de âncoras (plan §10, risco 11)

> Regra dura (decisão 2026-06-11): **a 1ª tarefa de TODA onda** é revalidar as âncoras de código (paths + linhas) que o plano/tarefas citam para a onda — drift de plano com produto vivo já aconteceu (comentário stale do `playground-stream.ts`, risco 7). Âncora quebrada = corrigir `plan.md`/`tasks.md` ANTES de codar. Formato comum: re-grep das âncoras listadas, registro do resultado no PR da onda. Todas sequenciais (bloqueiam a onda).

- [ ] **T77 [Onda 0]** — Gate de âncoras da Onda 0
  - **Arquivo**: specs/jornada-builder-v2/{plan.md,tasks.md} (correções, se houver)
  - **Depende de**: —
  - **O que fazer**: Re-grep das âncoras da Onda 0: `projects.repository.ts:28` (`$transaction` de `createWithInitialMessage`) e `:557` (`duplicate`), `BuilderToolCall` no schema (linha ~1994), idiom de `auth-v3.ts`, padrão de schedule de `src/server/services/jobs/session-close.job.ts` (para o cron T88). Divergência → corrigir plano/tarefas antes de T01.
  - **Critério**: âncoras conferidas e registradas no PR; zero divergência não corrigida.
  - **Paralelo**: sequencial (1ª da onda)

- [ ] **T78 [Onda 1]** — Gate de âncoras da Onda 1
  - **Arquivo**: specs/jornada-builder-v2/{plan.md,tasks.md}
  - **Depende de**: —
  - **O que fazer**: Re-grep: `next-pending-step.ts` (`confirmed`:83, `hasText`:87, `StepDefinition`:56, exports `FIELD_OWNERSHIP`:331/`computeBlockers`:372), `readiness-resolver.ts:74-97` (`Promise.all`) e `:85-88` (`hasWhatsAppInstance` sem status), ausência de switch exaustivo sobre `StepId` (risco R3), `provider-factory.ts` (ponto de injeção do mock T89).
  - **Critério**: idem T77.
  - **Paralelo**: sequencial (1ª da onda)

- [ ] **T79 [Onda 2]** — Gate de âncoras da Onda 2
  - **Arquivo**: specs/jornada-builder-v2/{plan.md,tasks.md}
  - **Depende de**: —
  - **O que fazer**: Re-grep: accept de source em `apply-card-submit.ts` (~:796), padrão transacional de `set-project-basics.tool.ts:149-202`, `STEP_TO_CARD` em `card-registry.tsx` (:207), `journey-rules.ts`/`quick_reply_chips` end-to-end.
  - **Critério**: idem T77.
  - **Paralelo**: sequencial (1ª da onda)

- [ ] **T80 [Onda 3]** — Gate de âncoras da Onda 3
  - **Arquivo**: specs/jornada-builder-v2/{plan.md,tasks.md}
  - **Depende de**: —
  - **O que fazer**: Re-grep: funções locais `applyAgentPersona`/`applyServices`/`applyBusinessHours` (`apply-card-submit.ts` ~:327-417), `proposal` singular (`builder-state.ts:29-32`), `deepMerge` nunca deleta (`builder-state.ts:377-394`), clear de `minTicketCents` (`apply-card-submit.ts:464-469`), `injectDisclosureIntoPrompt` (`identity.routes.ts:102-114`), contagem de linhas atual do entrypoint (hoje 960).
  - **Critério**: idem T77.
  - **Paralelo**: sequencial (1ª da onda)

- [ ] **T81 [Onda 4]** — Gate de âncoras da Onda 4
  - **Arquivo**: specs/jornada-builder-v2/{plan.md,tasks.md}
  - **Depende de**: —
  - **O que fazer**: Re-grep: flip-antes-do-stream e turno LLM do card-submit (`card-submit.routes.ts:102-106` e `:120-155` — âncora central do silent-submit T90), lazy wiring `wireCollectionToProject` (`knowledge-helpers.ts:67-86`), comentário stale (`playground-stream.ts:104-106`), gate RAG do runtime (`prepare-agent-call.ts:208`), exports de `enabled-tools-derivation.ts`.
  - **Critério**: idem T77.
  - **Paralelo**: sequencial (1ª da onda)

- [ ] **T82 [Onda 5]** — Gate de âncoras da Onda 5 (inclui transição de status do Instagram)
  - **Arquivo**: specs/jornada-builder-v2/{plan.md,tasks.md}
  - **Depende de**: —
  - **O que fazer**: Re-grep: provisioning não-idempotente (`provision-whatsapp.routes.ts:76-90`, projectId :83), refresh público de QR (`instances/share/[token]/route.ts:69-117`), transição CONNECTED no webhook (`resolve-connection.ts:66-73, 156`), `READINESS_QUERY` (`use-chat-stream.ts:78, 202-207`), redirect do blocker byok (`REDIRECT_BYOK = '/integracoes'`, `next-pending-step.ts:44`; blocker em ~:389-391). **Âncora crítica (plan §3.1)**: `channel-credentials.routes.ts:117` cria Connection IG com `status: 'DISCONNECTED'` — CONFIRMAR como o status IG transita para `CONNECTED` antes de fixar o isDone de `instagram_connect`; se o sinal for volátil, aplicar sentinel-espelho (mesmo padrão `whatsappConnectedOnce`).
  - **Critério**: idem T77 + decisão registrada sobre o isDone do `instagram_connect` (sinal direto vs sentinel-espelho) refletida em T15/T97.
  - **Paralelo**: sequencial (1ª da onda)

- [ ] **T83 [Onda 5b]** — Gate de âncoras da Onda 5b (attach + inbound)
  - **Arquivo**: specs/jornada-builder-v2/{plan.md,tasks.md}
  - **Depende de**: —
  - **O que fazer**: Re-grep: `attach-to-agent.ts:25-28` (`updateMany where { agentConfigId, status: 'ACTIVE' }` — a semântica 1-canal a mudar) + os DOIS callers (`channel-credentials.routes.ts`, `provision-whatsapp.routes.ts`); mapear TODOS os pontos do runtime inbound que resolvem deployment (confirmar resolução POR connection, nunca por unicidade de agente) — insumo direto de T93.
  - **Critério**: idem T77 + lista dos pontos de resolução inbound anexada ao PR (insumo de T93).
  - **Paralelo**: sequencial (1ª da onda)

- [ ] **T84 [Onda 6]** — Gate de âncoras da Onda 6
  - **Arquivo**: specs/jornada-builder-v2/{plan.md,tasks.md}
  - **Depende de**: —
  - **O que fazer**: Re-grep: embed da IdentityTab em `prompt-tab.tsx` (:29, :73), `tab-registry.tsx`/`TabRenderContext`, ponto do split no `workspace.tsx` (âncora da animação T101), `persona.greeting` lido pelo prompt-writer (`builder-context.ts:31, 146, 212-213`).
  - **Critério**: idem T77.
  - **Paralelo**: sequencial (1ª da onda)

- [ ] **T85 [Onda 7]** — Gate de âncoras da Onda 7
  - **Arquivo**: specs/jornada-builder-v2/{plan.md,tasks.md}
  - **Depende de**: —
  - **O que fazer**: Re-grep: `archiveProject` em `projects/routes/crud.routes.ts` (reuso em T106), query JSONB `builderState->>'journeyVersion'` viável no Postgres alvo, flag `BUILDER_JOURNEY_V2` nos envs de homol/prod.
  - **Critério**: idem T77.
  - **Paralelo**: sequencial (1ª da onda)

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

- [ ] **T05 [Onda 1]** — 7 sentinels novos em `confirmationsSchema` *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/cards/builder-state.ts
  - **Depende de**: T04
  - **O que fazer**: Adicionar `businessIdentity`, `testDrive`, `knowledge`, `media`, `publishedNextSteps`, `channelPlatform` e `whatsappConnectedOnce` (todos `.default(false)`) em `confirmationsSchema`, com doc no arquivo reforçando: resolvidos SÓ server-side via `applyConfirmation`, nunca vêm do body (plan §2.2 item 3 + §5). `whatsappConnectedOnce` é o **sentinel-espelho de monotonicidade (FR-30)** — flipado fail-open pelo webhook UAZ (T35); documentar isso no arquivo.
  - **Critério**: `npx tsc --noEmit`; testes existentes verdes; os 7 defaults false cobertos em T61.
  - **Paralelo**: sequencial (mesmo arquivo que T04)

- [ ] **T06 [Onda 3]** — Namespace `capturedProposals` + helper `clearCapturedProposals`
  - **Arquivo**: src/server/ai-module/builder/cards/builder-state.ts
  - **Depende de**: T05
  - **O que fazer**: Adicionar namespace top-level `capturedProposals` (NÃO `proposals` — colisão de leitura com `proposal` singular existente, linhas 29-32) com shape opcional por domínio `{persona?, services?, hours?, pricing?, handoff?{mode,reason}, activation?}`, max-lengths e whitelist de domínios (plan §2.2 item 2). Exportar `clearCapturedProposals(state, domain)` que remove a chave do domínio por spread — o `deepMerge` de `patchBuilderState` NUNCA deleta chaves; proibido confiar no patch para limpar.
  - **Critério**: `clearCapturedProposals` remove só o domínio dado (teste T65); `deepMerge` intocado; `npx tsc --noEmit`.
  - **Paralelo**: sequencial (mesmo arquivo)

- [ ] **T86 [Onda 1]** — Namespace `channel` no builderState (FR-24/25) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/cards/builder-state.ts
  - **Depende de**: T05
  - **O que fazer**: Adicionar namespace top-level `channel: { platforms?: Array<'whatsapp'|'instagram'>, whatsappMode?: 'qr'|'cloud' }` (plan §2.2 item 4) — gravado pelo handler `channel_platform` (T91); `whatsappMode` recomendado `'qr'` (a pré-seleção vive na UI, T96, não no schema). Mudança 100% aditiva; o engine v2 (T15) lê `state.channel?.platforms` para surfar os steps de conexão condicionalmente.
  - **Critério**: `npx tsc --noEmit`; parse de JSONB legado sem `channel` continua válido; testes existentes verdes.
  - **Paralelo**: sequencial (mesmo arquivo que T05)

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

- [ ] **T87 [Onda 1]** — Kill-switch `BUILDER_V2_FORCE_RENDER_V1` + cascata SECRETS ⚠️ APROVAÇÃO (env var nova — aprovada 2026-06-11, plan §9) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/state/readiness-resolver.ts + .env.example + docs/infra/SECRETS.md
  - **Depende de**: T17
  - **O que fazer**: NFR-08 (plan §3.1): env `BUILDER_V2_FORCE_RENDER_V1` (true|false, default false). Quando ligada, o branch do resolver (T17) força `nextPendingStep` (v1) MESMO com `journeyVersion === 2` — degrada SÓ o render, sem tocar estado persistido (sentinels compatíveis; steps v2 sem equivalente v1 ficam ocultos); desligar volta à v2 no request seguinte. **Cascata obrigatória**: documentar em `.env.example` + `docs/infra/SECRETS.md` (bump do frontmatter). Unit co-localizado no resolver: kill-switch ligado força engine v1 com `journeyVersion: 2` SEM nenhuma escrita de estado; desligado volta v2 (plan §7.1).
  - **Critério**: `grep BUILDER_V2_FORCE_RENDER_V1 .env.example docs/infra/SECRETS.md` retorna match nos dois; unit verde; zero writes no caminho do kill-switch (assert no teste); E2E T62 cobre o round-trip.
  - **Paralelo**: sequencial (depois de T17)

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

- [ ] **T88 [Onda 0]** — Cron de purge `builder_journey_events` > 180 dias ⚠️ APROVAÇÃO (cron novo no worker — aprovado 2026-06-11, plan §9) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/server/services/jobs/journey-events-purge.job.ts (+ registro em jobs/index.ts)
  - **Depende de**: T02
  - **O que fazer**: NFR-10 (plan §6.2): job recorrente no worker — `DELETE FROM builder_journey_events WHERE created_at < now() - interval '180 days'` (batched) — no MESMO padrão do schedule existente de `session-close.job.ts`. Fail-open: erro no purge loga (`[journey-v2]`) e NUNCA derruba o worker. Sem env nova; intervalo fixo. Unit co-localizado: deleta só eventos > 180 dias; nunca lança; idempotente (plan §7.1).
  - **Critério**: schedule registrado no worker; unit verde; rodar 2x seguidas não erra (idempotente); `npx tsc --noEmit`.
  - **Paralelo**: [P] (com T09)

### Onda 1 — Engine v2 + leitura

- [ ] **T12 [Onda 1]** — Extrair `step-helpers.ts` compartilhado
  - **Arquivo**: src/server/ai-module/builder/state/step-helpers.ts (de next-pending-step.ts)
  - **Depende de**: —
  - **O que fazer**: Mover `confirmed` (:83) e `hasText` (:87) para o novo arquivo e exportar a interface `StepDefinition` (:56, hoje local); `next-pending-step.ts` passa a importar de lá. Proibido duplicar — é o anti-fork do risco R1.
  - **Critério**: `state/next-pending-step.test.ts` verde **SEM nenhuma edição**; `npx tsc --noEmit`.
  - **Paralelo**: [P]

- [ ] **T13 [Onda 1]** — Estender `StepId` + tipo `Readiness.journey` *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/state/readiness.types.ts
  - **Depende de**: —
  - **O que fazer**: (a) Re-grep cinto de segurança: confirmar que NÃO existe switch exaustivo sobre `StepId` (risco R3 — coberto pelo gate T78). (b) Adicionar à union (aditivo): `business_identity`, `agent_review`, `test_drive`, `channel_platform`, `whatsapp_connect`, `instagram_connect`, `published_next_steps`, `knowledge`, `media` (9 ids — plan §3.1). (c) `Readiness` ganha campo opcional `journey?: { version: 2; activePhaseId: PhaseId; phases: [...] }` com `PhaseId = 'conhecer'|'revisar'|'testar'|'lancar'` (plan §3.1). Campos v1 permanecem SEMPRE populados.
  - **Critério**: re-grep documentado no PR (zero switch exaustivo); `npx tsc --noEmit` verde em todo o repo (prova de que consumidores toleram a extensão).
  - **Paralelo**: [P]

- [ ] **T14 [Onda 1]** — Sinais `hasLiveDeployment` + `hasConnectedWhatsAppInstance` + `hasConnectedInstagramInstance` no resolver *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/state/readiness-resolver.ts
  - **Depende de**: T13
  - **O que fazer**: Adicionar ao `StepEngineContext` e ao `Promise.all` (:74-97) TRÊS counts indexados (plan §3.1): `hasLiveDeployment` (BuilderDeployment status `live` por projectId+org), `hasConnectedWhatsAppInstance` (Connection com organizationId + channel WHATSAPP + **status `CONNECTED`** + **projectId do projeto**) e `hasConnectedInstagramInstance` (mesmo padrão, channel INSTAGRAM — isDone do step condicional `instagram_connect`; a transição de status IG é âncora revalidada no gate T82). NÃO reusar `hasWhatsAppInstance` (:85-88, conta presença sem status — auto-completaria no QR gerado). O blocker `channel` v1 permanece no sinal antigo (NFR-03).
  - **Critério**: os três org-scoped; `next-pending-step.test.ts` verde sem edição; coberto por T61 (DISCONNECTED não completa).
  - **Paralelo**: sequencial

- [ ] **T15 [Onda 1]** — Engine v2: `QUAYER_PHASES` + definições de steps *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/state/journey-v2.ts
  - **Depende de**: T05, T12, T13, T86
  - **O que fazer**: Criar o arquivo com as 4 fases e steps do plan §3.2 — Conhecer: `objective` → `business_identity` (isDone: `confirmations.businessIdentity` OU `confirmed('source')`) → `source_ingestion` (opcional, override do slot ativo); Revisar: `agent_review` (isDone: persona && services && hours — SEM sentinel novo) → `agent_approval` → `knowledge` (opcional) → `media` (opcional); Testar: `test_drive` (gate SOFT); Lançar: `activation` → `channel_platform` (NOVO, FR-24/25; isDone: `confirmations.channelPlatform`) → `whatsapp_connect` (CONDICIONAL: surfa só se `channel.platforms` inclui `'whatsapp'`; polimórfico por `channel.whatsappMode` no render — T47; isDone MONOTÔNICO: `ctx.hasConnectedWhatsAppInstance || confirmations.whatsappConnectedOnce` — FR-15+FR-30) → `instagram_connect` (CONDICIONAL: surfa só se `channel.platforms` inclui `'instagram'`; isDone: `ctx.hasConnectedInstagramInstance`, com a ressalva de âncora do gate T82) → `summary` → `published_next_steps` (terminal, surfa com `hasLiveDeployment && !confirmations.publishedNextSteps`). **Regra geral de monotonicidade (FR-30, plan §3.2)**: step concluído NUNCA regride; sinal volátil de ctx ganha sentinel-espelho. REUSA `computeBlockers`/`FIELD_OWNERSHIP` (exports :372/:331) e helpers de T12 — zero fork.
  - **Critério**: `npx tsc --noEmit`; nenhum import duplicando primitivos do v1 (review de PR); função pura sem IO.
  - **Paralelo**: sequencial

- [ ] **T16 [Onda 1]** — Engine v2: `nextPendingStepV2` + completeness + `isDeployReady` + payload `journey` *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/state/journey-v2.ts
  - **Depende de**: T15
  - **O que fazer**: Implementar `nextPendingStepV2(state, ctx)` retornando step ativo + montagem do payload `journey` (fases com status done/active/pending); `completenessPct` monotônico (mesma fórmula sobre os steps aplicáveis — **steps condicionais de canal entram no denominador SÓ quando a plataforma está selecionada**, plan §3.2) e `isDeployReady` = required das fases 1-4 (exceto terminal) + zero blockers (mesmo contrato v1).
  - **Critério**: unit T61 verde (ordem, sinais, monotonicidade, steps condicionais, blockers).
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

- [ ] **T89 [Onda 1]** — Provider LLM mock test-only para E2E (NFR-09) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/ai-agents/services/provider-factory.ts (+ fixture de env no projeto local do Playwright)
  - **Depende de**: —
  - **O que fazer**: Injeção test-only no provider factory atrás de env, com **guard duro `NODE_ENV !== 'production'`** (impossível ativar em prod — plan §1/§5): quando a env está setada, o factory devolve um provider mock determinístico (respostas/tool-calls roteirizáveis). A fixture do Playwright (project local) seta a env — TODOS os specs E2E v2 (T62, T64, T67, T68, T70, T72, T105) rodam com o mock; LLM real só no smoke de homol. É pré-requisito dos E2E das ondas 2+ (plan §10 Onda 1).
  - **Critério**: com `NODE_ENV=production` a env é IGNORADA (unit/assert); spec E2E roda sem chave real de LLM; a env é test-only e NÃO entra em `.env.example`/SECRETS (documentada no harness de teste — plan §9).
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

- [ ] **T24 [Onda 3]** — Card composto `agent_review` server-side (payload + handler + validação granular FR-22) *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/journey-v2.ts + cards/card-submit.schemas.ts
  - **Depende de**: T06, T19, T22
  - **O que fazer**: Payload `{ cardKey, persona, offered, notOffered, hours, disclosure?: {mode, customText?} }` (shapes dos cards individuais). Handler compõe os exports puros de `apply/{persona,services,hours}.ts` num ÚNICO write (1 `updateMany` org-scoped) flipando `persona`+`services`+`hours`, limpa `capturedProposals.{persona,services,hours}` via `clearCapturedProposals` (clear EXPLÍCITO), aplica `disclosure` opcional no MESMO handler via `normalizeIdentityCard`+`mergeIdentityCardIntoMetadata` de `@/lib/agent-identity-card` sobre `BuilderProject.metadata.identityCard` (1 POST real, sem segundo request ao PATCH identity). **Validação granular POR SEÇÃO (FR-22, plan §3.3 item 2)**: em falha, retorna `{ errors: { persona?: string, services?: string, hours?: string } }` — nunca erro monolítico do card e NENHUM write parcial; o client (T43) preserva o estado local das seções válidas. Emite `review_done`.
  - **Critério**: unit T66 — exatamente 3 sentinels flipados em 1 write; clear explícito; disclosure no metadata; erro em uma seção → erro granular daquela seção SEM write parcial; default de horários NÃO vive no handler (vive no componente).
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

- [ ] **T90 [Onda 4]** — Silent-submit no card-submit (`ackMode: 'silent'` + allowlist — FR-29) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/cards/card-submit.routes.ts + cards/card-submit.schemas.ts
  - **Depende de**: —
  - **O que fazer**: Plan §3.3: o body do card-submit ganha `ackMode?: 'conversational' (default) | 'silent'`. No modo `silent`: o flip de estado persiste pelo MESMO caminho de hoje (:102-106), a resposta é JSON simples (`{ ok, builderState }`) e NÃO há `ensureBuilderAgent` nem `buildSseResponse` — zero turno/custo LLM. **Allowlist server-side** de cardKeys que aceitam `silent` (toggles da superfície de Capacidades: handoff/pricing/calendar e afins — plan §4.3); cards da jornada REJEITAM `silent` com 400 (o ACK conversacional é parte do contrato). Mesma auth (`authOrApiKeyProcedure`) + mesmo CSRF (plan §5).
  - **Critério**: unit T102 — flip persiste e resposta é JSON sem SSE; cardKey fora da allowlist com `silent` → 400; modo default permanece byte-compatível com o comportamento atual (testes existentes do card-submit verdes).
  - **Paralelo**: [P] (com T27/T28)

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

- [ ] **T35 [Onda 5]** — Evento `channel_connected` + flip do sentinel-espelho `whatsappConnectedOnce` no webhook UAZ (FR-30) *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/server/communication/webhooks/uazapi/resolve-connection.ts
  - **Depende de**: T05, T09
  - **O que fazer**: Na TRANSIÇÃO para `CONNECTED` (:66-73, 156 — MESMO ponto, plan §2.2 item 3): (a) emitir `channel_connected` fire-and-forget, sem PII no metadata; (b) flipar **fail-open** (try/catch — NUNCA quebra o webhook) o sentinel `confirmations.whatsappConnectedOnce` no builderState do projeto da Connection (resolvido por `projectId` org-scoped), se ainda false. Conectou uma vez → o step `whatsapp_connect` nunca reabre (monotonicidade — isDone combinado em T15); queda posterior vira aviso (T100), nunca passo pendente.
  - **Critério**: transição → CONNECTED grava o evento uma vez E flipa o sentinel; erro de DB no flip/telemetria NÃO falha o webhook (asserts); Connection sem projectId não flipa nada; testes do webhook verdes.
  - **Paralelo**: [P]

- [ ] **T36 [Onda 5]** — Evento `published` na saga
  - **Arquivo**: src/server/ai-module/builder/deploy/deploy-flow.orchestrator.ts
  - **Depende de**: T09
  - **O que fazer**: Emitir `published` quando o deployment vira status `live` (plan §6.2), fail-open.
  - **Critério**: deploy bem-sucedido grava o evento; falha de telemetria não falha a saga; testes da saga verdes.
  - **Paralelo**: [P]

- [ ] **T91 [Onda 5]** — Card `channel_platform` server-side (payload + handler — FR-24/25) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/journey-v2.ts + cards/card-submit.schemas.ts
  - **Depende de**: T19, T86
  - **O que fazer**: Plan §3.3 item 5: payload `{ cardKey, platforms: Array<'whatsapp'|'instagram'> (min 1), whatsappMode?: 'qr'|'cloud' }` com Zod refine: `whatsappMode` obrigatório quando `platforms` inclui `'whatsapp'` (a UI pré-seleciona `'qr'` — T96). Handler grava `channel.platforms` + `channel.whatsappMode` e flipa `channelPlatform` via `applyConfirmation`. **Até a Onda 5b: REJEITA `platforms` com 2 itens** (espelho server-side do disable da UI — FR-20/FR-26; a remoção é T94).
  - **Critério**: unit T103 — min 1 plataforma; refine do whatsappMode; rejeição de dupla seleção pré-5b; sentinel flipado; cross-org rejeitado.
  - **Paralelo**: sequencial (mesmo arquivo que T32)

### Onda 5b — Multi-canal simultâneo (FR-26, plan §3.7) *(nova — delta 2026-06-11)*

- [ ] **T92 [Onda 5b]** — Attach pausa por CONEXÃO (não por agente) ⚠️ APROVAÇÃO (semântica de runtime — aprovada 2026-06-11, plan §9)
  - **Arquivo**: src/server/ai-module/builder/channel/attach-to-agent.ts
  - **Depende de**: T83 (gate), T70 (Onda 5 verde)
  - **O que fazer**: Mudar o `updateMany` (:25-28, `where { agentConfigId, status: 'ACTIVE' }`) para incluir o filtro `connectionId` — pausa SÓ deployments da MESMA conexão (re-attach/troca daquele canal), permitindo **N deployments ACTIVE, 1 por canal** (WhatsApp + Instagram do mesmo agente). A mudança vale para os DOIS callers (`channel-credentials.routes.ts` — Cloud/IG — e `provision-whatsapp.routes.ts`). Nenhuma migration: `AgentDeployment` já suporta N linhas por agente (plan §3.7).
  - **Critério**: unit T104 verde; suíte existente do attach/deploy verde (regressão do re-attach da mesma conexão).
  - **Paralelo**: sequencial

- [ ] **T93 [Onda 5b]** — Validação da resolução inbound por connection
  - **Arquivo**: runtime inbound (pontos mapeados pelo gate T83 — ex.: resolução de deployment no caminho do webhook→dispatch)
  - **Depende de**: T92
  - **O que fazer**: Revalidar que a resolução de deployment no caminho inbound é POR CONNECTION (a mensagem chega numa conexão específica e resolve o deployment DAQUELA conexão — nunca assume deployment único por agente); qualquer ponto que assuma unicidade é corrigido AQUI (plan §3.7b, risco 10 — deployment "fantasma"/resolução errada).
  - **Critério**: inventário do gate T83 com cada ponto marcado conforme/corrigido; testes do runtime inbound verdes; com 2 deployments ACTIVE, mensagem de cada canal resolve o deployment certo (coberto também no E2E T105).
  - **Paralelo**: sequencial

- [ ] **T94 [Onda 5b]** — Habilitar a seleção dupla no card `channel_platform`
  - **Arquivo**: src/client/components/projetos/chat/cards/channel-platform-card.tsx + cards/handlers/apply/journey-v2.ts (remoção da rejeição server-side)
  - **Depende de**: T92, T96
  - **O que fazer**: Remover o disable da UI (hint "em breve") E a rejeição server-side de 2 plataformas no handler (T91) — plan §3.7d. O hint dá lugar ao comportamento real: "Pode marcar os dois — o mesmo agente atende ambos."
  - **Critério**: submit com `['whatsapp','instagram']` aceito; engine surfa `whatsapp_connect` E `instagram_connect`; unit T103 atualizado (caso de dupla seleção passa a ser aceito pós-5b); E2E T105.
  - **Paralelo**: [P] (com T93)

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

- [ ] **T39 [Onda 3]** — Helper de precedência `prefill.ts` (mount-only + proposta tardia FR-23) *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/chat/cards/prefill.ts
  - **Depende de**: T06
  - **O que fazer**: Helper PURO com a regra única `owned confirmado > capturedProposals.<domínio> > default` (FR-02, plan §4.2) + flag de origem para o badge "sugerido da conversa". Os `capturedProposals` chegam no `builderState` que o `ActiveStepCard` já entrega (zero fetch extra — NFR-05). **Proposta tardia (FR-23, plan §4.2)**: o prefill é calculado UMA única vez, no mount do card; o helper expõe a detecção de proposta que chega DEPOIS (via refetch do readiness) SEM re-prefillar nem sobrescrever digitação — quem age é o chip "Usar sugestão" (T95).
  - **Critério**: unit co-localizado cobrindo as 3 precedências + proposta tardia NÃO re-prefilla campo já montado/digitado (plan §7.1); `npx tsc --noEmit`.
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

- [ ] **T43 [Onda 3]** — Card composto `agent-review-card.tsx` + registry (erros granulares FR-22) *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/chat/cards/agent-review-card.tsx (+ entrada em card-registry.tsx)
  - **Depende de**: T24, T39, T40, T41, T42
  - **O que fazer**: Orquestrador FINO compondo as 3 seções + seção avançada de disclosure (modos `ai_explicit`/`human_passthrough`/`custom` + aceite, migrada da IdentityTab); prefill via T39 com badge "sugerido da conversa" em valores de `capturedProposals` (owned renderiza sem badge); 1 POST único para o handler T24. **Erros granulares (FR-22)**: quando o handler retorna `{ errors: { persona?, services?, hours? } }`, o card destaca SÓ a(s) seção(ões) com erro e PRESERVA o estado local das seções válidas — re-submit corrige apenas o que falhou.
  - **Critério**: ≤300 linhas (orquestrador); 1 única confirmação obrigatória (NFR-07); badge aparece só em propostos; erro em `hours` não descarta persona/services digitados (teste react); `npm run lint`.
  - **Paralelo**: sequencial

- [ ] **T95 [Onda 3]** — Chip "Usar sugestão" para proposta tardia (FR-23) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/chat/cards/use-suggestion-chip.tsx (+ integração nas seções review/{persona,services,hours}-section.tsx)
  - **Depende de**: T39, T40, T41, T42
  - **O que fazer**: Componente de chip compartilhado (plan §4.2): quando `capturedProposals` chega DEPOIS de o card estar montado (detecção do helper T39 observando o readiness), o campo correspondente mostra o chip "Usar sugestão" — aplicar a proposta é SEMPRE ação explícita do usuário, por campo; nunca re-prefill automático nem sobrescrita de digitação. Usado pelas 3 seções do `agent_review` (e disponível para `business_identity`).
  - **Critério**: teste react — proposta tardia não altera o valor digitado; clicar o chip aplica SÓ o campo clicado; chip some após aplicar/submeter; `npm run lint`.
  - **Paralelo**: sequencial (depois das seções)

- [ ] **T44 [Onda 4]** — `capabilities-section.tsx` na Overview
  - **Arquivo**: src/client/components/projetos/preview/tabs/overview/components/capabilities-section.tsx
  - **Depende de**: T27, T28
  - **O que fazer**: Seção da Overview (decisão: NÃO é tab nova) com linhas: Conhecimento (SEMPRE ativo, sem toggle, link p/ tab Conhecimento — FR-07), Transferir (estado de `builderState.handoff.mode`; proposta de nicho regulado = toggle pré-ligado com badge + reason de `capturedProposals.handoff`), Preços, Agenda, Fotos (`mediaImagesCount`), Integrações (`customTools`, empty state). Usa as funções puras de T27 para mostrar o que o agente saberá fazer (sem segunda fonte de verdade).
  - **Critério**: ≤300 linhas; estados dos toggles derivam do builderState do readiness (zero fetch extra além do getCapabilities); `npm run lint`.
  - **Paralelo**: sequencial

- [ ] **T45 [Onda 4]** — Toggles abrem cards inline + submit via silent-submit (FR-29) *(alterada pelo delta 2026-06-11 — substitui o roteamento pela submitCard conversacional)*
  - **Arquivo**: src/client/components/projetos/preview/tabs/overview/components/capabilities-section.tsx (+ tradução do evento `builder:capability-toggled` em use-chat-stream.ts)
  - **Depende de**: T44, T90
  - **O que fazer**: Ligar um toggle EXPANDE inline o card correspondente (`handoff-card`/`pricing-card`/`calendar-connect-card`) submetendo pelo MESMO endpoint card-submit, **OBRIGATORIAMENTE com `ackMode: 'silent'`** (plan §4.3): o flip persiste sem turno LLM/SSE e o chat mostra uma linha de sistema LOCAL barata ("✓ Preços ativados" / "✓ Transferência ativada") — via evento leve `builder:capability-toggled` que o `use-chat-stream` traduz em mensagem de sistema no histórico vivo (sem POST de chat). Os MESMOS cards, quando abertos NA JORNADA do chat (reopen FR-17, proposta de nicho regulado), continuam com submit conversacional pela `submitCard` do `use-chat-stream` (consumo único do SSE). Isso elimina na origem o risco R2 (SSE consumido fora do chat) E o custo LLM por clique de toggle.
  - **Critério**: ligar roleta pela Overview expõe config inline, persiste SEM turno LLM e a linha de sistema local aparece no chat aberto sem reload (asserção do E2E T68); zero chamadas a `ensureBuilderAgent`/SSE no caminho do toggle (network assert).
  - **Paralelo**: sequencial

- [ ] **T46 [Onda 5]** — `test-drive-card.tsx` + registry
  - **Arquivo**: src/client/components/projetos/chat/cards/test-drive-card.tsx (+ card-registry.tsx)
  - **Depende de**: T32
  - **O que fazer**: CTA primário "Abrir teste" (troca para tab Testar via `onTabChange`), secundário "Já testei", escape explícito "Publicar sem testar" (decisão 2 da spec §9); disabled com MOTIVO enquanto `!agentExists` (FR-20).
  - **Critério**: ≤300 linhas; estados cobertos; submit chega ao handler T32 com action correta.
  - **Paralelo**: [P]

- [ ] **T47 [Onda 5]** — `whatsapp-connect-card.tsx` + registry (polimórfico qr/cloud + teto de polling FR-27 + monotonicidade FR-30) *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/chat/cards/whatsapp-connect-card.tsx (+ card-registry.tsx)
  - **Depende de**: T14, T34, T91
  - **O que fazer**: Card **polimórfico por `channel.whatsappMode`** (plan §4.1): modo `qr` → loading (chama o provisioning existente UMA única vez, APENAS quando o projeto não tem Connection — lookup org-scoped por projectId, plan §3.6a); QR visível + "Gerar novamente" via rota `refresh-qr` com throttle client de 30s (§3.6b); erro com retry honesto (NFR-06); conectado por autodetecção (`hasConnectedWhatsAppInstance` no readiness com polling — T51); **quando o polling atinge o teto de 10min (T51), mostra "Ainda esperando?" com botão que RE-ARMA a verificação (FR-27)**. Modo `cloud` → renderiza o fluxo de credenciais Cloud existente (`channel-credentials.routes.ts`). **Concluído NUNCA regride (FR-30)**: com `whatsappConnectedOnce` true o card permanece "conectado"; queda posterior vira banner de aviso (T100), não passo reaberto. Reusa o visual de `chat/whatsapp-qr-card.tsx` (que permanece para o tool-result inline v1).
  - **Critério**: ≤300 linhas; clicar "Gerar novamente" N vezes não cria instância nova (asserção E2E T70); card vira "conectado" sem reload quando o webhook seta CONNECTED; teto + re-arme cobertos no E2E T70 (clock mockado); modo cloud renderiza credenciais sem provisionar QR.
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

- [ ] **T51 [Onda 5]** — Polling 5s condicionado ao step de conexão, com teto de 10min (FR-27) *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/workspace.tsx (hook unificado de readiness)
  - **Depende de**: T50
  - **O que fazer**: `refetchInterval` de 5s APENAS enquanto o step ativo é `whatsapp_connect`/`instagram_connect` **E há menos de 10 minutos desde o último arm** (plan §4.4); passado o teto, o polling PARA e o hook expõe o estado "esgotado" para o card mostrar "Ainda esperando?" com botão que **re-arma** (re-zera o timer e retoma os 5s — T47). Senão mantém focus+turno+triggers. Com a unificação, o polling alcança o card pinado no chat — é a autodetecção do QR (risco R4); o teto elimina o polling infinito em aba esquecida.
  - **Critério**: com step ativo ≠ steps de conexão, zero polling (network assert); com QR na tela, card detecta conexão em ≤5s; após 10min o polling cessa e o re-arme retoma (E2E T70 com clock mockado).
  - **Paralelo**: sequencial

- [ ] **T52 [Onda 5]** — Activation prefill default "responder todas" (FR-14)
  - **Arquivo**: src/client/components/projetos/chat/cards/activation-mode-card.tsx
  - **Depende de**: —
  - **O que fazer**: Card abre com `mode='all'` pré-selecionado (ajuste opcional na fase Lançar; silenciados já encadeados via `onSubmitCard` shipped).
  - **Critério**: render default com "todas as mensagens" selecionado; testes react do card verdes.
  - **Paralelo**: [P]

- [ ] **T96 [Onda 5]** — `channel-platform-card.tsx` + registry (2 níveis — FR-24/25) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/chat/cards/channel-platform-card.tsx (+ card-registry.tsx)
  - **Depende de**: T91
  - **O que fazer**: Card com os 2 níveis no MESMO componente (plan §4.1). **Nível 1** — "Onde seu agente vai atender?": multi-select 💬 **WhatsApp** ("Onde seus clientes já falam com você") e 📸 **Instagram** ("Responde DMs do seu perfil automaticamente") + hint "Pode marcar os dois — o mesmo agente atende ambos."; copy SEM jargão (sem "QR"/"API"/"Cloud" — NFR-07). **Nível 2** (expande inline só se WhatsApp marcado): "Conectar meu WhatsApp" ⭐ Recomendado e PRÉ-SELECIONADO ("Escaneie um QR code com o WhatsApp do seu negócio — pronto em 2 minutos, sem burocracia.") vs "WhatsApp oficial da Meta" badge avançado ("Para empresas com número verificado na Meta. Mais robusto para alto volume — exige conta WhatsApp Business API."). Instagram SEM nível 2. **Até a Onda 5b**: seleção dupla DESABILITADA com hint honesto "em breve" (FR-20/FR-26 — removido em T94). Benefício antes da tecnologia em toda a copy.
  - **Critério**: ≤300 linhas; nível 1 sem nenhum termo de jargão (review de copy); QR pré-selecionado ao marcar WhatsApp; submit chega ao handler T91; E2E T70 cobre nível 1→2 e IG direto.
  - **Paralelo**: sequencial (depois de T91)

- [ ] **T97 [Onda 5]** — `instagram-connect-card.tsx` + registry *(nova — delta 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/chat/cards/instagram-connect-card.tsx (+ card-registry.tsx)
  - **Depende de**: T14, T91
  - **O que fazer**: Card condicional (`channel.platforms` inclui `'instagram'`) que embrulha o caminho oficial EXISTENTE de credenciais IG (`channel-credentials.routes.ts`) — sem nível 2 (FR-25); conectado por autodetecção (`hasConnectedInstagramInstance` no readiness — com a ressalva de âncora resolvida no gate T82: se o sinal IG for volátil, mesma solução de sentinel-espelho).
  - **Critério**: ≤300 linhas; surfa só com Instagram selecionado; reusa o fluxo de credenciais sem duplicar formulário; `npm run lint`.
  - **Paralelo**: [P] (com T96 após T91)

- [ ] **T107 [Onda 4]** — Share delegável da Agenda na config inline (FR-34) *(nova — delta share 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/preview/tabs/overview/components/capabilities-section.tsx (sub-seção Agenda; extrair `calendar-share-row.tsx` se estourar limite)
  - **Depende de**: T44
  - **O que fazer**: Dois caminhos lado a lado na config da capacidade Agenda (plan §4.3): "Conectar minha agenda" (OAuth direto) OU "Enviar link para o profissional" — [Copiar link] + [Enviar por WhatsApp] (wa.me com texto pré-pronto) usando o connect-link EXISTENTE (`POST /builder/calendar/connect-link` → `/conectar-agenda/<token>`, TTL 7 dias EXIBIDO). Estado "aguardando o profissional conectar…" via `GET /builder/calendar/status/:projectId` com refetch on-focus + botão "Verificar conexão" (reusar o `checkConnection` ref-guarded de `connect-link-flow.tsx`); só confirma com status CONNECTED real (FR-11).
  - **Critério**: link copiável/enviável; conexão remota detectada sem reload (focus/botão); TTL visível; `npm run lint`.
  - **Paralelo**: sequencial (depois de T44)

- [ ] **T108 [Onda 5]** — Bloco de share delegável no card `whatsapp_connect` (FR-34) *(nova — delta share 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/chat/cards/whatsapp-connect-card.tsx
  - **Depende de**: T47
  - **O que fazer**: Bloco "ou" abaixo do QR (plan §3.6c/§4.1): "📤 O número fica com outra pessoa?" + [Copiar link] + [Enviar por WhatsApp] (wa.me pré-pronto) com o `shareLink` que o provision idempotente já retorna; microcopy "Envie este link para quem tem o celular da empresa — ela escaneia de lá." + "Link válido por 15 min · Gerar novamente" (renova QR E shareToken JUNTOS — contrato do plan §3.6, via re-call do provision sem `force` ou wrapper `refresh-qr`, decisão do gate T82). Conclusão remota cai na MESMA autodetecção do card (polling do readiness).
  - **Critério**: copiar/wa.me funcionam; "Gerar novamente" renova QR+validade sem criar instância nova no broker; scan remoto vira "Conectado ✓" sem reload; `npm run lint`.
  - **Paralelo**: sequencial (depois de T47)

- [ ] **T98 [Onda 5]** — Summary v2-aware (FR-31) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/chat/cards/preview-summary-card.tsx + preview-summary-helpers.ts
  - **Depende de**: T17
  - **O que fazer**: Branch v2 no resumo de pré-publicação (plan §4.1): quando `readiness.journey` está presente, o resumo lista as **fases** + as **capacidades ATIVAS** (derivadas do `builderState`/Capacidades) — NÃO as seções fixas v1 que assumem pricing/handoff obrigatórios. Render v1 byte-intocado (NFR-03).
  - **Critério**: projeto v2 com handoff desligado mostra resumo SEM seção de transferência obrigatória; snapshot v1 inalterado; teste react do branch; `npm run lint`.
  - **Paralelo**: [P]

- [ ] **T99 [Onda 5]** — Card guiado de BYOK (FR-28) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/chat/cards/byok-guided-card.tsx
  - **Depende de**: T17
  - **O que fazer**: Render condicional do chat (NÃO é step, plan §4.1): quando `readiness.blockers` contém `byok` e a fase ativa é Lançar, renderizar card guiado de chave — "cole sua chave OpenAI — veja onde pegar", com link para `/integracoes` (o redirect real do blocker, `next-pending-step.ts:44`) — em vez de só o aviso seco. Blocker-driven, sem sentinel: some sozinho quando `byokProviderCount > 0`.
  - **Critério**: ≤300 linhas; card aparece com blocker byok ativo na fase Lançar e some após configurar a chave (sem reload, via refetch do readiness); `npm run lint`.
  - **Paralelo**: [P]

- [ ] **T100 [Onda 5]** — Banner de queda de conexão (FR-30 — aviso, nunca regressão) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/workspace.tsx (ou componente de banner do preview) — ponto exato definido na implementação
  - **Depende de**: T35, T49
  - **O que fazer**: Plan §4.4: quando `confirmations.whatsappConnectedOnce === true` mas `hasConnectedWhatsAppInstance` volta a false (conexão caiu), a UI mostra **banner de aviso** (+ entrada na Atividade) com CTA de reconexão — o step `whatsapp_connect` permanece concluído e a jornada NÃO reabre.
  - **Critério**: simular queda (Connection → DISCONNECTED) exibe o banner e o progresso/fases não regridem (unit do engine em T61 + assert de UI); CTA leva à reconexão (refresh-qr/credenciais).
  - **Paralelo**: sequencial (após T49)

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

- [ ] **T101 [Onda 6]** — Animação da revelação progressiva (FR-32, nível sutil) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/client/components/projetos/workspace.tsx + preview/tabs/overview (stagger) + ponto de render das tabs (pulso)
  - **Depende de**: T53, T55
  - **O que fazer**: Plan §4.6 — três animações em **CSS transitions puras, zero lib nova**: (a) na transição Conhecer→Revisar, o chat desliza à esquerda e o painel entra da direita com fade (transition de width/transform+opacity no mesmo branch `readiness.journey` do fullscreen); (b) conteúdo da Visão geral monta em cascata (~100ms de stagger, delay incremental por seção via CSS); (c) tab recém-liberada pelo `visibleWhen` (Testar/Publicar) ganha UM pulso de destaque (one-shot por tab, controle local; nunca repete em re-render). **`prefers-reduced-motion` obrigatório**: media query desativa as três (estado final aplicado direto). Tudo atrás do branch `readiness.journey` (zero impacto v1).
  - **Critério**: zero deps npm novas (`git diff package.json` vazio); pulso dispara 1 única vez por liberação de tab; com `prefers-reduced-motion` emulado, nenhuma transição roda (assert no E2E T72); `npm run lint`.
  - **Paralelo**: sequencial (após T53/T55)

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

- [ ] **T61 [Onda 1]** — Unit: engine `journey-v2` *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/state/journey-v2.test.ts
  - **Depende de**: T16
  - **O que fazer**: Plan §7.1: ordem das fases; `business_identity` satisfeito por `confirmations.source`; `test_drive` flipado por tested E skip; `whatsapp_connect` done por `hasConnectedWhatsAppInstance` (Connection DISCONNECTED NÃO completa) **E permanece done com ctx false quando `whatsappConnectedOnce` é true (monotonicidade FR-30)**; **`channel_platform` flipa por sentinel e os steps de conexão surfam CONDICIONALMENTE por plataforma** (sem whatsapp marcado → `whatsapp_connect` não surfa; instagram marcado → `instagram_connect` surfa); `published_next_steps` surfa só com `hasLiveDeployment`; completeness monotônico (**steps condicionais entram no denominador só com a plataforma selecionada**); `isDeployReady` exige blockers zerados; os 7 sentinels novos default false.
  - **Critério**: `npm run test:unit` verde E `state/next-pending-step.test.ts` verde SEM edição (prova NFR-03).
  - **Paralelo**: sequencial

- [ ] **T62 [Onda 1]** — E2E: regressão v1 com flag off + kill-switch (NFR-08) *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: test/e2e/builder/builder-v1-regressao.spec.ts
  - **Depende de**: T17, T87, T89
  - **O que fazer**: Flag off → jornada v1 completa intocada (NFR-03): sem campo `journey`, layout split desde o início, tabs locked (não filtradas). **E com `BUILDER_V2_FORCE_RENDER_V1=true`: projeto v2 renderiza no engine v1 SEM perda de estado (NFR-08); desligar volta à v2** (plan §7.2). Re-rodar a cada onda subsequente. Roda com o provider LLM mock (T89).
  - **Critério**: `npm run test:e2e` (project local) verde, incluindo o round-trip do kill-switch.
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

- [ ] **T66 [Onda 3]** — Unit: handler `agent_review` (+ validação granular FR-22) *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/journey-v2.test.ts
  - **Depende de**: T24
  - **O que fazer**: Flipa exatamente persona+services+hours em 1 write; limpa `capturedProposals` explicitamente; disclosure opcional aplicado em `metadata.identityCard`; `review_done` emitido. **Granularidade (plan §7.1)**: erro em `hours` retorna `{ errors: { hours } }` e NÃO descarta persona/services válidos — nenhum write parcial.
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T67 [Onda 3]** — E2E: jornada com site
  - **Arquivo**: test/e2e/builder/builder-v2-com-site.spec.ts
  - **Depende de**: T43, T23
  - **O que fazer**: 2 perguntas → fonte aceita → agent_review PREFILLADO (badge "sugerido da conversa") → teste responde → publicar; nenhum dado pedido duas vezes (critérios §8 itens 1 e 3).
  - **Critério**: `npm run test:e2e` verde.
  - **Paralelo**: sequencial

- [ ] **T68 [Onda 4]** — E2E: Capacidades (+ silent-submit FR-29) *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: test/e2e/builder/builder-v2-capacidades.spec.ts
  - **Depende de**: T45, T30, T89
  - **O que fazer**: Conhecimento sempre-on sem toggle; transferir OFF por default publica e responde sozinho; **ligar roleta expõe config inline, PERSISTE via silent-submit SEM turno LLM e a linha de sistema local aparece no chat aberto** (FR-29, plan §7.2); agente publicado COM RAG quando a fonte veio antes do agente (critérios §8 itens 4-6). Roda com LLM mock (T89).
  - **Critério**: `npm run test:e2e` verde; network assert: zero SSE/turno LLM no caminho do toggle.
  - **Paralelo**: sequencial

- [ ] **T69 [Onda 5]** — Unit: `test_drive` + auto-flip fail-open
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/journey-v2.test.ts (+ teste do helper no playground-stream)
  - **Depende de**: T32, T33
  - **O que fazer**: Skip vs tested (copy do ACK distinta); auto-flip do playgroundStream é fail-open (erro de DB não quebra o stream); helper único usado pelos dois caminhos; eventos test_done/test_skipped.
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T70 [Onda 5]** — E2E: Testar + Lançar (+ canal 2 níveis, teto de polling, BYOK guiado) *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: test/e2e/builder/builder-v2-lancamento.spec.ts
  - **Depende de**: T46, T47, T48, T51, T52, T96, T98, T99
  - **O que fazer**: Teste oferecido ANTES da ativação; "Publicar sem testar" funciona; **card de plataforma nível 1 (copy sem jargão) → marcar WhatsApp abre nível 2 com QR pré-selecionado; marcar Instagram vai direto a credenciais (sem nível 2); seleção dupla desabilitada com hint honesto (pré-5b)**; QR re-apresentável até conectar SEM criar segunda instância (refresh-qr); **polling para no teto de 10min e "Ainda esperando?" re-arma (FR-27, com clock mockado)**; **resumo v2-aware lista fases + capacidades ativas (FR-31)**; **blocker byok exibe o card guiado (FR-28)**; pós-publicação mostra próximos passos (critérios §8 itens 8, 9, 13 + critérios novos de canal). Roda com LLM mock (T89).
  - **Critério**: `npm run test:e2e` verde; assert de instância única no broker (mock UAZ).
  - **Paralelo**: sequencial

- [ ] **T71 [Onda 6]** — Unit: `visibleWhen` v2 vs locked v1
  - **Arquivo**: src/client/components/projetos/preview/tab-registry.test.ts (ou teste react co-localizado)
  - **Depende de**: T54
  - **O que fazer**: v2 (`journey` presente) → tab não-acionável FILTRADA; v1 → locked atual (regressão).
  - **Critério**: `npm run test:react` verde.
  - **Paralelo**: [P]

- [ ] **T72 [Onda 6]** — E2E: UI progressiva (+ reduced-motion FR-32) *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: test/e2e/builder/builder-v2-progressivo.spec.ts
  - **Depende de**: T54, T55, T101
  - **O que fazer**: Primeira tela só conversa (fullscreen Conhecer); tabs aparecem por fase; NENHUMA tab visível-porém-bloqueada em v2 (critério §8 item 12); **com `prefers-reduced-motion` emulado, transição Conhecer→Revisar SEM animações (FR-32)**. Roda com LLM mock (T89).
  - **Critério**: `npm run test:e2e` verde + re-run de T62 (v1 intacta).
  - **Paralelo**: sequencial

- [ ] **T109 [Onda 5]** — E2E: fluxos delegados por link (FR-34) *(nova — delta share 2026-06-11)*
  - **Arquivo**: test/e2e/builder/builder-v2-capacidades.spec.ts + builder-v2-lancamento.spec.ts (estender os dois)
  - **Depende de**: T107, T108, T70
  - **O que fazer**: Plan §7.2: (a) capacidades.spec — agenda delegada: gerar connect-link, simular conexão remota (flip CONNECTED por seed/stub no DB de teste), "Verificar conexão" confirma e a capacidade vira ativa; (b) lancamento.spec — share WhatsApp: copiar link, abrir `/compartilhar/<token>` em contexto ANÔNIMO mostrando o QR da MESMA Connection, flip CONNECTED por stub → card do builder vira "Conectado ✓" pela autodetecção. Roda com LLM mock (T89).
  - **Critério**: `npm run test:e2e` verde nos dois specs.
  - **Paralelo**: sequencial (fecha a Onda 5)

- [ ] **T102 [Onda 4]** — Unit: silent-submit (FR-29) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/cards/card-submit.routes.test.ts (ou co-localizado existente do card-submit)
  - **Depende de**: T90
  - **O que fazer**: Plan §7.1: com `ackMode: 'silent'` o flip persiste e a resposta é JSON simples SEM SSE (nenhuma chamada a `ensureBuilderAgent`/`buildSseResponse`); cardKey fora da allowlist com `silent` → 400; sem `ackMode` → comportamento conversacional atual intacto.
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T103 [Onda 5]** — Unit: handler `channel_platform` *(nova — delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/cards/handlers/apply/journey-v2.test.ts
  - **Depende de**: T91
  - **O que fazer**: Plan §7.1: min 1 plataforma; refine — `whatsappMode` obrigatório quando whatsapp marcado; rejeição de dupla seleção pré-5b (caso invertido após T94); grava `channel.platforms`/`channel.whatsappMode`; flipa `channelPlatform`; cross-org rejeitado.
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T104 [Onda 5b]** — Unit: `attach-to-agent` pausa por conexão (FR-26) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/server/ai-module/builder/channel/attach-to-agent.test.ts (ou co-localizado)
  - **Depende de**: T92
  - **O que fazer**: Plan §7.1: pausa SÓ deployments da mesma `connectionId`; 2 conexões de canais distintos coexistem ACTIVE (1 por canal); re-attach da MESMA conexão reativa sem duplicar deployment.
  - **Critério**: `npm run test:unit` verde.
  - **Paralelo**: [P]

- [ ] **T105 [Onda 5b]** — E2E: multi-canal simultâneo *(nova — delta 2026-06-11)*
  - **Arquivo**: test/e2e/builder/builder-v2-multicanal.spec.ts
  - **Depende de**: T93, T94, T89
  - **O que fazer**: Plan §7.2/§3.7c: marcar os dois canais → publicar → 2 deployments ACTIVE (1 por canal) → inbound dos 2 canais responde; trocar/reconectar o QR do WhatsApp NÃO derruba o deployment do Instagram (FR-26, critério §8 da Onda 5b). Roda com LLM mock (T89) + mock UAZ. **Inclui re-run da suíte v1/v2 inteira (regressão do 1-canal — gate da Onda 5b)**.
  - **Critério**: `npm run test:e2e` verde + suíte completa verde (regressão).
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

- [ ] **T75 [Onda 7]** — Monitor de drafts v1 ATIVOS + issue de sunset *(alterada pelo delta 2026-06-11)*
  - **Arquivo**: docs/builder/JOURNEY_V2_FUNNEL.md (query JSONB) + issue no repositório
  - **Depende de**: T17, T106
  - **O que fazer**: Query operacional por `builderState->>'journeyVersion'` para contar drafts v1 **ATIVOS — excluindo arquivados** (FR-33: o gate de convergência conta só ativos; o arquivamento de T106 é o que destrava o sunset); criar a issue de sunset JÁ nesta onda (quando drafts v1 ativos = 0 por 60 dias: remover paths v1-only, o branch do resolver e o flag — plan §10 Onda 7).
  - **Critério**: query funciona e exclui arquivados; issue criada com critério de gatilho explícito.
  - **Paralelo**: [P]

- [ ] **T106 [Onda 7]** — Arquivamento de drafts v1 inativos por 90 dias (FR-33) *(nova — delta 2026-06-11)*
  - **Arquivo**: src/server/services/jobs/journey-events-purge.job.ts (mesma rotina/schedule de T88) ou rotina dedicada no worker — reusando a lógica do `archiveProject` existente (`projects/routes/crud.routes.ts`)
  - **Depende de**: T88, T10
  - **O que fazer**: Plan §10 Onda 7 (sunset desbloqueável): rotina recorrente que arquiva BuilderProject draft com `builderState->>'journeyVersion' = '1'` e sem atividade (updatedAt) há 90 dias, reusando o mecanismo de arquivamento EXISTENTE (`archiveProject` — sem deleção, reversível por unarchive). Rodar no MESMO schedule do purge (T88) — **nenhum cron adicional além do aprovado no plan §9**. Fail-open + log `[journey-v2]`; org-scoped por construção (varre por projeto, arquiva via lógica existente).
  - **Critério**: unit — arquiva só draft v1 inativo > 90d (v2, publicados e ativos intocados); idempotente; nunca lança; query de T75 passa a excluir os arquivados.
  - **Paralelo**: [P] (com T74)

- [ ] **T76 [Onda 7]** — Rollout gradual `percentage:10 → 50 → 100` ⚠️ APROVAÇÃO (deploy prod)
  - **Arquivo**: env de homol/prod (`BUILDER_JOURNEY_V2`) — operacional, sem código
  - **Depende de**: T62, T64, T67, T68, T70, T72, T105 (todas as ondas + E2E verdes, incluindo Onda 5b)
  - **O que fazer**: Subir o flag em prod por etapas (seed=organizationId, projetos NOVOS), monitorando o funil (T74) entre etapas. Seguir release-checklist (gate test:all + baselines + rollback plan).
  - **Critério**: 100% de projetos novos em v2 com funil medindo as metas da spec §2; zero regressão v1 reportada.
  - **Paralelo**: sequencial

---

## Mapa de execução por onda

Sequência de execução do /execute (dentro de cada onda, tarefas na ordem listada; [P] podem rodar em paralelo entre si quando as dependências permitem). **A 1ª tarefa de TODA onda é o gate de revalidação de âncoras (T77–T85 — plan §10, risco 11).**

| Onda | Sequência de tarefas | Total |
|---|---|---|
| **Onda 0 — Fundações dark** | T77 → T01 → T02 → (T03 ∥ T04 ∥ T07 ∥ T08) → T09 → (T10 ∥ T88) → T11 → (T57 ∥ T58 ∥ T59 ∥ T60) | 15 |
| **Onda 1 — Engine v2 + leitura** | T78 → T05 → T86 → (T12 ∥ T13) → T14 → T15 → T16 → T17 → T87 → (T18 ∥ T37 ∥ T89) → T61 → T62 | 15 |
| **Onda 2 — Conhecer** | T79 → T19 → (T20 ∥ T21) → T38 → T63 → T64 | 7 |
| **Onda 3 — Revisar** | T80 → T06 → (T22 ∥ T23* ∥ T26 ∥ T39 ∥ T40 ∥ T41 ∥ T42) → T24 → T25 → T43 → T95 → (T65 ∥ T66) → T67 — *T23/T26/T39 dependem de T06 | 16 |
| **Onda 4 — Capacidades** | T81 → (T27 ∥ T28 ∥ T90) → T29 → T30 → T31 → T44 → (T45 ∥ T107) → T102 → T68 | 12 |
| **Onda 5 — Testar + Lançar** | T82 → T32 → T33 → (T34 ∥ T35 ∥ T36 ∥ T52) → T91 → (T96 ∥ T97 ∥ T46 ∥ T48 ∥ T98 ∥ T99) → T49 → T50 → T51 → T47 → T108 → T100 → (T69 ∥ T103) → T70 → T109 | 24 |
| **Onda 5b — Multi-canal simultâneo** | T83 → T92 → (T93 ∥ T94 ∥ T104) → T105 | 6 |
| **Onda 6 — UI progressiva + limpeza** | T84 → T53 → (T54 ∥ T55) → T101 → T56 → (T71 ∥ T73) → T72 | 9 |
| **Onda 7 — Rollout & convergência** | T85 → (T74 ∥ T106) → T75 → T76 | 5 |

Total: **109 tarefas** (15+15+7+16+12+24+6+9+5).

Gate entre ondas: critério "Pronto quando" do plan §10 + `npm run lint && npx tsc --noEmit && npm run test:unit` verdes; E2E da onda verde antes de abrir a próxima. **E2E v2 SEMPRE com o provider LLM mock (T89, NFR-09)** — LLM real só no smoke de homol. A Onda 5b roda DEPOIS da Onda 5 e antes do rollout (T76 depende de T105); Onda 6 não depende da 5b (podem ser paralelizadas se a equipe quiser, mas a ordem default é 5 → 5b → 6 → 7).

## Perguntas em aberto

1. **Onda 7 incluída apesar do prompt do /break citar "ondas 0-6"**: o plan.md (fonte principal) define a Onda 7 (rollout & convergência) — incluída como T74–T76 + T85/T106; T74/T75 são doc/ops leves e T76 é puramente operacional, gated por aprovação de prod. Se a intenção era cortar a Onda 7 do escopo do /execute, remover essas tarefas do mapa.
2. ~~Nome das fases na UI~~ **RESOLVIDA (spec §9 decisão 9, 2026-06-11)**: "Conhecer / Revisar / Testar / Lançar" confirmados como copy definitiva; os títulos vivem em `QUAYER_PHASES` (T15).
3. ~~Jeito de falar / avisar sem pausar~~ **RESOLVIDA (spec §9 decisão 9, 2026-06-11)**: T40 mantém as 3 opções de persona e o handoff-card mantém "avisar sem pausar" como opção avançada — confirmados sem mudança pelo founder.

Sem pendentes abertas no delta 2026-06-11 (spec §9: decisões 5–10 registradas).
