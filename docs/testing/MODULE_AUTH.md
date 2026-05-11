# Testes — Módulo Auth

> Contrato vivo do que precisa estar coberto para garantir o funcionamento do módulo Auth. Toda evolução de auth atualiza este documento ANTES de mexer em código.

Última auditoria: 2026-05-10. Origem: `npm run test:unit` (18 de 34 files failing) + mapeamento de superfície.

---

## 1. Superfície coberta

### Endpoints (controllers Igniter)
36 actions em `src/server/core/auth/` distribuídas em 8 grupos:

| Grupo | Endpoints | Procedures aplicadas |
|---|---|---|
| Session | refresh, logout, switch-organization, csrf, check-magic-link-status | rateLimit, csrf |
| Identity | me, updateMe, uploadAvatar, getOtpPreferences, updateOtpPreferences, listUsers | authProcedure(required), csrf, admin (listUsers) |
| Email OTP | signupOTP, verifySignupOTP, verifyEmail, loginOTP, verifyLoginOTP | turnstile, csrf, rateLimit |
| Magic Link | verifyMagicLink, completeOnboarding | rateLimit IP+email, authProcedure (onboarding) |
| Phone OTP | loginOTPPhone | rateLimit, turnstile |
| TOTP/2FA | totpSetup, totpVerify, totpDevices, totpDisableRequest, totpDisable, totpRegenerateCodes, twoFactorLoginVerify | authProcedure, csrf, rateLimit |
| Passkey | passkeyRegisterOptions, passkeyRegisterVerify, passkeyList, passkeyDelete, passkeyLoginOptions, passkeyLoginVerify, passkeyConditionalChallenge, passkeyConditionalVerify | authProcedure (registro), csrf, rateLimit |
| OAuth | googleAuth, googleCallback | rateLimit IP |

### Componentes React (`src/client/components/auth/`)
17 componentes em 6 jornadas: signup-form-v3, signup-verify-v3, login-form-v3, login-verify-v3, verify-email-v3, onboarding-v3, two-factor-challenge, passkey-button, google-callback-v3, auth-shell, auth-layout, turnstile-widget, otp-form, e variantes legacy (signup-form, login-form-final, etc.).

### Primitivas em `src/lib/auth/`
JWT (signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken, signMagicLinkToken, verifyMagicLinkToken, sign2faChallenge, verify2faChallenge), bcrypt (hashPassword, verifyPassword), OTP (generateOTPCode), recovery codes (generateRecoveryCodes, RECOVERY_CODE_REGEX), Google OAuth (getGoogleAuthUrl, getGoogleTokens, getGoogleUserInfo), CSRF (generateCsrfToken, setCsrfCookie), crypto (encrypt/decrypt para TOTP secrets).

### Models Prisma envolvidos
User, Organization, UserOrganization, CustomRole, VerifiedDomain, Session, RefreshToken, VerificationCode, TempUser, PasskeyCredential, PasskeyChallenge, TotpDevice, RecoveryCode, DeviceSession, UserPreferences, NotificationPreferences, Invitation.

---

## 2. Jornadas críticas

Cada jornada é um cenário fim-a-fim do ponto de vista do usuário. Estas são as jornadas que se quebradas tornam o produto inutilizável.

### Prioridade P0 (release blocker)
- **J1 — Signup com Email OTP**: signup-otp → email com OTP+magic link → verify-signup-otp → cria User+Organization → onboarding → dashboard
- **J2 — Login com Email OTP**: login-otp → email → verify-login-otp → check 2FA → dashboard
- **J3 — Magic Link Login**: verify-magic-link → check 2FA → dashboard
- **J4 — Session refresh + logout**: refresh com refreshToken válido → novo access token; logout revoga; logout-everywhere revoga todos

