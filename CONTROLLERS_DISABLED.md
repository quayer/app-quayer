# ⚠️ CONTROLLERS DESABILITADOS TEMPORARIAMENTE

**Data:** 2025-10-19
**Motivo:** Uso de API antiga `defineController` que não existe mais no Igniter.js

---

## 📋 CONTROLLERS DESABILITADOS

### 1. Connections Feature (3 controllers)

**Localização:** `src/features/connections/controllers/`

#### ❌ connections.controller.ts
- **Linha:** 20
- **Problema:** `import { defineController } from '@igniter-js/core/controller'`
- **Exportado em:** `src/features/connections/index.ts` (comentado)
- **Registrado em:** `src/igniter.router.ts` linha 59 (comentado)
- **Endpoints afetados:**
  - `POST /api/v1/connections` - Criar conexão
  - `GET /api/v1/connections` - Listar conexões
  - `GET /api/v1/connections/:id` - Buscar conexão
  - `PATCH /api/v1/connections/:id` - Atualizar conexão
  - `DELETE /api/v1/connections/:id` - Deletar conexão
  - `POST /api/v1/connections/:id/connect` - Conectar/obter QR
  - `POST /api/v1/connections/:id/disconnect` - Desconectar
  - `GET /api/v1/connections/:id/status` - Status
  - `POST /api/v1/connections/:id/restart` - Reiniciar

#### ❌ connection-messages.controller.ts
- **Linha:** 16
- **Problema:** `import { defineController } from '@igniter-js/core/controller'`
- **Exportado em:** `src/features/connections/index.ts` (comentado)
- **Registrado em:** `src/igniter.router.ts` linha 60 (comentado)
- **Endpoints afetados:**
  - `POST /api/v1/connection-messages/text` - Enviar mensagem texto
  - `POST /api/v1/connection-messages/media` - Enviar mensagem mídia
  - `POST /api/v1/connection-messages/template` - Enviar template WhatsApp
  - `POST /api/v1/connection-messages/buttons` - Enviar mensagem com botões
  - `POST /api/v1/connection-messages/list` - Enviar mensagem com lista
  - `POST /api/v1/connection-messages/contact/check` - Verificar contato

#### ❌ connections-realtime.controller.ts
- **Linha:** 16
- **Problema:** `import { defineController } from '@igniter-js/core/controller'`
- **Exportado em:** `src/features/connections/index.ts` (comentado)
- **Registrado em:** `src/igniter.router.ts` linha 61 (comentado)
- **Endpoints afetados:**
  - SSE endpoints para updates em tempo real de conexões

### 2. Webhooks Feature (2 controllers)

**Localização:** `src/features/webhooks/controllers/`

#### ❌ uazapi-webhooks.controller.ts
- **Linha:** 18
- **Problema:** `import { defineController } from '@igniter-js/core/controller'`
- **Exportado em:** `src/features/webhooks/index.ts` (comentado)
- **Registrado em:** `src/igniter.router.ts` linha 61 (comentado)
- **Endpoints afetados:**
  - `POST /api/v1/uazapi-webhooks/message` - Receber mensagens UAZapi
  - Outros endpoints UAZapi

#### ❌ uazapi-webhooks-enhanced.controller.ts
- **Linha:** 17
- **Problema:** `import { defineController} from '@igniter-js/core/controller'`
- **Exportado em:** `src/features/webhooks/index.ts` (comentado)
- **Registrado em:** `src/igniter.router.ts` linha 62 (comentado)
- **Endpoints afetados:**
  - Versão melhorada dos webhooks UAZapi
  - Processamento de transcrição
  - Concatenação de mensagens

---

## 🔧 COMO MIGRAR PARA igniter.controller()

### Estrutura Antiga (❌ NÃO FUNCIONA)

```typescript
import { defineController } from '@igniter-js/core/controller'

export const myController = defineController({
  create: {
    method: 'POST',
    path: '/mypath',
    schema: {
      body: MySchema,
    },
    handler: async ({ body, context }) => {
      // ...
    }
  }
})
```

### Estrutura Nova (✅ CORRETA)

```typescript
import { igniter } from '@/igniter'
import { z } from 'zod'

export const myController = igniter.controller({
  name: 'my-controller',
  path: '/mypath',
  actions: {
    create: igniter.mutation({
      path: '/',
      method: 'POST',
      body: MySchema,
      handler: async ({ request, response, context }) => {
        const { body } = request

        // ... lógica ...

        return response.success(data)
      }
    })
  }
})
```

