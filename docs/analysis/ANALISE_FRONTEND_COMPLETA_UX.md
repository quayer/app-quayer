# 🎨 Análise Completa Frontend + UX - Quayer

**Data**: 2025-10-16
**Versão**: 1.0.0

---

## 📊 Status Atual: Páginas Existentes vs APIs Disponíveis

### Resumo Executivo

| Área | Páginas | APIs | Status | Gap |
|------|---------|------|--------|-----|
| **Autenticação** | 12 | 22 | ✅ 90% | Login/Register OK, falta admin users |
| **Admin** | 8 | ~156 | ⚠️ 20% | Falta MUITO (CRM, Kanban, Labels, etc) |
| **Organizações** | 1 | 10 | ⚠️ 30% | Falta CRUD completo, membros |
| **Integrações** | 6 | 18 | ✅ 80% | Bom! Falta profile

, webhooks |
| **CRM/Contatos** | 0 | 6 | ❌ 0% | ZERO páginas! |
| **Mensagens/Chat** | 1 | 17 | ⚠️ 10% | Apenas listagem |
| **Kanban/Funil** | 0 | 7 | ❌ 0% | ZERO páginas! |
| **Projetos** | 1 | 7 | ⚠️ 20% | Apenas listagem |
| **Departamentos** | 0 | 6 | ❌ 0% | ZERO páginas! |
| **Labels** | 0 | 8 | ❌ 0% | ZERO páginas! |
| **Tabulações/Tags** | 0 | 6 | ❌ 0% | ZERO páginas! |
| **Dashboard** | 3 | 5 | ✅ 60% | OK |
| **Grupos WhatsApp** | 0 | 11 | ❌ 0% | ZERO páginas! |
| **Chamadas** | 0 | 4 | ❌ 0% | ZERO páginas! |
| **Webhooks** | 2 | 9 | ⚠️ 40% | Falta deliveries, retry |

**Total**: ~34 páginas vs 156 rotas API = **21% de cobertura** ❌

---

## 🗂️ Páginas Existentes (Detalhado)

### 1. 🔐 Autenticação (12 páginas) - ✅ COMPLETO

| Página | Rota | Role | API Usada | Status |
|--------|------|------|-----------|--------|
| Login | `/login` | Pública | `POST /auth/login` | ✅ OK |
| Login OTP | `/login/verify` | Pública | `POST /auth/verify-login-otp` | ✅ OK |
| Login Magic | `/login/verify-magic` | Pública | `POST /auth/verify-magic-link` | ✅ OK |
| Registro | `/register` | Pública | `POST /auth/register` | ✅ OK |
| Signup | `/signup` | Pública | `POST /auth/signup-otp` | ✅ OK |
| Signup OTP | `/signup/verify` | Pública | `POST /auth/verify-signup-otp` | ✅ OK |
| Signup Magic | `/signup/verify-magic` | Pública | `POST /auth/verify-magic-link` | ✅ OK |
| Esqueci Senha | `/forgot-password` | Pública | `POST /auth/forgot-password` | ✅ OK |
| Reset Senha | `/reset-password/[token]` | Pública | `POST /auth/reset-password` | ✅ OK |
| Verificar Email | `/verify-email` | Pública | `POST /auth/verify-email` | ✅ OK |
| Google Callback | `/google-callback` | Pública | `POST /auth/google/callback` | ✅ OK |
| Onboarding | `/onboarding` | Autenticado | `POST /onboarding/complete` | ✅ OK |

**Faltando**:
- ❌ Gerenciar Usuários (Admin) - `GET /auth/users`, `POST /auth/users`
- ❌ Trocar Senha (Perfil) - `POST /auth/change-password`
- ❌ Atualizar Perfil - `PATCH /auth/profile`

---

### 2. 🏢 Admin (8 páginas) - ⚠️ INCOMPLETO

