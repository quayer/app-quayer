---
Criado: 2026-06-09
Atualizado: 2026-06-09
Relacionados:
  - specs/builder-handoff-unificado/plan.md
  - specs/builder-handoff-unificado/spec.md
---

# Tarefas — Handoff unificado do Chat Builder

## Checklist final
- [x] Todos os FRs da spec têm tarefas (FR-01..FR-10 cobertos por T01–T13)
- [x] Critérios de aceitação têm testes (T13 engine + T14 migração)
- [x] Nenhuma tarefa edita `igniter.client.ts`/`igniter.schema.ts` (auto-gerados)
- [x] Itens de aprovação do plano marcados (deletar 4 cards + contrato JSONB — aprovados)

> ⚠️ **Bloco atômico de compile (T01–T13):** por causa da restrição de tsc (BE + FE precisam
> alinhar de uma vez), as tarefas T01–T13 são **editadas em ordem mas commitadas JUNTAS**
> (1 commit). O gate `tsc --noEmit` + `next-pending-step.test.ts` verdes roda **ao fim de T13**.
> T14+ são commits separados (não quebram tsc).

## Fase 1 — Dados
> **N/A** — sem `prisma/schema.prisma`, sem migration. Estado é JSONB (`builderState`).

## Fase 2 — Validação (Zod + tipos) · bloco atômico

- [ ] **T01** — Estado canônico do handoff + migração legada
  - **Arquivo**: `src/server/ai-module/builder/cards/builder-state.ts`
  - **Depende de**: —
  - **O que fazer**: criar `handoffStateSchema` (`mode` enum solo/roleta/departamentos/nenhum,
    `alsoSchedule`, `steps[]`, `departmentName?`, `departmentType?`, `members[]` (reusa
    `teamMemberSchema`), `openingMessage?`); add `handoff` ao `builderStateSchema` e remover
    `qualification`/`team`; em `confirmations` add `handoff`, remover `qualificationAction`/
    `qualificationSteps`/`team`/`handoffPairing`; implementar `migrateLegacyHandoff(raw)` chamada
    em `parseBuilderState` (mapeamento Q1-Q3 da spec, preserva steps/openingMessage, herda confirmação).
  - **Critério**: tipos compilam isolados; `migrateLegacyHandoff` é pura e não lança.
  - **Paralelo**: sequencial (raiz do bloco)

- [ ] **T02** — Union `StepId`
  - **Arquivo**: `src/server/ai-module/builder/state/readiness.types.ts`
  - **Depende de**: T01
  - **O que fazer**: remover `qualification_action`/`qualification_steps`/`team`/`handoff_pairing`,
    adicionar `handoff`.
  - **Critério**: union exporta `handoff`.

## Fase 3 — Backend (handlers · engine · saga) · bloco atômico

- [ ] **T03** — Payload Zod do card
  - **Arquivo**: `src/server/ai-module/builder/cards/card-submit.schemas.ts`
  - **Depende de**: T01
  - **O que fazer**: `handoffPayloadSchema` na discriminatedUnion; remover os 4 payloads antigos.
  - **Critério**: union aceita `cardKey:'handoff'`, rejeita os 4 removidos.

- [ ] **T04** — Handler `applyHandoff`
  - **Arquivo**: `src/server/ai-module/builder/cards/handlers/apply-card-submit.ts`
  - **Depende de**: T03
  - **O que fazer**: `applyHandoff(state,payload)` (sanitiza members→E.164, dedupe, valida mode),
    flip `confirmations.handoff`; remover os 4 cases antigos; atualizar o guard exaustivo `_never`.
  - **Critério**: switch exaustivo compila; submit de `handoff` persiste e confirma.

- [ ] **T05** — Step-engine determinístico
  - **Arquivo**: `src/server/ai-module/builder/state/next-pending-step.ts`
  - **Depende de**: T01, T02
  - **O que fazer**: fundir as 4 `StepDefinition` em `handoff`; remover overrides
    `handoffPairingActive`; `needsCalendar` → `state.handoff.alsoSchedule===true`; atualizar
    `REQUIRED_STEPS`, completeness e `FIELD_OWNERSHIP` (campos do handoff = 'card').
  - **Critério**: `nextPendingStep` retorna `handoff` no lugar dos 4; calendar gateia por alsoSchedule.

- [ ] **T06** — Resolver repassa o handoff
  - **Arquivo**: `src/server/ai-module/builder/state/readiness-resolver.ts`
  - **Depende de**: T01
  - **O que fazer**: garantir que `builderState.handoff` chega ao frontend (sem lógica nova).
  - **Critério**: readiness retorna `handoff` no `builderState`.

- [ ] **T07** — Materialização no deploy
  - **Arquivo**: `src/server/ai-module/builder/deploy/**/materialize-team.handler.ts`
  - **Depende de**: T01
  - **O que fazer**: ler `state.handoff` (solo→routing self; roleta/departamentos→department;
    nenhum→sem handoff) + `alsoSchedule`. Repontar de `state.team`/`state.qualification`.
  - **Critério**: saga compila; mapeamento de modo→routing coberto por tipo.

