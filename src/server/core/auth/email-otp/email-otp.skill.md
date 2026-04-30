# Skill: Auth / Email OTP

## Responsabilidade
Fluxos baseados em codigo por email (signup, login, verificacao).

## Actions (endpoints)
sendVerification, verifyEmail, signupOTP, verifySignupOTP, resendVerification, loginOTP, verifyLoginOTP

## Arquivos
- `src/server/core/auth/email-otp/email-otp.controller.ts`
- `src/server/core/auth/_shared/helpers.ts` (helpers compartilhados)
- `src/server/core/auth/auth.schemas.ts` (Zod schemas)

## Tabelas Prisma
User, VerificationCode, RefreshToken, VerifiedDomain (autoJoin)

## Dependencias
- `@/lib/auth/jwt`, `@/lib/auth/bcrypt`, `@/lib/auth/csrf`
- `@/lib/rate-limit/*`
- `_shared/helpers` (setAuthCookies, createAuditLog, registerDeviceSession, etc)

## Invariantes
codigos 6 digitos TTL 15min, rate limit via authRateLimiter/checkOtpRateLimit, autoJoinByVerifiedDomain apos verify.

## Como mexer
1. Ler este arquivo + `_shared/helpers.ts`.
2. Editar apenas o controller deste subdominio.
3. Se adicionar/alterar endpoint, atualizar `auth.schemas.ts`.
4. Rodar `npx tsc --noEmit` e `npx eslint src/server/core/auth/`.
5. Nao tocar em outros subdominios sem motivo explicito.