| Página | Rota | Role | API Usada | Status |
|--------|------|------|-----------|--------|
| Dashboard Admin | `/admin` | Admin | Server Action | ✅ OK |
| Organizações | `/admin/organizations` | Admin | `GET /organizations` | ✅ OK |
| Brokers | `/admin/brokers` | Admin | Nenhuma (placeholder) | ⚠️ Não conectado |
| Clientes | `/admin/clients` | Admin | Nenhuma (placeholder) | ⚠️ Não conectado |
| Integrações | `/admin/integracoes` | Admin | `GET /instances` | ✅ OK |
| Logs | `/admin/logs` | Admin | Nenhuma (placeholder) | ⚠️ Não conectado |
| Permissões | `/admin/permissions` | Admin | Nenhuma (placeholder) | ⚠️ Não conectado |
| Webhooks | `/admin/webhooks` | Admin | `GET /webhooks` | ⚠️ Parcial |

**Problemas**:
- ⚠️ Muitas páginas são **placeholders** sem API conectada
- ⚠️ Falta CRUD completo (Create, Update, Delete)
- ❌ Falta telas de: Usuários, Departamentos, Labels, Kanban, CRM

---

### 3. 📱 Integrações (6 páginas) - ✅ BOM!

| Página | Rota | Role | API Usada | Status |
|--------|------|------|-----------|--------|
| Lista Integrações | `/integracoes` | Org | `GET /instances` | ✅ OK |
| Dashboard Integração | `/integracoes/dashboard` | Org | `GET /dashboard/*` | ✅ OK |
| Conversas | `/integracoes/conversations` | Org | `GET /sessions` | ✅ OK |
| Compartilhar | `/integracoes/compartilhar/[token]` | Pública | `GET /share/:token` | ✅ OK |
| Configurações | `/integracoes/settings` | Org | Nenhuma | ⚠️ Não conectado |
| Usuários | `/integracoes/users` | Org | Nenhuma | ⚠️ Não conectado |
| Admin Clients | `/integracoes/admin/clients` | Admin | Nenhuma | ⚠️ Não conectado |

**Faltando**:
- ❌ Detalhes da Instância (QR Code, Status, Logs)
- ❌ Editar Perfil WhatsApp (`PUT /instances/:id/profile/name`)
- ❌ Configurar Webhooks da Instância (`POST /instances/:id/webhook`)
- ❌ Restart Instância (`POST /instances/:id/restart`)

---

### 4. 🗨️ Conversas/Chat (1 página) - ❌ MUITO INCOMPLETO

| Página | Rota | Role | API Usada | Status |
|--------|------|------|-----------|--------|
| Conversas Públicas | `/(public)/conversas` | Pública | Nenhuma | ⚠️ Não conectado |
| Conversas Org | `/integracoes/conversations` | Org | `GET /sessions` | ⚠️ Parcial |

**Faltando**:
- ❌ Tela de Chat (conversa individual com mensagens)
- ❌ Enviar Mensagem (`POST /messages`)
- ❌ Reagir a Mensagem (`POST /messages/:id/react`)
- ❌ Marcar como Lida (`POST /messages/:id/mark-read`)
- ❌ Bloquear/Desbloquear IA (`POST /sessions/:id/block-ai`)
- ❌ Fechar Sessão (`POST /sessions/:id/close`)
- ❌ Adicionar Tags (`POST /sessions/:id/tags`)
- ❌ Arquivar (`POST /chats/:id/archive`)
- ❌ Bloquear Contato (`POST /chats/:id/block`)

---

### 5. 👤 Usuário (1 página) - ❌ MUITO INCOMPLETO

| Página | Rota | Role | API Usada | Status |
|--------|------|------|-----------|--------|
| Dashboard User | `/user/dashboard` | User | Nenhuma | ⚠️ Não conectado |

**Faltando**:
- ❌ Perfil do Usuário
- ❌ Trocar Senha
- ❌ Notificações
- ❌ Minhas Organizações

---

### 6. 🏢 Organizações (1 página) - ⚠️ INCOMPLETO

| Página | Rota | Role | API Usada | Status |
|--------|------|------|-----------|--------|
| Minha Organização | `/(dashboard)/organizacao` | Org | Nenhuma | ⚠️ Não conectado |

**Faltando**:
- ❌ CRUD Organizações (`POST /organizations`, `PATCH /organizations/:id`)
- ❌ Gerenciar Membros (`GET /organizations/:id/members`)
- ❌ Adicionar/Remover Membros
- ❌ Alterar Roles de Membros

