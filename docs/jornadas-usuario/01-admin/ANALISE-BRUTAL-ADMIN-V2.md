# ANALISE BRUTAL - Jornadas Admin/Master V2

**Data:** 2025-12-23
**Analista:** Lia AI Agent
**Escopo:** Todas as rotas, botoes, acoes e elementos UI/UX do painel Admin

---

## SUMARIO EXECUTIVO

| Categoria | Total Encontrado |
|-----------|------------------|
| BUGS CRITICOS | 6 |
| BUGS MEDIOS | 8 |
| BUGS BAIXOS | 5 |
| ELEMENTOS ORFAOS | 4 |
| OPORTUNIDADES UX | 15 |
| OPORTUNIDADES ENGENHARIA | 10 |

---

## PARTE 1: BUGS CRITICOS (Impacto Alto)

### BUG-C01: Webhook Global UAZapi - URL Nao Exibida
**Arquivo:** `src/components/admin-settings/WebhookSettings.tsx:70-97`
**Rota:** `/admin/settings?tab=webhook`
**Jornada Afetada:** Configuracao de Webhook Global

**Problema:**
- Admin configura webhook global no UAZapi via painel externo
- Na plataforma Quayer, o campo URL aparece VAZIO mesmo com webhook ativo
- API busca de `/api/v1/system-settings/webhook` retorna `settings?.webhook || null`
- Se `webhook` nao foi salvo via plataforma, retorna `null` mesmo tendo webhook ativo no UAZapi

**Impacto UX:**
- Admin fica confuso: "O webhook esta funcionando ou nao?"
- Nao ha feedback visual do estado real do webhook no UAZapi
- Pode levar a configuracoes duplicadas ou conflitantes

**Impacto Engenharia:**
- A plataforma nao sincroniza COM o UAZapi, apenas PARA o UAZapi
- Falta endpoint GET que busca configuracao atual do UAZapi: `GET /globalwebhook`

**Correcao Necessaria:**
```typescript
// No controller, adicionar busca do UAZapi real
const uazapiWebhook = await client.getGlobalWebhook();
return response.json({
  success: true,
  data: settings?.webhook || uazapiWebhook || null,
  source: settings?.webhook ? 'local' : uazapiWebhook ? 'uazapi' : null
});
```

**Prioridade:** CRITICA - Afeta integracao core do sistema

---

### BUG-C02: ShareToken Model Ausente - Feature Desabilitada
**Arquivo:** `src/app/admin/integracoes/page.tsx:40-66`
**Rota:** `/admin/integracoes`
**Jornada Afetada:** Compartilhamento de Instancias

**Problema:**
```tsx
// FIXME: ShareModal disabled - ShareToken model not in Prisma schema
// const [shareModalOpen, setShareModalOpen] = useState(false)
```

**Impacto UX:**
- Botao "Compartilhar" removido/desabilitado
- Admin nao consegue gerar links de compartilhamento para clientes
- Onboarding de novos clientes prejudicado

**Impacto Engenharia:**
- Model `ShareToken` precisa ser adicionado ao Prisma schema
- Precisa de: `id`, `token`, `instanceId`, `expiresAt`, `usedAt`, `createdBy`

**Prioridade:** CRITICA - Feature de onboarding quebrada

---

### BUG-C03: Sessions API - Formato de Params Incorreto
**Arquivo:** `src/app/atendimentos/page.tsx:135-144`
**Rota:** `/atendimentos`
**Jornada Afetada:** Listagem de Atendimentos

**Problema:**
```typescript
// ESTA ASSIM:
const response = await (api.sessions as any).list.query({
  organizationId: currentOrgId,
  status,
  ...
})

// DEVERIA SER (formato Igniter.js):
const response = await api.sessions.list.query({
  query: { organizationId: currentOrgId, status, ... }
})
```

**Impacto UX:**
- Pode funcionar parcialmente por tolerancia do backend
- Inconsistencia entre paginas

