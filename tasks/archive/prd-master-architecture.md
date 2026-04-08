# PRD: Master Architecture — Quayer v2

> **Prioridade:** Imediata — substitui e consolida prd-schema-overhaul.md + prd-modular-architecture.md
> **Risco:** Alto — schema, código e rotas
> **Branch sugerida:** `ralph/master-architecture`
> **Criado em:** 2026-03-14
> **Fontes de inspiração validadas:** FaleComigo.ai (Core9), schemas whatsapp/kanban/sales/cron referência, ORAYON.Ai-instagram

---

## Introdução

Este PRD é o documento mestre de arquitetura do Quayer v2. Consolida:

1. **Auth cleanup** (prd-schema-overhaul.md Fase 1–3) — preservado integralmente
2. **Modularização** (prd-modular-architecture.md) — refinada
3. **Sales Funnel** — followup_rules, Kanban avançado, Hotmart, CTWA tracking
4. **Messaging** — Dispatch Balancer, Templates HSM, melhorias em Contact/Message/Session
5. **AI** — TTS, custo por mensagem, tools tracking

---

## Mapa de Módulos e Schemas

```
┌──────────────────────────────────────────────────────────────────────┐
│                       QUAYER v2 — ARCHITECTURE                       │
├─────────────────┬──────────────────┬───────────────┬─────────────────┤
│   auth (18)     │  messaging (21)  │  sales (20)   │ platform (15)   │
├─────────────────┼──────────────────┼───────────────┼─────────────────┤
│ users           │ connections      │ contacts      │ webhooks        │
│ user_prefs ✨   │ connection_sets  │ contact_attr  │ webhook_deliv.  │
│ organizations   │ chat_sessions    │ attributes    │ audit_logs      │
│ user_orgs       │ messages         │ kanban_boards │ notifications   │
│ custom_roles    │ group_chats      │ kanban_cols   │ notif_reads     │
│ sessions ✨AAL  │ group_parts      │ contact_kanb ✨│ api_keys       │
│ refresh_tokens  │ group_messages   │ col_history ✨│ perm_resources  │
│ verif_codes     │ session_notes    │ contact_act ✨│ role_perms      │
│ temp_users      │ quick_replies    │ labels        │ log_entries     │
│ invitations     │ campaigns ✨     │ tabulations   │ log_analyses    │
│ passkey_creds   │ camp_recipients ✨│ contact_tabs │ system_settings │
│ passkey_chall   │ msg_templates ✨  │ session_tabs │ email_templates │
│ identities ✨   │ dispatch_pools ✨ │ products ✨  │ short_links ✨  │
│ totp_devices    │ dispatch_parts ✨ │ purchases ✨ │ short_clicks ✨ │
│ recov_codes     │ polls ✨          │ track_events ✨│ files         │
│ ip_rules        │ poll_votes ✨     │ calls         │                 │
│ verified_doms   │ sequences ✨      │ tags ✨       │                 │
│ scim_tokens     │ seq_steps ✨      │ contact_tags ✨│                │
│                 │ seq_subs ✨       │ handoff_tkts ✨│               │
│                 │                  │               │                 │
├─────────────────┴──────────────────┴───────────────┴─────────────────┤
│                          ai (8 tabelas)                               │
│  ai_agent_configs  │  ai_prompts  │  org_providers  │  n8n_call_logs │
│  knowledge_bases ✨│  kb_chunks ✨ │  conv_memories ✨│ integ_configs  │
└───────────────────────────────────────────────────────────────────────┘
  ✨ = novo/alterado   Total: ~82 tabelas   Zero em public
  CORTADOS: followup_rules (→ Sequence trigger), group_chains (niche/frágil)
```

---

## Mapa de Comunicação entre Schemas (FKs Cross-Schema)

```
auth.users ──────────────────┬──→ messaging.chat_sessions.assigned_agent_id
                             ├──→ messaging.messages.author_id
                             ├──→ sales.contact_activities.created_by_id
                             ├──→ platform.audit_logs.user_id
                             └──→ platform.notifications.user_id

auth.organizations ──────────┬──→ messaging.connections.organization_id
                             ├──→ messaging.campaigns.organization_id
                             ├──→ sales.contacts.organization_id
                             ├──→ sales.kanban_boards.organization_id
                             ├──→ sales.products.organization_id
                             └──→ platform.webhooks.organization_id

messaging.connections ───────┬──→ messaging.chat_sessions.connection_id
                             ├──→ messaging.campaigns.connection_id
                             └──→ messaging.message_templates.connection_id

messaging.chat_sessions ─────┬──→ messaging.messages.session_id
                             └──→ sales.session_tabulations.session_id

sales.contacts ──────────────┬──→ messaging.chat_sessions.contact_id
                             ├──→ sales.contact_kanban.contact_id
                             ├──→ sales.tracking_events.contact_id
                             └──→ sales.purchases.contact_id

sales.products ──────────────┬──→ sales.purchases.product_id
                             └──→ sales.kanban_boards.product_id

sales.kanban_boards ─────────┬──→ sales.kanban_columns.board_id
                             └──→ sales.column_history.board_id
                             // followup_rules removido — sequences usa triggerType=kanban_column_entry

messaging.campaigns ─────────→ messaging.campaign_recipients.campaign_id
messaging.dispatch_pools ────→ messaging.dispatch_participants.pool_id

ai.ai_agent_configs ─────────┬──→ messaging.messages.agent_id
                             └──→ messaging.chat_sessions.agent_id
```

---

## Fase 1 — Auth Cleanup (preservado de prd-schema-overhaul.md)

> **Sem alterações** — executar exatamente como documentado.

### US-001: Remover resetToken duplicado do User
Remover `resetToken` e `resetTokenExpiry` do model `User`. Usar apenas `VerificationCode type=RESET_PASSWORD`.

### US-002: Extrair UserPreferences do User
Mover `messageSignature` e `aiSuggestionsEnabled` para model `UserPreferences` separado.

### US-003: Remover lastOrganizationId redundante
Remover campo sem propósito definido do `User`.

### US-004: Renomear VerificationCode.email → identifier
Campo armazena email OU telefone. Naming enganoso.

### US-005: Unificar Session + DeviceSession
Um único model `Session` com campos de device (IP, userAgent, countryCode) + campo `aal` (Authentication Assurance Level: aal1/aal2).

### US-006: Adicionar tabela Identity (OAuth providers)
Suporte futuro a login social (Google, GitHub). Campos: `provider`, `providerId`, `email`, `avatarUrl`, `accessToken`, `refreshToken`.

### US-007: Padronizar snake_case em todas as tabelas
Todos os 58 models recebem `@@map("snake_case")`.

### US-012: Dropar deprecated AccessLevel e SystemConfig
Confirmado sem uso no codebase.

---

## Fase 2 — Separação de Schemas PostgreSQL

