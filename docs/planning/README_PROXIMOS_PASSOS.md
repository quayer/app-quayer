# 🎯 Próximos Passos - App Quayer

## 📌 Status Atual

**Data**: 12 de outubro de 2025  
**Progresso**: 80% do sistema implementado  
**Pendente**: Auditorias e correções finais

---

## 🔴 AÇÃO IMEDIATA (ANTES DE CONTINUAR)

### Corrigir Erro 401 - Token JWT

**Problema**:
```
GET /api/v1/instances?page=1&limit=50 401 (Unauthorized)
[AuthProcedure] authHeader: null
```

**Causa**:
- Token JWT não está sendo enviado nas requisições fetch
- Cookies httpOnly não sendo incluídos automaticamente

**Solução**:
1. Investigar `src/components/providers/fetch-interceptor.tsx`
2. Garantir que o token é lido dos cookies
3. Adicionar `Authorization: Bearer ${token}` em todas as requisições
4. Validar com teste de API

**Arquivos para Verificar**:
- `src/components/providers/fetch-interceptor.tsx`
- `src/lib/auth/auth-provider.tsx`
- `src/igniter.client.ts`

**Comando para Teste**:
```bash
# Após correção, testar no browser
# Verificar console que requisições incluem Authorization header
```

---

## 📋 Auditorias Pendentes (Ordem Sugerida)

### 1. Área Admin (Prioridade Alta)

```bash
# Login como admin
http://localhost:3000/login
# Email: admin@quayer.com
# Usar código do e-mail real
```

**Páginas para Validar**:
1. ✅ `/admin` - Dashboard (métricas reais)
2. ✅ `/admin/organizations` - CRUD completo
3. ✅ `/admin/clients` - Lista de usuários
4. ✅ `/admin/integracoes` - Visão global
5. ✅ `/admin/webhooks` - Configurações
6. ✅ `/admin/brokers` - Estado vazio OK
7. ✅ `/admin/logs` - Logs do sistema
8. ✅ `/admin/permissions` - Docs de roles

**Para Cada Página**:
- [ ] Navegar e capturar screenshot
- [ ] Testar funcionalidades principais
- [ ] Verificar dados reais (ou vazio adequado)
- [ ] Validar UI/UX (Shadcn patterns)
- [ ] Conferir responsividade
- [ ] Documentar issues

### 2. Área Usuário (Prioridade Alta)

```bash
# Criar nova conta ou usar existente
http://localhost:3000/signup
# Email: gabrielrizzatto@hotmail.com (ou outros)
```

**Fluxos para Validar**:
1. ✅ **Onboarding completo**
   - Signup → Verificação → Dashboard
   - Validar criação de organização

2. ✅ **Dashboard Usuário**
   - Métricas reais
   - Estado vazio adequado
   - Navegação

3. ✅ **Criar Integração (5 Etapas)**
   - Step 1: Channel selection
   - Step 2: Configuration
   - Step 3: Connection
   - Step 4: Share
   - Step 5: Success

4. ✅ **Compartilhamento Público**
   - Gerar link
   - Acessar sem login
   - QR code visível
   - Timer funcional
   - Refresh de QR

### 3. Troca de Organização (Prioridade Média)

**Cenário de Teste**:
1. Login como admin
2. Criar segunda organização
3. Adicionar usuário à segunda org
4. Fazer login como usuário
5. Alternar entre organizações
6. Validar isolamento de dados

**Validações**:
- [ ] Selector de organização visível
- [ ] Dados corretos por org
- [ ] Instâncias isoladas
- [ ] Permissões corretas

---

## 🎨 Review UX/UI (Prioridade Média)

### Componentes Shadcn para Auditar

**Button**:
- [ ] Variants: default, secondary, outline, ghost, destructive
- [ ] States: default, hover, active, disabled
- [ ] Sizes: sm, default, lg

**Card**:
- [ ] Header, Content, Footer, Description
- [ ] Espaçamento interno consistente
- [ ] Bordas e sombras

**Input/Form**:
- [ ] States: default, error, disabled
- [ ] Validação inline
- [ ] Labels e descriptions

**Dialog/Modal**:
- [ ] Overlay backdrop
- [ ] Close button
- [ ] Keyboard navigation (ESC)
- [ ] Scroll interno

