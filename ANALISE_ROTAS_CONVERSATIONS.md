# Mapeamento de Rotas - Tela de Conversas

## 1. ROTAS FRONTEND

### Rota Principal
| Rota | Arquivo | Tipo |
|------|---------|------|
| `/integracoes/conversations` | `src/app/integracoes/conversations/page.tsx` | Client Component |

### Hooks de Dados (React Query)

| Hook | QueryKey | Endpoint Backend | Tipo |
|------|----------|------------------|------|
| `useQuery` | `['conversations', 'instances']` | `api.instances.list` | Query |
| `useQuery` | `['conversations', 'chats', instanceIds]` | `api.chats.list` | Query |
| `useInfiniteQuery` | `['conversations', 'messages', chatId]` | `api.messages.list` | Query |
| `useQuery` | `['session-notes', chatId]` | `api.notes.list` | Query |
| `useQuery` | `['quick-replies']` | `api['quick-replies'].list` | Query |
| `useMutation` | - | `api.notes.create` | Mutation |
| `useMutation` | - | `api.notes.delete` | Mutation |
| `useMutation` | - | `api.notes.togglePin` | Mutation |
| `useMutation` | - | `api.messages.create` | Mutation |
| `useMutation` | - | `api.chats.markAsRead` | Mutation |
| `useMutation` | - | `api.media.sendAudio` | Mutation |

### Hooks de Real-time
| Hook | Arquivo | Funcionalidade |
|------|---------|----------------|
| `useInstanceSSE` | `src/hooks/useInstanceSSE.ts` | Server-Sent Events |

---

## 2. ROTAS BACKEND (API Endpoints)

### Controller: `chats` (`/api/v1/chats`)

| Endpoint | Método | Action | Descrição |
|----------|--------|--------|-----------|
| `/api/v1/chats/list` | GET | `list` | Listar conversas de uma instância |
| `/api/v1/chats/count` | GET | `count` | Contar conversas |
| `/api/v1/chats/mark-read` | POST | `markAsRead` | Marcar como lido |
| `/api/v1/chats/:chatId/archive` | POST | `archive` | Arquivar chat |
| `/api/v1/chats/:chatId/unarchive` | POST | `unarchive` | Desarquivar chat |
| `/api/v1/chats/:chatId` | DELETE | `delete` | Deletar chat |
| `/api/v1/chats/:chatId/block` | POST | `block` | Bloquear contato |

### Controller: `messages` (`/api/v1/messages`)

| Endpoint | Método | Action | Descrição |
|----------|--------|--------|-----------|
| `/api/v1/messages` | POST | `create` | Enviar mensagem |
| `/api/v1/messages` | GET | `list` | Listar mensagens |
| `/api/v1/messages/:id` | GET | `getById` | Buscar por ID |
| `/api/v1/messages/:id/download` | GET | `downloadMedia` | Download de mídia |
| `/api/v1/messages/:id/react` | POST | `react` | Reagir com emoji |
| `/api/v1/messages/:id` | DELETE | `delete` | Deletar mensagem |
| `/api/v1/messages/:id/read` | POST | `markAsRead` | Marcar como lida |

### Controller: `media` (`/api/v1/media`)

| Endpoint | Método | Action | Descrição |
|----------|--------|--------|-----------|
| `/api/v1/media/image` | POST | `sendImage` | Enviar imagem |
| `/api/v1/media/document` | POST | `sendDocument` | Enviar documento |
| `/api/v1/media/audio` | POST | `sendAudio` | Enviar áudio |

### Controller: `notes` (`/api/v1/notes`)

| Endpoint | Método | Action | Descrição |
|----------|--------|--------|-----------|
| `/api/v1/notes` | POST | `create` | Criar nota |
| `/api/v1/notes` | GET | `list` | Listar notas |
| `/api/v1/notes/:id` | PATCH | `update` | Atualizar nota |
| `/api/v1/notes/:id` | DELETE | `delete` | Deletar nota |
| `/api/v1/notes/:id/pin` | POST | `togglePin` | Fixar/desafixar |

### Controller: `sessions` (`/api/v1/sessions`)