### Prioridade P1 (críticas mas degradáveis)
- **J5 — Google OAuth signup**: google-auth → callback → cria User+Org → onboarding
- **J6 — Google OAuth login**: google-auth → callback → User existente → check 2FA → dashboard
- **J7 — 2FA challenge após primeiro fator**: J2/J3/J6 com twoFactorEnabled=true → two-factor-login-verify (TOTP ou recovery code)
- **J8 — Onboarding completion**: complete-onboarding → re-emite access token com needsOnboarding=false

### Prioridade P1 (críticas mas degradáveis)
- **J16 — Passkey login conditional UI**: dispara automaticamente no mount de `/login` (verificado em homol via `POST /api/v1/auth/passkey/login/challenge → 200` sem clique). Se falhar, toda página `/login` mostra erro no console; usuário ainda pode usar email mas a UX degrada. **Já está em produção sem teste — fechar gap antes da próxima release.**

### Prioridade P2 (importantes mas baixo blast radius)
- **J9 — Cross-tab magic link polling**: Tab A login-otp + mlpoll cookie → Tab B verify-magic-link → Tab A check-magic-link-status detecta
- **J10 — TOTP setup**: totp-setup → QR code → totp-verify → recovery codes
- **J11 — TOTP disable**: totp-disable-request → email code → totp-disable (email+TOTP)
- **J12 — Recovery code usage**: 2FA challenge → recovery code → marcado used
- **J13 — Phone OTP login (WhatsApp)**: login-otp-phone → uazapi → verify
- **J14 — Switch organization**: switch-organization → rotate refresh token → novo orgId no JWT
- **J15 — Passkey registration**: register-options → register-verify
- **J16b — Passkey login explicit**: passkey-login-options (email) → login-verify (variante manual, menos crítica que J16)
- **J17 — Profile update**: updateMe (name, language, timezone)
- **J18 — Avatar upload**: uploadAvatar com validação magic-byte

---

## 3. Matriz Jornada × Camada

Legenda: `path` = arquivo de teste existente. `X` = a criar. `—` = não aplicável nessa camada.

