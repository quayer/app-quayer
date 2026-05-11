# Documentação Quayer

Documentação técnica do Quayer — plataforma de Builder IA para agentes WhatsApp.

## Diretórios

| Pasta | Conteúdo |
|---|---|
| [`auth/`](./auth/) | Autenticação: fluxos, OAuth, contract testing, baselines, a11y, coverage |
| [`builder/`](./builder/) | Builder IA: arquitetura do agente, UX do chat, preview tabs, user journey |
| [`infra/`](./infra/) | DevOps: deploy, hardening, rollback runbook, monitoring sintético, secrets |
| [`strategy/`](./strategy/) | Estratégia de produto/negócio: conceito, modelo, setores, pipeline, pesquisa |
| [`testing/`](./testing/) | Padrões de teste: debugging, módulo auth, test data, synthetic monitoring |
| [`deprecated/`](./deprecated/) | Features removidas — código preservado no git, recupere via `git log` |

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

A pasta [`deprecated/`](./deprecated/) preserva referências históricas de features removidas (e.g., [`ADMIN_SURFACE_REMOVED.md`](./deprecated/ADMIN_SURFACE_REMOVED.md) — nuke do admin em Mai/2026). O código continua acessível via histórico Git — use `git log --all -- <path>` para localizar.
