# Skill: Auth / OAuth Google

## Responsabilidade
Fluxo OAuth Google (kickoff + callback).

## Actions (endpoints)
googleAuth, googleCallback

## Arquivos
- `src/server/core/auth/oauth-google/oauth-google.controller.ts`
- `src/server/core/auth/_shared/helpers.ts` (helpers compartilhados)
- `src/server/core/auth/auth.schemas.ts` (Zod schemas)

## Tabelas Prisma
User, Organization, UserOrganization, RefreshToken

## Dependencias
- `@/lib/auth/jwt`, `@/lib/auth/bcrypt`, `@/lib/auth/csrf`
- `@/lib/rate-limit/*`
- `_shared/helpers` (setAuthCookies, createAuditLog, registerDeviceSession, etc)

## Invariantes
exige verified_email=true, cria organizacao default para usuario novo, bypass 2FA apenas em primeiro login.

## Como mexer
1. Ler este arquivo + `_shared/helpers.ts`.
2. Editar apenas o controller deste subdominio.
3. Se adicionar/alterar endpoint, atualizar `auth.schemas.ts`.
4. Rodar `npx tsc --noEmit` e `npx eslint src/server/core/auth/`.
5. Nao tocar em outros subdominios sem motivo explicito.
