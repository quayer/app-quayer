---
Criado: 2026-06-13
Atualizado: 2026-06-13
Revisar em: ao subir o LiteLLM em homol/prod (validar passthrough + prompt cache) ou ao trocar de SDK/provider
Relacionados:
  - src/server/ai-module/ai-agents/services/provider-factory.ts
  - src/server/ai-module/ai-agents/runtime/process-message-stream.ts
  - src/server/ai-module/ai-agents/runtime/prepare-agent-call.ts
  - src/server/ai-module/builder/chat/handlers/stream-agent-response.ts
  - src/client/components/projetos/chat/use-chat-stream.ts
  - infra/litellm/README.md
  - infra/litellm/config.yaml
  - docs/infra/SECRETS.md
---

# Arquitetura LLM da Quayer — nomenclatura correta (decisão/correção)

> **Por que este doc existe (FR-P2-02, #24):** vários docs e conversas falam
> "usamos Vercel" como se fosse uma plataforma/host de IA. **Isso está errado.**
> O que usamos é o **Vercel AI SDK** — uma **biblioteca** npm (o pacote `ai` +
> os providers `@ai-sdk/*`). Não rodamos nada na infra da Vercel, não usamos
> hosting da Vercel e não dependemos de nenhum serviço gerenciado da Vercel.
> Este documento fixa a nomenclatura e descreve o **fluxo real** verificado no
> código.

---

## 1. As 4 correções de nomenclatura

| # | Afirmação errada | Correção |
|---|---|---|
| (a) | "o front fala com o LLM" | **O front-end NUNCA fala com LLM.** Ele só chama rotas Igniter (`/api/v1/builder/...`) e consome o stream SSE. Nenhuma chave de provider, nenhum endpoint de LLM existe no cliente. |
| (b) | "usamos Vercel (plataforma)" | Usamos o **Vercel AI SDK como BIBLIOTECA** — o pacote `ai` (`streamText`, `generateText`, `tool`, `stepCountIs`, `ToolSet`) + `@ai-sdk/openai` e `@ai-sdk/anthropic`. É código que roda no NOSSO backend. Não é plataforma, host ou serviço gerenciado. |
| (c) | "cada serviço cria seu modelo / endpoint OpenAI único" | Existe **um único choke-point**: `getModel()` em `provider-factory.ts`. Quando `LITELLM_URL` + `LITELLM_MASTER_KEY` estão setados, **todo** o tráfego de LLM passa pelo **proxy LiteLLM** (custo/observabilidade/fallback/rate-limit centralizados), roteando **por provider**. |
| (d) | "deploy/hosting na Vercel" | Não há hosting na Vercel. Inclusive os secrets `VERCEL_*` estão marcados **A REMOVER** em `docs/infra/SECRETS.md` ("Não usamos Vercel"). |

**Regra de escrita:** sempre diga **"Vercel AI SDK"** (biblioteca) ou **"pacote
`ai`"**, nunca "Vercel" sozinho. Quando o assunto for gateway/roteamento, diga
**"LiteLLM"**.

---

## 2. O fluxo REAL (verificado no código)

```
┌─────────────┐   HTTPS (SSE)    ┌──────────────────┐
│  FRONT-END  │ ───────────────▶ │   API Igniter    │
│ (Next.js)   │  POST /api/v1/   │  (rota builder)  │
│             │  builder/.../    │                  │
│ use-chat-   │  chat/message    │ chat.routes.ts   │
│ stream.ts   │ ◀─────────────── │                  │
└─────────────┘   text-delta /   └────────┬─────────┘
   NUNCA fala     tool-call /              │ delega
   com LLM        tool-result /            ▼
                  finish           ┌──────────────────────────┐
                                   │  BACKEND (runtime/tools)  │
                                   │  usa primitives do `ai`:  │
                                   │  streamText / generateText│
                                   │  / tool() / ToolSet       │
                                   └────────────┬─────────────┘
                                                │ getModel(provider, model, apiKey?)
                                                ▼
                                   ┌──────────────────────────┐
                                   │  PROVIDER FACTORY          │
                                   │  provider-factory.ts       │
                                   │  (choke-point único)       │
                                   └───────┬───────────┬───────┘
                          LITELLM setado?  │           │  LITELLM vazio?
                                    sim ▼   │           │   não ▼
                          ┌─────────────────┐   ┌──────────────────────────┐
                          │  LiteLLM proxy   │   │  Direto por provider:    │
                          │  …/anthropic/v1  │   │  createAnthropic()       │
                          │  …/v1 (OpenAI-   │   │  createOpenAI()          │
                          │  compatible)     │   │  (OpenAI/OpenRouter)     │
                          └────────┬─────────┘   └───────────┬──────────────┘
                                   ▼                          ▼
                          ┌───────────────────────────────────────┐
                          │  Provedor real (Anthropic / OpenAI / …) │
                          └───────────────────────────────────────┘
```

### Passo a passo

1. **Front-end → API Igniter.** O chat do Builder (`use-chat-stream.ts`) faz
   `fetchWithAuthRetry('/api/v1/builder/projects/:id/chat/message')` (e
   `.../cards/:cardKey/submit` para o card-action protocol) e lê o stream SSE.
   Ele **não** importa nenhum SDK de LLM, não tem chaves e não conhece o
   provider — só fala o protocolo de eventos (`text-delta`, `tool-call`,
   `tool-result`, `finish`, `error`). Optou-se por SSE/data-stream próprio em vez
   do `useChat` do SDK (que exigiria custom transport).

2. **API Igniter → backend.** A rota (`chat.routes.ts`) delega para
   `stream-agent-response.ts`, que chama `processAgentMessageStream` em
   `ai-agents/runtime/`. Mesmo runtime atende o **meta-agente do Builder**
   (design-time) e o **agente publicado no WhatsApp** (runtime).

3. **Backend usa primitives do `ai`.** O runtime usa
   `streamText`/`generateText` + `stepCountIs` + `ToolSet` (loop de tools via
   `fullStream`); os sub-agentes do Builder (`sub-agents/base.ts`) usam
   `generateText`; tools são definidas com `tool()` do pacote `ai`. **Tudo isso
   é a biblioteca** rodando no nosso processo Node — não há chamada a serviço da
   Vercel.

4. **Backend → provider factory.** Todo modelo é instanciado por **um único**
   `getModel(provider, model, apiKey?)` em `provider-factory.ts`. É o choke-point
   por onde passa runtime, meta-agente do Builder e sub-LLMs dos tools.

5. **Provider factory → LiteLLM ou provedor direto.**
   - **LiteLLM configurado** (`LITELLM_URL` + `LITELLM_MASTER_KEY`): roteia
     **por provider** de propósito — Anthropic continua via `createAnthropic`
     apontando para `…/anthropic/v1` (passthrough que **preserva o prompt
     caching ephemeral**, 70–90% de economia); OpenAI/OpenRouter e demais models
     vão por `…/v1` (OpenAI-compatible), onde o LiteLLM resolve o provider real
     pelo **nome do model** (`model_list` em `infra/litellm/config.yaml`).
   - **LiteLLM vazio**: cai no caminho direto por provedor (`createAnthropic` /
     `createOpenAI` com `baseURL` do OpenRouter quando aplicável). **Nada
     quebra** — é a migração env-gated.

---

## 3. Pontos de verdade (arquivos)

| Camada | Arquivo | O que faz |
|---|---|---|
| Front (chat) | `src/client/components/projetos/chat/use-chat-stream.ts` | `fetch` para rota Igniter + parser do SSE. Zero LLM. |
| API | `src/server/ai-module/builder/chat/chat.routes.ts` | rota Igniter `chat/message`. |
| Backend (stream) | `src/server/ai-module/builder/chat/handlers/stream-agent-response.ts` | delega ao runtime e persiste mensagens. |
| Backend (runtime) | `src/server/ai-module/ai-agents/runtime/process-message-stream.ts` | `streamText` + loop de tools (`fullStream`, `stepCountIs`). |
| Backend (setup) | `src/server/ai-module/ai-agents/runtime/prepare-agent-call.ts` | resolve prompt/memória/RAG/toolset e chama `getModel`. |
| **Choke-point** | `src/server/ai-module/ai-agents/services/provider-factory.ts` | `getModel()` — LiteLLM-gated, roteamento por provider. |
| Gateway | `infra/litellm/config.yaml` + `infra/litellm/README.md` | `model_list`, master key, passthroughs `/anthropic/v1` e `/v1`. |

**Prompt caching:** o `prompt-builder.service.ts` monta o system prompt em layers
e marca `providerOptions.anthropic.cacheControl = { type: 'ephemeral' }` no fim de
cada layer cacheável. Isso só é preservado se o tráfego Anthropic for pelo
passthrough `/anthropic/v1` (por isso o roteamento por provider, não um endpoint
OpenAI único).

**Mock test-only (NFR-09):** fora de `production`, `E2E_LLM_MOCK=1` faz
`getModel` retornar um `MockLanguageModelV3` (de `ai/test`) determinístico, para
os E2E do Builder rodarem sem chave real. Guard duro `NODE_ENV !== 'production'`
torna a env impossível de honrar em prod.

---

## 4. Afirmações erradas encontradas em outros docs (apontamento, não caça)

Estas usam "Vercel" de forma que **pode** confundir. Não foram alteradas aqui
(escopo: criar este doc), mas ficam registradas:

- `docs/deprecated/builder-architecture-v5-2026-04.md` — "via Vercel AI SDK" e
  "Provider chain (via Vercel AI SDK)". Está **deprecated**, mas o termo correto
  já é "Vercel AI SDK" (biblioteca) — manter assim, nunca encurtar para "Vercel".
- `docs/builder/BUILDER_AGENT_ARCHITECTURE.md` — várias menções a "Vercel AI SDK
  `tool()`" / "`generateText()` do Vercel AI SDK". Tecnicamente corretas
  (biblioteca); ok desde que não virem "usamos Vercel".

**Atenção — NÃO confundir com analogias estratégicas:** frases como "Quayer é a
Vercel do WhatsApp" (`docs/builder/BUILDER_USER_JOURNEY.md`,
`docs/strategy/*`) são **metáforas de posicionamento de produto** (você cria, a
plataforma orquestra), **não** uma afirmação técnica de stack. Essas podem ficar.

**Já correto:** `docs/infra/SECRETS.md` §"Secrets compartilhados (Vercel — A
REMOVER)" afirma explicitamente "Não usamos Vercel" e lista `VERCEL_*` para
deleção — alinhado com este doc.

---

## 5. Decisão (resumo para registro)

- **Front-end não fala com LLM.** Única superfície de IA do cliente é o stream
  SSE vindo de rotas Igniter.
- **"Vercel AI SDK" = biblioteca** (pacote `ai` + `@ai-sdk/*`), nunca "Vercel"
  (plataforma/host). Não há infra Vercel no projeto.
- **Roteamento centralizado:** `getModel()` em `provider-factory.ts` é o único
  ponto de criação de modelo; **LiteLLM** é o gateway quando configurado
  (por-provider, preservando prompt cache Anthropic).
- **Fluxo canônico:** front → API Igniter → backend (primitives do `ai`) →
  provider factory → LiteLLM/provedor.
