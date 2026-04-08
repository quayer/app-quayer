# PRD: Quayer Stack Evolution — Supabase + Igniter Bots + Socket.IO + Mintlify

## Introduction

O Quayer é uma plataforma multi-tenant de atendimento WhatsApp construída com Next.js 16, Igniter.js, Prisma v7 e PostgreSQL. A arquitetura atual é sólida (34 features backend, 16 controllers, type-safe client), mas possui gaps críticos em **storage de mídias**, **realtime bidirecional**, **automação de bots** e **documentação externa**.

Este PRD cobre a evolução do stack em 3 fases, mantendo Prisma como ORM e adicionando Supabase como infraestrutura (PostgreSQL hosting + Storage), Socket.IO para realtime bidirecional, Igniter Bots para automação de mensagens, e Mintlify para documentação profissional.

**Decisões arquiteturais:**
- **Prisma permanece** como ORM (62+ arquivos, 11 repositories, 2000+ linhas de schema)
- **Igniter.js permanece** como API framework (context, store, jobs, MCP)
- **Supabase entra como infra** (PostgreSQL hosting, Storage S3, Realtime CDC)
- **Socket.IO substitui SSE** para chat (bidirecional, typing, presença)
- **Igniter Bots** estrutura o pipeline de mensagens WhatsApp
- **Mintlify** consome o OpenAPI já auto-gerado pelo Igniter

---

## Goals

- Eliminar o gap de storage de mídias (URLs WhatsApp expiram, base64 no DB não escala)
- Migrar PostgreSQL para Supabase hosted (dashboard, backups, connection pooler)
- Implementar realtime bidirecional com Socket.IO (typing, presença, rooms)
- Estruturar automação de mensagens com Igniter Bots framework
- Criar documentação externa profissional com Mintlify + OpenAPI do Igniter
- Consolidar Docker Compose e variáveis de ambiente
- Manter backward compatibility total com código existente

---

## Arquitetura Alvo

```
┌─────────────────────────────────────────────────────────────┐
│                     QUAYER STACK v2                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Igniter.js (API Framework)                                 │
│  ├── Controllers (16) → Features (34)                       │
│  ├── context.db → Prisma v7 ──→ Supabase PostgreSQL         │
│  ├── igniter.store → Redis adapter                          │
│  ├── igniter.jobs → BullMQ adapter                          │
│  ├── igniter.bots → WhatsApp bot flows (NOVO)               │
│  └── MCP Server → IDE integration                           │
│                                                             │
│  Realtime                                                   │
│  ├── Socket.IO server (NOVO — substitui SSE)                │
│  └── Supabase Realtime CDC (dashboard analytics — NOVO)     │
│                                                             │
│  Storage                                                    │
│  └── Supabase Storage S3 (NOVO — mídias WhatsApp)           │
│                                                             │
│  Docs                                                       │
│  ├── Igniter OpenAPI (auto-gerado, existente)               │
│  └── Mintlify (guias + referência externa — NOVO)           │
│                                                             │
│  Infra (Docker Compose)                                     │
│  ├── Next.js App                                            │
│  ├── Redis 7                                                │
│  ├── BullMQ Worker                                          │
│  └── PostgreSQL → Supabase Cloud (ou local dev)             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## FASE 1 — Supabase Infra + Storage (Fundação)

> Resolver o gap mais crítico: mídias expirando + hosting do banco.

### US-001: Conectar Prisma ao Supabase PostgreSQL

**Description:** Como desenvolvedor, quero migrar o PostgreSQL local para Supabase hosted para ter dashboard, backups automáticos e connection pooler sem mudar o ORM.

**Acceptance Criteria:**
- [ ] Criar projeto Supabase (região `sa-east-1` — São Paulo)
- [ ] Configurar `DATABASE_URL` no `.env` apontando para Supabase session pooler
- [ ] Configurar `DIRECT_URL` no `.env` para conexão direta (migrations)
- [ ] Atualizar `prisma/schema.prisma` com `directUrl = env("DIRECT_URL")`
- [ ] Rodar `npx prisma migrate deploy` contra Supabase sem erros
- [ ] Validar que todas as 7+ migrations existentes aplicam corretamente
- [ ] App conecta e opera normalmente com Supabase PostgreSQL
- [ ] Docker Compose local continua funcionando para dev (PostgreSQL local como fallback)
- [ ] Atualizar `.env.example` com variáveis Supabase documentadas
- [ ] Typecheck passa

### US-002: Implementar Supabase Storage Service

**Description:** Como desenvolvedor, quero um serviço de storage abstrato usando Supabase Storage (S3-compatible) para persistir mídias do WhatsApp que hoje expiram ou ficam como base64 no banco.

**Acceptance Criteria:**
- [ ] Instalar `@supabase/supabase-js` como dependência
- [ ] Criar serviço `src/server/services/storage.ts` com interface abstrata:
  - `upload(bucket, path, file, options): Promise<{ url, path }>`
  - `download(bucket, path): Promise<Buffer>`
  - `getSignedUrl(bucket, path, expiresIn): Promise<string>`
  - `delete(bucket, path): Promise<void>`
- [ ] Criar buckets no Supabase: `media-whatsapp`, `profile-pictures`, `attachments`
- [ ] Configurar políticas de acesso nos buckets (authenticated read, service write)
- [ ] Adicionar variáveis ao `.env.example`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`
- [ ] Respeitar flag `Organization.useOwnStorage` para BYOC futuro
- [ ] Typecheck passa

