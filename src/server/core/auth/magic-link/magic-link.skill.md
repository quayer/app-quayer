# Skill: Auth / Magic Link

## Responsabilidade
Consumo do magic link (token JWT) e polling do tab original + complete onboarding.

## Actions (endpoints)
verifyMagicLink, checkMagicLinkStatus, completeOnboarding

## Arquivos
- `src/server/core/auth/magic-link/magic-link.controller.ts`
- `src/server/core/auth/_shared/helpers.ts` (helpers compartilhados)
- `src/server/core/auth/auth.schemas.ts` (Zod schemas)

## Tabelas Prisma
MagicLinkSession, User

## Dependencias
- `@/lib/auth/jwt`, `@/lib/auth/bcrypt`, `@/lib/auth/csrf`
- `@/lib/rate-limit/*`
- `_shared/helpers` (setAuthCookies, createAuditLog, registerDeviceSession, etc)

## Invariantes
token assinado via signMagicLinkToken, sessionId UUID para cross-tab polling.

## Como mexer
1. Ler este arquivo + `_shared/helpers.ts`.
2. Editar apenas o controller deste subdominio.
3. Se adicionar/alterar endpoint, atualizar `auth.schemas.ts`.
4. Rodar `npx tsc --noEmit` e `npx eslint src/server/core/auth/`.
5. Nao tocar em outros subdominios sem motivo explicito.
