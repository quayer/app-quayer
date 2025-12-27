# Plano de Correções - Tela de Conversas

## Resumo Executivo

Análise completa da tela `/integracoes/conversations` identificou **29 problemas** categorizados por severidade.
O arquivo principal tem **2.439 linhas** e precisa de refatoração significativa.

---

## Correções Já Aplicadas

### [CORRIGIDO] Tabs com Texto Cortado (UI/UX)
**Arquivo:** `src/app/integracoes/conversations/page.tsx:1312-1369`

**Problema:** Labels "Atendente" e "Resolvidos" apareciam cortados por uso de `truncate` e `grid-cols-3`.

**Correções aplicadas:**
- Mudado de `grid grid-cols-3` para `flex` com `flex-1` (distribuição flexível)
- Removido `truncate`, adicionado `whitespace-nowrap` (texto não quebra nem corta)
- Aumentado `py-2` para `py-2.5` (mais espaço vertical)
- Adicionado `aria-controls` para melhor acessibilidade
- Adicionado `aria-hidden="true"` nos ícones decorativos
- Mudado `focus-visible:ring-neutral-400` para `focus-visible:ring-ring` (consistência)
- Aumentado `min-w-5` para `min-w-[20px]` no Badge (largura mínima mais clara)

---

## Problemas Identificados

### CRÍTICO (Bloqueia uso)

#### 0. Notas Não Funcionando
**Erro:** `Cannot read properties of undefined (reading 'create')`

**Arquivo:** `src/igniter.schema.ts` (gerado automaticamente)

**Causa raiz:** O controller `notesController` está registrado no `igniter.router.ts:50`, mas o schema do cliente (`igniter.schema.ts`) **não foi regenerado** para incluí-lo.

**Verificação:**
```bash
grep -n "notes" src/igniter.schema.ts  # Retorna vazio!
```

**Solução:**
```bash
# Regenerar o schema do Igniter
npx igniter generate
# ou
bun run igniter:generate
```

Após regenerar, o `api.notes.create` estará disponível no cliente.

---

#### 1. Refreshes Constantes / UI Travando
**Arquivo:** `src/hooks/useInstanceSSE.ts:117-134` + `src/app/integracoes/conversations/page.tsx:326`

**Causa raiz:**
- SSE está com `autoInvalidate: true`
- Cada evento `message.received` ou `message.sent` dispara **4 invalidações simultâneas**:
  ```typescript
  queryClient.invalidateQueries({ queryKey: ['messages'] })
  queryClient.invalidateQueries({ queryKey: ['sessions'] })
  queryClient.invalidateQueries({ queryKey: ['conversations', 'messages'] })
  queryClient.invalidateQueries({ queryKey: ['conversations', 'chats'] })
  ```
- `invalidateQueries` ignora `staleTime` e força refetch IMEDIATO

**Impacto:** Se você tem múltiplos chats ativos, cada mensagem causa cascata de refreshes que:
- Recarrega lista de 100 chats
- Recarrega mensagens do chat ativo
- Bloqueia interação do usuário
- Impede troca de tabs/filtros

**Solução:**
1. Desabilitar `autoInvalidate` global
2. Criar handler específico que invalida APENAS a query afetada
3. Usar `setQueryData` para atualizações otimistas em vez de refetch
4. Adicionar debounce de 500ms para invalidações

```typescript
// Exemplo de correção no useInstanceSSE.ts
case 'message.received':
  // Em vez de invalidar tudo, atualizar apenas o chat específico
  const sessionId = event.data?.sessionId
  if (sessionId) {
    // Invalidar apenas as mensagens desse chat
    queryClient.invalidateQueries({
      queryKey: ['conversations', 'messages', sessionId],
      refetchType: 'none' // Não forçar refetch imediato
    })
    // Atualizar lista de chats otimisticamente
    queryClient.setQueryData(['conversations', 'chats'], (old) => {
      // Mover chat para o topo
    })
  }
  break
```

---