### US-003: Migrar mídias do webhook para Supabase Storage

**Description:** Como operador, quero que mídias recebidas via WhatsApp sejam persistidas no Supabase Storage em vez de ficarem como URLs temporárias ou base64 no banco.

**Acceptance Criteria:**
- [ ] No webhook handler (`src/app/api/v1/webhooks/[provider]/route.ts`):
  - Imagens: download via UAZapi → upload para `media-whatsapp/{orgId}/{sessionId}/{messageId}.{ext}`
  - Áudios: download → upload (parar de salvar base64 no DB)
  - Vídeos: download → upload
  - Documentos: download → upload
- [ ] Adicionar campo `storagePath` ao model `Message` (migration Prisma)
- [ ] Adicionar campo `storageProvider` ao model `Message` (default: `supabase`)
- [ ] Profile pictures: upload para `profile-pictures/{contactId}.jpg`
- [ ] Gerar signed URLs com expiração de 7 dias ao servir mídias
- [ ] Fallback: se upload falhar, manter comportamento atual (URL direta)
- [ ] Processamento assíncrono via BullMQ para não bloquear webhook
- [ ] Typecheck passa

### US-004: Endpoint de upload de arquivos

**Description:** Como usuário do painel, quero poder enviar arquivos (imagens, documentos) diretamente pelo frontend para anexar em mensagens.

**Acceptance Criteria:**
- [ ] Criar controller `files.controller.ts` com Igniter:
  - `upload` (mutation): multipart/form-data → Supabase Storage
  - `getUrl` (query): gera signed URL por path
  - `delete` (mutation): remove arquivo do storage
