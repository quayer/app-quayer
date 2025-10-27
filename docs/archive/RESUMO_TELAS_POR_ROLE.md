# 📊 Resumo Visual: O que cada usuário vê ao fazer login

## 🔴 ADMIN (admin@quayer.com)

### ✅ O que aparece:

```
╔═══════════════════════════════════════════════════════════════╗
║                         SIDEBAR                               ║
╠═══════════════════════════════════════════════════════════════╣
║  [Logo Quayer]                                                ║
║                                                               ║
║  📊 Administração                                             ║
║     └─ Dashboard                /admin                        ║
║     └─ Organizações             /admin/organizations          ║
║     └─ Clientes                 /admin/clients                ║
║     └─ Integrações              /admin/integracoes            ║
║                                                               ║
║  ────────────────────────────────────────────────             ║
║  👤 Administrator                                             ║
║     admin@quayer.com                                          ║
╚═══════════════════════════════════════════════════════════════╝
```

### ❌ O que NÃO aparece:
- Organization Switcher (admin não pertence a nenhuma organização)
- Menus de usuário comum (Dashboard, Conversas, Mensagens, etc)

### 🎯 Rota inicial: `/admin`

---

## 🟢 MASTER (master@acme.com)

### ✅ O que aparece:

```
╔═══════════════════════════════════════════════════════════════╗
║                         SIDEBAR                               ║
╠═══════════════════════════════════════════════════════════════╣
║  [Logo Quayer]                                                ║
║                                                               ║
║  🏢 ACME Corporation ▼                                        ║
║                                                               ║
║  📊 Dashboard               /integracoes/dashboard            ║
║  🔌 Integrações            /integracoes                       ║
║  💬 Conversas              /conversas                         ║
║  📩 Mensagens              /integracoes/messages              ║
║  📋 Projetos               /integracoes/projects              ║
║  👥 Usuários               /integracoes/users                 ║
║  🔗 Webhooks               /integracoes/webhooks              ║
║  ⚙️  Configurações         /integracoes/settings              ║
║                                                               ║
║  ────────────────────────────────────────────────             ║
║  👤 Master User                                               ║
║     master@acme.com                                           ║
╚═══════════════════════════════════════════════════════════════╝
```

### 🔓 Permissões:
- ✅ Criar, editar, **DELETAR** instâncias
- ✅ Gerenciar usuários
- ✅ Configurar webhooks
- ✅ Gerenciar projetos
- ✅ Acesso total na organização

### 🎯 Rota inicial: `/integracoes`

---

## 🟡 MANAGER (manager@acme.com)

### ✅ O que aparece:

```
╔═══════════════════════════════════════════════════════════════╗
║                         SIDEBAR                               ║
╠═══════════════════════════════════════════════════════════════╣
║  [Logo Quayer]                                                ║
║                                                               ║
║  🏢 ACME Corporation ▼                                        ║
║                                                               ║
║  📊 Dashboard               /integracoes/dashboard            ║
║  🔌 Integrações            /integracoes                       ║
║  💬 Conversas              /conversas                         ║
║  📩 Mensagens              /integracoes/messages              ║
║  📋 Projetos               /integracoes/projects              ║
║  👥 Usuários               /integracoes/users                 ║
║  🔗 Webhooks               /integracoes/webhooks              ║
║  ⚙️  Configurações         /integracoes/settings              ║
║                                                               ║
║  ────────────────────────────────────────────────             ║
║  👤 Manager User                                              ║
║     manager@acme.com                                          ║
╚═══════════════════════════════════════════════════════════════╝
```

### 🔓 Permissões:
- ✅ Criar, editar instâncias
- ❌ **NÃO pode deletar** instâncias
- ✅ Visualizar usuários (não gerenciar)
- ✅ Visualizar webhooks (não editar)
- ✅ Gerenciar projetos

### 🎯 Rota inicial: `/integracoes`

---

## 🔵 USER (user1@acme.com)

### ✅ O que aparece:

```
╔═══════════════════════════════════════════════════════════════╗
║                         SIDEBAR                               ║
╠═══════════════════════════════════════════════════════════════╣
║  [Logo Quayer]                                                ║
║                                                               ║
║  🏢 ACME Corporation ▼                                        ║
║                                                               ║
║  📊 Dashboard               /integracoes/dashboard            ║
║  🔌 Minhas Integrações     /integracoes                       ║
║  💬 Conversas              /conversas                         ║
║  📩 Mensagens              /integracoes/messages              ║
║                                                               ║
║                                                               ║
║                                                               ║
║                                                               ║
║  ────────────────────────────────────────────────             ║
║  👤 User 1                                                    ║
║     user1@acme.com                                            ║
╚═══════════════════════════════════════════════════════════════╝
```