---

### 7. 🔗 Públicas (3 páginas) - ✅ OK

| Página | Rota | Role | API Usada | Status |
|--------|------|------|-----------|--------|
| Conectar | `/(public)/connect` | Pública | Nenhuma | ✅ OK |
| Conectar Token | `/(public)/connect/[token]` | Pública | `GET /share/:token` | ✅ OK |
| Conversas | `/(public)/conversas` | Pública | Nenhuma | ⚠️ Não conectado |

---

## ❌ GAPS CRÍTICOS: Páginas Que Faltam

### 1. 📊 CRM/Contatos (0 páginas) - **CRÍTICO!**

**APIs Disponíveis**: 6 rotas
**Páginas Necessárias**:

| Página | Rota Sugerida | Role | API Principal | Prioridade |
|--------|---------------|------|---------------|------------|
| Lista Contatos | `/crm/contatos` | Org | `GET /contacts` | 🔴 ALTA |
| Detalhes Contato | `/crm/contatos/[id]` | Org | `GET /contacts/:id` | 🔴 ALTA |
| Editar Contato | `/crm/contatos/[id]/editar` | Org | `PATCH /contacts/:id` | 🟡 MÉDIA |
| Adicionar Tags | Modal em Detalhes | Org | `POST /contacts/:id/tabulations` | 🟡 MÉDIA |

**Por que é crítico?**
- ✅ CRM é o **core** do produto
- ✅ Contatos são a base para tudo (mensagens, sessões, tags)
- ✅ Sem UI, o usuário não consegue gerenciar clientes!

---

### 2. 📋 Kanban/Funil de Vendas (0 páginas) - **CRÍTICO!**

**APIs Disponíveis**: 7 rotas
**Páginas Necessárias**:

| Página | Rota Sugerida | Role | API Principal | Prioridade |
|--------|---------------|------|---------------|------------|
| Lista Quadros | `/crm/kanban` | Org | `GET /kanban/boards` | 🔴 ALTA |
| Quadro Kanban | `/crm/kanban/[id]` | Org | `GET /kanban/boards/:id` | 🔴 ALTA |
| Criar Quadro | Modal | Master | `POST /kanban/boards` | 🟡 MÉDIA |
| Gerenciar Colunas | Modal | Master | `POST /kanban/columns` | 🟡 MÉDIA |

**Diferença Kanban vs Labels vs Tabulações?**

| Recurso | O que é | Exemplo | Onde usa |
|---------|---------|---------|----------|
| **Kanban** | Funil visual com colunas | "Novo Lead → Qualificado → Proposta → Fechado" | Vendas, Suporte |
| **Tabulações** | Tags categóricas para contatos | "VIP", "Lead Frio", "Cliente Ativo" | Filtrar contatos |
| **Labels** | Etiquetas genéricas | "Urgente", "Feedback", "Bug" | Organização geral |

**Fluxo ideal**:
1. Contato entra → Adiciona **tabulação** "Lead Novo"
2. Tabulação "Lead Novo" está vinculada ao **Kanban** de Vendas
3. Contato aparece na coluna "Novo Lead"
4. Atendente arrasta para "Qualificado" → Atualiza tabulação
5. **Labels** marcam características extras ("Urgente", "VIP")

---

### 3. 🏷️ Tabulações/Tags (0 páginas) - **CRÍTICO!**

**APIs Disponíveis**: 6 rotas
**Páginas Necessárias**:

| Página | Rota Sugerida | Role | API Principal | Prioridade |
|--------|---------------|------|---------------|------------|
| Gerenciar Tabulações | `/configuracoes/tabulacoes` | Master | `GET /tabulations` | 🔴 ALTA |
| Criar Tabulação | Modal | Master | `POST /tabulations` | 🔴 ALTA |
| Editar Tabulação | Modal | Master | `PATCH /tabulations/:id` | 🟡 MÉDIA |
| Vincular ao Kanban | Modal | Master | `POST /tabulations/:id/integrations` | 🟡 MÉDIA |

**Por que Master?**
- ✅ Tabulações afetam **toda a organização**
- ✅ Criar/deletar tabulações deve ser controlado
- ✅ Users podem **usar** mas não criar