- [ ] Registrar controller no `igniter.router.ts`
- [ ] Validação: max 25MB, tipos permitidos (image/*, audio/*, video/*, application/pdf, .doc, .docx)
- [ ] Organização de paths: `attachments/{orgId}/{userId}/{timestamp}-{filename}`
- [ ] Auth obrigatório: `authProcedure({ required: true })`
- [ ] Rate limit: 10 uploads/minuto por usuário
- [ ] Typecheck passa

### US-005: Consolidar Docker Compose e .env

**Description:** Como DevOps, quero o Docker Compose e variáveis de ambiente consolidados para suportar Supabase Cloud (produção) e PostgreSQL local (desenvolvimento).

**Acceptance Criteria:**
- [ ] Atualizar `docker-compose.quayer.yml`:
  - Serviço PostgreSQL é condicional (só para dev local, não conflita com Supabase)
  - Variáveis de Supabase documentadas
  - Network `supabase_default` mantida para coexistência
- [ ] `.env.example` atualizado com TODAS as variáveis agrupadas por seção:
  - App, Igniter, Auth, Database (local + Supabase), Redis, Email, WhatsApp, Storage (Supabase), OAuth, Monitoring
- [ ] Script `scripts/setup-env.sh` que gera `.env` interativamente (pergunta local vs Supabase)
- [ ] `docker-entrypoint.sh` detecta se DATABASE_URL aponta para Supabase e pula criação de banco local
- [ ] Documentação inline em `.env.example` explicando cada variável
- [ ] Typecheck passa

---

## FASE 2 — Socket.IO + Igniter Bots (Realtime + Automação)

> Substituir SSE por Socket.IO e estruturar automação com Igniter Bots.

### US-006: Instalar e configurar Socket.IO server

**Description:** Como desenvolvedor, quero um Socket.IO server integrado ao Next.js para substituir SSE unidirecional por comunicação bidirecional com typing, presença e rooms.

**Acceptance Criteria:**
- [ ] Instalar `socket.io` (server) — `socket.io-client` já está no package.json
- [ ] Criar serviço `src/server/services/socket.ts`:
  - Inicializar Socket.IO server com adapter Redis (para múltiplas instâncias)
  - Namespaces: `/chat` (conversas), `/dashboard` (analytics), `/notifications`
  - Auth middleware: validar JWT do cookie httpOnly
- [ ] Integrar com Next.js custom server ou API route (`/api/socket`)
- [ ] Rooms por sessão: `session:{sessionId}` — agentes entram ao abrir conversa
- [ ] Rooms por organização: `org:{orgId}` — para broadcasts
- [ ] Migrar os 8 eventos SSE existentes para Socket.IO:
  - `message.received` → `message:received`
  - `message.sent` → `message:sent`
  - `session.updated` → `session:updated`
  - `instance.status.changed` → `instance:status:changed`
  - `contact.updated` → `contact:updated`
  - `session.labels.changed` → `session:labels:changed`
  - `contact.labels.changed` → `contact:labels:changed`
  - `heartbeat` → removido (Socket.IO faz automaticamente)
- [ ] Adicionar eventos novos (não existiam no SSE):
  - `typing:start` / `typing:stop` — indicador de digitação (bidirecional)
  - `presence:update` — agente online/offline
  - `message:status` — delivered/read/failed
- [ ] Fallback: se Socket.IO não conectar, manter SSE como fallback temporário
- [ ] Typecheck passa

### US-007: Migrar hooks do cliente de SSE para Socket.IO

**Description:** Como desenvolvedor frontend, quero substituir os hooks `useInstanceSSE` e `useUazapiSSE` por hooks Socket.IO com reconexão automática e tipagem.

**Acceptance Criteria:**
- [ ] Criar hook `src/client/hooks/useSocket.ts`:
  - Conexão automática ao montar
  - Reconexão automática nativa (Socket.IO built-in)
  - Cleanup ao desmontar
  - Estado de conexão exposto: `connected`, `disconnected`, `reconnecting`
- [ ] Criar hook `src/client/hooks/useChatSocket.ts`:
  - Join/leave room da sessão ativa
  - Recebe `message:new`, `message:status`
  - Emite `typing:start`, `typing:stop`
- [ ] Criar hook `src/client/hooks/usePresence.ts`:
  - Emite heartbeat a cada 30s
  - Lista agentes online por organização
- [ ] Migrar página de conversas (`src/app/conversas/[sessionId]/page.tsx`, 951 linhas) para usar novos hooks
- [ ] Refatorar `src/lib/events/sse-events.service.ts` (292 linhas) → `socket-events.service.ts`
- [ ] Atualizar os 7+ controllers que chamam `sseEvents.emit*()` (sessions, webhooks, etc.)
- [ ] Remover hooks SSE antigos após validação (`useInstanceSSE.ts` 386 linhas, `useUazapiSSE.ts` 393 linhas)
- [ ] Manter `useUazapiSSE.ts` se UAZapi exigir EventSource externo (endpoint diferente)
- [ ] Remover `src/server/features/sse/controllers/sse.controller.ts` (304 linhas, 3 endpoints consolidados em rooms)
- [ ] Typecheck passa
- [ ] Verificar no browser: mensagens chegam em tempo real sem refresh

### US-008: Emitir eventos Socket.IO no webhook handler

**Description:** Como operador, quero que mensagens recebidas via webhook apareçam instantaneamente no painel via Socket.IO em vez de depender de polling ou SSE.

**Acceptance Criteria:**
- [ ] No webhook handler, após salvar mensagem no DB:
  - Emitir `message:new` para room `session:{sessionId}`
  - Emitir `session:update` para room `org:{orgId}` (lista de sessões)
- [ ] No controller de mensagens, após enviar mensagem:
  - Emitir `message:new` para room `session:{sessionId}`
  - Emitir `typing:stop` para room `session:{sessionId}`
- [ ] Usar Redis adapter para que emissões funcionem cross-process
- [ ] Latência alvo: < 200ms entre webhook recebido e mensagem no browser
- [ ] Typecheck passa

### US-009: Instalar Igniter Bots adapter para WhatsApp

**Description:** Como desenvolvedor, quero integrar o Igniter Bots framework para estruturar os fluxos de automação de mensagens WhatsApp, substituindo lógica ad-hoc nos webhooks.

**Acceptance Criteria:**
- [ ] Instalar `@igniter-js/adapter-bots` (ou equivalente do Igniter)
- [ ] Configurar bot adapter WhatsApp no `src/igniter.ts`:
  ```typescript
  igniter.bots({
    adapters: [whatsapp({ token, phone, handle })],
    commands: registeredCommands
  })
  ```
- [ ] Criar `src/server/features/bots/` com:
  - `bot.config.ts` — registro de comandos e fluxos
  - `bot.handlers.ts` — handlers por tipo de mensagem
  - `bot.commands.ts` — comandos (@fechar, @pausar, @reabrir, @resolver + novos)
- [ ] Integrar no webhook handler (ponto de inserção: após validação, antes de Chatwoot sync):
  - Verificar `session.aiEnabled && !session.aiBlockedUntil`
  - Processar mensagem pelo bot engine
  - Enviar resposta com `BOT_SIGNATURE` (loop prevention existente)
  - Atualizar `totalAiMessages` na sessão
- [ ] Respeitar mecanismos existentes:
  - Bot echo detection (`'\u200B\u200C\u200D'`)
  - Auto-pause when human replies (24h block)
  - WhatsApp 24h window compliance (`expiresAt`)
  - Session status filtering (só QUEUED/ACTIVE)
- [ ] Usar `AIAgentConfig` existente no Prisma para configuração por organização
- [ ] Processamento assíncrono via BullMQ (webhook retorna 200 imediatamente)
- [ ] Typecheck passa

### US-010: Dashboard de presença e typing indicators

**Description:** Como atendente, quero ver quem está online e quando o cliente está digitando para melhorar a experiência de atendimento em tempo real.

**Acceptance Criteria:**
- [ ] Indicador de typing na página de conversa:
  - Mostra "Cliente está digitando..." quando recebe `typing:start`
  - Desaparece após 5s sem novo `typing:start` ou ao receber `typing:stop`
- [ ] Lista de agentes online na sidebar:
  - Bolinha verde = online (heartbeat < 60s)
  - Bolinha amarela = ausente (heartbeat 60s-300s)
  - Bolinha cinza = offline
- [ ] Contagem de agentes online no header do dashboard
- [ ] Typecheck passa
- [ ] Verificar no browser: typing indicator aparece e some corretamente

---

## FASE 3 — Documentação + Observabilidade (DX & Ops)

> Documentação profissional e monitoring avançado.

### US-011: Setup Mintlify para documentação externa

**Description:** Como product owner, quero documentação profissional para desenvolvedores e clientes que consomem a API do Quayer.

**Acceptance Criteria:**
- [ ] Criar repo `quayer/docs` no GitHub
- [ ] Configurar `docs.json` (Mintlify config):
  - Nome: "Quayer API Docs"
  - Branding: cores e logo do Quayer
  - Navigation: Getting Started, API Reference, Guias, Changelog
- [ ] Integrar OpenAPI do Igniter (`src/docs/openapi.json`) como fonte automática:
  ```json
  { "tabs": [{ "tab": "API Reference", "openapi": "/openapi.json" }] }
  ```
- [ ] Criar páginas MDX iniciais:
  - `introduction.mdx` — O que é o Quayer
  - `quickstart.mdx` — Primeiros passos
  - `authentication.mdx` — Como autenticar (JWT, API keys)
  - `webhooks.mdx` — Configurar webhooks para receber mensagens
  - `sending-messages.mdx` — Enviar mensagens via API
- [ ] CI/CD: GitHub Action para deploy automático no push ao repo docs
- [ ] Typecheck passa (se houver componentes custom)

### US-012: Documentação interna com Mintlify

**Description:** Como desenvolvedor do time, quero documentação interna sobre arquitetura, Igniter patterns e guias de contribuição.

**Acceptance Criteria:**
- [ ] Seção "Internal" no Mintlify (protegida ou separada):
  - `architecture.mdx` — Diagrama e explicação do stack
  - `igniter-patterns.mdx` — Como criar controllers, procedures, repositories
  - `database.mdx` — Schema Prisma, migrations, multi-tenancy
  - `realtime.mdx` — Socket.IO setup, events, rooms
  - `bots.mdx` — Igniter Bots, fluxos, comandos
  - `deployment.mdx` — Docker, Vercel, CI/CD, env vars
- [ ] Cada guia com exemplos de código reais do projeto
- [ ] Typecheck passa (se houver componentes custom)

### US-013: Telemetria e observabilidade avançada

**Description:** Como DevOps, quero substituir o console telemetry por métricas estruturadas para monitorar performance da API, bots e Socket.IO.

**Acceptance Criteria:**
- [ ] Substituir `ConsoleTelemetry` por adapter estruturado:
  - Opção 1: Sentry (já tem `SENTRY_DSN` no .env)
  - Opção 2: OpenTelemetry → Grafana (self-hosted)
- [ ] Métricas a rastrear:
  - API response times por controller/action
  - Webhook processing time
  - Bot response time e success rate
  - Socket.IO connections ativas por namespace
  - BullMQ job processing time e failure rate
  - Supabase Storage upload/download latency
- [ ] MCP Server events (`onToolCall`, `onToolError`, `onToolSuccess`) logando duração
- [ ] Dashboard de métricas acessível em `/admin/monitoring` ou Grafana externo
- [ ] Typecheck passa

### US-014: Supabase Realtime CDC para dashboard

**Description:** Como product owner, quero que o dashboard de analytics atualize automaticamente quando dados mudam no PostgreSQL, sem precisar de polling.

**Acceptance Criteria:**
- [ ] Habilitar Supabase Realtime no projeto
- [ ] Configurar CDC (Change Data Capture) para tabelas:
  - `ChatSession` — sessões ativas, fila
  - `Message` — contadores de mensagens
  - `Connection` — status das instâncias WhatsApp
- [ ] Criar hook `src/client/hooks/useRealtimeDashboard.ts`:
  - Usa Supabase client para escutar mudanças
  - Atualiza métricas do dashboard em tempo real
- [ ] Coexiste com Socket.IO (CDC para analytics, Socket.IO para chat)
- [ ] Typecheck passa
- [ ] Verificar no browser: dashboard atualiza sem refresh

---

## Functional Requirements

- FR-1: Prisma permanece como único ORM — nenhuma query migrada para Supabase client
- FR-2: Supabase Storage usa signed URLs com expiração configurável (default 7 dias)
- FR-3: Upload de mídias do webhook é assíncrono (BullMQ) para não bloquear o webhook handler
- FR-4: Socket.IO usa Redis adapter para funcionar cross-process em múltiplas instâncias
- FR-5: Socket.IO autentica via JWT do cookie httpOnly (mesmo auth do Igniter)
- FR-6: Igniter Bots respeita todos os mecanismos existentes (echo detection, auto-pause, 24h window)
- FR-7: Processamento de bot é assíncrono via BullMQ — webhook retorna 200 imediatamente
- FR-8: Mintlify consome `openapi.json` auto-gerado pelo Igniter — sem duplicação manual
- FR-9: Docker Compose suporta dois modos: local (PostgreSQL container) e cloud (Supabase hosted)
- FR-10: Todas as variáveis de ambiente novas documentadas em `.env.example` com comentários
- FR-11: Flag `Organization.useOwnStorage` respeitada para BYOC futuro
- FR-12: Fallback SSE mantido temporariamente até Socket.IO ser 100% validado

---

## Non-Goals (Out of Scope)

- **Não** migrar queries Prisma para Supabase client (manter Prisma como ORM)
- **Não** substituir auth custom por Supabase Auth (auth existente já tem Passkeys, OTP, Magic Link)
- **Não** implementar Supabase Edge Functions (Igniter.js já é o API framework)
- **Não** migrar Redis para Supabase (Redis é necessário para BullMQ, Socket.IO adapter, cache)
- **Não** implementar multi-cloud storage neste PRD (apenas Supabase Storage)
- **Não** criar SDK client para terceiros (Mintlify docs são self-service)
- **Não** implementar video call ou voice (apenas messaging)
- **Não** migrar para monorepo ou microserviços

---

## Technical Considerations

### Dependências novas
| Pacote | Fase | Propósito |
|--------|------|-----------|
| `@supabase/supabase-js` | 1 | Storage + Realtime CDC |
| `socket.io` | 2 | Realtime server |
| `@socket.io/redis-adapter` | 2 | Socket.IO cross-process |
| `@igniter-js/adapter-bots` | 2 | Bot framework |
| `mintlify` (CLI) | 3 | Docs local dev |

### Prisma migrations necessárias
- Fase 1: Adicionar `storagePath`, `storageProvider` ao model `Message`
- Fase 2: Nenhuma (usa campos `ai*` existentes no `ChatSession`)
- Fase 3: Nenhuma

### Connection strings Supabase
```
# Session pooler (app queries via Prisma)
DATABASE_URL="postgres://postgres.[REF]:[PASS]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres"

# Direct (migrations only)
DIRECT_URL="postgres://postgres.[REF]:[PASS]@db.[REF].supabase.co:5432/postgres"
```

### Socket.IO + Next.js
Next.js App Router não suporta WebSocket nativamente. Opções:
1. Custom server (`server.ts`) que wrapa Next.js + Socket.IO — **recomendado**
2. API route com upgrade manual — complexo
3. Serviço separado para Socket.IO — adiciona infra

### Coexistência Supabase Docker
O `docker-compose.quayer.yml` já usa port 5433 para PostgreSQL local e network `supabase_default` para coexistir com Supabase na mesma máquina.

### Riscos
| Risco | Mitigação |
|-------|-----------|
| Supabase Storage down | Fallback para URL direta do WhatsApp (comportamento atual) |
| Socket.IO não conecta | Fallback SSE mantido na Fase 2 |
| Igniter Bots adapter instável | Bot processing é opt-in por organização via `AIAgentConfig` |
| Mintlify free tier limitado | OpenAPI reference funciona no free; guias podem ser self-hosted |
| Migration Prisma falha no Supabase | Testar com `prisma migrate diff` antes de aplicar |

---

## Success Metrics

| Métrica | Alvo |
|---------|------|
| Mídias com URL persistente (não expiram) | 100% das novas mídias |
| Latência webhook → mensagem no browser | < 200ms (vs ~2s com SSE polling) |
| Taxa de sucesso do bot engine | > 95% das mensagens processadas |
| Uptime do storage | 99.9% (Supabase SLA) |
| Tempo para dev novo contribuir | < 30min (com docs Mintlify) |
| Base64 no banco de dados | 0 (migrado para Storage) |
| Agentes com indicador de presença | 100% no painel |

---

## Open Questions

1. **Socket.IO custom server vs serviço separado?** Custom server é mais simples mas muda o deploy. Serviço separado é mais isolado mas adiciona container no Docker Compose.
2. **Igniter Bots adapter está estável?** O `@igniter-js/adapter-bots` é relativamente novo. Avaliar se precisa de wrapper custom.
3. **Mintlify free tier** é suficiente para ambos (externo + interno) ou precisa de plano pago?
4. **Migração de mídias históricas** — precisamos reprocessar mídias antigas (base64 no DB) para Supabase Storage, ou só novas mídias?
5. **Supabase Realtime CDC** tem custo por evento? Verificar pricing para volume alto de mensagens.
6. **Custom server para Socket.IO** é compatível com deploy na Vercel? (Vercel não suporta WebSocket nativo — pode precisar de serviço separado para prod)

---

## Cronograma Sugerido

| Fase | User Stories | Dependência |
|------|-------------|-------------|
| **Fase 1** — Fundação | US-001 → US-005 | Nenhuma |
| **Fase 2** — Realtime + Bots | US-006 → US-010 | Fase 1 (Storage para mídias dos bots) |
| **Fase 3** — DX & Ops | US-011 → US-014 | Fase 2 (documenta o que foi construído) |

**Recomendação de início:** US-001 (Prisma → Supabase PostgreSQL) é a menor mudança com maior impacto — é só trocar a connection string.
