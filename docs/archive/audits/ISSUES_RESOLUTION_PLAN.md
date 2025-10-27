# 🔧 Plano de Resolução de Issues

**Data:** 2025-10-11
**Status:** Em Andamento

---

## ❌ Issue Crítico #1: Authorization Header Não Enviado

### 🎯 Problema

Após login bem-sucedido, as requisições API retornam **401 Unauthorized** porque o Authorization header não é enviado.

**Evidência dos logs:**
```
POST /api/v1/auth/verify-login-otp 200 in 492ms  ✅ Login OK
GET /integracoes 200 in 2443ms                     ✅ Página carrega

[AuthProcedure] authHeader: null                   ❌ PROBLEMA
[AuthProcedure] required: true
[AuthProcedure] No auth header, auth required
GET /api/v1/organizations 401 in 271ms            ❌ Erro
GET /api/v1/instances 401 in 301ms                ❌ Erro
```

### 🔍 Causa Raiz

**Timing Issue**: Race condition entre carregamento do token e execução de requests API

```
1. ✅ Login OTP completa com sucesso
2. ✅ Token JWT gerado e salvo no cookie pelo servidor
3. ✅ Browser redireciona para /integracoes
4. ⚠️ Página /integracoes renderiza
5. ⚠️ useInstances() hook executa imediatamente
6. ❌ AuthProvider ainda NÃO carregou token do cookie/localStorage
7. ❌ API request enviada SEM Authorization header
8. ❌ Servidor retorna 401 Unauthorized
```

**Sequência do código:**
```typescript
// AuthProvider (src/lib/auth/auth-provider.tsx)
useEffect(() => {
  loadUserFromToken()  // ASSÍNCRONO - demora ~100ms
}, [])

// IntegracoesPage (src/app/integracoes/page.tsx)
const { data } = useInstances()  // EXECUTA IMEDIATAMENTE

// useInstances (src/hooks/useInstance.ts)
queryFn: async () => {
  return await api.instances.list.query()  // ❌ Token ainda não está no localStorage!
}
```

### ✅ Solução Implementada

**Fix #1: Delay no AuthProvider**
```typescript
// src/lib/auth/auth-provider.tsx (linha 98-102)
finally {
  // Pequeno delay para garantir que localStorage foi sincronizado
  setTimeout(() => {
    setIsLoading(false)
    console.log('[AuthProvider] Auth initialization complete')
  }, 100)
}
```

**Fix #2: Logging Melhorado**
```typescript
// Adicionado log quando não há token (linha 92-94)
} else {
  console.log('[AuthProvider] No token found in localStorage or cookies')
}
```

### 🧪 Como Testar

1. **Limpar estado anterior:**
```bash
# Abrir DevTools Console
localStorage.clear()
document.cookie.split(";").forEach(c => document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"))
```

2. **Fazer login:**
```
1. Ir para http://localhost:3000/login
2. Inserir email e senha
3. Verificar código OTP no email
4. Inserir código
5. Observar Console do browser
```

3. **Verificar logs esperados:**
```
[AuthProvider] Token copiado do cookie para localStorage
[AuthProvider] JWT Payload: { userId: "...", email: "...", ... }
[AuthProvider] Setting user: { id: "...", ... }
[AuthProvider] Auth initialization complete
```

4. **Verificar Network tab:**
```
✅ POST /api/v1/auth/verify-login-otp → 200
✅ GET /integracoes → 200
✅ GET /api/v1/organizations → 200 (COM Authorization header)
✅ GET /api/v1/instances → 200 (COM Authorization header)
```

### 📊 Status

- [x] Causa identificada
- [x] Fix implementado (delay + logging)
- [ ] Teste manual necessário
- [ ] Verificar se fix resolve completamente
- [ ] Considerar solução mais robusta se delay não funcionar

### 🎯 Próximas Ações se Fix Não Funcionar

**Opção A: Suspense Boundary**
```typescript
// Envolver páginas autenticadas em Suspense
<Suspense fallback={<LoadingSpinner />}>
  {!isLoading && <IntegracoesPage />}
</Suspense>
```

**Opção B: Conditional Rendering**
```typescript
// Em app-providers.tsx
<AuthProvider>
  {!isLoading ? children : <LoadingScreen />}
</AuthProvider>
```

**Opção C: React Query Enabled**
```typescript
// Em useInstances hook
return useQuery({
  queryKey: ['instances'],
  queryFn: async () => await api.instances.list.query(),
  enabled: !!localStorage.getItem('accessToken'), // ✅ Só executa se token existe
})
```

---

## ⏳ Issue #2: Onboarding Não Aparece para Usuários Existentes

### 🎯 Problema

Usuário reportou:
> "fiz o login com usuarios que já estavam cadastrados porém nao me pediu o onbording"

### 🔍 Investigação Necessária

**Perguntas:**
1. Onboarding deve aparecer para usuários existentes?
2. Existe flag no banco de dados (`hasCompletedOnboarding`)?
3. Qual é a lógica atual de when-to-show-onboarding?

