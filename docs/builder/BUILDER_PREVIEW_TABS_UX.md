# Builder — Mapa de UX das Tabs do Preview

> Companheiro visual do [BUILDER_USER_JOURNEY.md](./BUILDER_USER_JOURNEY.md). Aqui cada tab do `PreviewPanel` está documentada com wireframe ASCII + breakdown de componentes + estado funcional.

**Arquitetura das tabs:** [tab-registry.tsx](../../src/client/components/projetos/preview/tab-registry.tsx) — `visibleFor: ProjectType[]` filtra quais tabs aparecem por tipo de projeto. Hoje só `ai_agent` tem tabs específicas; futuros kinds (campanha, flow) ganham as suas via novas entradas no registry.

---

## Contexto — 3 áreas na tela, 2 layouts compostos

Desktop mostra 3 áreas lado a lado, mas **não é uma grid única**: a `BuilderSidebar` vem do **AppShell global** (aparece em todas as páginas autenticadas, colapsável via `⌘B`). O **Workspace** em si é um split de 2 colunas (`ChatPanel` + `PreviewPanel`), renderizado dentro do `<main>` do shell.

### Desktop (md+)

```
┌────── AppShell ([app-shell-client.tsx]) ─────────────────────────────────────┐
│                                                                              │
│ ┌──────────────┬─ Workspace ([workspace.tsx]) ─────────────────────────────┐ │
│ │BuilderSidebar│ ┌────────── Header sticky (back · nome · status) ──────┐ │ │
│ │  (AppShell)  │ └──────────────────────────────────────────────────────┘ │ │
│ │              │                                                          │ │
│ │ • Agente A   │ ┌─ ChatPanel (50%) ────┬─ PreviewPanel (50%) ──────────┐ │ │
│ │ • Campanha B │ │ [user] quero agente… │  [Visão][Prompt][Atividade]  │ │ │
│ │ + Novo       │ │ [bot]  vou criar…    │  [Playground][Publicar]      │ │ │
│ │              │ │ [tool] create_agent✓ │                              │ │ │
│ │              │ │                      │  ┌ conteúdo da tab ativa ─┐  │ │ │
│ │  ⌘B colapsa  │ │ [user] troca o tom   │  │                        │  │ │ │
│ │              │ │ [bot]  ajustando…    │  │                        │  │ │ │
│ │              │ └──────────────────────┴──┴────────────────────────┴──┘ │ │
│ └──────────────┴──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
  ↑ global shell            ↑ split 2 colunas dentro do <main>
  (todas as páginas)        (só em /projetos/[id])
```

### Sidebar colapsada (`⌘B`)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [▸] ← botão flutuante  │ ChatPanel (≈50%) │ PreviewPanel (≈50%) │            │
│    pra reabrir         │                  │                     │            │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mobile (< md)

Sidebar some; Workspace vira **1 coluna com toggle** no header (Chat ↔ Agente):

```
┌─── Header ─────────────────────────────┐
│ ← Projeto X   [ 💬 Chat ][ 🤖 Agente ] │  ← ToggleGroup
├────────────────────────────────────────┤
│                                        │
│   conteúdo do painel selecionado       │  ← ChatPanel OU PreviewPanel
│   (100% width, outro esconde)          │
│                                        │
└────────────────────────────────────────┘
```

**Tab strip** (sempre visível no topo do PreviewPanel):

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌────────────┬────────┬───────────┬────────────┬────────────┐  │
│  │Visão geral │ Prompt │ Atividade │ Playground │  Publicar  │  │  ← _core + agent
│  └────────────┴────────┴───────────┴────────────┴────────────┘  │
└─────────────────────────────────────────────────────────────────┘
  Active: background tokens.brandSubtle, color tokens.brandText
  Inactive: transparent + tokens.textSecondary
