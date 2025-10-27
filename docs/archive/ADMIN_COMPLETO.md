# 🔴 ADMIN - Documentação Completa

## 🎯 Visão Geral

O **Admin** é o usuário com `role: admin` no sistema, representando o administrador da plataforma Quayer. Tem acesso total ao sistema e gerencia todas as organizações, clientes e integrações.

**Credenciais de Acesso:**
```
Email: admin@quayer.com
Senha: admin123456
```

---

## 📊 Sidebar do Admin

```
╔═══════════════════════════════════════════════╗
║            QUAYER ADMIN SIDEBAR               ║
╠═══════════════════════════════════════════════╣
║  [Logo Quayer]                                ║
║                                               ║
║  ⚙️ Administração                             ║
║     ├─ 📊 Dashboard           /admin          ║
║     ├─ 🏢 Organizações        /admin/orgs     ║
║     ├─ 👥 Clientes            /admin/clients  ║
║     └─ 🔌 Integrações         /admin/integs   ║
║                                               ║
║  ────────────────────────────────────────     ║
║  👤 Administrator                             ║
║     admin@quayer.com                          ║
║     [Sair]                                    ║
╚═══════════════════════════════════════════════╝
```

**Características da Sidebar:**
- ❌ **NÃO possui** Organization Switcher (admin não pertence a organizações)
- ✅ Menu único "Administração" com 4 sub-itens
- ✅ Sempre visível em todas as páginas do Admin
- ✅ Navegação fixa lateral (não colapsa)

---

## 📄 Páginas do Admin

### 1️⃣ `/admin` - Dashboard Principal

**Rota:** `/admin`
**Título:** Dashboard
**Arquivo:** `src/app/admin/page.tsx`

#### Layout Visual:

```
┌────────────────────────────────────────────────────────────┐
│  Dashboard                                                  │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────┐│
│  │🏢           │  │👥           │  │🔌           │  │🔗  ││
│  │Organizações │  │Usuários     │  │Instâncias   │  │Web ││
│  │     10      │  │     45      │  │     128     │  │ 32 ││
│  │Total cadastr│  │Total ativos │  │WhatsApp ativ│  │Con ││
│  └─────────────┘  └─────────────┘  └─────────────┘  └────┘│
│                                                             │
│  ┌───────────────────────────────┐  ┌──────────────────┐  │
│  │ 📈 Atividade Recente          │  │ 🏢 Organizações  │  │
│  │                               │  │    Recentes      │  │
│  │ Últimas ações realizadas no   │  │                  │  │
│  │ sistema                       │  │ Últimas org      │  │
│  │                               │  │ cadastradas      │  │
│  │ [Em desenvolvimento]          │  │ [Lista aqui]     │  │
│  └───────────────────────────────┘  └──────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

#### Funcionalidades:

**✅ Cards de Estatísticas (4 cards):**

1. **🏢 Organizações**
   - Contador: Total de organizações cadastradas
   - API: `api.organizations.list.query()`
   - Valor: `pagination.total`

2. **👥 Usuários**
   - Contador: Total de usuários ativos
   - ⚠️ **Pendente**: Precisa de endpoint de users
   - Valor atual: `0` (hardcoded)

3. **🔌 Instâncias**
   - Contador: Instâncias WhatsApp ativas
   - API: `api.instances.list.query()`
   - Valor: `pagination.total`

4. **🔗 Webhooks**
   - Contador: Webhooks configurados
   - API: `api.webhooks.list.query()`
   - Valor: `pagination.total`

**✅ Seção de Atividade Recente:**
- Card grande (col-span-4)
- Título: "Atividade Recente"
- Descrição: "Últimas ações realizadas no sistema"
- **Status:** 🟡 Placeholder (sem dados reais)

**✅ Seção de Organizações Recentes:**
- Card médio (col-span-3)
- Título: "Organizações Recentes"
- Descrição: "Últimas organizações cadastradas"
- **Status:** 🟡 Placeholder (sem dados reais)

#### Estado de Loading:

```typescript
// Skeleton UI enquanto carrega
{isLoading && (
  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    {[1,2,3,4].map(i => (
      <Card key={i}>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-16" />
      </Card>
    ))}
  </div>
)}
```

---

### 2️⃣ `/admin/organizations` - Gerenciamento de Organizações

**Rota:** `/admin/organizations`
**Título:** Organizações
**Arquivo:** `src/app/admin/organizations/page.tsx`

#### Layout Visual:

```
┌────────────────────────────────────────────────────────────┐
│  Organizações                          [+ Nova Organização]│
├────────────────────────────────────────────────────────────┤
│                                                             │
│  🔍 [Buscar organizações...]                                │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Nome         │Doc      │Tipo  │Plano  │Inst│Users│⚙️│  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ ACME Corp    │12345678 │PJ    │PRO    │ 10 │ 25  │●││  │
│  │ Tech Ltda    │87654321 │PJ    │BASIC  │  5 │ 10  │●││  │
│  │ João Silva   │11122233 │PF    │FREE   │  1 │  1  │●││  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

