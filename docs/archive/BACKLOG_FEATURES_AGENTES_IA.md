# 📋 Backlog - Features para Agentes de IA
**Data:** 03/10/2025
**Status:** Sprint 5+ - Planejamento Futuro

---

## 🎯 Visão da Plataforma

**Produto:** Plataforma de Agentes de IA para WhatsApp
**Público-Alvo:** Empresas que contratam agentes de IA para atendimento
**Diferencial:** Interface intuitiva tipo Kanban + Chat integrado

---

## 🚀 Funcionalidades Prioritárias

### 1. **Chat WhatsApp (Alta Prioridade)**
**Status:** 🔴 Não Iniciado
**Sprint Estimado:** Sprint 5-6
**Referência:** https://shadcnuikit.com/dashboard/apps/chat

#### Descrição
Interface de chat em tempo real para conversas WhatsApp, permitindo que agentes de IA e humanos interajam com clientes.

#### Funcionalidades Principais
- ✅ **Lista de Conversas** - Sidebar com contatos ativos
- ✅ **Área de Chat** - Mensagens em tempo real
- ✅ **Editor de Mensagens** - Input com suporte a mídia
- ✅ **Busca de Mensagens** - Filtro por texto/data
- ✅ **Indicadores de Status** - Lido, entregue, digitando
- ✅ **Suporte a Mídia** - Imagens, vídeos, áudios, documentos
- ✅ **Histórico de Conversas** - Scroll infinito com lazy loading

#### Componentes Técnicos
```typescript
// src/app/integracoes/chat/page.tsx
export default function ChatPage() {
  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <ConversationsList />  // Sidebar com contatos
      <ChatArea />           // Área principal de mensagens
      <ContactInfo />        // Painel lateral com info do contato
    </div>
  )
}
```

#### API Endpoints Necessários
- `GET /api/v1/messages/conversations` - Lista conversas
- `GET /api/v1/messages/:conversationId` - Mensagens de uma conversa
- `POST /api/v1/messages/send` - Enviar mensagem
- `PATCH /api/v1/messages/:id/read` - Marcar como lida
- `GET /api/v1/messages/search` - Buscar mensagens
- `WebSocket /api/v1/messages/realtime` - Real-time updates

#### Design System Components
```tsx
// Componentes do Chat
<ChatLayout>
  <ConversationsList
    conversations={conversations}
    onSelectConversation={handleSelect}
    searchQuery={searchQuery}
  />

  <ChatArea
    conversation={selectedConversation}
    messages={messages}
    onSendMessage={handleSend}
    isTyping={isTyping}
  />

  <ContactInfo
    contact={selectedContact}
    tags={tags}
    notes={notes}
    onUpdateTag={handleUpdateTag}
  />
</ChatLayout>
```

#### Features Avançadas
- **Resposta Rápida** - Templates de mensagens
- **Agendamento** - Agendar mensagens para envio futuro
- **Atribuição** - Atribuir conversa para agente específico
- **Tags** - Categorizar conversas (vendas, suporte, etc)
- **Notas Internas** - Comentários visíveis apenas para equipe
- **Transferência** - Transferir conversa entre agentes

#### UX/UI Considerations
```css
/* Layout Responsivo */
.chat-layout {
  display: grid;
  grid-template-columns: 320px 1fr 280px; /* Sidebar | Chat | Info */
}

@media (max-width: 1024px) {
  .chat-layout {
    grid-template-columns: 1fr; /* Single column on mobile */
  }
}
```

#### Estimativa
- **Backend:** 40h (API + WebSocket + DB schema)
- **Frontend:** 50h (Componentes + Real-time + UX)
- **Testes:** 20h (E2E + Integração)
- **Total:** ~110h (14 dias úteis)

---

### 2. **Kanban de Conversas (Alta Prioridade)**
**Status:** 🔴 Não Iniciado
**Sprint Estimado:** Sprint 7-8
**Referência:** https://shadcnuikit.com/dashboard/apps/kanban

#### Descrição
Sistema Kanban para organizar conversas em pipeline de vendas/atendimento. Arrastar e soltar contatos entre colunas representando estágios do processo.