| Endpoint | Método | Action | Descrição |
|----------|--------|--------|-----------|
| `/api/v1/sessions` | GET | `list` | Listar sessões |
| `/api/v1/sessions/:id` | GET | `get` | Buscar sessão |
| `/api/v1/sessions/:id/block-ai` | POST | `blockAI` | Bloquear IA |
| `/api/v1/sessions/:id/unblock-ai` | POST | `unblockAI` | Desbloquear IA |
| `/api/v1/sessions/:id/close` | POST | `close` | Encerrar sessão |
| `/api/v1/sessions/:id/status` | PATCH | `updateStatus` | Atualizar status |
| `/api/v1/sessions/:id/department` | PATCH | `updateDepartment` | Atualizar depto |
| `/api/v1/sessions/:id/tags` | POST | `addTags` | Adicionar tags |
| `/api/v1/sessions/:id/tags` | DELETE | `removeTags` | Remover tags |
| `/api/v1/sessions/:id/ai-status` | GET | `checkAIStatus` | Status da IA |
| `/api/v1/sessions/contact/:contactId` | GET | `byContact` | Sessões por contato |
| `/api/v1/sessions/blacklist` | GET | `blacklist` | Listar blacklist |
| `/api/v1/sessions/blacklist` | POST | `addToBlacklist` | Adicionar à blacklist |
| `/api/v1/sessions/blacklist/:id` | DELETE | `removeFromBlacklist` | Remover da blacklist |
| `/api/v1/sessions/:id/contact-labels` | PATCH | `updateContactLabels` | Labels do contato |
| `/api/v1/sessions/:id/session-labels` | PATCH | `updateSessionLabels` | Labels da sessão |
| `/api/v1/sessions/tabulations` | GET | `listTabulations` | Listar tabulações |
| `/api/v1/sessions/contacts-view` | GET | `contactsView` | Vista de contatos |
| `/api/v1/sessions/:id/contact-lead` | PATCH | `updateContactLead` | Atualizar lead |
| `/api/v1/sessions/:id/session-lead` | PATCH | `updateSessionLead` | Atualizar ticket |
| `/api/v1/sessions/bulk` | POST | `bulk` | Ações em massa |
| `/api/v1/sessions/:id` | DELETE | `delete` | Deletar sessão |

### Controller: `instances` (`/api/v1/instances`)

| Endpoint | Método | Action | Descrição |
|----------|--------|--------|-----------|
| `/api/v1/instances` | GET | `list` | Listar instâncias |
| `/api/v1/instances/:id` | GET | `getById` | Buscar por ID |
| `/api/v1/instances` | POST | `create` | Criar instância |
| `/api/v1/instances/:id` | PATCH | `update` | Atualizar |
| `/api/v1/instances/:id/connect` | POST | `connect` | Conectar |
| `/api/v1/instances/:id/disconnect` | POST | `disconnect` | Desconectar |
| `/api/v1/instances/:id/status` | GET | `getStatus` | Status |
| `/api/v1/instances/:id/profile-picture` | GET | `getProfilePicture` | Foto de perfil |

### Controller: `quick-replies` (`/api/v1/quick-replies`)

| Endpoint | Método | Action | Descrição |
|----------|--------|--------|-----------|
| `/api/v1/quick-replies` | GET | `list` | Listar |
| `/api/v1/quick-replies` | POST | `create` | Criar |
| `/api/v1/quick-replies/:id` | GET | `get` | Buscar |
| `/api/v1/quick-replies/:id` | PATCH | `update` | Atualizar |
| `/api/v1/quick-replies/:id` | DELETE | `delete` | Deletar |
| `/api/v1/quick-replies/:id/use` | POST | `use` | Registrar uso |
| `/api/v1/quick-replies/shortcut/:shortcut` | GET | `byShortcut` | Por atalho |

### Controller: `sse` (`/api/v1/sse`)

| Endpoint | Método | Action | Descrição |
|----------|--------|--------|-----------|
| `/api/v1/sse/:instanceId` | GET | - | Stream de eventos |

---