#### Funcionalidades:

**✅ Header com Busca:**
- Input de busca com ícone 🔍
- Placeholder: "Buscar organizações..."
- Busca em tempo real (debounce)
- Busca por: nome, documento

**✅ Botão "Nova Organização":**
- Abre modal `CreateOrganizationDialog`
- Permite criar nova organização
- Validação de campos obrigatórios

**✅ Tabela de Organizações:**

| Coluna | Descrição | Tipo |
|--------|-----------|------|
| Nome | Nome da organização | string |
| Documento | CPF/CNPJ | string |
| Tipo | PF (Pessoa Física) ou PJ (Pessoa Jurídica) | badge |
| Plano | Tipo de plano (FREE, BASIC, PRO, ENTERPRISE) | badge |
| Instâncias | Limite de instâncias permitidas | number |
| Usuários | Limite de usuários permitidos | number |
| Status | Ativo ou Inativo | badge |
| Ações | Menu dropdown | dropdown |

**✅ Menu de Ações (Dropdown):**
```
┌────────────────┐
│ ✏️ Editar      │
│ 🗑️ Excluir     │
└────────────────┘
```

**Ação Editar:**
- Abre `EditOrganizationDialog`
- Preenche campos com dados atuais
- Permite editar: nome, documento, tipo, plano, limites

**Ação Excluir:**
- Confirmação: "Tem certeza que deseja excluir esta organização?"
- API: `api.organizations.delete.mutate()`
- Atualiza lista após exclusão

**✅ Estado Vazio:**
```
┌────────────────────────────────────┐
│     Nenhuma organização            │
│     encontrada                     │
│                                    │
│  [Adicionar Organização]           │
└────────────────────────────────────┘
```

**✅ Loading State:**
- Skeleton UI com 5 linhas
- Cada linha com 8 colunas em skeleton

#### API Integrations:

**List Organizations:**
```typescript
const response = await api.organizations.list.query({
  query: {
    page: 1,
    limit: 20,
    search: searchTerm
  }
})
```

**Delete Organization:**
```typescript
await api.organizations.delete.mutate({
  params: { id: organizationId }
})
```

---

### 3️⃣ `/admin/clients` - Gerenciamento de Clientes (Usuários)

**Rota:** `/admin/clients`
**Título:** Clientes
**Arquivo:** `src/app/admin/clients/page.tsx`

#### Layout Visual:

