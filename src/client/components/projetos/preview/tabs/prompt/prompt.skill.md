---
Criado: 2026-02-01
Atualizado: 2026-06-11
Revisar em: quando mudar o contrato de PATCH /builder/projects/:id/prompt ou o fluxo de conflito
Relacionados:
  - src/server/ai-module/builder/projects/routes/prompt.routes.ts
  - src/server/ai-module/builder/projects/projects.repository.ts
  - docs/deprecated/IDENTITY_TAB.md
---

# Skill: prompt/ — Editor do System Prompt do Agente

## Propósito
Aba "Prompt" do workspace de projetos. Permite ao usuário editar o system
prompt do agente gerado pelo Builder IA, com insights em tempo real, auto-save
debounced **user-driven** com detecção de conflito, e histórico de versões real.

Padrão: **Modular Monolith** — cada arquivo = uma intenção única.
Tudo abaixo de 400 linhas. Zero `any`.

## Entry Point
- `prompt-tab.tsx` — orquestrador fino. Exporta `PromptTab` e `PromptTabProps`.
- Registrado em `src/client/components/projetos/preview/tab-registry.tsx`
  com `visibleFor: ['ai_agent']` e `requiresAgent: true` (a tab nunca monta sem
  agente — por isso não existe empty state aqui).

## Inventário de Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `prompt-tab.tsx` | Orquestrador. Baseline do servidor (`baselineRef`), flag de edição do usuário (`userEditedRef`), banner de conflito, composição. |
| `prompt-types.ts` | Types: `PromptTabProps`, `SaveState`, `PromptInsights`, `VersionListItem`, `VersionHistoryProps`. |
| `prompt-utils.ts` | `analyzePrompt(text)` e `formatNumber(n)` — puros, sem React. |
| `prompt-header.tsx` | Título + contador + indicador de save. |
| `prompt-editor.tsx` | Toolbar (Regenerar/Copiar/Expandir) + Textarea + gutter `LineNumbers`. |
| `toolbar-button.tsx` | Botão reusável da toolbar do editor. |
| `prompt-insights-section.tsx` | Card colapsável com métricas + pills de qualidade. |
| `version-history.tsx` | Histórico real (`GET /projects/:id/versions`), diff vs editor, rollback com `onRestored(content)`. |
| `hooks/use-prompt-autosave.ts` | Debounce 2s user-driven + precondição otimista (`baseUpdatedAt` → 409) + `forceSave`/`acceptServerState`. |
| `hooks/use-prompt-actions.ts` | `handleCopy` (clipboard + toast) + `handleRegenerate` (event). |

> **Removido (Jornada v2, 2026-06-11):** a antiga seção embutida `IdentityTab`
> foi deletada — o disclosure agora vive no card `agent_review` e é injetado no
> systemPrompt pelo `create_agent` (ver `docs/deprecated/IDENTITY_TAB.md`). O
> endpoint `PATCH /builder/identity/:projectId` permanece para edição pós-criação.
> O sync de conflito 409 abaixo continua valendo (regenerações/rollback do prompt).

## Auto-save — invariantes

1. **User-driven**: só agenda PATCH quando a mudança veio do textarea
   (`userEditedRef` setado no onChange). Mudanças programáticas (sync do
   snapshot RSC, rollback, adoção de conflito) realinham `baselineRef` e nunca
   salvam.
2. **Precondição otimista**: o PATCH envia `baseUpdatedAt` (updatedAt do último
   save). O servidor responde **409** se o prompt mudou desde então — o banner
   oferece "Usar versão do Builder" vs "Manter minha edição" (`forceSave` sem
   precondição).
3. **Versão manual**: todo save mantém UMA `BuilderPromptVersion` draft
   reutilizável com `createdBy: 'manual'` (upsert no repository) — edição
   manual é publicável pela saga de deploy.

## Data Flow

```
project.aiAgent?.systemPrompt (snapshot RSC)
        |
        v
  [PromptTab] baselineRef / userEditedRef / conflict
        ├─> usePromptAutosave({ value, dirty, projectId, onSaved, onConflict })
        ├─> usePromptActions ──> handleCopy, handleRegenerate
        ├─> analyzePrompt ─────> insights
        ├─> PromptHeader (charCount, saveState, now)
        ├─> PromptEditor (value, onChange=user edit, ...)
        ├─> PromptInsightsSection (insights, messages)
        └─> VersionHistory (editorValue, onRestored → adoptServer)
```

Evento disparado pelo "Regenerar": `window.dispatchEvent(new CustomEvent('builder:focus-chat', { detail: { message } }))`.

## Regras
- Tema sempre via `useAppTokens()` — não hardcodar cores (exceto brand green/red das pills).
- Endpoint real: `PATCH /api/v1/builder/projects/:id/prompt` via fetch direto
  (mesmo padrão da IdentityTab) para tratar o corpo do 409.
- "Atual" no histórico é por CONTEÚDO (`version.content === editorValue`),
  nunca por posição na lista.
- Textarea controlada pelo orquestrador; hooks não tocam DOM.
