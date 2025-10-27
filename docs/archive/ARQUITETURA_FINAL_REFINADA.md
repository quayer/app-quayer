# 🎯 Arquitetura Final Refinada - Quayer WhatsApp Manager

## 📋 Decisões Estratégicas

### ❌ Removido (Não faz sentido)
1. **📋 Projetos** - Complexidade desnecessária, não agrega valor agora
2. **📩 Mensagens** (página separada) - Métricas vão para Dashboard
3. **🔗 Webhooks** (para usuários) - Apenas admin precisa configurar
4. **💳 Faturamento** - Gerenciado externamente
5. **🔗 Integrações Externas** - Fora do escopo inicial
6. **💬 Preferências de Atendimento** - Simplificar ao essencial

### ✅ Mantido (Essencial)
1. **📊 Dashboard** - Visão geral + métricas de mensagens
2. **🔌 Integrações** - Core do sistema (números WhatsApp)
3. **💬 Conversas** - Atendimento ao vivo
4. **👥 Usuários** - Gerenciar equipe
5. **⚙️ Configurações** - Apenas o essencial

---

## 🎨 Sidebar Final - Todas as Roles

### 🔴 ADMIN

```
╔═══════════════════════════════════════════════════════╗
║ [Logo Quayer]                                         ║
║                                                       ║
║ ⚙️ ADMINISTRAÇÃO                                      ║
║    ├─ 📊 Dashboard Admin                             ║
║    ├─ 🏢 Organizações       🔍                       ║
║    ├─ 👥 Clientes                                    ║
║    ├─ 🔌 Integrações (todas)                         ║
║    ├─ 🔗 Webhooks (global)   ← MOVIDO AQUI          ║
║    ├─ 🔄 Gerenciar Brokers                           ║
║    ├─ 📊 Logs Técnicos                               ║
║    └─ 🔐 Permissões Avançadas                        ║
║                                                       ║
║ ───── ACME CORPORATION ─────                         ║
║ 📊 Dashboard                 ← COM MÉTRICAS          ║
║ 🔌 Integrações                                        ║
║ 💬 Conversas                                          ║
║ 👥 Usuários                                           ║
║ ⚙️ Configurações             ← SIMPLIFICADO          ║
║                                                       ║
║ ────────────────────────────────────────────          ║
║ 👤 Administrator        ▼                            ║
║    ├─ 🏢 Trocar Organização  🔍                      ║
║    ├─ 👤 My Profile                                  ║
║    └─ 🚪 Sign Out                                    ║
╚═══════════════════════════════════════════════════════╝
```

### 🟢 MASTER / MANAGER

```
╔═══════════════════════════════════════════════════════╗
║ [Logo Quayer]                                         ║
║                                                       ║
║ 🏢 ACME Corporation ▼                                ║
║                                                       ║
║ 📊 Dashboard                                          ║
║ 🔌 Integrações                                        ║
║ 💬 Conversas                                          ║
║ 👥 Usuários                                           ║
║ ⚙️ Configurações                                      ║
║                                                       ║
║ ────────────────────────────────────────────          ║
║ 👤 Nome do Usuário        ▼                          ║
║    ├─ 👤 My Profile                                  ║
║    └─ 🚪 Sign Out                                    ║
╚═══════════════════════════════════════════════════════╝
```

### 🔵 USER (Usuário Comum)

```
╔═══════════════════════════════════════════════════════╗
║ [Logo Quayer]                                         ║
║                                                       ║
║ 🏢 ACME Corporation ▼                                ║
║                                                       ║
║ 📊 Dashboard                                          ║
║ 🔌 Minhas Integrações                                ║
║ 💬 Conversas                                          ║
║                                                       ║
║ ────────────────────────────────────────────          ║
║ 👤 Nome do Usuário        ▼                          ║
║    ├─ 👤 My Profile                                  ║
║    └─ 🚪 Sign Out                                    ║
╚═══════════════════════════════════════════════════════╝
```

---

## 📄 Páginas Finais - Detalhamento

### 1️⃣ 📊 Dashboard (Todos os usuários)

**Rota:** `/integracoes/dashboard`

#### O que mostra agora?

