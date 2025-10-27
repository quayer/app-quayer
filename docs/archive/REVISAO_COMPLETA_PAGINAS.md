# Revisão Completa - Todas as Páginas do Sistema Quayer

## 📋 Índice
1. [Integração UAZ API](#integração-uaz-api)
2. [Páginas Públicas e Auth](#páginas-públicas-e-auth)
3. [Páginas Admin](#páginas-admin)
4. [Páginas de Organização](#páginas-de-organização)
5. [Resumo de Rotas](#resumo-de-rotas)

---

## 🔌 Integração UAZ API

### Informações do YAML (uazapi-openapi-spec.yaml)

**API:** uazapiGO - WhatsApp API (v2.0)
**URL Base:** `https://{subdomain}.uazapi.com`
**Subdomínio Padrão:** `free`

### Estados da Instância
- `disconnected`: Desconectado do WhatsApp
- `connecting`: Em processo de conexão
- `connected`: Conectado e autenticado com sucesso

### Autenticação
- **Endpoints Regulares:** Header `token` com o token da instância
- **Endpoints Admin:** Header `admintoken` com token de administrador

### Endpoints Principais
1. **`/instance/connect`**
   - Conecta instância via QR Code ou Código de Pareamento
   - Timeout: 2 minutos para QR Code, 5 minutos para código de pareamento
   - Retorna: `qrcode` (base64), `paircode`, `status`

2. **`/instance/disconnect`**
   - Desconecta instância do WhatsApp
   - Mantém dados salvos para reconexão

3. **`/instance/status`**
   - Verifica status atual da conexão
   - Retorna informações de perfil quando conectado

### Propriedades da Instância
```typescript
{
  id: string (uuid)
  token: string
  status: 'connected' | 'connecting' | 'disconnected'
  paircode?: string
  qrcode?: string (base64)
  name: string
  profileName?: string
  profilePicUrl?: string
  isBusiness: boolean
  plataform: string (iOS/Android/Web)
  systemName: string (default: 'uazapi')
  owner: string
  phoneNumber?: string
}
```

### ⚠️ Recomendações Importantes
- **SEMPRE usar WhatsApp Business** em vez do WhatsApp normal
- WhatsApp normal pode apresentar: inconsistências, desconexões, limitações e instabilidades
- Servidor possui limite máximo de instâncias conectadas
- Quando limite atingido: erro 429 (Too Many Requests)
- Servidores gratuitos/demo podem ter restrições de tempo de vida

---

## 🔓 Páginas Públicas e Auth

### 1. **Root Page** - `/`
**Arquivo:** `src/app/page.tsx`
**Tipo:** Server Component
**Função:** Redirecionamento inteligente
- **Com token:** Redireciona para `/integracoes`
- **Sem token:** Redireciona para `/login`

### 2. **Login** - `/login`
**Arquivo:** `src/app/(auth)/login/page.tsx`
**Tipo:** Client Component

**Layout:**
- Grid 2 colunas (form + imagem)
- Logo Quayer centralizado
- Form com email + password
- Link para registro
- Imagem de fundo (lado direito)

**Funcionalidades:**
- Validação client-side
- Server Action para autenticação
- Mensagens de erro personalizadas
- Loading state durante login
- Armazena token em cookie + localStorage

**Componentes:**
- `Input` (email, password)
- `Button` (submit)
- `Alert` (erros)
- `Link` (registro)

### 3. **Registro** - `/register`
**Arquivo:** `src/app/(auth)/register/page.tsx`
**Tipo:** Client Component

**Funcionalidades:**
- Cadastro de novo usuário
- Campos: Nome, Email, Password, Confirm Password
- Validações de segurança
- Integração com API de registro

### 4. **Esqueci Senha** - `/forgot-password`
**Arquivo:** `src/app/(auth)/forgot-password/page.tsx`
**Funcionalidades:**
- Solicitação de reset via email
- Envio de token de recuperação

### 5. **Reset Senha** - `/reset-password/[token]`
**Arquivo:** `src/app/(auth)/reset-password/[token]/page.tsx`
**Funcionalidades:**
- Validação de token
- Definição de nova senha

### 6. **Página de Conexão** - `/connect/[token]`
**Arquivo:** `src/app/(public)/connect/[token]/page.tsx`
**Funcionalidades:**
- Link de conexão compartilhável
- Conectar instância via token público

### 7. **Conversas Públicas** - `/conversas`
**Arquivo:** `src/app/(public)/conversas/page.tsx`
**Tipo:** Client Component

**Layout:**
- **Sidebar (320px):** Lista de conversas
  - Header: Título + Botão adicionar
  - Busca de conversas
  - Tabs: Todas / Conectadas / Desconectadas
  - Lista scrollável de instâncias
  - Footer com contador

- **Main:** Chat principal
  - Header: Avatar + Nome + Ações (dropdown)
  - Área de mensagens (background muted)
  - Input de mensagem com Textarea
  - Botão Enviar (desabilitado se desconectado)

**Funcionalidades:**
- Filtro por status e busca
- Seleção de instância
- Visualização de status (badges)
- Envio de mensagens (quando conectado)
- Atalho: Enter = enviar, Shift+Enter = nova linha
- Empty states informativos

**Estados:**
- Loading: Skeletons
- Erro: Alert vermelho
- Empty: Ícone + mensagem
- Desconectado: Alert com instrução para reconectar

---

## 👨‍💼 Páginas Admin

### 1. **Dashboard Admin** - `/admin`
**Arquivo:** `src/app/admin/page.tsx`
**Tipo:** Client Component

**Layout:**
- Header: Título "Dashboard"
- Grid 4 colunas de cards de estatísticas
- Grid 7 colunas: Atividade Recente (4 cols) + Organizações Recentes (3 cols)

**Cards de Estatísticas:**
1. **Organizações**
   - Ícone: Building2
   - Total cadastradas
   - Dados via API

2. **Usuários**
   - Ícone: Users
   - Total de usuários ativos
   - TODO: Implementar endpoint

3. **Instâncias**
   - Ícone: Plug
   - Instâncias WhatsApp ativas
   - Dados via API

4. **Webhooks**
   - Ícone: Webhook
   - Webhooks configurados
   - Dados via API

**Seções:**
- **Atividade Recente:** Últimas ações no sistema (placeholder)
- **Organizações Recentes:** Últimas orgs cadastradas (placeholder)

**Loading State:** Skeletons em todos os cards

### 2. **Organizações** - `/admin/organizations`
**Arquivo:** `src/app/admin/organizations/page.tsx`

**Funcionalidades:**
- CRUD completo de organizações
- Listagem com filtros
- Detalhes por organização
- Gerenciamento de usuários

### 3. **Clientes** - `/admin/clients`
**Arquivo:** `src/app/admin/clients/page.tsx`

**Funcionalidades:**
- Listagem de todos os clientes
- Filtros avançados
- Gerenciamento de acesso

### 4. **Integrações Admin** - `/admin/integracoes`
**Arquivo:** `src/app/admin/integracoes/page.tsx`

**Funcionalidades:**
- Visão global de todas as integrações
- Monitoramento de status
- Ações administrativas

### 5. **Webhooks Globais** - `/admin/webhooks`
**Arquivo:** `src/app/admin/webhooks/page.tsx`
**Tipo:** Client Component ✅ CRIADO

**Layout:**
- Header: Título + Botão "Novo Webhook"
- Grid 3 colunas de estatísticas
- Card com tabela de webhooks

**Cards de Estatísticas:**
1. **Total de Webhooks** (ícone: Webhook)
2. **Ativos** (ícone: CheckCircle2, verde)
3. **Inativos** (ícone: XCircle, vermelho)

**Tabela de Webhooks:**
- Colunas: URL, Eventos, Organização, Instância, Status, Última Execução, Ações
- Busca por URL ou evento
- Badges para eventos (máx 2 visíveis + contador)
- Status badge (Ativo/Inativo)
- Última execução (formatado "há X tempo")

**Menu de Ações:**
- Ver Detalhes
- Editar
- Testar Webhook
- Ativar/Desativar
- Excluir (vermelho)

**Empty State:** Ícone + mensagem + botão criar

### 6. **Gerenciar Brokers** - `/admin/brokers`
**Arquivo:** `src/app/admin/brokers/page.tsx`
**Tipo:** Client Component ✅ CRIADO

**Layout:**
- Header: Título + Botão "Atualizar Status"
- Grid 6 colunas de estatísticas globais
- Cards individuais por broker

**Estatísticas Globais:**
1. **Brokers** - Total e conectados
2. **Filas** - Total ativas
3. **Jobs Ativos** (azul)
4. **Completados** (verde)
5. **Falhados** (vermelho)
6. **Taxa de Sucesso** - Percentual calculado

**Card por Broker:**
- Header: Nome + Host + Status Badge + Uptime + Botões (Ver Filas, Configurar)
- Barra de progresso: Uso de memória (MB usado / MB máximo)
- Grid 4 colunas: Filas Ativas, Jobs em Execução (azul), Completados (verde), Falhados (vermelho)

**Cores de Status:**
- `connected`: Badge default
- `disconnected/error`: Badge destructive

**Alert Informativo:**
- Explicação sobre função dos brokers
- Importância de monitoramento

**Dados:** Mock data (TODO: Integrar com API real Redis/BullMQ)

### 7. **Logs Técnicos** - `/admin/logs`
**Arquivo:** `src/app/admin/logs/page.tsx`
**Tipo:** Client Component ✅ CRIADO

**Layout:**
- Header: Título + Botão "Exportar Logs"
- Grid 4 colunas de estatísticas
- Grid 3 colunas: Lista de Logs (2 cols) + Detalhes (1 col)

**Estatísticas:**
1. **Total de Logs** (ícone: FileText)
2. **Erros** (vermelho, ícone: AlertCircle)
3. **Avisos** (amarelo, ícone: AlertTriangle)
4. **Informativos** (azul, ícone: Info)

**Lista de Logs:**
- Busca de texto livre
- Filtro por nível (Todos, Erros, Avisos, Info)
- Filtro por origem (service)
- ScrollArea com altura fixa (600px)
- Logs clicáveis (destaque em accent)

**Cada Log Exibe:**
- Ícone colorido por nível
- Badge de nível
- Timestamp relativo ("há X tempo")
- Mensagem
- Origem (source)

**Painel de Detalhes:**
- Timestamp completo (formato BR)
- Nível (badge)
- Origem
- Mensagem completa
- Detalhes técnicos (JSON formatado em `<pre>`)

**Níveis de Log:**
- `error`: AlertCircle vermelho, badge destructive
- `warn`: AlertTriangle amarelo, badge warning
- `info`: Info azul, badge default

**Empty State:** Ícone FileText + mensagem "Clique em um log"

**Dados:** Mock data com exemplos realistas (TODO: Integrar com sistema de logs)

### 8. **Permissões** - `/admin/permissions`
**Arquivo:** `src/app/admin/permissions/page.tsx`
**Tipo:** Client Component ✅ CRIADO

**Layout:**
- Header: Título + Botão "Nova Função"
- Grid 3 colunas de estatísticas
- Tabs: Funções do Sistema | Funções de Organização | Todas as Permissões

**Estatísticas:**
1. **Funções do Sistema** (ícone: ShieldCheck)
2. **Funções de Organização** (ícone: Building2)
3. **Permissões Totais** (ícone: Settings2)

**Tab 1 - Funções do Sistema:**
- Tabela: Nome, Descrição, Usuários, Permissões, Ações
- **admin:** Acesso Total (*), badge especial
- **user:** Permissões limitadas, badge outline com contador

**Tab 2 - Funções de Organização:**
- Tabela: Nome, Descrição, Usuários, Permissões, Ações
- **master:** Acesso Total (org:*), badge especial
- **manager:** Gerenciamento parcial
- **user:** Acesso limitado

**Tab 3 - Todas as Permissões:**
- Busca de permissões
- Agrupadas por recurso (organizations, instances, messages, users, webhooks)
- Border-left por grupo
- Cada permissão:
  - Nome: `recurso:ação`
  - Descrição
  - Switch Ativo/Inativo

**Recursos e Ações:**
- `organizations`: read, write, delete
- `instances`: read, write, delete, connect
- `messages`: read, send
- `users`: read, write, delete
- `webhooks`: read, write, delete

**Botão Editar:** Abre modal (TODO: Implementar)

---

## 🏢 Páginas de Organização

### 1. **Dashboard Organização** - `/integracoes/dashboard`
**Arquivo:** `src/app/integracoes/dashboard/page.tsx`
**Tipo:** Client Component ✅ IMPLEMENTADO

**Layout:**
- Header: Título "Dashboard"
- Grid 4 colunas: Cards principais
- Grid 2 colunas: Métricas de Conversas + Performance de Mensagens
- Grid 3 colunas: 3 Gráficos (Area, Pie, Bar)

**Cards Principais:**
1. **Integrações Ativas** (ícone: Plug, roxo)
2. **Conversas Abertas** (ícone: MessagesSquare, azul)
3. **Mensagens Hoje** (ícone: Send, verde)
4. **Controladas por IA** (ícone: Bot, laranja)

**Métricas de Conversas:** (Card com grid 3x2)
1. Total de Conversas
2. Em Andamento
3. Controladas por IA
4. Controladas por Humano
5. Tempo Médio de Resposta (minutos)
6. Taxa de Resolução (%)

**Performance de Mensagens:** (Card com grid 2x2)
1. **Enviadas** - Total + taxa de entrega (%)
2. **Entregues** - Total + taxa de leitura (%)
3. **Lidas** - Total + percentual
4. **Falhadas** - Total + percentual (vermelho)

**Gráficos:**

1. **Area Chart - Conversas por Hora (24h)**
   - Eixo X: Horários (00h - 23h)
   - Eixo Y: Quantidade
   - Gradiente de área
   - Tooltip com detalhes
   - Altura: 300px

2. **Pie Chart - IA vs Humano**
   - Fatias: Controladas por IA, Controladas por Humano
   - Legenda
   - Labels com percentual
   - Cores: chart-1 (IA), chart-2 (Humano)

3. **Bar Chart - Mensagens por Status**
   - Barras: Enviadas, Entregues, Lidas, Falhadas
   - Cores customizadas por status
   - Tooltip com valores
   - Eixo Y com contagem

**Dados:** Mock data (TODO: Integrar com API real)

**Configuração de Charts:**
- ChartContainer do shadcn
- ResponsiveContainer do recharts
- Cores via CSS variables (--chart-1 a --chart-4)
- Tooltips customizados
- Grid com strokeDasharray

### 2. **Integrações** - `/integracoes`
**Arquivo:** `src/app/integracoes/page.tsx`
**Tipo:** Client Component ✅ IMPLEMENTADO

**Layout Inspirado no WhatsApp:**
- **Sidebar (320px):** Lista de instâncias
- **Main:** Detalhes e gerenciamento

**Sidebar:**
- **Header:**
  - Título: "Conversações"
  - Botão +: Criar instância (se permitido)
  - Busca: Input com ícone Search

- **Tabs de Filtro:**
  - Todas
  - Conectadas (com contador)
  - Desconectadas (com contador)
  - Estilo: Border-bottom na ativa

- **Lista de Instâncias:**
  - Avatar: Verde (connected) ou Cinza (disconnected)
  - Nome (bold)
  - Status Badge + Badge de alerta (!)
  - Telefone
  - Tempo relativo (date-fns ptBR)
  - Hover: background accent
  - Selecionado: background accent

- **Footer:**
  - Contador: "X conversação(ões)"

**Main - Empty State:**
- Ícone Phone grande
- Título: "Escolha um contato para ver o chat completo"
- Descrição
- Botão criar (se permitido e lista vazia)

**Main - Instância Selecionada:**
- **Header:**
  - Avatar + Nome + Telefone
  - Dropdown com ações:
    - Ver Detalhes
    - Conectar/Reconectar
    - Editar
    - Compartilhar
    - Deletar (vermelho, separado)

- **Conteúdo:**
  - **Status Card:**
    - Ícone AlertCircle
    - Status atual (badge)
    - Alert se desconectado
    - Botão Conectar/Reconectar

  - **Informações Card:**
    - Nome
    - Telefone
    - Criado (tempo relativo)
    - Atualizado (tempo relativo)

  - **Ações Rápidas Card:** (se permitido)
    - Grid 2 colunas
    - Botão Editar
    - Botão Compartilhar

**Modals:**
- CreateInstanceModal
- ConnectionModal (QR Code / Pair Code)
- ShareModal
- EditInstanceModal
- DetailsModal

**Hooks Customizados:**
- `useInstances()` - Fetch de instâncias
- `usePermissions()` - Controle de acesso

**Funcionalidades:**
- Busca em tempo real
- Filtro por status
- Seleção de instância
- CRUD com permissões
- Deletar com confirmação
- Refetch após ações

**Loading State:** Skeletons (avatar circular + 2 linhas)

**Error State:** Alert destructive com mensagem

### 3. **Usuários** - `/integracoes/users`
**Arquivo:** `src/app/integracoes/users/page.tsx`

**Funcionalidades:**
- Listagem de usuários da organização
- Gerenciamento de permissões
- Convite de novos usuários
- Edição de roles

### 4. **Configurações** - `/integracoes/settings`
**Arquivo:** `src/app/integracoes/settings/page.tsx`
**Tipo:** Client Component ✅ ATUALIZADO

**Layout:**
- Header: Título "Configurações" + Descrição
- Cards verticais por seção

**Seções (Conforme Arquitetura Refinada):**

1. **Perfil** (ícone: User)
   - Nome (input)
   - Email (input)
   - Função (input disabled, vem do user)
   - Botão: Salvar Perfil

2. **Aparência** (ícone: Palette)
   - Tema: 3 botões (Claro, Escuro, Sistema)
   - Integração com `useTheme()` do next-themes

3. **Horário de Atendimento** (ícone: Clock) ✅ NOVO
   - **Switch:** Habilitar/Desabilitar
   - **Horários:** (se habilitado)
     - Grid 2 cols: Início (time input) + Término (time input)
   - **Fuso Horário:** Select
     - São Paulo (GMT-3)
     - Manaus (GMT-4)
     - Rio Branco (GMT-5)
   - **Dias de Funcionamento:** Botões toggle
     - Seg, Ter, Qua, Qui, Sex, Sáb, Dom
     - Variant: default (selecionado) | outline (não selecionado)
   - Botão: Salvar Horário

4. **Notificações** (ícone: Bell)
   - Switches:
     - Notificações por E-mail
     - Alertas de Instância
     - Falhas de Webhook
     - Relatório Semanal
   - Botão: Salvar Preferências

5. **Segurança** (ícone: Shield)
   - Alert informativo (dica de senha forte)
   - Senha Atual (password input)
   - Nova Senha (password input)
   - Confirmar Nova Senha (password input)
   - Validações:
     - Todos os campos obrigatórios
     - Senha mínimo 8 caracteres
     - Senhas devem coincidir
   - Botão: Alterar Senha

**Estados:**
- Loading: Botões com spinner Loader2
- Toast: Feedback de sucesso/erro (sonner)
- Disabled: Inputs durante save

**APIs (TODO):**
- Atualizar perfil
- Salvar horário de atendimento
- Atualizar notificações
- Alterar senha

**Removido (conforme arquitetura):**
- ❌ Faturamento
- ❌ Integrações Externas
- ❌ Preferências de Atendimento (consolidado em Horário)

---

## 📊 Resumo de Rotas

### Rotas Públicas
```
/ → Redireciona (login ou integracoes)
/login → Login page
/register → Registro
/forgot-password → Esqueci senha
/reset-password/[token] → Reset senha
```

### Rotas Protegidas - Admin
```
/admin → Dashboard Admin
/admin/organizations → Organizações
/admin/clients → Clientes
/admin/integracoes → Integrações (visão admin)
/admin/webhooks → Webhooks Globais ✅
/admin/brokers → Gerenciar Brokers ✅
/admin/logs → Logs Técnicos ✅
/admin/permissions → Permissões e Controle de Acesso ✅
```

### Rotas Protegidas - Organização
```
/integracoes → Integrações (lista + detalhes)
/integracoes/dashboard → Dashboard com métricas ✅
/integracoes/users → Usuários da organização
/integracoes/settings → Configurações (simplificado) ✅
/conversas → Conversas públicas (chat)
```

### Rotas Especiais
```
/connect/[token] → Conexão via link compartilhado
/user/dashboard → Dashboard de usuário simples
```

---

## ✅ Status de Implementação

### ✅ Completo
- Login/Register/Auth pages
- Dashboard Admin (básico)
- Organizações, Clientes, Integrações (admin)
- **Webhooks Globais** (admin) - NOVO
- **Gerenciar Brokers** (admin) - NOVO
- **Logs Técnicos** (admin) - NOVO
- **Permissões** (admin) - NOVO
- Integrações (lista inspirada WhatsApp)
- **Dashboard Organização** (com charts) - NOVO
- **Configurações** (simplificado + horário) - ATUALIZADO
- Conversas (página de chat)

### 🚧 Pendente/TODO
- Integração real com APIs (muitos usam mock data)
- Webhook config por integração (modal)
- Organization Switcher no NavUser
- Novo login com Stars Background
- Google OAuth
- Real-time com SSE
- Sistema de mensagens completo
- Logs persistence e API
- Permissions CRUD completo

---

## 🎨 Componentes UI Utilizados

**shadcn/ui:**
- Button, Input, Label, Textarea
- Card, Alert, Badge, Skeleton
- Select, Switch, Tabs
- Table, Avatar, Separator
- DropdownMenu, Dialog/Modal
- ScrollArea, Progress
- **Charts:** ChartContainer, ChartTooltip

**recharts:**
- AreaChart, PieChart, BarChart
- ResponsiveContainer
- CartesianGrid, XAxis, YAxis
- Tooltip customizado

**Ícones (lucide-react):**
- Navegação: Menu, MoreVertical, Search
- Status: CheckCircle2, XCircle, AlertCircle, AlertTriangle
- Recursos: Phone, Plug, Webhook, Building2, Users
- Ações: Edit, Trash2, Share2, Send, Plus
- Outros: Clock, Shield, Bell, Palette, FileText

**date-fns:**
- formatDistanceToNow
- locale ptBR

**Hooks Customizados:**
- useAuth() - Autenticação
- useInstances() - Fetch de instâncias
- usePermissions() - Controle de acesso
- useTheme() - Tema claro/escuro
- useMobile() - Responsividade

---

## 📝 Observações Importantes

1. **Integração UAZ API:**
   - ✅ Schemas definidos no YAML
   - ⚠️ Implementar timeout handlers
   - ⚠️ Recomendação WhatsApp Business deve estar visível na UI
   - ⚠️ Tratar erro 429 (limite de instâncias)

2. **Arquitetura Refinada:**
   - ✅ Projetos REMOVIDOS
   - ✅ Mensagens consolidadas no Dashboard
   - ✅ Webhooks admin-only (global)
   - ✅ Configurações simplificadas

3. **UX WhatsApp-inspired:**
   - ✅ Layout sidebar + main
   - ✅ Busca e filtros
   - ✅ Status badges coloridos
   - ✅ Tempo relativo em português
   - ✅ Empty states informativos

4. **Próximas Prioridades:**
   - Implementar APIs reais (substituir mock data)
   - Organization Switcher (admin)
   - Stars Background login
   - Webhook config por integração
   - Sistema de mensagens real-time