## 3. FLUXO DE DADOS

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  instances   │    │    chats     │    │   messages   │      │
│  │   useQuery   │───▶│   useQuery   │───▶│ useInfinite  │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              useInstanceSSE (Real-time)                  │    │
│  │   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │    │
│  │   │connected│ │ message │ │ session │ │ contact │      │    │
│  │   │         │ │received │ │ updated │ │ updated │      │    │
│  │   └─────────┘ └─────────┘ └─────────┘ └─────────┘      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              invalidateQueries (React Query)             │    │
│  │        ⚠️ PROBLEMA: Invalida TUDO a cada evento         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Igniter.js)                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│  │   chats    │  │  messages  │  │  sessions  │  │   notes   │ │
│  │ controller │  │ controller │  │ controller │  │ controller│ │
│  └────────────┘  └────────────┘  └────────────┘  └───────────┘ │
│         │              │               │               │        │
│         ▼              ▼               ▼               ▼        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Prisma ORM                            │   │
│  │  ⚠️ N+1 Queries em vários endpoints                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   PostgreSQL + Redis                      │   │
│  │  ✅ Cache de 15s para chats                               │   │
│  │  ⚠️ Sem cache para mensagens individuais                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. ANÁLISE CRÍTICA

### 4.1 PERFORMANCE

#### CRÍTICO: Invalidações Excessivas do React Query
**Arquivo:** `src/hooks/useInstanceSSE.ts:117-134`

- Cada evento SSE dispara 4 `invalidateQueries`
- Ignora `staleTime` e força refetch imediato
- Com 10 msgs/minuto, são 40 invalidações/minuto

**Impacto:** UI trava, impossível trocar de chat

**Solução:**
```typescript
// Invalidar apenas a query específica
queryClient.setQueryData(['conversations', 'messages', sessionId], (old) => {
  // Atualizar otimisticamente
})
```

---

#### ALTO: Múltiplas Requisições Paralelas ao Carregar
**Arquivo:** `src/app/integracoes/conversations/page.tsx:358-380`

O frontend faz `Promise.all` para buscar chats de TODAS as instâncias:
```typescript
const results = await Promise.all(
  instanceIdsToFetch.map(async (instanceId) => {
    const response = await api.chats.list.query({ ... })
  })
)
```

Se usuário tem 5 instâncias, são 5 requisições simultâneas, cada uma retornando 100 chats.

**Solução:** Endpoint único `/api/v1/chats/all` que retorna chats de todas instâncias do usuário.

---

#### ALTO: Ordenação Client-Side
**Arquivo:** `src/app/integracoes/conversations/page.tsx:384`

```typescript
const allChats = results.flat().sort((a, b) => ...)
```

Com 500 chats, O(n log n) executa a cada re-render.

**Solução:** `useMemo` com deps corretas ou ordenação no backend.

---

#### MÉDIO: Sem Virtualização de Lista
**Arquivo:** `src/app/integracoes/conversations/page.tsx`

Renderiza TODOS os chats visíveis. Com 500 chats, são 500 DOM nodes.

**Solução:** Usar `react-virtual` ou `react-window`.

---

#### MÉDIO: Sem Debounce na Busca
**Arquivo:** `src/app/integracoes/conversations/page.tsx:463-469`

```typescript
if (searchText.trim()) {
  filtered = filtered.filter(chat => ...)
}
```

Filtro executa a cada keystroke.

**Solução:** `useDebounce(searchText, 300)`

---

### 4.2 UX/UI

#### CRÍTICO: Feedback Insuficiente de Erros
**Problema:** Erros de envio de mensagem mostram apenas toast genérico.

**Solução:**
- Indicar qual mensagem falhou
- Botão de retry inline
- Ícone de erro na bolha

---

#### ALTO: Sem Estado de Carregamento em Imagens
**Arquivo:** `src/app/integracoes/conversations/page.tsx:1926-1932`

Imagens aparecem "pulando" quando carregam.

**Solução:** Skeleton + fade-in animation.

---

#### ALTO: Scroll Não Preservado ao Carregar Mensagens Antigas
**Arquivo:** `src/app/integracoes/conversations/page.tsx:478-540`

Ao fazer scroll up para carregar mais mensagens, posição do scroll não é preservada corretamente.

**Solução:** Salvar `scrollHeight` antes do fetch, restaurar após.

---

#### MÉDIO: Componente Muito Grande (2.439 linhas)
Difícil manutenção, debugging e testing.

**Solução:** Separar em componentes menores:
- `ChatsList.tsx`
- `MessagesArea.tsx`
- `MessageBubble.tsx`
- `MessageInput.tsx`

---

#### MÉDIO: Sem Confirmação para Ações Destrutivas
Deletar chat, arquivar, etc não pedem confirmação.

