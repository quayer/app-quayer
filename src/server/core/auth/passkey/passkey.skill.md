# Skill: Auth / Passkey / WebAuthn

## Responsabilidade
Registro e login via WebAuthn/Passkey com ramo conditional UI.

## Actions (endpoints)
passkeyRegisterOptions, passkeyRegisterVerify, passkeyList, passkeyDelete, passkeyLoginOptions, passkeyLoginVerify, passkeyConditionalChallenge, passkeyConditionalVerify

## Arquivos
- `src/server/core/auth/passkey/passkey.controller.ts`
- `src/server/core/auth/_shared/helpers.ts` (helpers compartilhados)
- `src/server/core/auth/auth.schemas.ts` (Zod schemas)

## Tabelas Prisma
Passkey, WebAuthnChallenge, User

## Dependencias
- `@/lib/auth/jwt`, `@/lib/auth/bcrypt`, `@/lib/auth/csrf`
- `@/lib/rate-limit/*`
- `_shared/helpers` (setAuthCookies, createAuditLog, registerDeviceSession, etc)

## Invariantes
rpID via env, challenge single-use, credentialID unico.

## Como mexer
1. Ler este arquivo + `_shared/helpers.ts`.
2. Editar apenas o controller deste subdominio.
3. Se adicionar/alterar endpoint, atualizar `auth.schemas.ts`.
4. Rodar `npx tsc --noEmit` e `npx eslint src/server/core/auth/`.
5. Nao tocar em outros subdominios sem motivo explicito.
