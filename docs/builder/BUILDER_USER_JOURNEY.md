# Builder AI — Jornada Completa (UI + IA)

> Documento visual da jornada do usuário criando um agente WhatsApp no Quayer Builder.
> Cobre **o que o usuário vê (UI)** e **o que a IA faz por baixo (orquestração + tools)**.

**Data:** 2026-04-17
**Fonte de verdade:**
- UI: [src/client/components/projetos/workspace.tsx](../../src/client/components/projetos/workspace.tsx)
- AI: [src/server/ai-module/builder/](../../src/server/ai-module/builder/)
- System prompt: [whatsapp-agent-system-prompt.ts](../../src/server/ai-module/builder/prompts/whatsapp-agent-system-prompt.ts)

---

## 1. Mapa Macro — As 2 Jornadas em Paralelo

```mermaid
flowchart LR
    subgraph UI["🖥️ Jornada UI (o que o usuário vê)"]
        direction TB
        U1[Home<br/>/home] --> U2[Lista Projetos<br/>/projetos]
        U2 --> U3[Workspace<br/>/projetos/:id]
        U3 --> U4[Chat ← → Preview]
        U4 --> U5[Agente publicado]
    end

    subgraph AI["🤖 Jornada IA (o que roda no backend)"]
        direction TB
        A1[Builder meta-agent<br/>__quayer_builder__] --> A2[Detecta persona<br/>Dev / Agência / Influencer]
        A2 --> A3[Orquestra tools<br/>11 tools disponíveis]
        A3 --> A4[Saga de deploy<br/>3 steps + rollback]
        A4 --> A5[Agente WhatsApp<br/>em produção]
    end

    UI -.SSE<br/>text-delta<br/>tool-call<br/>tool-result.-> AI
    AI -.progresso<br/>incremental.-> UI
```

**Princípio fundamental:** A Quayer é "Vercel do WhatsApp" — em minutos o criador descreve o que quer, a IA orquestra tudo, e o agente entra no ar.

---

## 2. Jornada UI — Telas e Transições

### 2.1 Fluxo de telas

```mermaid
stateDiagram-v2
    [*] --> Home: login
    Home --> Projetos: clica "Meus projetos"
    Home --> NovoProjeto: prompt na home<br/>("quero um bot de agendamento")
    Projetos --> NovoProjeto: botão "Novo projeto"
    NovoProjeto --> Workspace: cria BuilderProject<br/>+ BuilderProjectConversation
    Workspace --> Publicado: deploy OK
    Publicado --> [*]

    state Workspace {
        [*] --> ChatAtivo
        ChatAtivo --> Overview: tab "Visão geral"
        ChatAtivo --> Prompt: tab "Prompt"
        ChatAtivo --> Playground: tab "Playground"
        ChatAtivo --> Deploy: tab "Publicar"
        Overview --> ChatAtivo
        Prompt --> ChatAtivo
        Playground --> ChatAtivo
        Deploy --> ChatAtivo
    }
```

### 2.2 Layout do Workspace (split 50/50)

```
┌──────────────────────────────────────────────────────────────┐
│  ← Nome do projeto [status-badge]           [toggle] [⋯]     │  ← Header sticky
├────────────────────────────┬─────────────────────────────────┤
│                            │ [Visão] [Prompt] [Playground]   │
│    💬 ChatPanel            │ [Publicar]                       │
│                            │─────────────────────────────────│
│  Mensagens + tool cards    │                                 │
│  (streaming SSE)           │       PreviewPanel              │
│                            │     (tab ativa renderiza)       │
│                            │                                 │
│                            │                                 │
│  ┌──────────────────────┐  │                                 │
│  │ textarea + 🎤 + 🚀  │  │                                 │
│  └──────────────────────┘  │                                 │
└────────────────────────────┴─────────────────────────────────┘
       50% (esquerda)                50% (direita)
```

### 2.3 As 4 tabs do PreviewPanel