#### 2. Mensagens Não Enviando
**Arquivo:** `src/app/integracoes/conversations/page.tsx:986-1010`

**Possíveis causas identificadas:**
- Validação de UUID pode estar falhando silenciosamente
- Rate limiter pode estar bloqueando (20 msgs/min por sessão)
- Sessão pode estar com status `CLOSED`

**Verificar:**
- Console do browser para erros
- Logs do backend para rate limiting
- Status da sessão no banco

**Solução:** Adicionar melhor feedback de erro e logging

---

### ALTO (Funcionalidade prejudicada)

#### 3. Áudios Anteriores Não Aparecem
**Arquivo:** `src/app/integracoes/conversations/page.tsx:1946-1955`

**Causa raiz:** A `mediaUrl` pode estar `null` ou expirada
- O webhook salva `message.media.mediaUrl` (linha 591 do webhook)
- UAZapi retorna URLs temporárias que podem expirar
- O adapter extrai via: `messageContent.mediaUrl || rawMessage.mediaUrl || messageContent.url`

**Verificar no banco:**
```sql
SELECT id, type, mediaUrl FROM Message WHERE type IN ('audio', 'ptt', 'voice') LIMIT 10;
```

**Soluções:**
1. Fazer download e salvar mídia permanentemente (S3/R2)
2. Usar endpoint de download sob demanda quando URL expira
3. Adicionar fallback visual quando áudio não tem URL

---

#### 4. Imagens de Perfil Não Aparecem
**Arquivos:**
- `src/features/messages/controllers/chats.controller.ts:294`
- `src/app/integracoes/conversations/page.tsx:1448,1560`

**Causas:**
1. Backend limita a **20 fotos por sync** (linha 294)
2. Hook `useProfilePicture` **não está sendo usado** na página
3. Imagens exibidas diretamente via `chat.wa_profilePicUrl` que pode ser `null`

**Soluções:**
1. Aumentar limite de fotos por sync para 50
2. Implementar lazy-loading de fotos conforme scroll
3. Usar `useProfilePicture` hook para fallback dinâmico
4. Adicionar placeholder visual para fotos não carregadas

---

### MÉDIO (UX prejudicada)

#### 5. Componente Monolítico (2.439 linhas)
**Arquivo:** `src/app/integracoes/conversations/page.tsx`

**Problemas:**
- 30+ hooks React (useQuery, useMutation, useEffect, useCallback, useMemo)
- Difícil manutenção e debug
- Re-renders excessivos por dependências complexas

**Solução:** Refatorar em componentes menores:
```
conversations/
├── page.tsx (orquestrador, ~200 linhas)
├── components/
│   ├── ChatsList.tsx
│   ├── ChatsListItem.tsx
│   ├── MessagesArea.tsx
│   ├── MessageBubble.tsx
│   ├── MessageInput.tsx
│   ├── ChatHeader.tsx
│   ├── NotesPanel.tsx
│   └── QuickReplies.tsx
├── hooks/
│   ├── useChats.ts
│   ├── useMessages.ts
│   └── useConversationSSE.ts
└── types.ts
```

---

#### 6. SSE Apenas para Uma Instância
**Arquivo:** `src/app/integracoes/conversations/page.tsx:319`

```typescript
const sseInstanceId = instanceIdsToFetch.length === 1
  ? instanceIdsToFetch[0]
  : instances[0]?.id  // ← Problema: só conecta na primeira!
```

**Impacto:** Quando visualiza "Todas as integrações", não recebe atualizações real-time das outras instâncias.

**Solução:** Usar SSE de organização em vez de instância:
```typescript
useInstanceSSE({
  organizationId: userOrgId,  // Em vez de instanceId
  enabled: isHydrated,
  // ...
})
```

---

#### 7. Busca de Mensagens Apenas Client-Side
**Arquivo:** `src/app/integracoes/conversations/page.tsx:651-676`

**Problema:** A busca só funciona nas mensagens já carregadas.

**Solução:** Implementar endpoint de busca no backend:
```typescript
// GET /api/v1/messages/search?sessionId=xxx&query=xxx
```

