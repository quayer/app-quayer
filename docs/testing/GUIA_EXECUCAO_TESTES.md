# 🧪 GUIA DE EXECUÇÃO DOS TESTES REAIS

## 🚀 SERVIDOR RODANDO
✅ Servidor iniciado em: http://localhost:3000

---

## 📋 SCRIPTS DISPONÍVEIS

### Todos os Testes (200 testes)
```bash
npm run test:real:all
```

### Por Categoria
```bash
# API Tests (70 testes - ~30 min)
npm run test:real:api

# UI Tests (45 testes - ~20 min)
npm run test:real:ui

# E2E Journeys (45 passos - ~45 min)
npm run test:real:e2e

# Edge Cases (20 testes - ~15 min)
npm run test:real:edge

# Advanced Features (20 testes - ~20 min)
npm run test:real:advanced
```

### Jornadas Individuais (RECOMENDADO - Testar juntos!)
```bash
# 1. Jornada: Signup → Login → Dashboard (~8 min)
npm run test:real:journey:signup

# 2. Jornada: Criar Org → Convidar → Aceitar (~10 min)
npm run test:real:journey:organization

# 3. Jornada: WhatsApp Completo (~15 min)
npm run test:real:journey:whatsapp

# 4. Jornada: Onboarding Completo (~7 min)
npm run test:real:journey:onboarding

# 5. Jornada: Multi-user Collaboration (~5 min)
npm run test:real:journey:multiuser
```

---

## 🎯 VAMOS COMEÇAR JUNTOS!

### JORNADA 1: Signup → Login → Dashboard

**O QUE VOCÊ VAI PRECISAR:**
- ✉️ Um email REAL (Gmail, Outlook, etc.)
- 📱 Acesso ao email para ver o código OTP

**PASSOS:**
1. Execute: `npm run test:real:journey:signup`
2. O browser vai abrir automaticamente (--headed)
3. Quando pedir, digite seu email real
4. Verifique seu email e digite o código OTP de 6 dígitos
5. Confirme visualmente cada passo quando pedido
6. Acompanhe o terminal para ver os logs

**TEMPO ESTIMADO:** ~8 minutos

**CONSOLE OUTPUT:**
```
╔═══════════════════════════════════════════════════════╗
║   E2E JOURNEY: SIGNUP → LOGIN → DASHBOARD           ║
╚═══════════════════════════════════════════════════════╝

🌐 PASSO 1: Acessar Landing Page
✅ Landing page carregada
📱 Digite um email REAL para receber o código OTP
Email para signup: _______

...e assim por diante
```

---

## 🔥 ORDEM SUGERIDA PARA TESTAR JUNTOS

### FASE 1: Autenticação (15 min)
1. ✅ **Signup → Login** - Teste básico de autenticação
   - `npm run test:real:journey:signup`

### FASE 2: Organizações (10 min)
2. ✅ **Criar Org → Convidar** - Teste de multi-tenancy
   - `npm run test:real:journey:organization`

### FASE 3: Onboarding (7 min)
3. ✅ **Onboarding Completo** - Teste de primeira experiência
   - `npm run test:real:journey:onboarding`

### FASE 4: WhatsApp (15 min) - O MAIS LEGAL!
4. ✅ **WhatsApp Completo** - QR Code → Enviar → Receber
   - `npm run test:real:journey:whatsapp`
   - ⚠️ Você vai precisar do seu celular para escanear o QR Code!

### FASE 5: Colaboração (5 min)
5. ✅ **Multi-user** - 3 browsers simultâneos com RBAC
   - `npm run test:real:journey:multiuser`

**TEMPO TOTAL:** ~52 minutos (com você testando manualmente junto)

---

## 💡 DICAS IMPORTANTES

### Durante os Testes:
- ✅ **Não feche o browser** que o Playwright abre
- ✅ **Acompanhe o terminal** para ver os logs
- ✅ **Confirme visualmente** quando pedido
- ✅ **Digite os dados solicitados** (email, OTP, etc.)
- ✅ **Verifique seu email** quando necessário

### Se Algo Der Errado:
- 🔄 **Ctrl+C** no terminal para parar
- 🔄 Reexecute o comando
- 🔄 Verifique se o servidor está rodando (http://localhost:3000)
- 🔄 Verifique se o banco está limpo (`npm run db:reset`)

### Atalhos Úteis:
```bash
# Limpar e resetar banco de dados
npm run db:reset

# Ver logs do servidor
# (já está rodando em background)

# Parar servidor
# Ctrl+C no terminal onde rodou npm run dev
```

---

## 🎬 COMEÇANDO AGORA!

**PASSO 1:** Abra um novo terminal

**PASSO 2:** Execute a primeira jornada:
```bash
npm run test:real:journey:signup
```

**PASSO 3:** Acompanhe o browser que abrir e o terminal

**PASSO 4:** Digite seu email quando pedido

**PASSO 5:** Verifique seu email e digite o OTP

**PASSO 6:** Confirme visualmente cada passo

**PASSO 7:** Quando terminar, volte aqui e vamos para a próxima jornada!

---

## 📊 PROGRESSO

```
[ ] Jornada 1: Signup → Login
[ ] Jornada 2: Criar Org → Convidar
[ ] Jornada 3: Onboarding
[ ] Jornada 4: WhatsApp Completo
[ ] Jornada 5: Multi-user Collaboration
```

**Marque cada uma quando completar!**

---

## 🆘 PRECISA DE AJUDA?

**Me avise quando:**
- ✅ Terminar uma jornada (vamos para a próxima!)
- ❌ Der algum erro (vamos debugar juntos!)
- ❓ Tiver dúvidas (estou aqui para ajudar!)

**VAMOS TESTAR TUDO JUNTO! 🚀**
