# Mapa Completo do Sistema de Autenticação — Quayer

> Atualizado em 2026-03-14 | Cobertura: Frontend, Backend, Database, APIs, Jornadas

---

## Resumo Executivo

| Dimensão | Total |
|----------|-------|
| **Páginas frontend** | 17 (12 auth + 3 admin + 2 user settings) |
| **Endpoints API** | 40 auth + 6 device-sessions + 5 ip-rules + 6 permissions + 6 custom-roles = **63 endpoints** |
| **Tabelas banco** | 22 tabelas auth-related |
| **Jornadas usuário** | 8 principais + 2 auxiliares (2FA, Onboarding) |
| **Métodos de login** | 6 (OTP email, OTP WhatsApp, senha, Google OAuth, Passkey/WebAuthn, Magic Link) |
| **Camadas segurança** | CSRF, Rate Limiting, Turnstile CAPTCHA, 2FA TOTP, Geo-alertas, IP Rules, Device Sessions |

---

## Índice por Categoria

1. [Jornadas do Usuário](#1-jornadas-do-usuário)
2. [Páginas Frontend](#2-páginas-frontend)
3. [Componentes Auth](#3-componentes-auth)
4. [Middleware (Edge)](#4-middleware-edge)
5. [API Backend — Endpoints](#5-api-backend--endpoints)
6. [Procedures (Middleware Backend)](#6-procedures-middleware-backend)
7. [Bibliotecas Auth (src/lib/auth/)](#7-bibliotecas-auth)
8. [Rate Limiting](#8-rate-limiting)
9. [Schema do Banco (Prisma)](#9-schema-do-banco-prisma)
10. [Mecanismos de Segurança](#10-mecanismos-de-segurança)
11. [Roles & Permissões (RBAC)](#11-roles--permissões-rbac)
12. [Diagrama de Arquitetura](#12-diagrama-de-arquitetura)
13. [Cookies & Tokens](#13-cookies--tokens)
14. [Hooks & Provider (Client)](#14-hooks--provider-client)
15. [Notas de Sincronização](#15-notas-de-sincronização)

---

## 1. Jornadas do Usuário

### 1.1 Login por OTP (Email) — Jornada Principal
```
/login → digita email → api.auth.loginOTP (+ Turnstile)
  ↓
/login/verify?email=X → digita código 6 dígitos → api.auth.verifyLoginOTP
  ↓ (se 2FA) → TwoFactorChallenge inline → api.auth.totpChallenge
  ↓
/onboarding (se needsOnboarding=true) → cria org
  ↓
/integracoes (destino final)
```

### 1.2 Login por OTP (WhatsApp/Telefone)
```
/login → digita telefone → POST /api/v1/auth/login-otp-phone (+ Turnstile)
  ↓
/login/verify?phone=+55... → código 6 dígitos → POST /api/v1/auth/verify-login-otp-phone
  ↓
/onboarding ou /integracoes
```

### 1.3 Login por Google OAuth
```
/login → clica "Google" → api.auth.googleAuth (retorna URL)
  ↓
Google consent → redirect → /google-callback?code=X
  ↓
api.auth.googleCallback → tokens + cookies
  ↓ (se 2FA) → TwoFactorChallenge inline
  ↓
/onboarding (se needsOnboarding) ou /integracoes
```

### 1.4 Login por Magic Link (via email)
```
/login/verify?email=X → usuário pede magic link → email enviado com JWT (10min)
  ↓
/login/verify-magic?token=TOKEN (nova aba) → api.auth.verifyMagicLink
  ↓ (se 2FA) → TwoFactorChallenge
  ↓
BroadcastChannel notifica aba original → redirect
  ↓
/onboarding ou /integracoes
```

### 1.5 Login por Passkey (WebAuthn)
```
/login → autofill do navegador detecta passkey (conditional UI)
  ↓
POST /api/v1/auth/passkey/login/challenge → ceremony WebAuthn
  ↓
POST /api/v1/auth/passkey/login/verify-conditional → tokens (conditional UI)
  OU
POST /api/v1/auth/passkey/login/verify → tokens (login manual)
  ↓
/onboarding ou /integracoes
```

### 1.6 Signup (OTP — Rota canônica)
```
/signup → nome + email/telefone → api.auth.signupOTP (+ Turnstile)
  ↓
/signup/verify?email=X&name=Y → código 6 dígitos → api.auth.verifySignupOTP
  ↓
/integracoes (direto, sem onboarding)
```

### 1.7 Registro Legacy (Senha)
```
/register → nome + email + senha → api.auth.register
  ↓
Email de verificação enviado
  ↓
/verify-email?email=X → código 6 dígitos → api.auth.verifyEmail
  ↓
/integracoes
```

### 1.8 Reset de Senha
```
/forgot-password → digita email (+ Turnstile) → api.auth.forgotPassword
  ↓
Email com link enviado
  ↓
/reset-password/[token] → nova senha (com indicador de força) → api.auth.resetPassword
  ↓
Auto-login → /integracoes (ou /admin se admin)
```

### Fluxo de 2FA (intercepta qualquer login)
```
Qualquer endpoint de login retorna { requiresTwoFactor: true, challengeId }
  ↓
Componente TwoFactorChallenge aparece inline
  ↓
Código TOTP → POST /api/v1/auth/totp-challenge (max 5 tentativas, expira 5min)
  OU
Código de recuperação → POST /api/v1/auth/totp-recovery
  ↓
Sucesso → redirect normal
```

### Fluxo de Onboarding
```
Login com needsOnboarding=true → Middleware redireciona para /onboarding
  ↓
Busca dados do user via /api/v1/auth/me
  ↓
Se Google login com nome real → auto-cria org
Senão → usuário digita nome → PATCH /api/v1/auth/profile
  ↓
createOrganizationAction (Server Action) → cria org + completa onboarding
  ↓
Novo JWT com needsOnboarding=false → /integracoes
```

---

## 2. Páginas Frontend

### Layout Auth: `src/app/(auth)/layout.tsx`
- Todas as páginas auth compartilham layout dark/neutro estilo Mintlify (redesign 2026-03-14)
- `force-dynamic` rendering
- Wraps em `<Suspense>` com fallback de skeleton

### Padrão Visual (pós-redesign `ralph/auth-platform-hardening`)
- Todos os form components usam layout flat — **sem** Card/CardHeader/CardContent wrappers
- Container: `flex flex-col gap-8 max-w-sm mx-auto w-full`
- Header: `space-y-2` (h1 + subtitle); subtitle tem `min-h-[2.75rem] flex items-center` para consistência de espaçamento entre páginas
- Botão condicional: neutro (branco+borda) quando incompleto → escuro (gray-900) quando preenchido
- Focus rings: gray (`--ring` override no layout) sem roxo/primary
- Logo: `self-start` (alinhado à esquerda)

### Páginas de Auth (`src/app/(auth)/`)

| # | Rota | Arquivo | Componente Principal | Descrição |
|---|------|---------|---------------------|-----------|
| 1 | `/login` | `src/app/(auth)/login/page.tsx` | `LoginFormFinal` | Login OTP (email/telefone) + Google + Passkey |
| 2 | `/login/verify` | `src/app/(auth)/login/verify/page.tsx` | `LoginOTPForm` | Verificação OTP do login + listener BroadcastChannel |
| 3 | `/login/verify-magic` | `src/app/(auth)/login/verify-magic/page.tsx` | `LoginVerifyMagicClient` (CSR) | Verificação magic link (nova aba) |
| 4 | `/signup` | `src/app/(auth)/signup/page.tsx` | `SignupForm` | Cadastro OTP (email/telefone/Google) |
| 5 | `/signup/verify` | `src/app/(auth)/signup/verify/page.tsx` | `SignupOTPForm` | Verificação OTP do signup |
| 6 | `/signup/verify-magic` | `src/app/(auth)/signup/verify-magic/page.tsx` | `SignupVerifyMagicClient` (CSR) | Magic link do signup |
| 7 | `/register` | `src/app/(auth)/register/page.tsx` | Inline (senha + strength) | Registro legacy (senha) — deveria redirecionar p/ /signup |
| 8 | `/verify-email` | `src/app/(auth)/verify-email/page.tsx` | `VerifyEmailForm` | Verificação email (legacy) |
| 9 | `/onboarding` | `src/app/(auth)/onboarding/page.tsx` | `OnboardingForm` | Setup pós-login (nome + org) |
| 10 | `/forgot-password` | `src/app/(auth)/forgot-password/page.tsx` | Inline (+ Turnstile) | Solicitar reset de senha |
| 11 | `/reset-password/[token]` | `src/app/(auth)/reset-password/[token]/page.tsx` | Inline (strength indicator) | Nova senha via token + auto-login |
| 12 | `/google-callback` | `src/app/(auth)/google-callback/page.tsx` | `GoogleCallbackContent` | Callback OAuth Google + 2FA handling |

### Páginas Admin Auth-related

| # | Rota | Arquivo | Descrição |
|---|------|---------|-----------|
| 13 | `/admin/security` | `src/app/admin/security/page.tsx` | Dashboard: Device Sessions (tab) + IP Rules (tab) |
| 14 | `/admin/sessions` | `src/app/admin/sessions/page.tsx` | Gestão de chat sessions (não auth sessions) |
| 15 | `/admin/invitations` | `src/app/admin/invitations/` | Convites para organizações |

### Loading States
- `src/app/(auth)/loading.tsx` — Skeleton global do grupo auth
- `src/app/(auth)/login/verify-magic/loading.tsx` — Skeleton do magic link

---

## 3. Componentes Auth

### Componentes em `src/client/components/auth/`

| Componente | Arquivo | Uso | APIs que chama |
|-----------|---------|-----|----------------|
| `LoginFormFinal` | `login-form-final.tsx` | Login OTP moderno (principal) | `loginOTP`, `loginOTPPhone`, `googleAuth`, passkey endpoints |
| `LoginForm` | `login-form.tsx` | Login email/senha (secundário) | `login`, `googleAuth` |
| `LoginFormMagic` | `login-form-magic.tsx` | Magic link + biometric | `login`, `googleAuth` |
| `LoginOTPForm` | `login-otp-form.tsx` | Verificação OTP login | `verifyLoginOTP`, `verifyLoginOTPPhone` |
| `SignupForm` | `signup-form.tsx` | Formulário de cadastro | `signupOTP`, `loginOTPPhone`, `googleSignup` |
| `SignupOTPForm` | `signup-otp-form.tsx` | Verificação OTP signup | `verifySignupOTP` |
| `VerifyEmailForm` | `verify-email-form.tsx` | Verificação email legacy | `verifyEmail`, `resendVerification` |
| `OnboardingForm` | `onboarding-form.tsx` | Setup pós-login | `completeOnboarding`, `updateProfile` |
| `TwoFactorChallenge` | `two-factor-challenge.tsx` | Desafio 2FA TOTP/recovery | `/api/v1/auth/totp-challenge`, `/api/v1/auth/totp-recovery` |
| `PasskeyButton` | `passkey-button.tsx` | Botão WebAuthn passkey | `passkeyLoginOptions`, `passkeyLoginVerify` |
| `TurnstileWidget` | `turnstile-widget.tsx` | CAPTCHA Cloudflare Turnstile | Cloudflare JS SDK |
| `AuthLayout` | `auth-layout.tsx` | Layout com fundo de estrelas | — |
| `OTPForm` | `otp-form.tsx` | Input genérico de OTP | — |

### Componentes em `src/client/components/settings/`

| Componente | Descrição |
|-----------|-----------|
| Passkey management | Listar/deletar passkeys do usuário |
| TOTP setup | QR code + verificação + recovery codes |
| Password change | Alterar senha com validação de força |

---

## 4. Middleware (Edge)

**Arquivo:** `src/middleware.ts`

### Classificação de Rotas

| Tipo de Rota | Exemplos | Comportamento |
|-------------|----------|---------------|
| **Pública** | `/login`, `/signup`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/verify`, `/google-callback`, `/connect` | Sem auth necessária |
| **Onboarding** | `/onboarding` | Auth obrigatória, onboarding incompleto OK |
| **Protegida** | `/integracoes`, `/conversas`, `/dashboard`, `/admin`, `/instances`, `/organizations`, `/projects`, `/settings` | Auth + onboarding completo |
| **Admin** | `/admin/*` | Apenas `SYSTEM_ADMIN` |

### Token Extraction
1. Cookie `accessToken` (httpOnly)
2. Fallback: header `Authorization: Bearer <token>`

### Headers Injetados (para Server Components)
| Header | Conteúdo |
|--------|----------|
| `x-user-id` | UUID do usuário |
| `x-user-email` | Email do usuário |
| `x-user-role` | "admin" ou "user" |
| `x-needs-onboarding` | "true" ou "false" |
| `x-current-org-id` | UUID da org ativa |
| `x-organization-role` | "master", "manager", "user" |

### Lógica de Redirect
```
Token expirado → /login?redirect=...&error=session_expired
needsOnboarding=true + rota protegida → /onboarding
needsOnboarding=false + rota /onboarding → /integracoes
Rota admin + role != admin → /integracoes
```

---

## 5. API Backend — Endpoints

### 5.1 Auth Controller (`src/server/features/auth/controllers/auth.controller.ts`)

#### Login & Registro (10 endpoints)

| Endpoint | Tipo | Proteção | Input Schema | Descrição |
|----------|------|----------|--------------|-----------|
| `register` | mutation | Turnstile | `registerSchema` (nome, email, senha 8-72 chars, CPF/CNPJ?) | Criar conta |
| `login` | mutation | Rate-limit | `loginSchema` (email, senha) | Login por senha |
| `loginOTP` | mutation | Turnstile | `passwordlessOTPSchema` (email, rememberMe?) | Enviar OTP por email |
| `verifyLoginOTP` | mutation | — | `verifyPasswordlessOTPSchema` (email, código 6 dígitos) | Verificar OTP login |
| `loginOTPPhone` | mutation | Turnstile | `phoneOTPSchema` (telefone 8-20 chars) | Enviar OTP por WhatsApp |
| `verifyLoginOTPPhone` | mutation | — | `verifyPhoneOTPSchema` (telefone, código) | Verificar OTP phone |
| `signupOTP` | mutation | Turnstile | `signupOTPSchema` (nome, email) | Enviar OTP signup |
| `verifySignupOTP` | mutation | — | `verifySignupOTPSchema` (email, código) | Verificar OTP signup |
| `verifyMagicLink` | mutation | — | `verifyMagicLinkSchema` (token JWT) | Verificar magic link |
| `resendVerification` | mutation | Rate-limit | `sendVerificationSchema` (email) | Reenviar verificação |

#### Google OAuth (2 endpoints)

| Endpoint | Tipo | Proteção | Input Schema | Descrição |
|----------|------|----------|--------------|-----------|
| `googleAuth` | query | — | — | Retorna URL de redirect Google |
| `googleCallback` | mutation | — | `googleCallbackSchema` (code) | Troca code por tokens |

#### Passkeys / WebAuthn (8 endpoints)

| Endpoint | Tipo | Proteção | Input Schema | Descrição |
|----------|------|----------|--------------|-----------|
| `passkeyRegisterOptions` | mutation | Auth + Turnstile | `webAuthnRegisterOptionsSchema` | Options p/ registro |
| `passkeyRegisterVerify` | mutation | Auth | `webAuthnRegisterVerifySchema` | Verificar e salvar passkey |
| `passkeyLoginOptions` | mutation | — | `webAuthnLoginOptionsSchema` (email) | Options p/ login |
| `passkeyLoginVerify` | mutation | — | `webAuthnLoginVerifySchema` (email, credential, rememberMe) | Verificar passkey login |
| `passkeyConditionalChallenge` | mutation | — | — | Challenge p/ autofill UI |
| `passkeyConditionalVerify` | mutation | — | credential + rememberMe | Verificar conditional UI |
| `passkeyList` | query | Auth | — | Listar passkeys do usuário |
| `passkeyDelete` | mutation | Auth | `passkeyDeleteSchema` (id) | Deletar passkey |

#### TOTP 2FA (7 endpoints)

| Endpoint | Tipo | Proteção | Input Schema | Descrição |
|----------|------|----------|--------------|-----------|
| `totpSetup` | mutation | Auth | `totpSetupSchema` | Gerar secret + QR + 8 recovery codes |
| `totpVerify` | mutation | Auth | `totpVerifySchema` (código 6d, deviceId UUID) | Confirmar setup com código |
| `totpChallenge` | mutation | — | `totpChallengeSchema` (challengeId, código) | Verificar durante login (max 5 tentativas) |
| `totpRecovery` | mutation | — | `totpRecoverySchema` (challengeId, recovery code) | Login com recovery code |
| `totpDisable` | mutation | Auth | `totpDisableSchema` (senha, código) | Desativar 2FA |
| `totpRegenerateCodes` | mutation | Auth | `totpRegenerateCodesSchema` | Gerar novos recovery codes |
| `totpListDevices` | query | Auth | — | Listar dispositivos 2FA |

#### Sessão & Perfil (7 endpoints)

| Endpoint | Tipo | Proteção | Input Schema | Descrição |
|----------|------|----------|--------------|-----------|
| `me` | query | Auth | — | Dados do usuário + orgs |
| `updateProfile` | mutation | Auth | `updateProfileSchema` (nome?, email?) | Atualizar perfil |
| `changePassword` | mutation | Auth | `changePasswordSchema` (atual + nova) | Trocar senha |
| `switchOrganization` | mutation | Auth | `switchOrganizationSchema` (orgId) | Mudar org ativa |
| `refresh` | mutation | Optional | `refreshTokenSchema` | Renovar access token |
| `logout` | mutation | — | `logoutSchema` (everywhere?, refreshToken?) | Logout (+ revoke all) |
| `completeOnboarding` | mutation | Auth | — | Marcar onboarding completo |

#### Senha (2 endpoints)

| Endpoint | Tipo | Proteção | Input Schema | Descrição |
|----------|------|----------|--------------|-----------|
| `forgotPassword` | mutation | Rate-limit | `forgotPasswordSchema` (email) | Enviar link de reset |
| `resetPassword` | mutation | — | `resetPasswordSchema` (token, nova senha) | Resetar senha |

#### Verificação de Email (2 endpoints)

| Endpoint | Tipo | Proteção | Input Schema | Descrição |
|----------|------|----------|--------------|-----------|
| `sendVerification` | mutation | Rate-limit | `sendVerificationSchema` (email) | Enviar código de verificação |
| `verifyEmail` | mutation | — | `verifyEmailSchema` (email, código) | Verificar email |

#### Utilitário (2 endpoints)

| Endpoint | Tipo | Proteção | Descrição |
|----------|------|----------|-----------|
| `csrf` | query | — | Gerar token CSRF |
| `listUsers` | query | Auth (admin) | Listar todos os usuários |

---

### 5.2 Device Sessions (`src/server/features/device-sessions/`)

| Endpoint | Tipo | Proteção | Descrição |
|----------|------|----------|-----------|
| `list` | query | Auth | Listar sessões do próprio usuário |
| `listAll` | query | Admin | Listar todas as sessões do sistema (paginado) |
| `listByUser` | query | Admin | Listar sessões de um usuário específico |
| `revoke` | mutation | Auth | Revogar uma sessão própria |
| `revokeAll` | mutation | Auth | Revogar todas exceto a atual |
| `revokeByUser` | mutation | Admin | Revogar todas as sessões de um usuário |

### 5.3 IP Rules (`src/server/features/ip-rules/`)

| Endpoint | Tipo | Proteção | Descrição |
|----------|------|----------|-----------|
| `list` | query | Admin | Listar regras de IP (paginado, filtro type/orgId) |
| `create` | mutation | Admin | Criar regra (ALLOW/BLOCK, ipAddress, org?, expiresAt?) |
| `update` | mutation | Admin | Atualizar regra (active, description, expiresAt) |
| `delete` | mutation | Admin | Deletar regra |
| `check` | query | Admin | Verificar se IP está bloqueado |

### 5.4 Permissions (`src/server/features/permissions/`)

| Endpoint | Tipo | Proteção | Descrição |
|----------|------|----------|-----------|
| `getMatrix` | query | Admin | Matriz completa de permissões |
| `list` | query | Admin | Listar todas as permissões |
| `getByRole` | query | Admin | Permissões de um role específico |
| `updateRolePermission` | mutation | Admin | Atualizar permissões de um role |
| `initialize` | mutation | Admin | Reset para permissões default |
| `check` | query | Auth | Verificar permissão (role + resource + action) |

### 5.5 Custom Roles (`src/server/features/permissions/controllers/custom-roles.controller.ts`)

| Endpoint | Tipo | Proteção | Descrição |
|----------|------|----------|-----------|
| `list` | query | Master+ | Listar roles custom da org |
| `create` | mutation | Master+ | Criar role (nome, permissions JSON, priority) |
| `update` | mutation | Master+ | Atualizar role |
| `delete` | mutation | Master+ | Deletar role (force/reassign options) |
| `assignToUser` | mutation | Master+ | Atribuir role a usuário |
| `getAssignees` | query | Master+ | Listar usuários com esse role |

---

## 6. Procedures (Middleware Backend)

| Procedure | Arquivo | Função | Detalhes |
|-----------|---------|--------|----------|
| `authProcedure` | `procedures/auth.procedure.ts` | Valida JWT, injeta contexto | Extrai token de cookie/header, carrega user + orgs, resolve CustomRole, injeta headers |
| `adminProcedure` | `procedures/auth.procedure.ts` | Exige `role === 'admin'` | Chama authProcedure primeiro, retorna 403 se não admin |
| `csrfProcedure` | `procedures/csrf.procedure.ts` | Valida token CSRF | Header `X-CSRF-Token` vs cookie `csrf_token`, timing-safe compare. Bypass se `X-API-Key` presente |
| `turnstileProcedure` | `procedures/turnstile.procedure.ts` | Verifica Cloudflare Turnstile | Verifica token via API Cloudflare, fail-open em dev, timeout 5s |

### Contexto injetado pelo authProcedure
```typescript
context.auth = {
  session: {
    user: {
      id, email, name, role, currentOrgId, organizationRole,
      twoFactorEnabled, onboardingCompleted, isActive,
      organizations: [{ id, name, slug, role, customRoleId }]
    }
  },
  repository: authRepository,
  customRole?: { permissions: { resource: [action, ...] } }
}
```

---

## 7. Bibliotecas Auth

### `src/lib/auth/jwt.ts` — JWT (Node.js runtime)

| Função | Retorno | Config |
|--------|---------|--------|
| `signAccessToken(payload)` | JWT string | 15min, issuer: 'quayer', audience: 'quayer-api' |
| `signRefreshToken(payload)` | JWT string | 7 dias |
| `signMagicLinkToken(payload)` | JWT string | 10 min |
| `verifyAccessToken(token)` | AccessTokenPayload | Verifica type === 'access' |
| `verifyRefreshToken(token)` | RefreshTokenPayload | Verifica type === 'refresh' |
| `verifyMagicLinkToken(token)` | MagicLinkTokenPayload | Verifica type startsWith 'magic-link' |
| `decodeToken(token)` | any | Decode sem verificação (debug) |
| `isTokenExpired(token)` | boolean | Checa exp vs now |
| `extractTokenFromHeader(header)` | string | Parse "Bearer <token>" |

**Payloads:**
```typescript
AccessTokenPayload  = { userId, email, role, currentOrgId?, organizationRole?, needsOnboarding?, type: 'access' }
RefreshTokenPayload = { userId, tokenId, type: 'refresh' }
MagicLinkTokenPayload = { email, tokenId, type: 'magic-link-login' | 'magic-link-signup', name? }
```

### `src/lib/auth/jwt.edge.ts` — JWT (Edge Runtime, usa `jose`)

| Função | Descrição |
|--------|-----------|
| `verifyAccessToken(token)` | Verificação async compatível com Edge |
| `signAccessToken(payload)` | Assinatura async, 15min |
| `extractTokenFromHeader(header)` | Parse "Bearer <token>" |

### `src/lib/auth/bcrypt.ts` — Hashing & OTP

| Função | Descrição |
|--------|-----------|
| `hashPassword(password)` | bcrypt 12 rounds, max 72 chars |
| `verifyPassword(password, hash)` | bcrypt.compare |
| `generateRandomPassword(length=16)` | crypto.randomBytes → base64url |
| `generateOTPCode(digits=6)` | crypto.randomInt → código numérico |
| `generateRecoveryCodes(count=8)` | Array de 8 códigos hex (4 bytes cada) |
| `validatePasswordStrength(password)` | `{ isValid, errors[], strength: 'weak'|'medium'|'strong' }` |

**Regras de senha:** 8+ chars, 1 uppercase, 1 lowercase, 1 dígito, 1 caractere especial

### `src/lib/auth/csrf.ts` — CSRF Protection

| Função | Descrição |
|--------|-----------|
| `generateCsrfToken()` | crypto.randomBytes(32) → hex (64 chars) |
| `validateCsrfToken(header, cookie)` | Comparação timing-safe |
| `getCsrfTokenFromHeader(req)` | Extrai `X-CSRF-Token` |
| `getCsrfTokenFromCookie(req)` | Extrai cookie `csrf_token` |
| `setCsrfCookie(res, token)` | httpOnly: false, sameSite: strict, 24h maxAge |

### `src/lib/auth/google-oauth.ts` — Google OAuth 2.0

| Função | Descrição |
|--------|-----------|
| `getGoogleAuthUrl()` | Gera URL com scopes: userinfo.email, userinfo.profile |
| `getGoogleTokens(code)` | Troca code por access + id tokens |
| `getGoogleUserInfo(accessToken)` | Fetch perfil do Google |
| `verifyGoogleIdToken(idToken)` | Verifica e extrai payload do ID token |

**Env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

### `src/lib/auth/roles.ts` — Roles & Hierarquia

| Enum/Função | Valores |
|-------------|---------|
| `UserRole` | `ADMIN`, `USER` |
| `OrganizationRole` | `MASTER` (3), `MANAGER` (2), `USER` (1) |
| `hasRolePermission(user, required)` | Verifica hierarquia |
| `isSystemAdmin(role)` | role === ADMIN |
| `isOrganizationMaster(role)` | role === MASTER |

### `src/lib/auth/permissions.ts` — RBAC (Legacy + CustomRole)

| Função | Descrição |
|--------|-----------|
| `hasPermission(role, resource, action, customPerms?)` | Check perm, CustomRole sobrepõe legacy |
| `hasAnyPermission(role, permissions)` | Lógica OR |
| `getCustomRolePermissions(roleId, db)` | Cache 5min em memória |
| `invalidateCustomRoleCache(roleId)` | Limpa cache |

**Resources:** ORGANIZATION, USER, INSTANCE, PROJECT, WEBHOOK, AUDIT_LOG, API_KEY, INVITATION, etc.
**Actions:** CREATE, READ, UPDATE, DELETE, LIST, MANAGE

---

## 8. Rate Limiting

### `src/lib/rate-limit/rate-limiter.ts` (Upstash Redis)

| Limiter | Config | Uso |
|---------|--------|-----|
| `authRateLimiter` | 5 req / 15 min | Endpoints login/senha |
| `apiRateLimiter` | 100 req / 60 sec | API geral |
| `messageRateLimiter` | 30 req / 60 sec | Mensagens |
| `webhookRateLimiter` | 1000 req / 60 sec | Webhooks |

**Algoritmo:** Sliding window via Redis sorted sets (ZSET), **fail-open** se Redis indisponível.

### `src/lib/rate-limit/otp-rate-limit.ts`

| Limiter | Config | Uso |
|---------|--------|-----|
| `otpPhoneRateLimiter` | 3 req / 15 min por telefone | OTP WhatsApp |
| `otpIpRateLimiter` | 5 req / 1 hora por IP | OTP por IP |

**Função:** `checkOtpRateLimit(phone, clientIp)` — verifica ambos os limites

---

## 9. Schema do Banco (Prisma)

### 9.1 Tabelas Core de Auth

| # | Tabela | Campos Chave | Relações |
|---|--------|-------------|----------|
| 1 | **User** | id (UUID), email (UNIQUE), password (bcrypt), name, role ("admin"/"user"), isActive, twoFactorEnabled, onboardingCompleted, currentOrgId, emailVerified, resetToken, resetTokenExpiry, lastOrganizationId, phone (TEXT), phoneVerified (BOOL) | → Session[], RefreshToken[], PasskeyCredential[], TotpDevice[], RecoveryCode[], DeviceSession[], UserOrganization[], VerificationCode[], AuditLog[] |
| 2 | **Organization** | id (UUID), name, slug (UNIQUE), document (UNIQUE, nullable), type ("pf"/"pj"), billingType, maxUsers, maxInstances, geoAlertMode ("off"/"notify"/"block"), isActive | → UserOrganization[], CustomRole[], VerifiedDomain[], ScimToken[], IpRule[] |
| 3 | **UserOrganization** | id, userId (FK), organizationId (FK), role ("master"/"manager"/"user"), customRoleId (FK?), isActive | UNIQUE(userId, organizationId) |

### 9.2 Tabelas de Sessão & Tokens

| # | Tabela | Campos Chave | Descrição |
|---|--------|-------------|-----------|
| 4 | **Session** | id, userId (FK), token (UNIQUE), expiresAt | Sessões ativas (JWT-based) |
| 5 | **RefreshToken** | id, userId (FK), token (UNIQUE), expiresAt, revokedAt | Refresh tokens com rotação |
| 6 | **VerificationCode** | id, userId (FK?), email, code, type ("OTP"/"MAGIC_LINK"/"RESET_PASSWORD"/"EMAIL_VERIFICATION"), token?, used, expiresAt | Códigos OTP e magic links |
| 7 | **TempUser** | id, email (UNIQUE), name, code, expiresAt | Usuário temporário durante signup OTP |

### 9.3 Tabelas de Passkeys & 2FA

| # | Tabela | Campos Chave | Descrição |
|---|--------|-------------|-----------|
| 8 | **PasskeyCredential** | id, userId (FK), credentialId (UNIQUE), publicKey (Bytes/COSE), counter (BigInt), credentialDeviceType, credentialBackedUp, transports[], name, aaguid?, lastUsedAt | Chaves WebAuthn FIDO2 |
| 9 | **PasskeyChallenge** | id, challenge (UNIQUE), userId?, email?, type ("registration"/"authentication"), expiresAt | Desafios WebAuthn temporários (5min) |
| 10 | **TotpDevice** | id, userId (FK), secret (encrypted base32), name, verified | Dispositivos TOTP 2FA |
| 11 | **RecoveryCode** | id, userId (FK), code (bcrypt hash), usedAt? | Códigos de recuperação 2FA (8 por setup, single-use) |

### 9.4 Tabelas de Segurança

| # | Tabela | Campos Chave | Descrição |
|---|--------|-------------|-----------|
| 12 | **DeviceSession** | id, userId (FK), deviceName, ipAddress, userAgent, location?, countryCode?, lastActiveAt, isRevoked, revokedAt | Dispositivos confiáveis — *migration SQL raw* |
| 13 | **IpRule** | id, type (ALLOW/BLOCK), ipAddress, description?, organizationId? (FK), createdById (FK), isActive, expiresAt? | Regras de IP — *migration SQL raw* |
| 14 | **AuditLog** | id, action, resource, userId (FK), organizationId, ipAddress, metadata (JSON) | Log de auditoria |

### 9.5 Tabelas de Permissões & Roles

| # | Tabela | Campos Chave | Descrição |
|---|--------|-------------|-----------|
| 15 | **CustomRole** | id, organizationId (FK), name, slug, description?, permissions (JSON), isSystem, priority (3=master, 2=manager, 1=user) | Roles dinâmicos por org. UNIQUE(orgId, slug) |
| 16 | **VerifiedDomain** | id, organizationId (FK), domain, verificationMethod ("DNS_TXT"/"EMAIL"), verificationToken, verifiedAt?, defaultRoleId? (FK→CustomRole), autoJoin | Domínios verificados para SSO/auto-join. UNIQUE(orgId, domain) |
| 17 | **PermissionResource** | id, resource, displayName, sortOrder | Definições de permissão |
| 18 | **RolePermission** | id, resourceId (FK), role, actions[] | Mapeamento role → ações |
| 19 | **AccessLevel** | id, name, permissions (JSON), organizationId? | Níveis de acesso customizados |

### 9.6 Tabelas de Provisioning

| # | Tabela | Campos Chave | Descrição |
|---|--------|-------------|-----------|
| 20 | **ScimToken** | id, organizationId (FK), name, tokenHash (bcrypt), lastUsedAt?, expiresAt?, revokedAt? | Tokens SCIM 2.0 para IDaaS (Okta, Entra ID) |
| 21 | **Invitation** | id, email, token (UNIQUE, auto UUID), role, organizationId, invitedById (FK), usedAt?, expiresAt (7d) | Convites para orgs |
| 22 | **ApiKey** | id, name, keyHash (SHA-256, UNIQUE), prefix (8 chars), organizationId, userId (FK), scopes[] ("read"/"write"/"admin"/"webhooks"/"instances"), expiresAt?, lastUsedAt?, lastUsedIp?, usageCount, isActive, revokedAt?, revokedBy? | Chaves de API |

### Timeline de Migrations Auth

| Data | Migration | Mudança |
|------|-----------|---------|
| 2025-10-11 | `add_onboarding_and_business_hours` | Onboarding flow |
| 2026-03-12 | `add_device_sessions_and_ip_rules` | DeviceSession + IpRule (SQL raw) |
| 2026-03-12 | `add_user_phone` | User.phone + phoneVerified |
| 2026-03-12 | `make_document_optional` | Organization.document nullable |
| 2026-03-13 | `add_geo_alert_and_country_code` | geoAlertMode + DeviceSession.countryCode |
| 2026-03-13 | `add_totp_2fa` | TotpDevice + RecoveryCode |
| 2026-03-13 | `add_custom_roles` | CustomRole + UserOrganization.customRoleId |
| 2026-03-13 | `add_verified_domains` | VerifiedDomain (SSO) |
| 2026-03-13 | `add_scim_tokens` | ScimToken (SCIM 2.0) |

---

## 10. Mecanismos de Segurança

| Camada | Tecnologia | Detalhe |
|--------|-----------|---------|
| **Hashing** | bcryptjs (12 rounds) | Senhas, recovery codes, tokens SCIM |
| **JWT** | HS256 (`jsonwebtoken` + `jose` p/ Edge) | Access 15m, Refresh 7d, Magic Link 10m, issuer/audience: quayer |
| **CSRF** | Double-submit cookie | Header `X-CSRF-Token` + Cookie `csrf_token`, timing-safe compare, 24h TTL. Bypass com `X-API-Key` |
| **Rate Limit** | Redis sliding window (ZSET) | 5/15min auth, 3/15min OTP phone, 5/1h OTP IP. Fail-open |
| **CAPTCHA** | Cloudflare Turnstile | Login, signup, forgot-password, passkey register. Fail-open em dev |
| **2FA** | TOTP (RFC 6238, via `otpauth`) | QR code setup, 8 recovery codes (bcrypt), max 5 tentativas/challenge |
| **WebAuthn** | FIDO2 Passkeys (`@simplewebauthn`) | Single/multi-device, conditional UI, counter check anti-clone |
| **Geo-alertas** | IP geolocation | Modo off/notify/block por org, alerta país novo |
| **Device Trust** | DeviceSession | User-Agent parsing, IP logging, country code, revogação |
| **IP Rules** | Allow/Block lists | Por org, com expiração, audit log |
| **Cookies** | httpOnly + Secure + SameSite | `accessToken` (httpOnly, 15m), `refreshToken` (httpOnly, 7d, path=/api/v1/auth/refresh), `csrf_token` (client-readable, 24h) |
| **Password** | Strength validation | Min 8 chars, 1 upper, 1 lower, 1 digit, 1 special. Strength: weak/medium/strong |

---

## 11. Roles & Permissões (RBAC)

### Hierarquia de Roles

```
Sistema:  admin > user
Org:      master (3) > manager (2) > user (1)
Custom:   CustomRole com permissions JSON por recurso (sobrepõe legacy)
```

### Matriz de Permissões Default

| Recurso | Master | Manager | User |
|---------|--------|---------|------|
| Organization | CRUD + Manage | Read | Read |
| Organization Settings | Read + Update | Read | — |
| Organization Billing | Read + Update + Manage | — | — |
| Users | CRUD + Manage | Read + List | Read |
| Instances | CRUD + Manage | Create + Read + Update | Read |
| Messages | CRUD | CRUD | Create + Read |
| Webhooks | CRUD + Manage | Read | — |
| Audit Logs | Read + List | Read | — |
| Invitations | CRUD | CRUD | Read |
| Projects | CRUD + Manage | CRUD | Read + Update |
| API Keys | CRUD + Manage | Read | — |
| Share Tokens | CRUD | CRUD | Read |

### Custom Roles (DB-driven)
- Criados por org (1 slug por org, UNIQUE)
- `permissions` JSON: `{ "organization": ["read", "update"], "user": ["create", "read", "list"] }`
- Cache in-memory de 5 minutos
- `isSystem: true` para roles built-in (Master/Manager/User)
- `priority` define hierarquia (3 > 2 > 1)

---

## 12. Diagrama de Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js)                       │
│                                                              │
│  /login ─→ /login/verify ─→ /onboarding ─→ /integracoes     │
│  /signup ─→ /signup/verify ─────────────→ /integracoes       │
│  /register ─→ /verify-email ────────────→ /integracoes       │
│  /forgot-password ─→ /reset-password/[token]                 │
│  /google-callback                                            │
│                                                              │
│  Components: LoginFormFinal, SignupForm, TwoFactorChallenge, │
│              PasskeyButton, TurnstileWidget, OnboardingForm  │
│                                                              │
│  Provider: AuthProvider (auto-refresh 14min, CSRF patching)  │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP + Cookies
                            ▼
┌──────────────────────────────────────────────────────────────┐
│                    MIDDLEWARE (Edge)                          │
│  JWT verify (jose) → Route protection → Header injection     │
│  needsOnboarding? → /onboarding                             │
│  isAdmin? → /admin allowed                                   │
│  Token expired? → /login?error=session_expired               │
└───────────────────────────┬──────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│              CONTROLLERS (Igniter.js, 63 endpoints)          │
│                                                              │
│  Procedures: authProcedure │ adminProcedure │ csrfProcedure  │
│              turnstileProcedure                               │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐       │
│  │ Login/   │ │ Google   │ │ Passkey  │ │ TOTP 2FA  │       │
│  │ Register │ │ OAuth    │ │ WebAuthn │ │ Setup/    │       │
│  │ OTP/     │ │ Auth +   │ │ Register │ │ Challenge │       │
│  │ Magic    │ │ Callback │ │ Login    │ │ Recovery  │       │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘       │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐         │
│  │ Device       │ │ IP Rules     │ │ Permissions  │         │
│  │ Sessions     │ │ Allow/Block  │ │ + Custom     │         │
│  │ (6 endpts)   │ │ (5 endpts)   │ │ Roles (12)   │         │
│  └──────────────┘ └──────────────┘ └──────────────┘         │
└───────────────────────────┬──────────────────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────┐
│    Prisma DB     │ │    Redis     │ │  Email /     │
│   (PostgreSQL)   │ │  (Upstash)   │ │  WhatsApp    │
│                  │ │              │ │              │
│ User             │ │ Rate limits  │ │ OTP codes    │
│ Organization     │ │   (ZSET)     │ │ Magic links  │
│ UserOrganization │ │ Permission   │ │ Verification │
│ Session          │ │   cache      │ │   emails     │
│ RefreshToken     │ │              │ │ Password     │
│ VerificationCode │ │              │ │   reset      │
│ TempUser         │ │              │ │              │
│ PasskeyCredential│ │              │ │              │
│ PasskeyChallenge │ │              │ │              │
│ TotpDevice       │ │              │ │              │
│ RecoveryCode     │ │              │ │              │
│ DeviceSession    │ │              │ │              │
│ IpRule           │ │              │ │              │
│ CustomRole       │ │              │ │              │
│ VerifiedDomain   │ │              │ │              │
│ ScimToken        │ │              │ │              │
│ Invitation       │ │              │ │              │
│ ApiKey           │ │              │ │              │
│ AuditLog         │ │              │ │              │
│ PermissionResource│ │              │ │              │
│ RolePermission   │ │              │ │              │
│ AccessLevel      │ │              │ │              │
└──────────────────┘ └──────────────┘ └──────────────┘
```

---

## 13. Cookies & Tokens

### Cookies setados pelo backend

| Cookie | httpOnly | Secure | SameSite | Max-Age | Path | Descrição |
|--------|----------|--------|----------|---------|------|-----------|
| `accessToken` | ✅ Sim | ✅ (prod) | Lax | 900s (15min) | `/` | JWT de acesso |
| `refreshToken` | ✅ Sim | ✅ (prod) | Lax | 604800s (7d) | `/api/v1/auth/refresh` | JWT de refresh |
| `csrf_token` | ❌ Não | ✅ (prod) | Strict | 86400s (24h) | `/` | Token CSRF (lido pelo JS) |

### Token Payloads

```typescript
// Access Token (15min)
{
  userId: string,
  email: string,
  role: 'admin' | 'user',
  currentOrgId?: string,
  organizationRole?: 'master' | 'manager' | 'user',
  needsOnboarding?: boolean,
  type: 'access',
  iss: 'quayer',
  aud: 'quayer-api',
  exp: number
}

// Refresh Token (7d)
{
  userId: string,
  tokenId: string,  // ID do RefreshToken no DB
  type: 'refresh'
}

// Magic Link Token (10min)
{
  email: string,
  tokenId: string,
  type: 'magic-link-login' | 'magic-link-signup',
  name?: string  // apenas no signup
}
```

### Fluxo de Refresh
```
1. Access Token expira (15min)
2. AuthProvider auto-refresh a cada 14min (antes de expirar)
3. POST /api/v1/auth/refresh (cookie refreshToken enviado auto)
4. Server verifica RefreshToken no DB
5. Gera novo AccessToken + rotaciona RefreshToken (novo JWT, novo row DB)
6. Atualiza cookies
```

---

## 14. Hooks & Provider (Client)

### AuthProvider (`src/lib/auth/auth-provider.tsx`)

```typescript
interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  logout: () => Promise<void>      // revoke + clear cookies + redirect /login
  refreshUser: () => Promise<void>  // re-fetch /api/v1/auth/me
  updateAuth: (userData) => void    // update local state
}
```

**Features:**
- Auto-refresh token a cada **14 minutos** (antes dos 15min de expiração)
- Patch `window.fetch` para injetar `X-CSRF-Token` em todas as mutations (POST/PUT/DELETE/PATCH)
- Redirect automático para `/login` em erros 401
- Não roda em rotas públicas: `/login`, `/register`, `/signup`, `/forgot-password`, etc.

### Hooks

| Hook | Arquivo | Retorno |
|------|---------|---------|
| `useAuth()` | `auth-provider.tsx` | `{ user, isLoading, isAuthenticated, logout, refreshUser, updateAuth }` |
| `getCsrfToken()` | `use-csrf-token.ts` | Lê `csrf_token` do cookie |
| `getCsrfHeaders()` | `use-csrf-token.ts` | `{ 'X-CSRF-Token': token }` |

---

## 15. Notas de Sincronização

> **[RESOLVIDO 2026-03-14]** `DeviceSession` e `IpRule` agora têm models Prisma em `schema.prisma` com `@@map("device_sessions")` e `@@map("ip_rules")`. Migration `add_invitation_org_fk` adicionou FK em `Invitation.organizationId`.

> **[RESOLVIDO 2026-03-14]** `User.phone`, `User.phoneVerified`, `Organization.geoAlertMode`, `DeviceSession.countryCode` agora estão no `schema.prisma`. `Organization.document` corrigido para `String?`.

> **[PENDENTE]** `VerificationCode.email` guarda tanto email quanto telefone — renomear para `identifier` (US-006 do `prd-schema-auth-critique.md`). Requer migration + update em `auth.controller.ts`.

> **[PENDENTE]** `AccessLevel` e `SystemConfig` são modelos deprecated — duplicam `CustomRole` e `SystemSettings` respectivamente. Remoção pendente (US-008, US-009).

> **[PENDENTE]** ~35 modelos sem `@@map()` (PascalCase no banco) — padronizar com `ALTER TABLE RENAME` migrations (US-011). Tabelas afetadas: `User`, `Organization`, `UserOrganization`, `Session`, etc.

> **/register** duplica `/signup` e deveria redirecionar — marcado como legacy nos comentários do código.

---

## 16. Test Infrastructure

> Ver `tasks/prd-auth-test-pipeline.md` para implementação completa.

### Endpoint de recuperação de token (dev only)

```
GET /api/dev/last-token?identifier=<email_ou_phone>&type=<otp|magic-link|...>
```
- **Só existe em** `NODE_ENV !== 'production'` — retorna 404 em produção
- Busca em `VerificationCode` o token mais recente não-usado para o identificador
- Permite testes E2E sem acesso real a email/WhatsApp

### Variáveis de ambiente para testes

```env
AUTH_RECOVERY_TOKEN=test-recovery-token-never-use-in-prod  # Bypass OTP em dev
```
- Ignorada completamente em `NODE_ENV=production`

### Comandos

```bash
npm run test:auth        # Playwright E2E + Vitest integration (paralelo)
npm run test:auth:e2e    # Somente Playwright
npm run test:auth:api    # Somente Vitest integration
```

---

## Referência de Arquivos

### Arquivos Críticos (por ordem de importância)

| Arquivo | ~Linhas | Propósito |
|---------|---------|-----------|
| `src/server/features/auth/controllers/auth.controller.ts` | ~3700 | Todos os 40 endpoints de auth |
| `src/middleware.ts` | ~200 | Edge middleware (auth + routing) |
| `src/lib/auth/auth-provider.tsx` | ~186 | Provider React (auto-refresh + CSRF) |
| `src/server/features/auth/procedures/auth.procedure.ts` | ~330 | Auth + Admin procedures |
| `src/lib/auth/jwt.ts` | ~330 | JWT sign/verify (Node) |
| `src/lib/auth/jwt.edge.ts` | ~80 | JWT sign/verify (Edge/jose) |
| `src/lib/auth/bcrypt.ts` | ~176 | Hashing + OTP + password strength |
| `src/lib/auth/csrf.ts` | ~91 | CSRF token management |
| `src/lib/auth/permissions.ts` | ~350+ | RBAC legacy + CustomRole |
| `src/lib/auth/roles.ts` | ~100 | Roles + hierarquia |
| `src/lib/auth/google-oauth.ts` | ~80 | Google OAuth 2.0 client |
| `src/server/features/auth/auth.schemas.ts` | ~506 | Todos os Zod schemas auth |
| `src/lib/rate-limit/rate-limiter.ts` | ~241 | Rate limiter Upstash Redis |
| `src/lib/rate-limit/otp-rate-limit.ts` | ~50 | OTP-specific rate limits |
| `src/server/features/device-sessions/controllers/` | ~250+ | Device session management |
| `src/server/features/ip-rules/controllers/` | ~250+ | IP allow/block CRUD |
| `src/server/features/permissions/permissions.service.ts` | ~260 | Permission CRUD service |
| `src/server/features/permissions/controllers/custom-roles.controller.ts` | ~300+ | Custom roles CRUD |
| `prisma/schema.prisma` | ~2100+ | Schema completo do banco |

---

*Documento gerado e validado a partir da análise completa do código-fonte do Quayer em 2026-03-13.*