### 🔓 Permissões:
- ✅ Visualizar instâncias
- ✅ Enviar mensagens
- ✅ Ver conversas
- ❌ **NÃO pode** criar/editar/deletar instâncias
- ❌ **NÃO pode** gerenciar usuários
- ❌ **NÃO pode** configurar webhooks
- ❌ **NÃO vê** menu de Projetos, Usuários, Webhooks, Configurações

### 🎯 Rota inicial: `/integracoes`

---

## 📱 Tela: `/integracoes` - Como aparece para cada role

### ADMIN / MASTER / MANAGER

```
┌────────────────────────────────────────────────────────────┐
│  Sidebar (320px)              │  Main Area                 │
├───────────────────────────────┼────────────────────────────┤
│  Conversações             [+] │  Escolha um contato para   │
│                               │  ver o chat completo       │
│  🔍 Buscar...                 │                             │
│  ┌─────────────────────────┐ │  📱                         │
│  │ Todas                   │ │                             │
│  │ Conectadas (5)          │ │  Selecione uma instância   │
│  │ Desconectadas (2)       │ │  na lista para gerenciar   │
│  └─────────────────────────┘ │  conexão, ver detalhes     │
│                               │  e configurações           │
│  📱 Instância WhatsApp 1      │                             │
│     +55 11 99999-9999         │  [+ Criar Primeira         │
│     ● Conectada          2h   │      Integração]           │
│                               │                             │
│  📱 Instância WhatsApp 2      │                             │
│     +55 11 98888-8888         │                             │
│     ○ Desconectada ! 1d       │                             │
│                               │                             │
│  7 conversação(ões)           │                             │
└───────────────────────────────┴────────────────────────────┘

AÇÕES DISPONÍVEIS NO MENU (...):
✅ Ver Detalhes
✅ Conectar/Reconectar
✅ Editar
✅ Compartilhar
✅ Deletar (apenas Master)
```

### USER COMUM

```
┌────────────────────────────────────────────────────────────┐
│  Sidebar (320px)              │  Main Area                 │
├───────────────────────────────┼────────────────────────────┤
│  Conversações                 │  Escolha um contato para   │
│                               │  ver o chat completo       │
│  🔍 Buscar...                 │                             │
│  ┌─────────────────────────┐ │                             │
│  │ Todas                   │ │  📱                         │
│  │ Conectadas (5)          │ │                             │
│  │ Desconectadas (2)       │ │  Selecione uma instância   │
│  └─────────────────────────┘ │  na lista                  │
│                               │                             │
│  📱 Instância WhatsApp 1      │  Nenhuma instância         │
│     +55 11 99999-9999         │  disponível                │
│     ● Conectada          2h   │                             │
│                               │                             │
│  📱 Instância WhatsApp 2      │                             │
│     +55 11 98888-8888         │                             │
│     ○ Desconectada ! 1d       │                             │
│                               │                             │
│  7 conversação(ões)           │                             │
└───────────────────────────────┴────────────────────────────┘

AÇÕES DISPONÍVEIS NO MENU (...):
✅ Ver Detalhes
❌ Conectar/Reconectar (bloqueado)
❌ Editar (bloqueado)
❌ Compartilhar (bloqueado)
❌ Deletar (bloqueado)
❌ Botão [+] não aparece
```

---

## 💬 Tela: `/conversas` - Página de Conversas

### TODOS OS USUÁRIOS (mesma visualização)

```
┌────────────────────────────────────────────────────────────┐
│  Sidebar (320px)              │  Chat Area                 │
├───────────────────────────────┼────────────────────────────┤
│  💬 Conversas            [+]  │  [Nome da Instância]   ... │
│                               │  +55 11 99999-9999         │
│  🔍 Buscar...                 │  ═══════════════════════   │
│  ┌─────────────────────────┐ │                             │
│  │ Todas                   │ │  [Área de Mensagens]       │
│  │ Conectadas (3)          │ │                             │
│  │ Desconectadas (1)       │ │  (Aguardando Sprint 2      │
│  └─────────────────────────┘ │   para integração real)    │
│                               │                             │
│  📱 +55 11 99999-9999         │                             │
│     Olá, tudo bem?       2h   │                             │
│     ● Conectada               │                             │
│                               │                             │
│  📱 +55 11 98888-8888         │  ┌──────────────────────┐  │
│     Não configurado ! 1d      │  │ Digite uma mensagem  │  │
│     ○ Desconectada            │  │ ...                  │  │
│                               │  └──────────────────────┘  │
│  4 conversação(ões)           │  [📎] [😊] [🎤]           │
└───────────────────────────────┴────────────────────────────┘

FUNCIONALIDADES:
✅ Listar instâncias conectadas
✅ Preview de última mensagem (futuro)
✅ Filtrar por status
✅ Input de mensagem (desabilitado se desconectado)
⏳ Mensagens em tempo real (Sprint 2)
⏳ Upload de mídia (Sprint 2)
```