#### Funcionalidades Principais
- ✅ **Colunas Customizáveis** - Criar colunas (Novo, Em Atendimento, Aguardando, Resolvido, etc)
- ✅ **Cards de Contato** - Visualização compacta de cada conversa
- ✅ **Drag & Drop** - Arrastar contatos entre colunas
- ✅ **Filtros** - Por agente, tag, data, prioridade
- ✅ **Busca Rápida** - Encontrar contato específico
- ✅ **Estatísticas** - Métricas por coluna
- ✅ **Automações** - Mover automaticamente baseado em regras

#### Componentes Técnicos
```typescript
// src/app/integracoes/kanban/page.tsx
export default function KanbanPage() {
  return (
    <DndContext onDragEnd={handleDragEnd}>
      <KanbanBoard>
        {columns.map(column => (
          <KanbanColumn
            key={column.id}
            column={column}
            conversations={conversationsByColumn[column.id]}
          >
            {conversations.map(conv => (
              <ConversationCard
                key={conv.id}
                conversation={conv}
                onClick={() => openChat(conv.id)}
              />
            ))}
          </KanbanColumn>
        ))}
      </KanbanBoard>
    </DndContext>
  )
}
```

#### DB Schema
```prisma
model KanbanColumn {
  id            String   @id @default(cuid())
  organizationId String
  name          String
  order         Int
  color         String?

  conversations Conversation[]

  organization  Organization @relation(fields: [organizationId], references: [id])

  @@unique([organizationId, order])
}

model Conversation {
  id              String   @id @default(cuid())
  contactId       String
  instanceId      String
  columnId        String?
  assignedToId    String?
  priority        Priority @default(MEDIUM)
  tags            String[] // Array of tags
  notes           String?

  kanbanColumn    KanbanColumn? @relation(fields: [columnId], references: [id])
  messages        Message[]
  contact         Contact @relation(fields: [contactId], references: [id])

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}
```

#### API Endpoints Necessários
- `GET /api/v1/kanban/columns` - Lista colunas
- `POST /api/v1/kanban/columns` - Criar coluna
- `PATCH /api/v1/kanban/columns/:id` - Atualizar coluna
- `DELETE /api/v1/kanban/columns/:id` - Deletar coluna
- `PATCH /api/v1/conversations/:id/move` - Mover conversa entre colunas
- `GET /api/v1/kanban/stats` - Estatísticas do board

#### Design System Components
```tsx
// Kanban Components
<KanbanBoard>
  <KanbanColumn
    id="novo"
    title="Novos Contatos"
    color="blue"
    count={12}
  >
    <ConversationCard
      name="João Silva"
      lastMessage="Olá, preciso de ajuda"
      timestamp="2 min atrás"
      priority="high"
      tags={['vendas', 'urgente']}
      assignedTo="Agent AI #1"
      unreadCount={3}
      onOpen={() => router.push('/integracoes/chat?id=123')}
    />
  </KanbanColumn>

  <KanbanColumn
    id="atendimento"
    title="Em Atendimento"
    color="orange"
    count={5}
  >
    {/* Cards... */}
  </KanbanColumn>
</KanbanBoard>
```

#### Features Avançadas
- **Automação de Fluxo** - Mover automaticamente após X tempo
- **SLA Tracking** - Alertas de tempo de resposta
- **Priorização Inteligente** - IA sugere prioridade baseada no histórico
- **Workflow Templates** - Templates de pipeline pré-definidos
- **Métricas em Tempo Real** - Dashboard com conversão, tempo médio, etc
- **Exportação** - Relatório de conversas por estágio

#### UX/UI Considerations
```css
/* Kanban Layout */
.kanban-board {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  padding: 1rem;
  min-height: calc(100vh - 8rem);
}

.kanban-column {
  min-width: 320px;
  max-width: 400px;
  background: var(--card);
  border-radius: var(--radius-lg);
  padding: 1rem;
}

.conversation-card {
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  cursor: grab;
  transition: all 0.2s;
}

.conversation-card:hover {
  border-color: var(--primary);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.conversation-card.dragging {
  opacity: 0.5;
  cursor: grabbing;
}
```

