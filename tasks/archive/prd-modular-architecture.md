# PRD: Arquitetura Modular — Reorganização do Quayer por Domínios

> **Prioridade:** Imediata
> **Risco:** Alto — reorganização de estrutura de pastas + prefixos de rota de API
> **Branch sugerida:** `ralph/modular-architecture`
> **Criado em:** 2026-03-14
> **Inspirado em:** FaleComigo.ai (Core9 platform) — validado na documentação oficial

---

## Introdução

Quayer tem 35 features backend organizadas em uma estrutura plana em `src/server/features/`. Essa organização não reflete domínios de negócio, dificulta onboarding de novos devs, e não tem fronteiras claras entre responsabilidades.

O objetivo deste PRD é reorganizar Quayer em **6 módulos de domínio**, alinhado com a arquitetura de plataformas de messaging maduras como FaleComigo.ai (Core9). A reorganização inclui estrutura de pastas, prefixos de API, e identificação de gaps de features.

---

## Comparação: FaleComigo vs Quayer Atual

### Estrutura FaleComigo (validada nos docs)

| Módulo | Sub-grupos | Endpoints confirmados |
|--------|------------|----------------------|
| **Core** | Auth, Access Level, Admin, Customer, Notification, Organization, Storage, SystemEvent | Me GET, Login POST, Verify token GET |
| **Communication** | Chat (Campaign, Message, Messaging, Session), Department, Dispatch (v1/v2), Template | CRUD completo de sessões, mensagens, campanhas |
| **CRM** | Attribute, Contact, Kanban, Leads (Lead, Address, Opportunity, Task), Statuses | Smart Contact POST, List GET, Update PUT |
| **Features** | Dashboard, Label, Tabulation, URL Shortener, Automations, Catalog, Gamification | Performance GET, Stats GET |
| **Integration** | Connection, OAuth, Providers, Webhooks | List/Create/Connect/Disconnect integration |
| **Shared** | Decorators, DTOs, Exceptions, Filters, Guards, Interceptors, Types, Utils | — |

### Mapeamento Quayer → Módulos

| Módulo | Features Quayer atuais | Status |
|--------|----------------------|--------|
| **Core** | auth, organizations, invitations, permissions, api-keys, scim-tokens, verified-domains, device-sessions, ip-rules, sessions, onboarding, system-settings | ✅ Existem |
| **Communication** | messages, connections, connection-settings, instances, share, sse, quick-replies | ✅ Existem |
| **CRM** | contacts, attributes, observations, calls, projects | ✅ Existem (parcial) |
| **Features** | analytics, dashboard, notifications, audit, webhooks, logs | ✅ Existem (parcial) |
| **Integration** | chatwoot, organization-providers, instances | ✅ Existem |
| **AI** | ai, bots | ✅ Existem |

### Gaps: FaleComigo tem, Quayer não tem

| Gap | Módulo | Prioridade |
|-----|--------|-----------|
| `leads` — pipeline de vendas com oportunidades e tarefas | CRM | Alta |
| `dispatch` — campanhas de disparo em massa | Communication | Alta |
| `template` — templates HSM WhatsApp (Meta approval) | Communication | Alta |
| `url-shortener` — encurtador com tracking | Features | Média |
| `automations` — motor no-code de automações | Features | Alta |
| `catalog` — catálogo de produtos WhatsApp | Features | Baixa |
| `gamification` — conquistas, badges, níveis de atendentes | Features | Baixa |
| `bots` — builder visual de chatbots | Communication | Alta |

---

## Goals

- Reorganizar `src/server/features/` em 6 módulos de domínio: `core`, `communication`, `crm`, `features`, `integration`, `ai`
- Atualizar prefixos de rota de API: `/api/v1/[módulo]/[recurso]`
- Criar estrutura de pastas modular no frontend: `src/app/(dashboard)/[módulo]/`
- Documentar todos os gaps identificados como roadmap de features
- Zero breaking changes nas funcionalidades — só reorganização de código
- Toda a documentação (`AUTH_MAP.md`, `ERD.md`, `CLAUDE.md`) atualizada

---

## User Stories

### US-001: Criar estrutura de módulos no backend

