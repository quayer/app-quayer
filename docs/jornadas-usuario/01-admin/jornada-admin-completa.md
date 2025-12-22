# Jornada do Administrador do Sistema (Admin)

> **Perfil**: `role: admin` no sistema
> **Acesso**: Total - Painel administrativo + funcionalidades de organização
> **Responsabilidade**: Gerenciar toda a plataforma Quayer
> **Última Atualização**: 2025-12-21

---

## 1. Mapa de Navegação do Admin

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SIDEBAR - ADMIN                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  🛡️ ADMINISTRAÇÃO                                                          │
│  ├── Dashboard Admin ────────► /admin                                       │
│  ├── Organizações ───────────► /admin/organizations                         │
│  ├── Clientes ───────────────► /admin/clients                               │
│  ├── Mensagens ──────────────► /admin/messages                              │
│  ├── Integrações ────────────► /admin/integracoes                           │
│  ├── Webhooks ───────────────► /admin/webhooks                              │
│  ├── Logs Técnicos ──────────► /admin/logs                                  │
│  ├── Permissões ─────────────► /admin/permissions                           │
│  ├── Notificações ───────────► /admin/notificacoes                          │
│  └── Configurações ──────────► /admin/settings                              │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  🏢 [NOME DA ORG] (quando selecionada via Context Switch)                   │
│  ├── Dashboard ──────────────► /integracoes/dashboard                       │
│  ├── Canais ─────────────────► /integracoes                                 │
│  ├── Conversas ──────────────► /conversas                                   │
│  ├── Contatos ───────────────► /contatos                                    │
│  ├── Equipe ─────────────────► /integracoes/users                           │
│  ├── Webhooks ───────────────► /configuracoes/webhooks                      │
│  ├── Ferramentas ────────────► /ferramentas                                 │
│  └── Configurações ──────────► /integracoes/settings                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Jornadas End-to-End

### 2.1 🔐 Jornada: Autenticação do Admin

> **IMPORTANTE**: O sistema NÃO usa login com senha tradicional.
> Métodos de autenticação disponíveis:
> 1. **Magic Link (OTP)** - Código enviado por email
> 2. **Google OAuth** - Login social
> 3. **Passkey (WebAuthn)** - Autenticação biométrica

```
┌──────────────────────────────────────────────────────────────────┐
│                    FLUXO DE AUTENTICAÇÃO                         │
└──────────────────────────────────────────────────────────────────┘

[Usuário] ──► /login
              │
              ├──► 📧 MAGIC LINK (Principal)
              │    ├──► 1. Digita email
              │    ├──► 2. Clica "Continuar com Email"
              │    ├──► 3. API: POST /auth/loginOTP
              │    ├──► 4. Recebe código de 6 dígitos no email
              │    ├──► 5. Redireciona para /login/verify?email=...
              │    ├──► 6. Digita código OTP
              │    ├──► 7. API: POST /auth/verifyOTP
              │    └──► 8. ✅ Sucesso ──► /admin (se role=admin)
              │
              ├──► 🔵 GOOGLE OAuth
              │    ├──► 1. Clica "Continuar com Google"
              │    ├──► 2. API: GET /auth/google
              │    ├──► 3. Redireciona para accounts.google.com
              │    ├──► 4. Autoriza acesso
              │    ├──► 5. Callback: /google-callback
              │    └──► 6. ✅ Sucesso ──► /admin
              │
              └──► 🔑 PASSKEY (WebAuthn)
                   ├──► 1. Clica "Entrar com Passkey"
                   ├──► 2. API: POST /auth/passkey/authenticate/start
                   ├──► 3. Browser exibe prompt de autenticação
                   ├──► 4. Biometria (Face/Touch ID) ou PIN
                   ├──► 5. API: POST /auth/passkey/authenticate/finish
                   └──► 6. ✅ Sucesso ──► /admin
```

**Status**: ✅ Funcional
**Canais**: Apenas navegador web (desktop/mobile)

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | 2FA obrigatório para admins (TOTP) | 🟡 Médio | 3h |
| 2 | Audit log de tentativas de login | 🟡 Médio | 2h |
| 3 | Bloqueio após N tentativas falhas | 🟡 Médio | 2h |
| 4 | Notificação de login em novo dispositivo | 🟢 Baixo | 2h |

---

### 2.2 📊 Jornada: Monitoramento do Sistema

```
┌──────────────────────────────────────────────────────────────────┐
│              FLUXO DE MONITORAMENTO                              │
└──────────────────────────────────────────────────────────────────┘

[Admin] ──► /admin (Dashboard)
            │
            ├──► 📈 Métricas Gerais
            │    ├── Total de organizações ativas
            │    ├── Total de usuários
            │    ├── Total de mensagens (período)
            │    ├── Instâncias conectadas vs desconectadas
            │    └── ⚠️ Dados buscados SEM cache
            │
            ├──► /admin/logs (Logs Técnicos)
            │    │
            │    ├──► Filtros disponíveis:
            │    │    ├── Nível: error, warn, info, debug
            │    │    ├── Source: api, webhook, auth, etc.
            │    │    ├── Período: últimas 24h, 7d, 30d, custom
            │    │    └── Busca por texto
            │    │
            │    ├──► Funcionalidades:
            │    │    ├── Lista paginada de logs
            │    │    ├── Stream em tempo real (SSE) ✅
            │    │    ├── Análise com IA (OpenAI) ✅
            │    │    └── Export (não implementado)
            │    │
            │    └──► ✅ CORRIGIDO: APIs carregam em PARALELO
            │         Promise.all([loadLogs(), loadStats(), loadSources()])
            │
            └──► /api/health (Health Check)
                 ├── Database: PostgreSQL status
                 ├── Store: Redis status + latência
                 ├── Jobs: BullMQ workers
                 └── Circuit Breakers: estado atual
```