---

### 4. 🔖 Labels (0 páginas) - **MÉDIA**

**APIs Disponíveis**: 8 rotas
**Páginas Necessárias**:

| Página | Rota Sugerida | Role | API Principal | Prioridade |
|--------|---------------|------|---------------|------------|
| Gerenciar Labels | `/configuracoes/labels` | Master | `GET /labels` | 🟡 MÉDIA |
| Criar Label | Modal | Master | `POST /labels` | 🟡 MÉDIA |
| Estatísticas | `/configuracoes/labels/stats` | Master | `GET /labels/stats` | 🟢 BAIXA |

**Diferença Labels vs Tabulações?**

| Característica | Labels | Tabulações |
|----------------|--------|------------|
| **Escopo** | Genérico | Específico para contatos |
| **Uso** | Organizar qualquer coisa | Categorizar contatos |
| **Kanban** | ❌ Não vincula | ✅ Vincula ao funil |
| **Exemplo** | "Urgente", "Revisar" | "Cliente VIP", "Lead Frio" |

---

### 5. 🏢 Departamentos (0 páginas) - **MÉDIA**

**APIs Disponíveis**: 6 rotas
**Páginas Necessárias**:

| Página | Rota Sugerida | Role | API Principal | Prioridade |
|--------|---------------|------|---------------|------------|
| Gerenciar Departamentos | `/configuracoes/departamentos` | Master | `GET /departments` | 🟡 MÉDIA |
| Criar Departamento | Modal | Master | `POST /departments` | 🟡 MÉDIA |
| Ativar/Desativar | Toggle | Master | `PATCH /departments/:id/toggle` | 🟡 MÉDIA |

**Para que serve?**
- ✅ Organizar atendimento (Vendas, Suporte, Financeiro)
- ✅ Rotear mensagens para departamento correto
- ✅ Relatórios por departamento

---

### 6. 📂 Projetos (0 páginas CRUD) - **MÉDIA**

**Páginas Existentes**: 1 (listagem)
**APIs Disponíveis**: 7 rotas
**Faltando**:

| Página | Rota Sugerida | Role | API Principal | Prioridade |
|--------|---------------|------|---------------|------------|
| Criar Projeto | Modal | Master | `POST /projects` | 🟡 MÉDIA |
| Editar Projeto | Modal | Master | `PATCH /projects/:id` | 🟡 MÉDIA |
| Vincular Instâncias | Modal | Master | `POST /projects/:id/instances` | 🟡 MÉDIA |

---

### 7. 👥 Grupos WhatsApp (0 páginas) - **BAIXA**

**APIs Disponíveis**: 11 rotas
**Páginas Necessárias**:

| Página | Rota Sugerida | Role | API Principal | Prioridade |
|--------|---------------|------|---------------|------------|
| Lista Grupos | `/grupos` | Org | `GET /groups` | 🟢 BAIXA |
| Detalhes Grupo | `/grupos/[jid]` | Org | `GET /groups/:groupJid` | 🟢 BAIXA |
| Criar Grupo | Modal | Org | `POST /groups` | 🟢 BAIXA |
| Gerenciar Membros | Modal | Admin | `POST /groups/:groupJid/participants` | 🟢 BAIXA |

---

### 8. 📞 Chamadas (0 páginas) - **BAIXA**

**APIs Disponíveis**: 4 rotas
**Páginas Necessárias**:

| Página | Rota Sugerida | Role | API Principal | Prioridade |
|--------|---------------|------|---------------|------------|
| Histórico Chamadas | `/chamadas` | Org | `GET /calls` | 🟢 BAIXA |
| Detalhes Chamada | `/chamadas/[id]` | Org | `GET /calls/:id` | 🟢 BAIXA |

---

### 9. ✏️ Atributos Customizados (0 páginas) - **BAIXA**

**APIs Disponíveis**: 10 rotas
**Páginas Necessárias**:

| Página | Rota Sugerida | Role | API Principal | Prioridade |
|--------|---------------|------|---------------|------------|
| Gerenciar Atributos | `/configuracoes/atributos` | Master | `GET /attribute` | 🟢 BAIXA |
| Criar Atributo | Modal | Master | `POST /attribute` | 🟢 BAIXA |

