# Skill — Chat Panel (Builder IA)

Orquestração do chat conversacional com o meta-agente Builder IA. Consome SSE do
backend (`/builder/projects/:id/chat/message`) e renderiza em tempo real.

---

## Arquitetura de arquivos

| Arquivo | Responsabilidade | Linhas |
|---|---|---|
| `chat-panel.tsx` | Orquestrador: estado + scroll + ChatActionProvider | ~130 |
| `chat-message.tsx` | Dispatcher por role: user / assistant / system_banner | ~160 |
| `chat-message-list.tsx` | Lista cronológica + empty state + erro + retry | ~140 |
| `chat-input.tsx` | Textarea + slash commands + shortcuts | ~100 |
| `tool-call-card.tsx` | Card colapsável para qualquer tool (fallback) | ~145 |
| `markdown-content.tsx` | Renderer Markdown com tokens do design system | ~150 |
| `quick-reply-bar.tsx` | Chips de resposta rápida extraídos de listas numeradas | ~90 |
| `chat-action-context.tsx` | Context para `sendMessage` / `isStreaming` nos cards | ~40 |
| `hooks/use-chat-stream.ts` | SSE client: parse eventos, acumula text-delta | ~264 |
| `hooks/use-chat-scroll.ts` | Auto-scroll inteligente + detecção de scroll manual | ~80 |
| `utils/parse-quick-reply.ts` | Detecta listas numeradas e extrai como `QuickReplyChip[]` | ~80 |
| `utils/strip-card-text.ts` | Remove texto redundante quando card rico já o exibe | ~50 |

---

## Fluxo de uma mensagem do assistant

```
SSE finish → ChatMessage (role=assistant)
  └─ AssistantBubble
       ├─ stripCardText()        → remove corpo quando card rico existe
       ├─ strip anatomy prompt   → remove prompt verbatim do generate_prompt_anatomy
       ├─ parseQuickReply()      → extrai chips de listas numeradas
       ├─ MarkdownContent        → renderiza cleanText como Markdown
       ├─ ToolCallCard[]         → card colapsável ou card rico por tool
       └─ QuickReplyBar          → chips clicáveis (se chips.length >= 2)
```

---

## Quick-reply chips

Detectados automaticamente quando o assistant termina mensagem com:

```
Próximos passos:
1. Ativar ferramenta extra
2. Ajustar tom de voz
3. Criar agente assim
```

O parser (`utils/parse-quick-reply.ts`) remove a lista do texto e a converte em
`QuickReplyChip[]`. O `QuickReplyBar` renderiza como botões; ao clicar, chama
`sendMessage()` e bloqueia os demais (transcript imutável).

---

## Deduplicação texto × card

Algumas tools retornam cards ricos que já mostram as opções visualmente:
`select_channel`, `propose_tool_selection`, `propose_plan_upgrade`,
`propose_agent_creation`, `adjust_prompt_tone`.

`stripCardText()` trunca o texto do assistant à primeira frase quando um desses
cards está presente e o texto tem > 80 chars. Elimina o padrão "pergunta em
texto + card com as mesmas opções".

---

## Markdown

`MarkdownContent` usa `react-markdown` + `remark-gfm`. Elementos suportados:
`p` / `h1–h3` / `ul` / `ol` / `li` / `strong` / `em` / `code` (inline+block) /
`pre` / `blockquote` / `hr` / `a`. Todos estilizados via `AppTokens`.

Streaming ainda usa `whitespace-pre-wrap` simples (não vale parsear Markdown
parcial em tempo real).

---

## `use-chat-stream` — hook SSE client

```typescript
const {
  messages,            // ChatMessage[] — histórico persistido
  isStreaming,         // boolean
  streamingText,       // string — text-delta acumulado
  streamingToolCalls,  // ToolCallView[]
  sendMessage,         // (content: string) => Promise<void>
  triggerAiResponse,   // (content: string) => Promise<void>
  retry,               // () => void
  error,               // string | null
  lastUserMessage,     // string | null
} = useChatStream({ projectId, initialMessages, onMessagesChange })
```

Eventos SSE: `text-delta` → acumula texto | `tool-call` → push toolCall |
`tool-result` → match por callId, seta `.result` | `finish` → commita mensagem |
`error` → seta error state.

---

## Cards de tool-result

Cada tool tem um card visual próprio em `../cards/tool-results/*.result.tsx`.
O dispatcher é `../cards/tool-results/index.tsx` → `ToolResultCard`.

Tools com card rico (substituem o colapsável genérico):
`create_agent`, `list_whatsapp_instances`, `create_whatsapp_instance`,
`generate_prompt_anatomy`, `publish_agent`, `get_agent_status`,
`attach_tool_to_agent`, `update_agent_prompt`, `select_channel`,
`propose_agent_creation`, `run_prompt_preview`, `adjust_prompt_tone`,
`propose_tool_selection`, `propose_plan_upgrade`, `instagram_setup_wizard`.

---

## Tipografia

| Elemento | Tamanho | Line-height |
|---|---|---|
| Mensagem assistant (Markdown p) | 15px | 1.7 |
| Lista (li) | 14px | 1.65 |
| Mensagem usuário | 14px | relaxed |
| Container mensagens | max-w-[680px] | gap-6 entre mensagens |
| System banner | 11px | — |

---

## Erros

- **Erro de rede**: retry manual via botão "Tentar novamente"
- **Erro do LLM (`type: error`)**: card vermelho inline + lastUserMessage salvo
- **Context budget**: `ContextUsage` no header exibe alerta visual
