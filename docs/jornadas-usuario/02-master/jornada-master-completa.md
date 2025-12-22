# Jornada do Usuário Master (Owner da Organização)

> **Perfil**: `organizationRole: master` no sistema
> **Acesso**: Total dentro da sua organização
> **Responsabilidade**: Gerenciar toda a operação da organização
> **Última Atualização**: 2025-12-21 (Revisão brutal de implementações)
> **Progresso**: 3 correções críticas implementadas

---

## 1. Mapa de Navegação do Master

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SIDEBAR - MASTER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🏢 [NOME DA ORGANIZAÇÃO]                                                   │
│  ├── Dashboard ──────────────► /integracoes/dashboard                       │
│  ├── Canais ─────────────────► /integracoes                                 │
│  ├── Conversas ──────────────► /conversas → /integracoes/conversations      │
│  ├── Contatos ───────────────► /contatos                                    │
│  ├── Equipe ─────────────────► /integracoes/users                           │
│  ├── Atendimentos ──────────► /integracoes/sessions                         │
│  ├── Webhooks ───────────────► /configuracoes/webhooks → /ferramentas/webhooks│
│  ├── Ferramentas ────────────► /ferramentas                                 │
│  │   ├── Webhooks ───────────► /ferramentas/webhooks                        │
│  │   └── Chatwoot ───────────► /ferramentas/chatwoot                        │
│  └── Configurações ──────────► /integracoes/settings                        │
│      └── Provedores ─────────► /integracoes/settings/organization/integrations│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Sistema de Papéis (RBAC)

### 2.1 Hierarquia de Papéis na Organização

```
┌──────────────────────────────────────────────────────────────────┐
│                    SISTEMA DE DOIS NÍVEIS                        │
└──────────────────────────────────────────────────────────────────┘

 NÍVEL 1: Role do Sistema (User.role)
 ┌─────────────────────────────────────────────────────────────────┐
 │  admin    ──► Super Admin (acesso total a todas as organizações)│
 │  user     ──► Usuário comum (acesso apenas via organização)     │
 └─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
 NÍVEL 2: Role na Organização (UserOrganization.role)
 ┌─────────────────────────────────────────────────────────────────┐
 │  master   ──► Owner/Proprietário (controle total da org)        │
 │  manager  ──► Gerente (pode convidar membros, gerenciar equipe) │
 │  user     ──► Membro (acesso básico às funcionalidades)         │
 └─────────────────────────────────────────────────────────────────┘
```

### 2.2 Matriz de Permissões do Master

| Recurso | Master | Manager | User |
|---------|--------|---------|------|
| Dashboard | ✅ Total | ✅ Total | ❌ |
| Canais (CRUD) | ✅ Total | ✅ Total | ✅ Visualizar |
| Conversas | ✅ Total | ✅ Total | ✅ Próprias |
| Contatos | ✅ Total | ✅ Total | ✅ Visualizar |
| Equipe (gerenciar) | ✅ Total | ✅ Parcial | ❌ |
| Convidar membros | ✅ | ✅ | ❌ |
| Alterar roles | ✅ | ❌ | ❌ |
| Remover membros | ✅ | ❌ | ❌ |
| Webhooks | ✅ Total | ✅ Total | ❌ |
| Ferramentas | ✅ Total | ✅ Total | ❌ |
| Configurações Org | ✅ Total | ❌ | ❌ |
| API Keys | ✅ | ❌ | ❌ |

---

## 3. Jornadas End-to-End

### 3.1 🔐 Jornada: Primeiro Acesso e Onboarding

> **IMPORTANTE**: O sistema NÃO usa login com senha tradicional.
> Métodos de autenticação: Magic Link (OTP), Google OAuth, Passkey

```
┌──────────────────────────────────────────────────────────────────┐
│                FLUXO DE ONBOARDING DO MASTER                     │
└──────────────────────────────────────────────────────────────────┘

[Novo Usuário] ──► /signup
                   │
                   ├──► 1. Preenche nome e email
                   ├──► 2. API: POST /auth/signup
                   ├──► 3. Recebe OTP por email
                   ├──► 4. Verifica OTP em /signup/verify
                   │
                   └──► 5. Redireciona para /onboarding
                        │
                        ├──► 6. Preenche dados da organização:
                        │    ├── Nome da empresa
                        │    ├── CPF/CNPJ (validado)
                        │    ├── Tipo (PF/PJ)
                        │    ├── Timezone
                        │    └── Horário de funcionamento
                        │
                        ├──► 7. API: POST /organizations
                        │    ├── Cria organização
                        │    ├── Cria UserOrganization com role=master
                        │    ├── Atualiza user.currentOrgId
                        │    └── Retorna novo accessToken
                        │
                        └──► 8. ✅ Sucesso ──► /integracoes/dashboard
                             (Primeiro acesso ao Dashboard)
```

**Status**: ✅ Funcional

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | Welcome tour interativo (primeira vez) | 🟡 Médio | 4h |
| 2 | Checklist de configuração inicial | 🟡 Médio | 3h |
| 3 | Tutorial para conectar primeiro WhatsApp | 🟢 Baixo | 2h |

---

### 3.2 📊 Jornada: Dashboard e Métricas

```
┌──────────────────────────────────────────────────────────────────┐
│                    FLUXO DE DASHBOARD                            │
└──────────────────────────────────────────────────────────────────┘

[Master] ──► /integracoes/dashboard
             │
             ├──► 🗓️ Seletor de Período (hoje, 7 dias, 30 dias, tudo)
             │
             ├──► 📈 Cards de Métricas (api.dashboard.getMetrics?period=...)
             │    ├── Integrações Ativas (connected/total)
             │    ├── Conversas Abertas (inProgress/total)
             │    ├── Mensagens no Período (sent, deliveryRate)
             │    └── Controladas por IA (aiControlled/total)
             │
             ├──► 📊 Métricas de Conversas
             │    ├── Total
             │    ├── Em Andamento
             │    ├── IA vs Humano
             │    ├── Tempo Médio de Resposta
             │    └── Taxa de Resolução
             │
             ├──► 📉 Performance de Mensagens
             │    ├── Enviadas
             │    ├── Entregues (%)
             │    ├── Lidas (%)
             │    └── Falhadas (%)
             │
             └──► 📈 Gráficos
                  ├── Conversas por Hora (últimas 24h)
                  ├── IA vs Humano (pie chart)
                  └── Mensagens por Status (bar chart)
```

**Status**: ✅ Funcional (com cache de 60s e seletor de período)

**Pontos Fortes**:
- ✅ Cache implementado (60s TTL por período)
- ✅ Promise.all para queries paralelas
- ✅ Validação de currentOrgId
- ✅ Animações e tooltips explicativos
- ✅ Dados reais da UAZapi
- ✅ Seletor de período: Hoje, 7 dias, 30 dias, Todo período
- ✅ Comparativo período anterior: badges com variação % (↑↓) em cada card

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço | Status |
|---|----------|------------|---------|--------|
| 1 | ~~Período customizável (hoje, semana, mês)~~ | ~~🟡 Médio~~ | ~~3h~~ | ✅ FEITO 2025-12-21 |
| 2 | Export de métricas (PDF/CSV) | 🟢 Baixo | 4h | ⏳ Pendente |
| 3 | ~~Comparativo período anterior~~ | ~~🟢 Baixo~~ | ~~4h~~ | ✅ FEITO 2025-12-21 |
| 4 | Real-time com SSE | 🟢 Baixo | 6h | ⏳ Pendente |

> **Nota 2025-12-21**: Seletor de período implementado com filtro no backend (dashboard.controller.ts) e frontend (page.tsx)
> **Nota 2025-12-21**: Comparativo com período anterior implementado - mostra variação percentual (↑ ou ↓) nos cards e métricas

---

### 3.3 📱 Jornada: Gerenciamento de Canais WhatsApp

> **Análise Profunda realizada em 2025-12-21**

```
┌──────────────────────────────────────────────────────────────────┐
│              FLUXO DE GERENCIAMENTO DE CANAIS                    │
└──────────────────────────────────────────────────────────────────┘

[Master] ──► /integracoes (IntegrationsPage)
             │
             ├──► 📋 Listar Canais (useInstances hook)
             │    ├── Cards com status (connected/disconnected/connecting)
             │    ├── Filtro por status (all/connected/connecting/disconnected)
             │    ├── Busca por nome ou profileName
             │    ├── Grid/List view toggle
             │    ├── Limite: organization.maxInstances (configurável)
             │    ├── Polling inteligente:
             │    │   ├── Normal: 10s refetchInterval
             │    │   └── Fast: 3s quando há conexões pendentes ou QR modal aberto
             │    └── Skeleton loading durante hydration
             │
             ├──► ➕ [Conectar] Nova Instância (CreateIntegrationModal)
             │    │
             │    ├──► Step 1: Escolher Canal
             │    │    ├── WhatsApp Web (UAZAPI) - QR Code
             │    │    └── WhatsApp Cloud API (Meta) - Tokens
             │    │
             │    ├──► Step 2: Configurar
             │    │    ├── Nome da instância (obrigatório)
             │    │    ├── Descrição (opcional)
             │    │    ├── Webhook URL (apenas Admin)
             │    │    └── [Cloud API] Access Token, Phone ID, WABA ID
             │    │
             │    ├──► API: POST /api/v1/instances
             │    │    ├── Valida organizationId (OBRIGATÓRIO para não-admin)
             │    │    ├── Verifica limite de instâncias da org
             │    │    ├── [UAZAPI] Cria em uazapi.com/instance/init
             │    │    │   └── Salva uazapiToken e uazapiInstanceId
             │    │    └── [Cloud API] Valida credenciais na Meta
             │    │        └── Já salva como CONNECTED
             │    │
             │    ├──► Step 3: Método de Conexão (apenas UAZAPI)
             │    │    ├── 📱 QR Code - Escanear agora
             │    │    └── 🔗 Link - Gerar para outra pessoa
             │    │
             │    └──► [Se QR Code] Abre QRCodeModal
             │
             ├──► 📷 QRCodeModal
             │    ├── Auto-connect ao abrir (POST /instances/:id/connect)
             │    ├── Exibe QR Code base64
             │    ├── Instruções de escaneamento
             │    ├── Polling status (useInstanceStatus, 3s)
             │    ├── Animação pulse ao atualizar QR
             │    ├── Auto-fecha 3s após conexão
             │    └── Invalida cache ['instances'] no sucesso
             │
             ├──► 🔄 [Reconectar] Instância desconectada
             │    └── handleReconnect → connectInstanceMutation → QRCodeModal
             │
             ├──► ⚙️ IntegrationCard [Menu de Ações]
             │    ├── Reconectar (se desconectado)
             │    ├── Desconectar (AlertDialog de confirmação)
             │    ├── Compartilhar (ShareLinkModal)
             │    └── Excluir (AlertDialog + optimistic update)
             │
             └──► 🔗 [Compartilhar] ShareLinkModal
                  ├── POST /instances/:id/share
                  ├── Gera shareToken com expiração (1h)
                  ├── Link público para escanear QR
                  └── Copiar/Compartilhar via Web Share API
```

#### Arquivos-Chave do Fluxo

| Arquivo | Responsabilidade |
|---------|------------------|
| [page.tsx](src/app/integracoes/page.tsx) | Página principal, orchestration |
| [CreateIntegrationModal.tsx](src/components/integrations/CreateIntegrationModal.tsx) | Wizard de criação multi-step |
| [QRCodeModal.tsx](src/features/connections/components/QRCodeModal.tsx) | Modal de QR Code com polling |
| [useInstance.ts](src/hooks/useInstance.ts) | Hooks TanStack Query |
| [instances.controller.ts](src/features/instances/controllers/instances.controller.ts) | API endpoints |
| [uazapi.service.ts](src/lib/api/uazapi.service.ts) | Integração UAZapi |

#### Análise de Segurança

**✅ CORRIGIDO - Validação de Organização**:
```typescript
// instances.controller.ts:257-258
if (!isAdmin && !user?.currentOrgId) {
  return response.forbidden('Usuário não possui organização associada. Complete o onboarding primeiro.');
}
```

**✅ checkOrganizationPermission() - Bem implementado**:
```typescript
// instances.controller.ts:38-55
function checkOrganizationPermission(
  instanceOrganizationId: string | null,
  userOrganizationId?: string,
  userRole?: string
): boolean {
  if (userRole === 'admin') return true;           // Admin total
  if (!userOrganizationId) return false;           // User sem org = negado
  if (!instanceOrganizationId) return false;       // Instância órfã = negado
  return instanceOrganizationId === userOrganizationId;  // Match org
}
```

**✅ Limite de Instâncias por Organização**:
```typescript
// instances.controller.ts:117-126
if (organization.connections.length >= organization.maxInstances) {
  return response.badRequest(`Limite de instâncias atingido. Seu plano permite no máximo ${organization.maxInstances} instância(s).`);
}
```

#### Análise de UX

**Pontos Fortes**:
- ✅ Polling inteligente (fast quando há atividade pendente)
- ✅ Skeleton loading durante hydration
- ✅ Animação pulse no QR Code ao atualizar
- ✅ Auto-close após conexão bem-sucedida
- ✅ Optimistic update ao deletar instância
- ✅ Confirmação para ações destrutivas
- ✅ Acessibilidade (aria-labels, role=status, live regions)

**⚠️ Pontos de Atenção**:
1. ~~Limite "10 instâncias" hardcoded na UI~~ ✅ CORRIGIDO - Usa `organization.maxInstances` dinamicamente
2. ~~Cloud API não tem feedback visual de validação das credenciais antes de criar~~ ✅ CORRIGIDO - Botão "Testar Credenciais" adicionado (2025-12-21)

**Status**: ✅ Funcional e Seguro

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| ~~1~~ | ~~Mostrar limite real da org em vez de hardcoded "10"~~ | ✅ FEITO | 2025-12-21 |
| 2 | Editar nome da instância | 🟡 Médio | 1h |
| ~~3~~ | ~~Preview de validação Cloud API antes de criar~~ | ✅ FEITO | 2025-12-21 |
| ~~4~~ | ~~Histórico de conexões/desconexões~~ | ✅ FEITO | `ConnectionEvent` model + `getEvents` API + `ConnectionHistory` UI |
| ~~5~~ | ~~Notificação push quando desconectar~~ | ✅ FEITO | `connection-notifications.service.ts` integrado ao repository |
| ~~6~~ | ~~Retry automático ao falhar QR Code~~ | ✅ FEITO | Auto-refresh no countdown do QRCodeModal |

---

### 3.3.1 📤 Sub-Jornada: Link de Compartilhamento