## Fase 4 — Frontend · bloco atômico

- [ ] **T08** — `CardKey` union (FE)
  - **Arquivo**: `src/client/components/projetos/chat/cards/types.ts`
  - **Depende de**: T03
  - **O que fazer**: remover os 4 cardKeys, adicionar `handoff` (a asserção
    `RegisteredCardKey extends CardKey` valida o lockstep).
  - **Critério**: tipo compila; asserção verde.

- [ ] **T09** — Novo card `handoff` (4 seções)  ⏱ pode passar de 30 min → subdividir ao executar
  - **Arquivo**: `src/client/components/projetos/chat/cards/handoff-card.tsx` (NOVO)
  - **Depende de**: T01, T08
  - **O que fazer**: (1) seletor de modo; (2) roster condicional (porta editor de membros do
    team-structure, WhatsApp/connectionId UMA vez); (3) roteiro ordenável (porta do
    qualification-steps); (4) toggle "também agenda" + textarea de abertura. `onSubmit(payload)`.
  - **Critério**: render por modo; submit bate com `handoffPayloadSchema`.
  - **Subtarefas**: T09a modo, T09b roster, T09c roteiro, T09d agenda+abertura.

- [ ] **T10** — Registry + pinned slot
  - **Arquivo**: `src/client/components/projetos/chat/cards/card-registry.tsx` (+ `chat-panel.tsx`)
  - **Depende de**: T09
  - **O que fazer**: registrar `handoff`→`HandoffCard` (StepId `handoff`); corrigir docstring; validar pinned slot.
  - **Critério**: card aparece no passo `handoff`.

- [ ] **T11** — Resumo consolidado
  - **Arquivo**: `src/client/components/projetos/chat/cards/preview-summary-helpers.ts`
  - **Depende de**: T01
  - **O que fazer**: `summarizeHandoff(state.handoff, state.calendar)` no lugar de
    `summarizeQualification`+`summarizeTeam`.
  - **Critério**: preview_summary renderiza a seção handoff.

- [ ] **T12** — Deletar os 4 cards antigos  **[APROVADO]**
  - **Arquivos**: `qualification-action-card.tsx`, `qualification-steps-card.tsx`,
    `team-structure-card.tsx`, `handoff-pairing-card.tsx`
  - **Depende de**: T10, T11 (nada mais referencia)
  - **O que fazer**: `git rm` os 4; remover imports órfãos.
  - **Critério**: nenhum import quebrado; sem código morto.

## Fase 5 — Testes (parte do gate verde)

- [ ] **T13** — Reescrever a suíte do engine  **[GATE]**
  - **Arquivo**: `src/server/ai-module/builder/state/next-pending-step.test.ts`
  - **Depende de**: T05
  - **O que fazer**: trocar os 4 sentinels por `handoff` nos fixtures; casos solo (sem roster),
    roleta (com roster), `alsoSchedule` liga calendar, `nenhum` satisfaz.
  - **Critério**: ✅ **`npx tsc --noEmit` + `next-pending-step.test.ts` verdes → COMMIT ATÔMICO (T01–T13).**

- [ ] **T14** — Teste da migração legada  [P]
  - **Arquivo**: `src/server/ai-module/builder/state/migrate-legacy-handoff.test.ts` (NOVO)
  - **Depende de**: T01 (pode ir no mesmo commit ou logo após)
  - **O que fazer**: cada mapeamento Q1-Q3 + preservação de steps/openingMessage + `handoff`
    herdado (não re-exibe).
  - **Critério**: `npm run test:unit` verde.

## Fase 6 — Observabilidade & polish (commits separados — não quebram tsc)

- [ ] **T15** — Doutrina de prompt
  - **Arquivos**: `prompts/journey-rules.ts` + `prompts/whatsapp-agent-system-prompt.ts`
  - **Depende de**: bloco atômico mergeado
  - **O que fazer**: etapa única `handoff` na doutrina; remover refs aos 4 passos antigos.
  - **Critério**: tsc verde; sem refs stale aos cardKeys removidos.

- [ ] **T16** — Backfill por org (ops)  [P]
  - **Arquivo**: `scripts/` (novo script de re-provisionamento do system prompt por org)
  - **Depende de**: T15
  - **O que fazer**: re-aplicar o BUILDER_SYSTEM_PROMPT às orgs (ensureBuilderAgent usa `update:{}`).
  - **Critério**: dry-run lista orgs afetadas.

- [ ] **T17** — Docs  [P]
  - **Arquivos**: `docs/builder/MELHORIAS_BLUEPRINT.md` + MEMORY
  - **Depende de**: bloco atômico mergeado
  - **O que fazer**: marcar Onda 2 como feita; registrar o modelo de 3+1 modos + a migração.
  - **Critério**: doc atualizado com frontmatter.

## Perguntas em aberto
Nenhuma bloqueante — Q1-Q3 da spec resolvidas com defaults aprovados.

---

**Próximo passo:** `/execute T01` (inicia o bloco atômico; commit só ao fim de T13 com tsc+testes verdes).
