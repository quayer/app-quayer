# 🔥 GAP ANALYSIS - Quayer vs Falecomigo.ai

**Data:** 16 de Outubro de 2025

---

## 📊 ESTRUTURA FALECOMIGO.AI (EXEMPLO RECEBIDO)

### **1. Session Structure**
```json
{
  "id": "uuid",
  "contactId": "uuid",
  "integrationId": "uuid",  // ❌ FALTA (chamamos de instanceId)
  "organizationId": "uuid",
  "status": "QUEUED|ACTIVE|PAUSED|CLOSED",  // ✅ TEMOS
  "startedBy": "BUSINESS|CUSTOMER",  // ❌ FALTA
  "assignedCustomerId": "uuid|null",  // ❌ FALTA (assignment)
  "assignedDepartmentId": "uuid|null",  // ❌ FALTA
  "assignedAgentId": "uuid|null",  // ❌ FALTA
  "statusReason": "string|null",  // ❌ FALTA
  "endReason": "string|null",  // ❌ FALTA (motivo do fechamento)
  "externalId": "string|null",  // ❌ FALTA
  "messages": [...]  // ✅ TEMOS (relation)
}
```

### **2. Message Structure**
```json
{
  "id": "uuid",
  "content": {
    "text": "string",  // ✅ TEMOS
    "media": {  // ✅ TEMOS
      "url": "string",
      "name": "string",
      "type": "audio|image|video|document",
      "fileKey": "string",  // ❌ FALTA
      "duration": number,  // ✅ TEMOS (mediaDuration)
      "mimeType": "string",  // ✅ TEMOS
      "extension": "string",  // ❌ FALTA
      "originalUrl": "string"  // ❌ FALTA
    }
  },
  "type": "TEXT|MEDIA|RECORDING|CHAT_COMMAND",  // ✅ TEMOS (parcial)
  "direction": "IN|OUT",  // ✅ TEMOS (INBOUND|OUTBOUND)
  "author": "CUSTOMER|AGENT|AI|BUSINESS|SYSTEM|AGENT_PLATFORM",  // ❌ FALTA COMPLETAMENTE
  "status": "PENDING|SENT|DELIVERED|READ|FAILED",  // ✅ TEMOS
  "sessionId": "uuid",  // ✅ TEMOS
  "contactId": "uuid",  // ✅ TEMOS
  "pauseSession": boolean,  // ❌ FALTA (pausar sessão ao enviar)
  "externalId": "string",  // ❌ FALTA
  "sendExternalMessage": boolean  // ❌ FALTA
}
```

### **3. Contact Structure**
```json
{
  "id": "uuid",
  "name": "string",  // ✅ TEMOS
  "email": "string|null",  // ❌ FALTA
  "phoneNumber": "string",  // ✅ TEMOS
  "organizationId": "uuid",  // ❌ FALTA (temos mas não no schema Contact)
  "externalId": "string",  // ❌ FALTA
  "source": "uuid",  // ❌ FALTA (source = integrationId)
  "bypassBots": boolean,  // ❌ FALTA (bypass AI)
  "ContactTabulation": [  // ❌ FALTA COMPLETAMENTE
    {
      "tabulation": {
        "id": "uuid",
        "name": "Em atendimento",
        "backgroundColor": "#ffffff",
        "description": "string",
        "autoTabulation": boolean
      }
    }
  ]
}
```

### **4. Integration Structure**
```json
{
  "id": "uuid",
  "name": "Corretor Gabriel",
  "provider": {
    "slug": "evogo|uazapi|evolution"
  }
}
```
**Nosso equivalente**: `Instance` model (mas chamamos de Instance, não Integration)

---

## ❌ GAPS CRÍTICOS IDENTIFICADOS

### **GAP 1: Message.author field FALTANDO**
**Impacto**: CRÍTICO - Não sabemos se mensagem veio de AI, AGENT, CUSTOMER, BUSINESS
**Solução**: Adicionar campo `author` ao Message model
```prisma
enum MessageAuthor {
  CUSTOMER    // Cliente final
  AGENT       // Atendente humano
  AI          // IA/Bot
  BUSINESS    // Empresa/Sistema
  SYSTEM      // Sistema automático
  AGENT_PLATFORM  // Plataforma de agente
}

model Message {
  // ...
  author MessageAuthor
}
```

---

### **GAP 2: Session Assignment (Department, Agent, Customer) FALTANDO**
**Impacto**: ALTO - Não conseguimos atribuir sessões para departamentos/agentes
**Solução**: Adicionar campos de assignment
```prisma
model ChatSession {
  // ...
  assignedDepartmentId String?
  assignedAgentId      String?
  assignedCustomerId   String?
  startedBy            SessionStartedBy @default(CUSTOMER)
  statusReason         String?
  endReason            String?
  externalId           String?
}

enum SessionStartedBy {
  CUSTOMER
  BUSINESS
  AGENT
}
```

---