> **⚠️ Pré-requisito OBRIGATÓRIO para toda a Fase 2:** Habilitar `multiSchema` no Prisma ANTES de qualquer migration:
> ```prisma
> generator client {
>   provider        = "prisma-client-js"
>   previewFeatures = ["multiSchema"]
> }
> datasource db {
>   provider = "postgresql"
>   url      = env("DATABASE_URL")
>   schemas  = ["auth", "messaging", "sales", "platform", "ai", "public"]
> }
> ```
> Sem isso, `prisma validate` falha em todos os models com `@@schema`. Fazer em commit separado antes de US-008.
>
> **⚠️ Cross-schema FKs:** Prisma não emite `FOREIGN KEY REFERENCES schema.table` em migrations cross-schema. As FKs existem apenas no nível do Prisma Client (type-safe), não no PostgreSQL engine. Para integridade real, adicionar triggers ou aceitar que apenas o Prisma garante a constraint.
>
> **⚠️ Risco de execução:** `ALTER TABLE SET SCHEMA` em tabelas com RLS policies do Supabase pode invalidar as policies. Testar em ambiente de staging com clone do banco antes de produção.

### US-008: Schema `auth`
Models: `users`, `user_preferences`, `organizations`, `user_organizations`, `custom_roles`, `sessions`, `refresh_tokens`, `verification_codes`, `temp_users`, `invitations`, `passkey_credentials`, `passkey_challenges`, `identities`, `totp_devices`, `recovery_codes`, `ip_rules`, `verified_domains`, `scim_tokens`

Migration: `ALTER TABLE "public"."x" SET SCHEMA "auth";` para cada tabela.

### US-009: Schema `messaging`
Models: `connections`, `connection_settings`, `connection_events`, `chat_sessions`, `messages`, `group_chats`, `group_participants`, `group_messages`, `session_notes`, `quick_replies`, `campaigns`, `campaign_recipients`, `message_templates`, `dispatch_pools`, `dispatch_participants`, `polls`, `poll_votes`, `automation_flows`, `automation_executions`, `node_executions`, `pending_input_collections`, `flow_signals`, `scheduled_jobs`, `sequences`, `sequence_steps`, `sequence_subscriptions`

### US-010: Schema `sales`
Models: `contacts`, `contact_attributes`, `attributes`, `kanban_boards`, `kanban_columns`, `contact_kanban`, `column_history`, `contact_activities`, `labels`, `tabulations`, `contact_tabulations`, `session_tabulations`, `products`, `purchases`, `tracking_events`, `calls`, `tags`, `contact_tags`, `handoff_tickets`

> **Nota:** `followup_rules` removido — absorvido por `sequences` com `triggerType = 'kanban_column_entry'`

> **Nota:** `leads`, `lead_opportunities`, `lead_tasks` removidos — substituídos por campos `opportunityValue`, `expectedCloseAt`, `probability` em `contact_kanban` (simplificação aprovada)
> **Nota:** `contact_observations` e `contact_notes` removidos — unificados em `contact_activities` com `type = note` e `isPinned`

### US-011: Schema `platform`
Models: `webhooks`, `webhook_deliveries`, `audit_logs`, `permission_resources`, `role_permissions`, `log_entries`, `log_analyses`, `notifications`, `notification_reads`, `system_settings`, `email_templates`, `api_keys`, `files`, `short_links`, `short_link_clicks`

### US-011b: Schema `ai`
Models: `ai_agent_configs`, `ai_prompts`, `organization_providers`, `integration_configs`, `n8n_call_logs`, `knowledge_bases`, `knowledge_base_chunks`, `conversation_memories`

---

## Fase 3 — Melhorias de Models Existentes

### US-014: Enriquecer model Contact

**Campos a adicionar** (baseado em schema de referência):
```prisma
model Contact {
  // existentes...
  email              String?
  externalId         String?  // ID em CRM externo
  source             String   @default("whatsapp")  // whatsapp|instagram|api|import
  whatsappLid        String?  // WhatsApp Linked ID (Business Account)
  preferredLanguage  String?  // pt-BR, en-US, es
  contactIdentifier  String?  // identificador único alternativo
  channelType        String   @default("WHATSAPP")  // WHATSAPP|INSTAGRAM|TELEGRAM
  metadata           Json?    // dados extras livres
  // phoneNumber continua obrigatório
}
```

**Acceptance Criteria:**
- [ ] Adicionar campos ao model Contact no schema.prisma
- [ ] Migration SQL: `ALTER TABLE "Contact" ADD COLUMN ...` para cada campo
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-015: Enriquecer model ChatSession

> **⚠️ Crítica aplicada:** `whatsappWindowExpiresAt`, `lastCustomerMessageAt` e `endReason` já existem no schema. Apenas 2 campos são genuinamente novos.

**Campos a adicionar** (os demais já existem):
```prisma
model ChatSession {
  // existentes: whatsappWindowExpiresAt, lastCustomerMessageAt, endReason...
  detectedLanguage String?  // idioma detectado — novo (usado por US-039)
  whatsappCanReply Boolean  @default(false)  // novo — complementa whatsappWindowExpiresAt
}
```

**Acceptance Criteria:**
- [ ] Verificar campos existentes antes de rodar migration (`SELECT column_name FROM information_schema.columns WHERE table_name = 'ChatSession'`)
- [ ] Adicionar SOMENTE `detectedLanguage` e `whatsappCanReply` via migration SQL
- [ ] `prisma validate` passa
- [ ] `tsc --noEmit` passa

---

### US-016: Enriquecer model Message com custo de IA

> **⚠️ Crítica aplicada:** `inputTokens`, `outputTokens`, `inputCost`, `outputCost`, `totalCost` já existem como `Float?`. Apenas 3 campos são genuinamente novos. NÃO alterar tipo dos campos Float existentes — criar campos Decimal com nomes distintos para evitar lock de tabela em produção.

**Campos a adicionar** (os campos Float existentes são mantidos, novos campos adicionados ao lado):
```prisma
model Message {
  // existentes: inputTokens Int?, outputTokens Int?, inputCost Float?, outputCost Float?, totalCost Float?
  totalCostBrl Decimal? @db.Decimal(10,6)  // NOVO — custo em R$ (Float existente é USD)
  toolsUsed    String[] @default([])        // NOVO — ferramentas chamadas pelo AI
  replyToMsgId String?                     // NOVO — threading de mensagens
  // externalId e status: verificar se já existem antes de adicionar
}
```

**Acceptance Criteria:**
- [ ] Verificar campos existentes no schema antes de migrar
- [ ] `ALTER TABLE "Message" ADD COLUMN "totalCostBrl" DECIMAL(10,6)` — ADD COLUMN (sem lock)
- [ ] `ALTER TABLE "Message" ADD COLUMN "toolsUsed" TEXT[] DEFAULT '{}'`
- [ ] `ALTER TABLE "Message" ADD COLUMN "replyToMsgId" TEXT`
- [ ] Script de backfill: `UPDATE messages SET total_cost_brl = total_cost * 6.10 WHERE total_cost IS NOT NULL`
- [ ] Dashboard de custo de IA usa `totalCostBrl`
- [ ] `tsc --noEmit` passa

---

### US-017: ~~Enriquecer AIAgentConfig com TTS~~ → REMOVIDO