| Tab | Arquivo | O que mostra | Ação principal |
|---|---|---|---|
| **Visão geral** | [overview-tab.tsx](../../src/client/components/projetos/preview/tabs/overview/overview-tab.tsx) | Mission control: stages dinâmicos derivados de tool calls + readiness checklist + métricas | Checar progresso |
| **Prompt** | [prompt-tab.tsx](../../src/client/components/projetos/preview/tabs/prompt/prompt-tab.tsx) | Editor do system prompt + insights + histórico de versões | Editar prompt manualmente |
| **Playground** | [playground-tab.tsx](../../src/client/components/projetos/tabs/playground-tab.tsx) | Simulador de conversas + cenários de teste | Testar antes de publicar |
| **Publicar** | [deploy-tab.tsx](../../src/client/components/projetos/preview/tabs/deploy/deploy-tab.tsx) | Wizard 3 steps: checklist → publish → summary | Deploy em produção |

### 2.4 Estados visuais do Overview

```mermaid
stateDiagram-v2
    [*] --> Vazio: projeto recém-criado<br/>sem agente, sem mensagens
    Vazio --> Construindo: primeira mensagem<br/>no chat
    Construindo --> ProntoParaPublicar: todos os 5 readiness OK
    ProntoParaPublicar --> Publicado: deploy executado
    Publicado --> Otimizando: usuário pede melhorias
    Otimizando --> Publicado: nova versão

    note right of Vazio
        EmptyState component
        "Continue a conversa no chat"
    end note

    note right of Construindo
        Stages dinâmicos aparecem
        conforme tools são chamadas
    end note

    note right of ProntoParaPublicar
        Checklist 5/5:
        - Agente criado
        - Prompt configurado
        - Canal conectado
        - Plano ativo
        - BYOK configurado
    end note
```

---

## 3. Jornada IA — O Builder Meta-Agent

### 3.1 Quem é o Builder?

O Builder **não é** outro LLM separado. É um **meta-agente reservado** (`__quayer_builder__`) dentro do mesmo runtime de agentes do Quayer. Ele recebe o prompt do usuário, detecta a persona, e orquestra os **11 tools do Builder** para montar o agente final.

**Arquivo chave:** [src/server/ai-module/builder/prompts/whatsapp-agent-system-prompt.ts](../../src/server/ai-module/builder/prompts/whatsapp-agent-system-prompt.ts)

### 3.2 As 3 personas que o Builder detecta

```mermaid
flowchart TD
    Start[Mensagem do usuário chega] --> Detect{Analisa sinais}
    Detect -->|"API", "terminal", "Claude Code"| Dev[PERSONA DEV<br/>Tom: técnico, direto]
    Detect -->|"clientes", "agência", "white-label"| Agency[PERSONA AGÊNCIA<br/>Tom: consultivo, ROI]
    Detect -->|"seguidores", "curso", "recorrência"| Influencer[PERSONA INFLUENCER<br/>Tom: simples, sem jargão]
    Detect -->|Ambíguo| Ask[Pergunta explícita<br/>"Para você, cliente<br/>ou audiência?"]

    Dev --> Flow[Executa Fluxo 7 Etapas]
    Agency --> Flow
    Influencer --> Flow
    Ask --> Flow
```

### 3.3 O fluxo de 7 etapas (interno, orquestrado pelo Builder)

```mermaid
flowchart TD
    E1[1. Nome do projeto] --> E2[2. Objetivo definido]
    E2 --> E3[3. Coleta requisitos<br/>público, tom, regras, limitações]
    E3 --> E4[4. Nicho identificado<br/>aplica hints específicos]
    E4 --> E5[5. Gera prompt<br/>Prompt Anatomy 5-seções]
    E5 --> E6[6. Cria agente + anexa tools]
    E6 --> E7[7. Testa + publica]

    E5 -.tool.-> T5[generate_prompt_anatomy]
    E6 -.tool.-> T6a[create_agent]
    E6 -.tool.-> T6b[attach_tool_to_agent]
    E7 -.tool.-> T7a[run_playground_test]
    E7 -.tool.-> T7b[publish_agent]

    style E5 fill:#f59e0b,color:#fff
    style E6 fill:#f59e0b,color:#fff
    style E7 fill:#f59e0b,color:#fff
```

