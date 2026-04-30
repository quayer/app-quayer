# auth-pages — Skill

Carregar esta skill quando for mexer em qualquer rota `src/app/(auth)/*`, componente `src/client/components/auth/*`, ou biblioteca DS `src/client/components/ds/*`.

NAO carregar para: backend de auth (usar `auth.md`), dashboard, admin, landing.

---

## Rotas ativas (pos-cleanup Release 2)

| Rota | page.tsx | Componente principal (v2) | Componente principal (v3) | Endpoint |
|---|---|---|---|---|
| /login | src/app/(auth)/login/page.tsx | login-form-final.tsx | login-form-v3.tsx | api.auth.loginOTP |
| /login/verify | src/app/(auth)/login/verify/page.tsx | login-otp-form.tsx | login-verify-v3.tsx | api.auth.verifyLoginOTP |
| /login/verify-magic | layout.tsx+page.tsx | LoginVerifyMagicClient.tsx | (nao tem v3, e short-lived) | magic link |
| /signup | src/app/(auth)/signup/page.tsx | signup-form.tsx | signup-form-v3.tsx | api.auth.signupOTP |
| /signup/verify | src/app/(auth)/signup/verify/page.tsx | signup-otp-form.tsx | signup-verify-v3.tsx | api.auth.verifySignupOTP |
| /signup/verify-magic | layout.tsx+page.tsx | SignupVerifyMagicClient.tsx | (sem v3) | magic link |
| /verify-email | src/app/(auth)/verify-email/page.tsx | verify-email-form.tsx | verify-email-v3.tsx | api.auth.verifyEmail |
| /onboarding | src/app/(auth)/onboarding/page.tsx | onboarding-form.tsx | onboarding-v3.tsx | PATCH /api/v1/auth/profile |
| /google-callback | src/app/(auth)/google-callback/page.tsx | (verificar GOOGLE_OAUTH_STATUS.md) | ditto | google OAuth |

---

## Design System v3

Componentes primitivos em `src/client/components/ds/`:
- `button.tsx` — variants primary/secondary/ghost, sizes sm/md/lg, loading state
- `input.tsx` — label + helper + error + aria-invalid
- `otp-input.tsx` — 6 slots, auto-advance, paste fill, autoComplete=one-time-code
- `logo.tsx` — inline SVG com gradient `--gradient-icon`
- `card.tsx` — wrapper com radius + shadow tokens
- `toast.tsx` — info/success/error/warning

Todos os classes Tailwind usam prefixo `ds-*` (ex: `bg-ds-bg`, `text-ds-fg`, `rounded-ds-md`). Os tokens estao escopados em `[data-auth-v3="true"]` no `src/app/globals.css` — so funcionam quando o layout seta esse atributo (fazer via feature flag).

Rota dev para ver todos os states: `/dev/ds-showcase` (bloqueada em prod).

---

## Feature flag NEXT_PUBLIC_AUTH_V3

- Valores: `off` | `percentage:N` | `on`
- Helper: `isAuthV3Enabled(seedId, override)` em `src/lib/feature-flags/auth-v3.ts`
- Cookie de override: `auth-v3-override=on|off` (bypass para QA local)
- Uso em server component:
  ```typescript
  import { cookies } from 'next/headers';
  import { isAuthV3Enabled } from '@/lib/feature-flags/auth-v3';
  const c = await cookies();
  const isV3 = isAuthV3Enabled(c.get('accessToken')?.value, c.get('auth-v3-override')?.value);
  ```
- Ativar localmente: `NEXT_PUBLIC_AUTH_V3=on npm run dev` OU setar cookie `auth-v3-override=on` no devtools.

---

## Adicionar nova pagina de auth

1. Criar `src/app/(auth)/<rota>/page.tsx` como async server component
2. Ler cookies, chamar `isAuthV3Enabled()`
3. Renderizar `<NovaFormV3 />` dentro de `<AuthShell />` se v3, ou o componente v2 caso contrario
4. Criar `src/client/components/auth/nova-form-v3.tsx` usando DS primitives
5. Criar unit test em `test/unit/react/auth/nova-form-v3.test.tsx` com mock de `@/igniter.client` e `next/navigation`
6. Se a nova pagina tem endpoint novo: contract test em `test/contract/auth/`

---

## Padroes de mock para testes

Ver `docs/auth/TESTING_PATTERNS.md`. Reutilizar exatamente:
- `vi.mock('@/igniter.client')`
- `vi.mock('next/navigation')`
- `vi.mock('@/client/hooks/use-csrf-token')`

---

## Referencias cruzadas

- `docs/auth/USER_JOURNEY.md` — 4 jornadas completas com Mermaid
- `docs/auth/AUTH_FLOW.md` — sequence diagram + endpoints + troubleshooting
- `docs/auth/ASSETS.md` — imagem hero e conventions
- `docs/auth/FEATURE_FLAGS.md` — rollout plan e override cookie
- `docs/auth/TESTING_PATTERNS.md` — padroes de mock
- `docs/auth/BASELINES.md` — metricas para comparacao de regressao
- `.claude/skills/auth.md` — skill complementar para BACKEND (procedures, repository, controller)
- `.claude/skills/testing-pipeline.md` — como testar
- `.claude/skills/release-checklist.md` — gate pre-release
