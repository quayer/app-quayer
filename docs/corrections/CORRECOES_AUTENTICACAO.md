# 🔧 Correções de Autenticação Implementadas

**Data**: 2025-10-12
**Agente**: Lia AI
**Issues**: Erro OTP login admin + Erro páginas após login Google

---

## 🎯 Problemas Identificados

### 1. Erro de OTP no Login Admin
**Sintoma**: `Error: OTP verification error: {}`

**Causa**: Tratamento inadequado de erros no componente `login-otp-form.tsx`. O objeto de erro estava vazio porque não havia fallback para múltiplas estruturas de erro.

### 2. Páginas Dão Erro Após Login Google
**Sintoma**:
```
Erro ao carregar integrações
Erro ao carregar conversas
Erro ao carregar dados: Erro desconhecido
```

**Causa**:
- Hook `useInstances` não tratava erros explicitamente
- Token no cookie pode estar URL encoded e não estava sendo decodificado
- Falta de retry strategy e error messages claros

---

## ✅ Correções Implementadas

### 1. **login-otp-form.tsx** (Linhas 100-124)

**Mudança**: Melhor tratamento de múltiplas estruturas de erro

```typescript
// ANTES:
catch (err: any) {
  console.error("OTP verification error:", err)
  let errorMessage = "Erro ao verificar código. Tente novamente."

  if (err?.error?.details && Array.isArray(err.error.details)) {
    errorMessage = err.error.details[0].message || errorMessage
  } else if (err?.error?.message) {
    errorMessage = err.error.message
  } else if (err?.message) {
    errorMessage = err.message
  }

  setError(errorMessage)
}

// DEPOIS:
catch (err: any) {
  // Log completo do erro para debug
  console.error("OTP verification error:", err)
  console.error("Error structure:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2))

  let errorMessage = "Erro ao verificar código. Tente novamente."

  // Tentar múltiplas estruturas de erro possíveis
  if (err?.data?.error) {
    errorMessage = err.data.error
  } else if (err?.error?.details && Array.isArray(err.error.details)) {
    errorMessage = err.error.details[0].message || errorMessage
  } else if (err?.error?.message) {
    errorMessage = err.error.message
  } else if (err?.message) {
    errorMessage = err.message
  } else if (typeof err === 'string') {
    errorMessage = err
  } else if (err?.response?.data?.error) {
    errorMessage = err.response.data.error
  }

  setError(errorMessage)
  setIsLoading(false)
}
```

**Benefícios**:
- ✅ Log completo da estrutura do erro
- ✅ Suporte para múltiplos formatos de erro (API, fetch, Axios, etc)
- ✅ Fallback para string errors
- ✅ Mensagem de erro sempre visível ao usuário

---

### 2. **useInstance.ts** (Linhas 18-41)

**Mudança**: Error handling explícito + retry strategy

```typescript
// ANTES:
export function useInstances(options?) {
  const { enablePolling = true, ...queryOptions } = options || {}

  return useQuery({
    queryKey: ['instances', queryOptions],
    queryFn: async () => {
      const response = await api.instances.list.query()
      return response.data
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: enablePolling ? 10 * 1000 : false,
  })
}

// DEPOIS:
export function useInstances(options?) {
  const { enablePolling = true, ...queryOptions } = options || {}

  return useQuery({
    queryKey: ['instances', queryOptions],
    queryFn: async () => {
      const response = await api.instances.list.query()

      // Tratamento de erro explícito
      if (response.error) {
        console.error('Error loading instances:', response.error)
        throw new Error(response.error.message || 'Erro ao carregar integrações')
      }

      return response.data
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: enablePolling ? 10 * 1000 : false,
    retry: 2, // Tentar novamente 2 vezes antes de falhar
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  })
}
```

**Benefícios**:
- ✅ Error handling explícito antes de retornar dados
- ✅ Retry automático com exponential backoff
- ✅ Logs de erro para debug
- ✅ Mensagens de erro descritivas

---

### 3. **igniter.client.ts** (Linhas 39-66)

**Mudança**: Decodificação correta de tokens + logs de debug

```typescript
// ANTES:
fetch: async (url: string, options: RequestInit = {}) => {
  if (typeof window !== 'undefined') {
    let token = localStorage.getItem('accessToken')

    if (!token) {
      const cookies = document.cookie.split(';')
      const accessTokenCookie = cookies.find(c => c.trim().startsWith('accessToken='))
      if (accessTokenCookie) {
        token = accessTokenCookie.split('=')[1]
      }
    }

    if (token) {
      const headers = new Headers(options.headers)
      headers.set('Authorization', `Bearer ${token}`)
      options.headers = headers
    }
  }

  return fetch(url, options)
}

// DEPOIS:
fetch: async (url: string, options: RequestInit = {}) => {
  if (typeof window !== 'undefined') {
    let token = localStorage.getItem('accessToken')

    if (!token) {
      const cookies = document.cookie.split(';')
      const accessTokenCookie = cookies.find(c => c.trim().startsWith('accessToken='))
      if (accessTokenCookie) {
        // Decodificar o token do cookie (pode estar URL encoded)
        const encodedToken = accessTokenCookie.split('=')[1]
        token = decodeURIComponent(encodedToken)
      }
    }

    if (token) {
      const headers = new Headers(options.headers)
      headers.set('Authorization', `Bearer ${token}`)
      options.headers = headers
    } else {
      console.warn('Igniter Client: No access token found in localStorage or cookies')
    }
  }

  return fetch(url, options)
}
```