**Princípios do Builder (do system prompt):**
1. Uma pergunta por vez.
2. Assume defaults razoáveis — confirma depois.
3. Experiência "Manus-style" — uma frase do criador → agente pronto.
4. **Aprovação explícita** antes de criar.
5. Instagram e campanhas em massa → "está no roadmap".

### 3.4 Os 11 tools do Builder (mapa completo)

| Tool | Etapa | O que faz | Visível no Overview |
|---|---|---|---|
| `search_web` | 1-2 | Pesquisa nicho / concorrentes | ❌ |
| `generate_prompt_anatomy` | 5 | Gera prompt (Papel, Objetivo, Regras, Limitações, Formato) | ✅ "Prompt gerado" |
| `create_agent` | 6 | Cria AIAgentConfig no banco | ✅ "Agente criado" |
| `update_agent_prompt` | 6 | Atualiza prompt existente | ✅ "Prompt atualizado" |
| `attach_tool_to_agent` | 6 | Anexa tool built-in (transfer_to_human, create_lead…) | ✅ "Ferramenta configurada" |
| `create_custom_tool` | 6 | Cria tool customizada via webhook | ✅ "Ferramenta customizada criada" |
| `list_whatsapp_instances` | 7 | Lista instâncias WhatsApp da org | ✅ "Canais consultados" |
| `create_whatsapp_instance` | 7 | Cria nova instância UAZAPI | ✅ "Canal WhatsApp conectado" |
| `run_playground_test` | 7 | Executa cenário de teste | ✅ "Teste executado" |
| `get_agent_status` | 7 | Verifica blockers (plano, BYOK, canal) | ❌ |
| `publish_agent` | 7 | Publica (ativa produção) | ✅ "Agente publicado" |

**Fonte:** [TOOL_STAGE_MAP](../../src/client/components/projetos/preview/tabs/overview/helpers/tool-stage-map.ts) — mapeia tool → label mostrado no Overview.

---

## 4. Fluxo Completo — UI ↔ IA em uma sequência

```mermaid
sequenceDiagram
    actor User as 👤 Criador
    participant UI as ChatPanel (React)
    participant Route as POST /projects/:id/chat/message
    participant Budget as compactIfNeeded
    participant Runtime as processAgentMessageStream
    participant Tools as Builder Toolset (11)
    participant DB as Postgres
    participant Preview as PreviewPanel

    User->>UI: "Quero agente para agendar<br/>corte de cabelo"
    UI->>Route: POST + SSE conectado
    Route->>DB: persistUserMessage<br/>(BuilderProjectMessage)
    Route->>Budget: verifica orçamento de contexto
    Budget-->>Route: OK (ou "exhausted" → 400)
    Route->>Runtime: stream com:<br/>• state banner<br/>• últimos 10 msgs<br/>• user message
    Runtime->>Runtime: LLM decide: chamar tools?

    rect rgb(254, 243, 199)
    note over Runtime,Tools: Loop de ferramentas (até N rounds)
    Runtime->>Tools: generate_prompt_anatomy(nicho="barbearia")
    Tools-->>Runtime: {prompt: "...", score: 92}
    Runtime-->>UI: SSE tool-call event
    UI->>Preview: onMessagesChange → re-deriva stages
    Preview-->>User: ✅ "Prompt gerado"

    Runtime->>Tools: create_agent(...)
    Tools->>DB: INSERT AIAgentConfig
    Tools-->>Runtime: {agentId, name}
    Runtime-->>UI: SSE tool-call event
    Preview-->>User: ✅ "Agente criado: Barbearia Bot"
    end

    Runtime-->>UI: SSE text-delta (streaming resposta)
    Runtime-->>UI: SSE finish {usage, cost, latency}
    Route->>DB: persistAssistantMessage
    Route->>DB: updateStateSummary (fire-and-forget)

    User->>UI: Clica tab "Publicar"
    UI->>Preview: DeployTab
    User->>Preview: clica "Publicar em produção"
    Preview->>Route: POST /publish
    Route->>Runtime: executeDeployFlow (saga)

    rect rgb(220, 252, 231)
    note over Runtime,DB: Saga 3 steps
    Runtime->>Runtime: publishVersion
    Runtime->>Runtime: createDeployInstance
    Runtime->>Runtime: attachConnection
    end

    Runtime-->>Preview: deployment: SUCCESS
    Preview-->>User: 🚀 "Agente no ar!"
```

