---
Criado: 2026-06-04
Atualizado: 2026-06-04
Revisar em: ao concluir W4 (review) ou se a arquitetura do Builder mudar
Relacionados:
  - src/server/ai-module/builder/chat/handlers/stream-agent-response.ts
  - src/server/ai-module/builder/prompts/whatsapp-agent-system-prompt.ts
  - src/client/components/projetos/chat/chat-panel.tsx
  - prisma/schema.prisma
  - docs/deprecated/ADMIN_SURFACE_REMOVED.md
---

# Orayon Uplift Spec — Builder determinístico + cards

Spec-contrato para a evolução do meta-agente Builder, inspirada no onboarding por cards do produto irmão **Orayon.Profissões**. Gerada por 5 agentes de design ancorados nos arquivos reais (workflows `wkvdz5v7c` + `wswdr5ost`). É o contrato compartilhado das fases de implementação (W2 fundação → W3 cards → W4 review).

## Princípio central

Hoje o Builder deixa o **LLM decidir o próximo passo** lendo um fluxo de 8 etapas em prosa no system prompt, e a aprovação chega como **texto sintético interpretado por regex** ("pode criar"). O frontend re-deriva o progresso por conta própria → **duas fontes de verdade**.

O uplift cria **uma fonte única determinística**: um objeto `BuilderState` (campos + sentinelas `*_confirmed`) e uma função pura `nextPendingStep(state)` que alimenta **ao mesmo tempo** (a) o banner do system prompt e (b) o progresso da UI. Cards aplicam estado via PATCH; o LLM lê a decisão do estado, nunca de regex.

## A ÚNICA mudança de schema

```prisma
model BuilderProjectConversation {
  // ...
  builderState Json?   // card-owned fields + sentinelas *_confirmed; null = DEFAULT_BUILDER_STATE (backfill lazy)
}
```
Nullable + default em código → conversas existentes seguem funcionando e caem no fallback legado até o primeiro card-submit. Migration: `prisma migrate dev --name add_builder_state` (aprovação no PR).

## Arquivos canônicos (importados por todo o resto)

| Arquivo | Papel |
|---|---|
| `src/server/ai-module/builder/cards/builder-state.ts` | `BuilderState` (type + Zod) + `DEFAULT_BUILDER_STATE` + `applyConfirmation()` + helpers de PATCH. **Criar primeiro.** |
| `src/server/ai-module/builder/state/next-pending-step.ts` | Função pura `nextPendingStep(state, ctx) → Readiness`. Owns `QUAYER_STEPS`. Sem IO, 100% testável. |
| `src/server/ai-module/builder/state/readiness-resolver.ts` | `getReadiness(conversationId, ctx)` — carrega estado + sinais ao vivo (plano, BYOK, instância WA), filtra por `organizationId`. |
| `src/server/ai-module/builder/state/readiness.types.ts` | `Readiness`, `StepId`, `StepEngineContext`, `ReadinessBlocker` (reusa união `DeployRunnerBlockerCheck`). |
| `src/server/ai-module/builder/cards/card-submit.routes.ts` + `handlers/apply-card-submit.ts` + `card-submit.schemas.ts` | Rota `POST /builder/projects/:id/cards/:cardKey/submit`: aplica estado determinístico + dispara turno de ACK pelo SSE existente. |
| `src/server/ai-module/builder/prompts/journey-rules.ts` + `chat/handlers/build-journey-banner.ts` | Banner por turno: `# PRÓXIMO PASSO` / `# PRONTIDÃO` / `# CAMPOS: card vs livre` / `# ESTADO ATUAL` + regras de jornada-livre. |
| `src/client/components/projetos/chat/cards/card-registry.tsx` + `types.ts` + `use-card-submit.ts` + `card-shell.tsx` | Framework de cards via registry (espelha `tab-registry.tsx`). Renderer único substitui o if-chain em `ToolCallCard`. |

## As 5 áreas (resumo)

