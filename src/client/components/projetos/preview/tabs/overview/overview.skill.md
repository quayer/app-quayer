---
Criado: 2026-06-10
Atualizado: 2026-06-10
Revisar em: mudança no step-engine (next-pending-step.ts) ou no contrato de Readiness
Relacionados:
  - src/server/ai-module/builder/state/next-pending-step.ts
  - src/server/ai-module/builder/state/readiness.types.ts
  - src/client/components/projetos/preview/deploy-gate.ts
  - specs/jornada-builder-v2/spec.md
---

# Overview Tab — Skill

## Propósito

Tab "Visão Geral" do workspace do Builder IA. Mostra a identidade do agente,
o progresso da jornada e a prontidão para publicar — TUDO espelhado do
step-engine determinístico do servidor (FR-18 da spec jornada-builder-v2:
fonte única de progresso, a mesma do banner do chat e do active-step card).

**Nada de progresso é derivado localmente.** A fonte é
`GET /builder/projects/:id/readiness` (`api.builder.getReadiness.useQuery`),
que devolve `Readiness`: `steps[]` (checklist ordenado com `done`),
`step` (próximo passo ativo), `completenessPct`, `blockers[]` (os 6 pre-deploy
checks tipados: plan/byok/agent/prompt/version/channel) e `isDeployReady`.

## Entry point

`overview-tab.tsx` é o orquestrador. Consome `useProjectReadiness` e roteia
callbacks `onTabChange`. Registrado em
`src/client/components/projetos/preview/tab-registry.tsx` como tab _core.

## Inventário de arquivos

### Raiz
- `overview-tab.tsx` — Orquestrador: empty state, skeletons, composição.
- `types.ts` — Tipos `Stage`, `StageStatus`, `ReadinessItem` (view-models).
- `overview.skill.md` — Este documento.

### `components/`
- `empty-state.tsx` — Estado vazio quando não há agente nem conversa.
- `agent-identity-header.tsx` — Nome, provider/modelo e badge de status.
- `first-message-preview.tsx` — Bolha WhatsApp com a saudação do agente.
- `progress-header.tsx` — Barra de progresso; a largura usa o
  `completenessPct` canônico do readiness.
- `stage-list.tsx` / `stage-row.tsx` — Checklist da jornada (done/active/pending).
- `deploy-readiness-card.tsx` — "Prontidão para publicar": espelha os
  `blockers` reais; CTA gated por `canOpenDeploy` (gate único, ver abaixo).
- `readiness-row.tsx` — Linha de requisito (check/x + detalhe do blocker).
- `quick-actions.tsx` — CTAs contextuais; os que navegam para "Publicar"
  usam o MESMO `DeployGate`.
- `action-button.tsx` — Botão primário/secundário (suporta `disabled`+`title`).
- `metrics-card.tsx` — Card de métricas (apenas publicado).

### `hooks/`
- `use-project-readiness.ts` — Dono do `getReadiness.useQuery` + polling leve:
  refetch on window focus e quando a conversa avança (sinal derivado de
  `messages.length` + nº de tool-results; 1 refetch por mudança).

### `helpers/`
- `readiness-adapters.ts` — Adaptadores puros do payload `Readiness` para os
  view-models (`unwrapReadiness`, `stepsToStages`, `blockersToChecklist`).
  Substituíram os antigos `derive-stages.ts`/`derive-readiness.ts`/
  `tool-stage-map.ts` (progresso re-derivado de tool-calls — removidos).
- `derive-first-message.ts` — Extrai a saudação (tool call ou system prompt).

## Gate único da publicação

`src/client/components/projetos/preview/deploy-gate.ts` exporta
`canOpenDeploy(project): DeployGate` — usado pela tab "Publicar"
(`tab-registry.getTabsForProjectWithLocked`), pelo clique em tab travada
(`preview-panel.tsx` → toast/title com o motivo) e pelos CTAs desta tab.
Tab e botões nunca podem discordar.

## Fluxo de dados

**Props in:** `project: WorkspaceProject`, `messages: ChatMessage[]`
(saudação + sinal de atividade), `onTabChange?`.

**Dentro:**
1. `useProjectReadiness(project.id, messages)` → `{ readiness, stages,
   checklist, isLoading }`.
2. Sem atividade → `<EmptyState />`. Carregando → skeletons. Falha →
   parágrafo honesto (NFR-06), nunca progresso inventado.
3. Com readiness: `ProgressHeader` + `StageList` + `DeployReadinessCard` +
   `QuickActions` + `MetricsCard` (se publicado).

## Convenções

- Todos os componentes recebem `tokens: AppTokens` (theme-reactive).
- Zero `any` — payload desembrulhado via `unwrapReadiness` (narrowing
  estrutural; tolera envelope plano/embrulhado/array do client Igniter).
- Componentes "use client".
