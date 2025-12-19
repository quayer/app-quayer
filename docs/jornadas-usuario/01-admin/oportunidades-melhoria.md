# Oportunidades de Melhoria - Jornada Admin

> **Baseado em**: Análise da jornada completa do administrador
> **Data**: 2025-12-19

---

## Resumo Executivo

| Prioridade | Quantidade | Esforço Total |
|------------|------------|---------------|
| 🔴 Crítico | 2 | ~2h |
| 🟠 Alto | 4 | ~8h |
| 🟡 Médio | 6 | ~10h |
| 🟢 Baixo | 8 | ~12h |
| **Total** | **20** | **~32h** |

---

## 🔴 Crítico (Funcionalidade Quebrada)

### 1. Webhooks Admin - Dropdown de Ações
**Página**: `/admin/webhooks/page.tsx`
**Problema**: Menu dropdown mostra ações que não funcionam
**Impacto**: Admin não consegue gerenciar webhooks individualmente
**Ações afetadas**:
- Ver Detalhes
- Editar
- Testar Webhook (API não existe)
- Ativar/Desativar
- Excluir

**Solução**:
```typescript
// Implementar handlers para cada ação
const handleViewDetails = (webhook) => { ... }
const handleEdit = (webhook) => { ... }
const handleTest = (webhook) => { ... } // Criar endpoint
const handleToggle = (webhook) => { ... }
const handleDelete = (webhook) => { ... }
```

**Esforço**: 2h
**Dependência**: Criar endpoint `POST /webhooks/:id/test`

---

### 2. Logs Page - Carregamento Sequencial
**Página**: `/admin/logs/page.tsx`
**Problema**: APIs chamadas sequencialmente no useEffect
**Impacto**: Página demora 3x mais para carregar

**Código Atual**:
```typescript
useEffect(() => {
  loadLogs()    // ~500ms
  loadStats()   // ~200ms
  loadSources() // ~100ms
}, [...])
// Total: ~800ms sequencial
```

**Solução**:
```typescript
useEffect(() => {
  Promise.all([
    loadLogs(),
    loadStats(),
    loadSources()
  ])
}, [...])
// Total: ~500ms paralelo
```

**Esforço**: 30min

---

## 🟠 Alto (Funcionalidade Incompleta)

### 3. Criar Organização - Email não enviado
**Página**: `/admin/organizations` → Dialog de criação
**Problema**: Quando cria org com admin, senha temporária não é enviada
**Impacto**: Admin criado não consegue fazer login

**Código com TODO**:
```typescript
// organizations.controller.ts:112
// TODO: Enviar email com senha temporária para o novo admin
```

**Solução**:
1. Gerar senha temporária segura
2. Usar serviço de email para enviar
3. Forçar troca de senha no primeiro login

**Esforço**: 2h

---

### 4. Audit Log de Ações do Admin
**Problema**: Não há registro de ações do admin
**Impacto**: Sem rastreabilidade para compliance/segurança

**Ações que deveriam ser logadas**:
- Login/logout
- Alteração de organizações
- Alteração de permissões
- Alteração de configurações
- Context switch para organizações
- Deleção de dados

**Solução**:
1. Criar model `AuditLog` no Prisma
2. Criar middleware/procedure para logging
3. Criar página `/admin/audit` para visualização

**Esforço**: 4h

---

### 5. Dashboard Admin - Sem Cache
**Página**: `/admin/page.tsx`
**Problema**: Métricas buscadas do banco a cada acesso
**Impacto**: Carga desnecessária no banco

**Solução**:
```typescript
// dashboard.controller.ts
getMetrics: igniter.query({
  cache: { ttl: 60 }, // Cache de 1 minuto
  handler: async () => { ... }
})
```

**Esforço**: 1h

---

### 6. Context Switch - Indicador Visual
**Problema**: Não fica claro quando admin está em contexto de org
**Impacto**: Admin pode fazer ações sem perceber o contexto

**Solução**:
1. Badge colorido no header indicando org atual
2. Toast ao trocar de contexto
3. Confirmação antes de ações destrutivas

**Esforço**: 1h

---

## 🟡 Médio (Melhorias de UX)

### 7. Filtros Avançados em Tabelas
**Páginas**: Organizations, Clients, Messages, Webhooks
**Problema**: Filtros básicos apenas
**Melhoria**: Adicionar filtros avançados com:
- Período (date range picker)
- Múltiplas organizações
- Status combinados
- Export dos resultados

**Esforço**: 3h

---