> **⚠️ Crítica aplicada:** `enableTTS`, `ttsProvider`, `ttsVoiceId`, `ttsModel`, `ttsSpeechRate` já existem no schema (verificado). US-017 geraria uma migration que falharia com "column already exists". Schema work é desnecessário.
>
> **Redirect:** O trabalho real de TTS é a implementação do serviço (US-040). Se `voiceSettings Json?` não existir, adicionar apenas esse campo como parte de US-040.

*(US-017 descartado — não executar)*

---

### US-018: Enriquecer KanbanBoard com horário comercial

**Campos a adicionar:**
```prisma
model KanbanBoard {
  // existentes...
  productId      String?   // FK → sales.products (funil por produto)
  businessHours  Json?     // { inicio: "08:00", fim: "21:00", pularFimSemana: true, feriados: [] }
  isOfficialNumber Boolean @default(false)
}
```

**Acceptance Criteria:**
- [ ] Adicionar campos ao model KanbanBoard
- [ ] Adicionar FK opcional para Product
- [ ] Migration SQL
- [ ] `tsc --noEmit` passa

---

## Fase 4 — Novas Tabelas

### US-019: ~~FollowupRule~~ → CORTADO — absorvido por US-032 (Sequence)

> **⚠️ Crítica aplicada:** `FollowupRule` e `Sequence` são o mesmo conceito em níveis diferentes de abstração. Ambos implementam delay → mensagem → mover coluna com businessHours e skip-on-reply. Ter dois workers paralelos fazendo o mesmo trabalho é debt desde o dia 1.
>
> **Solução:** `Sequence` (US-032) recebe um `triggerType = 'kanban_column_entry'` e `sourceColumnId`. Uma `SequenceSubscription` é criada automaticamente quando o contato entra na coluna. A lógica de mover coluna vira uma ação do `SequenceStep`.
>
> **Campos adicionais em `SequenceStep`** (para cobrir FollowupRule):
> ```prisma
> model SequenceStep {
>   // existentes...
>   action              String   @default("send_message")  // send_message|move_column|both
>   targetColumnId      String?  // mover para esta coluna após executar
>   onReplyColumnId     String?  // mover para esta coluna se contato responder
> }
> ```
>
> **Tabelas removidas do schema:** `followup_rules` não existe mais. Worker único em BullMQ processa `sequence_subscriptions`.

*(US-019 descartado — implementar como parte de US-032)*

---

### US-020: ColumnHistory — rastreamento de tempo por coluna

**Descrição:** Registra quanto tempo cada contato passou em cada coluna. Base para analytics de funil de conversão.

```prisma
model ColumnHistory {
  id               String    @id @default(uuid())
  contactKanbanId  String
  contactId        String
  boardId          String
  columnId         String
  columnName       String    // snapshot do nome (coluna pode ser renomeada)
  enteredAt        DateTime  @default(now())
  exitedAt         DateTime?
  durationMinutes  Int?      // calculado ao sair

  // FKs explícitas obrigatórias — sem elas orphan rows silenciosas em analytics
  contactKanban ContactKanban @relation(fields: [contactKanbanId], references: [id], onDelete: Cascade)
  contact       Contact       @relation(fields: [contactId], references: [id])
  board         KanbanBoard   @relation(fields: [boardId], references: [id])
  column        KanbanColumn  @relation(fields: [columnId], references: [id])

  @@map("column_history")
  @@schema("sales")
  @@index([contactKanbanId])
  @@index([columnId, enteredAt])  // padrão de query de analytics de funil
}
```

> **⚠️ Pré-requisito:** `ContactKanban` model deve ser criado com a definição completa abaixo antes de criar `ColumnHistory`:
> ```prisma
> model ContactKanban {
>   id               String    @id @default(uuid())
>   contactId        String
>   boardId          String
>   columnId         String
>   position         Int       @default(0)
>   opportunityValue Decimal?  @db.Decimal(10,2)
>   expectedCloseAt  DateTime?
>   probability      Int?      // 0–100
>   createdAt        DateTime  @default(now())
>   updatedAt        DateTime  @updatedAt
>
>   contact       Contact      @relation(fields: [contactId], references: [id], onDelete: Cascade)
>   board         KanbanBoard  @relation(fields: [boardId], references: [id], onDelete: Cascade)
>   column        KanbanColumn @relation(fields: [columnId], references: [id])
>   columnHistory ColumnHistory[]
>
>   @@unique([contactId, boardId])
>   @@index([boardId, columnId])
>   @@map("contact_kanban")
>   @@schema("sales")
> }
> ```

**Acceptance Criteria:**
- [ ] Model criado no schema.prisma
- [ ] Migration SQL
- [ ] Trigger: ao mover contato de coluna → fechar registro anterior + abrir novo
- [ ] Endpoint `GET /api/v1/crm/kanban/boards/:id/funnel-analytics` retorna tempo médio por coluna
- [ ] `tsc --noEmit` passa

---

### US-021: ContactActivity — feed de atividades

**Descrição:** Feed cronológico de tudo que aconteceu com um contato (coluna mudada, mensagem enviada, nota adicionada, compra realizada).

```prisma
model ContactActivity {
  id           String   @id @default(uuid())
  contactId    String
  boardId      String?
  activityType String   // column_changed|message_sent|note_added|purchase|followup_triggered
  description  String?
  metadata     Json?    @db.JsonB
  createdAt    DateTime @default(now())

  @@map("contact_activities")
  @@schema("sales")
  @@index([contactId, createdAt])
}
```

**Acceptance Criteria:**
- [ ] Model criado
- [ ] Migration SQL
- [ ] Endpoint `GET /api/v1/crm/contacts/:id/activity` retorna feed paginado
- [ ] `tsc --noEmit` passa

---

### US-022: Product + Purchase — Sales Module (Hotmart)

**Descrição:** Integração com plataformas de produtos digitais (Hotmart, Eduzz, Monetizze). Quando alguém compra, entra automaticamente no Kanban do produto.

```prisma
model Product {
  id                String    @id @default(uuid())
  organizationId    String
  name              String
  slug              String
  description       String?
  provider          String    @default("hotmart")  // hotmart|eduzz|monetizze|manual
  providerProductId String?   // ID no Hotmart
  providerOfferCode String?   // código da oferta
  providerUcode     String?   // ucode Hotmart
  price             Decimal?  @db.Decimal(10,2)
  currency          String    @default("BRL")
  isActive          Boolean   @default(true)
  metadata          Json?     @db.JsonB
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  purchases Purchase[]
  boards    KanbanBoard[]

  @@map("products")
  @@schema("sales")
}

model Purchase {
  id            String    @id @default(uuid())
  contactId     String
  productId     String
  purchasedAt   DateTime  @default(now())
  transactionId String?   // ID da transação no provedor
  amount        Decimal?  @db.Decimal(10,2)
  currency      String    @default("BRL")
  status        String    @default("approved")  // approved|refunded|chargeback
  providerData  Json?     @db.JsonB  // payload completo do webhook

  contact Contact @relation(fields: [contactId], references: [id])
  product Product @relation(fields: [productId], references: [id])

  createdAt DateTime @default(now())

  @@map("purchases")
  @@schema("sales")
  @@index([contactId])
  @@index([productId])
  @@index([transactionId])
}
```

