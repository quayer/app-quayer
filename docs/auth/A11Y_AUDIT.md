# Auth v3 Accessibility Audit

Date: 2026-04-08
Standard: WCAG 2.1 AA
Scope: src/client/components/ds/* + src/client/components/auth/*-v3.tsx
Source of truth for final audit: axe-core in CI (TODO -- see US-316 part b)

## Component findings

### button (src/client/components/ds/button.tsx)
- [PASS] Native `<button>` element -- keyboard accessible by default
- [PASS] `disabled` attribute set when `disabled || loading` (line 60); `pointer-events-none` applied while loading (line 50)
- [PASS] Loading state sets `aria-busy={loading || undefined}` (line 61) -- VERIFIED in source
- [PASS] Focus visible: `focus-visible:ring-2 focus-visible:ring-offset-2` (line 46) -- VERIFIED
- [PASS] Spinner is `aria-hidden="true"` so it does not pollute SR output (line 68)
- [TODO] Contrast: primary uses `bg-ds-p-500` vs `text-ds-on-primary` -- CHECK TOKEN VALUES in src/app/globals.css for >= 4.5:1
- Finding severity: minor (pending contrast verification)

### input (src/client/components/ds/input.tsx)
- [PASS] `<label htmlFor={inputId}>` linked via stable uid (lines 41, 44-46) -- VERIFIED
- [PASS] `aria-invalid={error ? true : undefined}` (line 47) -- VERIFIED
- [PASS] `aria-describedby` points to error or helper id (line 48) -- VERIFIED
- [TODO] Error span has neither `role="alert"` nor `aria-live` (line 53) -- screen readers will not announce dynamically; recommend adding `role="alert"` to the error span
- Finding severity: moderate (dynamic error announcement gap)

### otp-input (src/client/components/ds/otp-input.tsx)
- [PASS] `autoComplete="one-time-code"` on first slot only (line 126) -- VERIFIED
- [PASS] `inputMode="numeric"` + `pattern="[0-9]*"` for mobile keyboard (lines 121-122) -- VERIFIED
- [PASS] `aria-label={`Digit ${i + 1} of ${length}`}` per slot (line 127) -- VERIFIED
- [PASS] Wrapper has `role="group"` + `aria-label="One-time code, N digits"` (lines 112-113) -- VERIFIED
- [PASS] ArrowLeft/ArrowRight navigation + Backspace delete-and-back implemented (lines 79-98)
- [TODO] Paste handler does not announce success via `aria-live` -- screen readers may miss it. Manual NVDA test required.
- Finding severity: moderate (paste announcement)

### logo (src/client/components/ds/logo.tsx)
- [PASS] Server component, SVG inline, no hydration cost
- [PASS] `aria-hidden={ariaLabel ? undefined : true}` -- decorative by default (line 23) -- VERIFIED
- [PASS] When `aria-label` provided: `role="img"` + `<title id>` + `aria-labelledby` (lines 22-26) -- VERIFIED
- [TODO] Hardcoded gradient id `ds-logo-gradient` (line 28) -- if rendered twice on a page, second instance may collide. Low risk on auth pages.
- Finding severity: minor

### card (src/client/components/ds/card.tsx)
- [PASS] Generic wrapper -- no ARIA needed unless interactive

### toast (src/client/components/ds/toast.tsx)
- [PASS] `role="alert"` for error/warning, `role="status"` for info/success (line 27) -- VERIFIED
- [PASS] `aria-live="assertive"` for alert, `polite` for status (line 28) -- VERIFIED
- [PASS] Dismiss button has `aria-label="Dismiss notification"` (line 45) -- VERIFIED

### auth-shell (src/client/components/auth/auth-shell.tsx)
- [PASS] Hero image has empty `alt=""` (line 28) -- correct since purely decorative -- VERIFIED
- [PASS] Layout uses semantic divs; landmarks come from page-level `<main>` in (auth)/layout.tsx
- [PASS] Image hidden on mobile via `hidden md:block` (line 24) -- correct, no SR penalty
- [TODO] No skip-link for keyboard users -- low priority since form is already early in tab order

### *-v3 forms (login-form-v3, login-verify-v3, signup-form-v3, signup-verify-v3, verify-email-v3, onboarding-v3, google-callback-v3)
- [INHERITS] Uses DS Input/Button/OtpInput primitives -- inherits accessibility above
- [TODO] Form-level error aggregation: when submit fails, error message must surface via Toast (which has `role="alert"`) or a summary `<div role="alert">`. Verify per-form.
- [TODO] Autocomplete hints: email fields should set `autoComplete="email"`; name `autoComplete="name"`; new password `autoComplete="new-password"`; current password `autoComplete="current-password"`. Verify per-form via grep.
- [TODO] Onboarding v3 likely uses native `<input type="checkbox">` for ToS -- verify it has an associated label.

## Keyboard navigation checklist (manual test required)
- [ ] Tab order: Logo -> Email input -> Submit button (login)
- [ ] Enter on input submits form
- [ ] OTP input: ArrowLeft/Right navigate, Backspace deletes and moves back (code path verified, manual confirmation pending)
- [ ] Esc dismisses toasts (NOT IMPLEMENTED -- toast only dismisses via x button; consider adding Esc handler)
- [ ] No keyboard trap in modals/forms

## Color contrast (requires token values)
The DS tokens in `[data-auth-v3]` selectors must be verified against WCAG AA:
- Normal text: 4.5:1
- Large text (>= 18pt or 14pt bold): 3:1
- UI components and graphical objects: 3:1

TODO: extract actual color values from src/app/globals.css `[data-auth-v3]` block and compute contrast ratios for these pairs:
- `--ds-p-500` (primary bg) vs `--ds-on-primary`
- `--ds-fg` vs `--ds-bg`
- `--ds-fg` vs `--ds-surface`
- `--ds-muted` vs `--ds-bg` (helper text)
- `--ds-danger` vs `--ds-bg` (error text)
- `--ds-border` vs `--ds-bg` (input border, must be >= 3:1)

Tooling: `npx pa11y http://localhost:3000/login` (after rollout flag enabled) or online contrast checker.

## Summary
- Critical findings: 0
- Serious findings: 0
- Moderate findings: 2 (input dynamic error announcement; otp paste announcement)
- Minor findings: 2 (button contrast pending; logo gradient id collision risk)
- TODOs for manual verification: 8

## Axe-core CI integration (TODO -- US-316 part b)
Add `@axe-core/playwright` to E2E suite under test/e2e/auth/. Wire into existing `auth-flows.spec.ts` as a fixture. Fail build on `critical` or `serious` violations; warn on `moderate` and `minor`. Pending package install (out of scope for doc-only US-316).

Reference snippet (do not commit until package added):

```ts
import AxeBuilder from '@axe-core/playwright'
const results = await new AxeBuilder({ page }).analyze()
expect(results.violations.filter(v => ['critical','serious'].includes(v.impact ?? ''))).toEqual([])
```

## References
- .claude/skills/testing-pipeline.md
- docs/auth/USER_JOURNEY.md
- docs/auth/V3_CODE_REVIEW.md
- WCAG 2.1 AA spec: https://www.w3.org/TR/WCAG21/