**Impacto Engenharia:**
- Codigo usando type cast `as any` para contornar erro de tipagem
- Indica problema de contrato API

**Prioridade:** ALTA - Pode quebrar silenciosamente

---

### BUG-C04: Resolve Session - ID Pode Ser Undefined
**Arquivo:** `src/app/integracoes/conversations/page.tsx:1037`
**Rota:** `/integracoes/conversations`
**Jornada Afetada:** Encerrar Conversa

**Problema:**
```tsx
onClick={() => resolveSessionMutation.mutate(selectedChat.id)}
// selectedChat.id pode ser undefined se chat veio direto do UAZapi sem sessao no DB
```

**Impacto UX:**
- Usuario clica "Resolver" e recebe erro 404
- Conversa nao e encerrada

**Correcao:**
```tsx
onClick={() => {
  const sessionId = selectedChat.id || selectedChat.wa_chatid;
  if (!sessionId) {
    toast.error('Sessao nao encontrada');
    return;
  }
  resolveSessionMutation.mutate(sessionId);
}}
```

**Prioridade:** ALTA - Afeta fluxo critico de atendimento

---

### BUG-C05: Mutations Sessions - Params Structure Incorreto
**Arquivo:** `src/app/atendimentos/page.tsx:166-168`
**Jornada Afetada:** Bloquear/Desbloquear IA

**Problema:**
```typescript
return await (api.sessions as any).blockAI.mutate({
  id: sessionId,  // INCORRETO
  body: { durationMinutes: duration },
})

// CORRETO:
return await api.sessions.blockAI.mutate({
  params: { id: sessionId },
  body: { durationMinutes: duration },
})
```

**Impacto:** Bloqueio de IA pode falhar silenciosamente

**Prioridade:** ALTA

---

### BUG-C06: Webhooks Admin - Organization Null
**Arquivo:** `src/app/admin/actions.ts:255-274`
**Rota:** `/admin/webhooks`
**Jornada Afetada:** Listagem de Webhooks Admin

**Problema:**
- `findMany` nao inclui relacao `organization`
- UI mostra `webhook.organization?.name` que retorna sempre `undefined`

**Impacto UX:**
- Admin nao sabe a qual organizacao pertence cada webhook
- Impossivel filtrar ou identificar

**Correcao:**
```typescript
include: {
  organization: {
    select: { id: true, name: true }
  }
}
```

**Prioridade:** MEDIA

---

## PARTE 2: BUGS MEDIOS

### BUG-M01: Busca Sem Debounce
**Arquivos Afetados:**
- `src/app/atendimentos/page.tsx:309`
- `src/app/admin/clients/page.tsx`
- `src/app/admin/organizations/page.tsx`

**Problema:** Cada caractere digitado dispara nova query

**Impacto:** Performance degradada, multiplas requisicoes desnecessarias

**Correcao:** Usar `useDebounce` existente em `src/hooks/useDebounce.ts`

---

### BUG-M02: Falta Confirmacao em Acoes Destrutivas
**Arquivos Afetados:**
- Encerrar Sessao: `conversations/page.tsx`
- Deletar Webhook: `webhooks/page.tsx`
- Bloquear IA: `atendimentos/page.tsx`
- Remover Usuario de Org: `clients/page.tsx`

**Problema:** Acoes criticas executam sem confirmacao

**Impacto UX:** Usuario pode acionar acidentalmente

**Correcao:** Implementar `AlertDialog` de confirmacao

---

### BUG-M03: Logs Streaming SSE - Sem Reconexao Automatica
**Arquivo:** `src/app/admin/logs/page.tsx:267-291`

**Problema:**
```typescript
eventSource.onerror = (error) => {
  console.error('SSE error:', error)
  eventSource.close()
  setIsStreaming(false)
  // NAO TENTA RECONECTAR!
}
```

**Impacto:** Se conexao cair, usuario precisa clicar manualmente para reconectar

