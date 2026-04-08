# PRD: Docs Cleanup & Update (Pos-Auditoria Brutal)

## Introduction

Auditoria brutal de 2026-03-16 identificou 17 docs desatualizados e 3 paginas orfas no auth que chamam endpoints inexistentes. Este PRD cobre: (1) atualizar docs que ainda sao relevantes mas estao defasados, (2) remover/redirect paginas orfas do auth legacy, (3) sync de docs de implementacao com as mudancas do auth-platform-hardening.

## Goals

- Eliminar informacao desatualizada que causa confusao para devs e agentes AI
- Sync docs de implementacao com estado real do codigo (passwordless auth, novo sidebar, pagination)
- Remover paginas orfas que chamam endpoints deletados (`register`, `forgotPassword`, `resetPassword`)
- Atualizar checklists de validacao para refletir fluxos atuais

## User Stories

### US-001: Remover paginas orfas do auth
**Description:** As a developer, I want orphaned auth pages removed so users don't hit broken flows.

**Acceptance Criteria:**
- [ ] `/register` page (`src/app/(auth)/register/page.tsx`) redireciona para `/signup` via `redirect()` do Next.js
- [ ] `/forgot-password` page (`src/app/(auth)/forgot-password/page.tsx`) redireciona para `/login` com mensagem
- [ ] `/reset-password/[token]` page (`src/app/(auth)/reset-password/[token]/page.tsx`) redireciona para `/login`
- [ ] Middleware `PUBLIC_PATHS` mantém estas rotas como publicas (para o redirect funcionar)
- [ ] Nenhum link interno aponta para `/register`, `/forgot-password`, ou `/reset-password`
- [ ] Typecheck passa

### US-002: Atualizar ADMIN_JOURNEY_AUDIT.md
**Description:** As a developer, I want the audit doc refreshed so I know which issues were fixed.

**Acceptance Criteria:**
- [ ] Cada um dos 53 issues tem status atualizado (FIXED / OPEN / WONTFIX)
- [ ] Issues resolvidos na sessao 2026-03-16 marcados: pagination integracoes, ip-rules uuid, unblockAI dialog, code splitting settings, sidebar refactor
- [ ] Data de ultima atualizacao reflete 2026-03-16
- [ ] Contagem de issues abertos vs fechados no topo

### US-003: Sync ONBOARDING_IMPLEMENTATION.md
**Description:** As a developer, I want the onboarding doc updated to reflect passwordless-only auth.

**Acceptance Criteria:**
- [ ] Remover referencias a registro por senha
- [ ] Fluxo descrito: signup OTP → verify → /integracoes (sem onboarding separado para OTP signup)
- [ ] Fluxo Google OAuth: login → onboarding (se needsOnboarding) → auto-create org
- [ ] Paths de arquivo corretos (`src/server/core/auth/` nao `src/server/features/auth/`)

### US-004: Sync USER_MANAGEMENT_IMPLEMENTATION.md
**Description:** As a developer, I want the user management doc updated with device sessions and SCIM.

**Acceptance Criteria:**
- [ ] Mencionar DeviceSession model e endpoints (6 endpoints)
- [ ] Mencionar SCIM provisioning (3 endpoints)
- [ ] Mencionar Custom Roles (5 endpoints, nao 6)
- [ ] Paths corretos para `src/server/core/`

### US-005: Atualizar checklists de validacao
**Description:** As a developer, I want validation checklists updated so manual testing covers current flows.

**Acceptance Criteria:**
- [ ] `guides/CHECKLIST_VALIDACAO_MANUAL_ADMIN.md` — 12 paginas admin listadas (nao 8), settings tem 8 abas
- [ ] `guides/VALIDACAO_MANUAL_COMPLETA.md` — remover testes de login por senha, adicionar testes OTP/magic link/passkey
- [ ] Ambos referenciam endpoints corretos

### US-006: Atualizar guias de deploy
**Description:** As a developer, I want deploy guides accurate for current infra.

**Acceptance Criteria:**
- [ ] `guides/DEPLOYMENT_CHECKLIST.md` — variaveis de ambiente atualizadas (TURNSTILE_*, sem SMTP obrigatorio)
- [ ] `guides/EASYPANEL_SETUP.md` — sync com docker-compose.quayer.yml atual

### US-007: Refresh propostas arquiteturais
**Description:** As a product owner, I want architectural proposals validated against current state.

**Acceptance Criteria:**
- [ ] `ANALISE-PROVEDORES-INTEGRACOES.md` — marcar o que ja foi implementado vs proposta
- [ ] `GROUPS_INTEGRATION_PLAN.md` — status de implementacao no topo
- [ ] `FASE_MARKETPLACE_AI.md` — alinhar com roadmap Q1 2026
- [ ] `MELHORIAS-WEBHOOK-SESSOES.md` — marcar melhorias ja implementadas

### US-008: Refresh jornadas de usuario
**Description:** As a developer, I want user journey docs accurate.

**Acceptance Criteria:**
- [ ] `jornadas-usuario/01-admin/oportunidades-melhoria.md` — atualizar % de progresso
- [ ] `jornadas-usuario/ANALISE-BUGS-CRIACAO-CONTA.md` — marcar bugs corrigidos pelo auth hardening
- [ ] `jornadas-usuario/ANALISE-JORNADA-WEBHOOKS.md` — status de implementacao
- [ ] `features/CHAT-AI-SUGGESTIONS-SIGNATURES.md` — status de implementacao

## Functional Requirements

- FR-1: Paginas orfas devem usar `redirect()` server-side (nao client-side) para SEO e performance
- FR-2: Nenhum doc deve referenciar `src/server/features/auth/` (path antigo) — todos devem usar `src/server/core/auth/`
- FR-3: Nenhum doc deve listar endpoints `register`, `login`, `forgotPassword`, `resetPassword`, `changePassword` como existentes
- FR-4: Contagens de endpoints devem ser: 35 auth + 6 device-sessions + 5 ip-rules + 6 permissions + 5 custom-roles = 57
- FR-5: Sidebar admin deve ser descrito como 1 grupo colapsivel "Administracao" com 12 sub-items
- FR-6: Settings deve ser descrito como 8 abas: Provedores, Email, IA, Concatenacao, Autenticacao, API Keys, Seguranca, Sistema

## Non-Goals

- Nao reescrever docs do zero — apenas atualizar secoes desatualizadas
- Nao criar novos docs
- Nao implementar features descritas nas propostas arquiteturais
- Nao alterar o sistema de auth (apenas a documentacao)

## Technical Considerations

- Paginas orfas: usar `import { redirect } from 'next/navigation'` no Server Component
- Grep por `src/server/features/auth` em todos os docs para encontrar paths antigos
- Grep por `register.*endpoint\|forgotPassword\|resetPassword\|changePassword` para encontrar refs a endpoints removidos

## Success Metrics

- Zero docs referenciando endpoints inexistentes
- Zero docs com paths `src/server/features/` (todos migrados para `src/server/core/`)
- 3 paginas orfas redirecionam corretamente
- Todos os 17 docs marcados como UPDATE passam a ser KEEP

## Open Questions

- Devemos manter `/register` como redirect permanente ou deletar a pagina completamente?
- `FASE_MARKETPLACE_AI.md` ainda e relevante para o roadmap atual ou pode ser arquivado?
