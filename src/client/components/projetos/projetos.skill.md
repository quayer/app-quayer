# Skill — Frontend Builder (Workspace /projetos)

Mapa do workspace de 3 colunas que é a UI do Builder IA. Este é o **único** lugar do app onde o usuário interage com o meta-agente.

---

## Layout 3-colunas

```
┌───────────────┬──────────────────────────┬─────────────────────────┐
│  Sidebar      │  Chat Panel              │  Preview Panel          │
│  (projetos)   │  (conversa com Builder)  │  (tabs: overview, etc)  │
│               │                          │                         │
│  - projeto A  │  [user] quero um agente  │  [Overview][Prompt]     │
│  - projeto B  │  [bot]  Claro, vou...    │  [Playground][Deploy]   │
│  + novo       │  [tool] create_agent ✓   │                         │
└───────────────┴──────────────────────────┴─────────────────────────┘
```

Arquivos principais:

| Componente | Caminho |
|---|---|
| Shell/layout | `src/client/components/projetos/workspace.tsx` |
| Sidebar | `src/client/components/layout/builder-sidebar.tsx` (global) |
| Chat | `src/client/components/projetos/chat-panel.tsx` |
| Preview | `src/client/components/projetos/preview-panel.tsx` |
| Types | `src/client/components/projetos/types.ts` |
| Tab Registry | `src/client/components/projetos/preview/tab-registry.tsx` |
| Tabs (_core, todos os kinds) | `src/client/components/projetos/preview/tabs/_core/*` |
| Tabs (agent-specific) | `src/client/components/projetos/preview/tabs/agent/*` |
| Tabs (cross-kind single) | `src/client/components/projetos/preview/tabs/{overview,prompt,deploy}/*` |

---

## Tabs do Preview (via registry)

Os tabs são registrados em `preview/tab-registry.tsx` com `visibleFor: ProjectType[]`. `PreviewPanel` renderiza apenas os que aplicam ao `project.type`. Para adicionar tabs pra um novo kind (ex: `wa_campaign`), adicione entradas com `visibleFor: ['wa_campaign']`.

| Tab | Grupo | visibleFor | Arquivo | Propósito |
|---|---|---|---|---|
| Overview | _core | todos | `preview/tabs/overview/overview-tab.tsx` | Resumo: status, versão ativa, instance, connection |
| Prompt | agent | `ai_agent` | `preview/tabs/prompt/prompt-tab.tsx` | Visualizar + editar `BuilderPromptVersion` manualmente |
| Atividade | _core | todos | `preview/tabs/_core/activity/activity-tab.tsx` | Timeline das tool calls executadas |
| Playground | agent | `ai_agent` | `preview/tabs/agent/playground/playground-tab.tsx` | Testar o agente sem publicar (sandbox) |
| Publicar | agent | `ai_agent` | `preview/tabs/deploy/deploy-tab.tsx` | Wizard de publicação (ver deploy.skill.md) |

Futuros kinds (sem tabs específicas hoje) caem automaticamente em Overview + Atividade e o Builder chat continua funcionando.

---

## Estado global — **props drilling (hoje)**

O estado do projeto ativo (`currentProject`, `currentConversation`, `messages`) é mantido em `workspace.tsx` e passado via props para `chat-panel` e `preview-panel`.

**Por quê não context/zustand ainda:**

- Árvore rasa (3 níveis no máximo)
- Sem consumidores distantes
- Fácil de debugar — data flow é explícito

**Quando migrar:** quando aparecer 4º consumidor distante (ex: header que mostra status do projeto). Aí vale zustand por workspace.

---

## Páginas Next finas

As páginas em `src/app/projetos/` são **casca** — só renderizam componentes client-side:

```tsx
// src/app/projetos/page.tsx
export default function ProjetosPage() {
  return <ProjetosList />
}

// src/app/projetos/[id]/page.tsx
export default function ProjetoPage({ params }) {
  return <Workspace projectId={params.id} />
}
```

Sem `getServerSideProps`, sem data fetching SSR. Dados vêm via `api.builder.*` do Igniter client.

**Motivo:** o chat é 100% SSE e interativo — SSR não agrega. Evitamos flash de conteúdo stale.

---

## Relação com `api.builder.*`

```typescript
// Listar projetos (hook React)
const { data, isLoading } = api.builder.listProjects.useQuery({ 
  query: { limit: 50 } 
})

// Criar projeto (mutation)
const create = api.builder.createProject.useMutation()
await create.mutateAsync({ body: { prompt, type: 'WHATSAPP_AGENT' } })

// Publicar
const publish = api.builder.publishProject.useMutation()

// Chat — NÃO usa api.builder.sendChatMessage.useMutation (é SSE stream)
// Usa hook customizado `use-chat-stream` (ver chat/chat.skill.md)
```

---

## Convenções

- Componentes em **PascalCase**, hooks em **camelCase**
- Tailwind + shadcn/ui — não CSS-in-JS
- Zero `any` — tipar tudo via `types.ts` local
- Loading states explícitos (Suspense onde possível, `isLoading` onde não)
- Erros mostrados como `toast` (sonner) + card inline no chat quando for erro de tool

---

## Referências

- Workspace root: `src/client/components/projetos/workspace.tsx`
- Types compartilhados: `src/client/components/projetos/types.ts`
- Backend API: `src/server/ai-module/builder/builder.controller.ts`