#### Integração Chat ↔ Kanban
```typescript
// Abrir chat direto do card do Kanban
function ConversationCard({ conversation }: Props) {
  const router = useRouter()

  const handleOpenChat = () => {
    // Abrir chat em modal ou navegar
    router.push(`/integracoes/chat?conversationId=${conversation.id}`)
    // Ou abrir em modal:
    // openChatModal(conversation.id)
  }

  return (
    <Card onClick={handleOpenChat}>
      {/* Card content */}
    </Card>
  )
}
```

#### Estimativa
- **Backend:** 30h (API + DB schema + Automations)
- **Frontend:** 45h (Kanban Board + DnD + Cards)
- **Testes:** 15h (E2E + Drag&Drop tests)
- **Total:** ~90h (11 dias úteis)

---

## 🎨 Melhorias de Design Implementadas

### ✅ Tema Global Atualizado
**Status:** ✅ Completo
**Cores:** Laranja/Coral (Orange/Peach)

```css
/* Primary Color: Orange/Coral */
--primary: oklch(0.645 0.246 16.439);  /* Tom laranja vibrante */
--primary-foreground: oklch(0.969 0.015 12.422);  /* Texto claro no laranja */

/* Sidebar com tema consistente */
--sidebar-primary: oklch(0.645 0.246 16.439);  /* Laranja nos itens ativos */
```

**Impacto Visual:**
- Botões primários: Laranja vibrante
- Links ativos: Laranja
- Foco/hover: Ring laranja
- Charts: Paleta com laranja destaque

---

## 📊 Roadmap de Implementação

### Sprint 5: Chat WhatsApp - Parte 1 (Backend)
**Duração:** 2 semanas
**Foco:** API + DB + Real-time

- [ ] Schema Prisma para mensagens e conversas
- [ ] Endpoints CRUD de mensagens
- [ ] WebSocket para real-time
- [ ] Integração com Evolution/Baileys API
- [ ] Testes de API

### Sprint 6: Chat WhatsApp - Parte 2 (Frontend)
**Duração:** 2 semanas
**Foco:** UI + UX + Integração

- [ ] ConversationsList component
- [ ] ChatArea component
- [ ] ContactInfo sidebar
- [ ] Envio de mídia (upload)
- [ ] Real-time updates via WebSocket
- [ ] Testes E2E

### Sprint 7: Kanban - Parte 1 (Backend + Base)
**Duração:** 2 semanas
**Foco:** Schema + API + DnD Base

- [ ] Schema Prisma para Kanban
- [ ] Endpoints de colunas
- [ ] Endpoint de mover conversas
- [ ] KanbanBoard component base
- [ ] Drag & Drop básico

### Sprint 8: Kanban - Parte 2 (Features Avançadas)
**Duração:** 2 semanas
**Foco:** Automações + Métricas + Polish

- [ ] Sistema de automações
- [ ] Dashboard de métricas
- [ ] Filtros avançados
- [ ] SLA tracking
- [ ] Testes E2E completos

---

## 🔧 Dependências Técnicas

### Bibliotecas Necessárias

#### Chat
```json
{
  "dependencies": {
    "@tanstack/react-virtual": "^3.0.0",  // Scroll infinito otimizado
    "socket.io-client": "^4.6.0",          // WebSocket client
    "react-dropzone": "^14.2.0",           // Upload de arquivos
    "emoji-picker-react": "^4.5.0",        // Seletor de emojis
    "linkify-react": "^4.1.0"              // Auto-link em mensagens
  }
}
```

#### Kanban
```json
{
  "dependencies": {
    "@dnd-kit/core": "^6.1.0",            // Drag and Drop
    "@dnd-kit/sortable": "^8.0.0",        // Sortable containers
    "@dnd-kit/utilities": "^3.2.0",       // DnD utilities
    "date-fns": "^3.0.0"                  // Date formatting
  }
}
```

---

## 🎯 Critérios de Aceitação

### Chat WhatsApp
- [ ] Usuário pode ver lista de conversas ativas
- [ ] Usuário pode enviar/receber mensagens em tempo real
- [ ] Usuário pode enviar imagens, vídeos, áudios
- [ ] Usuário pode buscar mensagens por texto
- [ ] Usuário pode marcar conversa como lida/não lida
- [ ] Agente de IA responde automaticamente quando configurado
- [ ] Notificações de novas mensagens funcionam
- [ ] Performance: renderiza 1000+ mensagens sem lag