**Acceptance Criteria:**
- [ ] Models criados no schema.prisma
- [ ] Migration SQL
- [ ] Endpoint público `POST /api/v1/webhooks/hotmart` com **validação HMAC obrigatória** (Hotmart assina com `X-Hotmart-Signature`)
- [ ] Idempotência: verificar `transactionId` antes de criar `Purchase` — duplicatas ignoradas silenciosamente
- [ ] `providerData Json?` — armazenar SOMENTE campos não-PII. CPF, email completo e endereço do comprador **não devem ser persistidos** (LGPD)
- [ ] Ao receber compra válida: cria `Purchase` + move contato para Kanban do produto
- [ ] Controller `src/server/sales/products/` com CRUD completo
- [ ] `tsc --noEmit` passa

> **⚠️ LGPD:** payload completo do Hotmart contém CPF, email e endereço. Nunca armazenar em `providerData` sem filtro. Definir explicitamente quais campos são permitidos.

---

### US-023: TrackingEvent — CTWA + Meta CAPI ⚠️ DEFER

> **⚠️ Crítica aplicada — DEFER:** Meta CAPI requer token de acesso do Business Manager do tenant + Pixel ID verificado + conformidade com GDPR/LGPD. Meta rejeita ~30% das submissões CAPI silenciosamente. A API de eventos depreca versões anualmente. Valor zero até clientes rodarem campanhas Meta em escala. **Não bloquear o roadmap por isso.**
>
> **Quando implementar:** quando o primeiro cliente pedir ativamente essa integração, com contrato que inclua DPA (Data Processing Agreement) cobrindo o envio de dados para Meta.

### US-023: TrackingEvent — CTWA + Meta CAPI

**Descrição:** Rastreia contatos que chegaram via Click-to-WhatsApp Ads. Envia dados de conversão para Meta Conversions API para otimizar campanhas.

```prisma
model TrackingEvent {
  id                  String    @id @default(uuid())
  contactId           String?
  organizationId      String
  remoteJid           String    // número WhatsApp do contato
  whatsappLid         String?
  ctwaClid            String?   // Click-to-WhatsApp Click ID (vem do Meta)
  sourceUrl           String?   // URL do anúncio
  sourceId            String?   // ID do anúncio
  sourceType          String?   // ad|organic|direct
  adTitle             String?
  adBody              String?
  firstMessage        String?   // primeira mensagem do contato
  countryCode         String    @default("BR")
  stateCode           String?
  instanceName        String?   // qual instância recebeu
  // Meta CAPI
  sentToCapi          Boolean   @default(false)
  capiEventId         String?
  capiResponse        Json?     @db.JsonB
  messageTimestamp    BigInt?
  createdAt           DateTime  @default(now())

  @@map("tracking_events")
  @@schema("sales")
  @@index([organizationId, createdAt])
  @@index([ctwaClid])
  @@index([contactId])
}
```

**Acceptance Criteria:**
- [ ] Model criado no schema.prisma
- [ ] Migration SQL
- [ ] Webhook handler que recebe evento CTWA e cria `TrackingEvent`
- [ ] Worker que envia eventos para Meta CAPI (`sentToCapi = false`)
- [ ] Dashboard mostra conversões por anúncio
- [ ] `tsc --noEmit` passa

---

### US-024: DispatchPool + DispatchParticipant — Dispatch Balancer ⚠️ ISOLAR

> **⚠️ Crítica aplicada — ISOLAR:** Rotação de números para disparo em massa é mecanismo de evasão de ban segundo o ToS do WhatsApp. Deve ser um módulo opt-in explícito com aceite de ToS por parte do tenant, não uma feature de primeira classe. Não incluir no onboarding padrão.
>
> **Correção técnica obrigatória:** `poolName @unique` deve ser `@@unique([organizationId, poolName])` — sem isso dois tenants não podem criar um pool com o mesmo nome.

### US-024: DispatchPool + DispatchParticipant — Dispatch Balancer

**Descrição:** Pools de instâncias WhatsApp para rotação de números em disparos em massa. Previne ban distribuindo o volume entre múltiplos números.

```prisma
model DispatchPool {
  id             String    @id @default(uuid())
  organizationId String
  poolName       String    // ⚠️ unique por org, não global
  description    String?
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  participants DispatchParticipant[]
  campaigns    Campaign[]

  @@unique([organizationId, poolName])
  @@map("dispatch_pools")
  @@schema("messaging")
}

model DispatchParticipant {
  id                  String    @id @default(uuid())
  poolId              String
  participantName     String
  phoneNumber         String
  uazapiUrl           String    @default("https://api.uazapi.com")
  uazapiInstanceToken String
  fallbackToken       String?
  isActive            Boolean   @default(true)
  sortOrder           Int
  createdAt           DateTime  @default(now())

  pool DispatchPool @relation(fields: [poolId], references: [id], onDelete: Cascade)

  @@map("dispatch_participants")
  @@schema("messaging")
}
```

**Acceptance Criteria:**
- [ ] Models criados no schema.prisma
- [ ] Migration SQL
- [ ] Controller `src/server/communication/dispatch-balancer/` com CRUD de pools e participantes
- [ ] Algoritmo round-robin para selecionar próximo participante ativo ao disparar
- [ ] `tsc --noEmit` passa

---

### US-025: Campaign + CampaignRecipient — Disparo em Massa

```prisma
model Campaign {
  id              String    @id @default(uuid())
  organizationId  String
  connectionId    String?   // conexão direta OU
  dispatchPoolId  String?   // pool de conexões (Dispatch Balancer)
  name            String
  status          String    @default("draft")  // draft|scheduled|running|completed|failed|cancelled
  scheduledAt     DateTime?
  message         String    // texto da mensagem
  mediaUrl        String?   // mídia opcional
  recipientCount  Int       @default(0)
  sentCount       Int       @default(0)
  deliveredCount  Int       @default(0)
  failedCount     Int       @default(0)
  intervalMs      Int       @default(3000)  // delay entre envios (anti-ban)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  recipients CampaignRecipient[]

  @@map("campaigns")
  @@schema("messaging")
}

model CampaignRecipient {
  id          String    @id @default(uuid())
  campaignId  String
  contactId   String?
  phoneNumber String
  status      String    @default("pending")  // pending|sent|delivered|read|failed
  sentAt      DateTime?
  deliveredAt DateTime?
  error       String?

  campaign Campaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)

  @@map("campaign_recipients")
  @@schema("messaging")
  @@index([campaignId, status])
}
```

**Acceptance Criteria:**
- [ ] Models criados no schema.prisma
- [ ] Migration SQL
- [ ] Worker BullMQ com **idempotência obrigatória**: antes de enviar, fazer `UPDATE campaign_recipients SET status = 'processing', worker_id = $id WHERE id = $id AND status = 'pending'` — só enviar se UPDATE retornou 1 row
- [ ] Recovery job: rows com `status = 'processing'` por mais de 5min → reset para `pending`
- [ ] Campaign pode usar conexão direta OU Dispatch Pool (Balancer)
- [ ] Controller CRUD + endpoints: `schedule`, `cancel`, `getStats`
- [ ] `tsc --noEmit` passa