##### Seção 1: Cards Principais
```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Integrações  │ │ Conversas    │ │ Mensagens    │ │ Conversas    │
│ Ativas       │ │ Abertas      │ │ Hoje         │ │ Controladas  │
│              │ │              │ │              │ │ por IA       │
│     10       │ │      45      │ │    1.234     │ │      30      │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

##### Seção 2: Métricas de Conversas
```
┌─────────────────────────────────────────────────────┐
│ 📊 Métricas de Conversas                            │
├─────────────────────────────────────────────────────┤
│ Total de Conversas: 166                             │
│ Em Andamento: 45                                    │
│ Controladas por IA: 30                              │
│ Controladas por Humano: 15                          │
│                                                     │
│ Tempo Médio de Atendimento: 5.2 min                │
│ Taxa de Resolução: 78%                              │
└─────────────────────────────────────────────────────┘
```

##### Seção 3: Performance de Mensagens (CONSOLIDADO AQUI)
```
┌─────────────────────────────────────────────────────┐
│ 📩 Performance de Mensagens                         │
├─────────────────────────────────────────────────────┤
│ Disparos Hoje                                       │
│                                                     │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐│
│ │ Enviadas     │ │ Entregues    │ │ Lidas        ││
│ │   1.234      │ │   1.180      │ │     956      ││
│ │              │ │   (95.6%)    │ │   (81.0%)    ││
│ └──────────────┘ └──────────────┘ └──────────────┘│
│                                                     │
│ ┌──────────────┐ ┌──────────────┐                 │
│ │ Falhadas     │ │ Taxa Leitura │                 │
│ │      54      │ │     81%      │                 │
│ │   (4.4%)     │ │              │                 │
│ └──────────────┘ └──────────────┘                 │
│                                                     │
│ [📊 Ver Histórico Completo]                        │
└─────────────────────────────────────────────────────┘
```

##### Seção 4: Gráficos
```
┌─────────────────────────────────────────────────────┐
│ 📈 Conversas por Hora (últimas 24h)                │
│                                                     │
│  [Gráfico de linha]                                │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 🥧 Distribuição IA vs Humano                        │
│                                                     │
│  [Gráfico de pizza: 67% IA, 33% Humano]           │
└─────────────────────────────────────────────────────┘
```

##### Seção 5: Histórico de Mensagens (Link)
```
┌─────────────────────────────────────────────────────┐
│ 📋 Histórico de Mensagens                           │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Ver todas as mensagens enviadas e recebidas        │
│ com filtros avançados e exportação                 │
│                                                     │
│ [📊 Abrir Histórico Completo]                      │
│                                                     │
│ Última atualização: há 2 minutos                   │
└─────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- ✅ Visão geral em tempo real
- ✅ Métricas de conversas
- ✅ Métricas de mensagens (consolidado)
- ✅ Gráficos visuais
- ✅ Link para histórico completo

---

### 2️⃣ 🔌 Integrações

**Rota:** `/integracoes`

**SEM MUDANÇAS** - Continua igual

#### Layout
```
┌────────────────────────────────────────────────────┐
│ Integrações                    [+ Nova Integração] │
├──────────────────┬─────────────────────────────────┤
│ LISTA            │ DETALHES                        │
│                  │                                 │
│ 📱 WA Vendas     │ WhatsApp Vendas                 │
│    ● Conectada   │ +55 11 99999-0001              │
│                  │                                 │
│ 📱 WA Suporte    │ Status: ● Conectada             │
│    ○ Desconectada│                                 │
│                  │ [Reconectar] [Editar] [QR Code]│
└──────────────────┴─────────────────────────────────┘
```

**Funcionalidades:**
- ✅ Criar integração
- ✅ Conectar via QR Code
- ✅ Ver status
- ✅ Editar
- ✅ Compartilhar (master/manager)
- ✅ Deletar (apenas master)

**🔧 Admin Extra:**
- ✅ Botão "Trocar Broker" (UAZapi, Evolution API, Baileys)

**🆕 WEBHOOK CONFIGURADO AQUI:**