### Kanban
- [ ] Usuário pode criar colunas customizadas
- [ ] Usuário pode arrastar conversas entre colunas
- [ ] Usuário pode filtrar conversas por tag/agente/data
- [ ] Usuário pode ver métricas de cada coluna
- [ ] Automações movem conversas automaticamente
- [ ] SLA tracking alerta sobre conversas atrasadas
- [ ] Performance: renderiza 500+ cards sem lag
- [ ] Clicar em card abre chat da conversa

---

## 📐 Wireframes e Mockups

### Chat Layout
```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]  Integrações / Chat                      [User Menu] │
├───────────────┬─────────────────────────┬───────────────────┤
│               │                         │                   │
│ Conversas     │     Chat com João       │  Info do Contato  │
│ ─────────     │     ─────────────       │  ──────────────── │
│               │                         │                   │
│ 🔍 Buscar...  │  João Silva             │  📸 João Silva    │
│               │  Online • Digitando...  │  +55 11 99999...  │
│ ┌───────────┐ │  ─────────────────────  │                   │
│ │ João Silva│ │                         │  📍 São Paulo, SP │
│ │ Oi! Como  │ │  [Mensagens]            │                   │
│ │ 2 min     │ │                         │  🏷️ Tags:         │
│ └───────────┘ │  João: Preciso de ajuda │  • Vendas         │
│               │  12:30                  │  • Urgente        │
│ ┌───────────┐ │                         │                   │
│ │ Maria     │ │  Você: Ok! Como posso   │  📝 Notas:        │
│ │ Tudo bem? │ │  ajudar?                │  Cliente VIP      │
│ │ 5 min  [3]│ │  12:31                  │  Já comprou 3x    │
│ └───────────┘ │                         │                   │
│               │  ─────────────────────  │  👤 Atribuído:    │
│ [+ Nova]      │                         │  Agent AI #1      │
│               │  [Digite mensagem...]   │                   │
│               │  [📎 Anexar] [😊] [➤]  │  [📊 Histórico]   │
└───────────────┴─────────────────────────┴───────────────────┘
```

### Kanban Layout
```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]  Integrações / Kanban                    [User Menu] │
├─────────────────────────────────────────────────────────────┤
│  [🔍 Buscar] [🏷️ Filtros] [👤 Agente] [📅 Data]            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Novos (12)   │  │ Atendendo(5) │  │ Resolvido(8) │       │
│  │ ────────────│  │ ────────────│  │ ────────────│       │
│  │              │  │              │  │              │       │
│  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │       │
│  │ │João Silva│ │  │ │Maria     │ │  │ │Pedro     │ │       │
│  │ │🔴 Urgente│ │  │ │🟡 Médio  │ │  │ │✅ Fechado│ │       │
│  │ │"Preciso..│ │  │ │"Quando..│ │  │ │"Obrigado"│ │       │
│  │ │2 min  [3]│ │  │ │15 min   │ │  │ │1h        │ │       │
│  │ │Agent #1  │ │  │ │Agent #2  │ │  │ │Agent #1  │ │       │
│  │ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │       │
│  │              │  │              │  │              │       │
│  │ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │       │
│  │ │Ana Costa │ │  │ │...       │ │  │ │...       │ │       │
│  │ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │       │
│  │              │  │              │  │              │       │
│  │ [+ Novo]     │  │              │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Próximos Passos Imediatos

### Para Começar Sprint 5 (Chat):
1. ✅ Revisar schema Prisma atual
2. ✅ Definir estrutura de Messages/Conversations
3. ✅ Escolher biblioteca WebSocket (Socket.io vs native)
4. ✅ Criar protótipo de UI no Figma (opcional)
5. ✅ Configurar testes E2E (Playwright)

### Decisões Técnicas Pendentes:
- [ ] **WebSocket:** Socket.io ou WebSocket nativo?
- [ ] **Upload:** S3, Cloudinary ou local storage?
- [ ] **Notificações:** Push notifications ou apenas in-app?
- [ ] **Cache:** Redis para mensagens recentes?
- [ ] **Search:** ElasticSearch ou busca no PostgreSQL?

---

**Última Atualização:** 03/10/2025 23:15 BRT
**Próxima Revisão:** Início do Sprint 5
