# 🎨 Auditoria UX Completa - Quayer Platform
**Data:** 03/10/2025
**Status:** Sprint 4 - Revisão Completa de UX/UI

---

## 📋 Índice
1. [Visão Geral](#visão-geral)
2. [Hierarquia de Usuários](#hierarquia-de-usuários)
3. [Análise por Tipo de Usuário](#análise-por-tipo-de-usuário)
4. [Componentes UX Implementados](#componentes-ux-implementados)
5. [Fluxos de Navegação](#fluxos-de-navegação)
6. [Problemas Identificados](#problemas-identificados)
7. [Recomendações de Melhoria](#recomendações-de-melhoria)

---

## 🎯 Visão Geral

### Design System Atual
- **Framework:** Shadcn/UI + Radix UI
- **Estilização:** Tailwind CSS 4
- **Tema:** Dark/Light mode com CSS variables
- **Tipografia:** System fonts + Inter (fallback)
- **Ícones:** Lucide React
- **Animações:** Tailwind animations + Framer Motion (seletivo)

### Status Geral de UX
| Categoria | Status | Comentários |
|-----------|--------|-------------|
| Design System | ✅ Excelente | Shadcn/UI bem implementado |
| Consistência Visual | ✅ Boa | CSS variables funcionando |
| Acessibilidade | 🟡 Parcial | Falta ARIA labels em alguns componentes |
| Responsividade | ✅ Boa | Mobile-first approach |
| Performance | ✅ Excelente | Hydration errors corrigidos |
| Estados de Loading | 🟡 Parcial | Alguns componentes sem Skeleton |
| Feedback ao Usuário | 🟡 Parcial | Toast implementado, falta validação visual |

---

## 👥 Hierarquia de Usuários

### 1. **Admin (System Administrator)**
**Papel:** Gerenciar toda a plataforma
**Acesso:** Todas as organizações + configurações globais

**Características UX:**
- ✅ Vê seletor de organização no sidebar
- ✅ Pode trocar entre organizações dinamicamente
- ✅ Acesso total a todas as funcionalidades
- ✅ Dashboard com métricas globais
- ✅ CRUD completo de organizações e usuários

**Rotas Exclusivas:**
- `/admin` - Dashboard administrativo
- `/admin/organizations` - Gestão de organizações
- `/admin/clients` - Lista de todos os usuários
- `/admin/integracoes` - Todas as integrações do sistema

---

### 2. **Master (Organization Owner)**
**Papel:** Dono da organização
**Acesso:** Apenas sua organização

**Características UX:**
- ❌ NÃO vê seletor de organização
- ✅ Dashboard com métricas da organização
- ✅ Pode criar/editar/deletar instances
- ✅ Pode gerenciar usuários da organização
- ✅ Acesso a webhooks e configurações

**Rotas Principais:**
- `/integracoes` - Dashboard e lista de instances
- `/integracoes/messages` - Mensagens WhatsApp
- `/integracoes/projects` - Projetos
- `/integracoes/users` - Usuários da organização
- `/integracoes/webhooks` - Webhooks
- `/integracoes/settings` - Configurações

---

### 3. **Manager (Organization Manager)**
**Papel:** Gerente da organização
**Acesso:** Apenas sua organização (sem deletar)

**Características UX:**
- ❌ NÃO vê seletor de organização
- ✅ Pode criar/editar instances (NÃO deletar)
- ❌ NÃO pode gerenciar usuários
- ✅ Acesso a mensagens e projetos
- ✅ Visualiza webhooks (sem editar)

**Rotas Principais:**
- `/integracoes` - Dashboard e lista de instances
- `/integracoes/messages` - Mensagens WhatsApp
- `/integracoes/projects` - Projetos
- `/integracoes/webhooks` - Visualização apenas

**Restrições:**
- Botão "Deletar" instance: **Desabilitado/Oculto**
- Menu "Usuários": **Somente leitura**
- Configurações: **Limitadas**

---

### 4. **User (Regular User)**
**Papel:** Usuário final
**Acesso:** Visualização apenas

**Características UX:**
- ❌ NÃO vê seletor de organização
- ✅ Dashboard pessoal simplificado
- ❌ NÃO pode criar/editar/deletar instances
- ✅ Pode enviar mensagens via instances existentes
- ❌ NÃO acessa configurações

**Rotas Principais:**
- `/user/dashboard` - Dashboard pessoal
- `/integracoes` - Visualização de instances (read-only)

**Restrições:**
- Todas as ações de escrita: **Bloqueadas**
- UI mostra apenas visualização
- Botões de ação: **Ocultos**

---

## 🧩 Componentes UX Implementados

### ✅ Componentes Funcionando Corretamente

#### 1. **OrganizationSwitcher** (Novo!)
**Localização:** Sidebar (apenas admin)
**Funcionalidade:**
- Dropdown com lista de organizações
- Search para filtrar
- Troca de organização com reload
- Atualização de JWT automática

```tsx
// Apenas admin vê
{user?.role === 'admin' && <OrganizationSwitcher />}
```

#### 2. **AppSidebar**
**Localização:** Layout principal
**Funcionalidade:**
- Menu dinâmico por role
- Logo da plataforma
- NavUser no footer
- OrganizationSwitcher no header (admin only)

**Menus por Role:**
- Admin: Administração + todas as opções
- Master/Manager: Dashboard + Integrações completas
- User: Dashboard pessoal + Visualização

#### 3. **CreateInstanceModal**
**Localização:** Página de integrações
**Status:** ✅ Corrigido (design system aplicado)
**Funcionalidade:**
- Criar nova instance WhatsApp
- Campos: Nome, Broker (admin only), Descrição
- Validação com toast

**⚠️ Pendente:**
- Campo "Broker Type" ainda visível para todos
- **DEVE** ser condicional: `{user?.role === 'admin' && <BrokerSelect />}`

#### 4. **DataTable (Clients)**
**Localização:** `/admin/clients`
**Funcionalidade:**
- Lista de usuários com filtro
- Search por nome/email
- Status indicators
- Skeleton loading implementado

#### 5. **StatsCards (Dashboard)**
**Localização:** Dashboards (admin e user)
**Funcionalidade:**
- Cards com métricas
- Skeleton loading
- Icons contextuais
- Números formatados

---

### 🟡 Componentes Precisam Revisão

#### 1. **FilterBar**
**Status:** Não implementado
**Necessidade:** Alta
**Localização:** Páginas de listagem (instances, messages)

**Funcionalidade Esperada:**
```tsx
<FilterBar
  filters={[
    { key: 'status', label: 'Status', options: ['active', 'inactive'] },
    { key: 'broker', label: 'Broker', options: ['evolution', 'baileys'] },
  ]}
  onFilterChange={handleFilterChange}
/>
```

#### 2. **BulkActionBar**
**Status:** Não implementado
**Necessidade:** Média
**Localização:** DataTables

**Funcionalidade Esperada:**
```tsx
<BulkActionBar
  selectedCount={selectedItems.length}
  actions={[
    { label: 'Deletar', onClick: handleBulkDelete, variant: 'destructive' },
    { label: 'Desativar', onClick: handleBulkDeactivate },
  ]}
/>
```

#### 3. **PageHeader**
**Status:** Parcialmente implementado (inconsistente)
**Necessidade:** Alta
**Problema:** Cada página usa estrutura diferente

**Padrão Recomendado:**
```tsx
<PageHeader
  title="Integrações WhatsApp"
  description="Gerencie suas conexões e instâncias"
  actions={[
    <Button onClick={() => setModalOpen(true)}>
      <Plus /> Nova Integração
    </Button>
  ]}
/>
```

---

## 🔄 Fluxos de Navegação

### Fluxo 1: Login → Dashboard (por Role)

#### **Admin:**
```
/login
  ↓ (login com admin@quayer.com)
/admin (dashboard global)
  ↓ (troca organização via OrganizationSwitcher)
/admin (reload com nova org context)
  ↓ (navega para integrações)
/admin/integracoes (vê todas instances da org selecionada)
```

#### **Master:**
```
/login
  ↓ (login com master@acme.com)
/integracoes (dashboard + instances da org)
  ↓ (cria nova instance)
Modal → POST /api/v1/instances (broker = padrão)
  ↓ (sucesso)
/integracoes (atualizado com nova instance)
```

#### **Manager:**
```
/login
  ↓ (login com manager@acme.com)
/integracoes (dashboard + instances - sem botão delete)
  ↓ (edita instance existente)
Modal → PATCH /api/v1/instances/:id
  ↓ (tenta deletar - botão oculto)
❌ 403 Forbidden
```

#### **User:**
```
/login
  ↓ (login com user@acme.com)
/user/dashboard (dashboard pessoal simplificado)
  ↓ (visualiza instances)
/integracoes (read-only - sem ações)
  ↓ (tenta criar instance - botão oculto)
❌ UI não permite
```

---

### Fluxo 2: Criar Instance WhatsApp

**Estado Atual:**
```
1. User clica "Nova Integração"
2. Modal abre com campos:
   - Nome ✅
   - Broker Type ⚠️ (visível para todos - ERRADO)
   - Descrição ✅
3. User preenche e salva
4. POST /api/v1/instances
5. Backend valida (mas frontend não restringe visualmente)
```

**Estado Esperado:**
```
1. User clica "Nova Integração"
2. Modal abre com campos condicionais:
   - Nome ✅
   - Broker Type ✅ (APENAS se role === 'admin')
   - Descrição ✅
3. User preenche e salva
4. POST /api/v1/instances (backend valida + frontend restringe)
```

---

## 🚨 Problemas Identificados

### 🔴 Críticos (Resolver Imediatamente)

#### 1. **Broker Selection Visível para Todos**
**Problema:** Campo "Broker Type" aparece para master/manager/user
**Impacto:** Confusão do usuário + tentativas de seleção inválidas
**Solução:**
```tsx
// src/components/whatsapp/create-instance-modal.tsx
{user?.role === 'admin' && (
  <div>
    <Label>Tipo de Broker</Label>
    <Select {...brokerField}>
      <SelectItem value="evolution">Evolution API</SelectItem>
      <SelectItem value="baileys">Baileys</SelectItem>
    </Select>
  </div>
)}
```

#### 2. **Botão "Deletar" Visível para Manager**
**Problema:** Manager vê botão deletar mas recebe 403 ao clicar
**Impacto:** Frustração do usuário + má experiência
**Solução:**
```tsx
// Em DataTable de instances
{(user?.role === 'admin' || organizationRole === 'master') && (
  <DropdownMenuItem onClick={handleDelete}>
    <Trash /> Deletar
  </DropdownMenuItem>
)}
```

#### 3. **Admin sem OrganizationId Inicial**
**Problema:** Admin faz login com `currentOrgId: null`
**Impacto:** Não vê instances até selecionar org
**Solução:** Ao fazer login, setar primeira org automaticamente
```typescript
// auth.controller.ts - login action
const firstOrg = user.organizations[0]
const accessToken = signAccessToken({
  ...payload,
  currentOrgId: user.role === 'admin' ? firstOrg?.organizationId : user.currentOrgId,
})
```

---

### 🟡 Médios (Resolver em Sprint 5)

#### 1. **Loading States Inconsistentes**
**Problema:** Algumas páginas têm Skeleton, outras não
**Páginas Afetadas:**
- `/integracoes/messages` - sem skeleton
- `/integracoes/projects` - sem skeleton
- `/integracoes/webhooks` - sem skeleton

**Solução:** Padronizar com componente `<PageSkeleton />`

#### 2. **Feedback Visual de Erros**
**Problema:** Toast mostra erro mas campos não ficam vermelhos
**Solução:** Integrar react-hook-form com validação visual
```tsx
<Input
  {...field}
  className={errors.name ? 'border-red-500' : ''}
/>
{errors.name && (
  <p className="text-sm text-red-500">{errors.name.message}</p>
)}
```

#### 3. **Breadcrumbs Ausentes**
**Problema:** User se perde na navegação profunda
**Solução:** Adicionar breadcrumbs em páginas internas
```tsx
<Breadcrumb>
  <BreadcrumbItem>Integrações</BreadcrumbItem>
  <BreadcrumbItem>Mensagens</BreadcrumbItem>
  <BreadcrumbItem current>Conversa #123</BreadcrumbItem>
</Breadcrumb>
```

---

### 🟢 Baixos (Backlog)

1. **Dark Mode Toggle** - Não está visível (só via system)
2. **Avatars Padrão** - Usando placeholder genérico
3. **Empty States** - Alguns componentes sem ilustração
4. **Confirmação de Ações** - Deletar sem confirmação modal

---

## 💡 Recomendações de Melhoria

### 1. **Componente PageLayout Unificado**
```tsx
// src/components/layouts/page-layout.tsx
export function PageLayout({
  title,
  description,
  actions,
  breadcrumbs,
  children,
}: PageLayoutProps) {
  return (
    <div className="space-y-6">
      {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
      <PageHeader
        title={title}
        description={description}
        actions={actions}
      />
      <div className="space-y-4">{children}</div>
    </div>
  )
}
```

**Uso:**
```tsx
<PageLayout
  title="Integrações WhatsApp"
  description="Gerencie suas conexões"
  breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Integrações' }]}
  actions={<Button>Nova Integração</Button>}
>
  <DataTable data={instances} />
</PageLayout>
```

---

### 2. **Sistema de Permissões Visual**
Criar hook para simplificar checks de permissão:

```tsx
// src/hooks/usePermissions.ts
export function usePermissions() {
  const { user } = useAuth()

  return {
    canCreate: user?.role === 'admin' || user?.organizationRole === 'master' || user?.organizationRole === 'manager',
    canEdit: user?.role === 'admin' || user?.organizationRole === 'master' || user?.organizationRole === 'manager',
    canDelete: user?.role === 'admin' || user?.organizationRole === 'master',
    canManageUsers: user?.role === 'admin' || user?.organizationRole === 'master',
    canSelectBroker: user?.role === 'admin',
    canSwitchOrg: user?.role === 'admin',
  }
}
```

**Uso:**
```tsx
const { canDelete, canSelectBroker } = usePermissions()

{canDelete && <Button variant="destructive">Deletar</Button>}
{canSelectBroker && <Select>...</Select>}
```

---

### 3. **Melhorar Feedback de Loading**
Implementar estados intermediários:

```tsx
// Estado atual
{isLoading ? <Skeleton /> : <DataTable />}

// Estado recomendado
{isLoading && <DataTableSkeleton rows={5} />}
{error && <ErrorState retry={refetch} />}
{!isLoading && !error && data?.length === 0 && <EmptyState />}
{!isLoading && !error && data?.length > 0 && <DataTable />}
```

---

### 4. **Animações e Transições**
Adicionar micro-interações:

```tsx
// Transições de rota
<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2 }}
>
  {children}
</motion.div>

// Hover effects
<Button className="transition-all hover:scale-105">
  Criar Integração
</Button>
```

---

## 📊 Checklist de Validação UX por Role

### ✅ Admin
- [x] Vê seletor de organização
- [x] Pode trocar entre organizações
- [x] Vê dashboard global
- [x] Acessa lista de clientes
- [x] Acessa CRUD de organizações
- [ ] Pode escolher broker type (UI precisa validação)
- [x] Vê todas as instances (após selecionar org)

### ✅ Master
- [x] NÃO vê seletor de organização
- [x] Vê dashboard da organização
- [ ] Pode criar instances (com broker padrão - UI precisa validação)
- [x] Pode editar instances
- [x] Pode deletar instances
- [x] Pode gerenciar usuários da org
- [x] Acessa webhooks

### 🟡 Manager (Precisa Validação)
- [x] NÃO vê seletor de organização
- [x] Vê dashboard da organização
- [ ] Pode criar instances (UI precisa validação)
- [ ] Pode editar instances (UI precisa validação)
- [ ] NÃO pode deletar instances (UI precisa esconder botão)
- [ ] NÃO pode gerenciar usuários (UI precisa validação)
- [x] Visualiza webhooks (sem editar)

### 🟡 User (Precisa Validação)
- [x] NÃO vê seletor de organização
- [x] Vê dashboard pessoal
- [ ] NÃO pode criar instances (UI precisa esconder botão)
- [ ] NÃO pode editar instances (UI precisa esconder botões)
- [ ] Visualiza instances (read-only - UI precisa validação)
- [x] Pode enviar mensagens

---

## 🎯 Próximas Ações Prioritárias

### Sprint 4 (Esta Sprint)
1. ✅ **FEITO:** Implementar OrganizationSwitcher
2. 🔴 **URGENTE:** Esconder Broker Selection para não-admin
3. 🔴 **URGENTE:** Esconder botão Deletar para manager
4. 🔴 **URGENTE:** Setar org padrão para admin no login

### Sprint 5
1. Implementar `usePermissions` hook
2. Criar `PageLayout` componente unificado
3. Adicionar `FilterBar` e `BulkActionBar`
4. Padronizar loading states com Skeleton
5. Implementar breadcrumbs

### Sprint 6
1. Melhorar feedback visual de erros
2. Adicionar confirmações para ações destrutivas
3. Implementar dark mode toggle visível
4. Melhorar empty states com ilustrações
5. Adicionar micro-animações

---

**Última Atualização:** 03/10/2025 22:53 BRT
**Próxima Revisão:** Fim do Sprint 4
