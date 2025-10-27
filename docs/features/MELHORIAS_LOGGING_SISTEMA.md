# 🔧 MELHORIAS NO SISTEMA DE LOGGING E TRATAMENTO DE ERROS

**Data:** 2025-10-18
**Solicitado por:** Usuário
**Implementado por:** Lia AI Agent

---

## 📋 OBJETIVO

Melhorar o sistema de logging para:
1. **Desenvolvedores:** Informações técnicas detalhadas para debug
2. **Usuários:** Mensagens claras e acionáveis na interface
3. **Lia (futuro):** Logs estruturados para análise e aprendizado

---

## ✅ IMPLEMENTAÇÕES REALIZADAS

### 1. Enhanced Logger System
**Arquivo:** `src/lib/logging/enhanced-logger.ts`

**Funcionalidades:**
- ✅ Logging estruturado com contexto rico
- ✅ Níveis de log: DEBUG, INFO, WARN, ERROR, FATAL
- ✅ Request tracing com requestId
- ✅ Separação de mensagens técnicas vs mensagens para usuário
- ✅ Performance tracking
- ✅ Query logging (development only)
- ✅ API request/response logging

**Exemplo de uso:**
```typescript
import { enhancedLogger, errors } from '@/lib/logging/enhanced-logger'

// Log simples
enhancedLogger.info('User logged in', {
  userId: user.id,
  organizationId: user.currentOrgId,
  feature: 'auth',
  action: 'login'
})

// Log de erro com mensagem para usuário
try {
  await database.query(...)
} catch (error) {
  const dbError = errors.database('query')
  enhancedLogger.error(dbError, {
    userId: user.id,
    feature: 'contacts',
    action: 'list',
    metadata: { query: 'SELECT * FROM Contact' }
  })
  throw dbError // Usuário verá mensagem amigável
}

// Log de performance
const start = Date.now()
const result = await heavyOperation()
enhancedLogger.performance('Heavy Operation', Date.now() - start)
```

**Estrutura de log:**
```json
{
  "timestamp": "2025-10-18T16:20:00.000Z",
  "level": "error",
  "message": "Database query failed",
  "requestId": "req-123",
  "userId": "user-456",
  "organizationId": "org-789",
  "feature": "contacts",
  "action": "list",
  "metadata": {
    "stack": "Error: ...",
    "code": "DATABASE_ERROR",
    "statusCode": 500,
    "details": {...}
  }
}
```

---

### 2. Global Error Handler
**Arquivo:** `src/app/global-error.tsx`

**Funcionalidades:**
- ✅ Captura TODOS os erros não tratados
- ✅ Exibe mensagem amigável para usuário
- ✅ Mostra detalhes técnicos em development
- ✅ Botões de ação: "Tentar Novamente" e "Ir para Início"
- ✅ Dicas de troubleshooting
- ✅ Preparado para integração com Sentry (futuro)

**Interface visual:**
```
┌─────────────────────────────────────────┐
│  ⚠️  Algo deu errado                    │
│                                         │
│  Ocorreu um erro inesperado na          │
│  aplicação. Nossa equipe foi            │
│  notificada...                          │
│                                         │
│  [▼ Detalhes técnicos (dev only)]       │
│                                         │
│  [🔄 Tentar Novamente] [🏠 Ir para Início] │
│                                         │
│  Dicas de solução:                      │
│  • Recarregue a página                  │
│  • Limpe o cache                        │
│  • Verifique sua internet               │
└─────────────────────────────────────────┘
```

---

### 3. Error Display Components
**Arquivo:** `src/components/ui/error-display.tsx`

**Componentes criados:**

#### `<ErrorDisplay />`
Exibição genérica de erros com ações

```tsx
<ErrorDisplay
  title="Erro ao carregar dados"
  message="Não foi possível carregar as conversas"
  description="Tente novamente ou volte para a página anterior."
  onRetry={() => refetch()}
  onGoBack={() => router.back()}
  error={error} // Mostra stack em dev
/>
```

#### `<DatabaseErrorDisplay />`
Erro específico de database com instruções

```tsx
<DatabaseErrorDisplay onRetry={() => reconnect()} />
```

**Exibe:**
- Ícone de database
- Mensagem: "Não foi possível conectar ao banco de dados"
- **Passos para resolver:**
  1. Verifique se Docker Desktop está rodando
  2. Execute: `docker-compose up -d`
  3. Verifique logs: `docker-compose logs postgres`
- Botão "Tentar Conectar Novamente"

#### `<NetworkErrorDisplay />`
Erro de rede/API

```tsx
<NetworkErrorDisplay onRetry={() => retry()} />
```

#### `<ValidationErrorDisplay />`
Erros de validação de formulários

```tsx
<ValidationErrorDisplay
  errors={{
    email: "Email inválido",
    password: "Senha deve ter no mínimo 8 caracteres"
  }}
/>
```

#### `<EmptyState />`
Estado vazio (não é erro, mas útil)

```tsx
<EmptyState
  icon={MessageSquare}
  title="Nenhuma conversa"
  description="Você ainda não tem conversas. Comece uma nova!"
  action={<Button>Nova Conversa</Button>}
/>
```

---

### 4. Error Creators (Helpers)
**Facilita criação de erros padronizados**

