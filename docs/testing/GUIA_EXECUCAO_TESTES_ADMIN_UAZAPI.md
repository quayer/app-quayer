# 🚀 GUIA RÁPIDO: EXECUTAR TESTES ADMIN + UAZAPI

## ⚡ EXECUÇÃO RÁPIDA (15 minutos)

### Passo 1: Preparar Ambiente

```bash
# Terminal 1: Iniciar dev server
npm run dev

# Terminal 2: Verificar banco
npm run db:seed
```

---

### Passo 2: Executar Testes Essenciais

```bash
# Teste 1: Dashboard Admin (2 min)
npx playwright test test/real/admin/admin-dashboard-real.test.ts --headed

# Teste 2: Organizações (3 min)
npx playwright test test/real/admin/admin-organizations-real.test.ts --headed

# Teste 3: Instâncias + QR Code (5 min + scan manual)
npx playwright test test/real/uazapi/uazapi-instances-real.test.ts --headed
```

**⏳ Durante o teste de instâncias**:
1. Aguardar QR code aparecer
2. Escanear com WhatsApp
3. Aguardar conexão

---

### Passo 3: Validar Resultados

```bash
# Ver screenshots gerados
explorer test-results\screenshots\

# Ver logs no terminal
# Procurar por: ✅ (sucesso) e ❌ (falha)
```

---

## 🔥 EXECUÇÃO COMPLETA (45 minutos)

### Fase 1: Todos os Testes Admin

```bash
npm run test:admin
```

**Testes executados**:
- ✅ Dashboard (métricas, gráficos)
- ✅ Organizações (CRUD, limites)
- ✅ Clientes (usuários, RBAC)
- ✅ Integrações (multi-org)
- ✅ Webhooks (config, logs)
- ✅ Logs (sistema)
- ✅ Brokers (validação)
- ✅ Permissions (RBAC)

**Tempo**: ~20 minutos

---

### Fase 2: Todos os Testes UAZAPI

```bash
npm run test:uazapi
```

**Testes executados**:
- ✅ Instâncias (criar, conectar, QR)
- ✅ Mensagens (enviar, receber)
- ✅ Webhooks (configurar, validar)
- ✅ Chats (listar, buscar)

**Tempo**: ~15 minutos + QR scan manual

**⚠️ Interação Manual Necessária**:
- Escanear 1-2 QR codes
- Enviar mensagens via WhatsApp (opcional)

---

### Fase 3: Jornadas E2E

```bash
# Jornada completa: Admin → User
npx playwright test test/real/e2e/journey-admin-to-user-complete-real.test.ts --headed

# Multi-org isolation
npx playwright test test/real/e2e/journey-multi-org-real.test.ts --headed

# Webhooks automation
npx playwright test test/real/e2e/journey-webhooks-automation-real.test.ts --headed
```

**Tempo**: ~10 minutos + interações

---

## 📸 SCREENSHOTS GERADOS

Após execução, verificar:

```
test-results/screenshots/
├── admin-dashboard-full.png
├── admin-organizations.png
├── admin-clients.png
├── admin-integracoes.png
├── admin-webhooks.png
├── qr-code-instance.png        ← QR code para escanear
├── uazapi-instances.png
├── uazapi-messages.png
├── e2e-admin-final.png
└── e2e-user-final.png
```

---

## ✅ VALIDAÇÃO DE SUCESSO

### Logs do Terminal

Procurar por:
```
✅ Teste passou
✅ Criado com sucesso
✅ Validação dupla confirmada
```

### Banco de Dados

```bash
# Conectar no PostgreSQL
psql -U postgres -d quayer

# Verificar organizações
SELECT id, name, "maxInstances", "maxUsers" FROM "Organization" WHERE "deletedAt" IS NULL;

# Verificar instâncias
SELECT id, name, status, "organizationId" FROM "Instance";

# Verificar webhooks
SELECT id, url, events, enabled FROM "Webhook";
```

---

## ⚠️ TROUBLESHOOTING

### Teste falha: "Elemento não encontrado"

**Causa**: UI pode não estar implementada ainda  
**Solução**: Normal - teste documenta o esperado

---

### Teste falha: "Timeout"

**Causa**: Server lento ou não iniciado  
**Solução**:
```bash
# Verificar se server está rodando
curl http://localhost:3000/api/v1/auth/health

# Reiniciar se necessário
npm run dev
```

---

### QR Code não aparece

**Causa**: UAZAPI não está configurado  
**Solução**:
```bash
# Verificar .env
echo $NEXT_PUBLIC_UAZAPI_BASE_URL
echo $UAZAPI_ADMIN_TOKEN

# Deve retornar URLs válidas
```

---

## 🎯 MÉTRICAS DE SUCESSO

Após execução completa:

- [ ] 8/8 testes admin passaram
- [ ] 4/4 testes UAZAPI essenciais passaram
- [ ] 3/3 jornadas E2E completadas
- [ ] 15+ screenshots gerados
- [ ] Zero erros críticos
- [ ] RBAC funcionando 100%
- [ ] Multi-org isolation confirmado

---

## 📊 RESULTADO ESPERADO

```
╔═══════════════════════════════════════╗
║                                       ║
║   ✅ 78/78 TESTES EXECUTADOS         ║
║   🎯 ADMIN + UAZAPI 100% VALIDADO    ║
║   📸 15+ SCREENSHOTS GERADOS         ║
║   🔒 RBAC FUNCIONANDO                ║
║                                       ║
╚═══════════════════════════════════════╝
```

---

**Criado por:** Lia AI Agent  
**Versão:** Guia Executivo Rápido  
**Tempo Total:** 45 min + interações manuais

