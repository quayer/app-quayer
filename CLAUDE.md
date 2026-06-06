# CLAUDE.md — Instruções para Claude Code

<!--
Criado: 2026-04-08
Atualizado: 2026-05-11
Revisar em: 2026-08-11 (3 meses) — ou quando mudar estrutura de src/, igniter.router.ts, ou skills
Relacionados:
  - src/igniter.router.ts (lista de controllers)
  - prisma/schema.prisma (tabela Prisma)
  - .claude/skills/* (todas as skills referenciadas)
  - docs/AUTH_MAP.md
  - docs/deprecated/ADMIN_SURFACE_REMOVED.md
-->

## Identidade
**Agente:** Claude Code (Anthropic) rodando no **Antigravity IDE**
**Projeto:** Quayer — plataforma de Builder IA para agentes WhatsApp
**Foco:** 100% no produto Builder IA. **Não tem mais admin UI** (operações via Claude Code/MCP + SQL).
**Comunicação:** Português (técnico em inglês)

---

## Início de Sessão — Fazer SEMPRE

1. Ler `MEMORY.md` em `.claude/projects/.../memory/MEMORY.md` para contexto rápido
2. Identificar o módulo da tarefa e carregar a skill correspondente:

| Módulo | O que tem hoje | Skill |
|---|---|---|
| `core/auth/` | email-otp, magic-link, oauth-google, passkey, phone-otp, totp, identity, session, device-sessions, procedures | `.claude/skills/auth.md` |
| `core/` (outros) | api-keys, billing, onboarding, system-settings | `.claude/skills/auth.md` |
| `communication/` | messages, services (esqueleto) | `.claude/skills/integrations.md` |
| `features-module/` | logs | `.claude/skills/admin.md` |
| `ai-module/builder/` | ⭐ produto principal: projects, chat, deploy, sub-agents, tools, skills | `.claude/skills/quayer-builder.md` |
| `ai-module/` (outros) | ai-agents (runtime WhatsApp), shared | `.claude/skills/quayer-builder.md` |
| `frontend/` | componentes UI, layouts, páginas | `.claude/skills/design.md` |
| `testing/` | testes unit/integration/e2e, CI workflows | `.claude/skills/testing-pipeline.md` |
| `infra/` | Caddyfile, docker-compose prod, deploy, hardening | `.claude/skills/infra.md` |

3. Para bugs: seguir protocolo `.claude/protocols/react-debug.md`
4. **Operações de admin (gerenciar orgs, users, etc):** usar Claude Code + Prisma MCP + SQL direto. Não tem painel UI.
5. **Manutenção de docs:** sempre seguir `.claude/skills/doc-freshness.md` — frontmatter com data + revisar-em + cascade nos relacionados.

---

## 🚨 REGRAS CRÍTICAS (sempre verificar)

Estas regras valem em TODA conversa. Quando você mexer em um arquivo da coluna esquerda, **obrigatório** revisar/atualizar os da direita ANTES do commit.

| Mudou | Revisar / atualizar | Por quê |
|---|---|---|
| `src/middleware.ts` | `docs/AUTH_MAP.md` + `docs/auth/AUTH_FLOW.md` + `docs/auth/USER_JOURNEY.md` | middleware = source of truth de redirects |
| `prisma/schema.prisma` | `docs/ERD.md` + tabela Prisma no CLAUDE.md | schema = source of truth do DB |
| `src/igniter.router.ts` | `CLAUDE.md` (lista controllers) + `docs/AUTH_MAP.md` | router = porta de entrada API |
| Redirect em login flow | `docs/AUTH_MAP.md` + `docs/auth/USER_JOURNEY.md` | rota afeta UX final |
| Deletou feature/módulo | criar/atualizar `docs/deprecated/<FEATURE>.md` + remover refs em CLAUDE.md | evita zumbi de código |
| `infra/prod/Caddyfile` | `infra/README.md` + `docs/infra/HOMOL_SETUP.md` | roteamento = produção |
| `package.json` deps Igniter | `CLAUDE.md` patterns + skill `igniter.md` | API contracts mudam |
| `.env.example` | `docs/infra/SECRETS.md` | novos segredos = nova rotação |

**Toda doc nova ou alterada deve ter frontmatter:**
```yaml
---
Criado: YYYY-MM-DD
Atualizado: YYYY-MM-DD
Revisar em: <data ou trigger>
Relacionados:
  - path/x
---
```

Ver `.claude/skills/doc-freshness.md` para a regra completa (cadências por tipo de doc, política de docs antigos, verificação automática).

---

## Protocolo de Desenvolvimento

### Antes de editar qualquer arquivo
1. Ler o arquivo antes de modificar (obrigatório)
2. Carregar skill do domínio
3. Entender a causa raiz antes de agir

### Ordem de implementação de features
```
schema Prisma → migration → Zod schema → interfaces → repository → routes → controller → frontend
```

### Nunca
- Editar `igniter.client.ts` ou `igniter.schema.ts` (auto-gerados)
- Usar `prisma db push --accept-data-loss` em produção
- Fazer múltiplas mudanças simultâneas sem validar cada uma
- Assumir como o código funciona sem ler
- **Recriar admin UI** — operações via Claude Code/MCP, ver `docs/deprecated/ADMIN_SURFACE_REMOVED.md`

---

## Estrutura do Projeto (real, Mai/2026)

```
src/
├── app/                     # Next.js App Router
│   ├── (auth)/              → login, signup, verify, verify-magic,
│   │                          google-callback
│   ├── (public)/            → termos, privacidade
│   ├── api/                 → v1/[[...all]] (Igniter catch-all),
│   │                          health, docs, _canary
│   ├── conta/               → perfil user
│   ├── projetos/            → ⭐ lista + workspace Builder (/projetos/[id])
│   ├── user/seguranca/      → 2FA, sessions, passkeys (user-facing)
│   ├── page.tsx             → ⭐ home Builder
│   └── layout.tsx           → root layout
│
├── server/                  # BACKEND
│   ├── core/
│   │   ├── api-keys/
│   │   ├── auth/            → 23 actions Igniter, login flows + 2FA + OAuth
│   │   ├── billing/
│   │   ├── onboarding/
│   │   └── system-settings/
│   ├── communication/
│   │   ├── messages/
│   │   └── services/
│   ├── features-module/
│   │   └── logs/            → controllers: logs + logs-sse (8 actions)
│   ├── ai-module/
│   │   ├── ai-agents/       → runtime dos agentes WhatsApp (sem controller registrado)
│   │   ├── builder/         → ⭐ DESIGN-TIME: projects + chat + cards + deploy (+ channel/identity/calendar/knowledge/pricing/credential)
│   │   │   ├── chat/        → conversação com meta-agente (+ getReadiness: GET /builder/projects/:id/readiness)
│   │   │   ├── cards/       → card-action protocol (Orayon Uplift): POST /builder/projects/:id/cards/:cardKey/submit + builder-state
│   │   │   ├── sources/     → ingestão "cole seu site/IG" (Orayon Uplift W4): POST .../sources/ingest + GET .../sources/status + source-enrich job
│   │   │   ├── state/       → step-engine determinístico (nextPendingStep + getReadiness resolver)
│   │   │   ├── projects/    → CRUD de BuilderProject
│   │   │   ├── deploy/      → saga de publicação cross-module
│   │   │   ├── sub-agents/  → deploy-runner, niche-researcher, prompt-writer, validator
│   │   │   ├── tools/       → catálogo + runtime CUSTOM
│   │   │   ├── skills/      → skills do meta-agente
│   │   │   └── templates/, prompts/, validators/, services/
│   │   └── shared/
│   └── services/            → database (Prisma), redis, store, jobs (BullMQ),
│                              logger, storage, telemetry (Sentry/OTel)
│
├── client/                  # FRONTEND
│   ├── components/
│   │   ├── projetos/        → ⭐ 44 arquivos — chat, preview tabs, cards
│   │   ├── home/            → home Builder
│   │   ├── layout/          → AppShell, BuilderSidebar
│   │   ├── auth/, settings/, whatsapp/
│   │   ├── ds/, ui/         → design system + shadcn
│   │   └── custom/, providers/
│   └── hooks/
│
├── lib/                     # Cross-cutting
│   ├── auth/                → JWT (edge + node), roles, CSRF, bcrypt, OAuth, AuthProvider
│   ├── email/               → React Email templates + service
│   ├── feature-flags/       → auth-v3 (rollout das auth pages com tokens DS v3)
│   ├── api/, uaz/           → clientes externos (UAZ WhatsApp)
│   ├── logs/                → logger + api-logger middleware
│   ├── rate-limit/, geocoding/, providers/, utils/, crypto.ts, config.ts
│
├── igniter.ts               # Init framework
├── igniter.router.ts        # 8 controllers: auth, builder, device-sessions, logs, logs-sse, messages, departments, providers
├── igniter.client.ts        # auto-gerado — NÃO EDITAR
├── igniter.schema.ts        # auto-gerado — NÃO EDITAR
└── middleware.ts            # Edge auth + redirects
```

### Modelos Prisma Relevantes
| Modelo | Módulo | Tabela |
|---|---|---|
| `BuilderProject`, `BuilderProjectConversation`, `BuilderProjectMessage`, `BuilderPromptVersion`, `BuilderDeployment`, `BuilderToolCall`, `BuilderContextSnapshot` | ai-module/builder | `builder_*` |
| `KnowledgeCollection`, `KnowledgeSource`, `KnowledgeChunk`, `KnowledgeImage` (pgvector) | ai-module (RAG/base de conhecimento + catálogo visual Onda D) | `knowledge_*` (`knowledge_images`) |
| `AgentRuntimeDecision` (observabilidade por turno, sem FK) | ai-module/ai-agents | `agent_runtime_decisions` |
| `PriceList`, `PriceItem` (catálogo da tool get_pricing; M2: PriceList.disclosureStyle/minTicketCents, PriceItem.priceMaxCents/imageUrl) | ai-module (pricing) | `price_lists`, `price_items` |
| `CalendarConnection`, `Department`, `DepartmentMember` | builder/communication (calendário + roleta) | `calendar_connections`, `departments` |
| `Organization`, `OrganizationProvider` | core (sem módulo dedicado) | `organizations`, `organization_providers` |
| `Invitation`, `Notification`, `NotificationRead`, `NotificationPreferences` | (modelos preservados, sem controllers) | — |
| `Campaign`, `CampaignRecipient`, `ShortLink`, `ShortLinkClick` | communication (schema only) | `campaigns`, `short_links` |
| `User`, `UserPreferences`, `DeviceSession`, `TotpDevice`, `RecoveryCode` | core/auth | — |

**Importante:** vários modelos preservados (Invitation, Notification, etc.) **não têm controller ativo**. Restaurar quando precisar — ver `docs/deprecated/ADMIN_SURFACE_REMOVED.md`. Inventário completo dos modelos dormentes/órfãos em `docs/deprecated/SCHEMA_DORMANT_MODELS.md`.

---

## Padrões Igniter.js — Referência Rápida

```typescript
// Controller (composer pattern — preferir split em routes files)
export const controller = igniter.controller({
  name: 'resource',
  path: '/resource',
  actions: {
    ...listRoutes,
    ...mutationRoutes,
  }
})

// Route file (toda a lógica vive aqui)
export const listRoutes = {
  list: igniter.query({
    use: [authProcedure()],
    handler: async ({ response, context }) => response.success(data),
  }),
}

// Contexto autenticado
const user = context.auth?.session?.user   // User do DB
const orgId = user?.currentOrgId           // Org ativa

// Client (Server Component)
const data = await api.resource.list.query()

// Client (Client Component)
const { data } = api.resource.list.useQuery()
```

---

## Ferramentas Ativas no Antigravity

| Ferramenta | Status | Uso |
|---|---|---|
| Claude Code | ✅ Ativo | Agente principal |
| MCP Playwright | ✅ Disponível | Testes browser |
| MCP Shadcn | ✅ Disponível | Instalar componentes |
| MCP Prisma | ✅ Ativo (Antigravity) | Schema e migrations |
| MCP Supabase | ✅ Ativo | Operações de DB (substituir admin UI) |
| MCP sequential-thinking | ✅ Ativo (Antigravity) | Raciocínio estruturado |

**Config MCPs Antigravity:** `C:\Users\gabri\.gemini\antigravity\mcp_config.json`

---

## Pastas — O que é cada uma

```
.claude/skills/      → Skills por domínio (USAR ESTES) ✅
.claude/protocols/   → Protocolo ReAct de debug ✅
.claude/projects/    → Memória persistente do Claude Code ✅
.github/workflows/   → CI/CD GitHub Actions ✅
docs/                → Documentação técnica
docs/deprecated/     → Features removidas (ressuscitar via git se precisar)
scripts/             → Automação (deploy, baselines, test DB). Ver scripts/README.md ✅
infra/               → IaC (Caddyfile, supabase, n8n, prod compose)
```

---

## Qualidade de Código

- Zero tipos `any` — TypeScript strict
- Zod em todos os inputs de API
- Filtrar por `organizationId` em todos os queries de negócio
- `authProcedure({ required: true })` em rotas protegidas
- Testes: Playwright (E2E), Vitest (unit)
- **Sem código morto:** se uma feature for removida, deletar arquivos. Git preserva o histórico.

---

## Testing Pipeline (5 camadas)

Skill: `.claude/skills/testing-pipeline.md` — carregar antes de escrever qualquer teste.

| # | Camada | Comando | Quando usar |
|---|---|---|---|
| 1 | Static Analysis | `npm run lint && npx tsc --noEmit` | Sempre antes de commit (husky pre-commit + CI) |
| 2 | Unit Backend | `npm run test:unit` | Mudou lógica pura (OTP, JWT, Zod, procedures) |
| 3 | Unit React | `npm run test:react` | Mudou componente de auth ou form |
| 4 | API Integration | `npm run test:api` | Mudou endpoint ou contrato backend |
| 5 | E2E | `npm run test:e2e` (local) / `test:e2e:homol` | Mudou fluxo completo de usuário |
| All | Pipeline completo | `npm run test:all` | Antes de release |

**Regra dura:** nenhuma release de auth sem `npm run test:all` verde.

**Infra de teste:**
- Postgres isolado: `npm run test:db:up` (compose.test.yml, porta 5433)
- Playwright 3 projects: local / homol / prod (prod é read-only smoke apenas)
- Synthetic monitor em prod: `.github/workflows/synthetic-monitor.yml` (cron 5min)

---

## Release Process

Skill: `.claude/skills/release-checklist.md` — carregar antes de qualquer deploy prod.

**Gate obrigatório:**
1. `npm run test:all` verde local
2. CI verde no PR (static + test:api + test:e2e + synthetic)
3. Baselines comparadas com `docs/infra/BASELINES.md` seção 8 (p95 não degradou > 20%)
4. Rollback plan lido: `docs/infra/ROLLBACK_RUNBOOK.md`
5. Smoke homol passou após deploy homol (`.github/workflows/smoke-homol.yml`)
6. Revisão humana do PR (não apenas LLM)

**Gate de rollback (automático — disparar imediatamente se):**
- Taxa de erro HTTP 5xx > 2% por 5 minutos
- p95 de /login ou /signup degradado > 50% vs baseline
- Synthetic monitor falhando 3 runs consecutivos
- Qualquer report de perda de dados de usuário

**Comando de rollback:** `./scripts/deploy.sh prod <hash-anterior>`

**Memory note:** após push, disparar Homol Deploy sem pedir confirmação; prod continua exigindo aprovação.

---

## Aprovação Obrigatória Antes de Fazer

- Mudanças no schema Prisma (novas migrations)
- Alterações em middleware.ts
- Push para repositório remoto
- Deploy em produção
- Deletar arquivos de produção