### 8. Bulk Actions
**Páginas**: Integrações, Webhooks
**Problema**: Operações só funcionam uma a uma
**Melhoria**:
- Seleção múltipla com checkbox
- Ações em lote (atribuir, deletar, ativar/desativar)

**Esforço**: 2h

---

### 9. Métricas em Tempo Real
**Página**: `/admin` (Dashboard)
**Problema**: Dados estáticos, precisa refresh manual
**Melhoria**:
- WebSocket/SSE para métricas
- Gráficos com atualização automática
- Alertas visuais de anomalias

**Esforço**: 3h

---

### 10. Histórico de Alterações
**Páginas**: Organizations, Settings
**Problema**: Não há histórico de quem alterou o quê
**Melhoria**:
- Timeline de alterações
- Diff visual de mudanças
- Opção de reverter

**Esforço**: 2h

---

## 🟢 Baixo (Nice to Have)

### 11. 2FA Obrigatório para Admin
**Problema**: Login de admin só com senha
**Melhoria**: Forçar 2FA (TOTP ou WebAuthn) para admins
**Esforço**: 2h

---

### 12. Export CSV/Excel
**Páginas**: Todas tabelas admin
**Melhoria**: Botão de export para análise offline
**Esforço**: 1h por página (~5h total)

---

### 13. Presets de Permissões
**Página**: `/admin/permissions`
**Melhoria**: Templates pré-configurados (e.g., "Atendente Básico", "Supervisor")
**Esforço**: 1h

---

### 14. Validação de Configurações
**Página**: `/admin/settings`
**Melhoria**: Botões "Testar" para validar:
- Conexão SMTP
- API da OpenAI
- API do UAZapi
**Esforço**: 2h

---

### 15. Dark Mode Toggle Rápido
**Local**: Header ou Sidebar
**Melhoria**: Toggle visual para trocar tema sem ir em settings
**Esforço**: 30min

---

### 16. Keyboard Shortcuts
**Global**: Toda área admin
**Melhoria**:
- `Cmd/Ctrl + K` - Command palette
- `G + O` - Go to Organizations
- `G + S` - Go to Settings
**Esforço**: 2h

---

### 17. Notificações Push
**Problema**: Admin precisa estar na página para ver alertas
**Melhoria**: Browser push notifications para eventos críticos
**Esforço**: 2h

---

### 18. Dashboard Customizável
**Página**: `/admin`
**Melhoria**: Admin pode escolher quais widgets ver e posição
**Esforço**: 4h (complexo)

---

## Matriz de Priorização

| # | Melhoria | Impacto | Esforço | Score |
|---|----------|---------|---------|-------|
| 1 | Webhooks Dropdown | Alto | Baixo | ⭐⭐⭐⭐⭐ |
| 2 | Logs Paralelo | Médio | Muito Baixo | ⭐⭐⭐⭐⭐ |
| 3 | Email Org Admin | Alto | Baixo | ⭐⭐⭐⭐ |
| 4 | Audit Log | Alto | Médio | ⭐⭐⭐⭐ |
| 5 | Dashboard Cache | Médio | Muito Baixo | ⭐⭐⭐⭐ |
| 6 | Context Indicator | Médio | Baixo | ⭐⭐⭐ |
| 7 | Filtros Avançados | Médio | Médio | ⭐⭐⭐ |
| 8 | Bulk Actions | Médio | Médio | ⭐⭐⭐ |
| 9 | Métricas RT | Baixo | Alto | ⭐⭐ |
| 10 | Histórico | Baixo | Médio | ⭐⭐ |

---

## Plano de Implementação Sugerido

### Sprint 1 (Quick Wins)
- [ ] Paralizar logs page (30min)
- [ ] Adicionar cache dashboard (1h)
- [ ] Implementar webhooks dropdown (2h)

### Sprint 2 (Core)
- [ ] Implementar email de criação de org (2h)
- [ ] Context switch indicator (1h)
- [ ] Filtros avançados (3h)

### Sprint 3 (Compliance)
- [ ] Audit log completo (4h)
- [ ] 2FA para admin (2h)

### Backlog
- Bulk actions
- Métricas em tempo real
- Export CSV
- Dashboard customizável

---

## Métricas de Sucesso

| Melhoria | Métrica | Target |
|----------|---------|--------|
| Logs Paralelo | Tempo de carregamento | < 500ms |
| Dashboard Cache | Requests ao banco | -80% |
| Webhooks Dropdown | Task completion rate | 100% |
| Audit Log | Cobertura de ações | 100% |
| Context Indicator | Erros de contexto | -90% |