**Status**: ✅ Funcional (logs paralelos corrigido 2025-12-21)

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço | Status |
|---|----------|------------|---------|--------|
| 1 | ~~Paralizar carregamento de logs~~ | ~~🔴 Crítico~~ | ~~30min~~ | ✅ FEITO |
| 2 | ~~Adicionar cache ao dashboard (60s TTL)~~ | ~~🟠 Alto~~ | ~~1h~~ | ✅ FEITO 2025-12-21 |
| 3 | Alertas automáticos (email/push) | 🟡 Médio | 4h | Pendente |
| 4 | Export de logs (CSV/JSON) | 🟢 Baixo | 2h | Pendente |
| 5 | Métricas em tempo real (WebSocket) | 🟢 Baixo | 4h | Pendente |

---

### 2.3 🏢 Jornada: Gestão de Organizações

```
┌──────────────────────────────────────────────────────────────────┐
│              FLUXO DE GESTÃO DE ORGANIZAÇÕES                     │
└──────────────────────────────────────────────────────────────────┘

[Admin] ──► /admin/organizations
            │
            ├──► 📋 Listar Organizações
            │    ├── Tabela com: nome, documento, status, instâncias
            │    ├── Buscar por nome/documento
            │    ├── Filtrar por status (ativa/inativa)
            │    └── Ordenar por nome, data de criação
            │
            ├──► ➕ [Nova Organização]
            │    │
            │    ├──► Dialog de criação:
            │    │    ├── Nome da organização *
            │    │    ├── Documento (CPF/CNPJ) *
            │    │    ├── Tipo (PF/PJ)
            │    │    ├── Limite de instâncias
            │    │    ├── Horário de funcionamento
            │    │    ├── Timezone
            │    │    └── [Opcional] Criar usuário admin
            │    │         ├── Nome
            │    │         ├── Email
            │    │         └── ✅ Email de boas-vindas é enviado automaticamente
            │    │
            │    └──► API: POST /organizations
            │
            ├──► ✏️ [Editar] organização
            │    ├── Alterar dados básicos
            │    ├── Alterar limites
            │    └── API: PUT /organizations/:id
            │
            ├──► 🔄 [Ativar/Desativar]
            │    └── Toggle isActive
            │
            └──► 👁️ [Entrar no Contexto]
                 ├── Clica na organização
                 ├── Admin passa a ver como se fosse owner
                 └── Sidebar exibe menu da organização
```

**Status**: ✅ Funcional (email de boas-vindas implementado)

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço | Status |
|---|----------|------------|---------|--------|
| 1 | ~~Enviar email com credenciais ao criar org+admin~~ | ~~🟠 Alto~~ | ~~2h~~ | ✅ FEITO |
| 2 | Histórico de alterações da organização | 🟡 Médio | 3h | Pendente |
| 3 | Métricas de uso por organização | 🟡 Médio | 2h | Pendente |
| 4 | Clone de organização (template) | 🟢 Baixo | 3h | Pendente |

---

### 2.4 📱 Jornada: Gestão de Instâncias WhatsApp (Global)

> **Contexto**: Uma "Instância" é uma conexão com WhatsApp via UAZapi.
> Cada instância representa um número de telefone conectado.
> Canal atual: WhatsApp apenas (futuro: Instagram, Telegram).

```
┌──────────────────────────────────────────────────────────────────┐
│              FLUXO DE GESTÃO DE INSTÂNCIAS                       │
└──────────────────────────────────────────────────────────────────┘

[Admin] ──► /admin/integracoes
            │
            ├──► 📋 Listar TODAS instâncias
            │    │
            │    ├── 🟢 Conectadas (status: connected)
            │    │    └── WhatsApp ativo, recebendo mensagens
            │    │
            │    ├── 🔴 Desconectadas (status: disconnected)
            │    │    └── Precisa escanear QR code novamente
            │    │
            │    ├── 🟡 Sem organização (órfãs)
            │    │    └── Instâncias não atribuídas
            │    │
            │    └── Colunas: nome, número, status, organização, mensagens
            │
            ├──► 🏢 [Atribuir Organização]
            │    ├── Seleciona instância órfã
            │    ├── Abre modal de atribuição
            │    ├── Seleciona organização destino
            │    └── API: PUT /instances/:id/assign
            │
            ├──► 🔌 [Desconectar]
            │    ├── Desconecta do WhatsApp
            │    └── Status muda para disconnected
            │
            └──► 🗑️ [Deletar]
                 ├── Confirmação de segurança
                 ├── Remove da UAZapi
                 └── Remove do banco de dados
```

**Status**: ✅ Funcional
**Cache**: ✅ 30 segundos (instances.controller)

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | Bulk actions (atribuir várias de uma vez) | 🟡 Médio | 2h |
| 2 | Export lista de instâncias (CSV) | 🟢 Baixo | 1h |
| 3 | Alertas quando instância desconecta | 🟡 Médio | 2h |
| 4 | Histórico de conexões/desconexões | 🟢 Baixo | 2h |

---

### 2.4.1 📥 Sub-Jornada: Importação e Atribuição de Instâncias

