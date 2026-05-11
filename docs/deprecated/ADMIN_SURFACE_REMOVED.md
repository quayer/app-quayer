# Admin Surface Removed — Mai/2026

## Contexto

Toda a **superfície admin do Quayer** (UI + server actions + sidebar) foi removida em 10/Mai/2026. O **role `UserRole.ADMIN`** continua no schema/JWT para controlar acesso cross-org no Builder, mas **não tem mais painel admin operável**.

**Razão da decisão:**
1. Solo founder pré-receita — manter admin custa tempo que deve ir pro produto (Builder IA)
2. Admin já estava **quebrado** desde o pivot Builder IA: `actions.ts` 100% stubado, controllers `device-sessions` inexistente, 5 pastas vazias, 7 links 404 na sidebar — ninguém percebeu porque ninguém usava
3. Operações ad-hoc agora via **Claude Code + MCPs (Prisma/Supabase)** + SQL direto
4. Builder já persiste TUDO no Prisma (`BuilderProject*`, `BuilderDeployment`, `BuilderToolCall`) — não precisa de "audit log" UI

## O que foi removido

### Arquivos deletados

| Path | Conteúdo |
|---|---|
| `src/app/admin/` (pasta inteira) | layout, actions stubadas, integracoes (stubada), security (sem backend), 5 pastas vazias |
| `src/client/components/admin-settings/` | `SecuritySettings.tsx` + `UAZapiSettings.tsx` órfãos com imports quebrados |
| `src/client/components/layout/admin-nav.tsx` | sidebar com 7 links 404 |

### Arquivos editados (remoção de redirects/conditionals)

- `src/middleware.ts` — removido `/admin` de `PROTECTED_PATHS`; removido bloco `ADMIN_ONLY_PATHS` e check `isSystemAdmin`
- `src/app/(auth)/google-callback/google-callback-v2-client.tsx` — admin redireciona pra `/` (home Builder)
- `src/app/(auth)/login/verify-magic/LoginVerifyMagicClient.tsx` — idem
- `src/client/components/auth/google-callback-v3.tsx` — idem
- `src/client/components/auth/login-form-final.tsx` — idem
- `src/client/components/auth/login-otp-form.tsx` — 3 ocorrências
- `src/client/components/auth/login-verify-v3.tsx` — idem
- `src/client/components/auth/passkey-button.tsx` — idem
- `src/client/components/auth/signup-otp-form.tsx` — idem
- `src/server/core/auth/magic-link/status.routes.ts:172` — redirect pra `/`
- `src/server/ai-module/builder/tools/publish-agent.tool.ts:95` — `redirects.plan` aponta pra `/conta` (era `/admin/billing`)
- `src/client/components/layout/builder-sidebar.tsx` — removido item "Admin" do dropdown user menu + prop `isSuperAdmin` + import `Shield`
- `src/client/components/layout/app-shell.tsx`, `app-shell-client.tsx` — removida prop `isSuperAdmin`
- `src/server/ai-module/builder/get-sidebar-data.ts` — não retorna mais `isSuperAdmin`
- `src/server/ai-module/builder/projects/projects.routes.ts:535-567` — `getSidebar` não retorna mais `isSuperAdmin`

### O que **NÃO** foi tocado (intencional)

- `UserRole.ADMIN` no Prisma/JWT — preservado pra controle de acesso cross-org no Builder
- `isSystemAdmin()` em `src/lib/auth/roles.ts` — função mantida (pode ser usada por novas features)
- Checks de role no backend que **protegem lógica de negócio** (não redirects):
  - `auth.procedure.ts:269` — `adminProcedure`
  - `email-otp/login.routes.ts`, `magic-link/status.routes.ts`, `magic-link/verify.routes.ts`, `totp/login.routes.ts` — admin sem org cai num org-picker (não em `/admin`)
  - `session/session.controller.ts` — admin pode acessar sem org
  - `identity/identity.controller.ts:324` — endpoint protegido
  - `deploy.routes.ts:200` — acesso cross-org Builder

## Modelos Prisma preservados (sem controller hoje)

Todos os modelos abaixo continuam no schema. Restaurar quando houver demanda:

- `Organization`, `OrganizationProvider`
- `Invitation`
- `Notification`, `NotificationRead`, `NotificationPreferences`
- `DeviceSession` (usado por user/seguranca page)