**Observações:**
- Cada `tool-call` recebido no frontend atualiza `liveMessages` → `deriveStagesFromMessages` re-executa → Overview mostra novo stage.
- O state banner (`stateSummary`) é um resumo em linguagem natural do projeto atual, injetado antes do histórico para o Builder "lembrar" mesmo quando a janela de contexto comprime.
- A saga de deploy tem **rollback automático** se qualquer step falhar ([rollback.handler.ts](../../src/server/ai-module/builder/deploy/rollback.handler.ts)).

---

## 5. Anatomia do Prompt Final (o que o Builder gera)

O Builder **nunca mostra o prompt completo** ao usuário por padrão. Ele mostra só um resumo. Mas a estrutura obrigatória é:

```mermaid
flowchart TB
    Root["# System Prompt (gerado)"]
    Root --> S1["# Papel<br/>Quem o agente é"]
    Root --> S2["# Objetivo<br/>O que faz"]
    Root --> S3["# Regras de conduta<br/>Tom, guardrails, fluxo"]
    Root --> S4["# Limitações<br/>O que NUNCA faz"]
    Root --> S5["# Formato de resposta<br/>Tamanho, estilo, idioma"]

    S3 -.aplica.-> H1[Hints do nicho]
    H1 --> N1[Advocacia: sigilo OAB, não dar parecer]
    H1 --> N2[Barbearia: tom descontraído]
    H1 --> N3[Contabilidade: sem consultoria específica]
    H1 --> N4[Seguros: não prometer cobertura]
    H1 --> N5[E-commerce: escalar reclamações]

    style Root fill:#f59e0b,color:#fff
```

Validadores (executados automaticamente no `generate_prompt_anatomy`):
- **Blacklist** — palavras proibidas por nicho ([blacklist.ts](../../src/server/ai-module/builder/validators/blacklist.ts))
- **Ambiguity** — detecta instruções vagas ([ambiguity.ts](../../src/server/ai-module/builder/validators/ambiguity.ts))
- **Journey** — verifica se cobre fluxo esperado ([journey.ts](../../src/server/ai-module/builder/validators/journey.ts))
- **WhatsApp Prompt Anatomy** — valida as 5 seções ([whatsapp-prompt-anatomy.ts](../../src/server/ai-module/builder/validators/whatsapp-prompt-anatomy.ts))

---

## 6. Deploy Saga — Da conversa ao WhatsApp em produção

```mermaid
flowchart TD
    Start([Usuário clica<br/>'Publicar em produção']) --> Check{Todos os 5<br/>requisitos OK?}
    Check -->|❌| Block[Mostra checklist<br/>com o que falta]
    Check -->|✅| Saga[executeDeployFlow]

    Saga --> S1[Step 1: publishVersion<br/>marca BuilderPromptVersion<br/>como publicada]
    S1 -->|erro| RB[rollbackDeployment<br/>desfaz mudanças parciais]
    S1 -->|OK| S2[Step 2: createDeployInstance<br/>cria instância WhatsApp<br/>no UAZAPI]
    S2 -->|erro| RB
    S2 -->|OK| S3[Step 3: attachConnection<br/>liga AIAgentConfig à<br/>Connection / Instance]
    S3 -->|erro| RB
    S3 -->|OK| Done([✅ Agente recebendo<br/>mensagens no WhatsApp])

    RB --> Failed([❌ Deploy falhou<br/>estado original restaurado])

    style Done fill:#10b981,color:#fff
    style Failed fill:#ef4444,color:#fff
    style RB fill:#f59e0b,color:#fff
```

**Arquivo:** [deploy-flow.orchestrator.ts](../../src/server/ai-module/builder/deploy/deploy-flow.orchestrator.ts)

