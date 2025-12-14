# PRD - Product Requirements Document

## Quayer: Plataforma Omnichannel de Atendimento com IA

**Versão:** 1.0.0
**Data:** Dezembro 2024
**Status:** Em Desenvolvimento
**Autor:** Equipe Quayer

---

## 1. VISÃO EXECUTIVA

### 1.1 Resumo do Produto

**Quayer** é uma plataforma SaaS de atendimento omnichannel que unifica comunicação via WhatsApp, integra agentes de IA e oferece ferramentas avançadas para equipes de vendas e suporte. O sistema permite que empresas gerenciem múltiplas instâncias de WhatsApp, automatizem respostas com IA e monitorem métricas de performance em tempo real.

### 1.2 Proposta de Valor

> "Transforme seu atendimento ao cliente com IA inteligente e automação de mensagens multicanal em uma única plataforma."

**Diferenciais Competitivos:**
- Integração nativa com agentes de IA (OpenAI, Anthropic, Groq)
- Orquestração inteligente de mensagens com concatenação automática
- Multi-tenancy completo com isolamento de dados
- Integração flexível via webhooks e n8n
- Sistema de transcrição automática de áudios
- Real-time via Server-Sent Events (SSE)

### 1.3 Público-Alvo

| Segmento | Perfil | Necessidade Principal |
|----------|--------|----------------------|
| **PMEs** | Empresas com 5-50 atendentes | Centralizar WhatsApp + automatizar respostas |
| **Agências** | Agências de marketing/vendas | Gerenciar múltiplos clientes em única plataforma |
| **E-commerce** | Lojas online | Suporte automatizado + vendas via WhatsApp |
| **SaaS B2B** | Empresas de tecnologia | Suporte técnico escalável com IA |

---

## 2. ARQUITETURA DO SISTEMA

### 2.1 Stack Tecnológico

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  Next.js 15.3.5 (App Router) │ React 19 │ TypeScript 5          │
│  Tailwind CSS 4 │ Shadcn/UI │ Radix UI │ Framer Motion          │
│  TanStack Query │ Zustand │ React Hook Form                      │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│  Igniter.js Framework │ Zod Validation │ JWT Auth               │
│  Feature-based Architecture │ Procedures (Middleware)           │
│  Universal Webhook Controller │ SSE Real-time                   │
└─────────────────────────────────────────────────────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐
│  PostgreSQL │ │    Redis    │ │        BullMQ           │
│   (Prisma)  │ │   (Cache)   │ │   (Background Jobs)     │
└─────────────┘ └─────────────┘ └─────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      INTEGRAÇÕES EXTERNAS                        │
├─────────────────────────────────────────────────────────────────┤
│  UAZapi (WhatsApp) │ OpenAI/Anthropic/Groq (IA)                 │
│  Deepgram/Whisper (Transcrição) │ n8n (Automações)              │
│  Resend/Nodemailer (Email) │ Google OAuth                        │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Modelo Multi-Tenant

```
┌─────────────────────────────────────────────────────────────────┐
│                        SISTEMA QUAYER                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │   Organização A  │  │   Organização B  │  │ Organização C  │ │
│  │  ┌────────────┐  │  │  ┌────────────┐  │  │ ┌────────────┐ │ │
│  │  │ Projeto 1  │  │  │  │ Projeto 1  │  │  │ │ Projeto 1  │ │ │
│  │  │  ├─ Inst.1 │  │  │  │  ├─ Inst.1 │  │  │ │  └─ Inst.1 │ │ │
│  │  │  └─ Inst.2 │  │  │  │  └─ Inst.2 │  │  │ └────────────┘ │ │
│  │  └────────────┘  │  │  └────────────┘  │  │                │ │
│  │  ┌────────────┐  │  │                  │  │                │ │
│  │  │ Projeto 2  │  │  │                  │  │                │ │
│  │  │  └─ Inst.1 │  │  │                  │  │                │ │
│  │  └────────────┘  │  │                  │  │                │ │
│  └──────────────────┘  └──────────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Hierarquia de Entidades:**
1. **Organization** → Tenant principal (empresa cliente)
2. **Project** → Agrupamento lógico de instâncias
3. **Connection** → Instância WhatsApp conectada
4. **ChatSession** → Sessão de atendimento ativa
5. **Message** → Mensagem individual

---

## 3. MODELO DE DADOS

### 3.1 Entidades Principais

#### 3.1.1 Organizações e Usuários

```prisma
Organization {
  id, name, slug, document (CPF/CNPJ), type
  maxInstances, maxUsers, billingType (free/basic/pro)
  businessHoursStart, businessHoursEnd, businessDays, timezone
  sessionTimeoutHours, notificationsEnabled, balancedDistribution
  typingIndicator, profanityFilter, autoGreeting, greetingMessage
}