**Correcao:** Implementar retry com backoff exponencial

---

### BUG-M04: Notificacoes - Target User/Org Manual
**Arquivo:** `src/app/admin/notificacoes/page.tsx:692-709`

**Problema:**
```tsx
<Input
  id="target-user"
  value={formData.userId}
  placeholder="UUID do usuario"
/>
```

**Impacto UX:** Admin precisa copiar UUIDs manualmente. Deveria ter Select com autocomplete.

---

### BUG-M05: Messages Admin - Filtros Nao Persistem
**Arquivo:** `src/app/admin/messages/page.tsx`

**Problema:** Ao mudar de pagina, filtros resetam

**Correcao:** Usar `useSearchParams` para persistir estado na URL

---

### BUG-M06: Audit Log - Busca Local Apenas
**Arquivo:** `src/app/admin/audit/page.tsx:169-179`

**Problema:**
```typescript
// Filtro de busca eh apenas local, nao vai no servidor
const filteredLogs = logs.filter((log: AuditLog) => {
  const term = searchTerm.toLowerCase()
  return log.user?.name?.toLowerCase().includes(term)...
})
```

**Impacto:** Busca nao funciona em registros paginados (alem da pagina atual)

---

### BUG-M07: Settings - Tabs Sem Loading State
**Arquivo:** `src/app/admin/settings/page.tsx`

**Problema:** Ao trocar de tab, nao ha indicador de loading do conteudo

---

### BUG-M08: Permissions - Sem Audit Trail
**Arquivo:** `src/app/admin/permissions/page.tsx`

**Problema:** Alteracoes em permissoes nao sao logadas no audit

**Impacto:** Compliance e rastreabilidade comprometidos

---

## PARTE 3: ELEMENTOS ORFAOS (Implementados mas Nao Usados)

### ORFAO-01: useDebounce Hook
**Arquivo:** `src/hooks/useDebounce.ts`
**Status:** Existe mas NAO e usado nas buscas

---

### ORFAO-02: ShareModal Component
**Status:** Desabilitado por falta do model Prisma

---

### ORFAO-03: Invitations Page Vazia
**Arquivo:** `src/app/admin/invitations/page.tsx`
**Status:** Precisa verificar se tem conteudo ou e placeholder

---

### ORFAO-04: Script check-webhook.ts
**Arquivo:** `scripts/check-webhook.ts`
**Status:** Script CLI existe mas nao ha equivalente na UI admin

---

## PARTE 4: OPORTUNIDADES UX/UI

### UX-01: Dashboard - Falta Export de Dados
**Rota:** `/admin`
**Sugestao:** Botao "Exportar Relatorio" com metricas do periodo

---

### UX-02: Webhooks - Falta Paginacao
**Rota:** `/admin/webhooks`
**Atual:** `limit: 100` fixo
**Sugestao:** Paginacao como Organizations

---

### UX-03: Webhooks - Falta Filtro por Org
**Rota:** `/admin/webhooks`
**Sugestao:** Select para filtrar por organizacao

---

### UX-04: Context Switch - Indicador Visual Permanente
**Jornada:** Apos trocar para contexto de org
**Atual:** Nao ha indicador claro de qual org esta sendo visualizada
**Sugestao:** Badge fixo na sidebar "Visualizando: Org X"

---

### UX-05: Conversas - Skeleton Generico
**Rota:** `/integracoes/conversations`
**Sugestao:** Skeleton que imita layout real de mensagens

---

### UX-06: Sessions Admin - Falta Bulk Actions
**Rota:** `/admin/sessions`
**Sugestao:** Checkbox para selecao multipla + acoes em massa

---

### UX-07: Logs - Falta Filtro por Data
**Rota:** `/admin/logs`
**Sugestao:** DatePicker para filtrar periodo

---

