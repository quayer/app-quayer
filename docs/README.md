# Documentação Quayer

Documentação técnica do Quayer — plataforma de Builder IA para agentes WhatsApp.

## Diretórios

| Pasta | Conteúdo |
|---|---|
| [`auth/`](./auth/) | Autenticação: fluxos, OAuth, a11y, cleanup audit, user journey, code review |
| [`builder/`](./builder/) | Builder IA: arquitetura do agente, UX do chat, preview tabs, user journey |
| [`infra/`](./infra/) | DevOps: deploy, hardening, rollback runbook, monitoring sintético, secrets |
| [`strategy/`](./strategy/) | Estratégia de produto/negócio: conceito, modelo, setores, pipeline, pesquisa |
| [`testing/`](./testing/) | Padrões de teste: vitest setup, contract, integration auth, coverage, timings, debugging, synthetic monitoring |
| [`deprecated/`](./deprecated/) | Features removidas e snapshots históricos (admin UI, route migration plan, builder v5, auth v3 flag) |

## Documentos raiz

- [`AUTH_MAP.md`](./AUTH_MAP.md) — mapa visual do fluxo de autenticação
- [`CI_RULES.md`](./CI_RULES.md) — regras e gates do pipeline de CI
- [`ERD.md`](./ERD.md) — diagrama entidade-relacionamento do schema Prisma

## Destaques

- [`builder/BUILDER_AGENT_ARCHITECTURE.md`](./builder/BUILDER_AGENT_ARCHITECTURE.md) — arquitetura completa do agente Builder (referência principal)
- [`infra/ROLLBACK_RUNBOOK.md`](./infra/ROLLBACK_RUNBOOK.md) — procedimento de rollback de produção (cenários A–J)
- [`infra/BASELINES.md`](./infra/BASELINES.md) — baselines de performance para gating de release (auth breakdown na seção 8; consolidado de `auth/BASELINES.md` em 10/Mai/2026)

## Convenções

- **Idioma:** PT-BR no conteúdo, EN para termos técnicos (e.g., `mutation`, `procedure`, `worktree`)
- **Formato:** Markdown padrão, frontmatter opcional para metadados
- **Links:** sempre relativos (`./auth/AUTH_FLOW.md`), nunca absolutos
- **Nomes:** `SCREAMING_SNAKE.md` para docs técnicos, `kebab-case.md` para conteúdo de produto/estratégia

## Como contribuir

Adicione novos docs na pasta apropriada:

- Auth, OTP, OAuth, sessões → `auth/`
- Builder IA, agentes, prompts, tool calls → `builder/`
- Deploy, infra, observabilidade, secrets → `infra/`
- Modelo de negócio, pesquisa de mercado, roadmap → `strategy/`
- Padrões de teste, fixtures, debugging → `testing/`

Mantenha este índice atualizado quando criar uma nova categoria. Para PRDs ou features descontinuadas, mova para `deprecated/` em vez de deletar.

## Nota sobre `deprecated/`

A pasta [`deprecated/`](./deprecated/) preserva referências históricas de features removidas e snapshots de planejamento superados:

- [`ADMIN_SURFACE_REMOVED.md`](./deprecated/ADMIN_SURFACE_REMOVED.md) — nuke do admin UI em Mai/2026
- [`admin-prds/`](./deprecated/admin-prds/) — PRDs do antigo painel admin
- [`builder-route-migration-plan-2026-04.md`](./deprecated/builder-route-migration-plan-2026-04.md) — plan de migração de rotas (pré-nuke; `/onboarding`, `/admin/*`, `/pricing`, `/connect` foram removidas depois)
- [`builder-architecture-v5-2026-04.md`](./deprecated/builder-architecture-v5-2026-04.md) — arquitetura v5.3 do Builder (superada por `builder/BUILDER_AGENT_ARCHITECTURE.md` v18)
- [`auth-v3-feature-flag-2026-04.md`](./deprecated/auth-v3-feature-flag-2026-04.md) — `NEXT_PUBLIC_AUTH_V3` (rollout v2→v3 completo; só existem componentes `*-v3.tsx`)

O código continua acessível via histórico Git — use `git log --all -- <path>` para localizar.