```
┌────────────────────────────────────────────────────────────┐
│  Clientes                                  [+ Novo Cliente] │
│  Lista de todos os clientes cadastrados no sistema          │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │👥           │  │✅           │  │❌           │        │
│  │Total        │  │Ativos       │  │Inativos     │        │
│  │    45       │  │    42       │  │     3       │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                             │
│  🔍 [Buscar por nome ou email...]                          │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Nome         │Email           │Status│Cadastro│⚙️    │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ João Silva   │joao@acme.com   │Ativo │ há 2d  │●●●   │  │
│  │ Maria Santos │maria@tech.com  │Ativo │ há 5d  │●●●   │  │
│  │ Pedro Costa  │pedro@corp.com  │Inativ│há 10d  │●●●   │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

#### Funcionalidades:

**✅ Cards de Estatísticas (3 cards):**

1. **👥 Total de Clientes**
   - Contador: Todos os usuários
   - Icon: Users
   - Cor: Padrão

2. **✅ Ativos**
   - Contador: Usuários com `isActive: true`
   - Icon: UserCheck (verde)
   - Cor: Verde

3. **❌ Inativos**
   - Contador: Usuários com `isActive: false`
   - Icon: UserX (vermelho)
   - Cor: Vermelho

**✅ Busca de Clientes:**
- Input com ícone 🔍
- Placeholder: "Buscar por nome ou email..."
- Busca em tempo real
- Filtra por: `name` ou `email`

**✅ Tabela de Clientes:**

| Coluna | Descrição | Formato |
|--------|-----------|---------|
| Nome | Nome do cliente | `user.name` ou "Sem nome" |
| Email | Email do cliente | `user.email` |
| Status | Ativo/Inativo | Badge (default/secondary) |
| Cadastrado em | Tempo relativo | "há 2 dias" (date-fns) |
| Último Acesso | Tempo relativo | "há 3 horas" ou "Nunca" |
| Ações | Menu dropdown | 3 dots |

**✅ Menu de Ações:**
```
┌────────────────────┐
│ 👁️ Ver Detalhes   │
│ ✏️ Editar         │
│ ⚡ Ativar/Desativar│
└────────────────────┘
```

**⚠️ Status:** Ações de menu estão mapeadas mas **não implementadas** ainda

**✅ Estado Vazio:**
```
┌────────────────────────────────────┐
│       👥                           │
│                                    │
│  Nenhum cliente encontrado         │
│                                    │
│  Adicione o primeiro cliente       │
│  para começar                      │
│                                    │
│  [+ Adicionar Cliente]             │
└────────────────────────────────────┘
```

#### API Integration:

**List Users:**
```typescript
const { data: users } = api.auth.listUsers.useQuery()
```

**Response Structure:**
```typescript
interface User {
  id: string
  name: string
  email: string
  isActive: boolean
  createdAt: Date
  lastLoginAt?: Date
}
```

---

### 4️⃣ `/admin/integracoes` - Visão Global de Integrações

**Rota:** `/admin/integracoes`
**Título:** Integrações
**Arquivo:** `src/app/admin/integracoes/page.tsx`

#### Layout Visual:

```
┌────────────────────────────────────────────────────────────┐
│  Integrações                           [+ Nova Integração] │
│  Gerencie todas as integrações do sistema                  │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│  │Total │ │✅Con │ │❌Des │ │⚡Ativ│ │⚫Inat│            │
│  │ 128  │ │ 95   │ │ 33   │ │ 95  │ │ 33  │            │
│  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘            │
│                                                             │
│  🔍 [Buscar por nome ou telefone...]                       │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │Nome     │Tel      │Prov│Status│Conexão│Criado│⚙️    │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │WhatsApp1│+5511999 │WA  │Ativo │Conect │há 2d │●●●   │  │
│  │Support  │+5511888 │WA  │Ativo │Conect │há 5d │●●●   │  │
│  │Vendas   │-        │WA  │Inativ│Desc   │há 10d│●●●   │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

#### Funcionalidades:

**✅ Cards de Estatísticas (5 cards):**

1. **Total**
   - Todas as instâncias
   - Sem ícone

2. **✅ Conectadas**
   - `status === 'connected'`
   - Icon: CheckCircle2 (verde)

3. **❌ Desconectadas**
   - `status === 'disconnected'`
   - Icon: XCircle (vermelho)

4. **⚡ Ativas**
   - Instâncias ativas
   - Icon: Activity (azul)

5. **⚫ Inativas**
   - Instâncias inativas
   - Icon: PlugZap (cinza)

**✅ Busca de Integrações:**
- Input com ícone 🔍
- Placeholder: "Buscar por nome ou telefone..."
- Busca em: `name` ou `phoneNumber`

**✅ Tabela Completa:**

| Coluna | Descrição | Componente |
|--------|-----------|------------|
| Nome | Nome da instância | `instance.name` |
| Telefone | Número WhatsApp | `instance.phoneNumber` ou "-" |
| Provedor | Logo + Nome do provedor | IMG + "WhatsApp falecomigo.ai" |
| Status | Ativo/Inativo | Badge (default/secondary) |
| Conexão | Conectado/Desconectado | Badge (default/destructive) |
| Agentes | Quantidade de agentes | "0 agente(s)" (hardcoded) |
| Criado em | Tempo relativo | date-fns formatDistanceToNow |
| Atualizado em | Tempo relativo | date-fns formatDistanceToNow |
| Ações | Menu dropdown | 4 opções |