```

Ordem do registry: `overview → prompt → activity → playground → deploy`.

---

## 1. Visão geral (`overview`) · _core · todos os types

**Status:** ✅ funcional end-to-end. Dashboard dinâmico "Mission Control".

### Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ╭──────────────────────────────────────────────────────╮   │
│  │ [🤖]  Assistente Suporte                [draft]      │   │  ← AgentIdentityHeader
│  │        gpt-4o-mini · openai                          │   │    (só se aiAgent existe)
│  ╰──────────────────────────────────────────────────────╯   │
│                                                             │
│  Progresso                                    3 de 5 etapas │  ← ProgressHeader
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━   │    (só se há tool calls)
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ ✓  Agente criado                                      │  │  ← StageList
│  │ ✓  Prompt configurado                                 │  │    (etapas derivadas
│  │ ✓  Instância WhatsApp listada                         │  │     DINAMICAMENTE das
│  │ ○  Conectar canal                        ← em progresso│ │     tool calls, não
│  │ ○  Publicar versão                                    │  │     pipeline fixo)
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │  ← DeployReadinessCard
│  │  Pronto para publicar?                      2 de 5    │  │    (sempre visível)
│  │  ────────────────────────────────────────────────     │  │
│  │  ✓  Agente criado                                     │  │
│  │  ✓  Prompt ≥ 50 chars                                 │  │
│  │  ✗  Canal WhatsApp conectado                          │  │
│  │  ✗  Plano ativo                                       │  │
│  │  ✗  BYOK configurado                                  │  │
│  │                                                       │  │
│  │                             [ Ir para Publicar → ]    │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  Ações rápidas                                              │  ← QuickActions
│  [ 📝 Editar prompt ]  [ ▶ Testar ]  [ 🚀 Publicar ]        │    (atalhos p/ tabs)
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │  ← MetricsCard
│  │  📊  Métricas                                         │  │    (só se status !== draft)
│  │      Mensagens hoje · Conversas ativas · Uptime       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Estado vazio (`!aiAgent && stages.length === 0`)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                         ┌────────┐                          │
│                         │   🤖   │                          │
│                         └────────┘                          │
│                                                             │
│                 Comece conversando no chat                  │
│                                                             │
│        Descreva o agente que você quer criar e eu           │
│        vou montar pra você em minutos.                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Componentes

| Seção | Componente | Condição |
|---|---|---|
| Identidade | [`AgentIdentityHeader`](../../src/client/components/projetos/preview/tabs/overview/components/agent-identity-header.tsx) | `project.aiAgent` existe |
| Progresso | [`ProgressHeader`](../../src/client/components/projetos/preview/tabs/overview/components/progress-header.tsx) + [`StageList`](../../src/client/components/projetos/preview/tabs/overview/components/stage-list.tsx) | `stages.length > 0` |
| Readiness | [`DeployReadinessCard`](../../src/client/components/projetos/preview/tabs/overview/components/deploy-readiness-card.tsx) | sempre |
| Quick actions | [`QuickActions`](../../src/client/components/projetos/preview/tabs/overview/components/quick-actions.tsx) | sempre |
| Métricas | [`MetricsCard`](../../src/client/components/projetos/preview/tabs/overview/components/metrics-card.tsx) | `status !== 'draft'` |

**Fonte dos dados:** derivação pura de `project` + `messages` via [`useOverviewDerivations`](../../src/client/components/projetos/preview/tabs/overview/hooks/use-overview-derivations.ts). Zero fetch adicional.

---

## 2. Prompt (`prompt`) · agent-only (`ai_agent`)

**Status:** ⚠️ funcional (editor + auto-save) · version history stub (endpoint não wired).

### Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  System Prompt                                    1.247 chr │  ← PromptHeader
│  ● Salvo · há 2s                                            │    (char count + save state)
│                                                             │
│  ┌─[ Toolbar ]───────────────────────────────────────────┐  │  ← PromptEditor
│  │  [⛶ Expandir]   [↻ Regenerar]        [📋 Copiar]      │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │  Você é um assistente de atendimento da barbearia X.  │  │
│  │  Seu tom é amigável, direto e informal. Use emojis    │  │
│  │  com moderação. Seus limites:                         │  │
│  │                                                       │  │
│  │  1. Nunca prometa preços sem consultar a tabela.      │  │
│  │  2. Se o cliente pedir agendamento, colete: nome,     │  │
│  │     serviço desejado, data preferida.                 │  │
│  │  3. Se for reclamação, peça desculpas e escale...     │  │
│  │                                                       │  │
│  │  ▼ (32 linhas)                                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─ Análise do prompt ───────────────────── [ ▼ ]───────┐   │  ← PromptInsightsSection
│  │  Tom:      amigável ✓                                │   │    (collapsible)
│  │  Clareza:  alta ✓                                    │   │
│  │  Tamanho:  ideal (≤ 2000 chr)                        │   │
│  │  ⚠ Nenhum exemplo concreto — considere adicionar.    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  Histórico de versões                                       │  ← VersionHistory
│  ┌──────────────────────────────────────────────────────┐   │    (vazio — TODO)
│  │  Nenhuma versão publicada ainda                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│                        [ ↻ Regenerar ]    [ 📋 Copiar ]     │  ← PromptActions
└─────────────────────────────────────────────────────────────┘
```