**Para que serve?**
- ✅ Campos customizados para contatos (CPF, Data Nascimento, Empresa)
- ✅ Cada org define seus próprios campos

---

### 10. 📝 Observações (0 páginas) - **BAIXA**

**APIs Disponíveis**: 4 rotas
**Faltando**: Interface dentro da página de Contatos

---

## 🎯 Estrutura de Roles e Acesso

### Hierarquia de Permissões

```
Admin (Sistema)
  └─ Acesso total ao sistema
  └─ Gerenciar todas organizações
  └─ Ver logs de sistema
  └─ Gerenciar brokers/providers

Master (Organização)
  └─ Acesso total à organização
  └─ Gerenciar membros
  └─ Criar/editar: Tabulações, Labels, Departamentos, Kanban
  └─ Configurações da organização

Manager (Organização)
  └─ Gerenciar atendimento
  └─ Ver relatórios
  └─ Atribuir tags/labels
  └─ Não pode alterar configurações

User (Organização)
  └─ Atender conversas
  └─ Ver contatos
  └─ Enviar mensagens
  └─ Não pode configurar nada
```

---

## 🗺️ Mapa de Acesso por Página

### 🔴 Admin (Sistema)

| Página | Rota | Pode Acessar |
|--------|------|--------------|
| Dashboard Admin | `/admin` | Admin |
| Gerenciar Organizações | `/admin/organizations` | Admin |
| Gerenciar Usuários | `/admin/users` | Admin |
| Gerenciar Brokers | `/admin/brokers` | Admin |
| Logs do Sistema | `/admin/logs` | Admin |
| Permissões | `/admin/permissions` | Admin |
| Webhooks Global | `/admin/webhooks` | Admin |

### 🟡 Master (Organização)

| Página | Rota | Pode Acessar |
|--------|------|--------------|
| Configurações Org | `/configuracoes` | Master, Manager |
| Tabulações | `/configuracoes/tabulacoes` | Master |
| Labels | `/configuracoes/labels` | Master |
| Departamentos | `/configuracoes/departamentos` | Master |
| Kanban | `/crm/kanban` | Master, Manager |
| Criar Kanban | Modal | Master |
| Atributos | `/configuracoes/atributos` | Master |
| Membros Org | `/organizacao/membros` | Master |
| Projetos | `/projetos` | Master, Manager |
| Webhooks Org | `/configuracoes/webhooks` | Master |

### 🟢 Manager + User (Organização)

| Página | Rota | Pode Acessar |
|--------|------|--------------|
| Dashboard | `/dashboard` | Todos |
| Contatos | `/crm/contatos` | Todos |
| Conversas | `/conversas` | Todos |
| Chat Individual | `/conversas/[id]` | Todos |
| Mensagens | Dentro do Chat | Todos |
| Integrações | `/integracoes` | Master, Manager |
| Grupos | `/grupos` | Todos |
| Chamadas | `/chamadas` | Todos |

---

## 🎨 Recomendações UX por Página

### 1. 📊 CRM/Contatos (CRIAR!)