User {
  id, email, password, name, emailVerified
  currentOrgId, role (admin/user), onboardingCompleted
}

UserOrganization {
  userId, organizationId, role (master/manager/user), isActive
}
```

#### 3.1.2 Conexões e Mensagens

```prisma
Connection {
  id, name, channel (WHATSAPP/INSTAGRAM/TELEGRAM/EMAIL)
  provider (WHATSAPP_WEB/WHATSAPP_CLOUD_API/etc)
  status (CONNECTED/CONNECTING/DISCONNECTED/ERROR)
  phoneNumber, profileName, profilePictureUrl, isBusiness
  uazapiInstanceId, uazapiToken, qrCode, pairingCode
  n8nWebhookUrl, n8nWorkflowId, agentConfig
  organizationId, projectId, shareToken
}

ChatSession {
  id, contactId, connectionId, organizationId
  status (QUEUED/ACTIVE/PAUSED/CLOSED), startedBy
  assignedDepartmentId, assignedAgentId
  aiEnabled, aiBlockedUntil, aiBlockReason
  aiAgentConfigId, aiAgentId, aiAgentName
  customerJourney, journeyStage, leadScore, conversionProbability
  totalMessages, totalAiMessages, avgResponseTime, sessionDuration
  lastMessageAt, expiresAt, pausedUntil
}

Message {
  id, sessionId, contactId, connectionId
  waMessageId, direction (INBOUND/OUTBOUND)
  type (text/image/video/audio/voice/document/etc)
  author (CUSTOMER/AGENT/AI/BUSINESS/SYSTEM)
  content, rawContent, formattedContent
  mediaUrl, mediaType, mimeType, fileName
  transcription, transcriptionStatus
  status (pending/sent/delivered/read/failed)
  aiModel, aiAgentId, inputTokens, outputTokens, totalCost
}
```

#### 3.1.3 Configurações de IA

```prisma
AIAgentConfig {
  id, organizationId, name, isActive
  provider (openai/anthropic/groq), model (gpt-4o/claude-3/etc)
  temperature, maxTokens, systemPrompt, personality
  useMemory, memoryWindow, useRAG, ragCollectionId
  enableTTS, ttsProvider, ttsVoiceId
  totalInputTokens, totalOutputTokens, totalCost
}

IntegrationConfig {
  id, organizationId, type (OPENAI/ANTHROPIC/UAZAPI/etc)
  name, isActive, isDefault
  apiKey, apiSecret, apiUrl, webhookUrl
  rateLimit, rateLimitPeriod, healthStatus
}
```

### 3.2 Diagrama ER Simplificado

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│ Organization │───────│ UserOrganization │───────│     User     │
└──────┬───────┘       └──────────────────┘       └──────────────┘
       │
       ├────────────────┬────────────────┬───────────────────────┐
       ▼                ▼                ▼                       ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐      ┌──────────────┐
│   Project    │ │   Webhook    │ │  Department  │      │  AuditLog    │
└──────┬───────┘ └──────────────┘ └──────────────┘      └──────────────┘
       │
       ▼
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│  Connection  │───────│   ChatSession    │───────│   Contact    │
└──────────────┘       └────────┬─────────┘       └──────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │     Message      │
                       └──────────────────┘
```

---

## 4. FUNCIONALIDADES

