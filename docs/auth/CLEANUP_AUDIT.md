# Auth Cleanup Audit

Date: 2026-04-08
Phase: A (Instrumentation + Static Audit)
Source: tasks/prd-02-auth-cleanup.md
Owner: [fill in PR]

## Scope

5 candidate legacy routes flagged for deletion after 14 days of traffic
observation (US-201 deployed via `logCleanupAccess`):

- /register
- /forgot-password
- /reset-password/[token]
- /login/verify-magic
- /signup/verify-magic

Methodology: pure static analysis (grep + Read). No runtime probes, no
endpoint calls. Findings classified as KEEP / UPDATE / DELETE.

---

## Static References

### /register

**Frontend Link/router (string literal `/register`):**
- src/app/(auth)/register/page.tsx:9 — `route: '/register'` (US-201
  instrumentation tag, server `redirect('/signup')`) — DELETE with route
- src/middleware.ts:17 — entry in `PUBLIC_PATHS` array — UPDATE (remove
  entry when route deleted; otherwise harmless)
- src/lib/auth/auth-provider.tsx:138 — entry in `publicPaths` array used
  by client-side guard — UPDATE (remove entry on delete)

**Backend redirects:**
- src/app/(auth)/register/page.tsx:16 — `redirect('/signup')` (this IS
  the stub) — DELETE with route

**Tests:**
- test/e2e/onboarding-flow.spec.ts:27 — `page.goto('${BASE_URL}/register')`
  — UPDATE (point to `/signup`)

**Configs:**
- (none found in next.config.ts / prisma)

**Comments:**
- (none specific)

**Exclusive components:**
- (none) — the stub `register/page.tsx` imports only `next/navigation`
  and `cleanup-audit-logger`. No auth components are exclusively used.

**Other matches (NOT this route):**
- src/igniter.schema.ts:385,390 / openapi.json:31 / passkey-manager.tsx:136,162
  / auth.controller.ts:2151,2199 — all reference `/passkey/register/*`
  (passkey WebAuthn, unrelated)
- src/lib/providers/adapters/cloudapi/cloudapi.client.ts:1042 — Meta
  Cloud API `phoneNumberId/register` (unrelated)
- src/client/components/admin-settings/SecuritySettings.tsx:293 —
  display string mentioning `/api/v1/auth/register` in admin UI label —
  UPDATE (remove mention; backend endpoint already removed)

### /forgot-password

**Frontend Link/router:**
- src/app/(auth)/forgot-password/page.tsx:9 — `route: '/forgot-password'`
  (instrumentation tag in stub) — DELETE with route
- src/middleware.ts:20 — entry in `PUBLIC_PATHS` — UPDATE
- src/lib/auth/auth-provider.tsx:138 — entry in `publicPaths` — UPDATE

**Backend redirects:**
- src/app/(auth)/forgot-password/page.tsx:16 — `redirect('/login')`
  (the stub) — DELETE with route

**Tests:** (none found)

**Configs:** (none)

**Comments:**
- docs/architecture/AUTH_MAP.md:593 — historical CAPTCHA note
  mentioning forgot-password — UPDATE doc (post-delete)

**Exclusive components:** (none) — stub has zero component imports

### /reset-password/[token]

**Frontend Link/router:**
- src/app/(auth)/reset-password/[token]/page.tsx:14 —
  `route: '/reset-password/[token]'` (instrumentation tag) — DELETE
- src/middleware.ts:21 — `PUBLIC_PATHS` entry `/reset-password` (prefix
  match) — UPDATE
- src/lib/auth/auth-provider.tsx:138 — `publicPaths` entry — UPDATE

**Backend redirects:**
- src/app/(auth)/reset-password/[token]/page.tsx:21 — `redirect('/login')`
  (the stub) — DELETE with route

**Tests:** (none found)

**Configs:** (none)

**Comments:** (none specific outside docs)

**Exclusive components:** (none)

### /login/verify-magic

**Frontend Link/router:**
- src/app/(auth)/login/verify-magic/page.tsx — dynamic-loads
  LoginVerifyMagicClient — DELETE with route