> **Campo adicional obrigatório:** `processingAt DateTime?` e `workerId String?` em `CampaignRecipient` para o mecanismo de claim atômico.

---

### US-026: MessageTemplate — Templates HSM WhatsApp ⚠️ VERIFICAR PRÉ-REQUISITO

```prisma
model MessageTemplate {
  id              String    @id @default(uuid())
  organizationId  String
  connectionId    String?
  name            String
  category        String    // MARKETING|UTILITY|AUTHENTICATION
  language        String    @default("pt_BR")
  status          String    @default("PENDING")  // PENDING|APPROVED|REJECTED
  headerType      String    @default("NONE")  // NONE|TEXT|IMAGE|VIDEO|DOCUMENT
  headerContent   String?
  body            String
  footer          String?
  buttons         Json?     // CTAs: URL, PHONE, QUICK_REPLY
  metaTemplateId  String?   // ID retornado pela Meta após aprovação
  rejectionReason String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@map("message_templates")
  @@schema("messaging")
  @@index([organizationId, status])
}
```

> **⚠️ Pré-requisito crítico:** Templates HSM são exclusivos da **WhatsApp Cloud API (oficial Meta)**. Se a conexão usar UAZAPI com WhatsApp Web (não-oficial), esta feature é arquiteturalmente impossível. Verificar antes de implementar se o stack de conexão suporta a Business Management API.

**Acceptance Criteria:**
- [ ] Confirmar que o stack UAZAPI suporta template submission via Business Management API antes de prosseguir
- [ ] Model criado no schema.prisma
- [ ] Migration SQL
- [ ] Controller CRUD + endpoint `sync` que sincroniza status com Meta API
- [ ] Templates aprovados ficam disponíveis para uso em Campanhas
- [ ] `tsc --noEmit` passa

---

### US-027: ShortLink + ShortLinkClick

```prisma
model ShortLink {
  id             String    @id @default(uuid())
  organizationId String
  originalUrl    String    @db.Text
  slug           String    @unique
  clicks         Int       @default(0)
  createdById    String
  expiresAt      DateTime?
  createdAt      DateTime  @default(now())

  clickEvents ShortLinkClick[]

  @@map("short_links")
  @@schema("platform")
}

model ShortLinkClick {
  id          String   @id @default(uuid())
  shortLinkId String
  ipAddress   String?
  userAgent   String?
  countryCode String?
  clickedAt   DateTime @default(now())

  shortLink ShortLink @relation(fields: [shortLinkId], references: [id], onDelete: Cascade)

  @@map("short_link_clicks")
  @@schema("platform")
  @@index([shortLinkId, clickedAt])
}
```

**Acceptance Criteria:**
- [ ] Models criados no schema.prisma
- [ ] Migration SQL
- [ ] Rota pública `GET /s/[slug]` → redirect + registra click
- [ ] Controller CRUD com stats de cliques
- [ ] `tsc --noEmit` passa

---

### US-028b: Poll + PollVote — Enquetes em Grupos

**Descrição:** Suporte a enquetes do WhatsApp em grupos monitorados. Registra votos por contato para análise de engajamento.

```prisma
model Poll {
  id          String     @id @default(uuid())
  groupChatId String
  messageId   String?    @unique  // FK → Message que originou a enquete (evita registro duplo)
  question    String
  options     String[]
  createdAt   DateTime   @default(now())
  expiresAt   DateTime?

  votes     PollVote[]
  groupChat GroupChat  @relation(fields: [groupChatId], references: [id], onDelete: Cascade)

  @@map("polls")
  @@schema("messaging")
  @@index([groupChatId])
}

model PollVote {
  id              String   @id @default(uuid())
  pollId          String
  contactId       String?  // nullable — participante pode não estar em Contact
  participantJid  String   // WhatsApp JID do votante (fonte de verdade)
  option          String
  votedAt         DateTime @default(now())

  poll    Poll     @relation(fields: [pollId], references: [id], onDelete: Cascade)
  contact Contact? @relation(fields: [contactId], references: [id])

  @@unique([pollId, participantJid])  // jid como chave de dedup, não contactId
  @@map("poll_votes")
  @@schema("messaging")
  @@index([pollId])
}
```

**Acceptance Criteria:**
- [ ] Models criados no schema.prisma
- [ ] Migration SQL
- [ ] Webhook handler detecta evento de enquete do WhatsApp e cria/atualiza `Poll`
- [ ] Votos registrados quando contato responde a enquete
- [ ] Endpoint `GET /api/v1/communication/groups/:id/polls` lista enquetes com contagem de votos
- [ ] `tsc --noEmit` passa

---

### US-028c: contact_kanban — Campos de Oportunidade (substitui Lead)

**Descrição:** Adicionar campos de valor de oportunidade diretamente no `contact_kanban`, eliminando a necessidade de um model `Lead` separado.

```prisma
model ContactKanban {
  // existentes...
  opportunityValue  Decimal?  @db.Decimal(10,2)  // valor da oportunidade em R$
  expectedCloseAt   DateTime?                     // previsão de fechamento
  probability       Int?                          // 0-100% de conversão
}
```

**Acceptance Criteria:**
- [ ] Campos adicionados ao model ContactKanban
- [ ] Migration SQL: `ALTER TABLE contact_kanban ADD COLUMN ...`
- [ ] Card do Kanban exibe valor da oportunidade quando preenchido
- [ ] `tsc --noEmit` passa

---

### US-028d: ContactActivity — Absorve notas e observações

**Descrição:** Unificar `ContactObservation` e `ContactNote` em `contact_activities` com `type = note` e campo `isPinned`. Elimina dois models sobrepostos.

```prisma
model ContactActivity {
  // existentes...
  activityType  String   // column_changed|note|purchase|followup|message|handoff
  content       String?  // conteúdo da nota (quando type = note)
  isPinned      Boolean  @default(false)  // nota fixada no perfil
  createdById   String?  // usuário que criou (para notas manuais)
}
```

**Acceptance Criteria:**
- [ ] Campos `content`, `isPinned`, `createdById` adicionados ao model
- [ ] Migration SQL
- [ ] Script de migração de dados: `ContactObservation` → `contact_activities type=note`
- [ ] Dropar tabelas `contact_observations` e `contact_notes` após migração
- [ ] `tsc --noEmit` passa

---

## Fase 7 — Features de Automações e Segmentação

> Canvas visual (React Flow) fora de escopo. GroupChain cortado (niche/frágil — contradiz Non-Goals sobre Communities). Foco: Sequences, Tags, KnowledgeBase, HandoffTicket, Polls.

### US-036: ~~GroupChain — Grupos em Cascata~~ → CORTADO

> **⚠️ Crítica aplicada — CORTADO:**
> 1. WhatsApp não entrega eventos de join via webhook de forma confiável em APIs não-oficiais
> 2. `memberCount` diverge imediatamente quando membros saem/re-entram — sem webhook de saída garantido
> 3. O caso de uso (grupos com 1024+ membros) é idêntico ao que estava em Non-Goals como "Communities para infoprodutores"
> 4. Race condition não resolvível sem advisory lock + atomic increment em todos os joins simultâneos
>
> **Alternativa:** documentar manualmente qual grupo está ativo. Feature não justifica a complexidade operacional.