**✅ Menu de Ações:**
```
┌──────────────────────┐
│ 👁️ Ver Detalhes     │
│ ✏️ Editar           │
│ 🔌 Conectar/Reconect│
│ 🔗 Compartilhar     │
└──────────────────────┘
```

**Ações Disponíveis:**

1. **Ver Detalhes:**
   - Abre `DetailsModal`
   - Mostra informações completas
   - Status, QR Code (se conectando), histórico

2. **Editar:**
   - Abre `EditInstanceModal`
   - Permite editar: nome, telefone, webhook

3. **Conectar/Reconectar:**
   - Abre `ConnectionModal`
   - Gera QR Code
   - Monitora status de conexão

4. **Compartilhar:**
   - Abre `ShareModal`
   - Compartilha acesso com usuários

**✅ Estado Vazio:**
```
┌────────────────────────────────────┐
│       🔌                           │
│                                    │
│  Nenhuma integração encontrada     │
│                                    │
│  Crie sua primeira integração      │
│  para começar                      │
│                                    │
│  [+ Criar Integração]              │
└────────────────────────────────────┘
```

**✅ Modais Disponíveis:**
- `CreateInstanceModal` - Criar nova
- `ConnectionModal` - Conectar/QR Code
- `EditInstanceModal` - Editar
- `ShareModal` - Compartilhar
- `DetailsModal` - Ver detalhes

#### API Integration:

**List Instances:**
```typescript
const { data, isLoading, error, refetch } = useInstances()
const instances = data?.data || []
```

---

## 🔌 APIs Disponíveis para Admin

### 1. Organizations API

**Endpoint:** `/api/v1/organizations`

**Ações:**
```typescript
// Listar organizações
api.organizations.list.query({
  query: { page: 1, limit: 20, search?: string }
})

// Criar organização
api.organizations.create.mutate({
  body: {
    name: string
    document: string
    type: 'pf' | 'pj'
    billingType: string
    maxInstances: number
    maxUsers: number
  }
})

// Atualizar organização
api.organizations.update.mutate({
  params: { id: string },
  body: UpdateOrganizationDTO
})

// Deletar organização
api.organizations.delete.mutate({
  params: { id: string }
})
```

### 2. Auth API (Users)

**Endpoint:** `/api/v1/auth`

**Ações:**
```typescript
// Listar usuários
api.auth.listUsers.useQuery()

// Response:
interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}
```

### 3. Instances API

**Endpoint:** `/api/v1/instances`

**Ações:**
```typescript
// Listar todas as instâncias (admin vê todas)
api.instances.list.query()

// Criar instância
api.instances.create.mutate({
  body: {
    name: string
    phoneNumber?: string
    webhookUrl?: string
  }
})

// Editar instância
api.instances.update.mutate({
  params: { id: string },
  body: UpdateInstanceDTO
})

// Conectar instância
api.instances.connect.mutate({
  params: { id: string }
})

// Deletar instância
api.instances.delete.mutate({
  params: { id: string }
})
```

### 4. Webhooks API

**Endpoint:** `/api/v1/webhooks`

**Ações:**
```typescript
// Listar webhooks
api.webhooks.list.query({
  query: { page: 1, limit: 1 }
})
```

---

## 🎨 Componentes e Modais

### CreateOrganizationDialog

**Arquivo:** `src/app/admin/organizations/create-organization-dialog.tsx`

**Campos:**
- Nome da organização
- Documento (CPF/CNPJ)
- Tipo (PF/PJ)
- Tipo de cobrança
- Máximo de instâncias
- Máximo de usuários

**Validação:** Zod schema

### EditOrganizationDialog

**Arquivo:** `src/app/admin/organizations/edit-organization-dialog.tsx`

**Campos:** Mesmos do Create, mas pré-preenchidos

### CreateInstanceModal

**Arquivo:** `src/components/whatsapp/create-instance-modal.tsx`

**Campos:**
- Nome da instância
- Número de telefone (opcional)
- URL do Webhook (opcional)

### ConnectionModal

**Arquivo:** `src/components/whatsapp/connection-modal.tsx`

**Funcionalidades:**
- Gera QR Code
- Monitora status de conexão
- Polling a cada 5 segundos
- Timeout de 2 minutos

### EditInstanceModal