- src/app/(auth)/login/verify-magic/layout.tsx:12 —
  `route: '/login/verify-magic'` instrumentation — DELETE
- src/app/(auth)/login/verify-magic/LoginVerifyMagicClient.tsx:37 —
  `window.history.replaceState({}, '', '/login/verify-magic')` (self) —
  DELETE
- src/app/(auth)/login/verify-magic/loading.tsx — skeleton — DELETE

**Backend redirects (email links pointing here):**
- src/server/core/auth/controllers/auth.controller.ts:1559 —
  `${appBaseUrl}/login/verify-magic?token=...` inside login OTP handler
  — UPDATE (CRITICAL: this is an EMAIL link to a real, working flow,
  not a dead stub. See "Phase B Recommendation" below.)

**Tests:**
- test/api/auth.test.ts:413,421,922 — tests for backend
  `POST /auth/verify-magic-link` endpoint, NOT the frontend route —
  KEEP (different layer)

**Configs:** (none)

**Comments:**
- docs/architecture/AUTH_MAP.md:80,164 — documents the route as active
  — UPDATE doc only if route is actually deleted

**Exclusive components:**
- src/app/(auth)/login/verify-magic/LoginVerifyMagicClient.tsx — DELETE
  candidate (only this route uses it)
- imports `TwoFactorChallenge` from
  src/client/components/auth/two-factor-challenge.tsx — KEEP (shared
  with login OTP form)

### /signup/verify-magic

**Frontend Link/router:**
- src/app/(auth)/signup/verify-magic/page.tsx — dynamic loads client —
  DELETE with route
- src/app/(auth)/signup/verify-magic/layout.tsx:12 —
  `route: '/signup/verify-magic'` instrumentation — DELETE
- src/app/(auth)/signup/verify-magic/SignupVerifyMagicClient.tsx —
  DELETE

**Backend redirects (email links):**
- src/server/core/auth/controllers/auth.controller.ts:1279 —
  `${appBaseUrl}/signup/verify-magic?token=...` in signup welcome email
  — UPDATE (CRITICAL: real email link, see Phase B note)
- src/server/core/auth/controllers/auth.controller.ts:1516 — second
  occurrence in signup resend path — UPDATE

**Tests:** (none directly — backend `verify-magic-link` tests cover
the API but not the page)

**Configs:** (none)

**Comments:**
- docs/architecture/AUTH_MAP.md:167 — UPDATE doc post-delete

**Exclusive components:**
- src/app/(auth)/signup/verify-magic/SignupVerifyMagicClient.tsx —
  DELETE candidate (used only by this route, no shared imports beyond
  ui primitives)

---

## Backend Endpoint Status

Verified by reading `src/server/core/auth/controllers/auth.controller.ts`:

- `POST /api/v1/auth/register` — ALREADY REMOVED. No `igniter.mutation`
  named `register` or path `/register` (root) exists. Only
  `/passkey/register/options|verify` (WebAuthn, unrelated) remain.
- `POST /api/v1/auth/forgot-password` — ALREADY REMOVED. Zero refs.
- `POST /api/v1/auth/reset-password` — ALREADY REMOVED. Zero refs.
- `POST /api/v1/auth/magic-link` (send) — Implemented INSIDE the
  signup/login OTP handlers (lines 1272-1282, 1552-1573). Not a
  standalone mutation; the email is generated as part of the OTP send
  flow. KEEP — actively used by passwordless auth.
- `POST /api/v1/auth/verify-magic-link` — EXISTS at controller line
  1705-1715. Live endpoint, covered by tests (test/api/auth.test.ts:410-427).
  KEEP.

Conclusion: 3 of the 4 password endpoints are already gone. Magic link
backend (send + verify) is alive and consumed by both `/login/verify-magic`
and `/signup/verify-magic` pages.

---

## Action Summary

Total static references found across the 5 routes: 26
(self-referential stub lines + middleware + auth-provider + email
generators + tests + admin-settings UI string + 1 e2e spec)

- KEEP: 4 (backend verify-magic-link tests, TwoFactorChallenge
  component, passkey/register paths, cloudapi register path)