*(US-036 descartado)*

---

### US-032: Sequences Avançadas — Drip Campaigns + Kanban Trigger

**Descrição:** Sequências de mensagens com delay, retry, unsubscribe automático por resposta e suporte a horário comercial. **Absorve a funcionalidade de FollowupRule (US-019 cortado)** via `triggerType = 'kanban_column_entry'`.

```prisma
model Sequence {
  id              String    @id @default(uuid())
  organizationId  String
  connectionId    String?
  name            String
  isActive        Boolean   @default(false)
  businessHours   Json?     // { inicio, fim, pularFimSemana }
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  steps         SequenceStep[]
  subscriptions SequenceSubscription[]

  @@map("sequences")
  @@schema("messaging")
}

model SequenceStep {
  id              String   @id @default(uuid())
  sequenceId      String
  position        Int
  delayValue      Int      // 30
  delayUnit       String   // minutes|hours|days
  message         String
  mediaUrl        String?
  skipIfReplied   Boolean  @default(true)   // pular se contato já respondeu
  skipIfTagged    String[] @default([])     // pular se contato tem estas tags

  sequence Sequence @relation(fields: [sequenceId], references: [id], onDelete: Cascade)

  @@map("sequence_steps")
  @@schema("messaging")
  @@index([sequenceId, position])
}

model SequenceSubscription {
  id           String    @id @default(uuid())
  sequenceId   String
  contactId    String
  currentStep  Int       @default(0)
  status       String    @default("active")  // active|completed|unsubscribed|paused
  nextSendAt   DateTime?
  retryCount   Int       @default(0)
  subscribedAt DateTime  @default(now())
  completedAt  DateTime?

  sequence Sequence @relation(fields: [sequenceId], references: [id])

  @@map("sequence_subscriptions")
  @@schema("messaging")
  @@index([sequenceId, status])
  @@index([contactId])
  @@index([nextSendAt])
}
```

**Acceptance Criteria:**
- [ ] Models criados
- [ ] Migration SQL
- [ ] Worker BullMQ processa subscriptions vencidas respeitando `businessHours`
- [ ] Auto-unsubscribe quando contato responde (se `skipIfReplied = true`)
- [ ] Controller CRUD + `subscribe`, `unsubscribe`, `getSubscriptions`
- [ ] `tsc --noEmit` passa

---

### US-033: HandoffTicket — Transferência Bot → Humano

**Descrição:** Quando AI agent não consegue resolver, cria ticket estruturado de transferência para atendente humano com contexto completo da conversa.

```prisma
model HandoffTicket {
  id            String    @id @default(uuid())
  organizationId String
  sessionId     String
  contactId     String
  assignedToId  String?   // atendente responsável
  reason        String?   // motivo da transferência
  context       Json?     @db.JsonB  // últimas N mensagens + variáveis do bot
  status        String    @default("pending")  // pending|assigned|resolved
  resolvedAt    DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@map("handoff_tickets")
  @@schema("sales")
  @@index([organizationId, status])
  @@index([assignedToId])
}
```

**Acceptance Criteria:**
- [ ] Model criado
- [ ] Migration SQL
- [ ] AI agent cria HandoffTicket automaticamente quando `confidence < threshold`
- [ ] Notificação enviada ao atendente ao criar ticket
- [ ] `tsc --noEmit` passa

---

### US-034: Tags + ContactTag — Segmentação Simples

**Descrição:** Sistema de tags simples para segmentação rápida de contatos (complementa `Attribute` que é mais complexo).

```prisma
model Tag {
  id             String       @id @default(uuid())
  organizationId String
  name           String
  color          String       @default("#6366f1")
  createdAt      DateTime     @default(now())

  contactTags ContactTag[]

  @@unique([organizationId, name])
  @@map("tags")
  @@schema("sales")
}

model ContactTag {
  contactId String
  tagId     String
  addedAt   DateTime @default(now())

  contact Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  tag     Tag     @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([contactId, tagId])
  @@map("contact_tags")
  @@schema("sales")
}
```

**Acceptance Criteria:**
- [ ] Models criados
- [ ] Migration SQL
- [ ] Controller CRUD de tags + endpoints: `addTag`, `removeTag`, `bulkTag`
- [ ] Tags visíveis no perfil do contato e no card do Kanban
- [ ] Sequences podem usar `skipIfTagged` para pular contatos com tags específicas
- [ ] `tsc --noEmit` passa

---

### US-035: KnowledgeBase + Conversation Memory — AI Avançada

**Descrição:** Base de conhecimento para RAG (Retrieval Augmented Generation) dos AI agents + memória persistente de conversas por contato.

```prisma
model KnowledgeBase {
  id             String    @id @default(uuid())
  organizationId String
  name           String
  description    String?
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  chunks KnowledgeBaseChunk[]

  @@map("knowledge_bases")
  @@schema("ai")
}

model KnowledgeBaseChunk {
  id              String   @id @default(uuid())
  knowledgeBaseId String
  content         String   @db.Text
  embedding       Json?    @db.JsonB  // vetor de embedding (ou usar pgvector)
  metadata        Json?    @db.JsonB  // source, page, section
  createdAt       DateTime @default(now())

  knowledgeBase KnowledgeBase @relation(fields: [knowledgeBaseId], references: [id], onDelete: Cascade)

  @@map("knowledge_base_chunks")
  @@schema("ai")
  @@index([knowledgeBaseId])
}

model ConversationMemory {
  id        String   @id @default(uuid())
  agentId   String
  contactId String
  memory    Json     @db.JsonB  // fatos sobre o contato extraídos pelo AI
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  // ⚠️ Unique por org + agente + contato (não só agente+contato — multi-tenant safety)
  // Merge ao atualizar: NUNCA sobrescrever, sempre deep-merge com memória existente
  @@unique([organizationId, agentId, contactId])
  @@map("conversation_memories")
  @@schema("ai")
  @@index([organizationId, agentId, contactId])
}
```

**Acceptance Criteria:**
- [ ] Models criados
- [ ] Migration SQL
- [ ] Upload de documentos para KnowledgeBase (PDF, TXT, DOCX)
- [ ] Worker gera embeddings e salva em chunks
- [ ] AI Agent busca chunks relevantes antes de responder (RAG)
- [ ] ConversationMemory atualizada ao final de cada sessão
- [ ] `tsc --noEmit` passa

---

## Fase 5 — Reorganização de Código (Módulos)

### US-028: Estrutura de pastas modular no backend