**Solução:** Modal de confirmação.

---

### 4.3 WCAG 2.1 (Acessibilidade)

#### CRÍTICO: Mensagens Sem Live Region
**Critério:** WCAG 4.1.3 (Status Messages)

Novas mensagens não são anunciadas para screen readers.

**Solução:**
```tsx
<div role="log" aria-live="polite" aria-label="Mensagens">
```

---

#### ALTO: Lista de Chats Sem Navegação por Teclado
**Critério:** WCAG 2.1.1 (Keyboard)

Não é possível navegar pelos chats usando apenas teclado.

**Solução:**
```tsx
<ul role="listbox">
  <li role="option" tabIndex={0} onKeyDown={handleArrowKeys}>
```

---

#### ALTO: Contraste Insuficiente
**Critério:** WCAG 1.4.3 (Contrast)

- `text-muted-foreground/70` - contraste < 4.5:1
- `text-[10px]` - tamanho muito pequeno

**Solução:** Aumentar opacidade, usar `text-xs` mínimo.

---

#### MÉDIO: Imagens Sem Alt Descritivo
**Critério:** WCAG 1.1.1 (Non-text Content)

```tsx
<img src={...} alt="Imagem" />  // ❌ Genérico
```

**Solução:**
```tsx
<img src={...} alt="Imagem enviada por João às 14:30" />
```

---

#### MÉDIO: Áudios Sem Descrição
**Critério:** WCAG 1.1.1 (Non-text Content)

```tsx
<audio src={...} controls />  // ❌ Sem aria-label
```

**Solução:**
```tsx
<audio src={...} controls aria-label="Mensagem de voz de 0:45" />
```

---

### 4.4 BOAS PRÁTICAS BACKEND

#### CRÍTICO: Rate Limiting Fraco
**Arquivo:** `src/features/messages/controllers/messages.controller.ts`

Rate limit de 20 msgs/minuto por sessão pode ser muito baixo para atendimentos intensos.

**Solução:** Rate limit por usuário + sessão, com burst allowance.

---

#### ALTO: N+1 Queries no Endpoint de Chats
**Arquivo:** `src/features/messages/controllers/chats.controller.ts`

Para cada chat, busca mensagens e contato separadamente.

**Solução:** Usar `include` do Prisma corretamente:
```typescript
const chats = await database.chatSession.findMany({
  include: {
    contact: true,
    messages: { take: 1, orderBy: { createdAt: 'desc' } }
  }
})
```

---

#### ALTO: Sem Paginação Cursor-Based
**Arquivo:** `src/features/messages/controllers/messages.controller.ts:352`

Usa offset-based pagination que é ineficiente para grandes datasets.

**Solução:** Cursor-based com `createdAt` ou `id`.

---

#### MÉDIO: Cache Muito Curto
**Arquivo:** `src/features/messages/controllers/chats.controller.ts:17`

```typescript
const CHATS_CACHE_TTL = 15; // 15 segundos
```

Muito curto, causa muitas requisições ao banco.

**Solução:** 60 segundos para lista de chats, invalidar via SSE quando necessário.

---

#### MÉDIO: Sem Compressão de Resposta
Respostas de 100+ chats podem ser grandes.

**Solução:** Habilitar gzip/brotli no Next.js.

---

#### BAIXO: Logs Excessivos em Produção
**Arquivo:** `src/app/api/v1/webhooks/[provider]/route.ts:261`

```typescript
console.log(`[Webhook] ✅ Security passed...`, JSON.stringify(rawBody, null, 2))
```

Loga payload inteiro em produção.

**Solução:** Usar logger com níveis (debug/info/warn/error).

---

## 5. RESUMO DE PROBLEMAS ENCONTRADOS

| Categoria | Crítico | Alto | Médio | Baixo | Total |
|-----------|---------|------|-------|-------|-------|
| Performance | 1 | 2 | 2 | 0 | 5 |
| UX/UI | 1 | 2 | 2 | 0 | 5 |
| WCAG 2.1 | 1 | 2 | 2 | 0 | 5 |
| Backend | 1 | 2 | 2 | 1 | 6 |
| **Total** | **4** | **8** | **8** | **1** | **21** |

---

*Documento gerado em: 2025-12-27*
*Analisado por: Lia AI Agent*