**Arquivo:** `src/components/whatsapp/edit-instance-modal.tsx`

**Campos editáveis:**
- Nome
- Telefone
- Webhook URL

### ShareModal

**Arquivo:** `src/components/whatsapp/share-modal.tsx`

**Funcionalidades:**
- Compartilhar com usuários da organização
- Definir permissões

### DetailsModal

**Arquivo:** `src/components/whatsapp/details-modal.tsx`

**Exibe:**
- Status completo
- QR Code (se disponível)
- Informações técnicas
- Histórico de conexões

---

## 🔒 Proteção e Permissões

### Middleware Protection

```typescript
// middleware.ts
const ADMIN_ONLY_PATHS = ['/admin']

if (isAdminOnlyPath && !isSystemAdmin(payload.role)) {
  // Redireciona para /integracoes
  return NextResponse.redirect('/integracoes')
}
```

### usePermissions Hook

```typescript
const {
  canAccessAdmin,      // ✅ true (admin tem acesso)
  canManageOrganizations, // ✅ true
  canSwitchOrganization,  // ❌ false (admin não tem org)
  isAdmin,               // ✅ true
  organizationRole,      // null (admin não pertence a org)
} = usePermissions()
```

---

## 📊 Fluxo de Navegação do Admin

```
┌─────────────┐
│   /login    │
└──────┬──────┘
       │ Login com admin@quayer.com
       ▼
┌─────────────┐
│   /admin    │ ◄─── Rota inicial
└──────┬──────┘
       │
       ├─── 📊 Dashboard (visão geral)
       │
       ├─── 🏢 /admin/organizations
       │    - Listar organizações
       │    - Criar nova organização
       │    - Editar organização
       │    - Excluir organização
       │
       ├─── 👥 /admin/clients
       │    - Listar todos os usuários
       │    - Ver detalhes de usuários
       │    - Ativar/Desativar usuários
       │
       └─── 🔌 /admin/integracoes
            - Ver todas as integrações do sistema
            - Criar novas integrações
            - Conectar/Desconectar
            - Compartilhar
```

---

## ⚡ Performance e Estado

### Loading States

Todas as páginas implementam:
- ✅ Skeleton UI durante carregamento
- ✅ Mensagens de erro amigáveis
- ✅ Estados vazios com CTAs

### Cache e Refetch

```typescript
// React Query com cache de 30 segundos
staleTime: 30 * 1000

// Refetch automático ao focar janela
refetchOnWindowFocus: true
```

---

## 🐛 Problemas Conhecidos e TODOs

### ⚠️ Implementações Pendentes:

1. **Dashboard - Atividade Recente**
   - Status: Placeholder
   - TODO: Implementar log de atividades

2. **Dashboard - Organizações Recentes**
   - Status: Placeholder
   - TODO: Buscar últimas 5 organizações

3. **Dashboard - Contador de Usuários**
   - Status: Hardcoded como 0
   - TODO: Endpoint de contagem de users

4. **Clientes - Ações do Menu**
   - Status: Mapeadas mas não implementadas
   - TODO: Ver Detalhes, Editar, Ativar/Desativar

5. **Integrações - Contador de Agentes**
   - Status: Hardcoded como "0 agente(s)"
   - TODO: Implementar sistema de agentes

---

## 📝 Resumo Executivo

### ✅ O que está 100% funcional:

1. **Dashboard:**
   - Cards de estatísticas (Orgs, Instances, Webhooks)
   - Layout responsivo

2. **Organizações:**
   - Listagem completa
   - Busca em tempo real
   - Criar organização
   - Editar organização
   - Excluir organização

3. **Clientes:**
   - Listagem de usuários
   - Cards de estatísticas
   - Busca por nome/email
   - Status ativo/inativo

4. **Integrações:**
   - Visão global de todas as instâncias
   - 5 cards de estatísticas
   - Busca e filtros
   - Criar instância
   - Conectar via QR Code
   - Editar instância
   - Compartilhar instância
   - Ver detalhes

### 🟡 O que precisa ser implementado:

1. Atividade recente no Dashboard
2. Organizações recentes
3. Ações de edição de clientes
4. Sistema de agentes
5. Contador de usuários real

---

**Última Atualização:** 04/10/2025
**Versão:** 1.0.0
**Status:** ✅ 85% Completo