**Página**: `/crm/contatos`

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ [🔍 Buscar contato...]  [🏷️ Tags ▼]  [+ Novo]      │
├─────────────────────────────────────────────────────┤
│ 📊 Estatísticas                                     │
│ [250 Contatos] [120 VIP] [80 Leads] [30 Novos]    │
├──────────────┬──────────────────────────────────────┤
│ FILTROS      │ LISTA DE CONTATOS                    │
│              │                                      │
│ □ VIP        │ 👤 João Silva                       │
│ □ Lead Frio  │    +55 11 99999-9999                │
│ □ Cliente    │    🏷️ VIP, Cliente Ativo            │
│              │    💬 Última msg: há 2 horas        │
│ Departamento │    ───────────────────────────────  │
│ □ Vendas     │ 👤 Maria Santos                     │
│ □ Suporte    │    +55 11 88888-8888                │
│              │    🏷️ Lead Novo                      │
│              │    💬 Última msg: há 1 dia          │
└──────────────┴──────────────────────────────────────┘
```

**APIs Usadas**:
- `GET /contacts` - Listar com filtros
- `GET /contacts/:id` - Detalhes
- `POST /contacts/:id/tabulations` - Adicionar tags
- `PATCH /contacts/:id` - Editar

**Componentes Necessários**:
- ContactList (tabela/cards)
- ContactFilters (sidebar)
- ContactDetails (drawer lateral)
- AddTagsModal

---

### 2. 📋 Kanban/Funil (CRIAR!)

**Página**: `/crm/kanban/[id]`

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ Funil de Vendas  [⚙️ Configurar]  [+ Nova Coluna]   │
├─────────────────────────────────────────────────────┤
│  NOVO LEAD    │  QUALIFICADO  │  PROPOSTA  │ FECHADO│
│  (12)         │  (8)          │  (5)       │ (3)    │
├───────────────┼───────────────┼────────────┼────────┤
│ 👤 João Silva │ 👤 Ana Costa  │ 👤 Pedro   │ 👤 Luc │
│ +55 11 9999   │ +55 11 8888   │ +55 11 777 │ +55 1  │
│ 💬 há 2h      │ 💬 há 5h      │ 📞 Ligar   │ ✅ R$  │
│               │               │            │        │
│ 👤 Maria      │ 👤 Carlos     │            │        │
│ +55 11 6666   │ +55 11 5555   │            │        │
│ 💬 há 1 dia   │ ⏰ Agendar    │            │        │
│               │               │            │        │
│ [+ Card]      │ [+ Card]      │ [+ Card]   │[+ Card]│
└───────────────┴───────────────┴────────────┴────────┘
```

**APIs Usadas**:
- `GET /kanban/boards/:id` - Dados do quadro
- `POST /kanban/columns` - Criar coluna
- `PATCH /kanban/columns/:id` - Mover card (atualiza tabulação)

**Componentes Necessários**:
- KanbanBoard (dnd-kit ou react-beautiful-dnd)
- KanbanColumn
- KanbanCard
- CreateColumnModal
- ConfigureBoardModal

**Integração com Tabulações**:
```typescript
// Quando arrasta card de "Novo Lead" para "Qualificado"
const handleCardMove = async (contactId, newColumnId) => {
  const newTabulation = getTabulation FromColumn(newColumnId);

  // Atualizar tabulação do contato
  await api.contacts.tabulations.create.mutate({
    contactId,
    tabulationId: newTabulation.id
  });
};
```

---

### 3. 💬 Chat Individual (CRIAR!)

**Página**: `/conversas/[sessionId]`

**Layout**:
```
┌─────────────────────────────────────────────────────┐
│ ← 👤 João Silva  +55 11 99999-9999  [⋮ Menu]       │
│    🟢 Online • VIP, Cliente Ativo                   │
├─────────────────────────────────────────────────────┤
│ MENSAGENS                        │ DETALHES (→)    │
│                                  │                  │
│ João Silva  10:05                │ 📋 Informações  │
│ ┌─────────────────────┐          │ Nome: João Silva│
│ │ Oi                  │          │ Tel: +55 11...  │
│ │                     │          │                  │
│ │ [10:05] Olha isso   │          │ 🏷️ Tags          │
│ │                     │          │ • VIP           │
│ │ [10:05] 🎤 Eu quer...│         │ • Cliente Ativo │
│ │ (áudio transcrito)  │          │ [+ Adicionar]   │
│ │                     │          │                  │
│ │ [10:05] 📷 Nota...  │          │ 🏢 Departamento │
│ │ (imagem com OCR)    │          │ Vendas          │
│ └─────────────────────┘          │                  │
│                                  │ 📝 Observações  │
│ Você  10:10                      │ [+ Nova nota]   │
│           ┌──────────────┐       │                  │
│           │ Perfeito!    │       │ 📊 Kanban       │
│           │ Vou preparar │       │ Coluna:         │
│           │ a proposta   │       │ "Proposta"      │
│           └──────────────┘       │ [Mover card]    │
├──────────────────────────────────┤                  │
│ [💬 Digite uma mensagem...] [📎] │                  │
│ [😊] [🎤] [📷]            [Enviar]│                  │
└─────────────────────────────────────────────────────┘
```

