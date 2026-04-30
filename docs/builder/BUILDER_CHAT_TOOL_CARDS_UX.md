# Builder — Bullets visuais no Chat (Tool Cards & UX)

> Companheiro de [BUILDER_USER_JOURNEY.md](./BUILDER_USER_JOURNEY.md) e [BUILDER_PREVIEW_TABS_UX.md](./BUILDER_PREVIEW_TABS_UX.md). Aqui está documentado **o que aparece dentro do `ChatPanel`** quando o agente Builder executa ferramentas — os tais "bullets de UI" inline no chat, quais passos são visíveis, e como elementos visuais (ex.: QR Code) são ativados.

---

## O que é um "bullet" no chat?

Quando o usuário conversa com o Builder e a LLM decide executar uma **tool** (ex.: `create_agent`, `create_whatsapp_instance`), a UI **não mostra JSON cru**. Ela troca o bullet de texto por um **card visual rico** dentro da própria mensagem do assistant.

```
┌──────────────────────────────────────────────────────────┐
│ 🤖  Vou criar o agente pra você…                         │  ← texto normal
│                                                          │
│     ╭──────────────────────────────╮                     │
│     │ 🔧 create_agent   concluído  │                     │  ← tool card colapsado
│     ╰──────────────────────────────╯                     │
│                                                          │
│     ╭──────────────────────────────╮                     │
│     │ ✓  Assistente Suporte        │                     │  ← card rico (auto-expande)
│     │    Agente criado (v1)        │                     │
│     │    ID: agt_abc123            │                     │
│     ╰──────────────────────────────╯                     │
└──────────────────────────────────────────────────────────┘
```

**Arquivos:** [chat-message.tsx](../../src/client/components/projetos/chat/chat-message.tsx) dispara; [cards/tool-results/index.tsx](../../src/client/components/projetos/cards/tool-results/index.tsx) é o **dispatcher** que escolhe o card correto.

---

## Fluxo completo — do backend até o pixel

```
┌──── Usuário digita ──────────────────────────────────────────┐
│  "Cria um agente de suporte pra minha barbearia"             │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
         POST /api/v1/builder/projects/:id/chat/message
                   ↓
┌──── Backend (LLM + tools) ───────────────────────────────────┐
│  stream SSE:                                                 │
│    { type: "text-delta", text: "Vou criar o agente…" }       │
│    { type: "tool-call",  toolName: "create_agent", args }    │  ← dispara card "executando"
│    { type: "tool-result", toolName: "create_agent", result } │  ← troca card por rich
│    { type: "finish" }                                        │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──── use-chat-stream.ts ──────────────────────────────────────┐
│  parseSseBuffer → streamingText + streamingToolCalls[]        │
└──────────────────┬───────────────────────────────────────────┘
                   ↓
┌──── chat-message.tsx ────────────────────────────────────────┐
│  Para cada tool call:                                        │
│   1. result === undefined → Collapsible [executando…]        │
│   2. RICH_CARD_TOOLS.has(toolName) → <ToolResultCard />      │  ← auto-expande
│   3. caso contrário → Collapsible (JSON fallback)            │
└──────────────────────────────────────────────────────────────┘
                   ↓
              Render visual
```

**Ponto-chave:** o "bullet" já existe **antes do resultado chegar** — o usuário vê `🔧 create_agent  ⏳ executando` enquanto o backend processa. Quando o `tool-result` chega via SSE, o mesmo bullet se transforma no card rico.

---

## Dois modos de renderização

### Modo 1 — Collapsible (genérico)

Usado para **tools sem card dedicado** ou **enquanto está streaming** (`result === undefined`).

```
┌─────────────────────────────────────────────┐
│ 🔧 list_whatsapp_instances  ⏳ executando   │  ← streaming
└─────────────────────────────────────────────┘

                    ↓ chega tool-result

┌─────────────────────────────────────────────┐
│ 🔧 list_whatsapp_instances  concluído    ▾  │  ← colapsado, clicável
├─────────────────────────────────────────────┤
│   ARGUMENTOS                                │
│   { "organizationId": "org_abc" }           │
│                                             │
│   RESULTADO                                 │
│   { "success": true, "instances": [...] }   │
└─────────────────────────────────────────────┘
```

