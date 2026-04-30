# Overview Tab — Skill

## Propósito

Tab "Visão Geral" do workspace do Builder IA. Funciona como um **Mission Control
dinâmico**: mostra a identidade do agente, o progresso da construção (derivado
dinamicamente das tool calls da conversa com o Builder), checklist de prontidão
para deploy, atalhos rápidos e métricas (quando publicado).

Nada é hardcoded — os estágios aparecem conforme o AI usa ferramentas. Se o
fluxo mudar, a UI reflete automaticamente.

## Entry point

`overview-tab.tsx` é o orquestrador. Ele compõe sub-componentes, consome o hook
`useOverviewDerivations` e roteia callbacks `onTabChange`. Mantido fino (~80
linhas).

Registrado em `src/client/components/projetos/preview/tab-registry.tsx` como
tab _core (visível para todos os `ProjectType`). O `PreviewPanel` consome o
registry dinamicamente — não há mais re-export shim em `projetos/tabs/`.

## Inventário de arquivos

### Raiz
- `overview-tab.tsx` — Orquestrador: empty state, composição das seções.
- `types.ts` — Tipos `Stage`, `StageStatus`, `ReadinessItem`.
- `overview.skill.md` — Este documento.

### `components/`
- `empty-state.tsx` — Estado vazio quando não há agente nem conversa.
- `agent-identity-header.tsx` — Nome, provider/modelo e badge de status do agente.
- `progress-header.tsx` — Barra de progresso (X de Y concluídas).
- `stage-list.tsx` — Card que envolve a lista de estágios.
- `stage-row.tsx` — Linha individual de estágio (done/active/pending com ícone).
- `deploy-readiness-card.tsx` — Card checklist + botão "Publicar".
- `readiness-row.tsx` — Linha de requisito do checklist (check/x).
- `quick-actions.tsx` — Linha de botões (Playground, Prompt, WhatsApp, Publicar).
- `action-button.tsx` — Botão primário/secundário reutilizável.
- `metrics-card.tsx` — Card de métricas (mensagens, taxa de resposta).

### `hooks/`
- `use-overview-derivations.ts` — `useMemo` de stages, readiness e
  `completedToolNames` a partir de `project` + `messages`.

### `helpers/`
- `tool-stage-map.ts` — Mapeamento `toolName → label` + `detailFn` para
  extrair detalhes do resultado da tool call.
- `derive-stages.ts` — Varre mensagens, coleta tool calls concluídas e monta o
  array de estágios (inclui inferência a partir de `project.aiAgent`).
- `derive-readiness.ts` — Monta o checklist de 5 itens de prontidão para deploy.
- `get-completed-tool-names.ts` — Extrai `Set<string>` dos nomes de tools
  concluídas nas mensagens.

## Fluxo de dados

**Props in:**
- `project: WorkspaceProject` — dados do projeto e do `aiAgent`.
- `messages: ChatMessage[]` — histórico do chat com o Builder (tool calls).
- `onTabChange?: (tab: PreviewTab) => void` — callback de navegação.

**Dentro:**
1. `useOverviewDerivations(project, messages)` calcula `stages`, `readiness`,
   `completedToolNames` memorizados.
2. Se `!aiAgent && stages.length === 0` → `<EmptyState />` e retorna.
3. Caso contrário, renderiza: `AgentIdentityHeader` (condicional) →
   `ProgressHeader` + `StageList` (se houver stages) → `DeployReadinessCard` →
   `QuickActions` → `MetricsCard` (se `status !== "draft"`).

**Events out:**
- Cliques nos botões de `QuickActions` e no "Publicar" disparam
  `onTabChange("playground" | "prompt" | "deploy")`.

## Convenções

- Todos os componentes recebem `tokens: AppTokens` (theme-reactive).
- Zero `any` — `unknown` + narrowing via `typeof === "object"` para resultados
  de tool calls.
- Componentes "use client" — todos interagem com tokens/hooks de client.
