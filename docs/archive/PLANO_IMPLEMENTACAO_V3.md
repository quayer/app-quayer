# 🚀 Plano de Implementação V3 - Quayer Platform
**Data:** 03/10/2025
**Status:** Sprint 3 Concluído - Preparação para Sprint 4
**Progresso Geral:** 75% Completo

---

## ✅ Conquistas Recentes (Sprint 3)

### 🔐 Sistema de Autenticação JWT - 100% Completo
- ✅ Auth procedure reescrito para JWT stateless
- ✅ Validação de token com jose library (Edge Runtime)
- ✅ OrganizationId e organizationRole no contexto
- ✅ Todos os 6 usuários testados e funcionando
- ✅ Hydration errors corrigidos (dashboard + clients)
- ✅ Modal design alinhado com design system

### 🧪 Testes e Validação - 100% Completo
- ✅ Script `test-all-users.js` validando 6 usuários
- ✅ Login funcionando para todos os perfis
- ✅ Instances API retornando dados corretos por org
- ✅ Permissões validadas (403 para não-admin)

### 📚 Documentação - 100% Completo
- ✅ Limpeza de 26 arquivos .md obsoletos
- ✅ Estrutura documental otimizada (9 arquivos essenciais)
- ✅ README.md, CLAUDE.md, AGENT.md atualizados

---

## 🎯 Próximas Tarefas - Sprint 4

### 1️⃣ **UX/UI - Seleção de Organização (Admin)**
**Status:** 🔴 Pendente
**Prioridade:** Alta
**Estimativa:** 4h

**Requisitos:**
- [ ] Admin deve ver seletor de organização no header/sidebar
- [ ] Dropdown com lista de organizações do sistema
- [ ] Ao trocar org, atualizar contexto e JWT
- [ ] Endpoint: `POST /api/v1/auth/switch-organization`
- [ ] Atualizar `currentOrgId` no token e context

**Componentes:**
```tsx
<OrganizationSelector
  organizations={adminOrgs}
  currentOrgId={user.currentOrgId}
  onSwitch={handleSwitchOrg}
/>
```

**Validações:**
- Apenas role `admin` vê o seletor
- Outros usuários (master/manager/user) não veem
- Verificar permissão no controller

---

### 2️⃣ **Restrição de Broker - Apenas Admin**
**Status:** 🔴 Pendente
**Prioridade:** Alta
**Estimativa:** 2h

**Requisitos:**
- [ ] Campo "Broker Type" visível apenas para admin
- [ ] Outros usuários criam instance com broker padrão
- [ ] Validação no backend: apenas admin pode definir broker
- [ ] UI: Condicional `{user.role === 'admin' && <BrokerSelect />}`

**Controllers:**
```typescript
// instances.controller.ts - create action
if (input.brokerType && user.role !== 'admin') {
  throw new Error('Apenas administradores podem escolher broker')
}
```

---

### 3️⃣ **Validação de UX por Tipo de Usuário**
**Status:** 🔴 Pendente
**Prioridade:** Média
**Estimativa:** 3h

**Checklist por Role:**

**Admin:**
- [ ] Acesso a `/admin/clients` (lista usuários)
- [ ] Acesso a `/admin/organizations` (CRUD orgs)
- [ ] Vê todas as instances do sistema
- [ ] Pode trocar de organização
- [ ] Pode escolher broker type

**Master:**
- [ ] Acesso a `/integracoes` (instances da própria org)
- [ ] Pode criar/editar/deletar instances
- [ ] Pode criar novos usuários na org
- [ ] NÃO vê seletor de organização
- [ ] NÃO escolhe broker (usa padrão)

**Manager:**
- [ ] Acesso a `/integracoes` (instances da própria org)
- [ ] Pode criar/editar instances
- [ ] NÃO pode deletar instances
- [ ] NÃO pode criar usuários
- [ ] NÃO vê seletor de organização

**User:**
- [ ] Acesso a `/integracoes` (visualização)
- [ ] Pode enviar mensagens
- [ ] NÃO pode criar/editar/deletar instances
- [ ] NÃO vê configurações avançadas

---

### 4️⃣ **Melhorias de Arquitetura de Páginas**
**Status:** 🔴 Pendente
**Prioridade:** Baixa
**Estimativa:** 5h

