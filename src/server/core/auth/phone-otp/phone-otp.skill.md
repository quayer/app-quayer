# Skill: Auth / Phone OTP

## Responsabilidade
Login via OTP no WhatsApp (lib/uaz/whatsapp-otp).

## Actions (endpoints)
loginOTPPhone, verifyLoginOTPPhone

## Arquivos
- `src/server/core/auth/phone-otp/phone-otp.controller.ts`
- `src/server/core/auth/_shared/helpers.ts` (helpers compartilhados)
- `src/server/core/auth/auth.schemas.ts` (Zod schemas)

## Tabelas Prisma
User, VerificationCode, RefreshToken

## Dependencias
- `@/lib/auth/jwt`, `@/lib/auth/bcrypt`, `@/lib/auth/csrf`
- `@/lib/rate-limit/*`
- `_shared/helpers` (setAuthCookies, createAuditLog, registerDeviceSession, etc)

## Invariantes
normalizePhone antes de persistir, rate limit por telefone.

## Como mexer
1. Ler este arquivo + `_shared/helpers.ts`.
2. Editar apenas o controller deste subdominio.
3. Se adicionar/alterar endpoint, atualizar `auth.schemas.ts`.
4. Rodar `npx tsc --noEmit` e `npx eslint src/server/core/auth/`.
5. Nao tocar em outros subdominios sem motivo explicito.
