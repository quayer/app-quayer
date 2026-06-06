---
Criado: 2026-06-06
Atualizado: 2026-06-06
Revisar em: ao alterar outbound.service.ts, inbound-resilience.ts ou outbound-rate-limit.ts
Relacionados:
  - src/lib/webhook/inbound-resilience.ts
  - src/server/communication/services/outbound.service.ts
  - src/server/communication/services/outbound-rate-limit.ts
  - src/server/communication/services/outbound-deadletter.ts
  - docs/infra/SECRETS.md
---

# Mensageria — garantias de idempotência e limites

Doc canônico das garantias do processamento de mensagem WhatsApp (provider UAZ).
Descreve o que **existe hoje** no código + os **gaps conhecidos**. Equivalente ao
`idempotency-limits.md` do Orayon.Profissoes.

## 1. Inbound — dedup idempotente

Brokers/UAZ fazem retry-storm de webhooks. Sem dedup, a mesma mensagem física é
processada 2x → resposta IA duplicada + custo dobrado de LLM/STT.

- **Fingerprint:** `sha256('uazapi:' + instanceId + ':' + messageId)`
  (`computeInboundDedupHash`, [inbound-resilience.ts](../../src/lib/webhook/inbound-resilience.ts)).
- **Claim:** Redis `dedup:wa:<hash>` via `SET key 1 EX 86400 NX`. Primeiro a
  escrever vence (NX); retry posterior vê a key e é marcado **duplicado**.
- **Janela:** 24h (cobre o budget de retry dos brokers).
- **2ª camada:** `Message.waMessageId` é **UNIQUE** no Postgres — mesmo que o dedup
  Redis falhe, o insert duplicado é barrado pelo banco.
- **Fail-open:** Redis ausente/erro → trata como NÃO-duplicado (processa). Dobrar é
  o mal menor vs. perder mensagem real de cliente.

## 2. Inbound — operator takeover

Quando um humano responde direto pelo app do WhatsApp, chega um webhook OUT/fromMe
que NÃO é echo do bot. Isso sinaliza que o humano assumiu, então a IA é pausada
**até a sessão fechar** (`ChatSession.aiEnabled = false`, honrado por
`canDispatchAi`). A IA volta sozinha quando a sessão fecha (manual/inatividade) e a
próxima mensagem do contato abre uma sessão nova com `aiEnabled = true`.

## 3. Outbound — rate-limit (3 buckets)

Consome cota **uma vez por turno** (antes dos blocos), não por bloco. Todos
fail-open (Redis down → libera).

| Bucket | Limite default | Chave | Mecanismo |
|---|---|---|---|
| Contato | 10/min | `outbound:rl:contact:{org}:{phone}` | INCR + EXPIRE (janela fixa 60s) |
| Org | 100/min | `outbound:rl:org:{org}` | INCR + EXPIRE (janela fixa 60s) |
| Instância | 60/min | por `connectionId` | token bucket Lua |

**Ao estourar:**
- **Contato/Org:** o turno é barrado (`rateLimited: true`) e **nada é enviado** —
  o lead perde a resposta (drop-by-design).
- **Instância (QH-02):** agenda um **retry com delay** (`scheduleRetry`, a resposta
  NÃO é perdida) até `MAX_RETRY_ATTEMPTS = 5`; ao esgotar (ou sem scheduler) vai
  para a dead-letter.

## 4. Outbound — retry + dead-letter

- Cada bloco usa `sendWithRetry` (backoff exponencial); ao esgotar, o payload vai
  para a **dead-letter** (Redis list `outbound:deadletter`).
- Erros em blocos individuais **não abortam** os blocos seguintes.
- **Visibilidade:** `inspectDeadLetter()` (read-only, LLEN/LRANGE) +
  `npm run deadletter:inspect [limit]` listam as falhas mais recentes com resumo
  por org/erro. Não há admin UI — inspeção via Claude Code/MCP. *Reprocesso*
  ainda é pendente (tocaria o caminho de envio ao vivo).

## 5. Outbound — bot-echo tracking

`markBotMessage(org, messageId)` é chamado **só em envios bem-sucedidos** — o
webhook OUT do UAZ reconhece a mensagem como echo do próprio bot e não reprocessa.

## 6. Persistência

- Persiste **1 Message OUTBOUND** com `waMessageId = firstSuccessMessageId` (ou um
  sentinel determinístico se o provider não retornou id).
- **0 blocos enviados → nada é persistido** (não polui o histórico).

## 7. Gaps conhecidos (ainda abertos)

Documentados para honestidade — são itens de backlog, não garantias:

- **Status de entrega — parcial:** o provider **CloudAPI** já consome `message.updated`
  e avança `Message.status` + `deliveredAt/readAt` (`markMessageDeliveryStatus` no
  processor, guard monotônico). O provider de **produção (uazapi)** ainda NÃO modela
  evento de status — `UazapiData` não tem campo de ack; depende de capturar o payload
  real. (backlog messaging M/high — só uazapi)
- **Dead-letter sem reprocesso:** inspeção read-only já existe (`inspectDeadLetter` +
  `npm run deadletter:inspect`), mas ainda não há consumer/recovery para *reprocessar*
  a `outbound:deadletter` — só dá pra ver, não pra reenviar. (backlog M/high)
- **Sem idempotência de decisão por turno:** o dedup é só da mensagem (`waMessageId`);
  não há hash de decisão (`session + inbound_ids + config`) impedindo re-aplicar um
  turno (re-disparar a IA). (backlog M/medium)
- **Sem FSM outbound durável:** o estado de envio vive em memória + `Message.status`
  final; um crash mid-send não tem checkpoint de `provider_message_id` para retomar
  sem reenviar. (backlog L/high)