- UPDATE: 9 (middleware PUBLIC_PATHS x3, auth-provider publicPaths x3,
  e2e onboarding-flow.spec.ts, admin SecuritySettings label, 3
  email-link generators in auth.controller.ts — though "update" here
  may mean "leave as-is" for verify-magic; see below)
- DELETE: 13 (3 stub pages, 2 verify-magic page+layout+client+loading
  bundles, 4 instrumentation route tags)

---

## Recommendation for Phase B

Based on STATIC evidence alone (traffic data still pending US-204):

- `/register`: LIKELY_DELETE — pure stub redirecting to `/signup`,
  backend gone, only e2e test + middleware list to update. Low risk.
- `/forgot-password`: LIKELY_DELETE — pure stub, backend gone, no
  tests, no inbound emails. Lowest risk of the five.
- `/reset-password/[token]`: LIKELY_DELETE — same as forgot-password.
  No active email currently generates this URL.
- `/login/verify-magic`: **STRONG KEEP** — this is NOT a legacy stub.
  `auth.controller.ts:1559` actively generates emails pointing here as
  part of the live passwordless login flow (OTP + magic link sent in
  same email). Deleting it breaks production passwordless login.
  Instrumentation was added to MEASURE usage, but the static evidence
  alone shows the route is wired into live email generation. This route
  should be reclassified OUT of the cleanup candidates.
- `/signup/verify-magic`: **STRONG KEEP** — same situation.
  `auth.controller.ts:1279` and `:1516` generate magic-link emails for
  the signup welcome flow. Live, not legacy.

Final decision MUST wait for 14-day traffic data (US-204), but the
static evidence already disqualifies the two verify-magic routes.
Recommend Phase B target only the 3 password-flow stubs.

### Top 3 Surprises / Edge Cases

1. The two `verify-magic` routes were grouped as "legacy" alongside the
   password stubs, but they are part of the LIVE passwordless flow.
   Their backend (`verifyMagicLink` mutation, line 1705) is the only
   way to exchange a magic-link token for a session. Strong KEEP.
2. `src/client/components/admin-settings/SecuritySettings.tsx:293`
   displays the string `/api/v1/auth/register` in admin UI copy,
   despite the endpoint being removed months ago (per AUTH_MAP.md
   note dated 2026-03-16). Stale UI text — UPDATE regardless of
   cleanup outcome.
3. `test/e2e/onboarding-flow.spec.ts:27` still navigates to `/register`
   directly. Currently masked by the US-201 redirect-to-/signup stub,
   so the test "works" but is testing the wrong URL. UPDATE to `/signup`
   regardless.

---

## Skill reference

- .claude/skills/testing-pipeline.md (Pipeline verification after Phase D delete)
- .claude/skills/release-checklist.md (release gate)
- docs/infra/ROLLBACK_RUNBOOK.md (Scenario A if delete breaks prod)

---

## External References (US-203)

Audit of references to the 5 routes outside source code (email templates, docs, config) and TODOs for assets that live OUTSIDE this repo.

### Email templates

| Template | Location | References to 5 routes | Recommendation |
|---|---|---|---|
| magic-link.ts | src/lib/email/templates/magic-link.ts | none (uses opaque `magicLink` variable) | KEEP - URL injected by caller |
| login-code.ts | src/lib/email/templates/login-code.ts | none (uses `magicLink` variable) | KEEP - URL injected by caller (auth.controller.ts:1559 builds `/login/verify-magic?token=...`) |
| welcome-signup.ts | src/lib/email/templates/welcome-signup.ts | none (uses `magicLink` variable) | KEEP - URL injected by caller (auth.controller.ts:1279,1516 build `/signup/verify-magic?token=...`) |
| passwordless-otp.ts | src/lib/email/templates/passwordless-otp.ts | none | KEEP |
| verification.ts | src/lib/email/templates/verification.ts | none | KEEP |
| password-reset.ts | src/lib/email/templates/password-reset.ts | none directly; template is dead because forgot/reset endpoints removed | DELETE (orphaned with /forgot-password and /reset-password backend) |
| welcome.ts | src/lib/email/templates/welcome.ts | none | KEEP |
| invitation.ts | src/lib/email/templates/invitation.ts | none | KEEP |