**Table**:
- [ ] Header sticky
- [ ] Row hover states
- [ ] Paginação
- [ ] Ordenação

**Sidebar**:
- [ ] Collapse/expand
- [ ] Active states
- [ ] Ícones alinhados
- [ ] Responsive mobile

### Design Tokens (globals.css)

**Validar Uso Correto**:
- [ ] `--background` para fundos
- [ ] `--foreground` para textos
- [ ] `--primary` para ações principais
- [ ] `--card` para cards
- [ ] `--border` para bordas
- [ ] `--muted` para elementos secundários

### Espaçamento e Layout

**Padrões a Verificar**:
- [ ] `gap-4` ou `gap-6` entre elementos
- [ ] `p-4` ou `p-6` para padding de cards
- [ ] `space-y-4` para stacks verticais
- [ ] `flex` com `items-center` e `justify-between`

---

## 🧪 Testes E2E para Criar

### Suite 1: Nova UX de Integrações

```typescript
// test/real/nova-ux/integration-flow-complete.test.ts

test('Criar integração - Fluxo completo 5 etapas', async () => {
  // 1. Login
  // 2. Abrir modal de criação
  // 3. Step 1: Selecionar WhatsApp Business
  // 4. Step 2: Preencher configuração
  // 5. Step 3: Aguardar conexão
  // 6. Step 4: Compartilhar
  // 7. Step 5: Confirmar sucesso
  // 8. Validar instância criada no banco
})
```

### Suite 2: Compartilhamento Público

```typescript
// test/real/nova-ux/public-share.test.ts

test('Compartilhar instância via link público', async () => {
  // 1. Criar instância
  // 2. Gerar token de compartilhamento
  // 3. Acessar link público (sem login)
  // 4. Validar QR code exibido
  // 5. Refresh QR code
  // 6. Validar expiração
})
```

### Suite 3: Admin Complete

```typescript
// test/real/admin/admin-complete-audit.test.ts

test('Admin - Validar todas as páginas', async () => {
  // Loop através de todas as 8 páginas admin
  // Capturar screenshot de cada uma
  // Validar dados reais
  // Testar funcionalidade principal
})
```

---

## 📝 Comandos Úteis

### Desenvolvimento
```bash
# Iniciar servidor
npm run dev

# Aplicar migrations
npx prisma db push

# Gerar client Prisma
npx prisma generate

# Ver banco de dados
npx prisma studio
```

### Testes
```bash
# Todos os testes reais
npm run test:real:all

# Testes admin
npm run test:admin

# Testes UAZAPI
npm run test:uazapi

# Testes E2E
npm run test:real:e2e
```

### Debug
```bash
# Ver logs do servidor
# (observar terminal onde npm run dev está rodando)

# Verificar porta em uso
netstat -ano | findstr :3000

# Matar processo na porta 3000
taskkill /PID <PID> /F
```

---

## 🎯 Meta Final

**Objetivo**: Sistema 100% validado, testado e pronto para produção

**Critérios de Aprovação**:
- ✅ Todas as 15 auditorias completas
- ✅ Erro 401 corrigido
- ✅ UX/UI aprovada em todos os aspectos
- ✅ Testes E2E criados e passando
- ✅ UAZAPI integração real funcionando
- ✅ Documentação atualizada

**Quando Completo**:
- 🚀 Deploy para staging
- 🧪 Testes de aceitação com usuários reais
- 📊 Monitoramento e observabilidade
- 🎉 Release para produção!

---

## 💡 Dicas para Continuar

### Antes de Cada Sessão
1. Ler `AUDITORIA_COMPLETA_SISTEMA.md`
2. Verificar TODOs pendentes
3. Garantir servidor rodando
4. Limpar cache do browser

### Durante os Testes
1. Capturar screenshots importantes
2. Anotar bugs e melhorias
3. Atualizar TODOs em tempo real
4. Documentar descobertas

### Ao Final da Sessão
1. Atualizar documentos de progresso
2. Consolidar findings
3. Priorizar próximos passos
4. Commit de todas as mudanças

---

**Preparado por**: Lia (AI Code Agent)  
**Data**: 12 de outubro de 2025  
**Versão**: 1.0  
**Status**: ✅ Pronto para uso!

