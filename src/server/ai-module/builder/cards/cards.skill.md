---
Criado: 2026-06-05
Atualizado: 2026-06-05
Revisar em: ao concluir W3 (cards FE) ou se o protocolo de card-action mudar
Relacionados:
  - src/server/ai-module/builder/cards/builder-state.ts
  - src/server/ai-module/builder/cards/card-submit.schemas.ts
  - src/server/ai-module/builder/cards/handlers/apply-card-submit.ts
  - src/server/ai-module/builder/cards/card-submit.routes.ts
  - src/server/ai-module/builder/chat/handlers/stream-agent-response.ts
  - src/server/ai-module/builder/prompts/whatsapp-agent-system-prompt.ts
  - docs/builder/ORAYON_UPLIFT_SPEC.md
---

# Skill — Cards do Builder (protocolo PATCH-then-ACK)

Framework de **card-action determinístico** do meta-agente Builder (Orayon Uplift, W2).
Substitui a antiga "aprovação por regex".

---

## O problema (modelo antigo)

Antes, um card (ex: aprovação do agente, seleção de tools, escolha de canal) renderizava
no chat e, ao clicar, **postava uma mensagem de usuário sintética** (ex: `"pode criar"`).
O system prompt continha regras de regex (`whatsapp-agent-system-prompt.ts:103-128`) que o
LLM interpretava para decidir o próximo passo. Problemas:

- **Duas fontes de verdade**: o estado real vivia no texto da conversa; o FE re-derivava
  progresso por conta própria.
- **Frágil**: qualquer variação de frase quebrava o match; o LLM podia "alucinar" confirmação.
- **Sem sentinela server-side**: a confirmação dependia de texto, não de um booleano
  resolvido por `organizationId`.

---

## O modelo novo (PATCH-then-ACK)

O card NÃO conversa mais por texto. Ele faz **PATCH determinístico** do estado e o LLM lê
a decisão do estado, nunca de regex.

```
[FE card click]
   └─ POST /builder/projects/:id/cards/:cardKey/submit  (payload tipado)
        └─ applyCardSubmit()                              ← Stage 2 (este módulo)
             1. parseBuilderState(conversation.builderState)   (null → DEFAULT, nunca throw)
             2. re-valida listas do cliente SERVER-SIDE:
                  - tool_selection.toolKeys → BUILTIN_TOOL_NAMES
                  - channel.channelKey      → catálogo canônico (CHANNEL_KEYS)
             3. aplica campos OWNED via helpers puros (patchBuilderState)
                + flipa a sentinela via applyConfirmation(state, key)
             4. updateMany filtrado por organizationId  (1 write)
             5. retorna { cardInstruction }  ← nota de sistema pt-BR
        └─ buildSseResponse({ ..., cardInstruction })     ← MESMA wire do chat
             └─ turno de ACK streamado (text-delta / tool-call / finish)
```

**Princípio**: card = PATCH de estado. O banner do system prompt e o progresso da UI passam
a ler a MESMA fonte (`BuilderState`). Sentinelas (`confirmations.*`) são **booleanos
resolvidos server-side** — NUNCA confie no body do request.

---

## Arquivos (Stage 2)

| Arquivo | Papel |
|---|---|
| `card-submit.schemas.ts` | Zod: union discriminada por `cardKey` + `cardSubmitParamsSchema`. Payloads vivem num **registry** (`CARD_PAYLOAD_SCHEMAS`) — W3 adiciona um card registrando uma entrada, sem reescrever a union nem o handler. |
| `handlers/apply-card-submit.ts` | `applyCardSubmit(args)` — núcleo determinístico, sem HTTP. Re-valida listas, aplica estado, persiste filtrado por org, retorna `cardInstruction`. |
| `card-submit.routes.ts` | Mutation Igniter `submitCard` (`POST /projects/:id/cards/:cardKey/submit`). Guards de auth/tenant espelhados de `chat/chat.routes.ts`. Exporta `cardSubmitRoutes`. |
| `builder-state.ts` | (Stage 1) tipo canônico + helpers puros. **Importado** por este módulo, sem dependência circular. |

---

## Os 3 cards desta fase (os que já existiam)

| cardKey | action | payload re-validado | sentinela (`confirmations.*`) |
|---|---|---|---|
| `agent_approval` | `confirm` | — (confirma a proposta já existente) | `agentApproved` |
| `tool_selection` | `apply` | `toolKeys` ⟶ `BUILTIN_TOOL_NAMES` | `tools` |
| `channel` | `select` | `channelKey` ⟶ catálogo de canais | `channel` |

W3 adiciona os 12 cards do catálogo (persona, hours, pricing, qualification, team, calendar,
activation, summary, source...) mapeando cada um a uma sentinela de `confirmations`.

---

## Contrato `cardInstruction` (consumido pelo Stage 3)

`applyCardSubmit` retorna `{ cardInstruction: string }` — uma **nota de sistema em pt-BR**
que semeia o turno de ACK. Exemplo: `"O usuário CONFIRMOU a criação via card. Prossiga com
create_agent..."`. O `card-submit.routes.ts` passa esse texto a `buildSseResponse(...)` como
campo `cardInstruction` (forward-compatible). **Stage 3** adiciona `cardInstruction?: string`
a `StreamAgentResponseParams` e injeta a nota como mensagem de sistema no turno de ACK —
sem alterar a wire (mesmo formato SSE do chat).

Enquanto o consumidor não está conectado, o turno ainda streama (o `cardInstruction` também
é passado como `userMessage`, garantindo conteúdo no turno). A `cardInstruction` NUNCA inventa
integrações — descreve apenas a ação determinística que o card já aplicou.

---

## Regras duras

- **Zero confiança no body**: toda lista do cliente (`toolKeys`, `channelKey`) é re-checada
  contra a fonte canônica server-side antes de persistir.
- **Filtro por `organizationId`** em toda query/escrita (carrega por `projectId` único +
  confere org; escreve via `updateMany` filtrado por org).
- **`parseBuilderState` nunca throwa**: linha legada (`builderState = null`) cai em
  `DEFAULT_BUILDER_STATE` e segue funcionando.
- **Helpers puros**: estado é aplicado só via `patchBuilderState` / `applyConfirmation`
  (sem mutação in-place). Arrays são substituídos por inteiro (last-write-wins) — cards que
  acrescentam a um array devem fazer read-modify-write do array completo.
