# 🚀 IMPLEMENTANDO RECOMENDAÇÕES - AÇÃO BRUTAL

**Data:** 16 de Outubro de 2025

---

## ✅ DECISÕES APLICADAS

Você escolheu aplicar TODAS as recomendações. Vou implementar:

### **1. Message Concatenator com BullMQ Delayed Jobs** ⭐
- ✅ Remover lógica de Redis SETEX
- ✅ Usar BullMQ jobs com delay de 5-8s
- ✅ Cancelar job anterior quando nova mensagem chega
- ✅ Criar novo job com delay resetado

### **2. BullMQ Cron para Unblock Expired AIs** ⭐
- ✅ Criar cron job que executa a cada 1 minuto
- ✅ Chamar `sessionsManager.unblockExpiredAIs()`
- ✅ Logar quantas sessões foram desbloqueadas

### **3. Webhook Bypass para Sessões Fechadas** ⭐
- ✅ Adicionar validação no webhook processor
- ✅ Se `status === 'CLOSED'`, ignorar webhook completamente
- ✅ Logar para auditoria

### **4. Top 3 Prioridades**
1. **Messages Controller (POST /messages)** - CRÍTICO
2. **Sessions by-contact endpoint** - CRÍTICO
3. **Contacts Controller** - IMPORTANTE

---

## 🔧 IMPLEMENTAÇÃO EM ANDAMENTO

### ✅ FASE 1: Schema Updates (COMPLETO)
- [x] Contact: +5 campos
- [x] ChatSession: +9 campos
- [x] Message: +1 campo `author`
- [x] 3 novos models (Tabulation, ContactTabulation, SessionTabulation)
- [x] 2 novos enums
- [x] Database sincronizado

### 🔄 FASE 2: Message Concatenator com BullMQ (EM PROGRESSO)
**Arquivo**: `src/lib/concatenation/message-concatenator.ts`

**Mudanças**:
```typescript
async addMessage(...) {
  // ❌ ANTES: Redis SETEX (expira mas ninguém processa)
  // await redis.setex(key, this.CONCAT_TIMEOUT, JSON.stringify([message]));

  // ✅ AGORA: BullMQ Delayed Job
  await redis.set(key, JSON.stringify([message])); // Sem expiração

  await concatenationQueue.add(
    'process-concatenation',
    { sessionId, contactId },
    {
      jobId: `concat_${sessionId}_${contactId}`,
      delay: this.CONCAT_TIMEOUT * 1000 // 5-8s em ms
    }
  );

  // Se nova mensagem chega, cancelar job anterior:
  const oldJob = await concatenationQueue.getJob(jobId);
  if (oldJob) await oldJob.remove();

  // Criar novo job com delay resetado
}
```

### ⏳ FASE 3: Unblock Expired AIs Cron (PRÓXIMO)
**Arquivo**: `src/lib/sessions/unblock-expired.cron.ts` (CRIAR)

**Código**:
```typescript
import { Queue, QueueScheduler } from 'bullmq';
import { sessionsManager } from './sessions.manager';
import { redis } from '@/services/redis';

export const unblockExpiredQueue = new Queue('unblock-expired-ais', {
  connection: redis,
});

// Scheduler para cron jobs
export const unblockExpiredScheduler = new QueueScheduler('unblock-expired-ais', {
  connection: redis,
});

// Adicionar cron job (executa a cada 1 minuto)
await unblockExpiredQueue.add(
  'unblock-expired-ais',
  {},
  {
    repeat: {
      pattern: '*/1 * * * *', // Cada 1 minuto
    },
  }
);

// Worker
export const unblockExpiredWorker = new Worker(
  'unblock-expired-ais',
  async () => {
    const count = await sessionsManager.unblockExpiredAIs();
    console.log(`[Cron] Unblocked ${count} expired AI sessions`);
    return { unblockedCount: count };
  },
  { connection: redis }
);
```

### ⏳ FASE 4: Webhook Bypass (PRÓXIMO)
**Arquivo**: `src/app/api/v1/webhooks/[provider]/route.ts`

**Mudança**:
```typescript
async function processIncomingMessage(webhook: NormalizedWebhook) {
  // ... buscar sessão ...

  // ✅ ADICIONAR: Bypass se sessão está CLOSED
  if (session.status === 'CLOSED') {
    console.log(`[Webhook] Session ${session.id} is CLOSED, ignoring webhook`);
    return; // Ignorar webhook
  }

  // ... processar normalmente ...
}
```

### ⏳ FASE 5: Messages Controller (PRÓXIMO)
**Arquivo**: `src/features/messages/controllers/messages.controller.ts` (CRIAR)

**Endpoints**:
```typescript
POST   /api/v1/messages                    // Create message ⭐
GET    /api/v1/messages                    // List with filters
GET    /api/v1/messages/:id                // Get by ID
GET    /api/v1/sessions/:sessionId/messages // Messages of session
```

**POST /messages body**:
```json
{
  "sessionId": "uuid",
  "type": "TEXT|MEDIA|RECORDING|CHAT_COMMAND",
  "direction": "IN|OUT",
  "author": "CUSTOMER|AGENT|AI|BUSINESS|SYSTEM|AGENT_PLATFORM",
  "content": {
    "text": "string"
  },
  "pauseSession": false,
  "status": "PENDING|SENT|DELIVERED|READ|FAILED",
  "externalId": "string",
  "sendExternalMessage": true
}
```

### ⏳ FASE 6: Sessions by-contact Endpoint (PRÓXIMO)
**Arquivo**: `src/features/sessions/controllers/sessions.controller.ts`

**Endpoint**:
```typescript
GET /api/v1/sessions/by-contact/:contactId
```

**Resposta**:
```json
{
  "contact": {...},
  "sessions": [{...}],
  "allMessages": [{...}], // All messages from all sessions
  "isLastSessionClosed": false,
  "lastSessionId": "uuid",
  "lastSessionStatus": "QUEUED",
  "lastSessionAssignedDepartment": {...},
  "pagination": {...}
}
```

### ⏳ FASE 7: Contacts Controller (PRÓXIMO)
**Arquivo**: `src/features/contacts/controllers/contacts.controller.ts` (CRIAR)

**Endpoints**:
```typescript
GET    /api/v1/contacts                    // List all
GET    /api/v1/contacts/:id                // Get by ID
GET    /api/v1/contacts/by-phone/:phone    // Get by phone
PATCH  /api/v1/contacts/:id                // Update
POST   /api/v1/contacts/:id/tabulations    // Add tabulation
DELETE /api/v1/contacts/:id/tabulations    // Remove tabulation
GET    /api/v1/contacts/:id/sessions       // List sessions
```

---

## ⏱️ TEMPO ESTIMADO RESTANTE

- ✅ FASE 1: Schema (COMPLETO)
- 🔄 FASE 2: Message Concatenator (10 min restantes)
- ⏳ FASE 3: Unblock Cron (5 min)
- ⏳ FASE 4: Webhook Bypass (3 min)
- ⏳ FASE 5: Messages Controller (30 min)
- ⏳ FASE 6: Sessions by-contact (20 min)
- ⏳ FASE 7: Contacts Controller (25 min)

**TOTAL RESTANTE**: ~93 minutos (~1.5 horas)

---

## 🚀 COMEÇANDO IMPLEMENTAÇÃO BRUTAL

Vou implementar tudo em sequência, atualizando este documento conforme avanço.