### 4.1 Mapa de Features

```
QUAYER PLATFORM
│
├── 🔐 AUTENTICAÇÃO
│   ├── Login (Email/Senha)
│   ├── Login Passwordless (Magic Link + OTP)
│   ├── OAuth Google
│   ├── Cadastro com verificação de email
│   ├── Recuperação de senha
│   └── Refresh Token automático
│
├── 🏢 MULTI-TENANCY
│   ├── Criação de organizações
│   ├── Convites por email
│   ├── Roles: master / manager / user
│   ├── Troca de organização ativa
│   └── Limites por plano (instâncias/usuários)
│
├── 📱 WHATSAPP INTEGRATION
│   ├── Conexão via QR Code
│   ├── Conexão via Pairing Code
│   ├── Status em tempo real (SSE)
│   ├── Desconexão/Reconexão
│   ├── Compartilhamento via link
│   └── Múltiplas instâncias por organização
│
├── 💬 ATENDIMENTO
│   ├── Inbox unificado de conversas
│   ├── Chat em tempo real
│   ├── Histórico de mensagens
│   ├── Suporte a mídia (imagens/vídeos/documentos/áudios)
│   ├── Transcrição automática de áudios
│   ├── Concatenação inteligente de mensagens
│   ├── Status de entrega (sent/delivered/read)
│   └── Sessões com timeout configurável
│
├── 🤖 INTELIGÊNCIA ARTIFICIAL
│   ├── Agentes de IA configuráveis
│   ├── Múltiplos providers (OpenAI/Anthropic/Groq)
│   ├── System prompts customizáveis
│   ├── Bloqueio temporário de IA por sessão
│   ├── Tracking de custos (tokens/dinheiro)
│   ├── Integração n8n para workflows
│   └── TTS (Text-to-Speech) opcional
│
├── 🏷️ ORGANIZAÇÃO
│   ├── Departamentos (Suporte/Vendas/Custom)
│   ├── Labels/Etiquetas
│   ├── Tabulações (categorização de sessões)
│   ├── Atributos customizados de contatos
│   └── Observações em contatos
│
├── 🔔 WEBHOOKS
│   ├── Webhooks por organização/conexão
│   ├── Eventos configuráveis
│   ├── Retry automático com backoff
│   ├── HMAC signature verification
│   ├── Logs de delivery
│   └── Test endpoint
│
├── 📊 ANALYTICS
│   ├── Dashboard de métricas
│   ├── Mensagens por período
│   ├── Sessões ativas/fechadas
│   ├── Tempo médio de resposta
│   ├── Custos de IA por agente
│   └── Performance por departamento
│
├── ⚙️ CONFIGURAÇÕES
│   ├── Horário de funcionamento
│   ├── Timeout de sessões
│   ├── Saudação automática
│   ├── Filtro de palavrões
│   ├── Indicador "digitando..."
│   └── Distribuição balanceada
│
└── 👤 ADMIN (Super Admin)
    ├── Gestão de organizações
    ├── Gestão de usuários global
    ├── Logs de auditoria
    ├── Monitoramento de instâncias
    ├── Configurações de sistema
    └── Permissões customizadas
```

### 4.2 APIs Disponíveis

| Controller | Path | Descrição |
|------------|------|-----------|
| `auth` | `/api/v1/auth/*` | Autenticação e autorização |
| `instances` | `/api/v1/instances/*` | CRUD de instâncias WhatsApp |
| `sessions` | `/api/v1/sessions/*` | Gestão de sessões de atendimento |
| `messages` | `/api/v1/messages/*` | Envio/recebimento de mensagens |
| `chats` | `/api/v1/chats/*` | Listagem de conversas |
| `media` | `/api/v1/media/*` | Upload/download de mídia |
| `organizations` | `/api/v1/organizations/*` | Gestão de organizações |
| `projects` | `/api/v1/projects/*` | Gestão de projetos |
| `webhooks` | `/api/v1/webhooks/*` | Configuração de webhooks |
| `departments` | `/api/v1/departments/*` | Gestão de departamentos |
| `labels` | `/api/v1/labels/*` | Gestão de etiquetas |
| `invitations` | `/api/v1/invitations/*` | Convites de usuários |
| `dashboard` | `/api/v1/dashboard/*` | Métricas e analytics |
| `analytics` | `/api/v1/analytics/*` | Analytics avançado |
| `onboarding` | `/api/v1/onboarding/*` | Fluxo de primeiro acesso |
| `sse` | `/api/v1/sse/*` | Server-Sent Events |
| `calls` | `/api/v1/calls/*` | Chamadas de voz (futuro) |