1. **Step-engine** — `nextPendingStep` + `getReadiness` + endpoint `GET /builder/projects/:id/readiness`. As 6 checagens pré-deploy em prosa viram `blockers[]` tipados reusando o vocabulário do `DeployRunnerBlockerCheck` (agent|prompt|version|channel|plan|byok). Deleta os heurísticos FE `derive-stages.ts`/`derive-readiness.ts`.
2. **Card-action protocol** — rota de submit + coluna `builderState` + param `cardInstruction` em `stream-agent-response.ts`. Migra os 3 cards atuais (agent_approval, tool_selection, channel) de `onSend(texto)` → `onSubmit(payload)`. Remove as regras de regex em `whatsapp-agent-system-prompt.ts:103-128`.
3. **Card-catalog-fe** — registry + 12 cards novos (tabela abaixo), cada um mapeado a um model **que já existe**.
4. **Journey-rules-prompt** — `buildJourneyBanner` injetado no chokepoint `stream-agent-response.ts:129-133`; aceita texto-livre que casa com o campo, trata digressão (1-3 linhas + re-apresenta o passo), não pula campo obrigatório em silêncio, manda usar o card para campos card-owned.
5. **Source-ingestion** — "cole seu site/IG": extractor pré-LLM em `chat.routes.ts` → fila BullMQ `quayer:source-enrich` → reusa `ingestSource()` (extract→chunk→embed→pgvector) + síntese (padrão `niche-researcher`) que pré-preenche `builderState.sourceIngestion` (proposto, atrás de "Aceitar").

## Catálogo de cards

| Card | Backing model (existente) | Sentinela |
|---|---|---|
| agent_persona (preview do greeting ao vivo) | `AIAgentConfig` | persona_confirmed |
| services_oferece_nao | — (vai pro prompt) | services_confirmed |
| business_hours (presets + manual) | — (builderState) | hours_confirmed |
| pricing (BRL em cents) | `PriceList` + `PriceItem` | pricing_confirmed |
| qualification_action (avisa/agenda/lead) | — (gate) | qualification_action_confirmed |
| qualification_steps | — (prompt) | qualification_steps_confirmed |
| team_structure + members (roleta) | `Department` + `DepartmentMember` | team_confirmed |
| calendar_connect | `CalendarConnection` | calendar_confirmed |
| activation_mode (4 enums + keywords) | `AIAgentConfig` | activation_confirmed |
| preview_summary ("Tudo certo?") | — (recap) | summary_confirmed (gate de deploy) |
| quick_reply_chips | — | (sem sentinela) |
| source_progress | `KnowledgeSource` + builderState | source_confirmed |

## Ordem de build (fases de workflow)

- **W2 — Fundação** (este round): canônicos + schema/migration + engine + card-action + journey banner + wiring nos arquivos compartilhados. **Sem cards FE novos ainda.**
- **W3 — Cards** (1 agente por card, arquivos disjuntos): os 12 cards em cima do registry.
- **W4 — Review adversarial**: correção, padrões Igniter, isolamento por org, TS strict/zero-`any`, testes. Depois `tsc --noEmit` + lint + testes.

## Decisões resolvidas (defaults adotados)

- **Feature flag**: comportamento novo atrás de flag de rollout (padrão `lib/feature-flags/`, como auth-v3). Liga por org.
- **Consentimento de fonte**: auto-cria `KnowledgeSource` + mostra card, mas o **pré-preenchimento dos campos** só commita atrás de "Aceitar".
- **Síntese de fonte**: escreve só valores **propostos**; o owned/`*_confirmed` só pelo "Aceitar" do card (anti-alucinação).
- **builder-state.ts** define o tipo canônico; step-engine e cards **importam** (sem dependência circular).
- **Migration**: só edita `schema.prisma` + nota para rodar `prisma migrate`; nenhum agente executa prisma contra DB.
- **getReadiness**: invalida no finish do SSE/card-submit (sem polling).

## Riscos-chave a vigiar

- Contenção de arquivos compartilhados (`stream-agent-response.ts`, `chat.routes.ts`, `builder.controller.ts`) → 1 dono por arquivo, integração serializada.
- `getReadiness` no caminho quente pré-stream → 1 include batched + counts baratos (vigiar p95).
- Backfill `null → DEFAULT_BUILDER_STATE` nunca pode crashar (coberto por teste de estado vazio).
- Sentinelas resolvidas **server-side** por `organizationId` — nunca confiar em flag vinda do body.