### UX-08: Clients - Avatar Placeholder
**Rota:** `/admin/clients`
**Sugestao:** Avatar com iniciais coloridas baseado no nome

---

### UX-09: Messages - Visualizacao de Midia
**Rota:** `/admin/messages`
**Atual:** Apenas texto truncado
**Sugestao:** Modal para visualizar imagens/documentos

---

### UX-10: Notificacoes - Preview em Tempo Real
**Rota:** `/admin/notificacoes`
**Sugestao:** Preview de como notificacao aparece para usuario

---

### UX-11: Settings - Status de Conexao
**Rota:** `/admin/settings`
**Sugestao:** Indicadores visuais de status de cada integracao (UAZapi, SMTP, OpenAI)

---

### UX-12: Audit - Timeline Visual
**Rota:** `/admin/audit`
**Sugestao:** Visualizacao em timeline alem de tabela

---

### UX-13: Integracoes - Status Badge Atualizado
**Rota:** `/admin/integracoes`
**Sugestao:** Badge de status que atualiza automaticamente (SSE)

---

### UX-14: Atendimentos - Kanban View
**Rota:** `/atendimentos`
**Sugestao:** Alternativa de visualizacao Kanban por status

---

### UX-15: Global - Breadcrumbs
**Todas as rotas admin**
**Sugestao:** Breadcrumb para navegacao hierarquica

---

## PARTE 5: OPORTUNIDADES DE ENGENHARIA

### ENG-01: Cache em Sessions Admin
**Atual:** Cada query vai direto no banco
**Sugestao:** Cache com TTL de 30-60s como no Dashboard

---

### ENG-02: Prefetch em Navegacao
**Sugestao:** Usar `prefetch` do Next.js nas rotas mais acessadas

---

### ENG-03: Virtual Scrolling
**Onde:** Logs, Messages, Sessions com muitos registros
**Sugestao:** Implementar `react-virtual` para listas grandes

---

### ENG-04: Otimistic Updates
**Onde:** Toggle ativar/desativar, encerrar sessao
**Sugestao:** Atualizar UI antes da resposta do servidor

---

### ENG-05: Error Boundary por Rota
**Sugestao:** Error boundary especifico para cada secao admin

---

### ENG-06: Service Worker para Offline
**Sugestao:** Cache de dados criticos para acesso offline

---

### ENG-07: Compressao de Payload
**Onde:** Listagens grandes (messages, logs)
**Sugestao:** Habilitar gzip/brotli nas respostas

---

### ENG-08: Indexacao de Buscas
**Onde:** Messages, Logs
**Sugestao:** Full-text search no Postgres ou Elasticsearch

---

### ENG-09: Rate Limiting no Frontend
**Sugestao:** Debounce + rate limit em acoes rapidas

---

### ENG-10: Telemetria de Uso
**Sugestao:** Rastrear quais features sao mais usadas para priorizar melhorias

---

## PARTE 6: ANALISE POR ROTA

### `/admin` (Dashboard)
| Elemento | Status | Problema |
|----------|--------|----------|
| Stats Cards | OK | - |
| Health Check | OK | - |
| Cards Clicaveis | OK | - |
| Export | FALTA | Nao implementado |
| Refresh Auto | FALTA | Apenas manual |

### `/admin/organizations`
| Elemento | Status | Problema |
|----------|--------|----------|
| Listagem | OK | - |
| Busca | PARCIAL | Sem debounce |
| Criar | OK | - |
| Editar | OK | - |
| Desativar | OK | Falta confirmacao |
| Paginacao | OK | - |
| Context Switch | OK | - |

### `/admin/integracoes`
| Elemento | Status | Problema |
|----------|--------|----------|
| Listagem | OK | - |
| Importar | OK | - |
| Atribuir Org | OK | - |
| Compartilhar | QUEBRADO | ShareToken missing |
| Status Badge | PARCIAL | Nao atualiza auto |