---

### UI/UX (Design e Usabilidade)

#### 8. [CORRIGIDO] Tabs com Texto Cortado
**Status:** Corrigido em 2025-12-27

Labels "IA", "Atendente" e "Resolvidos" estavam cortados. Corrigido com layout flexbox.

---

#### 8.1. Sugestões de IA no Input Não Funcionando
**Arquivos:**
- `src/components/chat/AIMessageInput.tsx` (componente pronto)
- `src/app/integracoes/conversations/page.tsx:2288` (usa Input comum)

**Causa raiz:** O componente `AIMessageInput` existe e está completo, mas **não está sendo usado** na página de conversas. A página usa um `<Input>` comum em vez do componente com sugestões de IA.

**Funcionalidade do AIMessageInput:**
- Debounce de 500ms
- Mínimo 3 caracteres para ativar
- Dropdown com sugestões de IA
- Navegação via setas (↑↓)
- Tab para aceitar sugestão
- Integração com `api.ai.suggestions.query`

**Solução:** Substituir o Input comum pelo AIMessageInput:

```diff
// src/app/integracoes/conversations/page.tsx:2288
- import { Input } from '@/components/ui/input'
+ import { AIMessageInput } from '@/components/chat/AIMessageInput'

// Na área de input (linha ~2288):
- <Input
-   ref={messageInputRef}
-   placeholder={selectedFile ? "Legenda (opcional)..." : "Digite / para atalhos ou mensagem..."}
-   value={messageText}
-   onChange={handleMessageChange}
-   ...
- />
+ <AIMessageInput
+   value={messageText}
+   onChange={setMessageText}
+   onSend={handleSendMessage}
+   disabled={isUploading || sendMessageMutation.isPending}
+   placeholder={selectedFile ? "Legenda (opcional)..." : "Digite uma mensagem..."}
+   conversationContext={messages?.pages?.flatMap(p => p.data?.map(m => m.content) ?? []) ?? []}
+   aiEnabled={true}
+ />
```

**Dependência:** Verificar se `api.ai.suggestions` existe no backend (aiController).

---

#### 9. Falta de Skeleton Loading para Imagens
**Arquivo:** `src/app/integracoes/conversations/page.tsx:1926-1932`

Imagens carregam com `loading="lazy"` mas sem skeleton placeholder.

**Solução:**
```tsx
<Skeleton className="w-full h-48 rounded-lg" />
{imageLoaded && <img ... />}
```

---

#### 11. Sorting Client-Side Ineficiente
**Arquivo:** `src/app/integracoes/conversations/page.tsx:384`

```typescript
const allChats = results.flat().sort((a, b) =>
  (b.wa_lastMsgTimestamp || 0) - (a.wa_lastMsgTimestamp || 0)
)
```

**Problema:** Com 500+ chats, O(n log n) a cada render.

**Solução:** Mover ordenação para backend ou usar `useMemo` com deps corretas.

---

### ACESSIBILIDADE (WCAG 2.1)

#### 12. Tabs Parcialmente Acessíveis
**Positivo:** Tabs principais têm `role="tablist"`, `role="tab"`, `aria-selected`, `aria-label`

**Parcialmente corrigido:** `aria-controls` já foi adicionado.

**Ainda faltando:**
- `tabpanel` role no conteúdo
- Navegação via setas (←→)

---

#### 13. Lista de Chats Sem Landmarks
**Problema:** Lista de chats é `<div>` sem role semântico.

**Solução:**
```tsx
<nav aria-label="Lista de conversas">
  <ul role="listbox" aria-label="Conversas">
    {chats.map(chat => (
      <li role="option" aria-selected={isSelected}>
```

---

#### 14. Mensagens Sem Live Region
**Problema:** Novas mensagens não são anunciadas para screen readers.

**Solução:**
```tsx
<div
  role="log"
  aria-live="polite"
  aria-atomic="false"
  aria-label="Histórico de mensagens"
>
```

---