**Refatorações:**
- [ ] Criar `<PageLayout>` wrapper para páginas
- [ ] Extrair `<StatsCard>` do dashboard
- [ ] Criar `<DataTable>` reutilizável (clientes, instances)
- [ ] Implementar `<FilterBar>` genérico
- [ ] Criar `<BulkActionBar>` para seleção múltipla

**Padrão:**
```tsx
// src/components/layouts/page-layout.tsx
export function PageLayout({ title, description, actions, children }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  )
}
```

---

### 5️⃣ **Redis Connection Fix**
**Status:** 🟡 Atenção Necessária
**Prioridade:** Média
**Estimativa:** 1h

**Problema Atual:**
- Redis container rodando em Docker
- App tenta conectar em `localhost:6379` mas falha
- Logs mostram `[ioredis] Unhandled error event: ECONNREFUSED`

**Solução:**
- [ ] Verificar se Redis local está conflitando com Docker
- [ ] Considerar usar Upstash Redis (cloud)
- [ ] Ou configurar corretamente ioredis para Docker network
- [ ] Atualizar `.env` com configuração correta

---

## 📊 Progresso por Módulo

| Módulo | Status | Progresso |
|--------|--------|-----------|
| ✅ Autenticação JWT | Completo | 100% |
| ✅ Sistema de Roles | Completo | 100% |
| ✅ API Instances | Completo | 100% |
| ✅ Testes Automatizados | Completo | 100% |
| 🟡 UX Admin | Em Progresso | 60% |
| 🟡 Permissões Granulares | Em Progresso | 70% |
| 🔴 Seleção de Org | Não Iniciado | 0% |
| 🔴 Restrição Broker | Não Iniciado | 0% |
| 🟡 Redis/Cache | Atenção | 50% |

---

## 🎯 Objetivos do Sprint 4

**Duração:** 5 dias
**Foco:** UX Admin + Permissões Refinadas

### Entregáveis:
1. ✅ Admin pode trocar de organização dinamicamente
2. ✅ Broker selection restrito apenas para admin
3. ✅ Validação de UX completa por role
4. ✅ Componentes reutilizáveis criados
5. ⚠️ Redis connection estável

---

## 📝 Notas Técnicas

### Auth Procedure - Mudanças Importantes
**Antes:** Sistema buscava sessão no banco (não existia)
**Depois:** Validação JWT direto com `verifyAccessToken()`

```typescript
// src/features/auth/procedures/auth.procedure.ts
const payload = await verifyAccessToken(token);
const user = await context.db.user.findUnique({
  where: { id: payload.userId },
  include: { organizations: { include: { organization: true } } }
});

return {
  auth: {
    session: {
      user: { ...user, organizationId: payload.currentOrgId }
    }
  }
};
```

### JWT Payload Structure
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "role": "admin|user",
  "currentOrgId": "uuid|null",
  "organizationRole": "master|manager|user|null",
  "type": "access",
  "iat": 1234567890,
  "exp": 1234567990,
  "aud": "quayer-api",
  "iss": "quayer"
}
```

---

## 🚦 Critérios de Aceitação - Sprint 4

**Deve estar funcionando:**
- [ ] Admin faz login → vê seletor de org → troca org → vê instances da nova org
- [ ] Master faz login → NÃO vê seletor → cria instance → broker é padrão
- [ ] Manager faz login → cria instance → NÃO pode deletar
- [ ] User faz login → visualiza instances → NÃO pode editar

**Testes Automatizados:**
- [ ] `test-admin-org-switch.js` - valida troca de org
- [ ] `test-broker-restriction.js` - valida restrição broker
- [ ] `test-role-permissions.js` - valida cada role

---

## 🔮 Roadmap Futuro (Sprints 5-6)

### Sprint 5: Webhooks + Mensagens
- Implementar sistema de webhooks
- CRUD de mensagens WhatsApp
- Histórico de conversas
- Anexos e mídia

### Sprint 6: Analytics + Dashboard Aprimorado
- Gráficos de métricas (Chart.js)
- Filtros avançados de data
- Exportação de relatórios
- KPIs por organização

---

## 🛠️ Como Contribuir

1. Escolha uma tarefa do Sprint 4
2. Crie branch: `git checkout -b feature/nome-da-feature`
3. Desenvolva seguindo padrões do projeto
4. Teste com `npm run test`
5. Commit: `git commit -m "feat: descrição"`
6. PR para review

---

**Última Atualização:** 03/10/2025 22:45 BRT
**Próxima Revisão:** Início do Sprint 4