**Descrição:** Como desenvolvedor, quero reorganizar `src/server/features/` em subpastas por módulo de domínio para que a estrutura do código reflita os domínios de negócio.

**Acceptance Criteria:**
- [ ] Criar estrutura de diretórios:
  ```
  src/server/
  ├── core/          (auth, organizations, invitations, permissions, api-keys,
  │                   scim-tokens, verified-domains, device-sessions, ip-rules,
  │                   sessions, onboarding, system-settings, notifications, health)
  ├── communication/ (messages, connections, connection-settings, instances,
  │                   share, sse, quick-replies, bots)
  ├── crm/           (contacts, attributes, observations, calls, projects)
  ├── features/      (analytics, dashboard, audit, logs, webhooks)
  ├── integration/   (chatwoot, organization-providers)
  └── ai/            (ai)
  ```
- [ ] Mover cada feature para o módulo correspondente (apenas mover pasta, sem alterar código interno)
- [ ] Atualizar todos os imports relativos quebrados após a movimentação
- [ ] Criar `index.ts` barrel em cada módulo exportando todos os controllers
- [ ] Atualizar `src/igniter.router.ts` para importar dos novos caminhos
- [ ] `tsc --noEmit` passa sem erros

---

### US-002: Atualizar prefixos de rota de API por módulo

**Descrição:** Como desenvolvedor, quero que as rotas de API reflitam o módulo de domínio, seguindo o padrão `/api/v1/[módulo]/[recurso]`.

**Acceptance Criteria:**
- [ ] Definir mapeamento de prefixos:
  - `core`: `/api/v1/auth`, `/api/v1/org`, `/api/v1/users`, `/api/v1/settings`
  - `communication`: `/api/v1/messages`, `/api/v1/connections`, `/api/v1/sessions`, `/api/v1/instances`
  - `crm`: `/api/v1/contacts`, `/api/v1/kanban`, `/api/v1/leads`
  - `features`: `/api/v1/dashboard`, `/api/v1/analytics`, `/api/v1/webhooks`
  - `integration`: `/api/v1/integrations`, `/api/v1/chatwoot`
  - `ai`: `/api/v1/ai`
- [ ] Atualizar `path` em cada controller Igniter.js para o novo prefixo
- [ ] Atualizar todos os calls de API no frontend que referenciam rotas antigas
- [ ] Middleware de autenticação continua funcionando nos novos prefixos
- [ ] `tsc --noEmit` passa

---

### US-003: Reorganizar estrutura de páginas no frontend

**Descrição:** Como desenvolvedor, quero que `src/app/(dashboard)/` reflita a mesma estrutura modular do backend.

**Acceptance Criteria:**
- [ ] Criar estrutura de rotas:
  ```
  src/app/(dashboard)/
  ├── core/           → org settings, users, permissions
  ├── conversas/      → mantém nome atual (Communication)
  ├── contatos/       → mantém nome atual (CRM)
  ├── integracoes/    → mantém nome atual (Integration)
  ├── ferramentas/    → dashboard, analytics (Features)
  └── ai/             → AI agents
  ```
- [ ] As rotas existentes (`/conversas`, `/contatos`, `/integracoes`) continuam funcionando
- [ ] Navegação lateral (`nav-main.tsx`) organizada por módulo com separadores
- [ ] `tsc --noEmit` passa
- [ ] Verificar no browser com dev-browser skill

---

### US-004: Criar módulo CRM — leads e pipeline de vendas

**Descrição:** Como usuário, quero gerenciar leads com pipeline de vendas (oportunidades, tarefas, endereços), funcionalidade presente no FaleComigo mas ausente no Quayer.

**Acceptance Criteria:**
- [ ] Criar model `Lead` no schema.prisma: `id`, `contactId FK`, `organizationId FK`, `title`, `status` (new/qualified/proposal/won/lost), `value Decimal?`, `expectedCloseAt DateTime?`, `assignedAgentId FK?`, `createdAt`, `updatedAt`
- [ ] Criar model `LeadOpportunity`: `id`, `leadId FK`, `title`, `value Decimal`, `stage`, `probability Int`, `createdAt`
- [ ] Criar model `LeadTask`: `id`, `leadId FK`, `title`, `dueAt DateTime?`, `completedAt DateTime?`, `assignedTo FK?`
- [ ] Adicionar `@@map()` e `@@schema("sales")` (alinhado com prd-schema-overhaul.md)
- [ ] Criar controller em `src/server/crm/leads/` com actions: `list`, `create`, `update`, `delete`, `addOpportunity`, `addTask`
- [ ] Migration SQL criada manualmente (padrão do projeto)
- [ ] `tsc --noEmit` passa

