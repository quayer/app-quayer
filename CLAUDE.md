# CLAUDE.md — Instruções para Claude Code

## Identidade
**Agente:** Claude Code (Anthropic) rodando no **Antigravity IDE**
**Projeto:** Quayer — plataforma multi-tenant de WhatsApp
**Comunicação:** Português (técnico em inglês)

---

## Início de Sessão — Fazer SEMPRE

1. Ler `MEMORY.md` em `.claude/projects/.../memory/MEMORY.md` para contexto rápido
2. Identificar o módulo da tarefa e carregar a skill correspondente:

| Módulo | Features | Skill |
|---|---|---|
| `core/` | api-keys, auth, billing, device-auth, device-sessions, health, invitations, ip-rules, notifications, onboarding, organizations, permissions, scim-tokens, system-settings, verified-domains | `.claude/skills/auth.md` + `.claude/skills/admin.md` |
| `communication/` | business-profile, campaigns, connection-settings, connections, files, flows, instances, messages, services, sse, templates | `.claude/skills/conversations.md` + `.claude/skills/integrations.md` |
| `features-module/` | analytics, audit, dashboard, logs, webhooks | `.claude/skills/admin.md` |
| `integration/` | chatwoot, organization-providers | `.claude/skills/integrations.md` |
| `ai-module/` | ai, ai-agents, builder, shared | `.claude/skills/auth.md` + `.claude/skills/quayer-builder.md` |
| `frontend/` | componentes UI, layouts, páginas, landing pages, design system | `.claude/skills/design.md` |
| `testing/` | testes unit/integration/e2e, CI workflows, rollback, release | `.claude/skills/testing-pipeline.md` + `.claude/skills/release-checklist.md` |

3. Para bugs: seguir protocolo `.claude/protocols/react-debug.md`

---

## Protocolo de Desenvolvimento

### Antes de editar qualquer arquivo
1. Ler o arquivo antes de modificar (obrigatório)
2. Carregar skill do domínio
3. Entender a causa raiz antes de agir

### Ordem de implementação de features
```
schema Prisma → migration → Zod schema → interfaces → repository → controller → router → frontend
```

### Nunca
- Editar `igniter.client.ts` ou `igniter.schema.ts` (auto-gerados)
- Usar `prisma db push --accept-data-loss` em produção
- Fazer múltiplas mudanças simultâneas sem validar cada uma
- Assumir como o código funciona sem ler

---

## Estrutura do Projeto

```
src/server/
├── core/           → api-keys, auth, billing, device-auth, device-sessions,
│                     health, invitations, ip-rules, notifications, onboarding,
│                     organizations, permissions, scim-tokens, system-settings,
│                     verified-domains
├── communication/  → business-profile, campaigns, connection-settings, connections,
│                     files, flows, instances, messages, services, sse, templates
├── features-module/→ analytics, audit, dashboard, logs, webhooks
├── integration/    → chatwoot, organization-providers
├── ai-module/      → ai, ai-agents, builder, shared
└── services/       → database (Prisma), store (Redis), jobs (BullMQ)

src/app/            → Next.js App Router (páginas + API routes)
src/lib/            → auth/jwt, email, uaz, validators, utils
src/middleware.ts   → Edge middleware (auth + redirects)
src/igniter.ts      → Init Igniter.js
src/igniter.router.ts → Registro de controllers (importa dos módulos)
```

### Modelos Prisma Relevantes (pós-pivot Builder IA)
| Modelo | Módulo | Tabela |
|---|---|---|
| `Campaign`, `CampaignRecipient` | communication/ | `campaigns`, `campaign_recipients` |
| `MessageTemplate` | communication/ | `message_templates` |
| `ShortLink`, `ShortLinkClick` | (schema, sem módulo dedicado ainda) | `short_links`, `short_link_clicks` |
| `UserPreferences` | core/auth | `UserPreferences` |
| `BuilderProject`, `BuilderDeployment`, `BuilderProjectConversation`, `BuilderProjectMessage`, `BuilderPromptVersion`, `BuilderToolCall`, `BuilderContextSnapshot` | ai-module/builder | `builder_*` |

---

## Padrões Igniter.js — Referência Rápida

```typescript
// Controller
export const controller = igniter.controller({
  name: 'resource',
  path: '/resource',
  actions: {
    list: igniter.query({ use: [authProcedure()], handler: async ({ response, context }) => response.success(data) }),
    create: igniter.mutation({ body: schema, use: [authProcedure()], handler: async ({ request, response }) => response.success(result) }),
  }
})

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
| MCP sequential-thinking | ✅ Ativo (Antigravity) | Raciocínio estruturado |
| igniter-mcp | ⚠️ Configurar | Precisa GOOGLE_API_KEY + GITHUB_TOKEN |

**Config MCPs Antigravity:** `C:\Users\gabri\.gemini\antigravity\mcp_config.json`

---

## Pastas — O que é cada uma

```
.claude/skills/      → Skills por domínio (USAR ESTES) ✅
.claude/protocols/   → Protocolo ReAct de debug ✅
.claude/projects/    → Memória persistente do Claude Code ✅
.cursor/rules/       → Regras do Cursor IDE (não funciona no Claude Code)
.cursor/skills/      → Skills built-in do Claude Code ✅
.gemini/             → Antigravity IDE (não apagar)
.github/workflows/   → CI/CD GitHub Actions ✅
```

---

## Qualidade de Código

- Zero tipos `any` — TypeScript strict
- Zod em todos os inputs de API
- Filtrar por `organizationId` em todos os queries de negócio
- `authProcedure({ required: true })` em rotas protegidas
- Testes: Playwright (E2E), Vitest (unit)

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
| Extra | Contract | `npx vitest --config vitest.config.contract.ts` | Validar shape de response |
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
3. Baselines comparadas com `docs/auth/BASELINES.md` (p95 não degradou > 20%)
4. Rollback plan lido: `docs/infra/ROLLBACK_RUNBOOK.md` — cenário identificado (A-J)
5. Smoke homol passou após deploy homol (`.github/workflows/smoke-homol.yml`)
6. Revisão humana do PR (não apenas LLM)

**Gate de rollback (automático — disparar imediatamente se):**
- Taxa de erro HTTP 5xx > 2% por 5 minutos
- p95 de /login ou /signup degradado > 50% vs baseline
- Synthetic monitor falhando 3 runs consecutivos
- Qualquer report de perda de dados de usuário

**Comando de rollback:** `./scripts/deploy.sh prod <hash-anterior>` — ver ROLLBACK_RUNBOOK cenário A.

---

## Aprovação Obrigatória Antes de Fazer

- Mudanças no schema Prisma (novas migrations)
- Alterações em middleware.ts
- Push para repositório remoto
- Deploy em produção
- Deletar arquivos de produção
