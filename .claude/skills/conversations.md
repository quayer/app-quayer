# Skill: Conversas (Chats & Messages)

## Quando carregar esta skill
Ao trabalhar em conversas, mensagens, chats, envio/recebimento de mensagens, media.

---

## Arquitetura

As conversas são gerenciadas pela feature `messages/` e integradas com UAZAPI (broker WhatsApp).

```
src/features/messages/
├── controllers/
│   ├── chats.controller.ts      # Listar/filtrar conversas
│   ├── messages.controller.ts   # Enviar/receber mensagens
│   └── media.controller.ts      # Upload/download de mídia
├── messages.schemas.ts
├── messages.interfaces.ts
└── index.ts
```

**Rota no app:** `/integracoes` (instância selecionada) → visualiza conversas
**Redirect:** `/conversas` → redireciona para `/integracoes/conversations`

---

## Controllers Registrados

No `src/igniter.router.ts`:
```typescript
chats: chatsController,      // GET /api/v1/chats/*
messages: messagesController, // POST /api/v1/messages/*
media: mediaController,       // GET/POST /api/v1/media/*
```

---

## chats.controller.ts — Endpoints

### `GET /api/v1/chats/list`
Lista conversas de uma instância UAZAPI.

**Query params:**
- `instanceId` — ID da instância (obrigatório)
- `search` — filtro de busca
- `status` — `unread` | `groups` | `pinned` | `all`

**Lógica:**
1. Verifica que instância pertence à organização do usuário
2. Busca chats via UAZAPI com filtros
3. Retorna lista paginada

**Autorização:** `authProcedure({ required: true })` — filtra por org do usuário

---

## messages.controller.ts — Endpoints

### `POST /api/v1/messages/send`
Envia mensagem via UAZAPI.

**Body:**
- `instanceId` — ID da instância
- `chatId` — ID do chat (formato: `5511999999999@c.us`)
- `content` — texto da mensagem
- `type` — `text` | `image` | `audio` | `document`

---

## Modelo de Dados (Prisma)

```prisma
model Chat {
  id             String   @id
  instanceId     String
  remoteJid      String   // WhatsApp JID (phone@c.us ou group@g.us)
  name           String?
  unreadCount    Int      @default(0)
  lastMessage    String?
  lastMessageAt  DateTime?
  isPinned       Boolean  @default(false)
  isGroup        Boolean  @default(false)
  instance       Instance @relation(...)
}

model Message {
  id          String   @id
  chatId      String
  instanceId  String
  fromMe      Boolean
  content     String?
  type        String   // text, image, audio, document, sticker
  mediaUrl    String?
  timestamp   DateTime
  status      String   // pending, sent, delivered, read
}
```

---

## UAZAPI — Integração

- Todas as mensagens passam pelo UAZAPI (proxy WhatsApp)
- Token da instância: `instance.uazToken` (armazenado no DB)
- Base URL: `process.env.UAZAPI_URL` (ex: `https://quayer.uazapi.com`)
- Biblioteca: `src/lib/uaz/` ou `src/services/uazapi.ts`

**Formato JID WhatsApp:**
- Contato: `5511999999999@c.us`
- Grupo: `120363xxxxxxxx@g.us`

---

## Real-time (SSE)

Mensagens em tempo real via Server-Sent Events:

```typescript
// No client component
import { useIgniterQueryClient } from '@igniter-js/core/client'

// SSE hook para updates de mensagens
api.chats.list.useRealtime({ instanceId })
```

**Canal Redis:** mensagens são publicadas via Redis pub/sub quando chegam via webhook UAZAPI → SSE → client.

---

## Webhooks UAZAPI → Sistema

UAZAPI envia eventos para `POST /api/v1/webhooks/[instanceId]`:
- `message` — nova mensagem recebida
- `message-ack` — status de entrega
- `connection` — mudança de status da instância

O handler processa e publica no Redis para SSE.

---

## Frontend — Componentes

```
src/components/chat/          # Componentes de chat
src/app/integracoes/          # Página principal (instância + conversas)
src/app/conversas/            # Redirect para /integracoes
```

---

## Bugs Conhecidos

- Mensagens duplicadas: script de fix em `scripts/fix-duplicate-messages-prisma.ts`
- Áudio: formato pode variar (FFmpeg necessário para conversão)
- `connections/` feature desabilitada — era a v1 multi-canal, substituída por `instances/`

---

## Debugging Conversas

```bash
# Verificar conversas no banco
npx ts-node scripts/debug-chats.ts

# Verificar mensagens específicas
npx ts-node scripts/debug-conversations-complete.ts

# Verificar webhook recebendo
npx ts-node scripts/check-webhook.ts
```