**APIs Usadas**:
- `GET /sessions/:id` - Dados da sessão
- `GET /messages?sessionId=:id` - Mensagens
- `POST /messages` - Enviar mensagem
- `POST /messages/:id/react` - Reagir
- `POST /messages/:id/mark-read` - Marcar lida
- `POST /sessions/:id/tags` - Adicionar tags
- `POST /sessions/:id/close` - Encerrar
- `POST /sessions/:id/block-ai` - Bloquear IA
- `POST /contact-observation` - Adicionar observação
- `GET /sse/session/:sessionId` - Real-time updates

**Componentes Necessários**:
- ChatLayout (split view)
- MessageList (virtualized)
- MessageBubble (texto, mídia, áudio, concatenado)
- MessageInput (com rich editor)
- SessionSidebar (detalhes, tags, observações)
- AudioPlayer (para áudios transcritos)
- ImageViewer (para imagens com OCR)

**Real-time**:
```typescript
// SSE para mensagens em tempo real
useEffect(() => {
  const eventSource = new EventSource(`/api/v1/sse/session/${sessionId}`);

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'message.received') {
      addMessageToUI(data.message);
    }
  };

  return () => eventSource.close();
}, [sessionId]);
```

---

### 4. ⚙️ Configurações (CRIAR!)

**Página**: `/configuracoes`

**Tabs**:
- 🏷️ Tabulações
- 🔖 Labels
- 🏢 Departamentos
- 📋 Kanban
- ✏️ Atributos
- 🔔 Webhooks
- 👥 Membros (Master only)

**Layout Tab Tabulações**:
```
┌─────────────────────────────────────────────────────┐
│ Tabulações                              [+ Nova]    │
├─────────────────────────────────────────────────────┤
│ Nome          │ Cor    │ Kanban       │ Ações      │
│ VIP           │ 🟡     │ Funil Vendas │ [✏️] [🗑️]  │
│ Lead Frio     │ 🔵     │ Funil Vendas │ [✏️] [🗑️]  │
│ Cliente Ativo │ 🟢     │ -            │ [✏️] [🗑️]  │
│ Lead Novo     │ 🟠     │ Funil Vendas │ [✏️] [🗑️]  │
└─────────────────────────────────────────────────────┘
```

**APIs Usadas**:
- `GET /tabulations` - Listar
- `POST /tabulations` - Criar
- `PATCH /tabulations/:id` - Editar
- `DELETE /tabulations/:id` - Deletar
- `POST /tabulations/:id/integrations` - Vincular ao Kanban

---

## 🚀 Plano de Implementação Frontend

### Fase 1: CRM Core (2-3 semanas) 🔴 URGENTE

**Objetivo**: Ter CRM funcional para gerenciar contatos

1. **Semana 1**: CRM/Contatos
   - [ ] Página `/crm/contatos` (lista + filtros)
   - [ ] Página `/crm/contatos/[id]` (detalhes)
   - [ ] Modal adicionar/remover tags
   - [ ] Editar informações do contato

2. **Semana 2**: Chat Individual
   - [ ] Página `/conversas/[sessionId]` (layout split)
   - [ ] Lista de mensagens (virtualized)
   - [ ] Enviar mensagem (texto, mídia)
   - [ ] Sidebar com detalhes do contato
   - [ ] Real-time com SSE

3. **Semana 3**: Tabulações + Labels
   - [ ] Página `/configuracoes/tabulacoes` (CRUD)
   - [ ] Página `/configuracoes/labels` (CRUD)
   - [ ] Integração com CRM (adicionar tags)

---

### Fase 2: Kanban/Funil (2 semanas) 🟡 IMPORTANTE

**Objetivo**: Ter funil de vendas visual

4. **Semana 4-5**: Kanban
   - [ ] Página `/crm/kanban` (lista de quadros)
   - [ ] Página `/crm/kanban/[id]` (quadro kanban)
   - [ ] Drag & Drop de cards
   - [ ] Criar/editar colunas
   - [ ] Vincular tabulações às colunas
   - [ ] Mover card = atualizar tabulação do contato