#### 15. Contraste de Cores
**Verificar:**
- Badge de contagem: `text-[10px]` pode ser pequeno demais
- `text-muted-foreground/70` pode não ter contraste 4.5:1

---

#### 16. Focus Management
**Problema:** Ao trocar de chat, focus não move para área de mensagens.

**Solução:**
```tsx
useEffect(() => {
  if (selectedChatId) {
    messagesContainerRef.current?.focus()
  }
}, [selectedChatId])
```

---

#### 17. Áudios Sem Descrição
**Arquivo:** `src/app/integracoes/conversations/page.tsx:1947-1954`

```tsx
<audio src={message.mediaUrl} controls>
  Seu navegador não suporta áudio.
</audio>
```

**Faltando:** `aria-label` descritivo

**Solução:**
```tsx
<audio
  src={message.mediaUrl}
  controls
  aria-label={`Mensagem de áudio de ${formatTimestamp(message.createdAt)}`}
>
```

---

## Priorização de Correções

### Sprint 0 (Urgente - Schema Desatualizado)
0. [ ] **Regenerar schema do Igniter** (problema #0) - Corrige Notas e outros endpoints
   ```bash
   npx igniter generate
   ```

### Sprint 1 (Crítico)
1. [ ] Corrigir invalidações do SSE (problema #1)
2. [ ] Investigar e corrigir envio de mensagens (problema #2)
3. [ ] Corrigir exibição de áudios anteriores (problema #3)

### Sprint 2 (Alto)
4. [ ] Melhorar carregamento de imagens de perfil (problema #4)
5. [ ] Suporte SSE para múltiplas instâncias (problema #6)

### Sprint 3 (Médio)
6. [ ] Refatorar componente em partes menores (problema #5)
7. [ ] Implementar busca server-side (problema #7)

### Sprint 4 (UI/UX)
8. [x] Corrigir tabs com texto cortado (problema #8) - **CONCLUÍDO**
9. [ ] Ativar sugestões de IA no input (problema #8.1) - Substituir Input por AIMessageInput
10. [ ] Adicionar skeleton loading para imagens (problema #9)
11. [ ] Otimizar sorting client-side (problema #11)

### Sprint 5 (Acessibilidade WCAG 2.1)
11. [ ] Completar acessibilidade das tabs (problema #12)
12. [ ] Adicionar landmarks semânticos (problema #13)
13. [ ] Implementar live regions (problema #14)
14. [ ] Revisar contraste de cores (problema #15)
15. [ ] Melhorar focus management (problema #16)
16. [ ] Adicionar aria-labels em áudios (problema #17)

---

## Arquivos a Modificar

| Arquivo | Mudanças | Prioridade |
|---------|----------|------------|
| `src/igniter.schema.ts` | Regenerar via CLI | URGENTE |
| `src/hooks/useInstanceSSE.ts` | Refatorar autoInvalidate | CRÍTICO |
| `src/app/integracoes/conversations/page.tsx` | Múltiplas correções + AIMessageInput | CRÍTICO |
| `src/features/messages/controllers/chats.controller.ts` | Aumentar limite de fotos | ALTO |
| `src/lib/providers/adapters/uazapi/uazapi.adapter.ts` | Verificar extração de mediaUrl | ALTO |
| `src/app/api/v1/webhooks/[provider]/route.ts` | Persistir mídia em storage | MÉDIO |
| `src/components/chat/AIMessageInput.tsx` | Já pronto, apenas integrar | MÉDIO |

---

## Novas Críticas (Análise de Rotas - 2025-12-27)

> Documento completo em: [ANALISE_ROTAS_CONVERSATIONS.md](./ANALISE_ROTAS_CONVERSATIONS.md)

### PERFORMANCE (Novos)

#### P1. Múltiplas Requisições Paralelas ao Carregar
**Arquivo:** `src/app/integracoes/conversations/page.tsx:358-380`

Frontend faz `Promise.all` para buscar chats de TODAS as instâncias separadamente.
Se usuário tem 5 instâncias = 5 requisições simultâneas × 100 chats cada.

**Solução:** Criar endpoint único `/api/v1/chats/all` que retorna chats de todas instâncias.

---

#### P2. Sem Virtualização de Lista de Chats
**Arquivo:** `src/app/integracoes/conversations/page.tsx`

Renderiza TODOS os chats no DOM. Com 500 chats = 500 DOM nodes.

**Solução:** Usar `@tanstack/react-virtual` ou `react-window`.

---

#### P3. Sem Debounce na Busca de Chats
**Arquivo:** `src/app/integracoes/conversations/page.tsx:463-469`

Filtro de busca executa a cada keystroke.

**Solução:** `useDebounce(searchText, 300)`

---

### BACKEND (Novos)

#### B1. N+1 Queries no Endpoint de Chats
**Arquivo:** `src/features/messages/controllers/chats.controller.ts`

Para cada chat, busca mensagens e contato separadamente.

**Solução:**
```typescript
const chats = await database.chatSession.findMany({
  include: {
    contact: true,
    messages: { take: 1, orderBy: { createdAt: 'desc' } }
  }
})
```

---

#### B2. Sem Paginação Cursor-Based
**Arquivo:** `src/features/messages/controllers/messages.controller.ts:352`

Usa offset-based pagination que é ineficiente para grandes datasets.

**Solução:** Cursor-based com `createdAt` ou `id`:
```typescript
where: {
  createdAt: { lt: cursor }
},
take: 50,
orderBy: { createdAt: 'desc' }
```

---

#### B3. Cache Muito Curto (15s)
**Arquivo:** `src/features/messages/controllers/chats.controller.ts:17`

Cache de 15 segundos causa muitas requisições ao banco.

**Solução:** Aumentar para 60 segundos, invalidar via SSE quando necessário.

---

#### B4. Rate Limiting Pode Ser Restritivo
**Arquivo:** `src/features/messages/controllers/messages.controller.ts`

20 msgs/minuto por sessão pode ser muito baixo para atendimentos intensos.

**Solução:** Rate limit por usuário + sessão, com burst allowance.

---

#### B5. Logs Excessivos em Produção
**Arquivo:** `src/app/api/v1/webhooks/[provider]/route.ts:261`

Loga payload inteiro do webhook em produção.

**Solução:** Usar logger estruturado com níveis (debug/info/warn/error).

---

### UX/UI (Novos)

#### U1. Feedback Insuficiente de Erros no Envio
Erros de envio de mensagem mostram apenas toast genérico.

**Solução:**
- Indicar qual mensagem falhou na UI
- Botão de retry inline na bolha
- Ícone de erro visual

---

#### U2. Scroll Não Preservado ao Carregar Mensagens Antigas
**Arquivo:** `src/app/integracoes/conversations/page.tsx:478-540`

Ao fazer scroll up para carregar mais, posição do scroll salta.

**Solução:** Salvar `scrollHeight` antes do fetch, restaurar após.

---

#### U3. Sem Confirmação para Ações Destrutivas
Deletar chat, arquivar, bloquear não pedem confirmação.

**Solução:** Modal de confirmação com `AlertDialog`.

---

### WCAG 2.1 (Novos)

#### A1. Lista de Chats Sem Navegação por Teclado
**Critério:** WCAG 2.1.1 (Keyboard)

Não é possível navegar pelos chats usando apenas teclado (setas ↑↓).

**Solução:**
```tsx
<ul role="listbox" tabIndex={0} onKeyDown={handleArrowNavigation}>
  <li role="option" aria-selected={isSelected}>
```

---

#### A2. Imagens Sem Alt Descritivo
**Critério:** WCAG 1.1.1 (Non-text Content)

```tsx
<img src={...} alt="Imagem" />  // ❌ Genérico demais
```

**Solução:**
```tsx
<img src={...} alt={`Imagem enviada por ${sender} às ${time}`} />
```

---

## Priorização Atualizada

### Sprint 0 (Urgente)
0. [ ] **Regenerar schema do Igniter** - Corrige Notas e outros endpoints

### Sprint 1 (Crítico - Performance)
1. [ ] Corrigir invalidações do SSE (problema #1)
2. [ ] Investigar e corrigir envio de mensagens (problema #2)
3. [ ] Corrigir exibição de áudios anteriores (problema #3)
4. [ ] Criar endpoint único para buscar chats (P1)
5. [ ] Corrigir N+1 queries no backend (B1)

### Sprint 2 (Alto - Funcionalidade)
6. [ ] Melhorar carregamento de imagens de perfil (problema #4)
7. [ ] Suporte SSE para múltiplas instâncias (problema #6)
8. [ ] Implementar paginação cursor-based (B2)
9. [ ] Aumentar cache de chats para 60s (B3)

### Sprint 3 (Médio - Arquitetura)
10. [ ] Refatorar componente em partes menores (problema #5)
11. [ ] Implementar busca server-side (problema #7)
12. [ ] Adicionar virtualização de lista (P2)
13. [ ] Adicionar debounce na busca (P3)

### Sprint 4 (UI/UX)
14. [x] Corrigir tabs com texto cortado - **CONCLUÍDO**
15. [ ] Ativar sugestões de IA no input (problema #8.1)
16. [ ] Adicionar skeleton loading para imagens (problema #9)
17. [ ] Melhorar feedback de erros no envio (U1)
18. [ ] Preservar scroll ao carregar mensagens (U2)
19. [ ] Adicionar confirmação para ações destrutivas (U3)

### Sprint 5 (Acessibilidade WCAG 2.1)
20. [ ] Completar acessibilidade das tabs (problema #12)
21. [ ] Adicionar landmarks semânticos (problema #13)
22. [ ] Implementar live regions (problema #14)
23. [ ] Navegação por teclado na lista de chats (A1)
24. [ ] Melhorar alt text das imagens (A2)
25. [ ] Revisar contraste de cores (problema #15)
26. [ ] Melhorar focus management (problema #16)
27. [ ] Adicionar aria-labels em áudios (problema #17)

### Sprint 6 (Backend - Manutenção)
28. [ ] Ajustar rate limiting (B4)
29. [ ] Implementar logger estruturado (B5)

---

## Arquivos a Modificar

| Arquivo | Mudanças | Prioridade |
|---------|----------|------------|
| `src/igniter.schema.ts` | Regenerar via CLI | URGENTE |
| `src/hooks/useInstanceSSE.ts` | Refatorar autoInvalidate | CRÍTICO |
| `src/app/integracoes/conversations/page.tsx` | Múltiplas correções + AIMessageInput | CRÍTICO |
| `src/features/messages/controllers/chats.controller.ts` | Aumentar limite de fotos, N+1, cache | ALTO |
| `src/features/messages/controllers/messages.controller.ts` | Cursor pagination, rate limit | ALTO |
| `src/lib/providers/adapters/uazapi/uazapi.adapter.ts` | Verificar extração de mediaUrl | ALTO |
| `src/app/api/v1/webhooks/[provider]/route.ts` | Persistir mídia, logger | MÉDIO |
| `src/components/chat/AIMessageInput.tsx` | Já pronto, apenas integrar | MÉDIO |

---

## Métricas de Sucesso

Após as correções:
- [ ] Usuário pode trocar de chat sem travamentos
- [ ] Tempo de carregamento inicial < 2s
- [ ] Todas as mensagens de áudio são reproduzíveis
- [ ] Imagens de perfil carregam em 100% dos chats
- [ ] Score WCAG 2.1 AA compliance > 90%
- [ ] Lighthouse Accessibility > 90
- [ ] Lighthouse Performance > 80
- [ ] Zero N+1 queries no backend

---

## Documentação Relacionada

- [ANALISE_ROTAS_CONVERSATIONS.md](./ANALISE_ROTAS_CONVERSATIONS.md) - Mapeamento completo de rotas e análise crítica

---

*Documento gerado em: 2025-12-27*
*Analisado por: Lia AI Agent*