---

## 🔐 Resumo de Permissões por Ação

| Ação                          | Admin | Master | Manager | User |
|-------------------------------|-------|--------|---------|------|
| **Instâncias**                |       |        |         |      |
| Criar instância               | ✅    | ✅     | ✅      | ❌   |
| Editar instância              | ✅    | ✅     | ✅      | ❌   |
| Deletar instância             | ✅    | ✅     | ❌      | ❌   |
| Visualizar instâncias         | ✅    | ✅     | ✅      | ✅   |
| Conectar/Desconectar          | ✅    | ✅     | ✅      | ❌   |
| Compartilhar                  | ✅    | ✅     | ✅      | ❌   |
|                               |       |        |         |      |
| **Usuários**                  |       |        |         |      |
| Gerenciar usuários            | ✅    | ✅     | ❌      | ❌   |
| Visualizar usuários           | ✅    | ✅     | ✅      | ❌   |
|                               |       |        |         |      |
| **Webhooks**                  |       |        |         |      |
| Configurar webhooks           | ✅    | ✅     | ❌      | ❌   |
| Visualizar webhooks           | ✅    | ✅     | ✅      | ❌   |
|                               |       |        |         |      |
| **Organizações**              |       |        |         |      |
| Gerenciar organizações        | ✅    | ❌     | ❌      | ❌   |
| Trocar organização (switcher) | ❌    | ✅     | ✅      | ✅   |
|                               |       |        |         |      |
| **Mensagens**                 |       |        |         |      |
| Enviar mensagens              | ✅    | ✅     | ✅      | ✅   |
| Ver conversas                 | ✅    | ✅     | ✅      | ✅   |
|                               |       |        |         |      |
| **Projetos**                  |       |        |         |      |
| Gerenciar projetos            | ✅    | ✅     | ✅      | ❌   |
| Visualizar projetos           | ✅    | ✅     | ✅      | ✅   |

---

## 🧪 Como Testar Cada Role

### 1. Testar como Admin
```bash
Email: admin@quayer.com
Senha: admin123456

✅ Deve redirecionar para /admin
✅ Sidebar deve mostrar menu de Administração
✅ NÃO deve mostrar Organization Switcher
✅ Pode acessar /admin/organizations
✅ Se acessar /integracoes, funciona normalmente
```

### 2. Testar como Master
```bash
Email: master@acme.com
Senha: master123456

✅ Deve redirecionar para /integracoes
✅ Sidebar deve mostrar Organization Switcher
✅ Menu completo (Dashboard, Integrações, Conversas, etc)
✅ Pode criar, editar, DELETAR instâncias
✅ Se acessar /admin, deve redirecionar para /integracoes
```

### 3. Testar como Manager
```bash
Email: manager@acme.com
Senha: manager123456

✅ Deve redirecionar para /integracoes
✅ Sidebar igual ao Master
✅ Pode criar, editar instâncias
❌ NÃO pode deletar instâncias
❌ NÃO pode editar webhooks
```

### 4. Testar como User
```bash
Email: user1@acme.com
Senha: user123456

✅ Deve redirecionar para /integracoes
✅ Sidebar reduzida (apenas Dashboard, Minhas Integrações, Conversas, Mensagens)
✅ Pode visualizar instâncias
❌ NÃO vê botão [+] para criar
❌ Menu (...) apenas com "Ver Detalhes"
❌ Ações bloqueadas
```

---

## 🚨 Problemas Resolvidos

### ✅ Erro: "Token não fornecido"
**Causa:** Hook useInstances estava chamando `query({ query: {} })` em vez de `query()`

**Solução:**
```typescript
// ❌ ANTES (errado):
const response = await api.instances.list.query({ query: {} })

// ✅ DEPOIS (correto):
const response = await api.instances.list.query()
```

### ✅ Middleware não encontrado
**Causa:** Rota `/conversas` não estava em PROTECTED_PATHS

**Solução:**
```typescript
const PROTECTED_PATHS = [
  '/integracoes',
  '/conversas', // ← adicionado
  '/admin',
  // ...
]
```

---

## 📌 Checklist de Validação Final

- [x] Login com admin funciona
- [x] Login com master funciona
- [x] Login com manager funciona
- [x] Login com user funciona
- [x] Sidebar correta para cada role
- [x] Organization Switcher aparece apenas para users
- [x] Permissões de criar/editar/deletar corretas
- [x] Página /integracoes carrega instâncias
- [x] Página /conversas funciona
- [x] Middleware protege rotas corretamente
- [x] Tokens salvos em cookie + localStorage
- [x] API retorna dados com token válido

---

**Status:** ✅ Sistema 100% funcional
**Próximo Sprint:** Integração de mensagens em tempo real