Conclusion: zero email templates contain hardcoded literals for the 5 routes. Magic-link URLs are constructed in `src/server/core/auth/controllers/auth.controller.ts` (lines 1279, 1516, 1559) using `${appBaseUrl}/login/verify-magic` and `${appBaseUrl}/signup/verify-magic`. Only `password-reset.ts` is functionally orphaned because its backend was removed.

### Documentation

Doc files containing references to the 5 routes:

- docs/architecture/AUTH_MAP.md (lines 4, 80, 112, 164, 167, 168, 171, 172, 185, 225, 648, 649, 795, 819) - already documents `/register`, `/forgot-password`, `/reset-password` as ORPHANS; `/login/verify-magic` and `/signup/verify-magic` as ACTIVE
- docs/architecture/ROUTES_MAP_v2.md (lines 11, 29, 41, 62, 67, 81, 86, 88) - lists all 5 routes; section 1.7 marks `/register` as Legacy
- docs/auth/CLEANUP_AUDIT.md (this file, US-201 + US-202 sections) - canonical inventory
- docs/api-specs/whatsapp-cloud-api.postman.json - contains `/register` BUT only as Meta Cloud API `phoneNumberId/register` (UNRELATED, not an auth route)
- docs/api-specs/postman/WhatsApp Cloud API.postman_collection.json - same UNRELATED Meta endpoint

Action: After Phase D delete lands, update AUTH_MAP.md and ROUTES_MAP_v2.md to drop `/register`, `/forgot-password`, `/reset-password/[token]` rows. Postman collections must NOT be touched (different API surface).

### Configuration

- next.config.ts - zero references to any of the 5 routes. No redirects, rewrites, or headers configured for them. No action needed.
- src/middleware.ts - PUBLIC_PATHS array (lines 17, 20, 21) declares `/register`, `/forgot-password`, `/reset-password` as public. After Phase D delete these entries become dead and MUST be removed in the same PR to avoid surfacing 404s as public.

### External TODOs

These references live outside this repo and CANNOT be verified from here. Owners must confirm/update before Phase D ships.

- [ ] TODO_EXTERNO: Landing page (quayer.com or marketing site repo) - check footer, header CTAs, signup buttons for hardcoded `/register`, `/forgot-password`, `/reset-password` links and replace with `/signup` and `/login`
- [ ] TODO_EXTERNO: Mobile app (if any iOS/Android client exists) - audit deep links and in-app browser redirects to the 5 routes
- [ ] TODO_EXTERNO: Public SDK / API client libraries - confirm no SDK exposes `forgotPassword`/`resetPassword`/`register` helpers that POST to removed endpoints
- [ ] TODO_EXTERNO: Help center / knowledge base (Notion, Intercom, Zendesk) - search articles for screenshots and links to `/register`, `/forgot-password`, `/reset-password`; update to reflect passwordless flow
- [ ] TODO_EXTERNO: Marketing emails (Mailchimp, Brevo, ActiveCampaign templates) - existing drip campaigns may link to `/register` or password-reset; audit and migrate
- [ ] TODO_EXTERNO: External integrations / partner docs / Postman public workspace - confirm partners are not pointing to `/api/v1/auth/register`, `/api/v1/auth/forgot-password`, `/api/v1/auth/reset-password` (already removed backend)

### Summary

- Email templates audited: 9 (8 KEEP, 1 DELETE candidate: password-reset.ts)
- Email templates with hardcoded route literals: 0
- Doc files with auth-route refs: 3 internal (AUTH_MAP.md, ROUTES_MAP_v2.md, CLEANUP_AUDIT.md) + 2 unrelated Postman collections (Meta Cloud API, IGNORE)
- Config files with refs: 1 (src/middleware.ts PUBLIC_PATHS - 3 entries to remove); next.config.ts is clean
- External TODOs (out-of-repo): 6 surfaces to verify before Phase D
- Top finding: NO email template hardcodes the 5 routes - magic-link URLs are built in auth.controller.ts using `appBaseUrl`, so deleting `/login/verify-magic` and `/signup/verify-magic` would silently break login/signup. CONFIRMS US-202 STRONG KEEP recommendation for both verify-magic routes.
