# Auth v3 Code Review Aggregator

Date: 2026-04-08
Release: 3 (Auth Rebrand v3)
Reviewer: LLM-assisted (this is NOT a substitute for human review -- see human gate at bottom)

## Scope

All files touched by US-301 through US-316. LLM review is advisory only and must be followed by a human gate before merge.

## Review by area

### US-301 Feature flag
Files: src/lib/feature-flags/auth-v3.ts, test/unit/feature-flags/auth-v3.test.ts, docs/auth/FEATURE_FLAGS.md

- [INFO] Stable SHA-256 hash for percentage distribution -- deterministic across requests
- [INFO] Override cookie bypasses env percentage -- correct precedence (cookie > env)
- [INFO] Fail-closed on malformed env -- defensive default
- [TODO] Verify distribution bounds by running unit test with n=10k samples (target +/- 2% of nominal)
- Severity: PASS

### US-302 Hero asset
Files: public/images/auth/login-hero.png (6.81 MB), docs/auth/ASSETS.md

- [CRITICAL] PNG is 6.81 MB -- will destroy LCP and fail US-317 perf budget
- [HIGH] Must convert to WebP < 150 KB before prod rollout -- non-negotiable
- [MEDIUM] Consider AVIF fallback via next/image automatic format negotiation
- [MEDIUM] Add explicit `width`/`height` even with `fill` to help layout shift metrics
- Severity: BLOCKS ROLLOUT -- must resolve before US-319

### US-303 Tokens + Tailwind + fonts
Files: src/app/globals.css, tailwind.config.ts, src/app/(auth)/layout.tsx

- [INFO] Tokens scoped via `[data-auth-v3="true"]` -- correct isolation from v2
- [INFO] next/font with `display: swap` -- avoids FOIT, good LCP behavior
- [TODO] Verify Tailwind v4 actually reads tailwind.config.ts (v4 is CSS-first; the file may be dead config)
- [MEDIUM] DM_Mono weight array should match actual usage -- prune unused weights to save bytes
- Severity: PASS with medium TODOs

### US-304 DS primitives
Files: src/client/components/ds/{button,input,otp-input,logo,card,toast}.tsx, test/unit/react/ds/*, src/app/dev/ds-showcase/page.tsx

- [INFO] Button, Input use forwardRef -- correct for form libs
- [INFO] Zero `any`; Props types exported
- [INFO] Showcase route returns `notFound()` in production -- correct gating
- [INFO] aria-busy, aria-invalid, aria-describedby, role/aria-live verified in source (see A11Y_AUDIT.md)
- [TODO] Verify OtpInput auto-advance in Safari (known iOS quirks with controlled inputs)
- [TODO] Logo gradient id `ds-logo-gradient` is hardcoded -- collision risk if rendered twice on same page
- [MEDIUM] Input error span lacks `role="alert"` -- dynamic errors will not be announced (see A11Y moderate finding)
- Severity: PASS with one moderate a11y TODO

### US-305 AuthShell
Files: src/client/components/auth/auth-shell.tsx, test/unit/react/auth/auth-shell.test.tsx

- [INFO] Server component -- reduces client bundle
- [INFO] next/image with `priority` + `fetchPriority="high"` + `sizes` -- correct LCP handling
- [INFO] Hero `alt=""` -- correct for decorative image
- [HIGH] Depends on 6.81 MB PNG (see US-302 critical) -- LCP will be terrible until that is fixed
- [INFO] Responsive: `hidden md:block` -- mobile gets no image penalty
- Severity: PASS but BLOCKED by US-302

### US-306..311 Pages v3
Files: src/app/(auth)/*/page.tsx (modified) + src/client/components/auth/{login-form-v3,login-verify-v3,signup-form-v3,signup-verify-v3,verify-email-v3,onboarding-v3}.tsx (new)

