# ✅ Checklist de Validação Manual - Admin & UX

**Código OTP Admin**: **428651**  
**E-mail**: admin@quayer.com  
**Data**: 12 de outubro de 2025

---

## 🎯 COMO USAR ESTE CHECKLIST

1. Fazer login com `admin@quayer.com` + código `428651`
2. Navegar para cada página listada abaixo
3. Marcar cada item como ✅ após validação
4. Capturar screenshot de cada página
5. Anotar bugs ou melhorias encontradas

---

## 1. DASHBOARD ADMIN `/admin`

### Métricas Principais
- [ ] **Total de Usuários** - número real do PostgreSQL
- [ ] **Total de Organizações** - número real do PostgreSQL
- [ ] **Integrações Ativas** - número real do PostgreSQL
- [ ] **Mensagens Hoje** - número real ou 0

### Gráficos
- [ ] **Gráfico de Usuários** - últimos 30 dias
- [ ] **Gráfico de Mensagens** - últimos 30 dias
- [ ] **Gráfico de Integrações** - últimos 30 dias

### Filtros de Período
- [ ] **Filtro 7 dias** - atualiza métricas
- [ ] **Filtro 30 dias** - atualiza métricas
- [ ] **Filtro 90 dias** - atualiza métricas
- [ ] **Filtro customizado** - date picker funcional

### Atividades Recentes
- [ ] **Lista de atividades** - dados reais ou vazio
- [ ] **Horários** - formatados corretamente
- [ ] **Tipos de evento** - ícones apropriados

### UX/UI
- [ ] **Responsivo** - mobile, tablet, desktop
- [ ] **Loading states** - skeleton durante fetch
- [ ] **Empty states** - mensagens apropriadas se vazio
- [ ] **Cores Shadcn** - bg-background, text-foreground
- [ ] **Espaçamento** - padding consistente
- [ ] **Alinhamento** - elementos alinhados

**Screenshot**: `admin-dashboard-validated.png`

---

## 2. ORGANIZAÇÕES `/admin/organizations`

### Listagem
- [ ] **Tabela de organizações** - dados reais do PostgreSQL
- [ ] **Colunas** - Nome, Master, Membros, Criado em
- [ ] **Paginação** - funcional se > 10 orgs
- [ ] **Busca** - filtrar por nome

### Criar Organização
- [ ] **Botão "Nova Organização"** - abre modal
- [ ] **Campo Nome** - validação mínimo 3 caracteres
- [ ] **Campo Descrição** - opcional
- [ ] **Botão Salvar** - cria no PostgreSQL
- [ ] **Toast sucesso** - "Organização criada"
- [ ] **Recarrega lista** - nova org aparece

### Editar Organização
- [ ] **Botão Editar** - abre modal com dados
- [ ] **Campos preenchidos** - nome e descrição atuais
- [ ] **Botão Salvar** - atualiza no PostgreSQL
- [ ] **Toast sucesso** - "Organização atualizada"
- [ ] **Recarrega lista** - dados atualizados

### Deletar Organização
- [ ] **Botão Deletar** - abre confirmação
- [ ] **Modal confirmação** - "Tem certeza?"
- [ ] **Botão Confirmar** - soft delete no PostgreSQL
- [ ] **Toast sucesso** - "Organização removida"
- [ ] **Recarrega lista** - org removida da lista

### UX/UI
- [ ] **Responsivo** - tabela adaptável
- [ ] **Loading** - skeleton na tabela
- [ ] **Empty state** - "Nenhuma organização"
- [ ] **Shadcn Table** - componente correto
- [ ] **Badges** - role master com cor
- [ ] **Tooltips** - informações adicionais

**Screenshot**: `admin-organizations-validated.png`

---

## 3. CLIENTES `/admin/clients`

### Listagem de Usuários
- [ ] **Tabela de clientes** - dados reais (api.auth.listUsers)
- [ ] **Colunas** - Nome, E-mail, Role, Org, Status
- [ ] **Avatares** - iniciais ou foto
- [ ] **Badges** - role com cores (admin=red, user=blue)
- [ ] **Paginação** - funcional se muitos usuários

### Filtros
- [ ] **Filtro por Role** - admin, user, master, manager
- [ ] **Filtro por Status** - ativo, inativo
- [ ] **Busca** - por nome ou e-mail

### Ações
- [ ] **Ver Detalhes** - abre modal com info completa
- [ ] **Editar Role** - atualizar permissões
- [ ] **Desativar Usuário** - soft delete

### UX/UI
- [ ] **Responsivo** - cards em mobile
- [ ] **Loading** - skeleton
- [ ] **Empty state** - "Nenhum cliente"
- [ ] **Shadcn Components** - Table, Badge, Avatar
- [ ] **Cores consistentes** - theme tokens

**Screenshot**: `admin-clients-validated.png`