**Benefícios**:
- ✅ Decodificação correta de tokens URL encoded
- ✅ Warning quando token não encontrado (facilita debug)
- ✅ Funciona com tokens do localStorage E cookies

---

### 4. **integracoes/page.tsx** (Linhas 102-125)

**Mudança**: Melhor UI para estados de erro

```typescript
// ANTES:
if (error) {
  return (
    <div className="p-6">
      <Alert variant="destructive">
        <AlertDescription>
          Erro ao carregar integrações: {error.message}
        </AlertDescription>
      </Alert>
    </div>
  )
}

// DEPOIS:
if (error) {
  console.error('Error loading integrations page:', error)

  return (
    <div className="p-6 space-y-4">
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar integrações: {error.message || 'Erro desconhecido'}
        </AlertDescription>
      </Alert>

      <div className="flex gap-2">
        <Button onClick={() => refetch()} variant="outline">
          <Phone className="mr-2 h-4 w-4" />
          Tentar Novamente
        </Button>
        <Button onClick={() => window.location.href = '/login'} variant="ghost">
          Voltar ao Login
        </Button>
      </div>
    </div>
  )
}
```

**Benefícios**:
- ✅ Botão "Tentar Novamente" para retry manual
- ✅ Botão "Voltar ao Login" caso seja erro de autenticação
- ✅ Ícone visual para melhor UX
- ✅ Fallback para "Erro desconhecido"

---

## 🧪 Como Testar

### Teste 1: Login OTP Admin

```bash
# 1. Acesse http://localhost:3000/login
# 2. Digite: admin@quayer.com
# 3. Clique em "Continuar com Email"
# 4. Vá para /login/verify
# 5. Digite um código INVÁLIDO: 000000
# 6. RESULTADO ESPERADO: Mensagem de erro CLARA (não vazia)
# 7. Verifique o console: deve mostrar estrutura completa do erro
```

### Teste 2: Login Google

```bash
# 1. Acesse http://localhost:3000/login
# 2. Clique em "Continuar com Google"
# 3. Complete o fluxo OAuth
# 4. RESULTADO ESPERADO: Redirecionar para /integracoes ou /admin
# 5. Página deve carregar integrações SEM ERROS
# 6. Se houver erro, deve aparecer botão "Tentar Novamente"
```

### Teste 3: Página Integrações sem Token

```bash
# 1. Abra DevTools > Application > Storage
# 2. Delete localStorage.accessToken
# 3. Delete cookie accessToken
# 4. Acesse http://localhost:3000/integracoes
# 5. RESULTADO ESPERADO:
#    - Console warning: "No access token found"
#    - Erro na página com botão "Voltar ao Login"
```

---

## 📊 Estrutura de Erro do Igniter.js

Para referência futura, a estrutura de resposta do Igniter.js é:

```typescript
// SUCESSO
{
  data: {
    data: [...],      // Dados reais
    meta: { ... }     // Metadados opcionais
  },
  error: null
}

// ERRO
{
  data: null,
  error: {
    message: "Mensagem do erro",
    details: [
      { message: "Detalhe específico", field: "campo" }
    ]
  }
}
```

---

## 🔍 Debugging Tips

### Ver estrutura completa de erro:
```typescript
console.error("Error structure:", JSON.stringify(err, Object.getOwnPropertyNames(err), 2))
```

### Ver tokens no navegador:
```javascript
// Console do navegador
console.log('localStorage:', localStorage.getItem('accessToken'))
console.log('cookie:', document.cookie)
```

### Ver requests do Igniter Client:
```javascript
// Adicionar no igniter.client.ts antes do fetch
console.log('Igniter Request:', { url, headers: options.headers })
```

---

## ✨ Próximos Passos (Opcional)

1. **Error Boundary Global**: Criar um error boundary React para capturar erros não tratados
2. **Toast Notifications**: Usar toast para erros transientes ao invés de alerts
3. **Offline Detection**: Detectar quando usuário está offline e mostrar mensagem apropriada
4. **Token Refresh Automático**: Implementar refresh automático quando access token expirar
5. **Sentry Integration**: Enviar erros para Sentry para monitoramento em produção

---

**Status**: ✅ Correções Implementadas e Prontas para Teste
**Arquivos Modificados**: 4
**Linhas Alteradas**: ~80
**Breaking Changes**: Nenhum
