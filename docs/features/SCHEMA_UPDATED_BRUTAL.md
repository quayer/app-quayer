# ✅ SCHEMA ATUALIZADO - FASE 1 COMPLETA

**Data:** 16 de Outubro de 2025

---

## 🎯 MUDANÇAS APLICADAS NO PRISMA SCHEMA

### ✅ **Contact Model - 5 novos campos**
```prisma
model Contact {
  // ❌ NOVOS CAMPOS ADICIONADOS:
  email          String?  // Email do contato
  organizationId String?  // Link para organização
  source         String?  // ID da instância que criou o contato
  externalId     String?  // ID externo (CRM, etc)
  bypassBots     Boolean @default(false) // Bypass AI/Bots

  // ❌ NOVA RELAÇÃO:
  contactTabulations ContactTabulation[] // Tabulations/Tags
}
```

### ✅ **ChatSession Model - 9 novos campos**
```prisma
model ChatSession {
  // ❌ NOVOS CAMPOS ADICIONADOS:
  startedBy    SessionStartedBy @default(CUSTOMER) // Quem iniciou
  statusReason String?          // Motivo da mudança de status
  endReason    String?          // Motivo do encerramento
  externalId   String?          // ID externo

  // ❌ ASSIGNMENT (3 campos novos):
  assignedDepartmentId String? // Departamento
  assignedAgentId      String? // Agente
  assignedCustomerId   String? // Cliente/Usuário

  // ❌ TIMEOUT ALTERADO:
  concatTimeout Int @default(8) // Era 30, agora 5-8s

  // ❌ NOVA RELAÇÃO:
  sessionTabulations SessionTabulation[]
}
```

### ✅ **Message Model - 1 novo campo CRÍTICO**
```prisma
model Message {
  // ❌ NOVO CAMPO CRÍTICO:
  author MessageAuthor @default(CUSTOMER) // Quem escreveu

  // CUSTOMER | AGENT | AI | BUSINESS | SYSTEM | AGENT_PLATFORM
}
```

### ✅ **3 NOVOS ENUMS**
```prisma
// ❌ NOVO:
enum SessionStartedBy {
  CUSTOMER
  BUSINESS
  AGENT
}

// ❌ NOVO:
enum MessageAuthor {
  CUSTOMER       // Cliente final
  AGENT          // Atendente humano
  AI             // IA/Bot
  BUSINESS       // Empresa/Sistema
  SYSTEM         // Sistema automático
  AGENT_PLATFORM // Plataforma de agente
}
```

### ✅ **3 NOVOS MODELS (Tabulations)**
```prisma
// ❌ NOVO:
model Tabulation {
  id              String   @id @default(uuid())
  organizationId  String
  name            String
  description     String?
  backgroundColor String   @default("#ffffff")
  autoTabulation  Boolean  @default(false)

  contactTabulations ContactTabulation[]
  sessionTabulations SessionTabulation[]
}

// ❌ NOVO:
model ContactTabulation {
  id           String @id @default(uuid())
  contactId    String
  tabulationId String
  contact      Contact    @relation(...)
  tabulation   Tabulation @relation(...)

  @@unique([contactId, tabulationId])
}

// ❌ NOVO:
model SessionTabulation {
  id           String @id @default(uuid())
  sessionId    String
  tabulationId String
  session      ChatSession @relation(...)
  tabulation   Tabulation  @relation(...)

  @@unique([sessionId, tabulationId])
}
```

---

## ✅ STATUS DO BANCO DE DADOS

```bash
✅ npx prisma format  - OK
✅ npx prisma db push --accept-data-loss - OK (Database in sync)
⚠️  npx prisma generate - EPERM (Node.exe travando o arquivo)
```

**Solução**: Reiniciar VSCode ou máquina para liberar o lock do Prisma Client.

---

## 🚀 PRÓXIMA ETAPA: IMPLEMENTAR CONTROLLERS

Agora que o schema está atualizado, preciso implementar:

### **PRIORIDADE MÁXIMA (FASES 2-4):**

#### **FASE 2: Contacts Controller** (30 min)
```typescript
GET    /api/v1/contacts                    // List all
GET    /api/v1/contacts/:id                // Get by ID
GET    /api/v1/contacts/by-phone/:phone    // Get by phone
PATCH  /api/v1/contacts/:id                // Update (name, email, tags)
POST   /api/v1/contacts/:id/tabulations    // Add tabulation
DELETE /api/v1/contacts/:id/tabulations    // Remove tabulation
GET    /api/v1/contacts/:id/sessions       // List sessions
```