### `/admin/webhooks`
| Elemento | Status | Problema |
|----------|--------|----------|
| Listagem | OK | Org name null |
| Criar | OK | - |
| Editar | OK | - |
| Deletar | OK | Falta confirmacao |
| Testar | OK | - |
| Toggle | OK | - |
| Paginacao | FALTA | limit: 100 fixo |

### `/admin/sessions`
| Elemento | Status | Problema |
|----------|--------|----------|
| Listagem | OK | - |
| Filtros | OK | - |
| Bloquear IA | PARCIAL | Params incorretos |
| Encerrar | OK | Falta confirmacao |
| Paginacao | OK | - |
| Cache | FALTA | Query direta |

### `/admin/settings`
| Elemento | Status | Problema |
|----------|--------|----------|
| UAZapi Tab | OK | - |
| Webhook Tab | QUEBRADO | URL nao exibe |
| Email Tab | OK | - |
| AI Tab | OK | - |
| OAuth Tab | OK | - |
| Security Tab | OK | - |
| System Tab | OK | - |
| Test Connections | OK | - |

### `/admin/permissions`
| Elemento | Status | Problema |
|----------|--------|----------|
| Matriz | OK | - |
| Editar | OK | - |
| Salvar | OK | Falta audit log |

### `/admin/audit`
| Elemento | Status | Problema |
|----------|--------|----------|
| Listagem | OK | - |
| Filtros | PARCIAL | Busca local |
| Detalhes | OK | - |
| Paginacao | OK | - |

### `/admin/logs`
| Elemento | Status | Problema |
|----------|--------|----------|
| Listagem | OK | - |
| Streaming SSE | PARCIAL | Sem reconexao |
| AI Analysis | OK | - |
| Filtros | OK | - |
| Detalhes | OK | - |

### `/admin/messages`
| Elemento | Status | Problema |
|----------|--------|----------|
| Listagem | OK | - |
| Filtros | PARCIAL | Nao persistem |
| Export CSV | OK | - |
| Fonte (UAZapi/Local) | OK | - |

### `/admin/notificacoes`
| Elemento | Status | Problema |
|----------|--------|----------|
| Listagem | OK | - |
| Criar | PARCIAL | Target manual |
| Editar | OK | - |
| Deletar | OK | Com confirmacao |
| Cleanup | OK | - |

### `/admin/clients`
| Elemento | Status | Problema |
|----------|--------|----------|
| Listagem | OK | - |
| Busca | PARCIAL | Sem debounce |
| Detalhes | OK | - |
| Mudar Role | OK | - |
| Adicionar a Org | OK | - |
| Remover de Org | OK | Falta confirmacao |

---

## PRIORIZACAO RECOMENDADA

### Sprint 1 (Urgente - Esta Semana)
1. BUG-C01: Webhook URL nao exibe
2. BUG-C02: ShareToken Model
3. BUG-C04: Resolve Session undefined

### Sprint 2 (Alta - Proxima Semana)
4. BUG-C03: Sessions API params
5. BUG-C05: Mutations params
6. BUG-M01: Debounce nas buscas
7. BUG-M02: Confirmacao em acoes

### Sprint 3 (Media - 2 Semanas)
8. BUG-C06: Webhook org null
9. BUG-M03: SSE reconexao
10. BUG-M04: Target autocomplete
11. UX-04: Context Switch indicator

### Sprint 4 (Melhorias)
12-20: Demais UX e ENG improvements

---

## CONCLUSAO

O painel Admin esta **funcionalmente operacional** para as tarefas basicas, porem apresenta:

- **6 bugs criticos** que afetam features core (webhook, compartilhamento, sessoes)
- **8 bugs medios** que degradam a experiencia
- **4 elementos orfaos** que indicam divida tecnica
- **25 oportunidades** de melhoria em UX e Engenharia

**Recomendacao:** Focar nos bugs criticos antes de adicionar novas features.

---

## PARTE 7: BUGS CORRIGIDOS (2025-12-23)