| Jornada | C2 Unit BE | C3 Unit React | C4 API Integration | C5 E2E |
|---|---|---|---|---|
| **J1 Signup** | `email-otp-handlers.test.ts`, `signup-gate.test.ts`, `zod-schemas.test.ts`, `otp.test.ts` | `react/auth/signup-form-v3.test.tsx`, `react/auth/signup-otp-form.test.tsx`, `react/auth/signup-verify-v3.test.tsx` | `integration/auth/signup.test.ts`, `contract/auth/signup.contract.test.ts` | `e2e/auth/signup-flow.spec.ts` `@smoke` |
| **J2 Login Email OTP** | `email-otp-handlers.test.ts`, `auth-procedure.test.ts`, `feature-flags/auth-v3.test.ts` | `react/auth/login-form-v3.test.tsx`, `react/auth/login-otp-form.test.tsx`, `react/auth/login-verify-v3.test.tsx` | `integration/auth/otp-request.test.ts`, `integration/auth/otp-verify.test.ts`, `contract/auth/otp-request.contract.test.ts`, `contract/auth/otp-verify.contract.test.ts` | `e2e/auth/login-otp-happy-path.spec.ts` `@smoke` |
| **J3 Magic Link** | `magic-link-handlers.test.ts`, `jwt.test.ts` (signMagicLinkToken) | X `react/auth/magic-link-redirect.test.tsx` | X `integration/auth/magic-link.test.ts` | X `e2e/auth/magic-link.spec.ts` |
| **J4 Session refresh/logout** | `jwt.test.ts`, `jwt-lazy-init.test.ts`, `auth-procedure.test.ts` | — | X `integration/auth/refresh-logout.test.ts` | X `e2e/auth/logout-everywhere.spec.ts` |
| **J5 OAuth signup** | `google-oauth-handlers.test.ts` | `react/auth/google-callback-v3.test.tsx` | X `integration/auth/google-callback.test.ts` | X `e2e/auth/google-oauth.spec.ts` |
| **J6 OAuth login** | `google-oauth-handlers.test.ts` | `react/auth/google-callback-v3.test.tsx` | X `integration/auth/google-callback.test.ts` | X `e2e/auth/google-oauth.spec.ts` |
| **J7 2FA challenge** | X `two-factor-challenge.handlers.test.ts` | `react/auth/two-factor-challenge.test.tsx` | X `integration/auth/2fa-verify.test.ts` | X `e2e/auth/login-2fa.spec.ts` |
| **J8 Onboarding** | `signup-gate.test.ts` | `react/auth/onboarding-v3.test.tsx` | X `integration/auth/onboarding.test.ts` | `e2e/onboarding-flow.spec.ts` |
| **J9 Cross-tab polling** | `magic-link-handlers.test.ts` | — | X `integration/auth/magic-link-polling.test.ts` | X `e2e/auth/magic-link-cross-tab.spec.ts` |
| **J10 TOTP setup** | `crypto.test.ts` (encrypt/decrypt) | — | X `integration/auth/totp-setup.test.ts` | X `e2e/auth/totp-setup.spec.ts` |
| **J11 TOTP disable** | — | — | X `integration/auth/totp-disable.test.ts` | X `e2e/auth/totp-disable.spec.ts` |
| **J12 Recovery code** | `otp.test.ts` (generateRecoveryCodes) | `react/auth/two-factor-challenge.test.tsx` (recovery branch) | X `integration/auth/recovery-code-login.test.ts` | — |
| **J13 Phone OTP** | `phone-otp-handlers.test.ts` | — | X `integration/auth/phone-otp.test.ts` | X `e2e/auth/phone-otp.spec.ts` |
| **J14 Switch organization** | — | — | X `integration/auth/switch-org.test.ts` | X `e2e/auth/switch-org.spec.ts` |
| **J15 Passkey registration** | — | X `react/auth/passkey-button.test.tsx` | X `integration/auth/passkey-register.test.ts` | — |
| **J16 Passkey login** | — | X `react/auth/passkey-button.test.tsx` | X `integration/auth/passkey-login.test.ts` | — |
| **J17 Profile update** | — | X `react/auth/profile-form.test.tsx` | X `integration/auth/profile-update.test.ts` | — |
| **J18 Avatar upload** | — | — | X `integration/auth/avatar-upload.test.ts` (magic-byte validation) | — |

---

## 4. Cobertura mínima (gate de release)

Estas regras são duras. CI falha se violadas.

- **C1 Static**: `npm run lint && npx tsc --noEmit` verde. Sempre.
- **C2 Unit BE**: cobertura `>= 80%` em `src/server/core/auth/**` e `src/lib/auth/**`. Mede com `npm run test:unit:coverage`.
- **C3 Unit React**: TODOS os componentes em `src/client/components/auth/*-v3.tsx` têm teste.
- **C4 API**: 100% dos endpoints da tabela em §1 têm teste de integração com Postgres real (não mock).
- **C5 E2E**: J1, J2, J3, J4 sempre verdes em homol. J5-J8 verdes ou justificados em PR.
- **Skipped permitidos**: ZERO. `it.skipIf` proibido em PR sem comentário `// @skip-reason: <motivo concreto>`. Migrar para `describe.skipIf` que pula o describe inteiro com aviso.

---

## 5. Padrões obrigatórios

### Mock do `@/igniter.client` (C3)
```typescript
vi.mock('@/igniter.client', () => ({
  api: { auth: { login: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } } }
}))
```
Sempre importar do path exato. Nunca de barrel.

### Mock do contexto autenticado (C2 controllers)
Ver `.claude/skills/testing-pipeline.md` seção "Padrões de mock". Mocka `prisma` e `jwt`, não o controller.