---

### US-005: Criar módulo Communication — dispatch (campanhas em massa)

**Descrição:** Como usuário, quero criar campanhas de disparo em massa para múltiplos contatos via WhatsApp, funcionalidade presente no FaleComigo mas ausente no Quayer.

**Acceptance Criteria:**
- [ ] Criar model `Campaign`: `id`, `organizationId FK`, `connectionId FK`, `name`, `status` (draft/scheduled/running/completed/failed), `scheduledAt DateTime?`, `message Text`, `mediaUrl String?`, `recipientCount Int @default(0)`, `sentCount Int @default(0)`, `createdAt`, `updatedAt`
- [ ] Criar model `CampaignRecipient`: `id`, `campaignId FK`, `contactId FK`, `phoneNumber`, `status` (pending/sent/delivered/failed), `sentAt DateTime?`, `error String?`
- [ ] Controller em `src/server/communication/dispatch/` com actions: `list`, `create`, `schedule`, `cancel`, `getStats`
- [ ] Migration SQL criada manualmente
- [ ] `tsc --noEmit` passa

---

### US-006: Criar módulo Communication — templates HSM WhatsApp

**Descrição:** Como usuário, quero criar e gerenciar templates aprovados pela Meta (HSM) para uso em disparos e automações.

**Acceptance Criteria:**
- [ ] Criar model `MessageTemplate`: `id`, `organizationId FK`, `connectionId FK`, `name`, `category` (MARKETING/UTILITY/AUTHENTICATION), `language String`, `status` (PENDING/APPROVED/REJECTED), `headerType` (NONE/TEXT/IMAGE/VIDEO/DOCUMENT), `headerContent String?`, `body Text`, `footer String?`, `buttons Json?`, `metaTemplateId String?`, `createdAt`, `updatedAt`
- [ ] Controller em `src/server/communication/templates/` com actions: `list`, `create`, `sync` (sync com Meta API)
- [ ] Migration SQL criada manualmente
- [ ] `tsc --noEmit` passa

---

### US-007: Criar módulo Features — URL Shortener com tracking

**Descrição:** Como usuário, quero criar links curtos rastreáveis para enviar em mensagens WhatsApp e ver quantos cliques cada link teve.

**Acceptance Criteria:**
- [ ] Criar model `ShortLink`: `id`, `organizationId FK`, `originalUrl Text`, `slug String @unique`, `clicks Int @default(0)`, `createdById FK`, `expiresAt DateTime?`, `createdAt`
- [ ] Criar model `ShortLinkClick`: `id`, `shortLinkId FK`, `ipAddress String?`, `userAgent String?`, `countryCode String?`, `clickedAt DateTime`
- [ ] Controller em `src/server/features/short-link/` com actions: `list`, `create`, `getStats`, `delete`
- [ ] Rota pública `/s/[slug]` em `src/app/s/[slug]/route.ts` que redireciona e registra click
- [ ] Migration SQL criada manualmente
- [ ] `tsc --noEmit` passa
- [ ] Verificar redirect no browser com dev-browser skill

---

### US-008: Atualizar documentação CLAUDE.md com nova estrutura modular

**Descrição:** Como desenvolvedor, quero que o `CLAUDE.md` reflita a nova estrutura modular com a tabela de skills atualizada e a estrutura de pastas correta.

**Acceptance Criteria:**
- [ ] `CLAUDE.md` atualizado: seção "Estrutura do Projeto" reflete os 6 módulos
- [ ] Tabela de skills inclui mapeamento módulo → skill:
  - `core/` → `auth.md` + `admin.md`
  - `communication/` → `conversations.md` + `integrations.md`
  - `crm/` → (nova skill a criar: `crm.md`)
  - `features/` → (nova skill a criar: `features.md`)
  - `integration/` → `integrations.md`
  - `ai/` → (nova skill a criar: `ai.md`)