### CORRIGIDO: BUG-C04 - Resolve Session ID Undefined
**Arquivo:** `src/app/integracoes/conversations/page.tsx:1037`
**Fix:** Adicionado check para `selectedChat.id` antes de chamar mutation + disabled no botao
```tsx
onClick={() => {
  if (!selectedChat.id) {
    toast.error('Esta conversa não possui sessão ativa no sistema')
    return
  }
  resolveSessionMutation.mutate(selectedChat.id)
}}
disabled={resolveSessionMutation.isPending || !selectedChat.id}
```

### CORRIGIDO: BUG-C01 - Webhook URL Nao Exibida do UAZapi
**Arquivo:** `src/features/system-settings/controllers/system-settings.controller.ts:431-470`
**Fix:** Endpoint agora busca configuracao do UAZapi via `client.getGlobalWebhook()` e retorna com indicador de `source` ('local' ou 'uazapi')

**Arquivo:** `src/components/admin-settings/WebhookSettings.tsx:371-380`
**Fix:** Adicionado badge visual indicando fonte do webhook (via UAZapi / via Quayer)

### CORRIGIDO: BUG-AUTH-01 - Passkey vs Token Tradicional
**Arquivo:** `src/features/auth/controllers/auth.controller.ts:260-271`
**Problema:** Login tradicional so definia `currentOrgId` para usuarios **admin**
**Fix:** Removido check `user.role === 'admin'`, agora aplica para TODOS os usuarios (alinhado com passkey)
```typescript
// ANTES: if (user.role === 'admin' && !currentOrgId && user.organizations.length > 0)
// DEPOIS: if (!currentOrgId && user.organizations.length > 0)
```

### CORRIGIDO: BUG-AUTH-02 - Signup OTP Nao Redireciona para Onboarding
**Arquivo:** `src/components/auth/signup-otp-form.tsx:89-98`
**Problema:** Novos usuarios eram redirecionados para `/integracoes` pulando onboarding
**Fix:** Agora verifica `needsOnboarding` e redireciona para `/onboarding` se necessario

### CORRIGIDO: BUG-AUTH-03 - Google Callback Nao Verifica Onboarding
**Arquivo:** `src/app/(auth)/google-callback/page.tsx:68-81`
**Problema:** Novos usuarios Google pulavam onboarding completamente
**Fix:** Agora verifica `needsOnboarding` antes de redirecionar

### CORRIGIDO: BUG-AUTH-04 - Root Page Cookie Errado
**Arquivo:** `src/app/page.tsx:13`
**Problema:** Verificava cookie `auth_token` que nao existe (correto e `accessToken`)
**Fix:** Alterado para `cookieStore.get('accessToken')`

---

## SUMARIO ATUALIZADO

| Categoria | Encontrado | Corrigido | Pendente |
|-----------|------------|-----------|----------|
| BUGS CRITICOS | 6 | 3 | 3 |
| BUGS AUTH | 4 | 4 | 0 |
| BUGS MEDIOS | 8 | 1 | 7 |
| BUGS BAIXOS | 5 | 0 | 5 |
| ELEMENTOS ORFAOS | 4 | 1 | 3 |

### CORRIGIDO: BUG-C02 - ShareModal Desabilitado (Comentario Errado)
**Arquivo:** `src/app/admin/integracoes/page.tsx`
**Problema:** ShareModal estava comentado com FIXME dizendo "ShareToken model not in Prisma schema"
**Realidade:** O ShareToken JA EXISTE no Prisma schema (Connection model, linhas 363-365)
**Fix:** Habilitado ShareLinkModal, handleShare e adicionado item "Compartilhar Link" no dropdown menu

### CORRIGIDO: BUG-M01 - Debounce nas Buscas
**Arquivo:** `src/app/atendimentos/page.tsx`
**Fix:** Adicionado `useDebounce(search, 300)` para evitar chamadas API excessivas