---

## 4. INTEGRAÇÕES `/admin/integracoes`

### Visão Admin Global
- [ ] **Todas as integrações** - de todas organizações
- [ ] **Filtro por Organização** - dropdown
- [ ] **Filtro por Status** - connected, disconnected, connecting
- [ ] **Filtro por Broker** - uazapi

### Cards de Integração
- [ ] **Nome da instância** - visível
- [ ] **Organização** - tag com nome da org
- [ ] **Status** - badge colorido
- [ ] **Número de telefone** - se conectado
- [ ] **Criado em** - data formatada

### Ações Admin
- [ ] **Ver QR Code** - para reconectar
- [ ] **Configurar Webhook** - apenas admin
- [ ] **Logs da Instância** - histórico
- [ ] **Forçar Desconectar** - admin pode desconectar qualquer

### UX/UI
- [ ] **Grid responsivo** - 3 cols desktop, 1 mobile
- [ ] **Loading** - skeleton cards
- [ ] **Empty state** - "Nenhuma integração"
- [ ] **Shadcn Card** - componente correto
- [ ] **Status visual** - cores intuitivas

**Screenshot**: `admin-integracoes-validated.png`

---

## 5. WEBHOOKS `/admin/webhooks`

### Listagem de Webhooks
- [ ] **Tabela de webhooks** - dados reais
- [ ] **Colunas** - Instância, URL, Eventos, Status
- [ ] **Badge de status** - ativo/inativo

### Criar Webhook
- [ ] **Botão "Novo Webhook"** - abre form
- [ ] **Select Instância** - dropdown com todas
- [ ] **Campo URL** - validação de URL
- [ ] **Multi-select Eventos** - message.received, instance.status, etc
- [ ] **Botão Salvar** - cria webhook
- [ ] **Toast sucesso** - "Webhook configurado"

### Testar Webhook
- [ ] **Botão "Testar"** - envia POST de teste
- [ ] **Modal resultado** - mostra response
- [ ] **Indica sucesso/erro** - código HTTP

### Editar Webhook
- [ ] **Botão Editar** - abre form preenchido
- [ ] **Atualizar campos** - URL, eventos
- [ ] **Salvar** - atualiza webhook

### Deletar Webhook
- [ ] **Botão Deletar** - confirmação
- [ ] **Confirmar** - remove webhook

### UX/UI
- [ ] **Responsivo** - formulário adaptável
- [ ] **Loading** - durante teste
- [ ] **Empty state** - "Nenhum webhook"
- [ ] **Shadcn Form** - componentes corretos
- [ ] **Validações** - mensagens de erro claras

**Screenshot**: `admin-webhooks-validated.png`

---

## 6. BROKERS `/admin/brokers`

### Estado Vazio (Feature Futura)
- [ ] **Mensagem** - "Sistema de brokers em desenvolvimento"
- [ ] **Ícone** - ilustração apropriada
- [ ] **Call-to-action** - "Em breve" ou "Saiba mais"

### UX/UI
- [ ] **Centralizado** - conteúdo no centro
- [ ] **Shadcn EmptyState** - componente adequado
- [ ] **Cor text-muted-foreground** - texto secundário
- [ ] **Responsivo** - mobile/desktop

**Screenshot**: `admin-brokers-validated.png`

---

## 7. LOGS `/admin/logs`

### Logs Técnicos
- [ ] **Tabela de logs** - dados reais ou vazio
- [ ] **Colunas** - Timestamp, Level, Message, User, IP
- [ ] **Filtro por Level** - info, warn, error
- [ ] **Filtro por Date Range** - date picker
- [ ] **Busca** - por mensagem ou user

### Detalhes do Log
- [ ] **Botão Ver** - abre modal com JSON completo
- [ ] **JSON formatado** - syntax highlighting
- [ ] **Copiar JSON** - botão copy

### UX/UI
- [ ] **Monospace font** - para logs
- [ ] **Cores por level** - info=blue, error=red
- [ ] **Paginação** - lazy load
- [ ] **Loading** - skeleton
- [ ] **Empty state** - "Nenhum log"

**Screenshot**: `admin-logs-validated.png`

---

## 8. PERMISSÕES `/admin/permissions`

### Documentação de Roles
- [ ] **4 Roles listados** - admin, master, manager, user
- [ ] **Cards por role** - design card
- [ ] **Descrição** - texto explicativo
- [ ] **Permissões** - lista de capabilities

### Admin
- [ ] **Texto** - "Acesso total ao sistema"
- [ ] **Permissões** - todas listadas
- [ ] **Badge** - vermelho/primary

### Master
- [ ] **Texto** - "Gerencia organização completa"
- [ ] **Permissões** - CRUD org, members, instances
- [ ] **Badge** - roxo/purple

