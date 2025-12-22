# Deploy Checklist - 2025-12-22

> **Resumo**: Todas as melhorias e correções implementadas nas sessões de 21-22 de dezembro de 2025

---

## Arquivos Modificados

### Backend (API)

| Arquivo | Alteração | Status |
|---------|-----------|--------|
| `src/features/instances/controllers/instances.controller.ts` | Novo endpoint `validateCloudApi` para testar credenciais Cloud API | ✅ Pronto |
| `src/features/invitations/controllers/invitations.controller.ts` | Endpoint `resend` já existia | ✅ Verificado |
| `src/features/organizations/organizations.repository.ts` | `hasReachedUserLimit()` já existia | ✅ Verificado |
| `src/features/contacts/controllers/contacts.controller.ts` | Validação `currentOrgId` já existia em todos endpoints | ✅ Verificado |
| `src/lib/audit/audit-log.service.ts` | Sistema de AuditLog completo | ✅ Verificado |
| `src/features/audit/controllers/audit.controller.ts` | API de audit com filtros | ✅ Verificado |
| `src/lib/auth/permissions.ts` | Sistema RBAC completo | ✅ Verificado |
| `src/features/messages/controllers/chats.controller.ts` | 🚀 Cache Redis para listagem de chats (TTL 15s) | ✅ Pronto |
| `src/features/messages/controllers/messages.controller.ts` | 🚀 Rate limiting por sessão (20 msgs/min) | ✅ Pronto |
| `src/lib/rate-limit/rate-limiter.ts` | 🚀 Novo `sessionRateLimiter` | ✅ Pronto |
| `src/lib/api/uazapi.service.ts` | 🚀 Método `withRetry` com backoff exponencial | ✅ Pronto |
| `src/lib/sessions/sessions.manager.ts` | 🚀 Paginação cursor-based | ✅ Pronto |
| `src/features/sessions/controllers/sessions.controller.ts` | 🚀 Suporte a `cursor` e `useCursor` na query | ✅ Pronto |

### Frontend (UI)

| Arquivo | Alteração | Status |
|---------|-----------|--------|
| `src/components/integrations/CreateIntegrationModal.tsx` | Botão "Testar Credenciais" para Cloud API | ✅ Pronto |
| `src/app/integracoes/page.tsx` | Cache localStorage para preferências (viewMode, statusFilter) | ✅ Pronto |
| `src/features/connections/components/QRCodeModal.tsx` | Countdown timer 2min com auto-refresh | ✅ Pronto |

### Documentação

| Arquivo | Alteração | Status |
|---------|-----------|--------|
| `docs/jornadas-usuario/01-admin/oportunidades-melhoria.md` | Seção "Verificação de Segurança" adicionada | ✅ Pronto |

---

## Funcionalidades Implementadas

### 1. Validação de Credenciais Cloud API
- **Endpoint**: `POST /api/v1/instances/validate-cloud-api`
- **Input**: `{ cloudApiAccessToken, cloudApiPhoneNumberId, cloudApiWabaId }`
- **Output**: `{ valid: boolean, phoneNumber?, verifiedName?, qualityRating?, error? }`
- **UI**: Botão "Testar Credenciais" no modal de criação de integração

### 2. Cache de Preferências (Integrações)
- **Chave**: `integracoes_preferences`
- **Dados**: `{ viewMode: 'grid' | 'list', statusFilter: string }`
- **Comportamento**: Carrega ao montar, salva ao mudar

### 3. Countdown do QR Code
- **Duração**: 120 segundos
- **Visual**: Badge com cores (verde > amarelo > vermelho)
- **Auto-refresh**: Gera novo QR quando expira

### 4. Cache Redis para Chats (NOVO)
- **TTL**: 15 segundos
- **Chave**: `chats:list:{instanceId}:{filters}`
- **Reduz**: Carga no banco para listagem de conversas

### 5. Rate Limiting por Sessão (NOVO)
- **Limite**: 20 mensagens por minuto por sessão
- **Previne**: Spam e abuso de envio
- **Resposta**: HTTP 429 com tempo de retry

### 6. Retry com Backoff Exponencial (NOVO)
- **Tentativas**: 3
- **Delays**: 1s, 2s, 4s
- **Ignora**: Erros 4xx (não faz retry)
- **Extra**: UAZapi já tem Circuit Breaker (5 falhas = open)

### 7. Paginação Cursor-Based (NOVO)
- **Endpoint**: `GET /api/v1/sessions?cursor={id}&useCursor=true`
- **Retorna**: `nextCursor` e `hasMore`
- **Benefício**: Mais eficiente para grandes volumes

---

## Verificações de Segurança Confirmadas

### Contatos (100% seguro)
- [x] `list` - Valida `currentOrgId` (linha 48-51)
- [x] `getById` - Valida `currentOrgId` (linha 138-140)
- [x] `update` - Valida `currentOrgId` (linha 215-217)
- [x] `delete` - Valida `currentOrgId` (linha 268-270)
- [x] `getSessions` - Valida `currentOrgId` (linha 314-316)

### Convites (100% seguro)
- [x] `create` - Valida membership + RBAC
- [x] `acceptExisting` - Valida token + email match
- [x] `acceptNew` - Valida token + cria conta
- [x] `list` - Valida membership + RBAC
- [x] `delete` - Valida membership + RBAC
- [x] `resend` - Valida membership + RBAC
- [x] `validate` - Público (apenas leitura)

### Limites de Plano
- [x] `hasReachedUserLimit()` - Bloqueia novos membros se `currentCount >= org.maxUsers`
- [x] `hasReachedInstanceLimit()` - Bloqueia novas instâncias se `count >= org.maxInstances`

---

## Checklist de Deploy

### Pré-Deploy
- [ ] Rodar `bun run build` (ou `npm run build`) - verificar se compila sem erros
- [ ] Rodar `bun run lint` - verificar linting
- [ ] Verificar variáveis de ambiente necessárias:
  - `NEXT_PUBLIC_APP_URL` - para URLs de convite
  - `DATABASE_URL` - conexão PostgreSQL
  - `REDIS_URL` - cache e pub/sub
  - Cloud API: `WHATSAPP_CLOUD_API_VERSION` (se aplicável)

### Deploy
- [ ] Fazer backup do banco antes (se necessário)
- [ ] Deploy do código
- [ ] Verificar logs de inicialização

### Pós-Deploy
- [ ] Testar login (OTP/Google/Passkey)
- [ ] Testar criação de integração Cloud API com validação
- [ ] Testar exibição de QR Code com countdown
- [ ] Verificar que preferências de visualização persistem no refresh
- [ ] Verificar endpoint de audit logs (`/api/audit`)

---

## Rollback

Em caso de problemas, reverter para o commit anterior:
```bash
git log --oneline -5  # Ver últimos commits
git revert HEAD       # Reverter último commit
# ou
git reset --hard <commit-hash>  # Voltar para commit específico
```

---

## Notas

1. **Nenhuma migração de banco necessária** - Todas as funcionalidades usam estruturas existentes
2. **Sem breaking changes** - Todas as alterações são aditivas ou internas
3. **Cache invalidado automaticamente** - Redis TTL de 60s para dashboard stats

---

*Gerado em: 2025-12-22*
*Última atualização: 2025-12-22 - Adicionadas melhorias de Conversas*