---

## 5. FLUXOS DE USUÁRIO

### 5.1 Fluxo de Onboarding

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE PRIMEIRO ACESSO                      │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
    ┌─────────┐
    │ Signup  │─────────────────────────────────────────┐
    └────┬────┘                                         │
         │                                              │
         ▼                                              ▼
    ┌─────────────┐                            ┌───────────────┐
    │ Envio OTP   │                            │ Login Google  │
    │ por Email   │                            │ OAuth         │
    └──────┬──────┘                            └───────┬───────┘
           │                                           │
           ▼                                           │
    ┌─────────────┐                                    │
    │ Verificar   │◄───────────────────────────────────┘
    │ OTP         │
    └──────┬──────┘
           │
           ▼
    ┌─────────────────┐
    │   ONBOARDING    │
    │  ┌───────────┐  │
    │  │ Step 1    │  │ → Criar Organização (nome, documento)
    │  └─────┬─────┘  │
    │        ▼        │
    │  ┌───────────┐  │
    │  │ Step 2    │  │ → Configurar Horário de Funcionamento
    │  └─────┬─────┘  │
    │        ▼        │
    │  ┌───────────┐  │
    │  │ Step 3    │  │ → Criar Primeira Instância WhatsApp
    │  └─────┬─────┘  │
    │        ▼        │
    │  ┌───────────┐  │
    │  │ Step 4    │  │ → Conectar via QR Code
    │  └───────────┘  │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │   DASHBOARD     │
    │   /integracoes  │
    └─────────────────┘
```

### 5.2 Fluxo de Mensagens

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE MENSAGEM RECEBIDA                    │
└─────────────────────────────────────────────────────────────────┘

  ┌─────────────┐
  │  WhatsApp   │ (Cliente envia mensagem)
  │  Cloud/Web  │
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │   UAZapi    │ (Provider de WhatsApp)
  │   Webhook   │
  └──────┬──────┘
         │
         ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                     QUAYER BACKEND                           │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │ 1. Receber Webhook                                     │  │
  │  │    └─ POST /api/v1/webhooks/uazapi                    │  │
  │  └──────────────────────────┬────────────────────────────┘  │
  │                             ▼                                │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │ 2. Identificar/Criar Contato                          │  │
  │  │    └─ Upsert Contact by phoneNumber                   │  │
  │  └──────────────────────────┬────────────────────────────┘  │
  │                             ▼                                │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │ 3. Gerenciar Sessão                                   │  │
  │  │    ├─ Se não existe → Criar ChatSession (QUEUED)      │  │
  │  │    └─ Se existe → Atualizar lastMessageAt             │  │
  │  └──────────────────────────┬────────────────────────────┘  │
  │                             ▼                                │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │ 4. Persistir Mensagem                                 │  │
  │  │    └─ Criar Message (INBOUND)                         │  │
  │  └──────────────────────────┬────────────────────────────┘  │
  │                             ▼                                │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │ 5. Processar Mídia (se aplicável)                     │  │
  │  │    ├─ Download media                                  │  │
  │  │    └─ Se áudio → Transcrição (Whisper/Deepgram)       │  │
  │  └──────────────────────────┬────────────────────────────┘  │
  │                             ▼                                │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │ 6. Concatenação (se habilitada)                       │  │
  │  │    └─ Aguardar X segundos para agrupar mensagens      │  │
  │  └──────────────────────────┬────────────────────────────┘  │
  │                             ▼                                │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │ 7. Encaminhar para IA ou n8n (se aiEnabled)           │  │
  │  │    ├─ Se n8nWebhookUrl → Enviar para n8n             │  │
  │  │    └─ Se AIAgentConfig → Processar com IA            │  │
  │  └──────────────────────────┬────────────────────────────┘  │
  │                             ▼                                │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │ 8. Notificar Frontend (SSE)                           │  │
  │  │    └─ Emit event: message.received                    │  │
  │  └──────────────────────────┬────────────────────────────┘  │
  │                             ▼                                │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │ 9. Disparar Webhooks do Cliente                       │  │
  │  │    └─ POST para webhooks configurados                 │  │
  │  └───────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────┘
```