### Estado vazio (`!aiAgent`)

```
Aguardando o Builder criar o agente. Continue a conversa no chat.
```

### Comportamento

| Ação | Resultado |
|---|---|
| Digitar no textarea | `value` atualiza, `isDirty = true`, auto-save agenda (debounce 2s) |
| Regenerar | Placeholder hoje (toast) — futuro: chama tool `update_agent_prompt` |
| Copiar | Copia prompt pro clipboard + toast |
| Expandir | Textarea ocupa altura máxima disponível |

**Fonte dos dados:** `project.aiAgent.systemPrompt`. Auto-save via [`usePromptAutosave`](../../src/client/components/projetos/preview/tabs/prompt/hooks/use-prompt-autosave.ts) (hook interno).

---

## 3. Atividade (`activity`) · _core · todos os types

**Status:** ✅ funcional end-to-end. Timeline read-only das tool calls.

### Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Atividade do agente             12 ações · últimas 50      │
│                                                             │
│   ●──┬─ Publicou versão                         [ OK ]      │
│   │  │  há 2 minutos · publish_agent              [ ▼ ]     │
│   │  │                                                      │
│   ●──┼─ Testou no playground                    [ OK ]      │
│   │  │  há 5 minutos · run_playground_test       [ ▼ ]      │
│   │  │                                                      │
│   ●──┼─ Atualizou o prompt                      [ OK ]      │
│   │  │  há 8 minutos · update_agent_prompt       [ ▼ ]      │
│   │  │                                                      │
│   ●──┼─ Listou instâncias WhatsApp              [ OK ]      │
│   │  │  há 10 minutos · list_whatsapp_instances  [ ▲ ]      │ ← expandido
│   │  │  ┌─ Args ─────────────────────────────────────────┐  │
│   │  │  │ { "organizationId": "org_abc123" }             │  │
│   │  │  └────────────────────────────────────────────────┘  │
│   │  │  ┌─ Resultado ────────────────────────────────────┐  │
│   │  │  │ [                                              │  │
│   │  │  │   { "id": "inst_1", "name": "Suporte",         │  │
│   │  │  │     "status": "connected" }                    │  │
│   │  │  │ ]                                              │  │
│   │  │  └────────────────────────────────────────────────┘  │
│   │  │                                                      │
│   ●──┴─ Criou o agente                          [ OK ]      │
│         há 12 minutos · create_agent              [ ▼ ]     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
  ●  = Ícone por tool (Sparkles/Pencil/Rocket/Play/Smartphone…)
  │  = Conector vertical (divider)