```
src/server/
├── core/
│   ├── auth/           (existente)
│   ├── organizations/  (existente)
│   ├── sessions/       (existente)
│   ├── invitations/    (existente)
│   ├── permissions/    (existente)
│   ├── onboarding/     (existente)
│   ├── scim-tokens/    (existente)
│   ├── verified-domains/ (existente)
│   ├── device-sessions/  (REMOVIDO — unificado em sessions)
│   └── ip-rules/       (existente)
├── communication/
│   ├── messages/       (existente)
│   ├── connections/    (existente)
│   ├── instances/      (existente)
│   ├── dispatch/       (campaigns + existente)
│   ├── dispatch-balancer/ (NOVO)
│   ├── templates/      (NOVO — MessageTemplate)
│   ├── quick-replies/  (existente)
│   └── bots/           (existente)
├── crm/
│   ├── contacts/       (existente)
│   ├── attributes/     (existente)
│   ├── kanban/         (existente + sequences trigger NOVO)
│   ├── products/       (NOVO)
│   ├── tracking/       (NOVO — TrackingEvent)
│   └── calls/          (existente)
│   // observations/ absorvida por contact_activities (US-028d)
├── features/
│   ├── dashboard/      (existente)
│   ├── analytics/      (existente)
│   ├── audit/          (existente)
│   ├── webhooks/       (existente)
│   ├── notifications/  (existente)
│   ├── logs/           (existente)
│   ├── short-links/    (NOVO)
│   └── system-settings/ (existente)
├── integration/
│   ├── chatwoot/       (existente)
│   └── organization-providers/ (existente)
└── ai/
    └── ai/             (existente)
```

**Acceptance Criteria:**
- [ ] Todas as features movidas para módulo correto
- [ ] `index.ts` barrel em cada módulo
- [ ] `src/igniter.router.ts` importa de cada barrel
- [ ] `tsc --noEmit` passa

---

## Fase 6 — Documentação

### US-029: Atualizar toda documentação

**Acceptance Criteria:**
- [ ] `docs/ERD.md` atualizado com todos os 5 schemas e novos models
- [ ] `docs/AUTH_MAP.md` reflete Session unificada, UserPreferences, Identity
- [ ] `CLAUDE.md` reflete estrutura modular + tabela skills atualizada
- [ ] Diagrama Mermaid por schema: auth, messaging, sales, platform, ai
- [ ] FKs cross-schema documentadas no ERD

---

## Ordem de Execução

```
Fase 1 (Auth Cleanup):
  US-001 → US-002 → US-003 → US-004 → US-005 → US-006 → US-007 → US-012

Fase 2 (Schemas):
  US-008 → US-009 → US-010 → US-011 → US-011b

Fase 3 (Melhorias de Models):
  US-014 → US-015 → US-016 → US-017 → US-018
  (paralelo — sem dependência entre eles após Fase 2)

Fase 4 (Novas Tabelas):
  US-019 → US-020 → US-021  (Kanban avançado — sequencial)
  US-022                     (Products/Purchases — independente)
  US-023                     (TrackingEvent — independente)
  US-024 → US-025            (Dispatch — sequencial)
  US-026                     (Templates HSM — independente)
  US-027                     (ShortLink — independente)

Fase 5 (Módulos):
  US-028  (após Fases 1-4 completas)

Fase 6 (Docs):
  US-029  (última — reflete tudo)

Fase 7 (Automações e Segmentação):
  US-032 (Sequences + kanban trigger)           — independente [absorve US-019]
  US-033 (HandoffTicket)                        — independente
  US-034 (Tags + ContactTag)                    — independente
  US-035 (KnowledgeBase + ConversationMemory)   — independente
  US-028b (Poll + PollVote)                     — independente
  US-028c (contact_kanban full model + fields)  — após US-010
  US-028d (ContactActivity merge)               — após US-010
  [US-036 GroupChain — CORTADO]
  [US-019 FollowupRule — CORTADO, absorvido por US-032]

Fase 8 (AI Pipeline — portado de process-message/process-callback):
  US-037 (Message Splitter)                     — independente
  US-038 (AI Cost Calculator)                   — após US-016 (campos no DB)
  US-039 (Language Detection Pipeline)          — após US-015 (detectedLanguage na session)
  US-040 (TTS Service)                          — verificar voiceSettings em AIAgentConfig
```

---

## Functional Requirements

- **FR-1:** Toda tabela nova usa `@@map("snake_case")` + `@@schema("domínio")`
- **FR-2:** FKs cross-schema são permitidas no PostgreSQL e validadas pelo Prisma
- **FR-3:** Migrations manuais (arquivo SQL em `prisma/migrations/`) — sem `prisma migrate dev`
- **FR-4:** Workers BullMQ para followup_rules e campaigns (substituem pg_cron)
- **FR-5:** businessHours do board sempre verificado antes de disparar followup
- **FR-6:** `tsc --noEmit` passa após cada US individualmente
- **FR-7:** Zero endpoints quebrados — smoke test após cada Fase

---

## Fase 8 — AI Pipeline (portado de process-message/process-callback)

> Serviços inspirados nas Supabase Edge Functions do projeto de referência. Mesma lógica, reescrita em TypeScript/Node.js para o stack do Quayer.

### US-037: Message Splitter — Parse de Tags de Mídia no Output do AI

**Descrição:** Quando o AI agent retorna uma resposta com tags de mídia (`[url da imagem: ...]`, `[audio: ...]`, `[documento: ...]`), o splitter divide em blocos individuais e calcula o delay entre cada envio para parecer humano.

**Lógica (zero LLM — regex puro):**
```typescript
// Exemplo de output do AI:
"Aqui está a imagem do produto: [url da imagem: https://cdn.example.com/prod.jpg]
O manual completo: [documento: https://cdn.example.com/manual.pdf]
Qualquer dúvida estou aqui!"

// Output do splitter (3 blocos):
[
  { type: 'text',     content: 'Aqui está a imagem do produto:',    delay_ms: 500  },
  { type: 'image',    url: 'https://cdn.example.com/prod.jpg',      delay_ms: 1200 },
  { type: 'document', url: 'https://cdn.example.com/manual.pdf',    delay_ms: 1500 },
  { type: 'text',     content: 'Qualquer dúvida estou aqui!',       delay_ms: 800  },
]
```

**Tags suportadas:**
- `[url da imagem: URL]` → imageMessage
- `[audio: URL]` → audioMessage
- `[video: URL]` → videoMessage
- `[documento: URL]` → documentMessage
- Texto longo (>800 chars) → divide em parágrafos, mantendo listas juntas

**Delay calculado:** `base_ms (500) + chars * per_char_ms (10) — máximo 4000ms`

**Acceptance Criteria:**
- [ ] Criar `src/lib/message-splitter/index.ts` com função `splitAIOutput(text: string, config?: SplitConfig): MessageBlock[]`
- [ ] Suportar todas as 4 tags de mídia acima
- [ ] Texto >800 chars dividido em blocos respeitando quebras de parágrafo (`\n\n`)
- [ ] Listas (`-` / `1.`) nunca quebradas no meio
- [ ] Delay proporcional ao tamanho do bloco de texto
- [ ] AI callback handler usa o splitter antes de enviar
- [ ] Indicador "digitando..." enviado antes de cada bloco de texto
- [ ] `tsc --noEmit` passa

---

### US-038: AI Cost Calculator — Token Counting com Breakdown em BRL

**Descrição:** Calcular o custo exato de cada mensagem de AI, com breakdown por componente (system_prompt, histórico, tools, output), convertido para BRL. Salvar no model `Message`.