> **Validação Brutal realizada em 2025-12-21**

```
┌──────────────────────────────────────────────────────────────────┐
│              FLUXO DE LINK DE COMPARTILHAMENTO                   │
└──────────────────────────────────────────────────────────────────┘

[Master] ──► /integracoes
             │
             ├──► IntegrationCard [⋯] Menu
             │    └──► "Compartilhar"
             │
             └──► ShareLinkModal
                  │
                  ├──► [Gerar Link] ──────────────────────────────┐
                  │    │                                          │
                  │    └──► POST /api/v1/instances/:id/share     │
                  │         │                                     │
                  │         ├──► Valida authProcedure ✅          │
                  │         ├──► Verifica RBAC org ✅             │
                  │         ├──► Gera shareToken único            │
                  │         │    "share_{timestamp}_{random}"     │
                  │         ├──► Define expiração (1 hora)        │
                  │         └──► Salva no banco (repository)      │
                  │                                               │
                  └──► Exibe:                                     │
                       ├── Link: /compartilhar/{token}            │
                       ├── Botão Copiar                           │
                       ├── Botão Compartilhar (Web Share API)     │
                       └── Timer de expiração                     │

                               ▼
                  [Usuário externo recebe link]
                               ▼

[Usuário Externo] ──► /compartilhar/{token} (Página Pública)
                      │
                      ├──► Middleware: ✅ Não protegida
                      │    (não está em PROTECTED_PATHS)
                      │
                      ├──► SharePageContent
                      │    │
                      │    └──► GET /api/v1/instances/share/{token}
                      │         ├──► instancesProcedure (SEM auth) ✅
                      │         ├──► Valida token existe
                      │         ├──► Valida token não expirado
                      │         ├──► Verifica status real na UAZapi
                      │         ├──► Gera QR Code se não conectado
                      │         └──► Retorna dados públicos:
                      │              { id, name, status, qrCode,
                      │                organizationName, expiresAt }
                      │
                      ├──► Tab: QR Code
                      │    ├──► Exibe QR Code
                      │    ├──► Polling status (5s)
                      │    └──► [Atualizar QR]
                      │         └──► POST /share/{token}/refresh
                      │              └──► Estende expiração +1h ⚠️
                      │
                      └──► Tab: Código de Pareamento
                           ├──► Input: Telefone (+55)
                           └──► [Gerar Código]
                                └──► POST /share/{token}/pairing-code
                                     ├──► Valida telefone (10-15 dígitos)
                                     ├──► Verifica status real UAZapi
                                     ├──► Se conectado: retorna sucesso
                                     ├──► Gera pairing code via UAZapi
                                     └──► Estende expiração +1h ⚠️
```

#### Mapeamento de Rotas API

| Endpoint | Método | Auth | Propósito | Status |
|----------|--------|------|-----------|--------|
| `/api/v1/instances/:id/share` | POST | ✅ Auth | Gerar token | ✅ OK |
| `/api/v1/instances/share/:token` | GET | ❌ Público | Buscar dados | ✅ OK |
| `/api/v1/instances/share/:token/refresh` | POST | ❌ Público | Atualizar QR | ✅ OK |
| `/api/v1/instances/share/:token/pairing-code` | POST | ❌ Público | Gerar código | ✅ OK |

#### Arquivos do Fluxo

| Arquivo | Linha | Responsabilidade |
|---------|-------|------------------|
| [share-link-modal.tsx](src/components/whatsapp/share-link-modal.tsx) | - | Modal de geração |
| [page.tsx](src/app/(public)/compartilhar/[token]/page.tsx) | - | Página pública |
| [instances.controller.ts](src/features/instances/controllers/instances.controller.ts) | 1084-1131 | share endpoint |
| [instances.controller.ts](src/features/instances/controllers/instances.controller.ts) | 1134-1243 | getShared endpoint |
| [instances.controller.ts](src/features/instances/controllers/instances.controller.ts) | 1247-1314 | refreshSharedQr |
| [instances.controller.ts](src/features/instances/controllers/instances.controller.ts) | 1318-1436 | getSharedPairingCode |
| [instances.repository.ts](src/features/instances/repositories/instances.repository.ts) | 266-314 | findByShareToken, updateShareToken |

#### Análise de Segurança

**✅ Pontos Fortes**:
1. Token único não-guessável (`share_{timestamp}_{random}`)
2. Expiração de 1 hora por padrão
3. Validação de token em todos endpoints públicos
4. Dados sensíveis não expostos (uazapiToken, cloudApiAccessToken omitidos)
5. Verificação de status real via UAZapi antes de responder

**⚠️ Pontos de Atenção**:
1. ~~**Token Immortal**: Refresh e pairing-code estendem expiração +1h cada vez~~ ✅ CORRIGIDO (2025-12-21)
   - ~~Usuário pode manter token vivo indefinidamente clicando refresh~~
   - ✅ **Implementado**: Limite absoluto de 24h desde criação do token (`maxAbsoluteExpiry`)
   - Após 24h, usuário deve gerar novo link de compartilhamento

**Status**: ✅ Funcional e Seguro

---

### 3.3.2 🔑 Sub-Jornada: Código de Pareamento (Interno)

> **Validação realizada em 2025-12-21**

```
┌──────────────────────────────────────────────────────────────────┐
│            FLUXO DE PAREAMENTO INTERNO (AUTENTICADO)             │
└──────────────────────────────────────────────────────────────────┘

[Master] ──► /integracoes
             │
             ├──► IntegrationCard [desconectado]
             │    └──► [Reconectar]
             │
             └──► QRCodeModal
                  │
                  ├──► Auto-connect ao abrir
                  │    └──► POST /api/v1/instances/:id/connect
                  │         ├──► authProcedure ✅
                  │         ├──► RBAC checkOrganizationPermission ✅
                  │         ├──► providerOrchestrator.connectInstance()
                  │         └──► Retorna { qrcode, expires }
                  │
                  ├──► Polling de status (useInstanceStatus, 3s)
                  │    └──► GET /api/v1/instances/:id/status
                  │
                  └──► Detecção automática de conexão
                       └──► Se status = 'connected':
                            ├── Toast de sucesso
                            ├── Invalida cache TanStack Query
                            └── Auto-fecha modal em 3s
```

**Nota**: O QRCodeModal interno NÃO usa o endpoint de pairing-code.
O pairing-code é usado apenas na página pública de compartilhamento.

Para uso interno, existe:
- `POST /api/v1/instances/:id/pairing-code` (linha 582-633)
- Requer autenticação
- Aceita `{ phoneNumber }` no body
- **Atualmente não utilizado pelo frontend** (apenas QR Code)

**Status**: ✅ Funcional

---

### 3.4 💬 Jornada: Conversas e Atendimento

> **Análise brutal realizada em 2025-12-21**
> **Status**: ✅ Rotas validadas end-to-end

```
┌──────────────────────────────────────────────────────────────────┐
│                    FLUXO DE CONVERSAS                            │
└──────────────────────────────────────────────────────────────────┘

[Master] ──► /conversas (redirect)
             │
             └──► /integracoes/conversations
                  │
                  ├──► 📋 Lista de Conversas
                  │    ├── Busca por contato/número
                  │    ├── Filtro por status
                  │    ├── Ordenação por data
                  │    └── Preview da última mensagem
                  │
                  ├──► 💬 Visualizar Conversa
                  │    ├── Histórico completo
                  │    ├── Informações do contato
                  │    ├── Transferir para humano/IA
                  │    └── Encerrar sessão
                  │
                  └──► ✏️ Responder
                       ├── Texto
                       ├── Mídia (imagens, áudio, documentos)
                       └── Templates (pré-aprovados)
```