### Principais Diferenças:

1. **Import:**
   - ❌ `import { defineController } from '@igniter-js/core/controller'`
   - ✅ `import { igniter } from '@/igniter'`

2. **Definição do Controller:**
   - ❌ `defineController({ action: { ... } })`
   - ✅ `igniter.controller({ name, path, actions: { ... } })`

3. **Actions:**
   - ❌ Objeto direto: `create: { method, path, schema, handler }`
   - ✅ igniter.mutation/query: `create: igniter.mutation({ path, method, body, handler })`

4. **Handler Params:**
   - ❌ `{ body, params, context }`
   - ✅ `{ request, response, context }` onde `request` contém `body`, `params`, `query`

5. **Response:**
   - ❌ `return data` ou `throw new Error()`
   - ✅ `return response.success(data)`, `response.error()`, `response.notFound()`, etc.

---

## 📝 CHECKLIST DE MIGRAÇÃO

Para cada controller desabilitado:

- [ ] Trocar import de `defineController` para `igniter`
- [ ] Adicionar `name` e `path` ao controller
- [ ] Envolver actions em objeto `actions: {}`
- [ ] Converter cada action para `igniter.mutation()` ou `igniter.query()`
- [ ] Atualizar estrutura de params do handler
- [ ] Atualizar responses para usar `response.success()`, `response.error()`, etc.
- [ ] Mover `schema.body` para `body` direto
- [ ] Mover `schema.params` para `params` direto
- [ ] Mover `schema.query` para `query` direto
- [ ] Testar endpoint após migração
- [ ] Remover comentários em `index.ts`
- [ ] Remover comentários em `igniter.router.ts`

---

## ⚠️ IMPACTO NO SISTEMA

### Features Afetadas:

1. **Connections (Integrações):**
   - ❌ Não é possível criar novas conexões
   - ❌ Não é possível listar conexões
   - ❌ Não é possível gerar QR codes
   - ❌ Não é possível enviar mensagens diretas

2. **Webhooks UAZapi:**
   - ❌ Não está recebendo webhooks do UAZapi
   - ❌ Transcrição de áudio/vídeo não funciona
   - ❌ Concatenação de mensagens não funciona

### Features NÃO Afetadas:

- ✅ Authentication (login/logout/registro)
- ✅ Organizations (listar/trocar)
- ✅ Dashboard
- ✅ CRM (contatos, kanban, etc.)
- ✅ Messages (via sessions existentes)
- ✅ Onboarding
- ✅ Invitations
- ✅ Analytics (novo endpoint criado)

---

## 🎯 PRIORIDADE DE MIGRAÇÃO

### Alta Prioridade (Funcionalidades Críticas):
1. **connections.controller.ts** - Gerenciamento de integrações
2. **uazapi-webhooks-enhanced.controller.ts** - Recebimento de webhooks

### Média Prioridade:
3. **connection-messages.controller.ts** - Envio direto de mensagens
4. **connections-realtime.controller.ts** - Updates em tempo real

### Baixa Prioridade:
5. **uazapi-webhooks.controller.ts** - Versão antiga dos webhooks (substituído pelo enhanced)

---

## 📊 ESTIMATIVA DE ESFORÇO

| Controller | Complexidade | Linhas | Tempo Estimado |
|------------|--------------|--------|----------------|
| connections.controller.ts | Alta | ~800 | 4-6 horas |
| connection-messages.controller.ts | Alta | ~550 | 3-4 horas |
| connections-realtime.controller.ts | Média | ~200 | 2-3 horas |
| uazapi-webhooks-enhanced.controller.ts | Alta | ~500 | 3-4 horas |
| uazapi-webhooks.controller.ts | Média | ~300 | 2-3 horas |

**Total Estimado:** 14-20 horas de trabalho

---

## ✅ SERVIDOR FUNCIONANDO

Apesar dos controllers desabilitados, o servidor está **FUNCIONAL**:

- ✅ Next.js compilando com sucesso
- ✅ Página de login carregando (GET /login 200)
- ✅ Endpoints restantes funcionando
- ⚠️ Alguns warnings de runtime (rate-limit, SSE channels)

**URLs Disponíveis:**
- Local: http://localhost:3000
- Network: http://192.168.15.5:3000

---

**Status:** Documentado em 2025-10-19
**Próximo Passo:** Migrar controllers seguindo a checklist acima
