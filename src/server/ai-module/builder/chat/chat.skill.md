# Skill — Builder Chat (Meta-Agente)

Chat conversacional do **meta-agente Builder IA** — a interface pela qual o humano descreve o que quer e vê o meta-agente provisionando infraestrutura.

---

## NÃO confundir com WhatsApp

| Contexto | Chat do Builder | Mensagem WhatsApp |
|---|---|---|
| Quem fala | Humano construindo um agente | Cliente final do negócio |
| Quem responde | Meta-agente Builder IA | Agente gerado pelo Builder |
| Tabela de mensagens | `BuilderProjectMessage` | `Message` (communication) |
| Ingress | HTTP SSE (`/builder/projects/:id/chat/message`) | Webhook UAZ → `communication/messages` |
| Runtime | `processAgentMessageStream` com `BUILDER_RESERVED_NAME` | Mesma função, outro agentConfigId |

**Ambos usam o mesmo runtime** (`ai-agents/agent-runtime.service.ts`) — a diferença é qual `AIAgentConfig` é carregado.

---

## SSE streaming

O endpoint `sendChatMessage` retorna `text/event-stream`. Cada evento é um JSON serializado precedido de `data: ` e terminado com `\n\n`.

### Tipos de `AgentStreamEvent`

| Tipo | Payload | Quando |
|---|---|---|
| `text-delta` | `{ text: string }` | Token do LLM chegou — concatenar |
| `tool-call` | `{ toolName, args }` | Meta-agente decidiu invocar uma tool |
| `tool-result` | `{ toolName, result }` | Tool retornou — frontend renderiza card |
| `finish` | `{ toolCalls, usage, cost, model, provider, latencyMs }` | Turn completo — persistir assistant message |
| `error` | `{ message }` | Erro no stream — persistir banner + fechar |

Ordem típica: `text-delta* (tool-call tool-result)* text-delta* finish`.

---

## Context-budget + summary

Cada turno, **antes** de chamar o LLM:

1. **Carrega histórico** (últimas 10 mensagens, `orderBy createdAt desc` + `reverse`)
2. **`shouldCompact(history)`** — se passou do threshold de tokens, chama `compactMessages` (LLM faz sumarização)
3. **`ContextBudgetExhaustedError`** — se nem compactado couber, retorna `400` forçando novo projeto
4. **`stateSummary`** — banner opcional em `conversation.stateSummary` com estado atual do projeto

Após o `finish`, **fire-and-forget** `updateStateSummary(conversationId)` atualiza o resumo para o próximo turno.

---

## Handler split rationale

O controller é gordo (~260 linhas em `sendChatMessage`). Possível split futuro:

- `chat/chat.service.ts` — lógica de montagem de contexto (`historyBlock`, `stateBanner`, `augmentedMessageContent`)
- `chat/chat.stream.ts` — orquestração do `ReadableStream` + persistência
- Controller vira fino (validação + delegação)

**Ainda não feito** porque o fluxo é linear e readable; split prematuro adiciona indireção sem valor claro. Fazer quando adicionar segunda forma de chat (ex: continuar conversa de outro device).

---

## Persistência pós-stream

Ao receber `finish`:

```typescript
await database.builderProjectMessage.create({
  data: {
    conversationId,
    role: 'assistant',
    content: accumulatedText,      // concatenação dos text-delta
    toolCalls: event.toolCalls,    // JSON
    metadata: { usage, cost, model, provider, latencyMs },
  },
})
```

Ao receber `error`, persiste `role: 'system_banner'` com a mensagem de erro.

---

## Synthetic IDs (Option A)

```typescript
{
  agentConfigId: builderAgent.id,           // real
  sessionId: conversation.id,               // real (do Builder)
  contactId: user.id,                       // real (do humano)
  connectionId: 'builder-internal',         // SINTÉTICO
  organizationId: user.currentOrgId,
  messageContent: augmentedMessageContent,  // state banner + history + new msg
}
```

O runtime tolera `sessionId` desconhecido (não tem correspondência em `message` do communication) — `buildConversationContext` retorna `[]`. Por isso inline-amos o histórico dentro de `messageContent`.

---

## Referências

- Handler: `src/server/ai-module/builder/builder.controller.ts` (`sendChatMessage`)
- Event types: `src/server/ai-module/ai-agents/agent-runtime.service.ts` (`AgentStreamEvent`)
- Compaction: `src/server/ai-module/builder/services/context-budget.service.ts`
- Summary: `src/server/ai-module/builder/services/context-summary.service.ts`