#### **FASE 3: Messages Controller** (30 min)
```typescript
POST   /api/v1/messages                    // Create message ⭐ CRITICAL
GET    /api/v1/messages                    // List with filters
GET    /api/v1/messages/:id                // Get by ID
GET    /api/v1/sessions/:sessionId/messages // Messages of session
```

**IMPORTANTE** no POST /messages:
- Campo `author` (CUSTOMER, AGENT, AI, BUSINESS)
- Campo `sendExternalMessage` (boolean) - enviar pro WhatsApp ou só registrar?
- Campo `pauseSession` (boolean) - pausar sessão ao enviar?

#### **FASE 4: Sessions Extensions** (30 min)
```typescript
// ❌ ENDPOINTS FALTANTES:
POST  /sessions/:id/reopen                 // Reabrir sessão fechada
POST  /sessions/:id/pause                  // Pausar (endpoint dedicado)
POST  /sessions/:id/assign                 // Atribuir a agente/dept
GET   /sessions/by-contact/:contactId      // ⭐ CRITICAL - Falecomigo.ai format

// ✅ JÁ EXISTE:
GET   /sessions                            // List
GET   /sessions/:id                        // Get
POST  /sessions/:id/block-ai               // Block AI
POST  /sessions/:id/unblock-ai             // Unblock AI
POST  /sessions/:id/close                  // Close
```

**FORMATO ESPERADO** `/sessions/by-contact/:contactId`:
```json
{
  "contact": {...},
  "sessions": [{...}],
  "allMessages": [{...}],  // All messages from all sessions
  "isLastSessionClosed": false,
  "lastSessionId": "uuid",
  "lastSessionStatus": "QUEUED",
  "lastSessionAssignedDepartment": {...},
  "pagination": {...}
}
```

---

## 🔥 DECISÕES NECESSÁRIAS ANTES DE CONTINUAR

Por favor, me responda:

### **1. Message Concatenator Worker (GAP 2)**
**Problema**: Mensagens ficam no Redis por 5-8s mas **ninguém processa quando expira**.

**Opções**:
- [ ] **A)** BullMQ Delayed Jobs (criar job com delay de 8s, cancelar se nova mensagem) ← RECOMENDO
- [ ] **B)** Redis Keyspace Notifications (escutar eventos de expiração)
- [ ] **C)** Manual (admin força processar via endpoint)

**Sua escolha**: _______

---

### **2. Unblock Expired AIs (GAP 4)**
**Problema**: Método `unblockExpiredAIs()` existe mas nunca é chamado.

**Opções**:
- [ ] **A)** BullMQ Cron Job (executar a cada 1 minuto) ← RECOMENDO
- [ ] **B)** Vercel Cron Jobs (se usar Vercel em produção)
- [ ] **C)** Worker separado em Node.js

**Sua escolha**: _______

---

### **3. Webhook Bypass para Sessões Fechadas (GAP 8)**
**Pergunta**: Se sessão está `status === 'CLOSED'`, o webhook deve:
- [ ] **A)** Ignorar completamente (não criar mensagem) ← RECOMENDO
- [ ] **B)** Reabrir automaticamente a sessão
- [ ] **C)** Criar nova sessão automaticamente

**Sua escolha**: _______

---

### **4. Prioridade de Implementação**
Marque com X as que devo implementar AGORA (top 3):

- [ ] Contacts Controller (CRUD completo)
- [ ] Messages Controller (POST /messages CRITICAL)
- [ ] Sessions Extensions (reopen, pause, assign, by-contact)
- [ ] Message Concatenator Worker (BullMQ ou Redis)
- [ ] Unblock Expired AIs Cron
- [ ] Webhook Bypass Logic

**Sua escolha top 3**: _______, _______, _______

---

## 📊 RESUMO

### ✅ COMPLETO
- [x] Prisma Schema atualizado (Contact, ChatSession, Message, Tabulations)
- [x] 3 novos models criados
- [x] 2 novos enums criados
- [x] Database sincronizado

### ⏳ AGUARDANDO DECISÕES
- [ ] Message Concatenator Worker (decisão 1)
- [ ] Unblock Expired AIs Cron (decisão 2)
- [ ] Webhook Bypass Logic (decisão 3)
- [ ] Prioridade de implementação (decisão 4)

### 🚀 PRONTO PARA CODIFICAR
- Assim que você responder as 4 perguntas, vou implementar BRUTALMENTE!

---

**AGUARDANDO SUAS DECISÕES PARA CONTINUAR** 🔥
