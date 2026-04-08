# Google OAuth Status

Status: ACTIVE
Decision: SCENARIO A — dual-render /google-callback in v3
Story: US-312 (Auth Rebrand Release 3)
Date: 2026-04-08

## Summary

Google OAuth is currently an active authentication path in Quayer. The
/google-callback route MUST be dual-rendered alongside the rest of the v3
auth surfaces and is NOT a candidate for cleanup.

## Evidence

### 1. Environment variables (active)

- `.env` (local dev) — populated:
  - `GOOGLE_CLIENT_ID=783563329547-...apps.googleusercontent.com`
  - `GOOGLE_CLIENT_SECRET=GOCSPX-...`
  - `GOOGLE_REDIRECT_URI=http://localhost:3000/google-callback`
- `.env.example` — placeholders present (lines 150–154)
- `.env.homol.example` — placeholders present (lines 75–77)

### 2. Backend handler (present)

- Schema: `src/server/core/auth/auth.schemas.ts:82` — `googleCallbackSchema`
- Controller: `src/server/core/auth/controllers/auth.controller.ts:919`
  — `googleCallback` Igniter mutation
- Companion route: `googleAuth` query (referenced from frontend) returns
  the OAuth URL
- 2FA branch: controller emits `requiresTwoFactor=true` + `challengeId`
  for accounts with second-factor enrolled

### 3. UI buttons (present)

- `src/client/components/auth/login-form-final.tsx:387`
  — "Continuar com Google" button calls `api.auth.googleAuth.query()`
- `src/client/components/auth/signup-form.tsx:294`
  — "Continuar com Google" button on signup

### 4. Routing

- `src/middleware.ts:22` — `/google-callback` is in `PUBLIC_PATHS`
- `src/app/(auth)/google-callback/page.tsx` — existing v2 page (now
  promoted to a server router that picks v2 vs v3)

## Implementation (this story)

- Extracted the legacy v2 page into
  `src/app/(auth)/google-callback/google-callback-v2-client.tsx`
  (byte-identical behavior, same Loader2/Alert UI, same redirects).
- Rewrote `src/app/(auth)/google-callback/page.tsx` as a Server Component
  that reads cookies (`accessToken` seed + `auth-v3-override`) and routes
  through `isAuthV3Enabled()` to either `GoogleCallbackV2Client` or
  `<AuthShell><GoogleCallbackV3 /></AuthShell>`.
- Created `src/client/components/auth/google-callback-v3.tsx`:
  - 'use client', strict TypeScript (zero `any`)
  - Loading state: DS `Card` with spinner + "Concluindo login..."
  - 2FA branch: mounts shared `TwoFactorChallenge` component
  - Success branch: redirects via `window.location.href` (mirrors v2),
    routing to `/onboarding`, `/admin`, or `/integracoes`
  - Error branch: DS `Card` with `Button` "Voltar para login"
  - Uses DS primitives only: `Card`, `Button`, `text-ds-*` tokens
- Added unit test
  `test/unit/react/auth/google-callback-v3.test.tsx` covering:
  loading, mutation call, 2FA branch, error from API, error param in URL.
- Logo is rendered by `<AuthShell>` (consistent with all other v3 pages).

## Out of scope

- Backend handler is untouched (read-only audit per US-312 constraints).
- No env vars added or modified.
- No changes to login/signup buttons; they continue to use the v2 OAuth
  start endpoint, which redirects to /google-callback where v2 or v3 then
  takes over based on the feature flag.

## Re-audit trigger

Re-evaluate this status if any of the following change:
- `GOOGLE_CLIENT_ID` removed from `.env` / production secrets
- `googleCallback` mutation removed from `auth.controller.ts`
- Both "Continuar com Google" buttons removed from login + signup forms
