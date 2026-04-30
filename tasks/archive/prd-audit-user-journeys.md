# PRD: Audit Completo — Jornadas do Usuário (Non-Admin)

## Introduction

Após concluir o audit brutal de todas as 10 páginas admin (segurança, features quebradas, UX), este PRD cobre o audit das **jornadas do usuário comum** — desde o auth flow até conversas, integrações, ferramentas e configurações. O objetivo é garantir que cada página funciona corretamente (front→API→back), com UX acessível, responsivo e sem vieses cognitivos.

**33 rotas mapeadas** no total. Este PRD cobre as 23 rotas não-admin organizadas em 6 jornadas.

---

## Goals

- Validar que cada página renderiza sem erros (build + runtime)
- Confirmar que todos endpoints/actions existem e estão protegidos com `authProcedure`
- Identificar e corrigir issues de UX (vieses cognitivos, acessibilidade, responsividade)
- Garantir dark mode funcional em todas as páginas
- Eliminar `as any`, `error: any`, imports não utilizados
- Validar loading/error/empty states em toda página

---

## User Stories

### US-001: Audit Auth Flow — Login/Signup/Register
**Description:** As a QA, I want to validate the complete authentication flow so that users can login/signup without friction.

**Scope:**
- `/login` — PhoneInput, email toggle, form validation
- `/login/verify` — OTP input, resend timer, error handling
- `/login/verify-magic` — Magic link verification
- `/signup` — Registration form, validation
- `/signup/verify` + `/signup/verify-magic` — Signup verification
- `/register` — Invite-based registration (token param)
- `/forgot-password` — Password reset request
- `/reset-password/[token]` — Password reset form
- `/verify-email` — Email verification
- `/google-callback` — OAuth callback

**Acceptance Criteria:**
- [ ] Todas as 10 páginas auth renderizam sem erros
- [ ] Forms validam inputs antes de submit (email format, phone format, OTP length)
- [ ] Error states mostram mensagens claras (não genéricas)
- [ ] Loading states com spinners/skeletons em todos os forms
- [ ] Redirect flow correto: login → verify → redirect param ou /integracoes
- [ ] Dark mode funcional em todas as páginas auth
- [ ] Responsivo: funciona em 320px width
- [ ] Sem `as any` ou `error: any`
- [ ] Typecheck passes

---

### US-002: Audit Onboarding
**Description:** As a new user, I want a smooth onboarding experience so that I can set up my organization quickly.

**Scope:**
- `/onboarding` — Organization creation + business hours setup

**Acceptance Criteria:**
- [ ] Form steps funcionam em sequência (org → business hours)
- [ ] Validação Zod no backend para dados de org
- [ ] Redirect para `/integracoes` após completar
- [ ] Não permite acessar se onboarding já completado
- [ ] Loading/error states
- [ ] Dark mode e responsivo
- [ ] Typecheck passes

---

### US-003: Audit Integrations Hub — `/integracoes`
**Description:** As a user, I want to manage my WhatsApp instances so that I can connect and monitor my channels.

**Scope:**
- `/integracoes` — Main dashboard: list instances, status, actions
- `/integracoes/[instanceId]/settings` — Instance settings (business hours, autopause, IP rules)
- `/integracoes/dashboard` — Metrics dashboard (stats, charts)

**Acceptance Criteria:**
- [ ] Lista de instâncias carrega com status correto (connected/disconnected)
- [ ] Ações por instância: connect, disconnect, edit, share, QR code
- [ ] Settings page carrega todas as tabs sem erro
- [ ] Dashboard metrics renderiza charts corretamente
- [ ] Endpoints: instances controller, connection-settings controller
- [ ] `authProcedure` em todas as rotas
- [ ] Filtra por `organizationId` (multi-tenant isolation)
- [ ] Loading/error/empty states
- [ ] Dark mode e responsivo
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-004: Audit Conversations — `/conversas`
**Description:** As a user, I want to view and manage WhatsApp conversations so that I can respond to customers.

**Scope:**
- `/conversas/[sessionId]` — Chat view: messages, input, contact sidebar
- Redirects: `/conversas` → `/integracoes/conversations`, `/integracoes/sessions` → `/conversas`

**Acceptance Criteria:**
- [ ] Chat carrega mensagens com scroll correto (bottom-up)
- [ ] Input de mensagem funciona (text, media)
- [ ] Contact sidebar mostra info do contato
- [ ] Sessions controller: list, getById, messages
- [ ] Real-time updates (SSE/polling)
- [ ] `authProcedure` + `organizationId` filter
- [ ] Loading/error/empty states (sem mensagens, sessão não encontrada)
- [ ] Dark mode e responsivo (mobile-first chat layout)
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-005: Audit Contacts — `/contatos`
**Description:** As a user, I want to manage my contacts/leads directory so that I can track customer information.

**Scope:**
- `/contatos` — Contacts list with search, filter, management
- `/contatos/[id]` — Contact detail: profile, conversation history, custom fields

**Acceptance Criteria:**
- [ ] Lista de contatos carrega com paginação
- [ ] Search funciona (server-side, não client-side only)
- [ ] Contact detail mostra histórico de conversas
- [ ] Endpoints: contacts controller
- [ ] `authProcedure` + `organizationId` filter
- [ ] Loading/error/empty states
- [ ] Dark mode e responsivo
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-006: Audit Tools — `/ferramentas`
**Description:** As a user, I want to access webhooks, quick replies, and Chatwoot integration from a central tools hub.