**Componente:** `ToolCallCard` em [chat-message.tsx](../../src/client/components/projetos/chat/chat-message.tsx#L40).
**Trigger:** quando `result === undefined` **ou** o toolName **não está** em `RICH_CARD_TOOLS`.

### Modo 2 — Rich Card (dedicado)

Usado quando o tool está em `RICH_CARD_TOOLS` **e** já retornou `success: true`.

```typescript
// chat-message.tsx, linha ~26
const RICH_CARD_TOOLS = new Set([
  "create_agent",
  "list_whatsapp_instances",
  "create_whatsapp_instance",
  "generate_prompt_anatomy",
  "publish_agent",
  "get_agent_status",
  "attach_tool_to_agent",
])
```

Esses tools **não vão pro collapsible**: o card visual aparece direto, sem o chrome `🔧 toolname`. É aqui que entra o QR Code, a lista de instâncias, o card de sucesso de publicação etc.

---

## Catálogo dos bullets visuais (tool cards)

Cada entrada mostra: **trigger** (qual SSE event dispara) · **wireframe** · **arquivo** · **estado** (quando mostra o quê).

---

### 1. `create_agent` — Agente criado

**Trigger:** LLM decide que já tem contexto suficiente (nome, objetivo, tom) → chama `create_agent` → backend cria `AiAgent` + `AiAgentVersion` v1.

**Fluxo visual:**

```
┌─ Durante execução ───────────────────────────────┐
│ 🔧 create_agent  ⏳ executando                    │
└──────────────────────────────────────────────────┘

                    ↓ tool-result SSE

┌─ Resultado (rich) ───────────────────────────────┐
│ ╭──────────────────────────────────────────────╮ │
│ │ ✓  Assistente Barbearia X             [v1]   │ │  ← header verde
│ │    Agente criado com sucesso                 │ │
│ ├──────────────────────────────────────────────┤ │
│ │    ID: agt_01HN8X3KM9Z…                      │ │  ← footer mono
│ ╰──────────────────────────────────────────────╯ │
└──────────────────────────────────────────────────┘
  Borda: rgba(34,197,94,0.30)  bg header: rgba(34,197,94,0.08)
  Ícone: Check em círculo verde
```

**Arquivo:** [approval-card.tsx](../../src/client/components/projetos/cards/approval-card.tsx) (`AgentCreatedCard`) — adaptado por [create-agent.result.tsx](../../src/client/components/projetos/cards/tool-results/create-agent.result.tsx).
**Campos lidos:** `result.agentName`, `result.agentId`, `result.versionNumber`.

---

### 2. `list_whatsapp_instances` — Lista de canais disponíveis

**Trigger:** Builder precisa saber quais instâncias WhatsApp o usuário já tem (antes de sugerir conexão) → chama `list_whatsapp_instances`.

**Estado A — vazio (primeira vez):**

```
┌──────────────────────────────────────────────────┐
│              📱                                  │
│      Nenhuma instância WhatsApp encontrada       │
│   Crie uma nova instância para conectar seu WA   │
└──────────────────────────────────────────────────┘
```

**Estado B — com instâncias:**

```
┌─ INSTÂNCIAS WHATSAPP (2) ────────────────────────┐
│ 📱  Suporte                     ● Conectado      │
│     +55 11 99999-0001                            │
├──────────────────────────────────────────────────┤
│ 📱  Vendas                      ● Desconectado   │
│     —                                            │
└──────────────────────────────────────────────────┘
  Status dots: conectado #22c55e · conectando #eab308
               desconectado #ef4444
```

**Arquivo:** [instance-card.tsx](../../src/client/components/projetos/cards/instance-card.tsx) (`InstanceListCard`).

---

### 3. `create_whatsapp_instance` — QR Code para parear 📲

**O bullet mais importante.** É aqui que a mágica visual do pareamento acontece.

**Trigger:** Builder chama `create_whatsapp_instance` → backend UAZ cria a instância e **começa a gerar o QR Code assíncrono**. O primeiro `tool-result` pode chegar com `qrCodeBase64 = null` (ainda gerando) ou já com o QR em base64.

**Fluxo visual — 3 estados:**

```
┌─ Estado A: QR ainda gerando ─────────────────────┐
│ ╭──────────────────────────────────────────────╮ │
│ │ 📱  Minha Barbearia        ● Desconectado    │ │
│ ├──────────────────────────────────────────────┤ │
│ │                                              │ │
│ │          ┌─────────────────┐                 │ │
│ │          │                 │                 │ │
│ │          │       ▨         │  ← QrCode icon  │ │
│ │          │                 │     placeholder │ │
│ │          └─────────────────┘                 │ │
│ │                                              │ │
│ │     QR Code será gerado em instantes…        │ │
│ │                                              │ │
│ ├──────────────────────────────────────────────┤ │
│ │ 🔗 https://wa.quayer.app/i/abc123      [📋] │ │  ← shareLink copiável
│ ╰──────────────────────────────────────────────╯ │
└──────────────────────────────────────────────────┘
```

```
┌─ Estado B: QR pronto ────────────────────────────┐
│ ╭──────────────────────────────────────────────╮ │
│ │ 📱  Minha Barbearia        ● Desconectado    │ │
│ ├──────────────────────────────────────────────┤ │
│ │                                              │ │
│ │         ┌─────────────────┐                  │ │
│ │         │ ██  ██ ██ ██ ██ │                  │ │
│ │         │ ██  ██ ██ ██ ██ │  ← <img          │ │
│ │         │ ██  ██    ██ ██ │    src="data:    │ │
│ │         │ ██ ██  ██  ██ ██│    image/png;    │ │
│ │         │ ██ ██ ██ ██  ██ │    base64,…" />  │ │
│ │         │ ██  ██ ██  ██ ██│    144×144 px    │ │
│ │         └─────────────────┘                  │ │
│ │                                              │ │
│ │   Escaneie o QR Code com o WhatsApp do       │ │
│ │   celular                                    │ │
│ │                                              │ │
│ ├──────────────────────────────────────────────┤ │
│ │ 🔗 https://wa.quayer.app/i/abc123      [📋] │ │
│ ╰──────────────────────────────────────────────╯ │
└──────────────────────────────────────────────────┘
```

```
┌─ Estado C: Conectado (após scan) ────────────────┐
│ ╭──────────────────────────────────────────────╮ │
│ │ 📱  Minha Barbearia         ● Conectado      │ │
│ │     +55 11 99999-0001                        │ │
│ ├──────────────────────────────────────────────┤ │
│ │ 🔗 https://wa.quayer.app/i/abc123      [📋] │ │
│ ╰──────────────────────────────────────────────╯ │
│   (área do QR desaparece — status === connected) │
└──────────────────────────────────────────────────┘
```

**Como o QR é ativado tecnicamente:**

| Passo | O que acontece |
|---|---|
| 1 | LLM chama tool `create_whatsapp_instance` com `{ name: "Minha Barbearia" }` |
| 2 | Backend cria registro + pede QR pra UAZ via `uaz.instances.create()` |
| 3 | SSE `tool-result` chega com `{ success: true, instanceId, shareLink, qrCodeBase64 }` |
| 4 | Dispatcher [`ToolResultCard`](../../src/client/components/projetos/cards/tool-results/index.tsx#L70) detecta `create_whatsapp_instance` + `success: true` → renderiza `<CreateInstanceResult />` |
| 5 | `CreateInstanceResult` → `<InstanceCard qrCodeBase64={...} status="disconnected" />` |
| 6 | `InstanceCard` avalia `status !== "connected"` → mostra a área do QR; se `qrCodeBase64` presente → `<img src="data:image/png;base64,..." />`, senão o placeholder `<QrCode />` + texto "será gerado em instantes" |
| 7 | Quando o usuário escaneia, webhook do UAZ atualiza status → **próxima** mensagem do chat mostra o card em estado conectado (sem re-render do anterior — o card existente fica congelado em "desconectado") |

**Arquivo:** [instance-card.tsx](../../src/client/components/projetos/cards/instance-card.tsx) (linhas 124–156 são o bloco do QR).
**Adapter:** [create-instance.result.tsx](../../src/client/components/projetos/cards/tool-results/create-instance.result.tsx).

---

### 4. `generate_prompt_anatomy` — Prompt gerado (expansível)

**Trigger:** Builder coletou requisitos → gera um system prompt estruturado e mostra pra aprovação.

```
┌─ 📄 PROMPT GERADO ───────────────────────────────┐
│                                                  │
│ # Papel                                          │
│ Você é o assistente virtual da Barbearia X…      │
│                                                  │
│ # Tom                                            │
│ Amigável, direto, levemente informal. Usa        │
│ emojis com moderação (máx 1 por mensagem).       │
│                                                  │
│ # Limites                                        │
│ 1. Nunca confirme preço sem conferir a tabel…    │
│                                                  │
│                                              …   │
│                                                  │
│ ▸ Ver prompt completo                            │  ← só aparece se > 300 chars
└──────────────────────────────────────────────────┘
  Borda: tokens.brandBorder  Header bg: tokens.brandSubtle
```

Clique em **Ver prompt completo** expande o `<pre>` pra mostrar tudo; vira **Ver menos**.

**Arquivo:** [search-web.result.tsx](../../src/client/components/projetos/cards/tool-results/search-web.result.tsx) (`PromptPreviewCard`).
**Nota:** o componente se chama `SearchWebResult` por razões históricas — hoje ele cobre `generate_prompt_anatomy`. [`chat-message.tsx:183`](../../src/client/components/projetos/chat/chat-message.tsx#L183) também **deduplica** o texto do assistant que começa com `# Papel` pra não repetir o mesmo conteúdo duas vezes na tela.

---

### 5. `attach_tool_to_agent` — Ferramenta anexada

**Trigger:** Builder decide que o agente precisa de uma ferramenta extra (ex.: `create_lead`, `schedule_appointment`).

```
┌──────────────────────────────────────────────────┐
│ 🔧  Ferramenta adicionada                    ✓   │
│     create_lead                                  │
└──────────────────────────────────────────────────┘
  Borda: rgba(34,197,94,0.30)  check verde à direita
  toolKey em fonte mono
```

**Arquivo:** [attach-tool.result.tsx](../../src/client/components/projetos/cards/tool-results/attach-tool.result.tsx).

---

### 6. `update_agent_prompt` — Rascunho atualizado

**Trigger:** usuário pede ajuste no tom/conteúdo → Builder chama `update_agent_prompt` → cria nova `AiAgentVersion` em draft.

```
┌─ 📄 Prompt atualizado (v2) ──────────────────────┐
│                                                  │
│    Rascunho criado — ainda não publicado         │
│                                                  │
├──────────────────────────────────────────────────┤
│   Ajustado o tom pra ser mais direto e adicio-   │
│   nado bloqueio explícito de confirmar preços.   │  ← description ou message
└──────────────────────────────────────────────────┘
  Borda: tokens.brandBorder (azul marca)
  Ícone: FileText em círculo da marca
```

**Arquivo:** [update-prompt.result.tsx](../../src/client/components/projetos/cards/tool-results/update-prompt.result.tsx).

---

### 7. `publish_agent` — Publicação (sucesso **ou** bloqueadores)

**Dois sub-cards**, escolhidos pelo dispatcher:

**Estado A — sucesso (`success: true`):**

```
┌─ 🚀  AGENTE PUBLICADO! ──────────────────────────┐
│                                                  │
│     Agente publicado!                            │
│     A versão v3 está em produção.                │
│     Versão publicada: v3                         │
│                                                  │
└──────────────────────────────────────────────────┘
  Borda + bg: verde sucesso
```

**Estado B — bloqueadores (`success: false, blockers: [...]`):**

```
┌─ ⚠ BLOQUEADORES ENCONTRADOS ─────────────────────┐
│                                                  │
│   •  Canal WhatsApp não conectado                │
│   •  Plano ativo necessário                      │
│   •  BYOK não configurado                        │
│                                                  │
│   ┌ Ver planos ↗ ┐ ┌ Configurar provedor ↗ ┐     │  ← redirects
│   └──────────────┘ └───────────────────────┘     │
└──────────────────────────────────────────────────┘
  Borda + bg: amarelo warning (#eab308)
  Redirects viram botões — chaves conhecidas:
    plan → "Ver planos"
    byok → "Configurar provedor"
    instance → "Gerenciar instâncias"
```

**Arquivo:** [publish-agent.result.tsx](../../src/client/components/projetos/cards/tool-results/publish-agent.result.tsx).

---

### 8. `get_agent_status` — Status atual do agente

**Trigger:** Builder ou usuário pergunta "como tá o agente?" — mostra snapshot de estado/versão/métricas.

**Arquivo:** [run-playground.result.tsx](../../src/client/components/projetos/cards/tool-results/run-playground.result.tsx) (reaproveitado).

---

### 9. Fallback — tools sem card dedicado

**Trigger:** qualquer tool fora de `RICH_CARD_TOOLS` **com resultado** (não streaming).

```
┌─ 🔧 run_playground_test   concluído  ▾ ──────────┐
├──────────────────────────────────────────────────┤
│   ARGUMENTOS                                     │
│   { "input": "quanto custa corte?" }             │
│                                                  │
│   RESULTADO                                      │
│   { "reply": "R$ 35 no básico…", "ok": true }    │
└──────────────────────────────────────────────────┘
  JSON colorido em <pre> colapsado por padrão
```

**Arquivo:** [fallback.result.tsx](../../src/client/components/projetos/cards/tool-results/fallback.result.tsx) (`FallbackResultCard`).

---

### 10. Erro genérico — qualquer tool com `success: false`

**Trigger:** resultado chega com `success: false` **e** nenhum card dedicado trata o erro.

```
┌──────────────────────────────────────────────────┐
│ ⚠   Erro em create_whatsapp_instance             │
│     UAZ retornou 429: rate-limit excedido        │
└──────────────────────────────────────────────────┘
  Borda vermelha  ícone AlertTriangle  mono no toolName
```

**Arquivo:** [fallback.result.tsx](../../src/client/components/projetos/cards/tool-results/fallback.result.tsx) (`GenericErrorCard`).

---

## Resumo cruzado — trigger × card

| Tool (backend) | Evento SSE | Dispatcher key | Card renderizado | Visual especial |
|---|---|---|---|---|
| `create_agent` | `tool-result` + `success: true` | `create_agent && isSuccess` | `AgentCreatedCard` | header verde |
| `list_whatsapp_instances` | `tool-result` + `success: true` | `list_whatsapp_instances && isSuccess` | `InstanceListCard` | lista com status dots |
| `create_whatsapp_instance` | `tool-result` + `success: true` | `create_whatsapp_instance && isSuccess` | `InstanceCard` | **QR Code image** |
| `generate_prompt_anatomy` | `tool-result` + `success: true` | `generate_prompt_anatomy && isSuccess` | `PromptPreviewCard` | expand/collapse |
| `attach_tool_to_agent` | `tool-result` + `success: true` | `attach_tool_to_agent && isSuccess` | `ToolAttachedCard` | check verde inline |
| `update_agent_prompt` | `tool-result` + `success: true` | `update_agent_prompt && isSuccess` | card dedicado | borda da marca |
| `publish_agent` | `tool-result` + `success: true` | `publish_agent && isSuccess` | `DeploySuccessCard` | 🚀 verde |
| `publish_agent` | `tool-result` + `success: false` + `blockers` | branch de blockers | `DeployBlockersCard` | ⚠ amarelo + redirects |
| `get_agent_status` | `tool-result` + `success: true` | `get_agent_status && isSuccess` | `RunPlaygroundResult` | — |
| *(qualquer)* | `tool-call` (sem result ainda) | N/A — streaming | `Collapsible` "⏳ executando" | spinner |
| *(qualquer)* | `tool-result` + `success: false` | fallback | `GenericErrorCard` | ⚠ vermelho |
| *(outras)* | `tool-result` | fallback | `FallbackResultCard` | JSON colapsado |

---

## Ativação visual — regra por regra

**Por que o QR Code aparece?**

```typescript
// instance-card.tsx, linha 125
{status !== "connected" && (
  <div className="mx-4 mb-3 flex flex-col items-center …">
    {qrCodeBase64 ? (
      <img src={`data:image/png;base64,${qrCodeBase64}`} … />
    ) : (
      <div><QrCode /></div>   // placeholder
    )}
  </div>
)}
```

Três condições simultâneas:
1. `CreateInstanceResult` foi escolhido pelo dispatcher (toolName bate + success).
2. `status !== "connected"` — área só aparece enquanto não pareou.
3. Se `qrCodeBase64` veio **no payload**, renderiza `<img>`; senão, placeholder com texto "QR Code será gerado em instantes…".

**Por que o card do agente é verde e não azul?**

Cores semânticas fixas no componente, não tokens:
- `rgba(34,197,94,…)` → sucesso/connected
- `rgba(234,179,8,…)` → warning/connecting/blockers
- `rgba(239,68,68,…)` → erro/disconnected
- `tokens.brand*` → neutro/"em andamento"

**Por que alguns cards são rich e outros colapsáveis?**

A Set `RICH_CARD_TOOLS` em [chat-message.tsx:26](../../src/client/components/projetos/chat/chat-message.tsx#L26) controla a lista. Fora dela, o tool sempre vai pro collapsible — inclusive com o card rico renderizado **dentro** do collapsible quando o resultado chega.

---

## Adicionar um bullet novo

Quero um card dedicado pra `create_custom_tool`:

1. **Criar** `src/client/components/projetos/cards/tool-results/create-custom-tool.result.tsx` exportando `<CreateCustomToolResult />`.
2. **Registrar** no dispatcher — [tool-results/index.tsx](../../src/client/components/projetos/cards/tool-results/index.tsx):
   ```typescript
   if (toolName === "create_custom_tool" && isSuccess(result)) {
     return <CreateCustomToolResult args={args} result={result} tokens={tokens} />
   }
   ```
3. **Adicionar** na constante `RICH_CARD_TOOLS` de [chat-message.tsx](../../src/client/components/projetos/chat/chat-message.tsx#L26) pra pular o collapsible.
4. **Mapear** na tab **Atividade** — [BUILDER_PREVIEW_TABS_UX § Mapa de tools](./BUILDER_PREVIEW_TABS_UX.md#3-atividade-activity--_core--todos-os-types) — pra aparecer com label + ícone no timeline.

Zero mudança em `chat-panel.tsx` ou `use-chat-stream.ts`.

---

## Referências

- Protocolo SSE: [hooks/use-chat-stream.ts](../../src/client/components/projetos/chat/hooks/use-chat-stream.ts)
- Dispatcher: [cards/tool-results/index.tsx](../../src/client/components/projetos/cards/tool-results/index.tsx)
- Bubble do assistant: [chat/chat-message.tsx](../../src/client/components/projetos/chat/chat-message.tsx)
- Jornada end-to-end (texto + UI): [BUILDER_USER_JOURNEY.md](./BUILDER_USER_JOURNEY.md)
- UX das tabs do PreviewPanel: [BUILDER_PREVIEW_TABS_UX.md](./BUILDER_PREVIEW_TABS_UX.md)
- Arquitetura do agente Builder: [BUILDER_AGENT_ARCHITECTURE.md](./BUILDER_AGENT_ARCHITECTURE.md)