### Manager
- [ ] **Texto** - "Gerencia instâncias"
- [ ] **Permissões** - instances, webhooks
- [ ] **Badge** - azul/blue

### User
- [ ] **Texto** - "Visualiza e usa instâncias"
- [ ] **Permissões** - view, send messages
- [ ] **Badge** - verde/green

### UX/UI
- [ ] **Grid 2x2** - desktop
- [ ] **Stacked** - mobile
- [ ] **Shadcn Card** - componentes
- [ ] **Icons** - Shield, Users, Settings
- [ ] **Responsivo** - adaptável

**Screenshot**: `admin-permissions-validated.png`

---

## 9. SIDEBAR ADMIN

### Navegação
- [ ] **8 itens visíveis** - Dashboard, Orgs, Clientes, Integrações, Webhooks, Brokers, Logs, Permissões
- [ ] **Ícones corretos** - LayoutDashboard, Building2, Users, Plug, Webhook, Database, FileText, Shield
- [ ] **Active state** - destaque no item atual
- [ ] **Hover state** - feedback visual

### Responsividade
- [ ] **Desktop** - sidebar fixa à esquerda
- [ ] **Tablet** - sidebar colapsável
- [ ] **Mobile** - hamburger menu

### Tema
- [ ] **Dark mode** - cores consistentes
- [ ] **Shadcn sidebar** - componente correto
- [ ] **Animações** - transições suaves

**Screenshot**: `admin-sidebar-complete.png` ✅ **JÁ VALIDADO**

---

## 10. DASHBOARD USUÁRIO `/user/dashboard`

### Métricas do Usuário
- [ ] **Minhas Integrações** - count real
- [ ] **Mensagens Enviadas** - hoje ou total
- [ ] **Taxa de Entrega** - percentual
- [ ] **Webhooks Ativos** - count

### Atividades Recentes
- [ ] **Lista vazia** - até implementar audit log
- [ ] **Empty state** - "Nenhuma atividade"

### Quick Actions
- [ ] **Nova Integração** - redirect /integracoes
- [ ] **Enviar Mensagem** - redirect /integracoes
- [ ] **Ver Webhooks** - redirect /integracoes/webhooks

### UX/UI
- [ ] **Cards de métricas** - 4 cards
- [ ] **Gráfico** - se houver dados
- [ ] **Responsivo** - mobile friendly
- [ ] **Shadcn** - components corretos
- [ ] **Loading** - skeleton

**Screenshot**: `user-dashboard-validated.png`

---

## 11. NOVA UX INTEGRAÇÕES `/integracoes`

### Lista de Integrações
- [ ] **Cards modernos** - design Evolution API inspired
- [ ] **Grid responsivo** - 3 cols → 1 col
- [ ] **Dropdown menu** - 3 dots no card
- [ ] **Status badge** - connected/disconnected
- [ ] **Avatar** - WhatsApp icon

### Botão Nova Integração
- [ ] **Botão visível** - canto superior direito
- [ ] **Ícone Plus** - ao lado do texto
- [ ] **Abre modal** - CreateIntegrationModal

### Modal - Step 1: Canal
- [ ] **Progress bar** - 5 steps
- [ ] **Card WhatsApp** - selecionável
- [ ] **Features listadas** - 4-5 bullets
- [ ] **Botão Próximo** - ativo após seleção

### Modal - Step 2: Configurar
- [ ] **Campo Nome** - required
- [ ] **Campo Descrição** - optional
- [ ] **Campo Webhook** - apenas admin
- [ ] **Validações** - inline errors
- [ ] **Botão Próximo** - cria instância

### Modal - Step 3: Conectar
- [ ] **Loading** - "Criando integração..."
- [ ] **Success** - checkmark green
- [ ] **Auto-avança** - para step 4

### Modal - Step 4: Compartilhar
- [ ] **Botão Copiar Link** - copia URL
- [ ] **Botão Gerar QR** - abre página pública
- [ ] **Toast** - "Link copiado!"

### Modal - Step 5: Sucesso
- [ ] **Mensagem** - "Integração criada!"
- [ ] **Botão Finalizar** - fecha modal
- [ ] **Redirect** - volta para lista

### Dropdown Actions
- [ ] **Gerar QR Code** - se disconnected
- [ ] **Compartilhar Link** - sempre
- [ ] **Reconectar** - se disconnected
- [ ] **Deletar** - confirmação

### UX/UI
- [ ] **Tema dark** - consistente
- [ ] **Shadcn components** - Dialog, Card, Button
- [ ] **Animações** - transitions suaves
- [ ] **Responsivo** - mobile modal fullscreen
- [ ] **Progress visual** - step indicator
- [ ] **Loading states** - spinners
- [ ] **Toast notifications** - Sonner

**Screenshot**: `nova-ux-integracoes-validated.png`

---

