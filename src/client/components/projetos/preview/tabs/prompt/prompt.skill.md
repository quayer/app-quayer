# Skill: prompt/ — Editor do System Prompt do Agente

## Proposito
Aba "Prompt" do workspace de projetos. Permite ao usuario editar o system
prompt do agente gerado pelo Builder IA, com insights em tempo real, auto-save
debounced e historico de versoes (ainda placeholder).

Padrao: **Modular Monolith** — cada arquivo = uma intencao unica.
Tudo abaixo de 400 linhas. Zero `any`.

## Entry Point
- `prompt-tab.tsx` — orquestrador fino. Exporta `PromptTab` e `PromptTabProps`.
- Registrado em `src/client/components/projetos/preview/tab-registry.tsx`
  com `visibleFor: ['ai_agent']`.

## Inventario de Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prompt-tab.tsx` | Orquestrador. Estado (value, expanded, insightsOpen) e composicao. |
| `prompt-types.ts` | Types: `PromptTabProps`, `SaveState`, `PromptInsights`, `AppTokens`. |
| `prompt-utils.ts` | `analyzePrompt(text)` e `formatNumber(n)` — puros, sem React. |
| `prompt-header.tsx` | Titulo + badge "Gerado pelo Builder" + contador + indicador de save. |
| `prompt-editor.tsx` | Toolbar (Regenerar/Copiar/Expandir) + Textarea + gutter `LineNumbers`. |
| `toolbar-button.tsx` | Botao reusavel da toolbar do editor. |
| `prompt-insights-section.tsx` | Card colapsavel com metricas + pills de qualidade. |
| `version-history.tsx` | Placeholder de versoes anteriores (graceful empty). |
| `prompt-actions.tsx` | Botoes primarios "Regenerar com Builder" e "Copiar Prompt". |
| `prompt-empty-state.tsx` | Estado vazio quando `project.aiAgent` nao existe. |
| `hooks/use-prompt-autosave.ts` | Debounce 2s + ticker 1s para "salvo ha Ns". |
| `hooks/use-prompt-actions.ts` | `handleCopy` (clipboard + toast) + `handleRegenerate` (event). |

## Data Flow

```
project.aiAgent?.systemPrompt
        |
        v
  [PromptTab] ──────────────────┐
   value, setValue              │
   expanded, insightsOpen       │
        │                       │
        ├─> usePromptAutosave ──┼─> saveState, tick
        ├─> usePromptActions ───┼─> handleCopy, handleRegenerate
        ├─> analyzePrompt ──────┼─> insights (char/line/section/tokens/qualidade)
        │                       │
        ├─> PromptHeader (insights.charCount, saveState, tick)
        ├─> PromptEditor (value, onChange, lineCount, expanded, actions)
        ├─> PromptInsightsSection (insights, open)
        ├─> VersionHistory
        └─> PromptActions (onRegenerate, onCopy)
```

Evento disparado pelo "Regenerar": `window.dispatchEvent(new CustomEvent('builder:focus-chat', { detail: { message } }))`.

## Regras
- Tema sempre via `useAppTokens()` — nao hardcode cores (exceto brand green/red das pills).
- Auto-save hoje e stub (TODO: `PATCH /api/v1/builder/agents/:id/prompt`).
- Version history: nao popular com mock — deixar vazio ate termos endpoint real.
- Textarea controlada pelo orquestrador; hooks nao tocam DOM.