> **Contexto**: Admin pode importar instâncias do UAZapi para o Quayer
> e atribuí-las a organizações específicas.
>
> **Isolamento Multi-Tenant**: ✅ Verificado e Funcional

```
┌──────────────────────────────────────────────────────────────────┐
│          FLUXO DE IMPORTAÇÃO DE INSTÂNCIAS                       │
└──────────────────────────────────────────────────────────────────┘

[Admin] ──► /admin/integracoes
            │
            ├──► 📋 Ver Instâncias do UAZapi
            │    ├── Lista todas instâncias na conta UAZapi
            │    ├── Mostra: nome, número, status conexão
            │    └── Indica se já foi importada para Quayer
            │
            ├──► 📥 [Importar]
            │    │
            │    ├──► Validações:
            │    │    ├── ✅ Apenas admin pode importar
            │    │    ├── ✅ Verifica se já foi importada
            │    │    └── ✅ Valida token UAZapi
            │    │
            │    ├──► Cria registro Connection:
            │    │    ├── name: nome da instância
            │    │    ├── provider: WHATSAPP_WEB
            │    │    ├── uazapiInstanceId: ID original
            │    │    ├── organizationId: NULL (órfã)
            │    │    └── status: DISCONNECTED
            │    │
            │    └──► Resultado: Instância aparece como "Sem organização"
            │
            ├──► 🏢 [Atribuir Organização]
            │    │
            │    ├──► Abre modal de atribuição
            │    │    ├── Lista organizações disponíveis
            │    │    ├── Mostra limite de instâncias por org
            │    │    └── Indica quantas já estão em uso
            │    │
            │    ├──► Validações:
            │    │    ├── ✅ Verifica limite da organização
            │    │    └── ✅ Apenas admin pode atribuir
            │    │
            │    └──► API: PUT /instances/:id/assign
            │         └── Atualiza organizationId
            │
            └──► 🔓 [Desatribuir]
                 ├── Remove organizationId (volta a NULL)
                 └── Instância fica "órfã" novamente
```

**Verificação de Isolamento Multi-Tenant**:

```
┌──────────────────────────────────────────────────────────────────┐
│          MATRIZ DE ISOLAMENTO POR OPERAÇÃO                       │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────────┬──────────────────────┬──────────────────────┐
│     OPERAÇÃO        │   USUÁRIO NORMAL     │       ADMIN          │
├─────────────────────┼──────────────────────┼──────────────────────┤
│ Criar Instância     │ ✅ Só na própria org │ ✅ Qualquer/nenhuma  │
│ Listar Instâncias   │ ✅ Só da própria org │ ✅ Todas (global)    │
│ Ver Detalhes        │ ✅ Só da própria org │ ✅ Todas             │
│ Atualizar           │ ✅ Só da própria org │ ✅ Todas             │
│ Conectar/Desconectar│ ✅ Só da própria org │ ✅ Todas             │
│ Deletar             │ ✅ Só da própria org │ ✅ Todas             │
│ Importar do UAZapi  │ ❌ Bloqueado         │ ✅ Apenas admin      │
│ Atribuir Organização│ ❌ Bloqueado         │ ✅ Apenas admin      │
└─────────────────────┴──────────────────────┴──────────────────────┘
```

**Mecanismo de Segurança** (`instances.controller.ts`):

```typescript
// Função chamada em TODAS operações de instância
function checkOrganizationPermission(
  instanceOrganizationId: string | null,
  userOrganizationId?: string,
  userRole?: string
): boolean {
  // Admin tem acesso total
  if (userRole === 'admin') return true;

  // Usuário normal precisa ter organizationId
  if (!userOrganizationId) return false;

  // Instâncias órfãs (NULL) são inacessíveis para usuários normais
  if (!instanceOrganizationId) return false;

  // Verifica se pertence à organização do usuário
  return instanceOrganizationId === userOrganizationId;
}
```

**Status**: ✅ **CORRIGIDO** - Security fix implementado em 2025-12-21

---

### ✅ BUG CORRIGIDO: Vazamento de Instâncias para Usuários sem Org

**Arquivo**: `instances.controller.ts:256-259`
**Severidade**: Era 🔴 CRÍTICA - Vazamento de dados multi-tenant
**Descoberto em**: 2025-12-21
**Corrigido em**: 2025-12-21

**Código CORRIGIDO** (já implementado):
```typescript
// instances.controller.ts:256-259
// 🔒 SECURITY FIX: Bloquear usuários sem organização (previne vazamento de dados)
if (!isAdmin && !user?.currentOrgId) {
  return response.forbidden('Usuário não possui organização associada. Complete o onboarding primeiro.');
}

// Business Rule: Admin vê todas instâncias (sem filtro de organização)
// Business Rule: Usuário normal vê apenas instâncias da sua organização
const organizationId = isAdmin ? undefined : user?.currentOrgId;
```

**Resultado**: Usuários sem organização recebem erro 403 Forbidden, impedindo vazamento de dados.

---

**Fluxo de Dados (cenário correto, COM currentOrgId)**:
```
Usuário Normal COM organização
├── role = 'user'
├── currentOrgId = 'org-123'
│
├── GET /instances/
│   └── WHERE: organizationId = 'org-123' ✅
│
├── GET /instances/abc-456 (de outra org)
│   └── 403 Forbidden ✅
│
└── POST /instances/abc-456/import
    └── 403 Forbidden ✅ (apenas admin)
```

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | Histórico de atribuições (quem atribuiu, quando) | 🟡 Médio | 2h |
| 2 | Notificação para org ao receber instância | 🟢 Baixo | 1h |
| 3 | Preview de limite antes de atribuir | 🟢 Baixo | 30min |