### Integração com DB (C4)
Cada teste roda em `prisma.$transaction(async tx => { ... throw ROLLBACK })`. Nunca `truncate`, nunca `deleteMany` em tabelas reais. Setup compartilhado em `test/api/setup.ts` + `test/api/db.ts`.

### Seletores E2E (C5)
Preferir `getByRole('button', { name: /entrar/i })` e `getByLabel(/email/i)`. Seletores CSS quebram em refactor de UI.

### Tag `@smoke` para E2E críticos
Adicionar no nome do teste: `test('signup happy path @smoke', ...)`. CI roda `--grep "@smoke"` em PR (subset rápido, ~2 min) e `test:e2e` completo em merge para main.

---

## 6. Tests skipped (auditoria 2026-05-10)

`it.skipIf` ativos no momento — todos precisam ser migrados para `describe.skipIf` com motivo explícito ou removidos:

- `test/api/admin-security.test.ts`: 26 ocorrências de `it.skipIf(!hasAdminToken())` ou `(!hasUserToken())`. Ação: envolver em `describe.skipIf` único e documentar setup de `TEST_ADMIN_TOKEN`/`TEST_USER_TOKEN` em `test/api/setup.ts`.
- `test/e2e/auth/login-otp-happy-path.spec.ts:32-35`: `test.skip` quando DB indisponível. Aceitável local; CI deve garantir DB.
- `test/e2e/auth/signup-flow.spec.ts:29-33`: mesmo padrão.

---

## 7. Coverage gaps atuais (a fechar)

### Crítico (fechar antes da próxima release — confirmado live em homol)
- **J16 Passkey conditional login** — `POST /api/v1/auth/passkey/login/challenge` é disparado no mount de `/login` em homol. Endpoint live e sem cobertura. Falha quebra UX da página inicial de login.

### Próximo ciclo (gaps de menor blast radius)
- **J15 Passkey registration** — sem teste, mas só acessível para usuário já logado.
- **J16b Passkey login explicit** — variante manual, fluxo menor que conditional.
- **J18 Avatar upload** — validação magic-byte de jpg/png/webp sem teste; risco de bypass.
- **J14 Switch organization** — rotação de refresh token sem teste.
- **J11 TOTP disable** — fluxo email-code + TOTP-code sem teste.

---

## 8. Pipeline de automação

```
pre-commit (husky)
    vitest related --run $(git diff --name-only --cached)
    npm run lint && npx tsc --noEmit
        |
        v
PR aberto (.github/workflows/ci.yml)
    npm run test:unit (full)
    npm run test:react (full)
    npm run test:api (Postgres container)
    npm run test:e2e --grep "@smoke"
        |
        v
Merge to main
    npm run test:all
    deploy homol automatico
    smoke-homol.yml
        |
        v
Deploy prod (manual, ROLLBACK_RUNBOOK)
    synthetic-monitor.yml a cada 5min
    alarme se p95 degradar >50%
```

---

## 9. Como evoluir este doc

Toda mudança em auth (novo endpoint, novo componente, novo schema):
1. Atualizar §1 (superfície) e §2 (jornada se for nova)
2. Adicionar coluna/linha na matriz §3 com `X` no path planejado
3. Escrever o teste — só ele justifica o `X` virar path real
4. Atualizar §7 se a coverage gap foi fechada

PR que toca `src/server/core/auth/` ou `src/client/components/auth/` sem atualizar este doc é regredido por padrão.

---

## 10. Referências

- `.claude/skills/testing-pipeline.md` — padrões técnicos (mocks, fixtures)
- `.claude/skills/release-checklist.md` — gate de release
- `docs/infra/BASELINES.md` seção 8 — baselines de p95/latência (auth breakdown)
- `docs/infra/ROLLBACK_RUNBOOK.md` — cenários A-J de rollback
- `vitest.config.ts`, `vitest.config.integration.ts`, `vitest.config.contract.ts`, `playwright.config.ts`