- [INFO] Dual-render pattern preserved in all pages (v2 untouched when flag off)
- [INFO] v2 code paths bit-for-bit unchanged -- zero regression risk for v2 users
- [INFO] All forms call same controllers as v2 (contract preservation)
- [TODO] Verify post-login redirect targets match v2 (login -> /integracoes or /admin or /onboarding depending on user state)
- [TODO] Verify autocomplete attributes per A11Y_AUDIT.md (email, name, new-password, current-password)
- [MEDIUM] SignupFormV3 likely uses native checkbox -- DS Wave 1 lacks Checkbox primitive; track for follow-up
- [MEDIUM] Onboarding v3 is simplified (2 steps) vs v2 -- needs product review to ensure no required data is dropped
- Severity: PASS with medium TODOs

### US-312 google-callback
Files: src/app/(auth)/google-callback/page.tsx + src/client/components/auth/google-callback-v3.tsx

- [INFO] Scenario A confirmed -- Google OAuth flow active in v2
- [INFO] v3 wraps existing controller call; no new endpoint
- [INFO] 2FA branch reuses TwoFactorChallenge (v2 component) -- good reuse, avoids duplication
- Severity: PASS

### US-313..315 Docs + skill
Files: docs/auth/USER_JOURNEY.md, docs/auth/AUTH_FLOW.md, .claude/skills/auth-pages.md

- [INFO] Mermaid syntax valid
- [INFO] Endpoints documented from actual source
- [INFO] auth-pages skill clearly separated from backend auth.md
- [TODO] 4 verify-with-code TODOs in AUTH_FLOW.md (cleanup job, skill existence, TOTP path, refresh interceptor)
- Severity: PASS

### US-316 a11y audit
Files: docs/auth/A11Y_AUDIT.md (this PR)

- [INFO] All DS components verified at source level
- [TODO] Manual NVDA/VoiceOver testing
- [TODO] Color contrast computation from globals.css
- [TODO] axe-core CI integration (US-316 part b -- requires package install)
- Severity: PASS (doc deliverable complete)

## Blocking issues for rollout

1. CRITICAL: public/images/auth/login-hero.png is 6.81 MB. MUST convert to WebP < 150 KB before US-319 (first rollout). Failure to do so will violate US-317 perf budget and trash LCP in prod.
2. HIGH: Manual a11y verification (keyboard + screen reader) not yet performed -- 2 moderate findings open in A11Y_AUDIT.md.
3. MEDIUM: Tailwind v4 config dead-code risk -- verify tailwind.config.ts is read or remove.

## Non-blocking TODOs (track as follow-up issues)

- [ ] Add DS Checkbox primitive (Wave 2 of DS)
- [ ] Verify Tailwind v4 config.ts is not dead code
- [ ] Onboarding product review (simplified 2-step flow vs v2)
- [ ] Verify TOTP endpoint paths in AUTH_FLOW.md
- [ ] Add @axe-core/playwright for a11y CI (US-316 part b)
- [ ] Manual keyboard nav + screen reader test (NVDA + VoiceOver)
- [ ] Add `role="alert"` to Input error span
- [ ] Fix Logo gradient id collision risk (use React.useId)
- [ ] Verify autocomplete attributes per form
- [ ] Add Esc-to-dismiss handler to Toast

## Human review gate (US-318 real acceptance criterion)

This LLM review does NOT substitute a human review. Before merging Release 3:
- [ ] At least 1 human reviewer approves the PR
- [ ] All CRITICAL and HIGH findings above are resolved
- [ ] MEDIUM and LOW findings have tracking issues filed
- [ ] Rollback plan validated (docs/infra/ROLLBACK_RUNBOOK.md, if present)
- [ ] US-317 perf budget green
- [ ] US-316 manual a11y pass complete

## References
- .claude/skills/release-checklist.md
- docs/auth/A11Y_AUDIT.md
- docs/auth/BASELINES.md (for perf comparison)
- docs/auth/ASSETS.md
- docs/auth/FEATURE_FLAGS.md