---

### 2.5 🔔 Jornada: Gestão de Webhooks (Global)

> **Contexto**: Webhooks permitem integrar Quayer com sistemas externos.
> Podem ser configurados:
> - **Por Organização**: Recebe eventos de toda a org
> - **Por Instância**: Recebe eventos de uma instância específica
>
> **Canais suportados**: WhatsApp (único canal ativo atualmente)

```
┌──────────────────────────────────────────────────────────────────┐
│              FLUXO DE GESTÃO DE WEBHOOKS                         │
└──────────────────────────────────────────────────────────────────┘

[Admin] ──► /admin/webhooks
            │
            ├──► 📋 Listar webhooks
            │    ├── Filtrar por organização
            │    ├── Filtrar por status (ativo/inativo)
            │    ├── Ver taxa de sucesso de delivery
            │    └── Ver últimos eventos enviados
            │
            ├──► 📊 Eventos Disponíveis (por canal)
            │    │
            │    ├──► WHATSAPP (Canal ativo):
            │    │    ├── instance.created     - Nova instância criada
            │    │    ├── instance.updated     - Instância atualizada
            │    │    ├── instance.deleted     - Instância removida
            │    │    ├── instance.connected   - WhatsApp conectou
            │    │    ├── instance.disconnected - WhatsApp desconectou
            │    │    ├── message.received     - Mensagem recebida
            │    │    └── message.sent         - Mensagem enviada
            │    │
            │    └──► ORGANIZAÇÃO:
            │         ├── organization.updated - Org atualizada
            │         ├── user.invited         - Usuário convidado
            │         ├── user.joined          - Usuário entrou
            │         └── user.removed         - Usuário removido
            │
            ├──► ⚙️ Configurações do Webhook
            │    ├── URL de destino
            │    ├── Secret (HMAC para assinatura)
            │    ├── Eventos selecionados
            │    ├── Filtros de mensagem (text, image, audio, etc.)
            │    ├── Max retries (0-10)
            │    ├── Retry delay (1-60 segundos)
            │    └── Timeout (5-120 segundos)
            │
            └──► ✅ CORRIGIDO: Menu de ações FUNCIONA!
                 ├── "Ver Detalhes"     ──► ✅ Abre dialog com informações
                 ├── "Testar Webhook"   ──► ✅ Chama API e mostra resultado
                 ├── "Ativar/Desativar" ──► ✅ Toggle funcionando
                 └── "Excluir"          ──► ✅ Com confirmação
```

**Status**: ✅ Funcional - Todas ações do dropdown implementadas (2025-12-21)

**Backend disponível**:
- `GET /webhooks/:id` - Ver detalhes ✅
- `PUT /webhooks/:id` - Editar ✅
- `DELETE /webhooks/:id` - Excluir ✅
- `POST /webhooks/:id/test` - Testar ✅ EXISTE E FUNCIONA

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço | Status |
|---|----------|------------|---------|--------|
| 1 | ~~Implementar ações do dropdown~~ | ~~🔴 Crítico~~ | ~~2h~~ | ✅ FEITO |
| 2 | ~~Criar endpoint POST /webhooks/:id/test~~ | ~~🟠 Alto~~ | ~~1h~~ | ✅ FEITO |
| 3 | Dashboard de deliveries com gráfico | 🟡 Médio | 2h | Pendente |
| 4 | Alertas de falha de webhook | 🟡 Médio | 2h | Pendente |

---

### 2.6 🛡️ Jornada: Gestão de Permissões (RBAC)

```
┌──────────────────────────────────────────────────────────────────┐
│              FLUXO DE GESTÃO DE PERMISSÕES                       │
└──────────────────────────────────────────────────────────────────┘

[Admin] ──► /admin/permissions
            │
            ├──► 📋 Matriz de Permissões
            │    │
            │    ├── Linhas (Recursos):
            │    │    ├── contacts    - Gerenciar contatos
            │    │    ├── messages    - Enviar/ver mensagens
            │    │    ├── sessions    - Gerenciar atendimentos
            │    │    ├── instances   - Gerenciar instâncias
            │    │    ├── webhooks    - Configurar webhooks
            │    │    ├── team        - Gerenciar equipe
            │    │    └── settings    - Configurações
            │    │
            │    └── Colunas (Roles na Organização):
            │         ├── master   - Dono da organização
            │         ├── manager  - Gerente
            │         └── user     - Atendente
            │
            ├──► ✏️ [Editar Permissão]
            │    ├── Clica no checkbox
            │    ├── API: PUT /permissions
            │    └── ✅ Atualizado em tempo real
            │
            └──► 🔄 [Restaurar Padrão]
                 └── Reseta para permissões default
```

**Status**: ✅ Funcional

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | Permissões customizadas por organização | 🟡 Médio | 4h |
| 2 | Presets de permissões (templates) | 🟢 Baixo | 2h |
| 3 | Histórico de alterações de permissão | 🟢 Baixo | 2h |

---

### 2.7 ⚙️ Jornada: Configurações do Sistema