## 12. PÁGINA PÚBLICA COMPARTILHAMENTO `/integracoes/compartilhar/[token]`

### Layout
- [ ] **Sem login** - acesso público
- [ ] **Logo Quayer** - cabeçalho
- [ ] **Nome da integração** - visível
- [ ] **Organização** - nome da org

### QR Code
- [ ] **QR visível** - se token válido
- [ ] **Responsivo** - tamanho adaptável
- [ ] **Alta qualidade** - imagem clara

### Timer de Expiração
- [ ] **Contagem regressiva** - atualiza a cada segundo
- [ ] **Formato** - MM:SS
- [ ] **Cor** - vermelho quando < 5min

### Botão Refresh
- [ ] **Botão visível** - "Atualizar QR Code"
- [ ] **Faz request** - POST /share/:token/refresh
- [ ] **Novo QR** - atualiza imagem
- [ ] **Estende timer** - +1h
- [ ] **Toast** - "QR atualizado!"

### Token Expirado
- [ ] **Mensagem erro** - "Link expirado"
- [ ] **Ícone** - X ou relógio
- [ ] **CTA** - "Solicite novo link"

### UX/UI
- [ ] **Centralizado** - layout centrado
- [ ] **Shadcn Card** - componente
- [ ] **Responsivo** - mobile/desktop
- [ ] **Dark mode** - tema consistente
- [ ] **Instructions** - passo a passo
- [ ] **Acessibilidade** - alt texts

**Screenshot**: `public-share-validated.png`

---

## 13. TROCA DE ORGANIZAÇÃO

### Criar Segunda Organização
- [ ] **Login como usuário** - não admin
- [ ] **Ir para /settings** - ou perfil
- [ ] **Criar nova org** - formulário
- [ ] **Org criada** - aparece no switcher

### Switcher de Organizações
- [ ] **Dropdown** - lista organizações
- [ ] **Org atual** - destacada
- [ ] **Trocar** - clique muda org
- [ ] **Recarrega dados** - integrações da nova org
- [ ] **LocalStorage** - persiste escolha

### Validações
- [ ] **Integrações** - filtra por org
- [ ] **Webhooks** - filtra por org
- [ ] **Membros** - mostra apenas da org atual
- [ ] **Sidebar** - atualiza nome da org

**Screenshot**: `org-switcher-validated.png`

---

## 14. REVIEW UX/UI GERAL

### Padrões Shadcn
- [ ] **Cores** - bg-background, text-foreground
- [ ] **Borders** - border-border
- [ ] **Hover** - hover:bg-accent
- [ ] **Focus** - ring-ring
- [ ] **Components** - Button, Card, Table, Dialog, Badge

### Espaçamento
- [ ] **Padding** - p-4, p-6 consistente
- [ ] **Margin** - mb-4, mt-6 consistente
- [ ] **Gap** - gap-4 em grids
- [ ] **Container** - max-w-7xl mx-auto

### Alinhamento
- [ ] **Texto** - text-left, text-center apropriado
- [ ] **Flexbox** - items-center, justify-between
- [ ] **Grid** - grid-cols-* responsivo

### Tipografia
- [ ] **Headings** - text-2xl font-bold
- [ ] **Body** - text-base
- [ ] **Muted** - text-muted-foreground
- [ ] **Small** - text-sm

### Responsividade
- [ ] **Breakpoints** - sm:, md:, lg:
- [ ] **Grid adaptável** - cols-1 md:cols-2 lg:cols-3
- [ ] **Mobile first** - design mobile primeiro

### Usabilidade
- [ ] **Loading states** - skeleton, spinners
- [ ] **Empty states** - mensagens apropriadas
- [ ] **Error states** - mensagens claras
- [ ] **Success feedback** - toast notifications
- [ ] **Confirmações** - dialogs antes de ações destrutivas
- [ ] **Acessibilidade** - alt texts, aria-labels
- [ ] **Keyboard navigation** - Tab, Enter, Escape

**Screenshot**: `ux-ui-review-complete.png`

---

## 📊 PROGRESSO

```
Dashboard Admin        [ ]
Organizações          [ ]
Clientes              [ ]
Integrações Admin     [ ]
Webhooks              [ ]
Brokers               [ ]
Logs                  [ ]
Permissões            [ ]
Sidebar Admin         [✅] JÁ VALIDADO
Dashboard User        [ ]
Nova UX Integrações   [ ]
Página Pública        [ ]
Troca de Org          [ ]
Review UX/UI          [ ]

TOTAL: 1/14 (7%)
```

---

## 🎯 BUGS/MELHORIAS ENCONTRADOS

_(Anotar aqui durante validações)_

1. 

---

## ✅ ASSINATURA

**Validado por**: _____________________  
**Data**: _____________________  
**Screenshots em**: `.playwright-mcp/`