### **GAP 3: Contact Tabulations (Tags/Labels) FALTANDO**
**Impacto**: MÉDIO - Sistema de categorização de contatos
**Solução**: Criar models de Tabulation
```prisma
model Tabulation {
  id              String   @id @default(uuid())
  organizationId  String
  name            String
  description     String?
  backgroundColor String   @default("#ffffff")
  autoTabulation  Boolean  @default(false)
  contacts        ContactTabulation[]
  sessions        SessionTabulation[]
}

model ContactTabulation {
  id           String   @id @default(uuid())
  contactId    String
  tabulationId String
  contact      Contact  @relation(...)
  tabulation   Tabulation @relation(...)
}

model SessionTabulation {
  id           String   @id @default(uuid())
  sessionId    String
  tabulationId String
  session      ChatSession @relation(...)
  tabulation   Tabulation @relation(...)
}
```

---

### **GAP 4: Contact fields incompletos**
**Impacto**: MÉDIO
**Faltando**:
- `email`
- `organizationId` (existe relation mas não no schema direto)
- `externalId`
- `source` (integrationId de origem)
- `bypassBots` (desabilitar IA para contato específico)

---

### **GAP 5: Message content structure diferente**
**Impacto**: MÉDIO
**Atual**: Campos separados (mediaUrl, mediaType, etc)
**Ideal**: Campo JSON `content` com `text` ou `media` object

---

### **GAP 6: Endpoint /sessions/by-contact/:contactId FALTANDO**
**Impacto**: CRÍTICO - Frontend precisa buscar sessões por contato
**Resposta esperada**:
```json
{
  "contact": {...},
  "sessions": [...],
  "allMessages": [...],
  "isLastSessionClosed": boolean,
  "lastSessionId": "uuid",
  "lastSessionStatus": "QUEUED",
  "pagination": {...}
}
```

---

### **GAP 7: POST /messages endpoint FALTANDO**
**Impacto**: CRÍTICO - Enviar mensagem via API
**Campos necessários**:
- `sessionId`
- `type` (TEXT, MEDIA, etc)
- `direction` (IN, OUT)
- `author` (CUSTOMER, AGENT, AI, BUSINESS)
- `content` (text ou media object)
- `pauseSession` (pausar sessão ao enviar?)
- `sendExternalMessage` (enviar pro WhatsApp ou só registrar?)

---

### **GAP 8: Webhook bypass para sessões fechadas FALTANDO**
**Impacto**: CRÍTICO
**Regra**: Se sessão está CLOSED, webhook deve ser ignorado
**Implementação**: Adicionar validação no webhook processor

---

### **GAP 9: Session operations incompletas**
**Faltando**:
- ✅ Close (TEMOS)
- ❌ **Reopen** (reabrir sessão fechada)
- ✅ Pause (temos via status update, mas falta endpoint dedicado)
- ❌ **Assign** (atribuir a agente/departamento)

---

### **GAP 10: Contacts Controller FALTANDO COMPLETAMENTE**
**Endpoints necessários**:
- GET /contacts (list com paginação)
- GET /contacts/:id
- GET /contacts/by-phone/:phone
- PATCH /contacts/:id
- POST /contacts/:id/tabulations
- DELETE /contacts/:id/tabulations
- GET /contacts/:id/sessions

---

## 🎯 PLANO DE IMPLEMENTAÇÃO BRUTAL

### **FASE 1: Database Schema Updates** (30 min)
1. ✅ Adicionar `author` enum e field em Message
2. ✅ Adicionar campos de assignment em ChatSession
3. ✅ Adicionar campos faltantes em Contact
4. ✅ Criar Tabulation, ContactTabulation, SessionTabulation models
5. ✅ Migrar database

### **FASE 2: Sessions Controller Extensions** (20 min)
1. ✅ POST /sessions/:id/reopen
2. ✅ POST /sessions/:id/pause (endpoint dedicado)
3. ✅ POST /sessions/:id/assign
4. ✅ GET /sessions/by-contact/:contactId (CRITICAL)
5. ✅ Atualizar close() para aceitar `endReason`

### **FASE 3: Messages Controller Implementation** (30 min)
1. ✅ POST /messages (create message)
2. ✅ GET /messages (list com filtros)
3. ✅ GET /messages/:id
4. ✅ GET /sessions/:sessionId/messages
5. ✅ Implementar `sendExternalMessage` (enviar pro WhatsApp)

### **FASE 4: Contacts Controller Implementation** (25 min)
1. ✅ GET /contacts
2. ✅ GET /contacts/:id
3. ✅ GET /contacts/by-phone/:phone
4. ✅ PATCH /contacts/:id
5. ✅ POST /contacts/:id/tabulations
6. ✅ DELETE /contacts/:id/tabulations
7. ✅ GET /contacts/:id/sessions

### **FASE 5: Webhook Updates** (15 min)
1. ✅ Validar se sessão está CLOSED (ignorar webhook)
2. ✅ Popular campo `author` baseado em `direction`
3. ✅ Criar sessão com `startedBy` correto

### **FASE 6: Testing** (30 min)
1. ✅ Testar criar mensagem com autor
2. ✅ Testar buscar sessões por contato
3. ✅ Testar webhook ignorando sessão fechada
4. ✅ Testar tabulations
5. ✅ Testar assignment

---

## ⏱️ TEMPO TOTAL ESTIMADO: ~2.5 horas

**COMEÇAR AGORA?**
