# Jornada do Administrador do Sistema (Admin)

> **Perfil**: `role: admin` no sistema
> **Acesso**: Total - Painel administrativo + funcionalidades de organização
> **Responsabilidade**: Gerenciar toda a plataforma Quayer
> **Última Atualização**: 2025-12-19

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
            │    └──► ⚠️ PROBLEMA: APIs carregam SEQUENCIALMENTE
            │         loadLogs() → loadStats() → loadSources()
            │         Deveria ser: Promise.all([...])
            │
            └──► /api/health (Health Check)
                 ├── Database: PostgreSQL status
                 ├── Store: Redis status + latência
                 ├── Jobs: BullMQ workers
                 └── Circuit Breakers: estado atual
```

**Status**: ⚠️ Parcial (logs sequenciais, dashboard sem cache)

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | Paralizar carregamento de logs (Promise.all) | 🔴 Crítico | 30min |
| 2 | Adicionar cache ao dashboard (60s TTL) | 🟠 Alto | 1h |
| 3 | Alertas automáticos (email/push) | 🟡 Médio | 4h |
| 4 | Export de logs (CSV/JSON) | 🟢 Baixo | 2h |
| 5 | Métricas em tempo real (WebSocket) | 🟢 Baixo | 4h |

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
            │    │         └── ⚠️ TODO: Email com credenciais não é enviado!
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

**Status**: ⚠️ Parcial (email não enviado ao criar admin)

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | Enviar email com credenciais ao criar org+admin | 🟠 Alto | 2h |
| 2 | Histórico de alterações da organização | 🟡 Médio | 3h |
| 3 | Métricas de uso por organização | 🟡 Médio | 2h |
| 4 | Clone de organização (template) | 🟢 Baixo | 3h |

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
            └──► ❌ PROBLEMA: Menu de ações não funciona!
                 ├── "Ver Detalhes"    ──► ❌ Placeholder
                 ├── "Editar"          ──► ❌ Placeholder
                 ├── "Testar Webhook"  ──► ❌ API não existe
                 ├── "Ativar/Desativar" ──► ❌ Placeholder
                 └── "Excluir"         ──► ❌ Placeholder
```

**Status**: ⚠️ Parcial - Dropdown de ações não implementado

**Backend disponível** (já existe mas frontend não usa):
- `GET /webhooks/:id` - Ver detalhes ✅
- `PUT /webhooks/:id` - Editar ✅
- `DELETE /webhooks/:id` - Excluir ✅
- `POST /webhooks/:id/test` - Testar ❌ NÃO EXISTE

**Oportunidades de Melhoria**:
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | Implementar ações do dropdown | 🔴 Crítico | 2h |
| 2 | Criar endpoint POST /webhooks/:id/test | 🟠 Alto | 1h |
| 3 | Dashboard de deliveries com gráfico | 🟡 Médio | 2h |
| 4 | Alertas de falha de webhook | 🟡 Médio | 2h |

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
| # | Melhoria | Prioridade | Esforço |
|---|----------|------------|---------|
| 1 | Indicador visual mais claro (badge no header) | 🟡 Médio | 1h |
| 2 | Botão rápido "Sair do contexto" | 🟢 Baixo | 30min |
| 3 | Log de auditoria de ações em contexto | 🟠 Alto | 3h |

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
| 2 | Monitoramento | ⚠️ | Logs sequenciais, sem cache |
| 3 | Organizações | ⚠️ | Email não enviado |
| 4 | Instâncias | ✅ | - |
| 5 | Webhooks | ⚠️ | **Dropdown quebrado** |
| 6 | Permissões | ✅ | - |
| 7 | Configurações | ✅ | - |
| 8 | Context Switch | ✅ | - |

---

## 5. APIs Utilizadas

| Jornada | Endpoints Principais | Controller |
|---------|---------------------|------------|
| Auth | POST /auth/loginOTP, POST /auth/verifyOTP | auth.controller |
| Orgs | GET/POST/PUT /organizations | organizations.controller |
| Instances | GET/PUT/DELETE /instances | instances.controller |
| Webhooks | GET/POST/PUT/DELETE /webhooks | webhooks.controller |
| Logs | GET /logs, GET /logs/stream | logs.controller |
| Permissions | GET/PUT /permissions | permissions.controller |
| Settings | GET/PUT /system-settings | system-settings.controller |

---

## 6. Próximos Passos Priorizados

### Sprint 1 - Quick Wins (1 dia)
- [ ] Paralizar carregamento de logs (30min)
- [ ] Adicionar cache ao dashboard (1h)
- [ ] Implementar dropdown de webhooks (2h)

### Sprint 2 - Core (2-3 dias)
- [ ] Criar endpoint POST /webhooks/:id/test (1h)
- [ ] Implementar envio de email ao criar org (2h)
- [ ] Adicionar indicador de context switch (1h)

### Sprint 3 - Compliance (2-3 dias)
- [ ] Implementar audit log completo (4h)
- [ ] 2FA obrigatório para admins (3h)
