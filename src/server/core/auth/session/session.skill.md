# Skill: Auth / Session

## Responsabilidade
Ciclo de vida de sessao do usuario ja autenticado (renovacao e encerramento).

## Actions (endpoints)

| Action             | Method | Path                  | File                     |
|--------------------|--------|-----------------------|--------------------------|
| refresh            | POST   | /auth/refresh         | lifecycle.routes.ts      |
| logout             | POST   | /auth/logout          | lifecycle.routes.ts      |
| switchOrganization | POST   | /auth/switch-organization | organization.routes.ts |
| csrf               | GET    | /auth/csrf            | csrf.routes.ts           |

## Arquivos do subdomínio

- `session.controller.ts` — composer fino (~27 linhas), so importa e espalha routes
- `lifecycle.routes.ts` — refresh + logout, rate limiters por IP
- `csrf.routes.ts` — geracao e cookie do CSRF token
- `organization.routes.ts` — switchOrganization com rotacao de refresh token
- `src/server/core/auth/_shared/helpers.ts` (helpers compartilhados)
- `src/server/core/auth/auth.schemas.ts` (Zod schemas: logoutSchema, switchOrganizationSchema)

## Tabelas Prisma
RefreshToken, User (currentOrgId)

## Dependencias
- `@/lib/auth/jwt`, `@/lib/auth/bcrypt`, `@/lib/auth/csrf`
- `@/lib/rate-limit/*`
- `_shared/helpers` (setAuthCookies, clearAuthCookies, createAuditLog, getClientIdentifier)

## Invariantes
refreshToken httpOnly cookie, rotacao do CSRF a cada renovacao, logout everywhere revoga todos tokens.

## Como mexer
1. Ler este arquivo + `_shared/helpers.ts`.
2. Editar apenas o route file do subdominio afetado.
3. Se adicionar/alterar endpoint, atualizar `auth.schemas.ts` e a tabela de actions acima.
4. Rodar `npx tsc --noEmit` e `npx eslint src/server/core/auth/`.
5. Nao tocar em outros subdominios sem motivo explicito.