**Requisitos pré-deploy (checklist no ConnectionStep):**
1. ✅ Agente criado (`project.aiAgent !== null`)
2. ✅ Prompt configurado (>50 caracteres)
3. ✅ Canal WhatsApp conectado (`create_whatsapp_instance` executado)
4. ⏳ Plano ativo (ainda não wired)
5. ⏳ BYOK configurado (ainda não wired)

---

## 7. O que o criador VÊ vs o que acontece

| Momento | O que o criador vê (UI) | O que está rodando (IA) |
|---|---|---|
| Digita "quero bot de barbearia" | Bubble de chat + spinner | `persistUserMessage` → `buildAugmentedMessageContent` |
| Primeira resposta aparece | Texto em streaming (typewriter) | `processAgentMessageStream` emite `text-delta` |
| Card "🔧 Gerando prompt..." | Tool card laranja com loading | `generate_prompt_anatomy` executando |
| Card muda para "✅ Prompt gerado" | Resultado resumido | Validadores (blacklist, ambiguity, journey) OK |
| Overview acende "Agente criado" | Stage verde aparece | `create_agent` retornou + `deriveStagesFromMessages` |
| Checklist 3/5 no Publicar | Itens marcados | `deriveChecklist` lê `project.aiAgent` + tool calls |
| Clica "Publicar" | Modal de confirmação | Aguardando ação humana |
| "🚀 Agente no ar!" | SuccessCard celebra | Saga 3 steps concluída |

---

## 8. TL;DR visual — Uma frase → WhatsApp

```mermaid
journey
    title Jornada do criador Quayer
    section Descoberta
      Acessa /home: 5: Criador
      Descreve ideia: 5: Criador
    section Criação (automática via Builder)
      Chat começa: 4: Criador, Builder
      Builder pergunta o essencial: 4: Criador, Builder
      Builder gera prompt: 5: Builder
      Builder cria agente: 5: Builder
      Builder anexa ferramentas: 5: Builder
    section Teste
      Playground 1 cenário: 4: Criador, Builder
      Score ≥ 80: 5: Builder
    section Publicação
      Conecta WhatsApp: 3: Criador
      Clica Publicar: 5: Criador
      Saga 3 steps: 5: Builder
    section Pós-deploy
      Agente atende cliente real: 5: Cliente Final
      Criador otimiza: 4: Criador, Builder
```

---

## 9. Gaps conhecidos (backlog)

Baseado no código:
- `prompt-tab.tsx` tem TODO: wire `POST /api/v1/builder/projects/:id/rename`
- Deep-linking de tabs ainda não é feito (local state, não URL)
- Checklist de "Plano ativo" e "BYOK configurado" ainda `met: false` hard-coded em [derive-readiness.ts](../../src/client/components/projetos/preview/tabs/overview/helpers/derive-readiness.ts)
- Histórico de versões no Deploy Tab carrega vazio (`setVersions([])` stub)
- `agent-cloner` (v1.5) e Instagram/campanhas (v2) — roadmap

---

## Referências no código

- **Workspace shell:** [workspace.tsx](../../src/client/components/projetos/workspace.tsx)
- **Chat SSE (frontend):** [use-chat-stream.ts](../../src/client/components/projetos/chat/hooks/use-chat-stream.ts)
- **Chat route (backend):** [chat.routes.ts](../../src/server/ai-module/builder/chat/chat.routes.ts)
- **Stream handler:** [stream-agent-response.ts](../../src/server/ai-module/builder/chat/handlers/stream-agent-response.ts)
- **System prompt:** [whatsapp-agent-system-prompt.ts](../../src/server/ai-module/builder/prompts/whatsapp-agent-system-prompt.ts)
- **Tools registry:** [tools/index.ts](../../src/server/ai-module/builder/tools/index.ts)
- **Deploy saga:** [deploy-flow.orchestrator.ts](../../src/server/ai-module/builder/deploy/deploy-flow.orchestrator.ts)
- **Stage derivation:** [derive-stages.ts](../../src/client/components/projetos/preview/tabs/overview/helpers/derive-stages.ts)
- **Arquitetura existente:** [BUILDER_AGENT_ARCHITECTURE.md](./BUILDER_AGENT_ARCHITECTURE.md)