Ao criar nova integração, no modal:
```
┌─────────────────────────────────┐
│ Nova Integração WhatsApp        │
├─────────────────────────────────┤
│ Nome:                           │
│ [WhatsApp Vendas]               │
│                                 │
│ Número (opcional):              │
│ [+55 11 99999-0001]             │
│                                 │
│ 🔗 Webhook URL (opcional):      │ ← AQUI!
│ [https://api.acme.com/webhook]  │
│                                 │
│ Eventos do Webhook:             │
│ ☑ message.received              │
│ ☑ message.sent                  │
│ ☑ message.read                  │
│ ☐ status.changed                │
│                                 │
│ [Cancelar]        [Criar]       │
└─────────────────────────────────┘
```

**Editar integração:**
```
┌─────────────────────────────────┐
│ Editar - WhatsApp Vendas        │
├─────────────────────────────────┤
│ Nome: [WhatsApp Vendas]         │
│                                 │
│ Número: +55 11 99999-0001       │
│                                 │
│ 🔗 Webhook URL:                 │
│ [https://api.acme.com/webhook]  │
│ [Testar Webhook]                │
│                                 │
│ Eventos:                        │
│ ☑ message.received              │
│ ☑ message.sent                  │
│ ☑ message.read                  │
│ ☐ status.changed                │
│                                 │
│ Últimas entregas:               │
│ ✅ 200 OK - há 2min             │
│ ✅ 200 OK - há 5min             │
│ ❌ 500 Error - há 10min         │
│                                 │
│ [Ver Logs] [Salvar]             │
└─────────────────────────────────┘
```

**Resultado:**
- ✅ Webhook configurado **POR INTEGRAÇÃO**
- ✅ Simples e direto
- ✅ Usuários podem configurar seus próprios webhooks
- ✅ Admin tem visão global de todos em `/admin/webhooks`

---

### 3️⃣ 💬 Conversas

**Rota:** `/conversas`

**SEM MUDANÇAS** - Continua igual

```
┌────────────────────────────────────────────────────┐
│ Conversas                                          │
├──────────────────┬─────────────────────────────────┤
│ LISTA            │ CHAT ATIVO                      │
│                  │                                 │
│ 👤 João Silva    │ João Silva                      │
│    Oi, tudo bem? │ +55 11 99999-8888              │
│    2min ●●       │ ═══════════════════════         │
│                  │                                 │
│                  │ [Mensagens aqui...]             │
│                  │                                 │
│                  │ [Digite mensagem...]            │
└──────────────────┴─────────────────────────────────┘
```

---

### 4️⃣ 👥 Usuários (Master/Manager apenas)

**Rota:** `/integracoes/users`

**SEM MUDANÇAS** - Continua igual

```
┌─────────────────────────────────────────────────────┐
│ Usuários                          [+ Novo Usuário]  │
├─────────────────────────────────────────────────────┤
│ 👑 João Silva   │ joao@acme.com  │ Master  │ Ativo │
│ 👔 Maria Santos │ maria@acme.com │ Manager │ Ativo │
│ 👤 Pedro Costa  │ pedro@acme.com │ User    │ Ativo │
└─────────────────────────────────────────────────────┘
```

---

### 5️⃣ ⚙️ Configurações (Simplificado)

**Rota:** `/integracoes/settings`

**APENAS O ESSENCIAL:**

#### 1. Perfil da Organização
```
┌─────────────────────────────────────────┐
│ 🏢 Perfil da Organização                │
├─────────────────────────────────────────┤
│ Nome:                                   │
│ [ACME Corporation                    ]  │
│                                         │
│ Logo:                                   │
│ [📷 logo-acme.png] [Alterar]            │
│                                         │
│ Fuso horário:                           │
│ [America/Sao_Paulo              ▼]      │
│                                         │
│ [Salvar]                                │
└─────────────────────────────────────────┘
```

#### 2. Horário de Atendimento
```
┌─────────────────────────────────────────┐
│ 🕐 Horário de Atendimento               │
├─────────────────────────────────────────┤
│ Segunda a Sexta:                        │
│ De: [09:00] Até: [18:00]                │
│                                         │
│ Sábado:                                 │
│ De: [09:00] Até: [12:00]                │
│                                         │
│ Domingo:                                │
│ ☑ Fechado                               │
│                                         │
│ [Salvar]                                │
└─────────────────────────────────────────┘
```