### 5.3 Fluxo de Resposta IA

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DE RESPOSTA COM IA                      │
└─────────────────────────────────────────────────────────────────┘

  ┌─────────────────┐
  │ Mensagem        │
  │ Concatenada     │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐        ┌────────────────┐
  │ aiEnabled?      │───No──►│ Aguardar       │
  │                 │        │ Atendente      │
  └────────┬────────┘        └────────────────┘
           │ Yes
           ▼
  ┌─────────────────┐        ┌────────────────┐
  │ aiBlockedUntil? │──Yes──►│ Bloquear até   │
  │ (sessão)        │        │ timestamp      │
  └────────┬────────┘        └────────────────┘
           │ No
           ▼
  ┌─────────────────┐
  │ n8nWebhookUrl   │───────┐
  │ configurada?    │       │
  └────────┬────────┘       │
           │ No             │ Yes
           ▼                ▼
  ┌─────────────────┐  ┌────────────────┐
  │ Usar            │  │ Enviar para    │
  │ AIAgentConfig   │  │ n8n Workflow   │
  └────────┬────────┘  └───────┬────────┘
           │                   │
           ▼                   ▼
  ┌─────────────────────────────────────┐
  │           PROCESSAR IA               │
  │  ┌─────────────────────────────┐    │
  │  │ 1. Montar contexto          │    │
  │  │    - System prompt          │    │
  │  │    - Histórico (memoryWindow)│    │
  │  │    - Mensagem atual         │    │
  │  └──────────────┬──────────────┘    │
  │                 ▼                    │
  │  ┌─────────────────────────────┐    │
  │  │ 2. Chamar Provider          │    │
  │  │    - OpenAI / Anthropic     │    │
  │  │    - Groq / Together AI     │    │
  │  └──────────────┬──────────────┘    │
  │                 ▼                    │
  │  ┌─────────────────────────────┐    │
  │  │ 3. Registrar métricas       │    │
  │  │    - inputTokens            │    │
  │  │    - outputTokens           │    │
  │  │    - totalCost              │    │
  │  │    - latency                │    │
  │  └─────────────────────────────┘    │
  └───────────────────┬─────────────────┘
                      │
                      ▼
  ┌─────────────────────────────────────┐
  │         ENVIAR RESPOSTA              │
  │  ┌─────────────────────────────┐    │
  │  │ 1. Criar Message (OUTBOUND) │    │
  │  │    author: AI               │    │
  │  └──────────────┬──────────────┘    │
  │                 ▼                    │
  │  ┌─────────────────────────────┐    │
  │  │ 2. Enviar via UAZapi        │    │
  │  │    POST /messages/send      │    │
  │  └──────────────┬──────────────┘    │
  │                 ▼                    │
  │  ┌─────────────────────────────┐    │
  │  │ 3. Atualizar status         │    │
  │  │    sent → delivered → read  │    │
  │  └─────────────────────────────┘    │
  └─────────────────────────────────────┘