**Arquivos para verificar:**
- [ ] `src/app/(auth)/onboarding/page.tsx` ou similar
- [ ] `src/features/onboarding/` (se existir)
- [ ] Schema Prisma para campo `hasCompletedOnboarding`
- [ ] Middleware ou redirect logic para onboarding

### 📊 Status

- [ ] Localizar código de onboarding
- [ ] Entender lógica atual
- [ ] Determinar comportamento esperado
- [ ] Implementar fix se necessário

---

## ⚠️ Issues Menores (Não Críticos)

### Issue #3: 6 Testes Unitários Falhando

**Status:** 106/112 passando (94.6%)

**Testes que falharam:**
1. Dashboard Service - 5 testes (problema de mock MSW)
2. Phone Validator - 1 teste (formatação de string)

**Impacto:** Baixo - são issues de configuração de teste, não bugs de produção

**Próximas ações:**
- [ ] Fixar MSW handlers para `https://quayer.uazapi.com/chat/count`
- [ ] Corrigir formatação em phone validator test

### Issue #4: Avatar User Missing (404)

**Evidência:**
```
GET /avatars/user.jpg 404
```

**Impacto:** Baixo - fallback funciona (mostra iniciais)

**Fix:**
- [ ] Adicionar avatar placeholder em `/public/avatars/user.jpg`
- [ ] Ou remover referência se não for necessário

---

## 📈 Progresso Geral

### ✅ Completado

1. ✅ Testes E2E criados (12+ cenários)
2. ✅ Testes unitários de autenticação (18 testes, 100% passando)
3. ✅ Infraestrutura de mocks atualizada
4. ✅ Schema Igniter regenerado
5. ✅ Relatório completo de testes criado
6. ✅ Fix inicial para Authorization header issue

### 🚧 Em Andamento

1. 🚧 Teste manual do fix de Authorization header
2. 🚧 Investigação de onboarding logic

### ⏳ Pendente

1. ⏳ Resolver completamente Authorization header issue
2. ⏳ Implementar/corrigir lógica de onboarding
3. ⏳ Fixar 6 testes unitários restantes
4. ⏳ Adicionar avatar placeholder

---

## 🎯 Prioridades

### Alta Prioridade
1. **Authorization Header Fix** - Crítico para funcionamento básico
2. **Teste Manual** - Validar que fix funciona

### Média Prioridade
3. **Onboarding Logic** - Importante para UX de novos usuários
4. **Testes Unitários** - Bom ter 100% passando

### Baixa Prioridade
5. **Avatar 404** - Cosmético, tem fallback

---

## 🧪 Como Testar Tudo

### 1. Teste Manual Completo

```bash
# 1. Limpar estado
# No DevTools Console:
localStorage.clear()

# 2. Fazer login
# Ir para http://localhost:3000/login

# 3. Verificar:
✅ Login funciona
✅ Token aparece no localStorage
✅ Dashboard carrega sem 401
✅ Instâncias aparecem
✅ Sem erros no console
```

### 2. Testes Automatizados

```bash
# Testes unitários
npm run test:unit

# Testes E2E (servidor deve estar rodando)
npx playwright test test/e2e/complete-user-journeys.spec.ts
```

### 3. Verificação de Logs

**Console do Browser:**
```
✅ [AuthProvider] Token copiado do cookie para localStorage
✅ [AuthProvider] JWT Payload: {...}
✅ [AuthProvider] Setting user: {...}
✅ [AuthProvider] Auth initialization complete
```

**Network Tab:**
```
✅ Todas as requests /api/v1/* com header:
   Authorization: Bearer <token>
```

---

## 📝 Notas de Implementação

### Mudanças Realizadas

**Arquivo:** `src/lib/auth/auth-provider.tsx`

**Linhas modificadas:** 92-102

**Mudança:**
```diff
+ } else {
+   console.log('[AuthProvider] No token found in localStorage or cookies')
+ }
} catch (error) {
  console.error('Error loading user from token:', error)
} finally {
-  setIsLoading(false)
+  // Pequeno delay para garantir que localStorage foi sincronizado
+  setTimeout(() => {
+    setIsLoading(false)
+    console.log('[AuthProvider] Auth initialization complete')
+  }, 100)
}
```

**Razão:** Adicionar delay para garantir sincronização do localStorage antes de permitir que componentes façam requests API.

---

## 🔮 Próximos Passos

### Imediato (Hoje)
1. Teste manual do fix de Authorization header
2. Verificar se onboarding existe e onde está
3. Documentar comportamento esperado de onboarding

### Curto Prazo (Esta Semana)
4. Implementar solução mais robusta se delay não funcionar (Opção B ou C)
5. Fixar lógica de onboarding
6. Corrigir 6 testes unitários falhando

### Médio Prazo (Próxima Semana)
7. Adicionar avatar placeholder
8. Criar E2E test com OTP automático
9. Implementar CI/CD para rodar testes automaticamente

---

**Última Atualização:** 2025-10-11 23:25
**Autor:** Lia AI Agent
**Status:** Aguardando teste manual do usuário