**Implementação:**
```typescript
// src/lib/ai/cost-calculator.ts
interface CostBreakdown {
  system_prompt_tokens: number
  user_message_tokens:  number
  chat_history_tokens:  number
  tool_calls_tokens:    number
  tool_results_tokens:  number
  output_tokens:        number
  total_input_tokens:   number
  total_output_tokens:  number
  input_cost_usd:       number
  output_cost_usd:      number
  total_cost_usd:       number
  total_cost_brl:       number  // conversão via USD_TO_BRL env var
  model:                string
  tools_used:           string[]
}

// Tabela de preços por modelo (LiteLLM-compatible):
const PRICING = {
  'gpt-4o':            { input: 0.0025, output: 0.010 },   // per 1K tokens
  'gpt-4o-mini':       { input: 0.00015, output: 0.0006 },
  'claude-sonnet-4-6': { input: 0.003, output: 0.015 },
  'claude-haiku-4-5':  { input: 0.00025, output: 0.00125 },
  'gemini-2.0-flash':  { input: 0.0001, output: 0.0004 },
  // ...extensível via env/db
}
```

**Acceptance Criteria:**
- [ ] Criar `src/lib/ai/cost-calculator.ts` com função `calculateAICost(params): CostBreakdown`
- [ ] Usar `js-tiktoken` para contagem precisa por modelo
- [ ] Tabela de preços extensível via `PRICING` object ou tabela no DB
- [ ] Conversão USD→BRL via env var `USD_TO_BRL` (ex: `6.10`)
- [ ] AI callback handler chama `calculateAICost` e salva no `Message`:
  - `inputTokens`, `outputTokens`, `inputCost`, `outputCost`, `totalCostBrl`, `toolsUsed`
- [ ] Endpoint `GET /api/v1/ai/costs?organizationId=&period=month` retorna soma do período
- [ ] `tsc --noEmit` passa

---

### US-039: Language Detection Pipeline — 6 Prioridades com Cache

**Descrição:** Detectar idioma do usuário de forma progressiva, reusando contexto já armazenado antes de chamar LLM. Economiza ~80% das chamadas de detecção de idioma.

**Pipeline (ordem de prioridade):**
```typescript
// src/lib/language-detector/index.ts
async function detectLanguage(params: {
  preDetected?:       string   // vindo do payload externo
  sessionLanguage?:   string   // session.detectedLanguage
  contactLanguage?:   string   // contact.preferredLanguage
  whisperLanguage?:   string   // retornado pela transcrição Whisper
  messageText?:       string   // texto para LLM detectar (último recurso)
  model?:             string   // gpt-4o-mini por padrão
}): Promise<LanguageDetectionResult>

// Resultado:
{ code: 'PT', confidence: 0.98, method: 'session' }
// method: 'pre_detected'|'session'|'contact'|'whisper'|'llm'|'fallback'
```

**Idiomas suportados:** PT, EN, ES, IT, FR, DE (extensível)

**Persistência:**
- Ao detectar via LLM → salvar em `session.detectedLanguage` + `contact.preferredLanguage`
- Próximas mensagens do mesmo contato → `method: 'contact'`, zero chamada LLM

**Acceptance Criteria:**
- [ ] Criar `src/lib/language-detector/index.ts` com função `detectLanguage`
- [ ] Respeitar ordem de prioridade estritamente (não chamar LLM se já tiver no cache)
- [ ] Ao usar LLM: chamar `gpt-4o-mini` com prompt minimalista (máx 50 tokens)
- [ ] Persistir resultado em `session.detectedLanguage` e `contact.preferredLanguage` após detecção via LLM
- [ ] Integrar no webhook handler de mensagens recebidas
- [ ] AI context builder inclui `user_language` no system prompt
- [ ] `tsc --noEmit` passa

---

### US-040: TTS Service — Text-to-Speech com Normalização

**Descrição:** Converter resposta do AI em áudio para envio via WhatsApp. Suporta ElevenLabs (mais natural) e OpenAI TTS (mais barato). Inclui pré-processamento do texto para melhorar pronúncia (normalização de números, siglas e emojis).

**Implementação:**
```typescript
// src/lib/tts/index.ts
interface TTSConfig {
  provider:    'ELEVENLABS' | 'OPENAI'
  voiceId:     string        // ID da voz no provedor
  language?:   string        // pt-BR, en-US, es...
  normalize?:  boolean       // pré-processar texto via LLM (default: true)
}

interface TTSResult {
  audioBase64:   string      // MP3 ou WAV em base64
  mimeType:      'audio/mpeg' | 'audio/wav'
  durationSecs?: number
}

// Text normalizer (opcional, usa gpt-4o-mini):
// Input:  "O plano custa R$1.290,00/mês 😊"
// Output: "O plano custa mil duzentos e noventa reais por mês"
```

**Formato de áudio por canal:**
- WhatsApp → MP3 (`audio/mpeg`) — reproduz inline como nota de voz
- Instagram → WAV (`audio/wav`) — compatível com Direct

**Acceptance Criteria:**
- [ ] Criar `src/lib/tts/index.ts` com função `generateTTS(text, config): Promise<TTSResult>`
- [ ] Suporte a ElevenLabs (`multilingual-v2`) e OpenAI TTS (`tts-1`, `tts-1-hd`)
- [ ] Text normalizer: substituir `R$X.XXX,XX` → por extenso, siglas → abreviações legíveis, remover emojis
- [ ] Integrar com AI callback handler: se `aiAgentConfig.ttsEnabled === true`, gerar áudio e enviar antes do texto
- [ ] `voiceId` e `ttsProvider` lidos de `AIAgentConfig`
- [ ] `tsc --noEmit` passa

---

## Non-Goals

- Gamificação (badges, níveis, conquistas — sem ROI claro para WhatsApp B2B)
- WhatsApp Product Catalog (depende de aprovação Meta — niche)
- Migrar para Supabase Auth (GoTrue) — auth custom é melhor para multi-tenant
- pg_cron — usar BullMQ (já configurado)
- n8n/Make integração nativa — automações internas resolvem o caso principal
- WhatsApp Communities e GroupChain cascade — niche, webhook de join não confiável em API não-oficial
- FollowupRule como model separado — absorvido por Sequence com `triggerType = kanban_column_entry`
- US-017 (TTS schema) — campos já existem, apenas serviço (US-040) está pendente
- Meta CAPI (US-023) — DEFER até cliente pedir com DPA assinado
- GroupChain overflow (US-036) — CORTADO

---

## Success Metrics

- 58 tabelas existentes + ~35 novas, todas em snake_case em 5 schemas separados
- Zero erros TypeScript — `tsc --noEmit` limpo
- `prisma validate` limpo
- Kanban com follow-up automático funcionando end-to-end
- Webhook Hotmart recebendo compras e movendo contatos no Kanban
- Custo de IA visível por mensagem no dashboard (USD + BRL, breakdown por componente)
- AI agent envia áudio TTS quando configurado
- Mensagens com tags `[imagem:]` / `[audio:]` enviadas como mídia real
- Idioma detectado salvo no contato — zero re-detecção nas mensagens seguintes
- Grupos em cascata: novo membro sempre vai para o grupo ativo da cadeia
