# 🎯 ROTAS CRÍTICAS - BASEADO EM FALECOMIGO.AI

**Status:** ❌ Não consegui acessar docs.falecomigo.ai (protegido por senha)

---

## 📋 ROTAS QUE JÁ CONHEÇO (do exemplo fornecido)

### ✅ **1. GET /api/sessions/by-contact/:contactId**
**Resposta conhecida:**
```json
{
  "contact": {
    "id": "uuid",
    "name": "Maria Lucinda",
    "email": null,
    "phoneNumber": "5519978279037",
    "organizationId": "uuid",
    "externalId": "5519978279037",
    "source": "integrationId",
    "bypassBots": false,
    "ContactTabulation": [
      {
        "tabulation": {
          "id": "uuid",
          "name": "Em atendimento",
          "backgroundColor": "#ffffff"
        }
      }
    ]
  },
  "sessions": [
    {
      "id": "uuid",
      "contactId": "uuid",
      "integrationId": "uuid",
      "organizationId": "uuid",
      "status": "QUEUED",
      "startedBy": "BUSINESS",
      "assignedCustomerId": null,
      "assignedDepartmentId": "uuid",
      "assignedAgentId": null,
      "messages": [...]
    }
  ],
  "allMessages": [
    {
      "id": "uuid",
      "content": { "text": "string" },
      "type": "TEXT",
      "direction": "OUT",
      "author": "BUSINESS",
      "status": "FAILED",
      "sessionId": "uuid",
      "startedBy": "BUSINESS",
      "sessionStatus": "QUEUED"
    }
  ],
  "isLastSessionClosed": false,
  "lastSessionId": "uuid",
  "lastSessionStatus": "QUEUED",
  "lastSessionAssignedDepartment": { "id": "uuid", "name": "Corretor - Gabriel" },
  "pagination": { "total_data": 3, "total_pages": 1, "page": 1, "limit": 50 }
}
```

**STATUS**: ⏳ PRECISO IMPLEMENTAR

---

### ✅ **2. POST /api/messages**
**Request conhecido:**
```json
{
  "sessionId": "string",
  "type": "MEDIA|TEXT|RECORDING|CHAT_COMMAND",
  "direction": "IN|OUT",
  "author": "CUSTOMER|AGENT|AI|BUSINESS|SYSTEM|AGENT_PLATFORM",
  "content": {
    "text": "string"
  },
  "pauseSession": true,
  "status": "PENDING|SENT|DELIVERED|READ|FAILED",
  "externalId": "string",
  "sendExternalMessage": true
}
```

**Comportamento:**
- `sendExternalMessage: true` → Enviar pro WhatsApp via provider
- `sendExternalMessage: false` → Apenas registrar no banco
- `pauseSession: true` → Pausar sessão após enviar

**STATUS**: ⏳ PRECISO IMPLEMENTAR

---

## ❓ ROTAS QUE PRECISO SABER

**PERGUNTA PARA O USUÁRIO:**

Quais destas rotas são MAIS CRÍTICAS para implementar agora?

### **Contacts**
- [ ] GET /contacts
- [ ] GET /contacts/:id
- [ ] GET /contacts/by-phone/:phone
- [ ] PATCH /contacts/:id
- [ ] POST /contacts/:id/tabulations
- [ ] DELETE /contacts/:id/tabulations

### **Sessions**
- [ ] POST /sessions (criar nova sessão)
- [ ] POST /sessions/:id/reopen (reabrir)
- [ ] POST /sessions/:id/pause (pausar)
- [ ] POST /sessions/:id/assign (atribuir agente/dept)
- [ ] PATCH /sessions/:id (atualizar campos)

### **Messages**
- [ ] GET /messages (list com filtros)
- [ ] GET /messages/:id (buscar por ID)
- [ ] GET /sessions/:sessionId/messages (mensagens da sessão)
- [ ] DELETE /messages/:id

### **Tabulations**
- [ ] GET /tabulations (listar tags/labels)
- [ ] POST /tabulations (criar tag)
- [ ] PATCH /tabulations/:id
- [ ] DELETE /tabulations/:id

### **Integrations**
- [ ] GET /integrations (listar integrações)
- [ ] POST /integrations (criar integração)
- [ ] GET /integrations/:id
- [ ] PATCH /integrations/:id

### **Departments**
- [ ] GET /departments
- [ ] POST /departments
- [ ] PATCH /departments/:id

---

## 🚀 PLANO DE AÇÃO

**O QUE VOU FAZER AGORA:**

1. ✅ Implementar **GET /sessions/by-contact/:contactId** (formato conhecido)
2. ✅ Implementar **POST /messages** (formato conhecido)
3. ⏳ Aguardar sua resposta sobre as outras rotas críticas

**TEMPO ESTIMADO:**
- Rota 1: 20 minutos
- Rota 2: 30 minutos
- **Total: ~50 minutos**

---

**AGUARDANDO:** Qual das rotas acima você quer que eu priorize depois destas 2?