```
┌──────────────────────────────────────────────────────────────────┐
│              FLUXO DE CONFIGURAÇÕES                              │
└──────────────────────────────────────────────────────────────────┘

[Admin] ──► /admin/settings
            │
            ├──► Tab: UAZapi (Provedor WhatsApp)
            │    ├── URL da API
            │    ├── Token de autenticação
            │    └── Configurações padrão de instância
            │
            ├──► Tab: Webhook Global
            │    ├── URL de fallback
            │    ├── Secret padrão
            │    └── Eventos habilitados globalmente
            │
            ├──► Tab: Email (SMTP)
            │    ├── Host, porta, TLS
            │    ├── Usuário e senha
            │    ├── Endereço de envio (from)
            │    └── Templates de email
            │
            ├──► Tab: IA (OpenAI)
            │    ├── API Key
            │    ├── Modelo padrão (gpt-4, gpt-3.5-turbo)
            │    └── Parâmetros (temperature, max_tokens)
            │
            ├──► Tab: Concatenação de Mensagens
            │    ├── Tempo de espera entre mensagens
            │    └── Regras de agrupamento
            │
            ├──► Tab: OAuth
            │    ├── Google Client ID e Secret
            │    └── Callback URLs
            │
            ├──► Tab: Segurança
            │    ├── Políticas de sessão
            │    ├── Rate limiting
            │    └── IPs permitidos
            │
            └──► Tab: Sistema
                 ├── Versão atual
                 ├── Uso de recursos
                 └── Status dos serviços
```

**Status**: ✅ Funcional

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | Botão "Testar" para validar SMTP | 🟡 Médio | 1h |
| 2 | Botão "Testar" para validar OpenAI | 🟡 Médio | 1h |
| 3 | Backup/restore de configurações | 🟢 Baixo | 3h |
| 4 | Histórico de alterações | 🟢 Baixo | 2h |

---

### 2.8 👁️ Jornada: Context Switch (Admin como Organização)

```
┌──────────────────────────────────────────────────────────────────┐
│              FLUXO DE CONTEXT SWITCH                             │
└──────────────────────────────────────────────────────────────────┘

[Admin] ──► Menu do usuário (footer sidebar)
            │
            ├──► "Contexto Administrativo"
            │    ├── Lista todas organizações
            │    ├── Busca por nome
            │    └── Clica para selecionar
            │
            └──► Após selecionar:
                 │
                 ├── Sidebar atualiza mostrando nome da org
                 │
                 ├── Menu de organização aparece:
                 │    ├── Dashboard (métricas da org)
                 │    ├── Canais (instâncias da org)
                 │    ├── Conversas (atendimentos)
                 │    ├── Contatos (CRM da org)
                 │    ├── Equipe (usuários da org)
                 │    ├── Webhooks (da org)
                 │    ├── Ferramentas (Chatwoot, etc.)
                 │    └── Configurações (da org)
                 │
                 └── Admin pode executar TODAS ações
                     como se fosse o owner da org
```

**Status**: ✅ Funcional

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço | Status |
|---|----------|------------|---------|--------|
| 1 | Indicador visual mais claro (badge no header) | 🟡 Médio | 1h | Pendente |
| 2 | Botão rápido "Sair do contexto" | 🟢 Baixo | 30min | Pendente |
| 3 | ~~Log de auditoria de ações em contexto~~ | ~~🟠 Alto~~ | ~~3h~~ | ✅ FEITO 2025-12-21 |

---

## 3. Fluxos Secundários

### 3.1 Gestão de Clientes (Usuários)
**Caminho**: `/admin/clients`
**Status**: ✅ Funcional
- Listar todos usuários do sistema
- Filtrar por role, status, organização
- Editar informações do usuário
- Desativar/reativar usuário

### 3.2 Gestão de Mensagens
**Caminho**: `/admin/messages`
**Status**: ✅ Funcional
- Listar todas mensagens do sistema
- Filtrar por organização, instância, período
- Ver conteúdo e status de entrega

### 3.3 Notificações Broadcast
**Caminho**: `/admin/notificacoes`
**Status**: ✅ Funcional
- Criar notificação para todos usuários
- Listar notificações enviadas
- Ver estatísticas de leitura

### 3.4 Convites
**Caminho**: `/admin/invitations`
**Status**: ✅ Funcional
- Listar convites pendentes/expirados
- Reenviar convite
- Cancelar convite

---

## 4. Resumo de Status por Jornada

| # | Jornada | Status | Problemas |
|---|---------|--------|-----------|
| 1 | Autenticação | ✅ | Nenhum crítico |
| 2 | Monitoramento | ✅ | ~~Logs sequenciais~~ **CORRIGIDO** + Cache implementado |
| 3 | Organizações | ✅ | ~~Email não enviado~~ **CORRIGIDO** + Audit log |
| 4 | Instâncias (Gestão) | ✅ | Audit log implementado |
| 4.1 | Instâncias (Importação) | ✅ | ~~BUG Vazamento~~ **CORRIGIDO** em 2025-12-21 |
| 5 | Webhooks | ✅ | ~~Dropdown quebrado~~ **CORRIGIDO** - Todas ações funcionam |
| 6 | Permissões | ✅ | - |
| 7 | Configurações | ✅ | - |
| 8 | Context Switch | ✅ | Indicador visual + Audit log implementado |

> **Atualização 2025-12-21**: Cache, Email e Audit Log implementados

---

## 5. APIs Utilizadas