```

### Estado vazio

```
┌─────────────────────────────────────────────────────────────┐
│                         ┌────────┐                          │
│                         │   ⚡   │                          │
│                         └────────┘                          │
│                    Sem atividade ainda                      │
│      Nenhuma ação executada. Comece conversando no chat.    │
└─────────────────────────────────────────────────────────────┘
```

### Status badges

| Derivação | Badge | Cor |
|---|---|---|
| `result === undefined` | `PENDING` | cinza (`tokens.textTertiary`) |
| `result.error` presente | `ERRO` | vermelho (#ef4444) |
| caso contrário | `OK` | verde (#10b981) |

### Mapa de tools → label + ícone

| Tool (backend) | Label (UI) | Ícone | Categoria |
|---|---|---|---|
| `create_agent` | Criou o agente | Sparkles | setup |
| `update_agent_prompt` | Atualizou o prompt | Pencil | prompt |
| `list_whatsapp_instances` | Listou instâncias WhatsApp | List | query |
| `create_whatsapp_instance` | Criou instância WhatsApp | Smartphone | setup |
| `attach_tool_to_agent` | Anexou tool ao agente | Plug | setup |
| `search_web` | Buscou na web | Globe | query |
| `generate_prompt_anatomy` | Gerou anatomia do prompt | FileText | prompt |
| `publish_agent` | Publicou versão | Rocket | publish |
| `get_agent_status` | Consultou status | Activity | query |
| `run_playground_test` | Testou no playground | Play | test |
| `create_custom_tool` | Criou tool customizada | Wrench | setup |
| *(desconhecido)* | Ação | Zap | other |

**Fonte:** `messages.filter(assistant + toolCalls).reverse().slice(0, 50)`. Zero backend.

---

## 4. Playground (`playground`) · agent-only (`ai_agent`)

**Status:** ❌ placeholder. Gap conhecido da jornada — roadmap.

### Wireframe (estado 1: sem agente)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                                                             │
│                         ┌────────┐                          │
│                         │   🤖   │                          │
│                         └────────┘                          │
│                                                             │
│                  Aguardando o Builder                       │
│                                                             │
│       Continue a conversa no chat para o Builder            │
│              criar seu agente.                              │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Wireframe (estado 2: com agente, placeholder)

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                                                             │
│                         ┌────────┐                          │
│                         │   ▶    │                          │
│                         └────────┘                          │
│                                                             │
│              Playground em desenvolvimento                  │
│                                                             │
│      Em breve você poderá testar o agente aqui. Por         │
│      enquanto, use o chat pra simular conversas.            │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Visão futura (não implementada)

Chat isolado sandbox + variáveis injetáveis + compara respostas entre versões + exporta casos de teste. Ver [BUILDER_USER_JOURNEY § Gaps](./BUILDER_USER_JOURNEY.md).

---

## 5. Publicar (`deploy`) · agent-only (`ai_agent`)

**Status:** ⚠️ wizard funcional · lista de versões stub (endpoint GET não wired).

### Wireframe — fluxo principal

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Publicar                                                   │
│  Verifique os requisitos, publique versões e gerencie       │
│  o histórico.                                               │
│                                                             │
│  ┌─── Passo 1: Pré-requisitos ─────────────── 3 de 5 ───┐   │  ← ConnectionStep
│  │                                                      │   │
│  │  ✓  Agente criado                                ℹ   │   │    tooltip com hint
│  │  ✓  Prompt configurado                           ℹ   │   │
│  │  ✓  BYOK configurado                             ℹ   │   │
│  │  ✗  Canal WhatsApp conectado                     ℹ   │   │
│  │  ✗  Plano ativo                                  ℹ   │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─── Passo 2: Publicar versão ─────────────────────────┐   │  ← InstanceStep
│  │                                                      │   │
│  │  Draft atual:  v3                                    │   │
│  │  Em produção:  v2 (publicada há 3 dias)              │   │
│  │                                                      │   │
│  │  ⚠  2 pré-requisitos faltando:                       │   │
│  │     • Canal WhatsApp conectado                       │   │
│  │     • Plano ativo                                    │   │
│  │                                                      │   │
│  │  [ 📄 Salvar rascunho ]    [ 🚀 Publicar v3 ]        │   │
│  │                                  (disabled se !allMet)│  │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─── Passo 3: Histórico ─────────────────────────────── │   │  ← SummaryStep
│  │                                                      │   │
│  │  Em produção →  v2    publicada há 3 dias            │   │
│  │  Rascunho    →  v3    criada há 1h                   │   │
│  │                                                      │   │
│  │  Versões anteriores                                  │   │
│  │  v1 · 2026-04-01 · publicada e substituída           │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Wireframe — dialog de confirmação

```
┌─ Publicar v3 em produção? ──────────────────────────┐
│                                                     │
│   Isso vai substituir a versão v2 que está ativa.   │
│   O agente começa a atender com o novo prompt       │
│   imediatamente.                                    │
│                                                     │
│               [ Cancelar ]   [ Publicar agora ]     │
└─────────────────────────────────────────────────────┘
```

### Wireframe — após publicar (SuccessCard)

```
┌─────────────────────────────────────────────────────────────┐
│  🎉  v3 publicada com sucesso                          [✕]  │
│      O agente já está atendendo com a nova versão.          │
└─────────────────────────────────────────────────────────────┘
```

### Estado vazio (`!aiAgent`)

```
┌─────────────────────────────────────────────────────────────┐
│                         ┌────────┐                          │
│                         │   🚀   │                          │
│                         └────────┘                          │
│    Aguardando o Builder criar o agente. Continue no chat.   │
└─────────────────────────────────────────────────────────────┘
```

### Checklist (`deriveChecklist`)

| Item | Condição `met` | Hint |
|---|---|---|
| Agente criado | `aiAgent !== null` | "O Builder precisa criar um agente primeiro" |
| Prompt configurado | `aiAgent && systemPrompt.length > 50` | "O prompt precisa ter pelo menos 50 caracteres" |
| Canal WhatsApp conectado | *(hoje hardcoded `false`)* | "Conecte uma instância do WhatsApp ao agente" |
| Plano ativo | *(hoje hardcoded `false`)* | "Ative um plano para publicar em produção" |
| BYOK configurado | *(derivação futura)* | — |

### Saga backend acionada

`POST /api/v1/builder/projects/publish` → orquestrador de 3 passos ([deploy-flow.orchestrator.ts](../../src/server/ai-module/builder/deploy/deploy-flow.orchestrator.ts)):

```
publishVersion()  →  createDeployInstance()  →  attachConnection()
      │                       │                         │
      └── se falhar ────┐     └── rollback ──────┐      └── rollback
                        │                        │
                     rollback                 rollback