```typescript
import { errors } from '@/lib/logging/enhanced-logger'

// Não encontrado (404)
throw errors.notFound('Contato')
// → Usuário vê: "Contato não encontrado. Verifique se o ID está correto."

// Não autorizado (401)
throw errors.unauthorized()
// → Usuário vê: "Você não tem permissão para acessar este recurso."

// Proibido (403)
throw errors.forbidden()
// → Usuário vê: "Acesso negado. Você não tem as permissões necessárias."

// Validação (400)
throw errors.validation({ email: 'invalid', password: 'too short' })
// → Usuário vê: "Dados inválidos. Verifique os campos e tente novamente."

// Database (500)
throw errors.database('insert')
// → Usuário vê: "Erro ao acessar o banco de dados. Tente novamente..."

// Serviço externo (502)
throw errors.external('UAZAPI')
// → Usuário vê: "Erro ao comunicar com UAZAPI. O serviço pode estar..."

// Rate limit (429)
throw errors.rateLimit()
// → Usuário vê: "Muitas requisições. Aguarde alguns instantes..."
```

---

## 🎯 COMO USAR

### Em Controllers (API)
```typescript
import { enhancedLogger, errors } from '@/lib/logging/enhanced-logger'

export const contactsController = igniter.controller({
  name: 'contacts',
  path: '/contacts',
  actions: {
    list: igniter.query({
      use: [authProcedure],
      input: z.object({
        page: z.number().optional(),
      }),
      handler: async ({ input, context }) => {
        const startTime = Date.now()

        try {
          enhancedLogger.info('Fetching contacts', {
            userId: context.user.id,
            organizationId: context.user.currentOrgId,
            feature: 'contacts',
            action: 'list',
            metadata: { page: input.page }
          })

          const contacts = await context.features.contacts.repository.findMany({
            where: { organizationId: context.user.currentOrgId },
            skip: (input.page || 0) * 20,
            take: 20,
          })

          enhancedLogger.performance(
            'Contacts list query',
            Date.now() - startTime,
            { userId: context.user.id }
          )

          return success(contacts)
        } catch (error) {
          enhancedLogger.error(errors.database('query'), {
            userId: context.user.id,
            feature: 'contacts',
            action: 'list',
            metadata: { originalError: error }
          })

          throw errors.database('query')
        }
      }
    })
  }
})
```

### Em Components (Frontend)
```tsx
'use client'

import { useState } from 'react'
import { api } from '@/igniter.client'
import { DatabaseErrorDisplay, ErrorDisplay } from '@/components/ui/error-display'

export function ContactsList() {
  const { data, error, isLoading, refetch } = api.contacts.list.useQuery({
    input: { body: { page: 0 } }
  })

  if (isLoading) return <div>Carregando...</div>

  // Erro específico de database
  if (error?.message.includes('database')) {
    return <DatabaseErrorDisplay onRetry={() => refetch()} />
  }

  // Erro genérico
  if (error) {
    return (
      <ErrorDisplay
        title="Erro ao carregar contatos"
        message="Não foi possível carregar a lista de contatos"
        error={error}
        onRetry={() => refetch()}
        onGoBack={() => router.back()}
      />
    )
  }

  return (
    <div>
      {data?.map(contact => (
        <ContactCard key={contact.id} contact={contact} />
      ))}
    </div>
  )
}
```

---

## 📊 BENEFÍCIOS

### Para Desenvolvedores
✅ Logs estruturados e pesquisáveis
✅ Context rico (userId, orgId, feature, action)
✅ Request tracing com requestId
✅ Stack traces em development
✅ Performance metrics automáticos
✅ Query logging para debug

### Para Usuários
✅ Mensagens claras em português
✅ Instruções acionáveis ("faça X, Y, Z")
✅ Botões de ação (tentar novamente, voltar)
✅ Sem jargão técnico
✅ Dicas de troubleshooting

### Para Lia (Futuro)
✅ Logs estruturados em JSON
✅ Metadata rica para análise
✅ Padrões de erro identificáveis
✅ Performance tracking para otimização
✅ Preparado para machine learning

---

## 🚀 PRÓXIMOS PASSOS (Futuro)

### Curto prazo:
1. Integrar enhanced logger em todos os controllers existentes
2. Substituir console.log por enhancedLogger
3. Adicionar error displays em todas as páginas críticas

### Médio prazo:
4. Integrar com Sentry ou similar (error tracking)
5. Criar dashboard de logs/erros
6. Adicionar alertas automáticos para erros críticos

### Longo prazo:
7. Machine learning para análise de padrões de erro
8. Auto-correção de problemas comuns
9. Telemetria avançada para Lia aprender com erros

---

## 📁 ARQUIVOS CRIADOS

1. **`src/lib/logging/enhanced-logger.ts`**
   - Sistema de logging estruturado
   - Error creators
   - Performance tracking

2. **`src/app/global-error.tsx`**
   - Error boundary global
   - Mensagens amigáveis
   - Troubleshooting tips

3. **`src/components/ui/error-display.tsx`**
   - Componentes de erro reutilizáveis
   - Database, Network, Validation errors
   - Empty states

4. **`MELHORIAS_LOGGING_SISTEMA.md`** (este arquivo)
   - Documentação completa
   - Exemplos de uso
   - Guia de implementação

---

## ✅ STATUS

**Sistema de logging melhorado:** ✅ COMPLETO
**Componentes de erro:** ✅ COMPLETO
**Documentação:** ✅ COMPLETO
**Integração nos controllers:** ⏳ PENDENTE (próximo passo)

---

**Implementado por Lia AI Agent**
**Feedback do usuário:** "precisa melhorar esse tratamento [de logs] para voce mesmo no futuro e também na tela do usuario"
**Status:** ✅ IMPLEMENTADO