#### 3. Segurança (Opcional)
```
┌─────────────────────────────────────────┐
│ 🔐 Segurança                            │
├─────────────────────────────────────────┤
│ Autenticação de Dois Fatores (2FA):    │
│ (●) Ativo                               │
│ (○) Inativo                             │
│                                         │
│ [Salvar]                                │
└─────────────────────────────────────────┘
```

**REMOVIDO:**
- ❌ Faturamento (gerenciado externamente)
- ❌ Integrações externas (fora do escopo)
- ❌ Mensagens automáticas (complexidade desnecessária)
- ❌ Whitelist de IPs (overkill)

---

## 🔧 Admin - Webhooks Global

**Rota:** `/admin/webhooks`

**Apenas para ADMIN** - Ver TODOS os webhooks de TODAS as organizações

```
┌─────────────────────────────────────────────────────┐
│ Webhooks (Global)                                   │
├─────────────────────────────────────────────────────┤
│ 🔍 [Buscar por organização ou URL...]               │
│                                                     │
│ Filtros: [Todas Orgs ▼] [Todos Status ▼]           │
│                                                     │
│ ┌─────────────────────────────────────────────────┐│
│ │Org          │Integração  │URL           │Status││
│ ├─────────────────────────────────────────────────┤│
│ │ACME Corp    │WA Vendas   │api.acme.com  │✅ OK ││
│ │ACME Corp    │WA Suporte  │api.acme.com  │✅ OK ││
│ │Tech Solutions│WA Marketing│api.tech.com  │❌ Erro││
│ └─────────────────────────────────────────────────┘│
│                                                     │
│ [Exportar Relatório]                                │
└─────────────────────────────────────────────────────┘
```

**Funcionalidades Admin:**
- ✅ Ver todos os webhooks
- ✅ Filtrar por organização
- ✅ Ver logs de todas as entregas
- ✅ Identificar problemas
- ✅ Exportar relatório

---

## 📊 Comparativo - Antes vs Depois

| Funcionalidade | Antes | Depois | Justificativa |
|----------------|-------|--------|---------------|
| **Projetos** | Página separada | ❌ Removido | Complexidade desnecessária |
| **Mensagens** | Página separada | ✅ Dashboard | Métricas consolidadas |
| **Webhooks (user)** | Página separada | ✅ Integração | Configurar por número |
| **Webhooks (admin)** | - | ✅ Admin menu | Visão global |
| **Faturamento** | Configurações | ❌ Removido | Externo |
| **Integrações Ext** | Configurações | ❌ Removido | Fora escopo |
| **Msg Automáticas** | Configurações | ❌ Removido | Simplificar |

---

## 🎯 Fluxo de Uso Simplificado

### Usuário Comum (User)
```
1. 📊 Dashboard → Ver métricas
2. 💬 Conversas → Atender clientes
```
**Simples e direto!**

### Master/Manager
```
1. 📊 Dashboard → Ver métricas
2. 🔌 Integrações → Gerenciar números + webhooks
3. 💬 Conversas → Atender clientes
4. 👥 Usuários → Gerenciar equipe
5. ⚙️ Configurações → Ajustar horários
```

### Admin
```
1. 📊 Dashboard Admin → Visão global
2. 🏢 Organizações → Gerenciar clientes
3. 🔗 Webhooks → Ver todos os webhooks
4. 🔄 Gerenciar Brokers → Trocar provedor
```

**DEPOIS:**
- ✅ Simples
- ✅ Direto ao ponto
- ✅ Sem funcionalidades desnecessárias
- ✅ Foco no essencial

---

## ✅ Decisões Finais Aprovadas

1. ✅ **Projetos removido** - Não agrega valor agora
2. ✅ **Mensagens consolidado no Dashboard** - Métricas + link histórico
3. ✅ **Webhooks por integração** - Configurar ao criar/editar número
4. ✅ **Webhooks global no Admin** - Visão de todos
5. ✅ **Configurações simplificado** - Apenas essencial
6. ✅ **Faturamento removido** - Gerenciado externamente

---

## 🚀 Próximos Passos

1. Implementar novo sidebar
2. Consolidar métricas no Dashboard
3. Adicionar webhook ao modal de integração
4. Criar página admin/webhooks
5. Simplificar configurações

**Sistema mais enxuto, focado e eficiente!** 🎯

Aprovado para implementação?
