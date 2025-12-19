# Análise Completa do Sistema Quayer

> **Data**: 2025-12-19
> **Versão**: 1.0
> **Autor**: Análise automatizada por Lia AI

---

## Sumário

1. [Resumo Executivo](#1-resumo-executivo)
2. [Análise Frontend - Páginas Admin](#2-análise-frontend---páginas-admin)
3. [Análise Frontend - Páginas Master](#3-análise-frontend---páginas-master)
4. [Análise Backend - Controllers](#4-análise-backend---controllers)
5. [Problemas Críticos Identificados](#5-problemas-críticos-identificados)
6. [Features Órfãs para Remoção](#6-features-órfãs-para-remoção)
7. [Plano de Ação Priorizado](#7-plano-de-ação-priorizado)
8. [Métricas do Sistema](#8-métricas-do-sistema)

---

## 1. Resumo Executivo

### Visão Geral

| Área | Total | Funcionais | Parciais | Problemáticos |
|------|-------|------------|----------|---------------|
| Páginas Admin | 15 | 12 (80%) | 2 (13%) | 1 (7%) |
| Páginas Master | 16 | 10 (63%) | 4 (25%) | 2 (12%) |
| Controllers Backend | 29 | 26 (90%) | 2 (7%) | 1 (3%) |
| Endpoints API | ~216 | ~200 (93%) | ~10 (5%) | ~6 (2%) |

### Principais Descobertas

- **2 features órfãs** identificadas para remoção (Labels, Departamentos)
- **2 vulnerabilidades de segurança** no backend
- **3 páginas com dados FAKE/Mock** no frontend
- **~60 type casts (`as any`)** indicando problemas de tipagem
- **1 feature inteira desabilitada** (connections module)

---

## 2. Análise Frontend - Páginas Admin

### 2.1 Inventário de Páginas

| # | Página | Caminho | Status |
|---|--------|---------|--------|
| 1 | Dashboard | `/admin` | ✅ OK |
| 2 | Layout | `/admin/layout.tsx` | ✅ OK |
| 3 | Organizations | `/admin/organizations` | ✅ OK |
| 4 | Webhooks | `/admin/webhooks` | ⚠️ Placeholders |
| 5 | Clients | `/admin/clients` | ✅ OK |
| 6 | Messages | `/admin/messages` | ✅ OK |
| 7 | Integrations | `/admin/integracoes` | ✅ OK |
| 8 | Permissions | `/admin/permissions` | ✅ OK |
| 9 | Settings | `/admin/settings` | ✅ OK |
| 10 | Logs | `/admin/logs` | ⚠️ Sequencial |
| 11 | Notifications | `/admin/notificacoes` | ✅ OK |
| 12 | Invitations | `/admin/invitations` | ✅ OK |

### 2.2 Problemas Identificados

#### A) Logs Page - Carregamento Sequencial
**Arquivo**: `src/app/admin/logs/page.tsx`
**Problema**: 3 APIs chamadas sequencialmente no `useEffect`
```typescript
useEffect(() => {
  loadLogs()    // Sequencial
  loadStats()   // Sequencial
  loadSources() // Sequencial
}, [...])
```
**Solução**: Usar `Promise.all([loadLogs(), loadStats(), loadSources()])`

#### B) Webhooks Page - Ações Placeholder
**Arquivo**: `src/app/admin/webhooks/page.tsx`
**Problema**: Menu dropdown com ações que não funcionam
- "Ver Detalhes" - ❌ Não implementado
- "Editar" - ❌ Não implementado
- "Testar Webhook" - ❌ Não implementado (backend também não tem)
- "Ativar/Desativar" - ❌ Não implementado
- "Excluir" - ❌ Não implementado

---

## 3. Análise Frontend - Páginas Master

### 3.1 Inventário de Páginas

| # | Página | Caminho | Tipo de Fetch | Status |
|---|--------|---------|---------------|--------|
| 1 | Dashboard WhatsApp | `/integracoes/dashboard` | `api.*.useQuery()` | ✅ OK |
| 2 | Instâncias WhatsApp | `/integracoes` | React Query Hooks | ✅ Excelente |
| 3 | Conversas WhatsApp | `/integracoes/conversations` | `api.*` + Promise.all | ✅ Excelente |
| 4 | Equipe/Usuários | `/integracoes/users` | `api.organizations.*` | ⚠️ Type casts |
| 5 | Settings Pessoais | `/integracoes/settings` | `api.auth.*` | ✅ OK |
| 6 | Settings Organização | `/integracoes/settings/organization` | Tabs + componentes | ✅ OK |
| 7 | Integrações (Providers) | `/integracoes/settings/organization/integrations` | Static data | ⚠️ Hardcoded |
| 8 | Contatos | `/contatos` | `api.contacts.*` | ✅ OK |
| 9 | Contato Detalhe | `/contatos/[id]` | Mock data | 🔴 FAKE |
| 10 | Conversas (Sessions) | `/conversas/[sessionId]` | `api.sessions.*` + SSE | ✅ OK |
| 11 | Labels | `/configuracoes/labels` | `fetch()` direto | 🗑️ REMOVER |
| 12 | Departamentos | `/configuracoes/departamentos` | `fetch()` direto | 🗑️ REMOVER |
| 13 | Webhooks (redirect) | `/configuracoes/webhooks` | Redirect only | ✅ OK |
| 14 | Ferramentas Hub | `/ferramentas` | Static | ✅ OK |
| 15 | Webhooks Config | `/ferramentas/webhooks` | `api.webhooks.*` | ⚠️ Type casts |
| 16 | Chatwoot Config | `/ferramentas/chatwoot` | `fetch()` direto | ⚠️ Sem Igniter |

### 3.2 Problemas Críticos

#### A) Contato Detalhe - MOCK DATA
**Arquivo**: `src/app/contatos/[id]/page.tsx`
```typescript
// Linhas ~47-60 - DADOS HARDCODED!
const contact = {
  id: '1',
  name: 'João Silva',
  phone: '+55 11 99999-9999',
  email: 'joao@exemplo.com',
  // ... TUDO FAKE
}
```
**Impacto**: Página não busca dados reais do backend

#### B) Dialogs de Mensagens - MUTATIONS FAKE
**Arquivos**:
- `src/app/integracoes/messages/send-message-dialog.tsx`
- `src/app/integracoes/messages/bulk-send-dialog.tsx`

```typescript
// TODO: Aguardando regeneração do schema com messages controller
const sendMessageMutation = { mutate: async () => {}, loading: false } as any
```
**Impacto**: Botões de envio não fazem nada

#### C) Providers Hardcoded
**Arquivo**: `src/app/integracoes/settings/organization/integrations/page.tsx`
```typescript
const MODEL_PROVIDERS = [
    { id: 'openai', connected: true, ... }, // MENTIRA - não verifica backend
]
```

---

## 4. Análise Backend - Controllers

### 4.1 Inventário de Controllers

| Controller | Endpoints | Auth | Cache | Status |
|------------|-----------|------|-------|--------|
| analytics | 2 | ✅ | ❌ | ⚠️ TODO |
| api-keys | 4 | ✅ | ❌ | ✅ OK |
| attributes | 7 | ✅ | ❌ | ✅ OK |
| auth | ~32 | ✅ | ❌ | ✅ OK |
| calls | 8 | ✅ | ❌ | ✅ OK |
| chatwoot | 6 | ✅ | ❌ | ✅ OK |
| chats | 7 | ✅ | ❌ | ✅ OK |
| contacts | 6 | ✅ | ❌ | ✅ OK |
| contact-attribute | 5 | ✅ | ❌ | ✅ OK |
| dashboard | 5 | ✅ | ❌ | ⚠️ Sem cache |
| departments | 7 | ✅ | ❌ | 🗑️ REMOVER |
| health | 6 | ❌ | ❌ | ⚠️ Reset sem auth |
| instances | 21 | ✅ | ✅ 30s | ✅ OK |
| invitations | 6 | ✅ | ❌ | ✅ OK |
| labels | 9 | ✅ | ❌ | 🗑️ REMOVER |
| logs | 7 | ✅ | ❌ | ✅ OK |
| logs-sse | 1 | ✅ | ❌ | ✅ OK |
| media | 2 | ✅ | ❌ | ✅ OK |
| messages | 8 | ✅ | ❌ | ✅ OK |
| notifications | 8 | ✅ | ❌ | ✅ OK |
| observations | 5 | ✅ | ❌ | ✅ OK |
| onboarding | 1 | ❌ | ❌ | 🔴 INSEGURO |
| organizations | 9 | ✅ | ❌ | ✅ OK |
| permissions | 7 | ✅ | ❌ | ✅ OK |
| sessions | 18 | ✅ | ✅ 30s | ✅ OK |
| sse | 2 | ✅ | ❌ | ⚠️ TODO |
| system-settings | 23 | ✅ admin | ❌ | ✅ OK |
| webhooks | 8 | ✅ | ❌ | ✅ OK |

### 4.2 TODOs e FIXMEs

| Arquivo | Problema | Severidade |
|---------|----------|------------|
| analytics.controller.ts:120 | `getEventsSummary` retorna placeholder | 🟡 Média |
| instances.controller.ts:1572 | `updateProfileImage` não implementado | 🟡 Média |
| organizations.controller.ts:112 | Email com senha temporária não enviado | 🟡 Média |
| webhooks.service.ts:18 | `message-sender` não implementado | 🔴 Alta |
| webhooks.service.ts:254 | Callback response não implementado | 🔴 Alta |
| sessions.controller.ts:1253 | Watchers não implementado | 🟢 Baixa |
| sse.controller.ts:112 | Unsubscribe não implementado | 🟡 Média |
| connections/index.ts:7 | Feature inteira desabilitada | 🔴 Alta |

### 4.3 Vulnerabilidades de Segurança

#### A) Onboarding - Header Forjável
**Arquivo**: `src/features/onboarding/controllers/onboarding.controller.ts`
```typescript
const userId = request.headers.get('x-user-id'); // ❌ INSEGURO!
```
**Risco**: Qualquer pessoa pode completar onboarding como outro usuário

#### B) Health - Reset Circuit Breaker sem Auth
**Arquivo**: `src/features/health/controllers/health.controller.ts:208`
```typescript
resetCircuit: igniter.mutation({
  // Sem authProcedure ou adminProcedure!
  handler: async ({ input, response }) => {
    storeCircuitBreaker.reset() // ❌ Qualquer um pode resetar
  }
})
```

---

## 5. Problemas Críticos Identificados

### 5.1 Segurança (CRÍTICO)

| # | Problema | Arquivo | Ação |
|---|----------|---------|------|
| 1 | Header `x-user-id` forjável | onboarding.controller.ts | Usar authProcedure |
| 2 | Reset circuit breaker público | health.controller.ts:208 | Adicionar adminProcedure |

### 5.2 Funcionalidade Quebrada (ALTO)

| # | Problema | Arquivo | Ação |
|---|----------|---------|------|
| 1 | Contato detalhe com mock data | contatos/[id]/page.tsx | Implementar fetch real |
| 2 | Send message mutation fake | send-message-dialog.tsx | Implementar mutation |
| 3 | Bulk send mutation fake | bulk-send-dialog.tsx | Implementar mutation |
| 4 | Webhooks admin sem ações | admin/webhooks/page.tsx | Implementar dropdown |
| 5 | Connections module desabilitado | connections/index.ts | Migrar ou remover |

### 5.3 Inconsistência de Arquitetura (MÉDIO)

| # | Problema | Arquivos Afetados | Ação |
|---|----------|-------------------|------|
| 1 | Páginas usando fetch() ao invés de Igniter | labels, departamentos, chatwoot | Migrar para api.* |
| 2 | ~60 type casts (as any) | Múltiplos controllers | Corrigir tipagens |
| 3 | Providers hardcoded | integrations/page.tsx | Criar API |

---

## 6. Features Órfãs para Remoção

### 6.1 Labels - REMOVER

#### Situação Atual
- **Model Prisma**: `Label` existe mas NÃO tem relação com nenhuma outra tabela
- **Frontend**: `/configuracoes/labels/page.tsx` - Usa fetch() manual
- **Backend**: `labels.controller.ts` - 9 endpoints funcionais mas inúteis
- **Uso Real**: ZERO - Ninguém usa

#### Motivo da Remoção
1. O model `Contact` já tem `tags: String[]` que funciona
2. Existe `Tabulation` com `ContactTabulation` que faz o mesmo trabalho
3. 3 sistemas de tags é duplicação desnecessária
4. Labels não está conectado a nada no Prisma

#### Arquivos para Deletar
```
src/app/configuracoes/labels/
├── page.tsx                          # DELETE

src/features/labels/
├── controllers/
│   └── labels.controller.ts          # DELETE
└── index.ts                          # DELETE (se existir)

prisma/schema.prisma
└── model Label { ... }               # DELETE (linhas 1030-1047)
```

#### Impacto
- **Endpoints removidos**: 9
- **Páginas removidas**: 1
- **Linhas de código**: ~500

---

### 6.2 Departamentos - REMOVER

#### Situação Atual
- **Model Prisma**: `Department` existe
- **Frontend**: `/configuracoes/departamentos/page.tsx` - Usa fetch() manual
- **Backend**: `departments.controller.ts` - 7 endpoints
- **Uso Real**: Baixo/Nenhum - Não há integração com atendimentos

#### Motivo da Remoção
1. Feature não está integrada com o sistema de sessões/atendimentos
2. Não há roteamento de conversas por departamento implementado
3. Não há relatórios por departamento
4. Complexidade sem valor agregado

#### Arquivos para Deletar
```
src/app/configuracoes/departamentos/
├── page.tsx                          # DELETE

src/features/departments/
├── controllers/
│   └── departments.controller.ts     # DELETE
└── index.ts                          # DELETE (se existir)

prisma/schema.prisma
└── model Department { ... }          # DELETE
```

#### Impacto
- **Endpoints removidos**: 7
- **Páginas removidas**: 1
- **Linhas de código**: ~400

---

## 7. Plano de Ação Priorizado

### Fase 1: Segurança (IMEDIATO)

| # | Tarefa | Arquivo | Esforço |
|---|--------|---------|---------|
| 1.1 | Corrigir onboarding para usar authProcedure | onboarding.controller.ts | 30min |
| 1.2 | Adicionar adminProcedure ao resetCircuit | health.controller.ts | 15min |

### Fase 2: Remoção de Features Órfãs (1-2 dias)

| # | Tarefa | Arquivos | Esforço |
|---|--------|----------|---------|
| 2.1 | Deletar página Labels | src/app/configuracoes/labels/ | 10min |
| 2.2 | Deletar controller Labels | src/features/labels/ | 10min |
| 2.3 | Remover model Label do Prisma | prisma/schema.prisma | 15min |
| 2.4 | Deletar página Departamentos | src/app/configuracoes/departamentos/ | 10min |
| 2.5 | Deletar controller Departamentos | src/features/departments/ | 10min |
| 2.6 | Remover model Department do Prisma | prisma/schema.prisma | 15min |
| 2.7 | Remover links do menu lateral | components/sidebar | 15min |
| 2.8 | Gerar nova migration Prisma | prisma migrate | 20min |
| 2.9 | Regenerar Igniter client types | npm run generate | 10min |

### Fase 3: Correção de Funcionalidades (3-5 dias)

| # | Tarefa | Arquivo | Esforço |
|---|--------|---------|---------|
| 3.1 | Implementar contato detalhe real | contatos/[id]/page.tsx | 2h |
| 3.2 | Implementar send message mutation | send-message-dialog.tsx | 1h |
| 3.3 | Implementar bulk send mutation | bulk-send-dialog.tsx | 1h |
| 3.4 | Implementar ações webhooks admin | admin/webhooks/page.tsx | 2h |
| 3.5 | Paralelizar logs page | admin/logs/page.tsx | 30min |

### Fase 4: Migração para Igniter Client (2-3 dias)

| # | Tarefa | Arquivo | Esforço |
|---|--------|---------|---------|
| 4.1 | Migrar chatwoot para api.* | ferramentas/chatwoot/page.tsx | 1h |
| 4.2 | Expor types corretos no client | igniter.client.ts | 2h |
| 4.3 | Remover type casts desnecessários | Múltiplos | 3h |

### Fase 5: Melhorias de Performance (1-2 dias)

| # | Tarefa | Arquivo | Esforço |
|---|--------|---------|---------|
| 5.1 | Adicionar cache ao dashboard | dashboard.controller.ts | 1h |
| 5.2 | Adicionar cache aos contatos | contacts.controller.ts | 1h |
| 5.3 | Implementar watchers em sessions | sessions.controller.ts | 2h |

### Fase 6: Decisões Pendentes

| # | Decisão | Opções | Responsável |
|---|---------|--------|-------------|
| 6.1 | Connections module | Migrar para Igniter OU Remover | Arquiteto |
| 6.2 | Providers page | Criar API OU Manter hardcoded | Product |
| 6.3 | Analytics getEventsSummary | Implementar OU Remover | Backend |

---

## 8. Métricas do Sistema

### 8.1 Estatísticas Gerais

| Métrica | Valor |
|---------|-------|
| Total de páginas (Admin + Master) | 31 |
| Total de controllers | 29 |
| Total de endpoints API | ~216 |
| Total de repositories | 9 |
| Total de services | 3 |
| Total de procedures | 3 |

### 8.2 Saúde do Código

| Métrica | Valor | Meta |
|---------|-------|------|
| Páginas funcionais | 85% | 100% |
| Controllers com auth | 93% | 100% |
| Controllers com cache | 7% | 30% |
| Type casts (as any) | ~60 | 0 |
| TODOs/FIXMEs | 8 | 0 |
| Features órfãs | 2 | 0 |

### 8.3 Dívida Técnica Estimada

| Categoria | Itens | Esforço Total |
|-----------|-------|---------------|
| Segurança | 2 | 1h |
| Remoção de código | 2 features | 2h |
| Funcionalidade quebrada | 5 | 6h |
| Migração Igniter | 3 | 6h |
| Performance | 3 | 4h |
| **TOTAL** | **15 itens** | **~19h** |

---

## Anexos

### A. Comandos para Remoção de Features

```bash
# 1. Backup antes de deletar
git checkout -b feature/remove-orphan-features

# 2. Deletar Labels
rm -rf src/app/configuracoes/labels
rm -rf src/features/labels

# 3. Deletar Departamentos
rm -rf src/app/configuracoes/departamentos
rm -rf src/features/departments

# 4. Editar prisma/schema.prisma manualmente para remover models

# 5. Gerar migration
npx prisma migrate dev --name remove_labels_departments

# 6. Regenerar types
npm run generate

# 7. Testar
npm run build
npm run test

# 8. Commit
git add -A
git commit -m "chore: remove orphan features (Labels, Departments)"
```

### B. Checklist de Validação Pós-Remoção

- [ ] Build sem erros
- [ ] Testes passando
- [ ] Menu lateral atualizado
- [ ] Nenhuma página 404 inesperada
- [ ] Migration Prisma aplicada
- [ ] Igniter client regenerado
- [ ] Documentação atualizada

---

> **Próxima Revisão**: Após implementação da Fase 2
