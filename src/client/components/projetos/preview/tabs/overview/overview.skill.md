---
Criado: 2026-06-10
Atualizado: 2026-06-11
Revisar em: mudança no step-engine (next-pending-step.ts) ou no contrato de Readiness
Relacionados:
  - src/client/components/projetos/workspace.tsx
  - src/server/ai-module/builder/state/next-pending-step.ts
  - src/server/ai-module/builder/state/readiness.types.ts
  - src/client/components/projetos/preview/deploy-gate.ts
  - specs/jornada-builder-v2/spec.md
---

# Overview Tab — Skill

## Propósito

Tab "Visão Geral" do workspace do Builder IA. Mostra o próximo passo, a
identidade do agente, o progresso da jornada e a prontidão para publicar — TUDO espelhado do
step-engine determinístico do servidor (FR-18 da spec jornada-builder-v2:
fonte única de progresso, a mesma do banner do chat e do active-step card).

**Nada de progresso é derivado localmente.** A fonte é
`GET /builder/projects/:id/readiness` (`api.builder.getReadiness.useQuery`),
que devolve `Readiness`: `steps[]` (checklist ordenado com `done`),
`step` (próximo passo ativo), `completenessPct`, `blockers[]` (os 6 pre-deploy
checks tipados: plan/byok/agent/prompt/version/channel) e `isDeployReady`.

## Entry point

`workspace.tsx` é o dono único da query `getReadiness` e injeta o snapshot via
`ReadinessContext`/`TabRenderContext`. `overview-tab.tsx` é o orquestrador
visual: recebe `readiness` por props, adapta para view-models e roteia callbacks
`onTabChange`. Registrado em `src/client/components/projetos/preview/tab-registry.tsx`
como tab _core.

## Inventário de arquivos

### Raiz
- `overview-tab.tsx` — Orquestrador: empty state, skeletons, composição.
- `types.ts` — Tipos `Stage`, `StageStatus`, `ReadinessItem` (view-models).
- `overview.skill.md` — Este documento.

### `components/`
- `empty-state.tsx` — Estado vazio quando não há agente nem conversa.
- `agent-identity-header.tsx` — Nome, provider/modelo (nomes amigáveis via
  `model-catalog`) e badge de status.
- `first-message-preview.tsx` — Bolha WhatsApp com a saudação do agente
  (sources: `card` = builderState.persona.greeting; `prompt` = regex no
  systemPrompt). "Editar" abre o chat com rascunho pré-preenchido.
- `next-step-card.tsx` — CTA dominante do próximo passo da jornada; navega para
  a tab dona do passo ou foca o chat quando a ação é conversacional.
- `progress-header.tsx` — Barra + texto de progresso, AMBOS derivados do
  `completenessPct` canônico (nunca "X de N" com N bruto — contradiz a barra,
  que exclui passos não-aplicáveis do denominador).
- `stage-list.tsx` / `stage-row.tsx` — Checklist da jornada (done/active/pending).
- `capabilities-section.tsx` — Resumo "O que o agente faz"; não configura inline.
  Cada linha navega para a tab dona do detalhe ou reabre o card correto no chat.
- `capabilities-helpers.tsx` — Query `getCapabilities` com fallback nativo e a
  primitiva visual `CapabilityRow`.
- `deploy-readiness-card.tsx` — "Prontidão para publicar": espelha os
  `blockers` reais; CTA gated por `canOpenDeploy` (gate único, ver abaixo).
- `readiness-row.tsx` — Linha de requisito; o detalhe do blocker é AÇÃO:
  Link (`redirect` para /conta, /integracoes) ou navegação interna
  (`tab: 'deploy'` para canal/versão).
- `action-button.tsx` — Botão primário/secundário (suporta `disabled`+`title`).
- `metrics-card.tsx` — Card de métricas (apenas publicado).

### `helpers/`
- `readiness-adapters.ts` — Adaptadores puros do payload `Readiness` para os
  view-models (`unwrapReadiness`, `stepsToStages`, `blockersToChecklist`).
  Substituíram os antigos `derive-stages.ts`/`derive-readiness.ts`/
  `tool-stage-map.ts` (progresso re-derivado de tool-calls — removidos).
- `derive-first-message.ts` — Extrai a saudação: 1º o greeting canônico de
  `readiness.builderState.persona.greeting` (card de persona); fallback regex
  no system prompt. O antigo caminho por tool-call era código morto (nenhum
  tool do Builder bate no padrão) e foi removido.

## Gate único da publicação

`src/client/components/projetos/preview/deploy-gate.ts` exporta
`canOpenDeploy(project): DeployGate` — usado pela tab "Publicar"
(`tab-registry.getTabsForProjectWithLocked`), pelo clique em tab travada
(`preview-panel.tsx` → toast/title com o motivo) e pelos CTAs desta tab.
Tab e botões nunca podem discordar.

## Fluxo de dados

**Props in:** `project: WorkspaceProject`, `messages: ChatMessage[]`
(saudação + estado vazio), `readiness?`, `readinessLoading?`,
`readinessError?`, `onTabChange?`.

**Dentro:**
1. `workspace.tsx` → `ReadinessContext` → `PreviewPanel` → `TabRenderContext`
   entrega `{ readiness, readinessLoading, readinessError }`.
2. `overview-tab.tsx` adapta `readiness` com `stepsToStages`,
   `journeyToPhases` e `blockersToChecklist`.
3. Sem atividade → `<EmptyState />`. Carregando → skeletons. Falha →
   parágrafo honesto (NFR-06), nunca progresso inventado.
4. Com readiness: `NextStepCard` + identidade/saudação + progresso por fases +
   `CapabilitiesSection`. `DeployReadinessCard` aparece só na fase "Lançar" ou
   quando o deploy já está pronto. `MetricsCard` aparece se publicado.

## Convenções

- Todos os componentes recebem `tokens: AppTokens` (theme-reactive).
- Zero `any` — payload desembrulhado via `unwrapReadiness` (narrowing
  estrutural; tolera envelope plano/embrulhado/array do client Igniter).
- Componentes "use client".
