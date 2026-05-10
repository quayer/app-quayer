# Skill: Auth / OAuth Google

## Responsabilidade
Fluxo OAuth Google (kickoff + callback).

## Actions (endpoints)
googleAuth, googleCallback

## Arquivos
- `src/server/core/auth/oauth-google/oauth-google.controller.ts`
- `src/server/core/auth/_shared/helpers.ts` (helpers compartilhados)
- `src/server/core/auth/_shared/issue-session.ts` (emissão de sessão em signup)
- `src/server/core/auth/_shared/two-factor-gate.ts` (gate de 2FA pré-login)
- `src/server/core/auth/_shared/finalize-login.ts` (login existente sem 2FA)
- `src/server/core/auth/auth.schemas.ts` (Zod schemas)

## Tabelas Prisma
User, Organization, UserOrganization, RefreshToken, DeviceSession, AuditLog

## Dependencias
- `@/lib/auth/jwt`, `@/lib/auth/roles`, `@/lib/auth/google-oauth`
- `@/lib/rate-limit/rate-limiter` (oauthGoogleInitRateLimiter, oauthGoogleCallbackRateLimiter)
- `_shared/helpers` (setAuthCookies, createAuditLog, registerDeviceSession, getClientIdentifier)
- `_shared/issue-session` (issueSession — caminho signup)
- `_shared/two-factor-gate` (check2faAndIssueChallenge — usuário existente com 2FA)
- `_shared/finalize-login` (finalizeLogin — login existente sem 2FA, inclui geo-block)
- `procedures/rate-limit.procedure` (rateLimitProcedure — use: [...])

## Invariantes
- Exige verified_email=true (ou conta Workspace com hd presente)
- Cria organização default para usuário novo; passwordless (password=null)
- Caminho signup: issueSession + audits manuais (email, user.signup, auth.signup)
- Caminho login: finalizeLogin (geo-block retorna 403)
- CSRF state: cookie httpOnly oauth_google_state invalidado após uso (one-shot)

## Como mexer
1. Ler este arquivo + `_shared/_shared.skill.md`.
2. Editar apenas o controller deste subdominio.
3. Se adicionar/alterar endpoint, atualizar `auth.schemas.ts`.
4. Rodar `npx tsc --noEmit` e `npx eslint src/server/core/auth/`.
5. Nao tocar em outros subdominios sem motivo explicito.