## Como ressuscitar uma feature

### Front antigo (preservado no git)

Páginas deletadas no commit `88ed0fc` (13/Mar/2026):

```bash
# Listar:
git show 88ed0fc^ --name-only -- "src/app/admin/" | sort

# Recuperar uma página específica:
git show 88ed0fc^:src/app/admin/organizations/page.tsx > src/app/admin/organizations/page.tsx
```

| Página | Linhas | Backend que precisa |
|---|---|---|
| `admin/page.tsx` (dashboard) | 401 | stats queries (organizations, users, instances, webhooks, recent activity) |
| `admin/organizations/page.tsx` | 388 | `core/organizations` controller + dialogs Create/Edit |
| `admin/audit/page.tsx` | 512 | `features-module/audit` controller (read-only) |
| `admin/invitations/page.tsx` | 633 | `core/invitations` controller + email service |
| `admin/notificacoes/page.tsx` | 883 | endpoint REST `/api/v1/notifications/*` |
| `admin/settings/page.tsx` | 259 | `system-settings` (já existe) |
| `admin/sessions/page.tsx` | 744 | `core/device-sessions` controller |

Páginas deletadas no commit `61b28e6` (29/Abr/2026 — pivot Builder IA):
- `admin/domains/page.tsx`, `admin/roles/page.tsx`, `admin/scim/page.tsx` (SSO/SCIM enterprise)

### Actions.ts original

Commit `97888b7` tem a versão com queries reais + cache Redis (1809 linhas):

```bash
git show 97888b7:src/app/admin/actions.ts
```

**Atenção:** caminhos de import mudaram. Trocar:
- `@/components/*` → `@/client/components/*`
- `@/hooks/*` → `@/client/hooks/*`
- `@/services/database` → `@/server/services/database`
- `@/services/store` (getOrFetch, resilientCacheDel) → helpers não existem mais
- `PageContainer/PageHeader` → não existem mais
- `useHydration` → não existe mais

### Sidebar admin

`src/client/components/layout/admin-nav.tsx` foi deletado. Restaurar:

```bash
git show HEAD^:src/client/components/layout/admin-nav.tsx > src/client/components/layout/admin-nav.tsx
```

Lembrete: ela listava 9 itens com 7 links 404. Recriar limpa.

## Operações sem admin UI — como fazer

| Operação | Como fazer agora |
|---|---|
| Listar orgs | Prisma MCP / SQL direto |
| Criar/editar/deletar org | Prisma MCP |
| Acessar painel como cliente (impersonate) | Editar JWT manualmente ou SQL `UPDATE user SET currentOrgId='X'` |
| Banir IP | `IPRule` table direto via SQL (se modelo existir) |
| Derrubar sessão | `DELETE FROM device_sessions WHERE id='X'` |
| Ver últimas instâncias UAZapi | SQL nas tabelas `instances` + API UAZapi via `src/lib/uaz/` |
| Ver logs gerais | Controller `logs` já existe — `api.logs.list.query()` |
| Auditar ações do user X | Tabelas `builder_project_messages`, `builder_tool_calls`, `builder_deployments` |

Skill recomendada: criar `.claude/skills/quayer-admin.md` com receitas SQL/MCP comuns.

## Estatísticas da limpeza

- **Arquivos deletados:** 11 (admin pages, admin-settings/, admin-nav)
- **Arquivos editados:** 13 (middleware, 8 auth flows frontend, 2 backend, sidebar chain x4)
- **Linhas removidas:** ~1500
- **Linhas adicionadas:** ~50 (simplificação de redirects)
- **Net result:** -1450 linhas
- **Tempo de execução:** ~30 min (com survey paralelo via multi-agents)

## Compromisso

**Não recriar admin UI sem demanda real do produto.** Se aparecer cliente pagante que precisa de uma operação específica (ex: convidar funcionário pra org dele), implementar **só essa feature** ponto-a-ponto, não o "painel admin inteiro".

Verificar antes de recriar:
1. A operação é >5x/dia ou pode ser via Claude Code/MCP?
2. Tem demanda real (cliente pediu) ou é "seria legal ter"?
3. O modelo Prisma já existe?
4. Quanto custa fazer 1 página + 1 controller pequeno (não restaurar o monolito)?
