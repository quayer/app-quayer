# Skill: Auth / Identity

## Responsabilidade
Dados do usuário autenticado e preferências: perfil, avatar, preferências OTP, contas vinculadas e listagem admin.

## Actions (endpoints)

| Action               | Method | Path                          | File                        |
|----------------------|--------|-------------------------------|-----------------------------|
| me                   | GET    | /auth/me                      | profile.routes.ts           |
| updateMe             | PATCH  | /auth/me                      | profile.routes.ts           |
| uploadAvatar         | POST   | /auth/me/avatar               | profile.routes.ts           |
| getOtpPreferences    | GET    | /auth/me/otp-preferences      | otp-preferences.routes.ts   |
| updateOtpPreferences | PATCH  | /auth/me/otp-preferences      | otp-preferences.routes.ts   |
| listLinkedAccounts   | GET    | /auth/me/linked-accounts      | linked-accounts.routes.ts   |
| unlinkAccount        | DELETE | /auth/me/linked-accounts/:p   | linked-accounts.routes.ts   |
| listUsers            | GET    | /auth/users                   | admin.routes.ts             |

## Arquivos do subdomínio

- `src/server/core/auth/identity/identity.controller.ts` — composer (~30 linhas)
- `src/server/core/auth/identity/profile.routes.ts` — me, updateMe, uploadAvatar
- `src/server/core/auth/identity/otp-preferences.routes.ts` — getOtpPreferences, updateOtpPreferences
- `src/server/core/auth/identity/linked-accounts.routes.ts` — listLinkedAccounts, unlinkAccount
- `src/server/core/auth/identity/admin.routes.ts` — listUsers
- `src/server/core/auth/_shared/helpers.ts` (helpers compartilhados)
- `src/server/core/auth/auth.schemas.ts` (Zod schemas)

## Tabelas Prisma
User, UserPreferences, UserOrganization, UserIdentity, PasskeyCredential

## Dependências
- `@/lib/auth/jwt`, `@/lib/auth/bcrypt`, `@/lib/auth/csrf`
- `@/lib/rate-limit/*`
- `@/server/services/storage` (BUCKETS, upload, getSignedUrl)
- `_shared/helpers` (getClientIdentifier, createAuditLog, etc.)

## Invariantes
- listUsers exige role=admin e currentOrgId (multi-tenant)
- updateOtpPreferences: só permite desabilitar OTP se twoFactorEnabled=true (evita lockout)
- unlinkAccount: bloqueia remoção se for o único método de auth disponível
- uploadAvatar: valida magic bytes do buffer (JPEG/PNG/WebP); rejeita GIF e outros formatos
- me: rate-limited a 120 req/min por userId+IP

## Como mexer
1. Ler este arquivo + o route file do subgrupo relevante.
2. Editar apenas o route file do subdomínio.
3. Se adicionar/alterar endpoint, atualizar a tabela de actions acima.
4. Rodar `npx tsc --noEmit` e `npx eslint src/server/core/auth/`.
5. Não tocar em outros subdomínios sem motivo explícito.
