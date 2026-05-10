# Skill: Auth / Magic Link

## Responsabilidade
Consumo do magic link (token JWT) e polling do tab original + complete onboarding.

## Actions (endpoints)
- `verifyMagicLink`      — POST /auth/verify-magic-link
- `checkMagicLinkStatus` — POST /auth/check-magic-link-status
- `completeOnboarding`   — POST /auth/onboarding/complete

## Arquivos
- `magic-link.controller.ts` — composer (~25 LoC); só importa e espalha routes
- `verify.routes.ts`         — verifyMagicLink: signup path + login path (~230 LoC)
- `status.routes.ts`         — checkMagicLinkStatus: cross-tab polling (~170 LoC)
- `onboarding.routes.ts`     — completeOnboarding (~80 LoC)

## Dependencias _shared/
- `_shared/helpers.ts`         — getClientIdentifier, setAuthCookies, createAuditLog, registerDeviceSession, autoJoinByVerifiedDomain, sign2faChallenge
- `_shared/issue-session.ts`   — issueSession (access + refresh + cookies)
- `_shared/two-factor-gate.ts` — check2faAndIssueChallenge
- `_shared/finalize-login.ts`  — finalizeLogin (device check + issueSession + audit)
- `_shared/signup-gate.ts`     — isSignupEnabled, SIGNUP_DISABLED_MESSAGE

## Tabelas Prisma
VerificationCode, TempUser, User, Organization, UserOrganization, RefreshToken, DeviceSession, AuditLog

## Invariantes
- Token assinado via `signMagicLinkToken`; `sessionId` UUID para cross-tab polling.
- `checkMagicLinkStatus` emite access + refresh (comportamento completo de login).
- `completeOnboarding` emite APENAS access token (refresh existente permanece válido).
- `verifyMagicLink` tem rate-limit duplo: IP (authRateLimiter no handler) + email/IP (checkOtpRateLimit).
- Consume atômico do token: `updateMany where used=false` — previne replay concorrente.

## Como mexer
1. Ler este arquivo + o routes file relevante.
2. Nao editar `auth.schemas.ts` nem `_shared/*` sem motivo explícito.
3. Rodar `npx tsc --noEmit` e `npx eslint src/server/core/auth/magic-link/`.
4. Nao alterar nomes de action nem paths — quebra o client gerado pelo Igniter.