```

---

## 6. PERSONAS E USER STORIES

### 6.1 Personas

#### Persona 1: Admin do Sistema (Super Admin)
- **Nome:** Carlos, CTO
- **Objetivo:** Gerenciar toda a plataforma, criar organizações, monitorar saúde do sistema
- **Dores:** Falta de visibilidade sobre uso, dificuldade em debug

#### Persona 2: Master da Organização
- **Nome:** Maria, Gerente de Vendas
- **Objetivo:** Configurar equipe, gerenciar instâncias, ver métricas
- **Dores:** Dificuldade em distribuir atendimentos, falta de controle sobre IA

#### Persona 3: Atendente
- **Nome:** João, Vendedor
- **Objetivo:** Atender clientes rapidamente, usar IA como apoio
- **Dores:** Perder contexto de conversas, respostas de IA imprecisas

### 6.2 User Stories Principais

#### Autenticação
```
US-001: Como visitante, quero me cadastrar com email e senha para acessar a plataforma
US-002: Como usuário, quero fazer login sem senha via magic link para conveniência
US-003: Como usuário, quero trocar de organização ativa para gerenciar múltiplas empresas
```

#### WhatsApp
```
US-010: Como master, quero conectar uma nova instância via QR Code
US-011: Como master, quero compartilhar link de conexão com cliente para que ele escaneie o QR
US-012: Como atendente, quero ver status de conexão em tempo real
US-013: Como master, quero desconectar uma instância quando necessário
```

#### Atendimento
```
US-020: Como atendente, quero ver todas as conversas ativas em um inbox unificado
US-021: Como atendente, quero enviar mensagens de texto, imagem, áudio e documentos
US-022: Como atendente, quero ver transcrição automática de áudios recebidos
US-023: Como atendente, quero bloquear a IA temporariamente em uma conversa específica
US-024: Como atendente, quero ver histórico completo de uma sessão
```

#### IA e Automação
```
US-030: Como master, quero configurar um agente de IA com prompt customizado
US-031: Como master, quero integrar n8n para workflows personalizados
US-032: Como master, quero ver custos de IA por período
US-033: Como sistema, quero concatenar mensagens rápidas antes de processar com IA
```

#### Configurações
```
US-040: Como master, quero definir horário de funcionamento da organização
US-041: Como master, quero criar departamentos para distribuição de atendimentos
US-042: Como master, quero configurar webhooks para integração com outros sistemas
US-043: Como master, quero convidar novos usuários por email
```

---

## 7. REQUISITOS NÃO-FUNCIONAIS

### 7.1 Performance

| Métrica | Target |
|---------|--------|
| Latência de API (p95) | < 200ms |
| Tempo de conexão WhatsApp | < 30s |
| Throughput de mensagens | > 100 msg/s por instância |
| Tempo de resposta IA | < 5s |
| Uptime | 99.9% |

### 7.2 Segurança

- **Autenticação:** JWT com refresh tokens (15min access / 7d refresh)
- **Autorização:** RBAC (Role-Based Access Control)
- **Criptografia:** TLS 1.3 em trânsito, AES-256 em repouso
- **Senhas:** bcrypt com salt rounds = 10
- **Rate Limiting:** 100 req/min por IP, 1000 req/min por token
- **CORS:** Configurável por domínio
- **HMAC:** Verificação de assinatura em webhooks

### 7.3 Escalabilidade

- **Horizontal:** Stateless backend, Redis para sessões
- **Vertical:** Connection pooling no PostgreSQL
- **Cache:** Redis para queries frequentes
- **Jobs:** BullMQ com workers distribuídos
- **CDN:** Cloudflare para assets estáticos

### 7.4 Observabilidade

- **Logs:** Winston com níveis configuráveis
- **Métricas:** Custom analytics por organização
- **Audit:** Logs de todas as ações críticas
- **Health Check:** `/api/health` endpoint

---

## 8. ROADMAP

### 8.1 MVP (v1.0) - ATUAL ✅

- [x] Autenticação completa (email/senha, OTP, magic link, Google OAuth)
- [x] Multi-tenancy com organizações
- [x] Conexão WhatsApp via UAZapi
- [x] Chat em tempo real via SSE
- [x] Integração básica com IA
- [x] Webhooks configuráveis
- [x] Dashboard de métricas

### 8.2 v1.1 - Próxima Release

- [ ] Suporte a Instagram via Meta API
- [ ] Suporte a Telegram Bot
- [ ] Templates de mensagens
- [ ] Respostas rápidas (atalhos)
- [ ] Exportação de relatórios (CSV/PDF)

### 8.3 v1.2 - Futuro

- [ ] CRM integrado (Kanban de leads)
- [ ] Chatbot builder visual
- [ ] RAG (Retrieval-Augmented Generation) para IA
- [ ] Integração com CRMs externos (HubSpot, Pipedrive)
- [ ] App mobile (React Native)

### 8.4 v2.0 - Visão de Longo Prazo

- [ ] Marketplace de integrações
- [ ] White-label completo
- [ ] Voice AI (chamadas com IA)
- [ ] Video calls integradas
- [ ] Multi-idioma nativo

---

## 9. MÉTRICAS DE SUCESSO

### 9.1 KPIs do Produto

| Métrica | Target v1.0 | Target v1.2 |
|---------|-------------|-------------|
| MAU (Monthly Active Users) | 100 | 1.000 |
| Organizações ativas | 20 | 200 |
| Mensagens/mês | 50.000 | 500.000 |
| Tempo médio de resposta IA | < 3s | < 2s |
| Taxa de resolução por IA | 30% | 50% |
| NPS | > 40 | > 60 |

### 9.2 KPIs Técnicos

| Métrica | Target |
|---------|--------|
| Uptime | 99.9% |
| Error rate | < 0.1% |
| Build time | < 2min |
| Test coverage | > 70% |
| Lighthouse score | > 90 |

---

## 10. GLOSSÁRIO

| Termo | Definição |
|-------|-----------|
| **Connection** | Instância de WhatsApp conectada (representa um número) |
| **ChatSession** | Sessão de atendimento com um contato específico |
| **Tabulation** | Sistema de categorização/tabulação de sessões |
| **Concatenation** | Agrupamento de mensagens rápidas antes de processar |
| **Provider** | Serviço externo de WhatsApp (UAZapi, Evolution, etc) |
| **Tenant** | Organização isolada no sistema multi-tenant |
| **SSE** | Server-Sent Events - tecnologia para real-time |
| **Procedure** | Middleware do Igniter.js para validação/autorização |

---

## 11. ANEXOS

### 11.1 Estrutura de Diretórios

```
src/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Páginas de autenticação
│   ├── (public)/          # Páginas públicas
│   ├── admin/             # Área administrativa
│   ├── configuracoes/     # Configurações da organização
│   ├── conversas/         # Chat de atendimento
│   ├── integracoes/       # Dashboard principal
│   └── api/               # API routes
│
├── features/               # Feature modules (Igniter.js)
│   ├── auth/              # Autenticação
│   ├── instances/         # Instâncias WhatsApp
│   ├── sessions/          # Sessões de atendimento
│   ├── messages/          # Mensagens
│   ├── organizations/     # Organizações
│   ├── webhooks/          # Webhooks
│   └── ...
│
├── components/             # React components
│   ├── ui/                # Shadcn/UI components
│   └── ...
│
├── lib/                    # Utilities e services
│   ├── auth/              # JWT, bcrypt, OAuth
│   ├── api/               # API clients
│   ├── concatenation/     # Message concatenation
│   ├── email/             # Email service
│   └── providers/         # WhatsApp providers
│
└── services/               # Background services
    ├── cron.ts            # Scheduled jobs
    ├── jobs.ts            # BullMQ workers
    └── database.ts        # Prisma client
```

### 11.2 Variáveis de Ambiente

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis
REDIS_URL=redis://localhost:6379
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Auth
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret

# UAZapi
UAZAPI_BASE_URL=https://api.uazapi.com
UAZAPI_TOKEN=your-uazapi-token

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...

# Email
RESEND_API_KEY=re_...
SMTP_HOST=smtp.example.com
SMTP_USER=user
SMTP_PASS=pass

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# App
NEXT_PUBLIC_APP_URL=https://app.quayer.com
```

---

**Documento mantido pela Equipe Quayer**
**Última atualização:** Dezembro 2024
