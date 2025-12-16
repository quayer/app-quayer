# API Specifications - Base de Conhecimento

Este diretorio contem as especificacoes de API usadas como referencia para o desenvolvimento do Quayer.

## Arquivos Disponiveis

| Arquivo | Descricao | Formato |
|---------|-----------|---------|
| `uazapi-openapi.yaml` | UAZapi WhatsApp API v2.0 | OpenAPI 3.1 |
| `whatsapp-cloud-api.postman.json` | WhatsApp Cloud API (Meta) | Postman |
| `chatwoot-api.postman.json` | Chatwoot Application API v1.0 | Postman |
| `supabase-api.postman.json` | Supabase API v1 | Postman |

---

## UAZapi - WhatsApp API (Principal)

**URL Base:** `https://{subdomain}.uazapi.com`

### Autenticacao
- `token` (header): Token da instancia para endpoints regulares
- `admintoken` (header): Token administrativo para endpoints admin

### Estados da Instancia
- `disconnected` - Desconectado do WhatsApp
- `connecting` - Em processo de conexao
- `connected` - Conectado e autenticado

### Endpoints Principais

#### Instance Management
| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| `/instance/init` | POST | Criar nova instancia |
| `/instance/all` | GET | Listar todas instancias |
| `/instance/connect` | POST | Conectar instancia (QR Code) |
| `/instance/disconnect` | POST | Desconectar instancia |
| `/instance/status` | GET | Status da instancia |
| `/instance` | DELETE | Deletar instancia |

#### Messages
| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| `/send/text` | POST | Enviar texto |
| `/send/media` | POST | Enviar midia (imagem/video/audio/doc) |
| `/send/contact` | POST | Enviar contato |
| `/send/location` | POST | Enviar localizacao |
| `/send/menu` | POST | Enviar menu interativo |
| `/send/carousel` | POST | Enviar carrossel |
| `/message/download` | GET | Baixar midia |
| `/message/markread` | POST | Marcar como lida |
| `/message/react` | POST | Reagir a mensagem |
| `/message/delete` | DELETE | Deletar mensagem |

#### Chat Operations
| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| `/chat/find` | GET | Buscar chats |
| `/chat/details` | GET | Detalhes do chat |
| `/chat/check` | GET | Verificar numero no WhatsApp |
| `/chat/block` | POST | Bloquear contato |
| `/chat/archive` | POST | Arquivar chat |
| `/chat/read` | POST | Marcar chat como lido |

#### Groups
| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| `/group/create` | POST | Criar grupo |
| `/group/list` | GET | Listar grupos |
| `/group/info` | GET | Info do grupo |
| `/group/invitelink/:groupJID` | GET | Link de convite |
| `/group/updateParticipants` | POST | Add/remove membros |
| `/group/leave` | POST | Sair do grupo |

#### Webhooks
| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| `/webhook` | POST | Configurar webhook da instancia |
| `/globalwebhook` | POST | Webhook global (admin) |
| `/sse` | GET | Server-Sent Events |

#### Contacts
| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| `/contacts` | GET | Buscar contatos |
| `/contacts/list` | GET | Listar todos contatos |
| `/contact/add` | POST | Adicionar contato |
| `/contact/remove` | DELETE | Remover contato |

#### Chatwoot Integration
| Endpoint | Metodo | Descricao |
|----------|--------|-----------|
| `/chatwoot/config` | POST | Configurar integracao Chatwoot |

---

## WhatsApp Cloud API (Meta)

**URL Base:** `https://graph.facebook.com/v18.0`

### Categorias Principais
- Get Started (Subscribe, Phone Number, Test Message)
- WhatsApp Business Accounts (WABAs)
- Phone Numbers
- Messages
- Media
- Templates
- Business Profile
- QR Codes
- Webhooks

### Uso no Quayer
A Cloud API e usada como provider alternativo ao UAZapi para contas oficiais do WhatsApp Business.

---

## Chatwoot API

**URL Base:** `https://{domain}/api/v1`

### Categorias Principais
- Authentication (Sign In, Profile)
- Account Agent Bots
- Canned Responses
- Contacts
- Conversations
- Messages
- Inboxes
- Teams
- Labels
- Webhooks

### Uso no Quayer
Integracao bidirecional para sincronizar conversas entre Quayer e Chatwoot.

---

## Supabase API

**URL Base:** `https://{project}.supabase.co`

### Categorias Principais
- Auth (Users, Sessions, Tokens)
- Database (Tables, Rows, Functions)
- Storage (Buckets, Objects)
- Realtime (Subscriptions)

### Uso no Quayer
Referencia para patterns de API REST. O Quayer usa Prisma + PostgreSQL diretamente.

---

## Mapeamento Quayer vs Providers

| Funcao Quayer | UAZapi | Cloud API | Chatwoot |
|---------------|--------|-----------|----------|
| Criar instancia | `/instance/init` | N/A | N/A |
| Conectar (QR) | `/instance/connect` | N/A | N/A |
| Enviar texto | `/send/text` | `/messages` | `/conversations/{id}/messages` |
| Enviar midia | `/send/media` | `/messages` | `/conversations/{id}/messages` |
| Webhook events | `/webhook` | Webhook Config | Webhook Subscriptions |
| Listar chats | `/chat/find` | N/A | `/conversations` |
| Contatos | `/contacts/list` | N/A | `/contacts` |

---

## Notas de Implementacao

### Provider Adapter Pattern
O Quayer usa o pattern Adapter para abstrair diferentes providers:

```
src/lib/providers/
├── adapters/
│   ├── uazapi/           # UAZapi adapter (principal)
│   └── cloudapi/         # WhatsApp Cloud API adapter
├── core/
│   ├── orchestrator.ts   # Gerencia providers
│   └── provider.interface.ts
└── index.ts
```

### Endpoints Quayer Correspondentes
```
POST /api/v1/instances           -> UAZapi /instance/init
POST /api/v1/instances/:id/connect -> UAZapi /instance/connect
POST /api/v1/messages/send       -> UAZapi /send/text ou /send/media
GET  /api/v1/chats               -> UAZapi /chat/find
POST /api/v1/webhooks/uazapi     -> Recebe eventos UAZapi
```