```

---

## Resumo cruzado

| Eixo | Visão geral | Prompt | Atividade | Playground | Publicar |
|---|:---:|:---:|:---:|:---:|:---:|
| **Grupo no registry** | `_core` | `agent` | `_core` | `agent` | `agent` |
| **`visibleFor`** | — (todos) | `['ai_agent']` | — (todos) | `['ai_agent']` | `['ai_agent']` |
| Lê `messages` | ✅ | — | ✅ | — | — |
| Lê `project` | ✅ | ✅ | — | ✅ | ✅ |
| Hits backend | — | auto-save (futuro) | — | — | POST publish |
| Estado interno | — | editor + collapsible | collapsible por row | — | dialog + publishing |
| Empty state próprio | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Funcional E2E** | ✅ | ⚠️ versions stub | ✅ | ❌ placeholder | ⚠️ versions stub |

---

## Gaps de UX priorizados

| # | Gap | Tab | Impacto | Ação sugerida |
|---|---|---|---|---|
| 1 | Playground é só placeholder | Playground | Alto — usuário não consegue validar antes de publicar | Chat sandbox + injeção de variáveis |
| 2 | `GET /projects/:id/versions` não wired | Prompt · Publicar | Médio — histórico vazio mesmo após publicar | Expor endpoint no controller |
| 3 | Checklist hardcoded em `false` (whatsapp/plano) | Publicar | Alto — bloqueia publicação em todos os casos | Derivar de `project.aiAgent.connections` e billing |
| 4 | Sem métricas reais pós-publicação | Visão geral | Baixo — placeholder só | Integrar com `analytics` module |
| 5 | Sem visualização de delta entre versões | Prompt | Médio — usuário não vê o que o Builder mudou | Diff viewer na VersionHistory |
| 6 | Auto-save do Prompt não persiste | Prompt | Médio — digitação perdida se refresh | Wire PATCH endpoint de `systemPrompt` |

---

## Modularização — onde mexer

```
src/client/components/projetos/
├── preview-panel.tsx               ← consome TAB_REGISTRY, NÃO editar tabs aqui
├── preview/
│   ├── tab-registry.tsx            ← ADICIONAR nova tab aqui
│   └── tabs/
│       ├── _core/                  ← tabs visíveis pra TODOS os project types
│       │   └── activity/
│       ├── agent/                  ← tabs só pra ai_agent
│       │   └── playground/
│       ├── overview/               ← tabs cross-kind single (hoje no root)
│       ├── prompt/
│       └── deploy/
└── types.ts                        ← PreviewTab union + WorkspaceProject
```

**Para uma tab nova de `wa_campaign`:**
1. Criar `preview/tabs/campaign/segmentacao/segmentacao-tab.tsx`
2. Expandir `PreviewTab` em [types.ts](../../src/client/components/projetos/types.ts) com `'segmentacao'`
3. Adicionar entrada no registry: `{ value: 'segmentacao', label: 'Segmentação', visibleFor: ['wa_campaign'], render: ... }`

Zero mudanças em `preview-panel.tsx`.

---

## Referências

- Registry: [preview/tab-registry.tsx](../../src/client/components/projetos/preview/tab-registry.tsx)
- Tipos: [projetos/types.ts](../../src/client/components/projetos/types.ts) · [lib/project-type.ts](../../src/lib/project-type.ts)
- Skill: [projetos.skill.md](../../src/client/components/projetos/projetos.skill.md)
- Jornada completa (UI + IA): [BUILDER_USER_JOURNEY.md](./BUILDER_USER_JOURNEY.md)
- Arquitetura do agente Builder: [BUILDER_AGENT_ARCHITECTURE.md](./BUILDER_AGENT_ARCHITECTURE.md)