**Scope:**
- `/ferramentas` — Tools hub page
- `/ferramentas/webhooks` — Webhook CRUD
- `/ferramentas/respostas-rapidas` — Quick replies CRUD
- `/ferramentas/chatwoot` — Chatwoot integration

**Acceptance Criteria:**
- [ ] Hub page links para todas as ferramentas
- [ ] Webhooks: CRUD completo, test webhook, event selection
- [ ] Quick replies: CRUD com preview
- [ ] Chatwoot: configuração funcional
- [ ] Endpoints: webhooks, quick-replies controllers
- [ ] `authProcedure` + `organizationId` filter
- [ ] Loading/error/empty states
- [ ] Dark mode e responsivo
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-007: Audit User Settings — `/integracoes/settings`
**Description:** As a user, I want to manage my account and organization settings.

**Scope:**
- `/integracoes/settings` — User settings (theme, timezone, language, notifications)
- `/integracoes/settings/organization` — Org settings (8 tabs: general, sessions, providers, branding, team, SMTP, domain, infrastructure)
- `/integracoes/settings/organization/integrations` — Third-party provider integrations (OpenAI, Anthropic, Google, ElevenLabs, Deepgram)
- `/integracoes/users` — Team members management

**Acceptance Criteria:**
- [ ] User settings salva preferências corretamente
- [ ] Org settings: todas as 8 tabs carregam sem erro
- [ ] Provider integrations: API key input, test connection
- [ ] Team members: list, invite, change role, remove
- [ ] Endpoints: system-settings, organizations, invitations controllers
- [ ] `authProcedure` + role checks (master/manager can edit, user can view)
- [ ] Loading/error/empty states
- [ ] Dark mode e responsivo
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-008: Audit User Security — `/user/seguranca`
**Description:** As a user, I want to manage my device sessions and security settings.

**Scope:**
- `/user/seguranca` — Device sessions, revoke devices
- `/user/dashboard` — User dashboard (instance overview, activity)

**Acceptance Criteria:**
- [ ] Device sessions lista com device name, IP, last active
- [ ] Revoke funciona com confirmation dialog
- [ ] Dashboard mostra overview correto
- [ ] Endpoints: device-sessions controller (user-scoped, not admin)
- [ ] `authProcedure` presente
- [ ] Loading/error/empty states
- [ ] Dark mode e responsivo
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-009: Audit Public Pages
**Description:** As a visitor, I want to access public pages (docs, terms, share links) without authentication.

**Scope:**
- `/(public)/docs` — API documentation (Scalar)
- `/(public)/termos` — Terms of Service
- `/(public)/privacidade` — Privacy Policy
- `/(public)/connect/[token]` — WhatsApp connection invite
- `/(public)/compartilhar/[token]` — Share session page

**Acceptance Criteria:**
- [ ] Todas as páginas públicas renderizam sem auth
- [ ] Docs page carrega OpenAPI spec corretamente
- [ ] Connect/Share pages: token validation, QR code display, polling
- [ ] Sem info sensível exposta em páginas públicas
- [ ] Dark mode e responsivo
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

---

### US-010: Cross-Journey UX Polish
**Description:** As a user, I want consistent UX patterns across all pages.

**Scope:** All pages — global consistency check

**Acceptance Criteria:**
- [ ] Sidebar navigation funciona em todas as páginas (collapse, mobile)
- [ ] Breadcrumbs consistentes
- [ ] Toast notifications para todas as ações (success/error)
- [ ] Confirm dialogs em ações destrutivas (delete, revoke, disconnect)
- [ ] Loading skeletons (não spinners genéricos)
- [ ] Empty states informativos (não "Nenhum dado")
- [ ] Error states com retry button
- [ ] Keyboard navigation funcional (Tab, Enter, Escape)
- [ ] Focus management em modals/dialogs
- [ ] Typecheck passes

---

## Functional Requirements

- FR-1: Toda rota protegida deve ter `authProcedure({ required: true })` no backend
- FR-2: Toda query de negócio deve filtrar por `organizationId` (multi-tenant isolation)
- FR-3: Toda página deve ter loading, error e empty states
- FR-4: Toda ação destrutiva deve ter confirmation dialog (não `confirm()`)
- FR-5: Dark mode deve funcionar em todas as páginas sem cores hardcoded
- FR-6: Responsivo: funcionar de 320px a 1920px
- FR-7: Zero `as any` ou `error: any` em código novo
- FR-8: Search deve ser server-side com debounce (não client-side filter)

## Non-Goals

- Não refatorar arquitetura existente (Igniter.js patterns)
- Não adicionar features novas (apenas validar e corrigir existentes)
- Não criar testes automatizados neste PRD (será um PRD separado)
- Não mudar design system (usar shadcn/ui existente)

## Technical Considerations

- Stack: Next.js 16 + Igniter.js + Prisma + TanStack Query
- Auth: JWT (edge + Node.js) com middleware
- Multi-tenant: `organizationId` em todos os queries
- UI: shadcn/ui + Tailwind CSS
- State: Server Actions + TanStack Query (client components)

## Success Metrics

- 0 erros de build (`npm run build` passa)
- 0 `as any` em arquivos modificados
- Todas as páginas carregam em < 3s (first contentful paint)
- Todas as ações destrutivas têm confirmation
- Dark mode funcional em 100% das páginas

## Open Questions

- Priorizar qual jornada primeiro? (Recomendado: US-003 Integrations → US-004 Conversations → US-006 Tools)
- Migrar Notifications de fetch() raw para Igniter client neste sprint ou separado?
- Criar testes E2E (Playwright) como PRD separado?