#### 3.4.1 Arquitetura de Controllers

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    CONTROLLERS DE CONVERSAS                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐            │
│  │ chatsController │   │messagesController│  │ sessionsController│           │
│  │ /api/v1/chats   │   │ /api/v1/messages│   │ /api/v1/sessions │           │
│  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘            │
│           │                     │                     │                      │
│           ▼                     ▼                     ▼                      │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐            │
│  │  UAZapiService  │   │   Orchestrator  │   │ SessionsManager │            │
│  │ (findChats,     │   │ (Provider-      │   │ (block/unblock  │            │
│  │  markAsRead)    │   │  Agnostic)      │   │  AI, status)    │            │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘            │
│                                                                              │
│  ┌─────────────────┐                                                        │
│  │ mediaController │                                                        │
│  │/api/v1/messages │                                                        │
│  │    /media/*     │                                                        │
│  └─────────────────┘                                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### 3.4.2 Mapeamento Completo de Rotas

| Controller | Endpoint | Método | Descrição | UAZapi |
|------------|----------|--------|-----------|--------|
| **chats** | `/chats/list` | GET | Listar conversas | `POST /chat/find` |
| | `/chats/count` | GET | Contagem de chats | DB only |
| | `/chats/mark-read` | POST | Marcar como lido | `POST /chat/mark-read` |
| | `/chats/:chatId/archive` | POST | Arquivar chat | `POST /chat/archive` |
| | `/chats/:chatId` | DELETE | Deletar chat | `DELETE /chat/delete` |
| | `/chats/:chatId/block` | POST | Bloquear contato | `POST /contact/block` |
| **messages** | `/messages` | POST | Enviar mensagem | `orchestrator.sendText()` |
| | `/messages` | GET | Listar mensagens | DB only |
| | `/messages/:id` | GET | Buscar mensagem | DB only |
| | `/messages/:id/download` | GET | Download mídia | `orchestrator.downloadMedia()` |
| | `/messages/:id/react` | POST | Reagir com emoji | `orchestrator.reactToMessage()` |
| | `/messages/:id` | DELETE | Deletar mensagem | `orchestrator.deleteMessage()` |
| | `/messages/:id/mark-read` | PATCH | Marcar como lido | `orchestrator.markAsRead()` |
| **media** | `/messages/media/image` | POST | Enviar imagem | `POST /send/media` |
| | `/messages/media/document` | POST | Enviar documento | `POST /send/media` |
| **sessions** | `/sessions` | GET | Listar sessões | DB + Cache 30s |
| | `/sessions/:id` | GET | Buscar sessão | DB only |
| | `/sessions/:id/block-ai` | POST | Bloquear IA | DB only |
| | `/sessions/:id/unblock-ai` | POST | Desbloquear IA | DB only |
| | `/sessions/:id/close` | POST | Encerrar sessão | DB only |
| | `/sessions/:id/status` | PATCH | Atualizar status | DB + SSE |
| | `/sessions/:id/department` | PATCH | Atualizar depto | DB only |
| | `/sessions/:id/tags` | POST | Adicionar tags | DB only |
| | `/sessions/:id/tags` | DELETE | Remover tags | DB only |
| | `/sessions/:id/ai-status` | GET | Verificar IA | DB only |
| | `/sessions/by-contact/:id` | GET | Sessões por contato | DB only |
| | `/sessions/blacklist` | GET | Listar blacklist | DB only |
| | `/sessions/contacts/:id/blacklist` | POST/DEL | Gerenciar blacklist | DB only |
| | `/sessions/contacts/:id/labels` | PUT | Gerenciar labels | DB + SSE |
| | `/sessions/:id/labels` | PUT | Labels da sessão | DB + SSE |
| | `/sessions/tabulations` | GET | Listar tabulations | DB only |
| | `/sessions/contacts` | GET | View otimizada inbox | DB only |
| | `/sessions/contacts/:id/lead` | PATCH | Editar lead | DB + SSE |
| | `/sessions/:id/lead` | PATCH | Editar ticket | DB + SSE |

#### 3.4.3 Fluxo de Envio de Mensagem (Provider-Agnostic)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    FLUXO DE ENVIO DE MENSAGEM                                 │
└──────────────────────────────────────────────────────────────────────────────┘

[Frontend] POST /api/v1/messages
      │
      │ Body: { sessionId, type, content, direction, author, ... }
      ▼
[messagesController:53-300]
      │
      │ 1. Buscar sessão com contact + connection
      │ 2. Verificar permissões (organizationId)
      │ 3. Verificar se sessão não está CLOSED
      │ 4. Gerar waMessageId único
      │ 5. Salvar mensagem no DB
      ▼
[mapProviderToBrokerType()]
      │
      │ WHATSAPP_WEB → 'uazapi'
      │ WHATSAPP_CLOUD_API → 'cloudapi'
      ▼
[orchestrator.sendText()] ou [orchestrator.sendMedia()]
      │
      │ Se showTyping=true: orchestrator.sendPresence('composing')
      │ Se delayMs>0: await delay(delayMs)
      ▼
[UAZapiAdapter] → [UAZClient] → POST /send/text ou /send/media
      │
      │ 6. Atualizar status para 'sent'
      │ 7. Se pauseSession=true: sessionsManager.updateSessionStatus('PAUSED')
      │ 8. Se author=AGENT: sessionsManager.blockAI(60min)
      ▼
[Response] { id, waMessageId, status: 'sent', ... }
```

#### 3.4.4 Tipos de Mensagem Suportados

| Tipo | orchestrator Method | UAZapi Endpoint |
|------|---------------------|-----------------|
| `text` | `sendText()` | `POST /send/text` |
| `image` | `sendMedia()` | `POST /send/media` |
| `video` | `sendMedia()` | `POST /send/media` |
| `audio` | `sendMedia()` | `POST /send/media` |
| `document` | `sendMedia()` | `POST /send/media` |
| `location` | `sendLocation()` | `POST /send/location` |
| `contact` | `sendContact()` | `POST /send/contact` |
| `list` | `sendInteractiveList()` | `POST /send/list` |
| `buttons` | `sendInteractiveButtons()` | `POST /send/buttons` |

#### 3.4.5 Sistema de Sincronização de Chats

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    SYNC DE CHATS - chats.controller:98-195                    │
└──────────────────────────────────────────────────────────────────────────────┘

GET /api/v1/chats/list?instanceId=xxx
      │
      ▼
┌───────────────────────────────────────────────────────────────┐
│                    ESTRATÉGIA DE SYNC                         │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  IF (total === 0 && instance.CONNECTED):                     │
│     → BLOCKING SYNC: Espera UAZapi, depois retorna           │
│                                                               │
│  ELSE IF (instance.CONNECTED):                                │
│     → BACKGROUND SYNC: Retorna imediato, sync async          │
│                                                               │
│  ELSE:                                                        │
│     → NO SYNC: Retorna apenas dados locais                   │
│                                                               │
└───────────────────────────────────────────────────────────────┘
      │
      │ SYNC FLOW:
      │ 1. uazapiService.findChats(token)
      │ 2. Para cada chat:
      │    └── Upsert Contact (name, profilePic, isBusiness)
      │    └── Upsert ChatSession (lastMessageAt)
      │ 3. Fallback para create se upsert falhar
      ▼
[Response] { chats: [...], pagination: {...} }
```

#### 3.4.6 Sistema de Sessões e IA

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    GERENCIAMENTO DE IA                                        │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    BLOQUEIO DE IA                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TRIGGER AUTOMÁTICO:                                        │
│  - Quando agente humano responde (author=AGENT, OUTBOUND)   │
│  - sessionsManager.blockAI(sessionId, 60, 'agent_response') │
│                                                             │
│  TRIGGER MANUAL:                                            │
│  - POST /sessions/:id/block-ai                              │
│  - { durationMinutes: 1-1440, reason: 'manual_response' }   │
│                                                             │
│  CAMPOS NO DB:                                              │
│  - aiEnabled: boolean                                       │
│  - aiBlockedUntil: DateTime?                                │
│  - aiBlockReason: string?                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    STATUS DE SESSÃO                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  QUEUED  → Aguardando atendimento                          │
│  ACTIVE  → Em atendimento                                  │
│  PAUSED  → Pausado (após envio com pauseSession=true)      │
│  CLOSED  → Encerrado (não aceita novas mensagens)          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 3.4.7 Sistema de SSE (Server-Sent Events)

| Evento | Trigger | Payload |
|--------|---------|---------|
| `contact.labels.changed` | PUT /sessions/contacts/:id/labels | { contactId, action, labelIds } |
| `session.labels.changed` | PUT /sessions/:id/labels | { sessionId, action, labelIds } |
| `contact.updated` | PATCH /sessions/contacts/:id/lead | { contactId, field, oldValue, newValue } |
| `session.updated` | PATCH /sessions/:id/lead | { sessionId, field, oldValue, newValue } |

#### 3.4.8 Análise de Segurança

| Verificação | Status | Observação |
|-------------|--------|------------|
| authProcedure em todos endpoints | ✅ | Todos endpoints protegidos |
| Validação de organizationId | ✅ | `session.organizationId !== user.currentOrgId` |
| Fallback para admin | ✅ | `user.role !== 'admin'` permite bypass |
| Validação de status da sessão | ✅ | Não permite enviar para CLOSED |
| Validação de conexão ativa | ✅ | Verifica `status === CONNECTED` |
| Rate limiting | ❌ | Não implementado |
| Validação de phone number | ✅ | Validação E.164 em `phoneOrChatIdSchema` (2025-12-21) |

#### 3.4.9 Oportunidades de Melhoria - Conversas

##### Backend

| # | Melhoria | Arquivo | Prioridade | Esforço | Status |
|---|----------|---------|------------|---------|--------|
| 1 | ~~Unificar fetch direto com uazapiService~~ | `chats.controller.ts` | ~~🔴 Alto~~ | ~~2h~~ | ✅ FEITO 2025-12-21 |
| ~~2~~ | ~~Cache de chats/sessoes (Redis)~~ | `chats.controller.ts` | ~~🟡 Médio~~ | ~~4h~~ | ✅ FEITO 2025-12-22 |
| 3 | Websocket para mensagens em tempo real | - | 🟡 Médio | 8h | ⏳ Pendente |
| 4 | ~~Validação E.164 para phoneNumber~~ | `messages.schemas.ts` | ~~🟢 Baixo~~ | ~~1h~~ | ✅ FEITO 2025-12-21 |
| 5 | ~~Rate limiting por sessão~~ | `messages.controller.ts` | ~~🟡 Médio~~ | ~~3h~~ | ✅ FEITO 2025-12-22 |
| ~~6~~ | ~~Retry para falhas de envio UAZapi~~ | `messages.controller.ts` | ~~🟢 Baixo~~ | ~~2h~~ | ✅ FEITO 2025-12-22 |
| ~~7~~ | ~~Bulk actions para multiplas sessoes~~ | `sessions.controller.ts` | ~~🟢 Baixo~~ | ~~4h~~ | ✅ FEITO 2025-12-22 |
| 8 | Paginação eficiente (cursor-based) | `sessions.controller.ts:1159` | 🟢 Baixo | 3h | ⏳ Pendente |

##### Frontend

| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | Infinite scroll para lista de conversas | 🟡 Médio | 3h |
| 2 | Optimistic updates para envio de mensagens | 🟡 Médio | 2h |
| 3 | Indicador de digitação em tempo real | 🟢 Baixo | 2h |
| 4 | Suporte a arrastar e soltar mídia | 🟢 Baixo | 2h |
| 5 | Preview de links/vídeos | 🟢 Baixo | 3h |
| 6 | Atalhos de teclado (Ctrl+Enter, etc) | 🟢 Baixo | 1h |
| 7 | Sound notification para novas mensagens | 🟢 Baixo | 1h |
| 8 | Modo offline com sync posterior | 🟡 Médio | 6h |

#### 3.4.10 Inconsistências Identificadas

| # | Inconsistência | Arquivo | Linha | Severidade | Status |
|---|----------------|---------|-------|------------|--------|
| 1 | ~~Fetch direto vs uazapiService~~ | `chats.controller.ts` | ~~330, 369, 409, 456~~ | ~~🟡 Médio~~ | ✅ CORRIGIDO 2025-12-21 |
| 2 | ~~UAZAPI_BASE_URL vs UAZAPI_URL~~ | `chats.controller.ts:14` | - | ~~🟢 Baixo~~ | ✅ CORRIGIDO 2025-12-21 |
| 3 | Cache TTL inconsistente (30s sessions vs 5s instances) | Múltiplos | - | 🟢 Baixo | ⏳ Pendente |
| 4 | ~~Falta validação de phoneNumber format~~ | `messages.schemas.ts` | - | ~~🟡 Médio~~ | ✅ CORRIGIDO 2025-12-21 |

**Status Geral**: ✅ Funcional - 3/4 inconsistências corrigidas

**Correções aplicadas em 2025-12-21**:
- Novos métodos em `uazapiService`: `markAsRead`, `archiveChat`, `deleteChat`, `blockContact`
- `chats.controller.ts` refatorado para usar service ao invés de fetch direto
- Removida variável `UAZAPI_BASE_URL` duplicada (service já tem baseURL)
- Adicionado schema `phoneOrChatIdSchema` com validação E.164 em `messages.schemas.ts`

---

### 3.4.11 Fluxo Completo de Webhooks (Análise Brutal)

> **Análise realizada em 2025-12-21**
> **Status**: ✅ Pipeline validado end-to-end

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    ARQUITETURA DE WEBHOOKS                                    │
└──────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  [UAZapi/CloudAPI]                                                          │
│        │                                                                    │
│        │ POST /api/v1/webhooks/:provider                                   │
│        ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    WEBHOOK ROUTER                                    │   │
│  │                    route.ts (432 linhas)                             │   │
│  │  ┌─────────────────────────────────────────────────────────────┐    │   │
│  │  │ 1. orchestrator.normalizeWebhook(provider, rawBody)         │    │   │
│  │  │ 2. Switch por event type                                    │    │   │
│  │  │    ├── message.received → processIncomingMessage()          │    │   │
│  │  │    ├── message.sent → processOutgoingMessage()              │    │   │
│  │  │    ├── message.updated → updateMessageStatus()              │    │   │
│  │  │    ├── instance.connected → updateInstanceStatus()          │    │   │
│  │  │    ├── instance.disconnected → updateInstanceStatus()       │    │   │
│  │  │    └── instance.qr → updateInstanceQRCode()                 │    │   │
│  │  └─────────────────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    MESSAGE PROCESSOR                                 │   │
│  │                                                                      │   │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │   │
│  │  │   TEXTO     │    │   MÍDIA     │    │  SESSÕES    │             │   │
│  │  │             │    │             │    │             │             │   │
│  │  │ Concatenador│    │ Transcrição │    │ Manager     │             │   │
│  │  │ (8s buffer) │    │ (BullMQ)    │    │             │             │   │
│  │  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘             │   │
│  │         │                  │                  │                     │   │
│  │         ▼                  ▼                  ▼                     │   │
│  │  ┌─────────────────────────────────────────────────────────┐       │   │
│  │  │              DATABASE + REDIS EVENTS                     │       │   │
│  │  └─────────────────────────────────────────────────────────┘       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│        │                                                                    │
│        ▼                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    WEBHOOKS SERVICE (Outbound)                       │   │
│  │                    webhooks.service.ts                               │   │
│  │                                                                      │   │
│  │  ├── Dispara para URLs configuradas da organização                 │   │
│  │  ├── Suporte a HMAC signature                                       │   │
│  │  └── Callback response (N8N, estruturado)                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 3.4.11.1 Fluxo de Mensagem de Texto (Concatenação)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    FLUXO DE CONCATENAÇÃO DE MENSAGENS                         │
└──────────────────────────────────────────────────────────────────────────────┘

[Webhook] message.received (type=text)
      │
      │ 1. Buscar/Criar contato
      │ 2. Buscar foto de perfil (se novo)
      │ 3. getOrCreateSession()
      ▼
┌─────────────────────────────────────────────────────────────────┐
│              MESSAGE CONCATENATOR                                │
│              message-concatenator.ts                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Redis Key: concat:{sessionId}:{contactId}                      │
│  TTL: 8 segundos (configurável via MESSAGE_CONCAT_TIMEOUT)      │
│                                                                  │
│  PRIMEIRA MENSAGEM:                                             │
│  ├── Salvar mensagem no Redis                                   │
│  ├── Iniciar timer de 8s (setTimeout)                           │
│  └── Retornar 'processing'                                      │
│                                                                  │
│  MENSAGENS SUBSEQUENTES (dentro de 8s):                         │
│  ├── Append à lista no Redis                                    │
│  ├── Resetar TTL para 8s                                        │
│  └── Retornar 'queued'                                          │
│                                                                  │
│  APÓS TIMEOUT (8s sem novas mensagens):                         │
│  ├── processConcatenatedMessages()                              │
│  │   ├── Concatenar textos com \n                               │
│  │   ├── Criar mensagem consolidada (isConcatenated=true)       │
│  │   ├── Salvar mensagens originais (histórico)                 │
│  │   └── Enfileirar mídias para transcrição                     │
│  ├── Sincronizar com Chatwoot                                   │
│  ├── Verificar bloqueio de IA (isAIBlocked)                     │
│  └── Publicar Redis: 'message:ready_for_ai'                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
      │
      ▼
[DB] message (isConcatenated=true, concatGroupId=xxx)
```

**Exemplo de Concatenação:**
```
Usuário envia 3 mensagens em 5 segundos:
- "Olá"           → t=0s   → Inicia timer
- "tudo bem?"     → t=2s   → Append, reset timer
- "preciso de ajuda" → t=4s → Append, reset timer
- (timeout)       → t=12s  → Processa

Resultado: Uma mensagem com:
"Olá
tudo bem?
preciso de ajuda"
```

#### 3.4.11.2 Fluxo de Mídia (Transcrição)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    FLUXO DE TRANSCRIÇÃO DE MÍDIA                              │
└──────────────────────────────────────────────────────────────────────────────┘

[Webhook] message.received (type=audio/voice/video/image/document)
      │
      │ 1. Salvar mensagem no DB (transcriptionStatus='pending')
      ▼
┌─────────────────────────────────────────────────────────────────┐
│              TRANSCRIPTION QUEUE (BullMQ)                        │
│              transcription.worker.ts                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Queue: 'transcription'                                          │
│  Concurrency: 5 jobs simultâneos                                 │
│  Rate Limit: 10 jobs/minuto (limites OpenAI)                     │
│  Retries: 3 (exponential backoff: 5s, 10s, 20s)                 │
│                                                                  │
│  Job Data: {                                                     │
│    messageId, instanceId, mediaType, mediaUrl, mimeType          │
│  }                                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│              TRANSCRIPTION ENGINE                                │
│              transcription.engine.ts                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┬─────────────────────────────────────────┐ │
│  │ Tipo de Mídia    │ Processamento                           │ │
│  ├──────────────────┼─────────────────────────────────────────┤ │
│  │ audio, voice     │ OpenAI Whisper (whisper-1)              │ │
│  │                  │ ├── Download do arquivo                 │ │
│  │                  │ ├── Enviar para Whisper API             │ │
│  │                  │ ├── Retorna: text, language, duration   │ │
│  │                  │ └── Cleanup arquivo temp                │ │
│  ├──────────────────┼─────────────────────────────────────────┤ │
│  │ video            │ FFmpeg + Whisper                        │ │
│  │                  │ ├── Download vídeo                      │ │
│  │                  │ ├── Extrair áudio (ffmpeg)              │ │
│  │                  │ ├── Transcrever com Whisper             │ │
│  │                  │ └── Cleanup ambos arquivos              │ │
│  ├──────────────────┼─────────────────────────────────────────┤ │
│  │ image            │ GPT-4o Vision                           │ │
│  │                  │ ├── Enviar URL para GPT-4o              │ │
│  │                  │ ├── Prompt: "Descreva a imagem..."      │ │
│  │                  │ └── Retorna descrição em PT-BR          │ │
│  ├──────────────────┼─────────────────────────────────────────┤ │
│  │ document         │ Parser específico                       │ │
│  │                  │ ├── PDF: pdf-parse (TODO)               │ │
│  │                  │ ├── DOCX: mammoth (TODO)                │ │
│  │                  │ ├── TXT: fs.readFile                    │ │
│  │                  │ └── Outros: OCR fallback (TODO)         │ │
│  └──────────────────┴─────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
      │
      │ Sucesso:
      │ ├── Update message (transcription, transcriptionStatus='completed')
      │ └── Redis publish: 'transcription:completed'
      │
      │ Falha:
      │ ├── Update message (transcriptionStatus='failed', transcriptionError)
      │ └── BullMQ retry (até 3x)
      ▼
[DB] message.transcription = "Texto transcrito/descrito"
```

#### 3.4.11.3 Tipos de Eventos de Webhook

| Evento | Fonte | Processamento | Resultado |
|--------|-------|---------------|-----------|
| `message.received` | UAZapi/CloudAPI | Concatenação ou Transcrição | Nova mensagem no DB |
| `message.sent` | UAZapi | updateMessageStatus | status='sent', sentAt |
| `message.updated` | UAZapi | updateMessageStatus | status (delivered/read) |
| `instance.connected` | UAZapi | updateInstanceStatus | ConnectionStatus.CONNECTED |
| `instance.disconnected` | UAZapi | updateInstanceStatus | ConnectionStatus.DISCONNECTED |
| `instance.qr` | UAZapi | updateInstanceQRCode | QR Code salvo + Redis pub |
| `chat.created` | UAZapi | Log only | - |
| `contact.updated` | UAZapi | Log only | - |

#### 3.4.11.4 Normalização de Webhook (UAZapi → Quayer)

```typescript
// Raw UAZapi Webhook
{
  event: "messages.upsert",
  instanceId: "abc123",
  data: {
    from: "5511999999999@s.whatsapp.net",
    message: {
      id: "AAAABBBBCCCC",
      type: "audio",
      mediaUrl: "https://...",
      seconds: 15,
      mimetype: "audio/ogg; codecs=opus"
    }
  }
}

// Normalized Quayer Webhook
{
  event: "message.received",
  instanceId: "abc123",
  timestamp: Date,
  data: {
    from: "5511999999999",
    message: {
      id: "AAAABBBBCCCC",
      type: "audio",
      content: "",
      media: {
        type: "audio",
        mediaUrl: "https://...",
        mimeType: "audio/ogg; codecs=opus",
        duration: 15
      }
    }
  }
}
```

#### 3.4.11.5 Sistema de Webhook Outbound (Para Clientes)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    WEBHOOK DISPATCHER                                         │
│                    webhooks.service.ts                                        │
└──────────────────────────────────────────────────────────────────────────────┘

[Evento no Sistema]
      │
      │ webhooksService.trigger(organizationId, event, data)
      ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Buscar webhooks ativos para o evento                        │
│  2. Para cada webhook:                                          │
│     ├── Verificar filtros (excludeMessages, addUrlTypesMessages)│
│     ├── Construir URL dinâmica ({placeholder} replacement)     │
│     ├── Criar registro de delivery                              │
│     ├── Enviar POST com:                                        │
│     │   ├── Headers: Content-Type, User-Agent, X-Webhook-Event │
│     │   ├── X-Webhook-Signature (HMAC SHA256 se secret config) │
│     │   └── Body: { event, data, timestamp, webhookId }        │
│     └── Processar resposta de callback                          │
└─────────────────────────────────────────────────────────────────┘
      │
      │ Se response.body é JSON válido:
      ▼
┌─────────────────────────────────────────────────────────────────┐
│              CALLBACK RESPONSE PARSER                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Formato N8N (array):                                           │
│  [{ type: "text", content: { text: "Resposta", delay: 1000 } }] │
│                                                                  │
│  Formato Estruturado (objeto):                                   │
│  { messages: [...], actions: [{ type: "close_session" }] }      │
│                                                                  │
│  ⚠️ TODO: Implementar message-sender para processar callbacks   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.4.11.6 Redis Events (Tempo Real)

| Canal Redis | Trigger | Payload |
|-------------|---------|---------|
| `instance:status` | Status change | `{ instanceId, status, timestamp }` |
| `instance:qr` | QR Code gerado | `{ instanceId, qrCode, timestamp }` |
| `session:created` | Nova sessão | `{ sessionId, contactId, connectionId, orgId }` |
| `session:ai_blocked` | IA bloqueada | `{ sessionId, blockedUntil, reason, duration }` |
| `session:ai_unblocked` | IA desbloqueada | `{ sessionId }` |
| `transcription:completed` | Transcrição ok | `{ messageId, text, language, confidence }` |
| `message:ready_for_ai` | Pronta para IA | `{ messageId, sessionId, content }` |

#### 3.4.11.7 Análise de Segurança - Webhooks

| Verificação | Status | Observação |
|-------------|--------|------------|
| Validação de provider | ✅ | Apenas providers conhecidos |
| CloudAPI verification | ✅ | GET hub.verify_token challenge |
| HMAC signature outbound | ✅ | X-Webhook-Signature com secret |
| Rate limiting | ❌ | Não implementado no inbound |
| IP whitelist | ❌ | Não implementado |
| Timeout de conexão | ✅ | 30s default, configurável |
| Retry com backoff | ✅ | 3 tentativas, exponential |

#### 3.4.11.8 Oportunidades de Melhoria - Webhooks

##### Backend

| # | Melhoria | Arquivo | Prioridade | Status |
|---|----------|---------|------------|--------|
| ~~1~~ | ~~Rate limiting inbound por IP~~ | `route.ts` | ~~🟡 Médio~~ | ✅ FEITO 2025-12-21 |
| ~~2~~ | ~~IP whitelist para UAZapi~~ | `route.ts` | ~~🟡 Médio~~ | ✅ FEITO 2025-12-21 |
| ~~3~~ | ~~Dead letter queue para falhas~~ | `transcription.worker.ts` | ~~🟢 Baixo~~ | ✅ FEITO 2025-12-22 |
| 4 | Implementar PDF/DOCX parser | `transcription.engine.ts` | 🟡 Médio | ⏳ Pendente |
| 5 | Implementar message-sender callback | `webhooks.service.ts` | 🟡 Médio | ⏳ Pendente |
| 6 | Batch processing para transcrições | `transcription.worker.ts` | 🟢 Baixo | ⏳ Pendente |
| 7 | Métricas de tempo de processamento | Todos | 🟢 Baixo | ⏳ Pendente |
| ~~8~~ | ~~Signature verification inbound~~ | `route.ts` | ~~🟡 Médio~~ | ✅ FEITO 2025-12-21 |

> **Nota 2025-12-21**: Segurança de webhooks implementada:
> - Rate limiting: 1000 req/min por IP (usa Redis)
> - IP whitelist: Configurável via `UAZAPI_ALLOWED_IPS` (suporta wildcards)
> - Signature verification: HMAC-SHA256 via `WEBHOOK_SIGNATURE_SECRET`
> - Security mode: `WEBHOOK_SECURITY_MODE=strict|permissive`

##### Transcrição

| # | Status | Feature |
|---|--------|---------|
| ✅ | Implementado | Audio/Voice → Whisper |
| ✅ | Implementado | Video → FFmpeg + Whisper |
| ✅ | Implementado | Image → GPT-4o Vision |
| ⚠️ | TODO | PDF → pdf-parse |
| ⚠️ | TODO | DOCX → mammoth |
| ⚠️ | TODO | OCR → tesseract.js |

#### 3.4.11.9 Fluxo Completo (Exemplo: Áudio)

```
1. [UAZapi] Recebe mensagem de voz do WhatsApp
      ▼
2. [UAZapi] POST /api/v1/webhooks/uazapi
   Body: { event: "messages.upsert", data: { message: { type: "audio", mediaUrl: "..." } } }
      ▼
3. [route.ts] orchestrator.normalizeWebhook('uazapi', rawBody)
   Resultado: { event: "message.received", data: { message: { type: "audio", media: {...} } } }
      ▼
4. [route.ts] processIncomingMessage(normalized, 'uazapi')
      ▼
5. [route.ts] database.contact.findUnique() ou create()
      ▼
6. [route.ts] orchestrator.getProfilePicture() (se novo contato)
      ▼
7. [route.ts] sessionsManager.getOrCreateSession()
      ▼
8. [route.ts] database.message.create({ transcriptionStatus: 'pending' })
      ▼
9. [route.ts] transcriptionQueue.add('transcribe-media', {...})
      ▼
10. [transcription.worker.ts] Job processado (pode levar 5-30s)
      ▼
11. [transcription.engine.ts] transcribeAudio(mediaUrl)
    ├── Download arquivo para /tmp
    ├── OpenAI Whisper: whisper-1, language: 'pt'
    └── Cleanup arquivo temp
      ▼
12. [transcription.worker.ts] database.message.update({ transcription: "texto", status: 'completed' })
      ▼
13. [transcription.worker.ts] redis.publish('transcription:completed', {...})
      ▼
14. [Frontend via WebSocket/SSE] Recebe evento e atualiza UI

Tempo total estimado: 5-30 segundos (dependendo do tamanho do áudio)
```

#### 3.4.11.10 🔴 CORREÇÃO CRÍTICA: Ordem Transcrição vs Concatenação

> **Análise realizada em 2025-12-21**
> **Status**: ⚠️ Problema identificado - Requer refatoração

##### Problema Atual

O fluxo atual processa mensagens na seguinte ordem:
```
Webhook → Concatenação (8s) → Salvar no DB → Enfileirar Transcrição
```

**Isso é problemático porque:**
1. Mensagens de **texto** são concatenadas imediatamente
2. Mensagens de **áudio/vídeo** são salvas individualmente e enviadas para transcrição
3. A transcrição acontece **DEPOIS** da concatenação
4. O texto transcrito **NÃO** é incluído na mensagem concatenada

##### Cenário Problemático

```
Usuário envia em sequência rápida (< 8s):
  1. [texto] "Olá"
  2. [audio] "Preciso de ajuda com meu pedido" (20s de áudio)
  3. [texto] "É urgente"

Resultado ATUAL:
  - Mensagem concatenada: "Olá\nÉ urgente" ❌ (perde contexto do áudio)
  - Transcrição do áudio: "Preciso de ajuda com meu pedido" (processada depois, separada)

Resultado IDEAL:
  - Mensagem concatenada: "Olá\n[Transcrição: Preciso de ajuda com meu pedido]\nÉ urgente" ✅
```

##### Solução Proposta

**Opção A: Transcrição Síncrona (Recomendada)**
```
Webhook → Identificar tipo
       ├─ texto → Buffer de concatenação
       └─ mídia → Transcrever AGORA → Buffer de concatenação
              ↓
       Timeout 8s → Concatenar TODOS (textos + transcrições)
```

**Prós:** Mensagem final completa, melhor contexto para IA
**Contras:** Aumenta latência (5-30s por áudio)

**Opção B: Concatenação com Placeholder**
```
Webhook → Buffer com placeholder "[Transcrevendo áudio...]"
       ↓
Timeout 8s → Concatenar com placeholders
       ↓
Transcrição completa → Atualizar mensagem concatenada
```

**Prós:** Latência baixa, mensagem atualizada depois
**Contras:** Complexidade maior, mensagem muda depois de salva

**Opção C: Aguardar Transcrições Pendentes**
```
Webhook → Buffer de concatenação
       ↓
Timeout 8s → Verificar se há mídias pendentes
       ├─ Sim → Aguardar transcrições (máx 60s)
       └─ Não → Concatenar imediatamente
```

**Prós:** Equilibra latência e completude
**Contras:** Timeout configurável, pode atrasar resposta

##### Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| [message-concatenator.ts](src/lib/concatenation/message-concatenator.ts) | Integrar com transcriptionEngine |
| [transcription.worker.ts](src/lib/transcription/transcription.worker.ts) | Suportar modo síncrono |
| [route.ts](src/app/api/v1/webhooks/[provider]/route.ts) | Ajustar fluxo de processamento |

##### Prioridade

| Impacto | Complexidade | Prioridade |
|---------|--------------|------------|
| 🔴 Alto (contexto perdido para IA) | 🟡 Médio (refatoração moderada) | **P1 - Próximo Sprint** |

---

#### 3.4.11.11 Novas Funcionalidades Propostas

##### A) Página Admin: Gerenciamento Global de Sessões

**Rota**: `/admin/sessions`
**Acesso**: Apenas usuários com `role === 'admin'`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    ADMIN - GERENCIAMENTO DE SESSÕES                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Filtros: [Organização ▼] [Instância ▼] [Status ▼] [Período ▼] [🔍 Buscar]  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  📊 Estatísticas Globais                                                     │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐                  │
│  │ Total: 1234 │ Abertas: 89 │ Pausadas: 45│ Fechadas: 1100                 │
│  └─────────────┴─────────────┴─────────────┴─────────────┘                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  # │ Org          │ Instância    │ Contato        │ Status │ IA    │ Ações  │
│ ───┼──────────────┼──────────────┼────────────────┼────────┼───────┼────────│
│  1 │ Empresa ABC  │ WhatsApp 1   │ +55 11 9999... │ 🟢 open │ ✅    │ [⋮]   │
│  2 │ Startup XYZ  │ WhatsApp 2   │ +55 21 8888... │ 🟡 paused│ 🚫   │ [⋮]   │
│  3 │ Empresa ABC  │ WhatsApp 3   │ +55 31 7777... │ 🔴 closed│ -    │ [⋮]   │
│                                                                              │
│  [⋮] Menu de Ações:                                                         │
│      ├── 🔄 Mudar Status (open/paused/closed)                               │
│      ├── 🤖 Bloquear/Desbloquear IA                                         │
│      ├── ⚙️ Editar Configurações                                            │
│      │    ├── Tempo de concatenação                                         │
│      │    ├── Transcrição habilitada                                        │
│      │    └── Webhook customizado                                           │
│      ├── 📋 Ver Histórico                                                   │
│      └── 🗑️ Encerrar Sessão                                                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Visualizar TODAS sessões de TODAS organizações
- Filtrar por organização, instância, status, período
- Mudar status de qualquer sessão (open → paused → closed)
- Bloquear/desbloquear IA por sessão
- Editar configurações de concatenação/transcrição por sessão
- Ver histórico completo de mensagens
- Encerrar sessões manualmente

---

##### B) Página Master: Gerenciamento de Sessões da Organização

**Rota**: `/integracoes/sessions`
**Acesso**: Usuários com `orgRole === 'master'` ou `orgRole === 'manager'`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    SESSÕES DA MINHA ORGANIZAÇÃO                              │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Filtros: [Instância ▼] [Status ▼] [Período ▼] [🔍 Buscar contato]          │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  📊 Estatísticas                                                             │
│  ┌─────────────┬─────────────┬─────────────┬─────────────┐                  │
│  │ Total: 234  │ Abertas: 12 │ Pausadas: 5 │ Fechadas: 217│                 │
│  └─────────────┴─────────────┴─────────────┴─────────────┘                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  Instância: WhatsApp 1 (+55 11 99999-9999)                                   │
│ ───────────────────────────────────────────────────────────────────────────  │
│  │ Contato        │ Última msg   │ Status │ IA Bloqueada │ Ações           │
│  ├────────────────┼──────────────┼────────┼──────────────┼─────────────────│
│  │ João Silva     │ há 5 min     │ 🟢 open │ ❌           │ [Ver] [Pausar] │
│  │ Maria Santos   │ há 1 hora    │ 🟡 paused│ ✅ (30min)  │ [Ver] [Abrir]  │
│  │ Pedro Oliveira │ há 2 dias    │ 🔴 closed│ -           │ [Ver] [Reabrir]│
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Visualizar sessões apenas da SUA organização
- Filtrar por instância, status, período
- Mudar status de sessões (open ↔ paused ↔ closed)
- Bloquear IA temporariamente (30min, 1h, 4h, permanente)
- Ver histórico de mensagens
- Transferir sessão entre instâncias (se múltiplas)

---

##### C) Configuração de Webhook por Organização

**Rota**: `/ferramentas/webhooks/config`
**Acesso**: Usuários com `orgRole === 'master'`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    CONFIGURAÇÃO DE WEBHOOKS                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  📌 Configuração Global (Quayer Default)                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Timeout de concatenação: 8 segundos                                    │ │
│  │ Transcrição automática: ✅ Habilitada                                  │ │
│  │ Idioma de transcrição: Português (pt)                                  │ │
│  │ Eventos habilitados: message.received, message.sent, instance.*        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ⚙️ Configuração da Minha Organização                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ □ Usar configuração global (recomendado)                               │ │
│  │                                                                        │ │
│  │ ☑ Customizar para minha organização:                                   │ │
│  │                                                                        │ │
│  │ Timeout de concatenação: [5-15s] [▼ 10 segundos]                       │ │
│  │                                                                        │ │
│  │ Transcrição automática: [✅ Habilitada]                                │ │
│  │   └─ Idioma: [Português (pt) ▼]                                        │ │
│  │   └─ Tipos: [✅ Audio] [✅ Vídeo] [✅ Imagem] [□ Documento]             │ │
│  │                                                                        │ │
│  │ Webhook de saída:                                                      │ │
│  │   URL: [https://minha-api.com/webhook________________]                 │ │
│  │   Secret: [**********] [Regenerar]                                     │ │
│  │   Eventos: [✅ message.received] [✅ message.sent]                     │ │
│  │            [□ session.created] [□ session.closed]                      │ │
│  │   Retry: [3 tentativas] [Exponential backoff]                          │ │
│  │                                                                        │ │
│  │ [💾 Salvar Configuração]  [🔄 Restaurar Padrão]                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Ver configuração padrão da Quayer
- Customizar timeout de concatenação (5-15s)
- Habilitar/desabilitar transcrição por tipo de mídia
- Configurar webhook de saída próprio
- Selecionar eventos que disparam webhook
- Configurar retry e backoff
- Restaurar configuração padrão

---

#### 3.4.11.12 Comparação de Schema: Quayer vs Proposta

> **Análise realizada em 2025-12-21**

##### Schema Atual (Quayer - Prisma)

```prisma
model ChatSession {
  id              String           @id @default(cuid())
  organizationId  String
  contactId       String
  connectionId    String
  status          SessionStatus    @default(OPEN)
  channel         String           @default("whatsapp")

  // AI Control
  aiBlocked       Boolean          @default(false)
  aiBlockedAt     DateTime?
  aiBlockedUntil  DateTime?
  aiBlockedReason String?

  // Metadata
  metadata        Json?
  lastMessageAt   DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  closedAt        DateTime?

  // Relations
  organization    Organization     @relation(...)
  contact         Contact          @relation(...)
  connection      Instance         @relation(...)
  messages        Message[]
}

model Message {
  id                      String          @id @default(cuid())
  sessionId               String
  contactId               String
  connectionId            String

  // WhatsApp IDs
  waMessageId             String          @unique
  waQuotedMessageId       String?

  // Content
  direction               MessageDirection
  type                    MessageType
  content                 String

  // Media
  mediaUrl                String?
  mediaType               String?
  mimeType                String?
  fileName                String?

  // Status
  status                  MessageStatus
  errorMessage            String?
  sentAt                  DateTime?
  deliveredAt             DateTime?
  readAt                  DateTime?

  // Concatenation
  isConcatenated          Boolean         @default(false)
  concatGroupId           String?

  // Transcription
  transcription           String?
  transcriptionLanguage   String?
  transcriptionConfidence Float?
  transcriptionStatus     TranscriptionStatus?
  transcriptionError      String?
  transcriptionProcessedAt DateTime?

  // AI Processing
  aiProcessed             Boolean         @default(false)
  aiResponse              String?
  aiProcessedAt           DateTime?

  // Timestamps
  createdAt               DateTime        @default(now())
  updatedAt               DateTime        @updatedAt
}
```

##### Schema Proposto (Comparação)

| Campo | Quayer | Proposta | Observação |
|-------|--------|----------|------------|
| **ChatSession** |
| `chatwoot_conversation_id` | ❌ | ✅ | Integração Chatwoot |
| `chatwoot_inbox_id` | ❌ | ✅ | Integração Chatwoot |
| `whatsapp_window_expires` | ❌ | ✅ | Janela 24h WhatsApp |
| `whatsapp_window_type` | ❌ | ✅ | Tipo de janela |
| **Message** |
| `chatwoot_message_id` | ❌ | ✅ | ID da msg no Chatwoot |
| `is_within_window` | ❌ | ✅ | Dentro da janela 24h |
| **Stored Procedures** |
| `close_expired_sessions()` | ❌ | ✅ | Cron job no DB |

##### Campos Quayer que a Proposta NÃO Tem

| Campo | Descrição | Importância |
|-------|-----------|-------------|
| `transcriptionLanguage` | Idioma detectado pela Whisper | 🟡 Útil para analytics |
| `transcriptionConfidence` | Confiança da transcrição (0-1) | 🟢 Nice-to-have |
| `transcriptionError` | Mensagem de erro se falhou | 🟡 Debug |
| `aiProcessed` / `aiResponse` | Tracking de processamento IA | 🔴 Essencial para IA |
| `concatGroupId` | Agrupa mensagens concatenadas | 🟡 Debug/histórico |

##### Recomendações

1. **✅ Adicionar ao Quayer**:
   - `chatwoot_conversation_id` (se Chatwoot for prioridade)
   - `whatsapp_window_expires` + `whatsapp_window_type` (compliance WhatsApp)
   - `close_expired_sessions()` stored procedure ou BullMQ cron

2. **✅ Manter no Quayer**:
   - Campos de transcrição (language, confidence, error)
   - Campos de IA (aiProcessed, aiResponse, aiProcessedAt)
   - Campos de concatenação (isConcatenated, concatGroupId)

3. **🟡 Avaliar**:
   - Stored procedures vs BullMQ jobs (trade-off: performance vs observabilidade)

##### Stored Procedure vs BullMQ Job

| Aspecto | Stored Procedure | BullMQ Job |
|---------|-----------------|------------|
| Performance | ⚡ Mais rápido (no DB) | 🐢 Mais lento (rede) |
| Observabilidade | ❌ Difícil monitorar | ✅ Dashboard, logs |
| Escalabilidade | ❌ Limita DB | ✅ Workers separados |
| Manutenção | ❌ SQL separado | ✅ TypeScript unificado |
| **Recomendação** | - | ✅ BullMQ para Quayer |

**Implementação Recomendada (BullMQ)**:
```typescript
// src/lib/sessions/session-cleanup.worker.ts
export const sessionCleanupWorker = new Worker('session-cleanup', async (job) => {
  // Fechar sessões inativas há mais de 24h
  await database.chatSession.updateMany({
    where: {
      status: 'OPEN',
      lastMessageAt: { lt: subHours(new Date(), 24) }
    },
    data: {
      status: 'CLOSED',
      closedAt: new Date()
    }
  });
}, {
  connection: redis,
  // Executar a cada hora
});

// Agendar job recorrente
await sessionCleanupQueue.add('cleanup', {}, {
  repeat: { pattern: '0 * * * *' } // A cada hora
});
```

---

#### 3.4.11.13 Análise do Fluxo N8N vs Quayer

> **Análise realizada em 2025-12-21**
> **Objetivo**: Comparar fluxo manual N8N com arquitetura Quayer e identificar melhorias

##### Estrutura do Fluxo N8N (v3.6)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           FLUXO N8N - VISÃO GERAL                             │
└──────────────────────────────────────────────────────────────────────────────┘

[Webhook WhatsApp/Chatwoot]
        │
        ▼
┌─────────────────────────────────────────────────────┐
│ "Extrair Dados" (Normalizer Universal)              │
│ ─────────────────────────────────────────────────── │
│ Detecta formato:                                    │
│  • OFICIAL (WhatsApp Cloud API) → entry.changes     │
│  • CHATWOOT → inbox + event                         │
│  • NAO_OFICIAL (uazapi/Quayer) → body.message       │
│                                                     │
│ Features:                                           │
│  ✅ Bot Echo Detection (Unicode Marker)            │
│  ✅ Outgoing System Message Filter                 │
│  ✅ Universal Phone Normalization                  │
│  ✅ Media Type Detection                           │
│  ✅ Interactive Message Handling                   │
└─────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│ "CTE Única" (Session Manager v2.1)                  │
│ ─────────────────────────────────────────────────── │
│ 1. Upsert Organization                              │
│ 2. Upsert Contact                                   │
│ 3. Session Management:                              │
│    • Comandos (@fechar, @pausar, @reabrir)          │
│    • Auto-pause on Human Reply                      │
│    • WhatsApp 24h Window Tracking                   │
│    • Blacklist/Whitelist per Contact                │
│ 4. Create Message                                   │
└─────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────┐
│ "If" (Routing)                                      │
│  ├─ continue_to_ai = true → AI Agent                │
│  └─ continue_to_ai = false → End / Clear Memory     │
└─────────────────────────────────────────────────────┘
```

##### Comparação Detalhada: N8N vs Quayer

| Feature | N8N Flow | Quayer Atual | Gap |
|---------|----------|--------------|-----|
| **Normalização de Webhook** |
| WhatsApp Cloud API | ✅ | ✅ (Cloud adapter) | ➖ |
| UAZapi/Não-oficial | ✅ | ✅ (UAZapi adapter) | ➖ |
| Chatwoot Webhooks | ✅ | ✅ (chatwootSyncService) | ➖ |
| **Deteccao de Loop** |
| Bot Echo (Unicode Marker) | ✅ `\u200B\u200C\u200D` | ✅ (provider.types.ts) | ✅ FEITO 2025-12-22 |
| Outgoing System Filter | ✅ sender.type='user' | ✅ (route.ts:343) | ✅ FEITO |
| **Janela 24h WhatsApp** |
| `last_customer_message_at` | ✅ | ✅ (schema.prisma) | ✅ FEITO 2025-12-22 |
| `whatsapp_window_expires_at` | ✅ | ✅ (sessions.manager.ts) | ✅ FEITO 2025-12-22 |
| `whatsapp_can_reply` | ✅ | ✅ (sessions.manager.ts) | ✅ FEITO 2025-12-22 |
| **Sistema de Comandos** |
| `@fechar` (fechar sessão) | ✅ | ✅ (command-parser.ts) | ✅ FEITO 2025-12-22 |
| `@pausar [horas]` | ✅ | ✅ (command-parser.ts) | ✅ FEITO |
| `@reabrir` | ✅ | ✅ (command-parser.ts) | ✅ FEITO 2025-12-22 |
| `@blacklist` / `@whitelist` | ✅ | ✅ (command-parser.ts) | ✅ FEITO 2025-12-22 |
| **Auto-Pause** |
| Human Reply Detection | ✅ dir=OUT + author=HUMAN | ✅ (sessions.manager.ts) | ✅ FEITO 2025-12-22 |
| Pause Duration Config | ✅ (session_timeout_hours) | ✅ (connection-settings) | ✅ FEITO 2025-12-22 |
| **Bypass Bots** |
| Per-contact bypass | ✅ contact.bypass_bots | ❌ | 🟡 Avaliar |
| **Concatenação** |
| Message Concatenation | ❌ | ✅ (8s buffer) | ➖ N8N não tem |
| **Transcrição** |
| Audio/Video Transcription | ❌ | ✅ (Whisper/GPT-4o) | ➖ N8N não tem |

##### Funcionalidades N8N que Quayer ~~DEVE~~ Implementou

###### 1. ✅ Bot Echo Detection (IMPLEMENTADO 2025-12-22)

**Problema**: ~~Sem deteccao, mensagens enviadas pelo bot podem ser reprocessadas causando loops infinitos.~~ **RESOLVIDO**

**Solução N8N**:
```javascript
const BOT_SIGNATURE = '\u200B\u200C\u200D'; // Zero-width chars
const isBotEcho = messageContent.startsWith(BOT_SIGNATURE);
if (isBotEcho) return { ignore: true, reason: 'bot_echo_marker' };
```

**Implementação Quayer**:
```typescript
// src/lib/providers/core/provider.types.ts
export const BOT_SIGNATURE = '\u200B\u200C\u200D';

// src/app/api/v1/webhooks/[provider]/route.ts
function isBotEcho(content: string): boolean {
  return content.startsWith(BOT_SIGNATURE);
}

// Ao enviar mensagens:
const messageWithSignature = BOT_SIGNATURE + messageContent;
await orchestrator.sendText(instanceId, brokerType, {
  to: phoneNumber,
  text: messageWithSignature, // Inclui marcador invisível
});

// Ao receber webhooks:
if (isBotEcho(normalized.data.message.content)) {
  console.log('[Webhook] Bot echo detected, ignoring');
  return NextResponse.json({ status: 'ignored', reason: 'bot_echo' });
}
```

**Arquivos a Modificar**:
| Arquivo | Mudança |
|---------|---------|
| [provider.types.ts](src/lib/providers/core/provider.types.ts) | Adicionar constante BOT_SIGNATURE |
| [route.ts](src/app/api/v1/webhooks/[provider]/route.ts) | Verificar bot echo antes de processar |
| [orchestrator.ts](src/lib/providers/core/orchestrator.ts) | Adicionar BOT_SIGNATURE ao enviar |

---

###### 2. ✅ WhatsApp 24h Window Tracking (IMPLEMENTADO 2025-12-22)

**Problema**: ~~WhatsApp Business API tem regra de janela 24h. Sem tracking, podemos tentar enviar mensagens quando a janela expirou.~~ **RESOLVIDO**

**Solução N8N**:
```javascript
const WHATSAPP_WINDOW_HOURS = 24;
const WHATSAPP_WINDOW_MS = WHATSAPP_WINDOW_HOURS * 60 * 60 * 1000;

if (isCustomerMessage) {
  lastCustomerMessageAt = new Date().toISOString();
  whatsappWindowExpiresAt = new Date(Date.now() + WHATSAPP_WINDOW_MS).toISOString();
  whatsappCanReply = true;
}
```

**Implementação Quayer (Prisma Schema)**:
```prisma
model ChatSession {
  // ... campos existentes ...

  // WhatsApp 24h Window
  lastCustomerMessageAt     DateTime?
  whatsappWindowExpiresAt   DateTime?
  whatsappWindowType        String?   @default("CUSTOMER_INITIATED") // CUSTOMER_INITIATED, BUSINESS_INITIATED

  @@index([whatsappWindowExpiresAt])
}
```

**Implementação Quayer (Sessions Manager)**:
```typescript
// src/lib/sessions/sessions.manager.ts

const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

async updateWhatsAppWindow(sessionId: string, isCustomerMessage: boolean) {
  if (!isCustomerMessage) return;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + WHATSAPP_WINDOW_MS);

  await database.chatSession.update({
    where: { id: sessionId },
    data: {
      lastCustomerMessageAt: now,
      whatsappWindowExpiresAt: expiresAt,
      whatsappWindowType: 'CUSTOMER_INITIATED',
    },
  });
}

async canReplyToSession(sessionId: string): Promise<boolean> {
  const session = await database.chatSession.findUnique({
    where: { id: sessionId },
    select: { whatsappWindowExpiresAt: true },
  });

  if (!session?.whatsappWindowExpiresAt) return false;
  return new Date() < session.whatsappWindowExpiresAt;
}
```

---

###### 3. ✅ Auto-Pause on Human Reply (IMPLEMENTADO 2025-12-22)

**Problema**: ~~Quando um humano responde via Chatwoot/painel, a IA deve parar automaticamente para nao interferir.~~ **RESOLVIDO**

**Solução N8N**:
```javascript
const isHumanReply = data.direction === 'OUT' &&
                     (data.author === 'HUMAN' || data.author === 'AGENT');

if (isHumanReply) {
  sessionStatus = 'PAUSED';
  sessionStatusReason = 'AUTO_PAUSED_HUMAN';
  pauseHours = organization.session_timeout_hours;
}
```

**Implementação Quayer**:
```typescript
// src/app/api/v1/webhooks/[provider]/route.ts

async function processOutgoingMessage(normalized: NormalizedWebhook) {
  const { instanceId, data } = normalized;
  const { message } = data;

  // Detectar se foi humano (não bot)
  const isHumanReply = message.author === 'HUMAN' || message.author === 'AGENT';

  if (isHumanReply) {
    // Auto-pause: bloquear IA por X horas
    const session = await database.chatSession.findFirst({
      where: { connectionId: instanceId, contactId: message.contactId, status: 'OPEN' },
    });

    if (session) {
      await sessionsManager.blockAI(session.id, 24 * 60, 'AUTO_PAUSED_HUMAN'); // 24h
      console.log(`[Webhook] Auto-paused session ${session.id} due to human reply`);
    }
  }
}
```

---

###### 4. ✅ Sistema de Comandos via Chat (IMPLEMENTADO 2025-12-22)

**Problema**: ~~Operadores precisam controlar sessoes via WhatsApp/Chatwoot sem acessar painel.~~ **RESOLVIDO**

**Solução N8N**:
```javascript
const COMANDO_FECHAR = /@fechar/i;
const COMANDO_PAUSAR = /@pausar(?:\s+(\d+))?/i;
const COMANDO_REABRIR = /@reabrir/i;
const COMANDO_BLACKLIST = /@blacklist/i;
const COMANDO_WHITELIST = /@whitelist/i;
```

**Implementação Quayer**:
```typescript
// src/lib/commands/command-parser.ts

interface ParsedCommand {
  type: 'CLOSE' | 'PAUSE' | 'REOPEN' | 'BLACKLIST' | 'WHITELIST' | 'NONE';
  hours?: number;
}

export function parseCommand(text: string): ParsedCommand {
  const lower = text.toLowerCase().trim();

  if (/@fechar/i.test(lower)) {
    return { type: 'CLOSE' };
  }

  const pauseMatch = lower.match(/@pausar(?:\s+(\d+))?/i);
  if (pauseMatch) {
    return { type: 'PAUSE', hours: pauseMatch[1] ? parseInt(pauseMatch[1]) : 24 };
  }

  if (/@reabrir/i.test(lower)) {
    return { type: 'REOPEN' };
  }

  if (/@blacklist/i.test(lower)) {
    return { type: 'BLACKLIST' };
  }

  if (/@whitelist/i.test(lower)) {
    return { type: 'WHITELIST' };
  }

  return { type: 'NONE' };
}

// Uso no webhook handler:
const command = parseCommand(message.content);
if (command.type !== 'NONE') {
  await executeCommand(sessionId, contactId, command);
  return; // Não processar como mensagem normal
}
```

---

##### Funcionalidades Quayer SUPERIORES ao N8N

| Feature | N8N | Quayer | Vantagem Quayer |
|---------|-----|--------|-----------------|
| **Message Concatenation** | ❌ | ✅ 8s buffer | Agrupa mensagens rápidas |
| **Audio Transcription** | ❌ | ✅ OpenAI Whisper | Transcreve áudio automaticamente |
| **Image Description** | ❌ | ✅ GPT-4o Vision | Descreve imagens |
| **Video Transcription** | ❌ | ✅ FFmpeg + Whisper | Extrai áudio e transcreve |
| **Multi-Provider Architecture** | Manual | ✅ Orchestrator | Abstração provider-agnostic |
| **Type Safety** | JavaScript | ✅ TypeScript | Tipagem forte |
| **Background Jobs** | ❌ | ✅ BullMQ | Processamento assíncrono |
| **Caching** | ❌ | ✅ Redis | Cache de status, perfis |

---

##### Resumo: Roadmap de Melhorias

| # | Melhoria | Origem | Prioridade | Esforço |
|---|----------|--------|------------|---------|
| 1 | Bot Echo Detection (Unicode) | N8N | 🔴 Alta | 2h |
| 2 | WhatsApp 24h Window Tracking | N8N | 🔴 Alta | 4h |
| 3 | Auto-Pause on Human Reply | N8N | 🟡 Média | 2h |
| 4 | Sistema de Comandos (@fechar, etc) | N8N | 🟡 Média | 3h |
| 5 | Bypass Bots per Contact | N8N | 🟢 Baixa | 2h |
| 6 | Transcrição antes de Concatenação | Quayer | 🔴 Alta | 6h |
| 7 | Session Cleanup Job (BullMQ) | Ambos | 🟡 Média | 2h |

**Total Estimado**: ~21h de desenvolvimento

---

---

### 3.5 👥 Jornada: Gestão de Equipe

```
┌──────────────────────────────────────────────────────────────────┐
│                  FLUXO DE GESTÃO DE EQUIPE                       │
└──────────────────────────────────────────────────────────────────┘

[Master] ──► /integracoes/users
             │
             ├──► 📋 Listar Membros
             │    ├── Tabela com: nome, email, cargo, status, data entrada
             │    ├── Filtrar por cargo (master/manager/user)
             │    ├── Ordenar por nome, data
             │    └── Cards de estatísticas
             │         ├── Total de membros
             │         ├── Masters
             │         ├── Gerentes
             │         └── Membros
             │
             ├──► ➕ [Convidar Usuário]
             │    │
             │    ├──► Modal de convite
             │    │    ├── Email do convidado
             │    │    └── Cargo: Master, Gerente, Membro
             │    │
             │    ├──► API: POST /invitations
             │    │    └── Gera link de convite (24h)
             │    │
             │    └──► Exibe URL para compartilhar
             │
             ├──► ✏️ [Alterar Cargo] (apenas Master)
             │    ├── Selecionar novo cargo
             │    └── API: PATCH /organizations/:id/members/:userId
             │
             └──► 🗑️ [Remover Membro] (apenas Master)
                  ├── Confirmação
                  ├── API: DELETE /organizations/:id/members/:userId
                  └── ⚠️ Não pode remover último master
```

**Status**: ✅ Funcional

**Validações de Segurança**:
- ✅ Não pode remover o último master
- ✅ Não pode alterar próprio cargo (exceto admin)
- ✅ Apenas master pode promover/rebaixar

**Implementações Recentes**:
| # | Melhoria | Status | Referência |
|---|----------|--------|------------|
| 1 | Reenviar convite expirado | ✅ FEITO | `admin/invitations/page.tsx:487-510` |
| 2 | Limites de membros por plano | ✅ FEITO | Backend: `organizations.repository.ts:386-392` + UI: `integracoes/users/page.tsx:216-235,545-620` |

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | Histórico de atividades do membro | 🟢 Baixo | 4h |
| 2 | Permissões granulares (feature flags) | 🟡 Médio | 8h |

---

### 3.5.1 🎧 Jornada: Gestão de Atendimentos (Sessões)

> **Novo em 2025-12-22**: Página centralizada para gerenciar sessões de atendimento

```
┌──────────────────────────────────────────────────────────────────┐
│              FLUXO DE GESTÃO DE ATENDIMENTOS                     │
└──────────────────────────────────────────────────────────────────┘

[Master] ──► /integracoes/sessions
             │
             ├──► 📊 Estatísticas (Cards)
             │    ├── Sessões Ativas (atendendo agora)
             │    ├── Sessões Aguardando (fila de espera)
             │    ├── IA Bloqueada (humano assumiu)
             │    └── Sessões Encerradas
             │
             ├──► 📑 Tabs de Filtro Rápido
             │    ├── Ativas (status = active)
             │    ├── Na Fila (status = waiting)
             │    ├── Encerradas (status = closed)
             │    └── Todas
             │
             ├──► 📋 Lista de Sessões (Cards)
             │    ├── Contato (nome/telefone)
             │    ├── Canal (WhatsApp, etc.)
             │    ├── Status da sessão
             │    ├── Status da IA (ativo/bloqueado)
             │    ├── Tempo de espera
             │    └── Última atualização
             │
             └──► ⚡ Ações Rápidas por Sessão
                  │
                  ├──► 👤 [Assumir Atendimento]
                  │    ├── Bloqueia IA (aiEnabled = false)
                  │    ├── Muda status para active
                  │    └── Humano assume a conversa
                  │
                  ├──► 🤖 [Devolver para IA]
                  │    ├── Habilita IA (aiEnabled = true)
                  │    └── Bot volta a responder
                  │
                  ├──► ✖️ [Encerrar Sessão]
                  │    └── Muda status para closed
                  │
                  └──► 👁️ [Ver Detalhes]
                       ├── Dialog com informações completas
                       ├── Canal associado
                       ├── Tempo de duração
                       └── Histórico de status
```

**Status**: ✅ Funcional (Implementado 2025-12-22)

**APIs Utilizadas**:
- `GET /sessions?organizationId=...` - Lista sessões da organização
- `PUT /sessions/:id` - Atualiza status ou aiEnabled
- `GET /sessions/:id` - Ver detalhes da sessão

**Workflow de Atendimento Humano vs IA**:
```
┌─────────────────────────────────────────────────────────────────────┐
│                CICLO DE ATENDIMENTO IA + HUMANO                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. NOVA MENSAGEM DO CLIENTE                                        │
│     └──► IA responde automaticamente (aiEnabled = true)             │
│                                                                     │
│  2. CLIENTE SOLICITA HUMANO (ou trigger configurado)                │
│     ├──► IA detecta solicitação                                     │
│     ├──► Status muda para "waiting" (fila)                          │
│     └──► Notificação para equipe                                    │
│                                                                     │
│  3. HUMANO ASSUME                                                   │
│     ├──► Clica "Assumir Atendimento"                                │
│     ├──► aiEnabled = false                                          │
│     ├──► Status = active                                            │
│     └──► Humano responde diretamente                                │
│                                                                     │
│  4. HUMANO FINALIZA                                                 │
│     ├──► Opção A: "Devolver para IA" ──► aiEnabled = true           │
│     └──► Opção B: "Encerrar Sessão" ──► status = closed             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | Atribuição de sessão para atendente específico | 🟡 Médio | 4h |
| 2 | Tempo máximo na fila (auto-escalate) | 🟡 Médio | 3h |
| 3 | SLA e alertas de tempo de espera | 🟢 Baixo | 2h |
| 4 | Chat em tempo real na página de sessões | 🟠 Alto | 8h |

---

### 3.6 👤 Jornada: Gestão de Contatos

```
┌──────────────────────────────────────────────────────────────────┐
│                  FLUXO DE GESTÃO DE CONTATOS                     │
└──────────────────────────────────────────────────────────────────┘

[Master] ──► /contatos
             │
             ├──► 📋 Listar Contatos (api.contacts.list)
             │    ├── Tabela paginada
             │    ├── Busca por nome/telefone/email
             │    ├── Filtros desabilitados (TODO)
             │    ├── Tags desabilitadas (TODO)
             │    └── Export CSV
             │
             ├──► 👁️ [Ver Detalhes] /contatos/:id
             │    ├── Informações do contato
             │    ├── Histórico de sessões
             │    ├── Atributos customizados
             │    └── Observações
             │
             ├──► ✏️ [Editar]
             │    ├── Nome
             │    ├── Email
             │    ├── Tags
             │    └── Bypass de bots
             │
             └──► 🗑️ [Deletar] (confirmação)
```

**Status**: ⚠️ Parcial

**⚠️ POTENCIAL BUG - Isolamento de Contatos**:
**Arquivo**: `contacts.controller.ts:47-52`
```typescript
// Código atual:
const organizationId = user.role === 'admin' ? undefined : user.currentOrgId;
// Se currentOrgId é null/undefined, o filtro não é aplicado!

// CORREÇÃO NECESSÁRIA:
if (user.role !== 'admin' && !user.currentOrgId) {
  return response.badRequest('Nenhuma organização selecionada');
}
```

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | 🔴 Validar currentOrgId em list | 🔴 Crítico | 30min |
| 2 | Implementar sistema de tags | 🟡 Médio | 4h |
| 3 | Filtros avançados | 🟡 Médio | 3h |
| 4 | Import de contatos (CSV) | 🟢 Baixo | 4h |
| 5 | Merge de contatos duplicados | 🟢 Baixo | 6h |

---

### 3.7 ⚙️ Jornada: Configurações

```
┌──────────────────────────────────────────────────────────────────┐
│                  FLUXO DE CONFIGURAÇÕES                          │
└──────────────────────────────────────────────────────────────────┘

[Master] ──► /integracoes/settings
             │
             ├──► 👤 Perfil
             │    ├── Editar nome
             │    ├── Editar email (requer verificação)
             │    └── Ver role no sistema
             │
             ├──► 🎨 Aparência
             │    └── Tema: Claro / Escuro / Sistema
             │
             ├──► 🔐 Segurança (Passkeys)
             │    ├── Listar passkeys registradas
             │    ├── Adicionar nova passkey
             │    └── Remover passkey
             │
             ├──► 🔌 Provedores & Integrações
             │    └── Link para /integracoes/settings/organization/integrations
             │         ├── OpenAI
             │         ├── Anthropic
             │         ├── ElevenLabs
             │         ├── Deepgram
             │         ├── Supabase
             │         └── Redis
             │
             └──► 🔑 API Keys
                  ├── Listar chaves existentes
                  ├── Criar nova chave
                  ├── Copiar chave
                  └── Revogar chave
```

**Status**: ✅ Funcional

---

### 3.8 🔧 Jornada: Ferramentas

```
┌──────────────────────────────────────────────────────────────────┐
│                    FLUXO DE FERRAMENTAS                          │
└──────────────────────────────────────────────────────────────────┘

[Master] ──► /ferramentas
             │
             ├──► 🔔 Webhooks (/ferramentas/webhooks)
             │    ├── Configurar URL de webhook por instância
             │    ├── Selecionar eventos
             │    ├── Logs de entrega
             │    └── Debug e reenvio
             │
             └──► 💬 Chatwoot (/ferramentas/chatwoot) [BETA]
                  ├── Sincronização bidirecional
                  ├── Múltiplos agentes
                  ├── Histórico unificado
                  └── Typing automático
```

**Status**: ⚠️ Parcial (Chatwoot em beta)

---

## 4. Bugs e Problemas Encontrados

### 4.1 🔴 CRÍTICO - Potencial Vazamento de Contatos

**Localização**: `src/features/contacts/controllers/contacts.controller.ts:47-52`

**Problema**: Similar ao bug de instâncias, o endpoint de listagem de contatos não valida se `currentOrgId` existe antes de usar como filtro.

**Código Atual**:
```typescript
const organizationId = user.role === 'admin' ? undefined : user.currentOrgId;
// Se currentOrgId é null, organizationId = undefined = sem filtro
```

**Impacto**: Usuário sem organização pode ver todos os contatos do sistema.

**Correção Recomendada**:
```typescript
// Antes de definir organizationId
if (user.role !== 'admin' && !user.currentOrgId) {
  return response.badRequest('Nenhuma organização selecionada');
}
```

**Arquivos que precisam da mesma correção**:
- ✅ `sessions.controller.ts` - Já possui validação (linha 50)
- ✅ `dashboard.controller.ts` - Já possui validação (linha 32)
- ❌ `contacts.controller.ts:47` - **PRECISA CORREÇÃO**
- ❌ `instances.controller.ts:258` - **PRECISA CORREÇÃO** (já documentado)

---

### 4.2 🟡 MÉDIO - Features Desabilitadas na UI

Vários botões na interface estão marcados como `disabled` sem implementação:

1. **Contatos** `/contatos`
   - Botão "Filtros" desabilitado
   - Botão "Tags" desabilitado
   - Menu "Editar Tags" desabilitado

---

## 5. Oportunidades de Melhoria (Consolidado)

### 5.1 Oportunidades de IA e Automação

| # | Oportunidade | Impacto | Complexidade |
|---|--------------|---------|--------------|
| 1 | Sugestões de resposta baseadas em histórico | Alto | Média |
| 2 | Classificação automática de leads (NLP) | Alto | Alta |
| 3 | Análise de sentimento em conversas | Médio | Média |
| 4 | Resumo automático de conversas longas | Médio | Baixa |
| 5 | Previsão de churn baseada em interações | Alto | Alta |
| 6 | Templates inteligentes por contexto | Médio | Média |

### 5.2 Oportunidades de UX

| # | Oportunidade | Impacto | Complexidade |
|---|--------------|---------|--------------|
| 1 | Welcome tour para novos masters | Alto | Baixa |
| 2 | Notificações in-app (bell icon) | Médio | Média |
| 3 | Atalhos de teclado (Cmd+K palette) | Médio | Baixa |
| 4 | Mobile-responsive melhorado | Médio | Média |
| 5 | Modo escuro por padrão de noite | Baixo | Baixa |

---

## 6. Resumo de Status por Jornada

| Jornada | Status | Bugs | Análise Profunda |
|---------|--------|------|------------------|
| Autenticação/Onboarding | ✅ | - | - |
| Dashboard | ✅ | - | - |
| **Canais WhatsApp** | ✅ | - | **✅ Realizada 2025-12-21** |
| Conversas | ✅ | - | - |
| Equipe | ✅ | - | - |
| Contatos | 🟡 | 1 potencial | 🔴 Precisa correção |
| Configurações | ✅ | - | - |
| Ferramentas | 🟡 | Chatwoot beta | - |

### Detalhamento: Canais WhatsApp (Análise Profunda)
- **Frontend**: IntegrationsPage, CreateIntegrationModal, QRCodeModal, ShareLinkModal
- **Backend**: instances.controller.ts (1500+ linhas), uazapi.service.ts
- **Segurança**: ✅ Validação de org, ✅ RBAC, ✅ Limite de instâncias, ✅ Share tokens
- **UX**: ✅ Polling inteligente, ✅ Optimistic updates, ✅ A11y, ✅ Tabs QR/Código
- **Rotas Validadas**:
  - ✅ `/api/v1/instances` (CRUD)
  - ✅ `/api/v1/instances/:id/connect` (QR Code)
  - ✅ `/api/v1/instances/:id/share` (Gerar link)
  - ✅ `/api/v1/instances/share/:token` (Página pública)
  - ✅ `/api/v1/instances/share/:token/refresh` (Atualizar QR)
  - ✅ `/api/v1/instances/share/:token/pairing-code` (Código pareamento)
- **Pontos de Atenção**:
  - ~~🟡 Limite "10" hardcoded na UI~~ ✅ CORRIGIDO 2025-12-21 - Usa `org.maxInstances` dinamicamente
  - 🟡 Token de compartilhamento pode ser estendido indefinidamente

---

## 7. Mapeamento Completo API → UAZapi (Validação Brutal)

> **Análise realizada em 2025-12-21**
> **Status**: ✅ Rotas validadas end-to-end

### 7.1 Arquitetura de Camadas

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         ARQUITETURA DE INTEGRAÇÃO                             │
└──────────────────────────────────────────────────────────────────────────────┘

[Frontend]                [API Quayer]              [Orchestrator]           [UAZapi]
    │                          │                         │                       │
    │  POST /instances         │                         │                       │
    │─────────────────────────►│                         │                       │
    │                          │  createInstance()       │                       │
    │                          │────────────────────────►│                       │
    │                          │                         │  POST /instance/init  │
    │                          │                         │──────────────────────►│
    │                          │                         │◄──────────────────────│
    │                          │                         │  { token, instanceId }│
    │                          │◄────────────────────────│                       │
    │◄─────────────────────────│  { id, uazapiToken }   │                       │
    │                          │                         │                       │

┌──────────────────────────────────────────────────────────────────────────────┐
│                              CAMADAS                                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐                                                         │
│  │ Controller      │ instances.controller.ts - API REST endpoints           │
│  │ (API Layer)     │ Responsável: Validação, RBAC, Response                 │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                         │
│  │ Orchestrator    │ provider.orchestrator.ts - Provider abstraction        │
│  │ (Business)      │ Responsável: Cache, Retry, Multi-provider              │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                         │
│  │ Adapter         │ uazapi.adapter.ts - IWhatsAppProvider implementation   │
│  │ (Provider)      │ Responsável: Normalização, Mapeamento de status        │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                         │
│  │ Client          │ uazapi.client.ts - HTTP Client para UAZapi             │
│  │ (HTTP)          │ Responsável: Requests, Headers, Timeout                │
│  └────────┬────────┘                                                         │
│           │                                                                  │
│           ▼                                                                  │
│  ┌─────────────────┐                                                         │
│  │ UAZapi          │ https://quayer.uazapi.com                              │
│  │ (External)      │ API WhatsApp Web/Business                              │
│  └─────────────────┘                                                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Tabela de Mapeamento de Rotas

| Nossa API | Método | Orchestrator | Adapter | UAZapi Endpoint | Auth |
|-----------|--------|--------------|---------|-----------------|------|
| `/instances` | POST | `createInstance()` | `createInstance()` | `POST /instance/init` | admintoken |
| `/instances` | GET | `listAllInstances()` | - | `GET /instance/all` | admintoken |
| `/instances/:id` | GET | - | - | DB only | JWT |
| `/instances/:id` | PUT | - | - | DB only | JWT |
| `/instances/:id` | DELETE | `deleteInstance()` | `deleteInstance()` | `DELETE /instance/delete` | token |
| `/instances/:id/connect` | POST | `connectInstance()` | `generateQRCode()` | `POST /instance/connect` | token |
| `/instances/:id/status` | GET | `getInstanceStatus()` | `getInstanceStatus()` | `GET /instance/status` | token |
| `/instances/:id/disconnect` | POST | `disconnectInstance()` | `disconnect()` | `POST /instance/disconnect` | token |
| `/instances/:id/pairing-code` | POST | `getPairingCode()` | `getPairingCode()` | `POST /instance/connect` + phone | token |
| `/instances/:id/webhook` | POST | - | `configureWebhook()` | `POST /webhook` | token |
| `/instances/:id/webhook` | GET | - | - | `GET /webhook` | token |
| `/instances/:id/profile-picture` | GET | - | `getProfilePicture()` | `GET /profile/image/:number` | token |
| `/instances/:id/share` | POST | - | - | DB only (gera token) | JWT |
| `/instances/share/:token` | GET | - | - | DB + `GET /instance/status` | Público |
| `/instances/share/:token/refresh` | POST | - | - | `POST /instance/connect` | Público |
| `/instances/share/:token/pairing-code` | POST | - | - | `POST /instance/connect` + phone | Público |

### 7.3 Fluxo QR Code End-to-End

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        FLUXO QR CODE - VISÃO COMPLETA                         │
└──────────────────────────────────────────────────────────────────────────────┘

[QRCodeModal.tsx]
      │
      │ 1. Auto-connect ao abrir modal
      ▼
POST /api/v1/instances/:id/connect
      │
      │ 2. instances.controller.ts:464-580
      │    ├── Valida authProcedure
      │    ├── Busca instância no DB
      │    ├── Valida RBAC (checkOrganizationPermission)
      │    └── Verifica se já está conectado
      ▼
providerOrchestrator.connectInstance(instanceId)
      │
      │ 3. provider.orchestrator.ts:287-340
      │    ├── Busca provider configurado
      │    ├── Invalida cache de status
      │    └── Chama adapter
      ▼
uazapiAdapter.generateQRCode(instanceId)
      │
      │ 4. uazapi.adapter.ts:85-93
      │    ├── Busca token do DB (getInstanceToken)
      │    └── Chama client
      ▼
uazClient.connectInstance(token)
      │
      │ 5. uazapi.client.ts:136-141
      │    ├── POST /instance/connect
      │    ├── Header: token (não admintoken)
      │    └── Body: vazio (ou { phone } se pairing)
      ▼
UAZapi retorna:
{
  "success": true,
  "data": {
    "qrcode": "data:image/png;base64,...", // ✅
    "pairingCode": null,
    "status": "connecting"
  }
}
      │
      │ 6. Resposta volta pelas camadas
      ▼
Frontend recebe { qrcode, expires: 120000 }
      │
      │ 7. Polling de status (3s interval)
      ▼
useInstanceStatus(connectionId, true)
      │
      │ 8. GET /api/v1/instances/:id/status
      │    └── Verifica status real na UAZapi
      ▼
Quando status === 'connected':
      │
      │ 9. Auto-fecha modal
      │    ├── Toast de sucesso
      │    ├── Invalida cache TanStack Query
      │    └── Chama onConnected callback
      ▼
[Modal fecha automaticamente em 3s]
```

### 7.4 Mapeamento de Status UAZapi → Sistema

| UAZapi Status | Nossa API | UI Status | Cor |
|---------------|-----------|-----------|-----|
| `open` | `CONNECTED` | "Conectado" | 🟢 Verde |
| `connected` | `CONNECTED` | "Conectado" | 🟢 Verde |
| `close` | `DISCONNECTED` | "Desconectado" | 🔴 Vermelho |
| `disconnected` | `DISCONNECTED` | "Desconectado" | 🔴 Vermelho |
| `connecting` | `CONNECTING` | "Conectando..." | 🟡 Amarelo |
| `qrReadSuccess` | `CONNECTED` | "Conectado" | 🟢 Verde |
| `qrReadError` | `ERROR` | "Erro" | 🔴 Vermelho |

**Arquivo de Mapeamento**: [uazapi.adapter.ts:435-446](src/lib/providers/adapters/uazapi/uazapi.adapter.ts#L435-L446)

### 7.5 Endpoints UAZapi Utilizados

| Endpoint UAZapi | Método | Header | Usado Por | Frequência |
|-----------------|--------|--------|-----------|------------|
| `/instance/init` | POST | admintoken | Criar instância | Raro |
| `/instance/all` | GET | admintoken | Listar (admin) | Raro |
| `/instance/connect` | POST | token | Conectar/QR | Frequente |
| `/instance/status` | GET | token | Polling status | Muito frequente (3s) |
| `/instance/disconnect` | POST | token | Desconectar | Ocasional |
| `/instance/delete` | DELETE | token | Excluir | Raro |
| `/instance/restart` | POST | token | Reiniciar | Ocasional |
| `/webhook` | POST | token | Configurar webhook | Raro |
| `/webhook` | GET | token | Ver webhook | Raro |
| `/globalwebhook` | POST | admintoken | Webhook global | Raro |
| `/profile/image/:number` | GET | token | Foto de perfil | Ocasional |
| `/send/text` | POST | token | Enviar texto | Muito frequente |
| `/send/media` | POST | token | Enviar mídia | Frequente |
| `/chats/all` | GET | token | Listar chats | Frequente |
| `/contacts/all` | GET | token | Listar contatos | Frequente |
| `/message/find` | POST | token | Buscar mensagens | Frequente |

### 7.6 Inconsistências e Redundâncias Identificadas

#### ✅ Consistente
1. **Fluxo de criação**: POST /instance/init → Salva token → DB
2. **Fluxo de conexão**: POST /instance/connect → Retorna QR/Pairing
3. **Validação de status**: GET /instance/status → Mapeia para enum interno

#### ⚠️ Pontos de Atenção
1. **uaz.service.ts vs uazapi.client.ts**: Existem dois clientes HTTP
   - `uaz.service.ts` (linha 7-9): Usa `UAZAPI_URL` ou `UAZ_API_URL`
   - `uazapi.client.ts` (linha 484): Usa `UAZAPI_BASE_URL` ou `UAZAPI_URL`
   - **Recomendação**: Unificar para evitar inconsistência de configuração

2. **Cache do Orchestrator**: TTL de 5s para status
   - Bom para reduzir chamadas à UAZapi
   - Pode causar delay na detecção de conexão
   - **Trade-off aceitável**

3. **Endpoints de mensagens**: Não passam pelo Orchestrator
   - `uazapiAdapter.sendText()` usa `uazService.sendText()` diretamente
   - **OK**: Mensagens não precisam de abstração multi-provider

---

## 8. Oportunidades de Melhoria Identificadas

### 8.1 Backend - Oportunidades

| # | Melhoria | Arquivo | Linha | Prioridade | Esforço | Status |
|---|----------|---------|-------|------------|---------|--------|
| 1 | Unificar clients UAZapi | `uaz.service.ts` / `uazapi.client.ts` | - | 🟡 Médio | 4h | ⏳ Pendente |
| ~~2~~ | ~~Adicionar circuit breaker para UAZapi~~ | `uazapi.client.ts` | 28-107 | ~~🟡 Médio~~ | ~~3h~~ | ✅ FEITO 2025-12-22 |
| ~~3~~ | ~~Retry com exponential backoff~~ | `circuit-breaker.ts` | 123-166 | ~~🟢 Baixo~~ | ~~2h~~ | ✅ FEITO 2025-12-22 |
| 4 | Rate limiting por organização | `instances.controller.ts` | - | 🟡 Médio | 4h | ⏳ Pendente |
| ~~5~~ | ~~Cache de perfil de foto (5min)~~ | `orchestrator.ts` | 328-365 | ~~🟢 Baixo~~ | ~~1h~~ | ✅ FEITO 2025-12-22 |
| 6 | Webhook retry queue (BullMQ) | - | - | 🟡 Médio | 6h | ⏳ Pendente |
| 7 | Logs estruturados para debugging | Todos controllers | - | 🟢 Baixo | 2h | ⏳ Pendente |
| ~~8~~ | ~~Health check UAZapi periodico~~ | `health.controller.ts` | 204-289 | ~~🟢 Baixo~~ | ~~1h~~ | ✅ FEITO 2025-12-22 |
| ~~9~~ | ~~Limite de extensões de share token~~ | `instances.controller.ts` | 1328-1366, 1463-1495 | ~~🟡 Médio~~ | ~~1h~~ | ✅ FEITO 2025-12-21 |
| 10 | ~~Validar currentOrgId em contacts~~ | `contacts.controller.ts` | 47+ | ~~🔴 Crítico~~ | ~~30min~~ | ✅ FEITO |

> **Nota 2025-12-21**:
> - Item 9: Limite de extensões (MAX_EXTENSIONS = 3) implementado com contador `shareTokenExtensionCount` em schema
> - Item 10: currentOrgId validado em todas as rotas (linhas 48-51, 138-140, 215-217, 268-270, 314-316)

### 8.2 Frontend - Oportunidades

| # | Melhoria | Arquivo | Prioridade | Esforço |
|---|----------|---------|------------|---------|
| ~~1~~ | ~~Usar limite real da org em vez de "10"~~ | `integracoes/page.tsx:98` | ✅ FEITO | 2025-12-21 |
| 2 | Adicionar tab de Pairing Code no QRCodeModal interno | `QRCodeModal.tsx` | 🟢 Baixo | 2h |
| 3 | Progress indicator durante polling | `QRCodeModal.tsx` | 🟢 Baixo | 1h |
| ~~4~~ | ~~Countdown visual para expiração do QR (120s)~~ | `QRCodeModal.tsx` | ~~🟢 Baixo~~ | ✅ FEITO 2025-12-22 |
| 5 | Skeleton loading mais específico | `IntegrationsPage` | 🟢 Baixo | 1h |
| 6 | Error boundary para falhas de polling | `useInstance.ts` | 🟡 Médio | 2h |
| 7 | Websocket para status em vez de polling | - | 🟡 Médio | 6h |
| ~~8~~ | ~~Feedback de validação Cloud API antes de criar~~ | `CreateIntegrationModal.tsx` | ~~🟡 Médio~~ | ✅ FEITO 2025-12-21 |
| 9 | Animação de transição conectado→desconectado | `IntegrationCard.tsx` | 🟢 Baixo | 1h |
| ~~10~~ | ~~Cache local (localStorage) para preferências de view~~ | `IntegrationsPage` | ~~🟢 Baixo~~ | ✅ FEITO 2025-12-22 |

### 8.3 Segurança - Melhorias Recomendadas

| # | Melhoria | Severidade | Esforço | Status |
|---|----------|------------|---------|--------|
| 1 | ~~Expiração absoluta para share tokens (máx 24h)~~ | ~~🟡 Médio~~ | ~~1h~~ | ✅ FEITO 2025-12-21 |
| 2 | ~~Rate limit em endpoints públicos de share~~ | ~~🟡 Médio~~ | ~~2h~~ | ✅ FEITO 2025-12-21 |
| 3 | ~~Audit log para ações em instâncias~~ | ~~🟢 Baixo~~ | ~~4h~~ | ✅ FEITO 2025-12-21 |
| ~~4~~ | ~~Validação de phone number format~~ | ~~🟢 Baixo~~ | ~~30min~~ | ✅ FEITO 2025-12-21 |
| 5 | CORS mais restritivo para /share endpoints | 🟢 Baixo | 30min | ⏳ Pendente |

> **Nota 2025-12-21**:
> - Audit log implementado em `instances.controller.ts` para create, disconnect e delete
> - Rate limit (1000 req/min) implementado em webhook route via `webhookRateLimiter`
> - Limite de extensões (máx 3) e expiração absoluta (24h) implementados em share token system
> - Validação E.164 implementada em `messages.schemas.ts` via `phoneOrChatIdSchema`
> - Feedback visual Cloud API implementado em `CreateIntegrationModal.tsx` com endpoint `POST /validate-cloud-api`
>
> **Nota 2025-12-22**:
> - Countdown visual (120s) implementado em `QRCodeModal.tsx` com auto-refresh
> - Cache localStorage para preferências (viewMode, statusFilter) em `integracoes/page.tsx`

### 8.4 Performance - Otimizações

| # | Otimização | Impacto | Esforço |
|---|------------|---------|---------|
| 1 | Aumentar cache TTL de status para 10s | Reduz chamadas UAZapi 50% | 15min |
| 2 | Batch status check para múltiplas instâncias | Reduz N requests para 1 | 3h |
| 3 | SSE para status em vez de polling | Latência real-time | 6h |
| 4 | Lazy loading de QRCodeModal | Bundle size | 30min |
| 5 | Debounce no search de instâncias | UX + menos requests | 30min |

---

## 9. Diferenças Master vs Admin

| Aspecto | Master | Admin |
|---------|--------|-------|
| Escopo | 1 organização | Todas organizações |
| Acesso Admin Panel | ❌ | ✅ /admin/* |
| Ver outras orgs | ❌ | ✅ Context Switch |
| Criar organizações | ❌ (só onboarding) | ✅ |
| Importar instâncias UAZapi | ❌ | ✅ |
| Ver logs técnicos | ❌ | ✅ |
| Gerenciar permissões globais | ❌ | ✅ |

---

## 10. Próximos Passos Recomendados

### 10.1 Correções Críticas (Sprint Atual)
1. ~~**🔴 Urgente**: Corrigir validação de `currentOrgId` em `contacts.controller.ts:47`~~ ✅ **FEITO 2025-12-21**
2. **🔴 Urgente**: Unificar clients UAZapi (`uaz.service.ts` + `uazapi.client.ts`) ⚠️ **EM PROGRESSO**
3. ~~**🔴 Urgente**: Limitar extensões de share token (máx 3 extensões ou 24h absoluto)~~ ✅ **FEITO 2025-12-21**

> **Nota sobre unificação UAZapi (2025-12-21):**
> - Existem 3 implementações: `uaz.service.ts`, `uazapi.client.ts`, `uazapi.service.ts`
> - **Estratégia**: Usar `uazapi.client.ts` como base (tem circuit breaker, timeout, factory)
> - Circuit breaker já adicionado a `uazapi.client.ts`
> - Próximo passo: criar facades nas outras para backward compatibility

### 10.2 Melhorias de Curto Prazo (1-2 Semanas)
4. ~~**🟡 Médio**: Mostrar limite real da org em CreateIntegrationModal~~ ✅ **FEITO 2025-12-21** (já existia em `integracoes/page.tsx:98`)
5. ~~**🟡 Médio**: Adicionar circuit breaker para chamadas UAZapi~~ ✅ **FEITO 2025-12-21** (em `uazapi.client.ts`)
6. ~~**🟡 Médio**: Rate limit em endpoints públicos de share~~ ✅ **FEITO 2025-12-21**
7. **🟡 Médio**: Implementar sistema de tags em contatos

### 10.3 Melhorias de Médio Prazo
8. **🟢 Baixo**: Adicionar countdown visual no QR Code (120s)
9. **🟢 Baixo**: SSE para status de instâncias em tempo real
10. **🟢 Baixo**: Finalizar integração Chatwoot

### 10.4 Segurança - Concluído ✅
- ✅ **Audit log para instâncias** - create, disconnect, delete (2025-12-21)
- ✅ **Validação currentOrgId em contacts** - Todas operações CRUD (2025-12-21)
- ✅ **Limite real da org** - `maxInstances` dinâmico em `integracoes/page.tsx:98` (2025-12-21)

### 10.5 Resiliência - Concluído ✅
- ✅ **Circuit Breaker para UAZapi** - 5 falhas abre, 30s retry, 2 sucessos fecha (2025-12-21)
- ✅ **Limite de extensões share token** - máx 3 extensões + 24h absoluto (2025-12-21)

---

## 11. Histórico de Análises

| Data | Análise | Responsável | Seções |
|------|---------|-------------|--------|
| 2025-12-21 | Análise profunda de Canais WhatsApp | Claude | 3.3, 3.3.1, 3.3.2 |
| 2025-12-21 | Validação brutal de rotas UAZapi | Claude | 7.1-7.6, 8.1-8.4 |
| 2025-12-21 | Análise brutal Conversas e Atendimento | Claude | 3.4.1-3.4.10 |
| 2025-12-21 | Análise brutal Webhooks e Transcrição | Claude | 3.4.11.1-3.4.11.9 |
| 2025-12-21 | Correção Transcrição/Concatenação + Propostas | Claude | 3.4.11.10-3.4.11.12 |
| 2025-12-21 | Análise N8N vs Quayer + Roadmap Melhorias | Claude | 3.4.11.13 |
| 2025-12-21 | **Revisão brutal: Status de implementações** | Claude | 8.1, 8.3, 10.1, 10.4 |
| 2025-12-21 | **Limite real da org**: Verificado como já implementado | Claude | 3.3, 6, 8.2, 10.2, 10.4 |
| 2025-12-21 | **Comparativo período anterior**: Badges com variação % | Claude | 3.2 |
| 2025-12-21 | **Segurança webhooks**: Rate limit, IP whitelist, Signature | Claude | 3.4.11.8 |

---

## 12. Resumo de Implementações Concluídas

| Data | Item | Descrição |
|------|------|-----------|
| 2025-12-21 | Validação currentOrgId | Implementado em `contacts.controller.ts` - todas operações CRUD protegidas |
| 2025-12-21 | Audit Log Instâncias | Implementado em `instances.controller.ts` - create, disconnect, delete |
| 2025-12-21 | Audit Log Organizações | Implementado em `organizations.controller.ts` - create, update, delete, addMember, updateMember, removeMember |
| 2025-12-21 | **Seletor de Período Dashboard** | Implementado filtro de período (hoje, 7 dias, 30 dias, todo período) no dashboard do Master |
| 2025-12-21 | **Limite Real da Organização** | Verificado que já existe em `integracoes/page.tsx:98` - usa `org.maxInstances` dinamicamente |
| 2025-12-21 | **Comparativo Período Anterior** | Implementado badges com variação % (↑↓) comparando com período anterior (hoje vs ontem, semana vs anterior, etc) |
| 2025-12-21 | **Seguranca Webhooks** | Rate limiting (1000 req/min), IP whitelist UAZapi, Signature verification HMAC-SHA256 |
| 2025-12-22 | **Pagina Sessions Admin** | Gestao global de sessoes para admin em `/admin/sessions` |
| 2025-12-22 | **Pagina Sessions Master** | Gestao de atendimentos para master em `/integracoes/sessions` |
| 2025-12-22 | **Dead Letter Queue** | DLQ para transcricoes falhas em `transcription.worker.ts` |
| 2025-12-22 | **Verificacao Funcionalidades N8N** | Bot Echo, 24h Window, Comandos, Auto-Pause - todos ja implementados |
| 2025-12-22 | **Retry com Backoff** | Retry automatico com exponential backoff em `messages.controller.ts` |
| 2025-12-22 | **Bulk Actions Sessions** | Acoes em massa para multiplas sessoes em `sessions.controller.ts` |
| 2025-12-22 | **Cache Foto Perfil** | Cache de 5min para fotos de perfil em `orchestrator.ts` |
| 2025-12-22 | **Health Check UAZapi** | Endpoint `/health/uazapi` para verificar status das instancias |

### Arquivos Modificados 2025-12-22
- `src/app/admin/sessions/page.tsx` - Pagina de gestao de sessoes para admin
- `src/app/integracoes/sessions/page.tsx` - Pagina de atendimentos para master
- `src/components/app-sidebar.tsx` - Links para sessions nas sidebars
- `src/lib/transcription/transcription.worker.ts` - Dead Letter Queue
- `src/features/messages/controllers/messages.controller.ts` - Retry com backoff
- `src/features/sessions/controllers/sessions.controller.ts` - Bulk actions
- `src/lib/providers/core/orchestrator.ts` - Cache de foto de perfil
- `src/features/health/controllers/health.controller.ts` - Health check UAZapi

### Arquivos Modificados - Seletor de Período
- `src/features/dashboard/controllers/dashboard.controller.ts` - Query param `period` com cache por período
- `src/lib/api/dashboard.service.ts` - Filtro por timestamp no `getAggregatedMetrics`
- `src/app/integracoes/dashboard/page.tsx` - UI com Select component para período

### Arquivos Modificados - Comparativo Período Anterior
- `src/features/dashboard/controllers/dashboard.controller.ts` - Cálculo de período anterior e variação percentual
- `src/app/integracoes/dashboard/page.tsx` - Componente `ComparisonBadge` com ícones TrendingUp/TrendingDown

### Arquivos Modificados - Segurança Webhooks
- `src/app/api/v1/webhooks/[provider]/route.ts` - Rate limiting, IP whitelist, Signature verification
- `src/lib/rate-limit/index.ts` - Exportação de `webhookRateLimiter`

**Variáveis de Ambiente Adicionadas:**
- `UAZAPI_ALLOWED_IPS` - IPs permitidos para UAZapi (comma-separated, suporta wildcards)
- `WEBHOOK_SIGNATURE_SECRET` - Secret para verificação HMAC-SHA256
- `WEBHOOK_SECURITY_MODE` - `strict` (bloqueia) ou `permissive` (apenas log)

---

*Documento gerado e mantido por analise automatizada. Ultima atualizacao: 2025-12-22*