| Jornada | Endpoints Principais | Controller |
|---------|---------------------|------------|
| Auth | POST /auth/loginOTP, POST /auth/verifyOTP | auth.controller |
| Orgs | GET/POST/PUT /organizations | organizations.controller |
| Instances | GET/PUT/DELETE /instances | instances.controller |
| Import | PUT /instances/:id/assign, Server Action | admin/actions.ts |
| Webhooks | GET/POST/PUT/DELETE /webhooks | webhooks.controller |
| Logs | GET /logs, GET /logs/stream | logs.controller |
| Permissions | GET/PUT /permissions | permissions.controller |
| Settings | GET/PUT /system-settings | system-settings.controller |

---

## 6. Próximos Passos Priorizados

### ✅ Sprint 1 - Quick Wins (CONCLUIDO 2025-12-21)
- [x] ~~Paralizar carregamento de logs (30min)~~ ✅ FEITO
- [x] ~~Adicionar cache ao dashboard (1h)~~ ✅ FEITO 2025-12-21
- [x] ~~Implementar dropdown de webhooks (2h)~~ ✅ FEITO

### ✅ Sprint 2 - Core (CONCLUIDO 2025-12-21)
- [x] ~~Criar endpoint POST /webhooks/:id/test (1h)~~ ✅ FEITO
- [x] ~~Implementar envio de email ao criar org (2h)~~ ✅ JÁ EXISTIA (sendOrganizationWelcomeEmail)
- [x] ~~Adicionar indicador de context switch (1h)~~ ✅ FEITO

### ✅ Sprint 3 - Compliance (CONCLUIDO 2025-12-21)
- [x] ~~Implementar audit log completo (4h)~~ ✅ FEITO - Expandido para orgs, instances, members
- [ ] 2FA obrigatório para admins (3h) - PENDENTE

---

## 7. Tendências SaaS Admin 2025 e Oportunidades de IA

> **Fonte**: Pesquisa de mercado SaaS 2025
> **Objetivo**: Identificar oportunidades futuras alinhadas com tendências do mercado

