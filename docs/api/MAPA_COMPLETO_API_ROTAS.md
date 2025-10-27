# 🗺️ MAPA COMPLETO DE ROTAS DA API - APP QUAYER

**Data:** 2025-10-18
**Base URL:** `http://localhost:3000/api/v1`

---

## 📋 CONTROLLERS REGISTRADOS (26 controllers)

### 1. 🔐 **auth** - Autenticação
**Path:** `/api/v1/auth`
- Login com OTP
- Signup com OTP
- Google OAuth
- Token refresh
- Logout
- Verificação de email

### 2. 🎯 **onboarding** - Onboarding
**Path:** `/api/v1/onboarding`
- Completar onboarding
- Criar primeira organização
- Setup inicial

### 3. 🏢 **organizations** - Organizações
**Path:** `/api/v1/organizations`
- Listar organizações
- Criar organização
- Atualizar organização
- Deletar organização
- Obter organização atual
- Trocar organização

### 4. ✉️ **invitations** - Convites
**Path:** `/api/v1/invitations`
- Listar convites
- Criar convite
- Aceitar convite
- Rejeitar convite
- Cancelar convite

### 5. 📊 **dashboard** - Dashboard
**Path:** `/api/v1/dashboard`
- Estatísticas gerais
- Métricas de uso
- Analytics

### 6. 👥 **contacts** - Contatos
**Path:** `/api/v1/contacts`
- Listar contatos
- Criar contato
- Atualizar contato
- Deletar contato
- Buscar contato
- Importar contatos

### 7. 📋 **tabulations** - Tabulações
**Path:** `/api/v1/tabulations`
- Listar tabulações
- Criar tabulação
- Atualizar tabulação
- Deletar tabulação

### 8. 🏬 **departments** - Departamentos
**Path:** `/api/v1/departments`
- Listar departamentos
- Criar departamento
- Atualizar departamento
- Deletar departamento

### 9. 🏷️ **attribute** - Atributos
**Path:** `/api/v1/attribute`
- Listar atributos
- Criar atributo
- Atualizar atributo
- Deletar atributo

### 10. 👤 **contact-attribute** - Atributos de Contatos
**Path:** `/api/v1/contact-attribute`
- Associar atributo a contato
- Remover atributo de contato
- Listar atributos do contato

### 11. 📊 **kanban** - Kanban (CRM)
**Path:** `/api/v1/kanban`
- Listar boards
- Criar board
- Listar cards
- Criar card
- Mover card
- Atualizar card

### 12. 🏷️ **labels** - Labels/Tags
**Path:** `/api/v1/labels`
- Listar labels
- Criar label
- Atualizar label
- Deletar label

### 13. 📝 **contact-observation** - Observações de Contatos
**Path:** `/api/v1/contact-observation`
- Listar observações
- Criar observação
- Atualizar observação
- Deletar observação

### 14. 📁 **files** - Arquivos
**Path:** `/api/v1/files`
- Upload de arquivos
- Download de arquivos
- Listar arquivos
- Deletar arquivo

### 15. 💬 **chats** - Chats/Conversas
**Path:** `/api/v1/chats`
- Listar conversas
- Obter conversa por ID
- Marcar como lida
- Atribuir conversa

### 16. 📩 **messages** - Mensagens
**Path:** `/api/v1/messages`
- Listar mensagens
- Enviar mensagem texto
- Buscar mensagens
- Obter mensagem por ID

### 17. 🎬 **media** - Mídia (Imagens/Vídeos/Áudios)
**Path:** `/api/v1/media`
- Enviar imagem
- Enviar vídeo
- Enviar áudio
- Enviar documento
- Enviar localização

### 18. 📞 **sessions** - Sessões WhatsApp
**Path:** `/api/v1/sessions`
- Listar sessões
- Obter sessão por ID
- Criar sessão
- Deletar sessão
- Reconectar sessão
- Obter QR Code

### 19. 👥 **groups** - Grupos WhatsApp
**Path:** `/api/v1/groups`
- Listar grupos
- Criar grupo
- Obter informações do grupo
- Atualizar grupo
- Deletar grupo
- Adicionar participante
- Remover participante

### 20. 📋 **projects** - Projetos
**Path:** `/api/v1/projects`
- Listar projetos
- Criar projeto
- Atualizar projeto
- Deletar projeto

### 21. 🔗 **webhooks** - Webhooks
**Path:** `/api/v1/webhooks`
- Listar webhooks
- Criar webhook
- Atualizar webhook
- Deletar webhook
- Testar webhook
- Ver logs

### 22. 📥 **webhooks-receiver** - Recebedor de Webhooks
**Path:** `/api/v1/webhooks-receiver`
- Receber eventos do WhatsApp
- Processar webhooks externos

### 23. 📞 **calls** - Chamadas
**Path:** `/api/v1/calls`
- Listar chamadas
- Registrar chamada
- Obter detalhes da chamada

### 24. 🔄 **sse** - Server-Sent Events
**Path:** `/api/v1/sse`
- Stream de eventos em tempo real
- Revalidação automática
- Notificações

### 25. 🔌 **instances** - Instâncias WhatsApp (UAZapi)
**Path:** `/api/v1/instances`
- Listar instâncias
- Criar instância
- Atualizar instância
- Deletar instância
- Conectar instância
- Desconectar instância
- Obter QR Code
- Verificar status

### 26. 🔗 **share** - Compartilhamento
**Path:** `/api/v1/share`
- Criar link de compartilhamento
- Validar token de compartilhamento
- Conectar via link compartilhado

### 27. 🧪 **example** - Exemplos (Dev)
**Path:** `/api/v1/example`
- Exemplos de uso da API
- Testes de desenvolvimento

---

## 🎯 RESUMO POR CATEGORIA

### Autenticação & Usuários
- auth
- onboarding
- invitations

### Organizações & Estrutura
- organizations
- departments
- dashboard

### CRM & Contatos
- contacts
- contact-attribute
- contact-observation
- kanban
- labels
- attribute
- tabulations

### WhatsApp & Mensagens
- instances
- sessions
- chats
- messages
- media
- groups
- calls

### Integrações & Automação
- webhooks
- webhooks-receiver
- share
- projects
- sse

### Utilidades
- files
- example

---

## 📝 OBSERVAÇÕES IMPORTANTES

### Base URL
- **Desenvolvimento:** `http://localhost:3000/api/v1`
- **Produção:** Definir em `NEXT_PUBLIC_IGNITER_API_URL`

### Autenticação
- Todas as rotas (exceto auth públicas) requerem token JWT
- Token é injetado automaticamente via `igniter.client.ts`
- Armazenado em `localStorage.accessToken`

### Rate Limiting
- ⚠️ Redis não configurado (rate limiting desabilitado no dev)
- Em produção, configurar Upstash Redis

### Real-time
- SSE (`/api/v1/sse/events`) para atualizações em tempo real
- Webhooks para eventos externos

---

**Gerado automaticamente por Lia AI Agent**
**Baseado em:** [src/igniter.router.ts](src/igniter.router.ts)