- [ ] `docs/ERD.md` atualizado com novos models (Lead, Campaign, MessageTemplate, ShortLink)

---

## Functional Requirements

- **FR-1:** A estrutura `src/server/[módulo]/[feature]/` deve ser adotada para todos os 35 features existentes
- **FR-2:** Cada módulo deve ter um `index.ts` exportando todos os seus controllers
- **FR-3:** O `src/igniter.router.ts` deve importar dos barrel files de cada módulo
- **FR-4:** Prefixos de API devem seguir `/api/v1/[módulo]/[recurso]` (sem quebrar rotas existentes via redirect)
- **FR-5:** Novos models (Lead, Campaign, MessageTemplate, ShortLink) devem usar `@@map()` snake_case e `@@schema()` correto (alinhado com prd-schema-overhaul.md)
- **FR-6:** Zero downtime — reorganização não deve quebrar chamadas de API ativas
- **FR-7:** `tsc --noEmit` passa após cada US

---

## Non-Goals

- **Não migrar** para NestJS — Quayer permanece em Next.js + Igniter.js
- **Não implementar** automações no-code (motor de automações é uma epic separada)
- **Não implementar** catálogo WhatsApp (requer Meta Product Catalog API)
- **Não implementar** gamificação (fora do MVP)
- **Não quebrar** nenhum endpoint de API existente sem redirect/alias

---

## Ordem de Execução Obrigatória

```
Fase 1 — Reorganização de código (sem novas features):
  US-001 (estrutura pastas) → US-002 (prefixos API) → US-003 (frontend)

Fase 2 — Novas features por módulo:
  US-004 (leads) → US-005 (dispatch) → US-006 (templates HSM) → US-007 (URL shortener)

Fase 3 — Documentação:
  US-008
```

**Atenção:** Fase 2 depende do `prd-schema-overhaul.md` estar completo (especialmente US-008 que cria schema `sales` e `messaging`).

---

## Technical Considerations

### Igniter.js barrel pattern
Cada módulo terá um `index.ts`:
```typescript
// src/server/core/index.ts
export { authController } from './auth'
export { organizationsController } from './organizations'
// ...

// src/igniter.router.ts
import * as core from './core'
import * as communication from './communication'
```

### Prefixos de API sem breaking change
Manter rotas antigas como aliases por 1 release:
```typescript
// Rota nova
path: '/api/v1/crm/contacts'

// Alias temporário (remover na próxima major)
path: '/api/v1/contacts' // redireciona para nova rota
```

### Alinhamento com prd-schema-overhaul.md
Este PRD (architecture) e o PRD de schema devem ser executados na mesma sprint. Os schemas PostgreSQL (`auth`, `messaging`, `sales`, etc.) mapeiam 1:1 com os módulos de código (`core`, `communication`, `crm`).

| Schema PostgreSQL | Módulo de código |
|-------------------|-----------------|
| `auth` | `core/` |
| `messaging` | `communication/` |
| `sales` | `crm/` |
| `platform` | `features/` |
| `ai` | `ai/` + `integration/` |

---

## Success Metrics

- Todos os 35 features migrados para estrutura modular sem erros TypeScript
- Novos devs conseguem identificar onde adicionar código sem perguntar
- `tsc --noEmit` e `prisma validate` passam 100%
- 4 novas features adicionadas (leads, dispatch, templates, URL shortener)
- Nenhum endpoint quebrado (smoke test via `scripts/test-pages.py`)

---

## Open Questions

1. Os prefixos de rota atuais (`/api/v1/contacts`, `/api/v1/messages`) são usados por integrações externas (N8n, webhooks de clientes)? Se sim, precisamos manter aliases por mais tempo.
2. FaleComigo usa RabbitMQ para dispatch — Quayer deve usar BullMQ (já configurado) ou seguir o mesmo padrão?
3. O módulo `Integration` do FaleComigo cobre WhatsApp Cloud API (Meta nativo) além de Evolution API — Quayer deve suportar ambos?
4. `bots` vai para `communication/` ou `ai/`? No FaleComigo fica em Communication; no Quayer faz mais sentido em AI dada a dependência dos LLMs.
