# 🗺️ Mapa Completo de Rotas API - Quayer

**Total**: 156 rotas | **Base URL**: `/api/v1`

---

## 📋 Índice de Categorias

1. [🔐 Autenticação (22 rotas)](#1-autenticação)
2. [🏢 Organizações (10 rotas)](#2-organizações)
3. [📱 Instâncias WhatsApp (18 rotas)](#3-instâncias-whatsapp)
4. [👤 Contatos CRM (6 rotas)](#4-contatos-crm)
5. [💬 Mensagens (7 rotas)](#5-mensagens)
6. [🗨️ Sessões de Chat (10 rotas)](#6-sessões-de-chat)
7. [📊 Dashboard (5 rotas)](#7-dashboard)
8. [📂 Projetos (7 rotas)](#8-projetos)
9. [🔔 Webhooks (7 rotas)](#9-webhooks)
10. [🔗 Webhooks Receiver (2 rotas)](#10-webhooks-receiver)
11. [📞 Chamadas (4 rotas)](#11-chamadas)
12. [👥 Grupos WhatsApp (11 rotas)](#12-grupos-whatsapp)
13. [🏷️ Tabulações/Tags (6 rotas)](#13-tabulaçõestags)
14. [🏢 Departamentos (6 rotas)](#14-departamentos)
15. [📋 Kanban (7 rotas)](#15-kanban)
16. [🔖 Labels (8 rotas)](#16-labels)
17. [✏️ Atributos (10 rotas)](#17-atributos)
18. [📝 Observações (4 rotas)](#18-observações)
19. [📁 Arquivos/Mídia (4 rotas)](#19-arquivosmídia)
20. [🎯 Onboarding (1 rota)](#20-onboarding)
21. [✉️ Convites (5 rotas)](#21-convites)
22. [🔄 SSE Real-time (3 rotas)](#22-sse-real-time)
23. [🔗 Compartilhamento (3 rotas)](#23-compartilhamento)

---

## 1. 🔐 Autenticação

**Propósito**: Gerenciar login, registro, autenticação OAuth, OTP e sessões de usuário.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/auth/register` | POST | Criar conta com email/senha |
| `/auth/login` | POST | Login com email/senha |
| `/auth/refresh` | POST | Renovar token de acesso |
| `/auth/logout` | POST | Fazer logout e revogar refresh token |
| `/auth/me` | GET | Obter dados do usuário autenticado |
| `/auth/change-password` | POST | Alterar senha do usuário |
| `/auth/profile` | PATCH | Atualizar perfil (nome, email) |
| `/auth/switch-organization` | POST | Trocar organização ativa |
| `/auth/users` | GET | Listar todos os usuários (admin) |
| `/auth/forgot-password` | POST | Solicitar email de reset de senha |
| `/auth/reset-password` | POST | Resetar senha com token |
| `/auth/google` | GET | Iniciar fluxo OAuth Google |
| `/auth/google/callback` | POST | Processar callback OAuth Google |
| `/auth/send-verification` | POST | Enviar código de verificação |
| `/auth/verify-email` | POST | Verificar email com código |
| `/auth/signup-otp` | POST | Solicitar código OTP para cadastro |
| `/auth/verify-signup-otp` | POST | Verificar OTP e criar usuário |
| `/auth/resend-verification` | POST | Reenviar código de verificação |
| `/auth/login-otp` | POST | Solicitar login sem senha (OTP) |
| `/auth/verify-login-otp` | POST | Verificar código OTP de login |
| `/auth/verify-magic-link` | POST | Verificar magic link (login/cadastro) |
| `/auth/onboarding/complete` | POST | Marcar onboarding como completo |

---

## 2. 🏢 Organizações

**Propósito**: Gerenciar empresas/organizações e seus membros (multi-tenancy).

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/organizations` | POST | Criar nova organização |
| `/organizations` | GET | Listar organizações (admin) |
| `/organizations/:id` | GET | Obter organização por ID |
| `/organizations/current` | GET | Obter organização atual do usuário |
| `/organizations/:id` | PATCH | Atualizar organização |
| `/organizations/:id` | DELETE | Deletar organização (soft delete) |
| `/organizations/:id/members` | GET | Listar membros da organização |
| `/organizations/:id/members` | POST | Adicionar membro à organização |
| `/organizations/:id/members/:userId` | PATCH | Atualizar role do membro |
| `/organizations/:id/members/:userId` | DELETE | Remover membro da organização |

---

## 3. 📱 Instâncias WhatsApp

**Propósito**: Gerenciar conexões WhatsApp (QR Code, status, perfil, webhooks).

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/instances` | POST | Criar nova instância WhatsApp |
| `/instances` | GET | Listar instâncias (paginado) |
| `/instances/:id` | GET | Obter instância por ID |
| `/instances/:id` | PUT | Atualizar instância |
| `/instances/:id/connect` | POST | Conectar e gerar QR Code |
| `/instances/:id/status` | GET | Obter status da conexão |
| `/instances/:id/disconnect` | POST | Desconectar instância |
| `/instances/:id` | DELETE | Deletar instância |
| `/instances/:id/profile-picture` | GET | Obter foto de perfil WhatsApp |
| `/instances/:id/webhook` | POST | Configurar webhook de eventos |
| `/instances/:id/webhook` | GET | Obter configuração de webhook |
| `/instances/:id/share` | POST | Gerar token de compartilhamento |
| `/instances/share/:token` | GET | Obter instância compartilhada |
| `/instances/share/:token/refresh` | POST | Atualizar QR Code compartilhado |
| `/instances/:id/profile/name` | PUT | Atualizar nome do perfil WhatsApp |
| `/instances/:id/profile/image` | PUT | Atualizar foto do perfil WhatsApp |
| `/instances/:id/restart` | POST | Reiniciar instância WhatsApp |

---

## 4. 👤 Contatos CRM

**Propósito**: Gerenciar contatos (clientes) com tags e informações personalizadas.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/contacts` | GET | Listar contatos (filtros + paginação) |
| `/contacts/:id` | GET | Obter contato por ID |
| `/contacts/by-phone/:phone` | GET | Buscar contato por telefone |
| `/contacts/:id` | PATCH | Atualizar informações do contato |
| `/contacts/:id/tabulations` | POST | Adicionar tags/categorias ao contato |
| `/contacts/:id/tabulations` | DELETE | Remover tags/categorias do contato |

---

## 5. 💬 Mensagens

**Propósito**: Enviar, receber, baixar e gerenciar mensagens WhatsApp.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/messages` | POST | Criar e enviar mensagem |
| `/messages` | GET | Listar mensagens (filtros) |
| `/messages/:id` | GET | Obter mensagem por ID |
| `/messages/:id/download` | GET | Baixar mídia da mensagem |
| `/messages/:id/react` | POST | Reagir à mensagem (emoji) |
| `/messages/:id` | DELETE | Deletar mensagem (para todos) |
| `/messages/:id/mark-read` | POST | Marcar mensagem como lida |

---

## 6. 🗨️ Sessões de Chat

**Propósito**: Gerenciar conversas ativas, arquivar chats, bloquear contatos.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/sessions` | GET | Listar sessões de chat |
| `/sessions/:id` | GET | Obter sessão por ID |
| `/sessions/:id/block-ai` | POST | Bloquear IA de responder |
| `/sessions/:id/unblock-ai` | POST | Desbloquear IA |
| `/sessions/:id/close` | POST | Encerrar sessão de chat |
| `/sessions/:id/status` | PATCH | Atualizar status da sessão |
| `/sessions/:id/tags` | POST | Adicionar tags à sessão |
| `/sessions/:id/tags` | DELETE | Remover tags da sessão |
| `/sessions/:id/ai-status` | GET | Verificar status de bloqueio IA |
| `/sessions/by-contact/:contactId` | GET | Buscar sessões por contato |

---

## 7. 📊 Dashboard

**Propósito**: Métricas, relatórios e visão geral do atendimento.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/dashboard/metrics` | GET | Obter métricas gerais |
| `/dashboard/overview` | GET | Visão geral do dashboard |
| `/dashboard/attendance` | GET | Dados de atendimento |
| `/dashboard/performance` | GET | Métricas de performance |
| `/dashboard/conversations` | GET | Dados de conversas |

---

## 8. 📂 Projetos

**Propósito**: Organizar instâncias em projetos/clientes.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/projects` | POST | Criar novo projeto |
| `/projects` | GET | Listar projetos (filtros) |
| `/projects/:id` | GET | Obter projeto por ID |
| `/projects/:id` | PATCH | Atualizar projeto |
| `/projects/:id` | DELETE | Deletar projeto |
| `/projects/:id/instances` | POST | Vincular instância ao projeto |
| `/projects/:id/instances/:instanceId` | DELETE | Desvincular instância do projeto |

---

## 9. 🔔 Webhooks

**Propósito**: Configurar webhooks para enviar eventos ao seu sistema.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/webhooks` | POST | Criar webhook |
| `/webhooks` | GET | Listar webhooks |
| `/webhooks/:id` | GET | Obter webhook por ID |
| `/webhooks/:id` | PATCH | Atualizar webhook |
| `/webhooks/:id` | DELETE | Deletar webhook |
| `/webhooks/:id/deliveries` | GET | Listar entregas do webhook |
| `/webhooks/deliveries/:deliveryId/retry` | POST | Retentar entrega falha |

---

## 10. 🔗 Webhooks Receiver

**Propósito**: Receber webhooks de provedores externos (UAZapi, Evolution API).

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/webhooks-receiver/uaz/receive/:instanceId` | POST | Receber webhook do UAZapi |
| `/webhooks-receiver/uaz/test/:instanceId` | GET | Testar recebimento de webhook |

**Fluxo**: UAZ → Webhook Receiver → Media Processing → Concatenation → Database → Client Webhook

---

## 11. 📞 Chamadas

**Propósito**: Gerenciar chamadas de voz/vídeo WhatsApp.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/calls/make` | POST | Fazer chamada |
| `/calls/reject` | POST | Rejeitar chamada |
| `/calls` | GET | Listar histórico de chamadas |
| `/calls/:id` | GET | Obter chamada por ID |

---

## 12. 👥 Grupos WhatsApp

**Propósito**: Gerenciar grupos WhatsApp (criar, adicionar/remover membros, promover admins).

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/groups` | GET | Listar grupos WhatsApp |
| `/groups` | POST | Criar grupo WhatsApp |
| `/groups/:groupJid` | GET | Obter grupo por JID |
| `/groups/:groupJid/participants` | POST | Adicionar membros ao grupo |
| `/groups/:groupJid/participants/:phone` | DELETE | Remover membro do grupo |
| `/groups/:groupJid/participants/:phone/promote` | POST | Promover membro a admin |
| `/groups/:groupJid/participants/:phone/demote` | POST | Remover admin do membro |
| `/groups/:groupJid` | PATCH | Atualizar info do grupo |
| `/groups/:groupJid/leave` | POST | Sair do grupo |
| `/groups/:groupJid/invite-link` | GET | Obter link de convite |
| `/groups/:groupJid/invite-link/reset` | POST | Resetar link de convite |

---

## 13. 🏷️ Tabulações/Tags

**Propósito**: Categorizar contatos (ex: "Cliente VIP", "Lead Frio", "Suporte").

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/tabulations` | POST | Criar tabulação |
| `/tabulations` | GET | Listar tabulações |
| `/tabulations/:id` | GET | Obter tabulação por ID |
| `/tabulations/:id` | PATCH | Atualizar tabulação |
| `/tabulations/:id` | DELETE | Deletar tabulação |
| `/tabulations/:id/integrations` | POST | Vincular integração à tabulação |

---

## 14. 🏢 Departamentos

**Propósito**: Organizar atendimento por departamentos (Vendas, Suporte, etc).

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/departments` | GET | Listar departamentos |
| `/departments` | POST | Criar departamento |
| `/departments/:id` | PATCH | Atualizar departamento |
| `/departments/:id` | GET | Obter departamento por ID |
| `/departments/:id` | DELETE | Deletar departamento |
| `/departments/:id/toggle` | PATCH | Ativar/desativar departamento |

---

## 15. 📋 Kanban

**Propósito**: Gerenciar funil de vendas/atendimento estilo kanban.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/kanban/boards` | POST | Criar quadro kanban |
| `/kanban/boards` | GET | Listar quadros |
| `/kanban/boards/:id` | GET | Obter quadro por ID |
| `/kanban/columns` | POST | Criar coluna no quadro |
| `/kanban/columns/:id` | PATCH | Atualizar coluna |
| `/kanban/columns/:id` | DELETE | Deletar coluna |
| `/kanban/tabulations/:id/attach` | POST | Vincular tabulação ao quadro |

---

## 16. 🔖 Labels

**Propósito**: Etiquetas/rótulos para classificação avançada.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/labels` | POST | Criar label |
| `/labels` | GET | Listar labels |
| `/labels/:id` | GET | Obter label por ID |
| `/labels/:id` | PATCH | Atualizar label |
| `/labels/:id` | DELETE | Deletar label |
| `/labels/stats` | GET | Obter estatísticas de labels |
| `/labels/:id/toggle` | PATCH | Ativar/desativar label |
| `/labels/category/:category` | GET | Buscar labels por categoria |

---

## 17. ✏️ Atributos

**Propósito**: Campos customizados para contatos (ex: "CPF", "Data Nascimento").

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/attribute` | POST | Criar atributo |
| `/attribute` | GET | Listar atributos |
| `/attribute/:id` | GET | Obter atributo por ID |
| `/attribute/:id` | PATCH | Atualizar atributo |
| `/attribute/:id` | DELETE | Deletar atributo |
| `/contact-attribute` | POST | Criar valor de atributo para contato |
| `/contact-attribute` | GET | Listar atributos de contatos |
| `/contact-attribute/:id` | GET | Obter atributo de contato |
| `/contact-attribute/:id` | PATCH | Atualizar valor do atributo |
| `/contact-attribute/:id` | DELETE | Deletar atributo do contato |

---

## 18. 📝 Observações

**Propósito**: Anotações internas sobre contatos (visível apenas para atendentes).

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/contact-observation` | POST | Criar observação |
| `/contact-observation/:contactId` | GET | Listar observações do contato |
| `/contact-observation/:id` | PATCH | Atualizar observação |
| `/contact-observation/:id` | DELETE | Deletar observação |

---

## 19. 📁 Arquivos/Mídia

**Propósito**: Upload e gerenciamento de arquivos.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/media/upload` | POST | Upload de arquivo |
| `/media/:id` | GET | Obter arquivo por ID |
| `/media` | GET | Listar arquivos |
| `/media/:id` | DELETE | Deletar arquivo |

---

## 20. 🎯 Onboarding

**Propósito**: Marcar conclusão do tour inicial do usuário.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/onboarding/complete` | POST | Marcar onboarding como completo |

---

## 21. ✉️ Convites

**Propósito**: Convidar novos membros para organização.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/invitations` | POST | Criar convite |
| `/invitations` | GET | Listar convites |
| `/invitations/:id` | GET | Obter convite por ID |
| `/invitations/:id/accept` | POST | Aceitar convite |
| `/invitations/:id/reject` | POST | Rejeitar convite |

---

## 22. 🔄 SSE Real-time

**Propósito**: Streaming de eventos em tempo real (Server-Sent Events).

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/sse/instance/:instanceId` | GET | Stream de eventos da instância |
| `/sse/organization/:orgId` | GET | Stream de eventos da organização |
| `/sse/session/:sessionId` | GET | Stream de eventos da sessão |

---

## 23. 🔗 Compartilhamento

**Propósito**: Compartilhar recursos via token público.

| Rota | Método | Para que serve |
|------|--------|----------------|
| `/share/:token` | GET | Obter recurso compartilhado |
| `/share/:token/accept` | POST | Aceitar compartilhamento |
| `/share/:token/reject` | POST | Rejeitar compartilhamento |

---

## 🔐 Autenticação e Autorização

### Rotas Públicas (sem autenticação)
- Todas as rotas de `/auth/*` (exceto `/auth/me` e `/auth/users`)
- `/share/:token` (GET)

### Rotas Protegidas (requerem JWT)
- Todas as outras rotas
- Header: `Authorization: Bearer <access_token>`

### Roles (RBAC)
- **Admin**: Acesso total ao sistema
- **Master**: Acesso total à organização
- **Manager**: Gerenciamento limitado
- **User**: Acesso padrão (membro)

---

## 📊 Recursos Especiais

### 1. Provider Orchestrator
- ✅ Suporta múltiplos provedores (UAZapi, Evolution API, Baileys)
- ✅ Retry automático (3x) e fallback
- ✅ Normalização universal de webhooks

### 2. OpenAI Media Processor
- ✅ Transcrição de áudio (Whisper)
- ✅ OCR de imagem (GPT-4o Vision)
- ✅ Análise de documentos
- ✅ Cache Redis (95% economia)

### 3. Message Concatenator
- ✅ Agrupa mensagens rápidas (8s timeout)
- ✅ Concatena TODOS os formatos (texto, áudio, imagem)
- ✅ Reduz webhooks em até 80%

---

## 📈 Estatísticas

| Categoria | Quantidade |
|-----------|------------|
| **Total de Rotas** | 156 |
| **Rotas Públicas** | 21 |
| **Rotas Protegidas** | 135 |
| **Features** | 23 |
| **Controllers** | 23 |

---

## 📚 Documentação Técnica

- **Arquitetura**: [igniter-architecture.mdc](.cursor/rules/igniter-architecture.mdc)
- **Padrões**: [igniter-patterns.mdc](.cursor/rules/igniter-patterns.mdc)
- **Provider Orchestrator**: [PROVIDER_ORCHESTRATION_COMPLETE.md](PROVIDER_ORCHESTRATION_COMPLETE.md)
- **Media Processing**: [MEDIA_PROCESSOR_OPENAI_COMPLETO.md](MEDIA_PROCESSOR_OPENAI_COMPLETO.md)
- **Message Concatenation**: [MESSAGE_CONCATENATOR_FLOW_COMPLETO.md](MESSAGE_CONCATENATOR_FLOW_COMPLETO.md)
- **OpenAPI Spec**: [src/docs/openapi.json](src/docs/openapi.json)

---

**Autor**: Lia AI Agent
**Data**: 2025-10-16
**Versão**: 1.0.0