### 7.1 Tendências Globais de Dashboards Admin

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TENDÊNCIAS SAAS ADMIN 2025                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  📊 DASHBOARDS INTELIGENTES                                                 │
│  ├── 70% dos líderes SaaS veem IA como diferencial competitivo              │
│  ├── 31% dos usuários querem insights automáticos via IA                    │
│  ├── 58% pagariam mais por dashboards que ajudam na decisão                 │
│  └── 10% pagariam até 60% a mais por melhores insights                      │
│                                                                             │
│  🤖 AGENTIC AI (Tendência #1)                                               │
│  ├── Agentes que planejam e executam tarefas autonomamente                  │
│  ├── Gartner: 33% das apps terão Agentic AI até 2028                        │
│  ├── 15% das decisões diárias serão tomadas automaticamente                 │
│  └── Mudança de GUI → Conversação (Q&A)                                     │
│                                                                             │
│  🎯 MICRO-PERSONALIZAÇÃO                                                    │
│  ├── Dashboards que se adaptam ao comportamento do usuário                  │
│  ├── Recomendações contextuais em tempo real                                │
│  ├── Workflows customizados automaticamente                                 │
│  └── Onboarding personalizado por perfil                                    │
│                                                                             │
│  💬 INTERFACES CONVERSACIONAIS                                              │
│  ├── GPT-based support bots                                                 │
│  ├── AI Copilots em dashboards                                              │
│  ├── Voice-to-workflow tools                                                │
│  └── Natural language queries                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 O Que Já Temos vs. O Que Podemos Implementar

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ANÁLISE: QUAYER vs TENDÊNCIAS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ✅ JÁ IMPLEMENTADO                                                         │
│  ├── Análise de Logs com IA (OpenAI)                                        │
│  │   └── Admin pode analisar logs e receber explicações                     │
│  ├── Streaming em tempo real (SSE)                                          │
│  │   └── Logs aparecem em real-time                                         │
│  └── Dashboard com métricas                                                 │
│      └── Visão geral de orgs, users, mensagens                              │
│                                                                             │
│  🟡 PARCIALMENTE IMPLEMENTADO                                               │
│  ├── Cache com Redis                                                        │
│  │   └── Existe mas não usado em dashboard admin                            │
│  └── Background Jobs (BullMQ)                                               │
│      └── Estrutura existe, pode ser expandida                               │
│                                                                             │
│  ❌ NÃO IMPLEMENTADO (Oportunidades)                                        │
│  ├── AI Copilot no dashboard                                                │
│  ├── Alertas inteligentes preditivos                                        │
│  ├── Recomendações automáticas                                              │
│  ├── Dashboard adaptativo                                                   │
│  ├── Interface conversacional                                               │
│  └── Automações baseadas em regras                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Oportunidades Futuras de IA para Admin

#### 🤖 Nível 1: AI Assistente (Quick Wins)

| # | Funcionalidade | Descrição | Complexidade | Impacto |
|---|----------------|-----------|--------------|---------|
| 1 | **AI Log Analyzer Expandido** | Além de analisar, sugerir ações corretivas | Baixa | Alto |
| 2 | **Smart Alerts** | IA detecta padrões anômalos e alerta antes do problema | Média | Alto |
| 3 | **Auto-Summarize Dashboard** | Resumo diário do sistema em linguagem natural | Baixa | Médio |
| 4 | **Query em Linguagem Natural** | "Mostre orgs que tiveram mais de 1000 msgs ontem" | Média | Alto |

**Exemplo de Smart Alert:**
```
⚠️ ALERTA PREDITIVO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A organização "Empresa XYZ" teve 47% mais
desconexões de instância nas últimas 24h.

📊 Padrão detectado: Possível problema de
   rede ou limite de sessões atingido.

💡 Ação sugerida:
   • Verificar logs da instância
   • Contactar cliente proativamente

[Ver Detalhes] [Ignorar] [Contactar Cliente]
```

#### 🧠 Nível 2: AI Copilot (Médio Prazo)

| # | Funcionalidade | Descrição | Complexidade | Impacto |
|---|----------------|-----------|--------------|---------|
| 1 | **Admin Copilot** | Chat IA para realizar ações no sistema | Alta | Muito Alto |
| 2 | **Onboarding Assistido** | IA guia novos admins pelas funcionalidades | Média | Alto |
| 3 | **Troubleshooting Guiado** | IA diagnostica problemas e sugere soluções | Alta | Muito Alto |
| 4 | **Report Generator** | Gera relatórios executivos automaticamente | Média | Alto |

**Exemplo de Admin Copilot:**
```
┌─────────────────────────────────────────────────────────────────┐
│  🤖 QUAYER COPILOT                                      [━] [×] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Admin: "Lista todas organizações que não enviaram mensagens    │
│          nos últimos 7 dias"                                    │
│                                                                 │
│  Copilot: Encontrei 12 organizações inativas:                   │
│                                                                 │
│  1. Empresa Alpha (última msg: 15 dias)                         │
│  2. Beta Corp (última msg: 10 dias)                             │
│  3. Gamma LTDA (última msg: 8 dias)                             │
│  ... e mais 9                                                   │
│                                                                 │
│  💡 Deseja que eu envie uma notificação de reengajamento?       │
│                                                                 │
│  [Sim, enviar] [Ver lista completa] [Ignorar]                   │
│                                                                 │
│  ────────────────────────────────────────────────────────────   │
│  │ Digite sua pergunta ou comando...                       📤 │ │
│  ────────────────────────────────────────────────────────────   │
└─────────────────────────────────────────────────────────────────┘
```

#### 🚀 Nível 3: Agentic AI (Longo Prazo)

| # | Funcionalidade | Descrição | Complexidade | Impacto |
|---|----------------|-----------|--------------|---------|
| 1 | **Auto-Remediation** | Sistema corrige problemas automaticamente | Muito Alta | Muito Alto |
| 2 | **Predictive Scaling** | Ajusta recursos antes de picos de uso | Alta | Alto |
| 3 | **Smart Routing** | Direciona atendimentos para melhor equipe | Alta | Alto |
| 4 | **Churn Prediction** | Detecta clientes em risco de cancelamento | Alta | Muito Alto |

**Exemplo de Auto-Remediation:**
```
┌─────────────────────────────────────────────────────────────────┐
│  🤖 AUTO-REMEDIATION LOG                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  10:45:23  ⚠️ Detectado: Instância "WhatsApp Vendas" offline    │
│  10:45:24  🔍 Diagnóstico: Timeout de conexão com UAZapi        │
│  10:45:25  🔄 Ação: Tentando reconexão automática...            │
│  10:45:28  ✅ Sucesso: Instância reconectada                    │
│  10:45:29  📧 Notificação enviada ao admin                      │
│                                                                 │
│  Tempo de indisponibilidade: 6 segundos                         │
│  Intervenção humana: Não necessária                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.4 Roadmap de Implementação de IA

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ROADMAP DE IA - ADMIN                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Q1 2025 ─────────────────────────────────────────────────────────────────  │
│  │                                                                          │
│  ├── [1] 📊 Dashboard com resumo IA                                         │
│  │       • Card "Resumo do dia" gerado por OpenAI                           │
│  │       • Uso: API existente + prompt engineering                          │
│  │       • Esforço: 4h                                                      │
│  │                                                                          │
│  ├── [2] 🔔 Smart Alerts básicos                                            │
│  │       • Detectar instâncias desconectando frequentemente                 │
│  │       • Uso: Cron job + análise de padrões                               │
│  │       • Esforço: 8h                                                      │
│  │                                                                          │
│  └── [3] 💬 Query natural nos logs                                          │
│          • "Mostre erros de autenticação de hoje"                           │
│          • Uso: OpenAI function calling                                     │
│          • Esforço: 6h                                                      │
│                                                                             │
│  Q2 2025 ─────────────────────────────────────────────────────────────────  │
│  │                                                                          │
│  ├── [4] 🤖 Admin Copilot v1                                                │
│  │       • Chat para consultas e ações simples                              │
│  │       • Integração com APIs existentes                                   │
│  │       • Esforço: 3 semanas                                               │
│  │                                                                          │
│  └── [5] 📈 Predictive Analytics                                            │
│          • Previsão de uso por organização                                  │
│          • Alertas de capacidade                                            │
│          • Esforço: 2 semanas                                               │
│                                                                             │
│  Q3 2025 ─────────────────────────────────────────────────────────────────  │
│  │                                                                          │
│  ├── [6] 🔧 Auto-Remediation v1                                             │
│  │       • Reconexão automática de instâncias                               │
│  │       • Restart de workers travados                                      │
│  │       • Esforço: 4 semanas                                               │
│  │                                                                          │
│  └── [7] 🎯 Churn Prediction                                                │
│          • Score de saúde do cliente                                        │
│          • Alertas proativos de risco                                       │
│          • Esforço: 3 semanas                                               │
│                                                                             │
│  Q4 2025 ─────────────────────────────────────────────────────────────────  │
│  │                                                                          │
│  └── [8] 🧠 Admin Copilot v2 (Agentic)                                      │
│          • Execução autônoma de tarefas                                     │
│          • Aprovação humana para ações críticas                             │
│          • Esforço: 6 semanas                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.5 Métricas de Sucesso para IA

| Métrica | Baseline Atual | Meta Q2 2025 | Meta Q4 2025 |
|---------|----------------|--------------|--------------|
| Tempo médio de resolução de incidentes | Manual | -30% | -60% |
| Incidentes resolvidos automaticamente | 0% | 20% | 50% |
| Uso do Copilot por admins | N/A | 40% | 80% |
| Alertas preditivos corretos | N/A | 70% | 90% |
| NPS de administradores | A medir | +10pts | +20pts |

### 7.6 Stack Técnico Recomendado

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STACK DE IA RECOMENDADO                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  LLM PROVIDER                                                               │
│  ├── OpenAI GPT-4 (já integrado) ──────► Análise e geração                  │
│  ├── Claude API (alternativa) ─────────► Análise complexa                   │
│  └── OpenAI Embeddings ────────────────► Vector search em logs              │
│                                                                             │
│  ORQUESTRAÇÃO                                                               │
│  ├── Vercel AI SDK ────────────────────► Streaming de respostas             │
│  ├── LangChain (se necessário) ────────► Chains complexas                   │
│  └── OpenAI Function Calling ──────────► Execução de ações                  │
│                                                                             │
│  DADOS & ANALYTICS                                                          │
│  ├── Redis (já temos) ─────────────────► Cache de embeddings                │
│  ├── PostgreSQL (já temos) ────────────► Histórico de predições             │
│  └── BullMQ (já temos) ────────────────► Jobs de análise em background      │
│                                                                             │
│  OBSERVABILIDADE                                                            │
│  ├── LangSmith/Helicone ───────────────► Monitorar custos e latência LLM    │
│  └── Custom metrics ───────────────────► Acurácia das predições             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Referências e Fontes

### Tendências SaaS 2025
- [SaaS Trends 2025: AI and Data Revolution](https://revenuegrid.com/blog/saas-trends-2025-ai-data-future/)
- [AI in SaaS: 7 Trends That Will Define 2025](https://www.datacose.com/blog/ai-saas-trends-2025)
- [Major AI SaaS Trends for 2025](https://www.upsilonit.com/blog/how-ai-is-revolutionizing-saas-saas-ai-trends)
- [Dashboard Statistics Every SaaS Should Know](https://www.luzmo.com/blog/dashboard-statistics)
- [Top 10 SaaS Trends for 2025](https://www.mindinventory.com/blog/top-saas-trends/)

### Estatísticas Chave
- 70% dos líderes SaaS veem dashboards com IA como diferencial
- 33% das apps terão Agentic AI até 2028 (Gartner)
- 58% dos usuários pagariam mais por dashboards de decisão
- Mercado AI SaaS projetado para $126 bilhões em 2025

---

## 9. Próximos Passos Priorizados (Consolidado)

### ✅ Imediato - Quick Wins (CONCLUIDO 2025-12-21)
- [x] ~~Paralizar carregamento de logs com Promise.all (30min)~~ ✅
- [x] ~~Adicionar cache ao dashboard admin (1h)~~ ✅ FEITO
- [x] ~~Implementar dropdown de webhooks (2h)~~ ✅

### ✅ Curto Prazo - Core Fixes (CONCLUIDO 2025-12-21)
- [x] ~~Criar endpoint POST /webhooks/:id/test (1h)~~ ✅
- [x] ~~Implementar envio de email ao criar organização (2h)~~ ✅ JÁ EXISTIA
- [x] ~~Adicionar indicador visual de context switch (1h)~~ ✅

### ✅ Médio Prazo - Compliance (PARCIAL 2025-12-21)
- [x] ~~Implementar audit log completo (4h)~~ ✅ FEITO
- [ ] 2FA obrigatório para admins (3h) - PENDENTE

### 🤖 Q1 2025 - IA Quick Wins (18h total)
- [ ] Dashboard com card "Resumo do dia" via IA (4h)
- [ ] Smart Alerts para instâncias problemáticas (8h)
- [ ] Query em linguagem natural nos logs (6h)

### 🧠 Q2 2025 - AI Copilot
- [ ] Admin Copilot v1 - Chat para consultas
- [ ] Predictive Analytics básico

---

*Documento atualizado em: 2025-12-21 (Revisão de bugs e correções)*
*Próxima revisão: Após implementação de itens pendentes*

---

## Historico de Revisoes

| Data | Alteracao |
|------|-----------|
| 2025-12-21 | Revisao completa - Marcados bugs corrigidos: vazamento instancias, logs sequenciais, dropdown webhooks |
| 2025-12-21 | Atualizado status de todas jornadas |
| 2025-12-21 | Documentado security fix em instances.controller.ts |
| 2025-12-21 | **Cache Dashboard Admin** - Implementado cache Redis com TTL 60s em getDashboardStatsAction, getRecentActivityAction, getRecentOrganizationsAction |
| 2025-12-21 | **Email Org+Admin** - Verificado que já existia sendOrganizationWelcomeEmail no organizations.controller.ts |
| 2025-12-21 | **Audit Log Completo** - Expandido para organizations.controller (create, update, delete, addMember, removeMember) e instances.controller (create, disconnect, delete) |