---

### Fase 3: Configurações Org (1-2 semanas) 🟡 IMPORTANTE

**Objetivo**: Master consegue configurar organização

6. **Semana 6**: Departamentos + Membros
   - [ ] Página `/configuracoes/departamentos` (CRUD)
   - [ ] Página `/organizacao/membros` (listar, adicionar, remover)
   - [ ] Alterar roles de membros

7. **Semana 7**: Webhooks + Atributos
   - [ ] Página `/configuracoes/webhooks` (CRUD + deliveries)
   - [ ] Página `/configuracoes/atributos` (CRUD campos customizados)

---

### Fase 4: Admin System (1 semana) 🟢 BAIXO

**Objetivo**: Admin consegue gerenciar sistema

8. **Semana 8**: Admin Pages
   - [ ] Conectar páginas existentes com APIs reais
   - [ ] Página `/admin/users` (gerenciar usuários)
   - [ ] Página `/admin/logs` (logs do sistema)

---

### Fase 5: Features Extras (1-2 semanas) 🟢 BAIXO

**Objetivo**: Completar features secundárias

9. **Semana 9-10**: Grupos + Chamadas + Observações
   - [ ] Página `/grupos` (listar grupos WhatsApp)
   - [ ] Página `/grupos/[jid]` (detalhes + gerenciar membros)
   - [ ] Página `/chamadas` (histórico)
   - [ ] Observações dentro da página de Contatos

---

## 📊 Resumo de Prioridades

### 🔴 Prioridade ALTA (Fazer AGORA!)

1. ✅ CRM/Contatos (`/crm/contatos` + detalhes)
2. ✅ Chat Individual (`/conversas/[sessionId]`)
3. ✅ Tabulações (`/configuracoes/tabulacoes`)
4. ✅ Kanban (`/crm/kanban/[id]`)

**Por que?**
- Sem CRM, produto não funciona
- Sem Chat, não tem como atender
- Tabulações + Kanban = diferencial competitivo

---

### 🟡 Prioridade MÉDIA (Próxima Sprint)

5. Labels (`/configuracoes/labels`)
6. Departamentos (`/configuracoes/departamentos`)
7. Membros Org (`/organizacao/membros`)
8. Webhooks Org (`/configuracoes/webhooks` + deliveries)
9. Projetos CRUD (criar, editar, vincular instâncias)

---

### 🟢 Prioridade BAIXA (Backlog)

10. Grupos WhatsApp
11. Chamadas
12. Atributos Customizados
13. Admin System (melhorias)
14. Observações

---

## ✅ Checklist de Qualidade UX

### Para Cada Página Nova:

- [ ] **Loading States**: Skeleton screens, spinners
- [ ] **Empty States**: Ilustração + call-to-action quando vazio
- [ ] **Error States**: Mensagens claras + retry
- [ ] **Success Feedback**: Toast notifications
- [ ] **Confirmações**: Dialogs para ações destrutivas
- [ ] **Responsivo**: Mobile-first
- [ ] **Acessibilidade**: ARIA labels, keyboard navigation
- [ ] **Real-time**: SSE onde faz sentido (chat, status)
- [ ] **Paginação**: Infinite scroll ou paginação tradicional
- [ ] **Filtros**: Sidebar ou header com filtros rápidos
- [ ] **Busca**: Debounced search (300ms)
- [ ] **Ações em Massa**: Checkboxes + bulk actions
- [ ] **Breadcrumbs**: Navegação clara
- [ ] **Permissões**: Mostrar/ocultar baseado em role

---

## 🎯 Métricas de Sucesso

| Métrica | Valor Atual | Meta |
|---------|-------------|------|
| **Cobertura de APIs** | 21% | 80% |
| **Páginas Funcionais** | 34 | 60+ |
| **Páginas com CRUD** | 5 | 20+ |
| **Taxa de Erro (UI)** | ? | <5% |
| **Tempo de Carregamento** | ? | <2s |

---

**Próximo Passo**: Começar Fase 1 (CRM Core) com página `/crm/contatos`! 🚀

---

**Autor**: Lia AI Agent
**Data**: 2025-10-16
**Status**: Análise Completa ✅
