# Auth v3 Feature Flag

The auth v3 UI is gated behind the `NEXT_PUBLIC_AUTH_V3` feature flag so we can
dual-render v2 and v3 pages and roll out the new experience progressively.

## Values

`NEXT_PUBLIC_AUTH_V3` accepts three formats:

- `off` (default) - always render the legacy v2 auth UI.
- `on` - always render the new v3 auth UI.
- `percentage:N` - render v3 for `N` percent of users, where `N` is an integer
  in `[0, 100]`. The bucket is computed by hashing a stable seed (the userId
  when authenticated, otherwise an anonymous cookie id) with SHA-256 and
  taking `hash % 100 < N`. The same seed always lands in the same bucket, so
  users get a stable experience across requests.

Any other value is treated as `off` (fail-closed).

## Override cookie

For QA, support, and incident response we honor an `auth-v3-override` cookie
that takes precedence over the env var:

- `auth-v3-override=on` - force v3 for this browser, regardless of env.
- `auth-v3-override=off` - force v2 for this browser, regardless of env.

Set the cookie in DevTools or via a short-lived signed link. It is scoped to
the current device, never persisted server-side, and never trusted for
authorization - it only switches which UI to render.

## Usage in server components

```typescript
import { cookies } from 'next/headers';
import { isAuthV3Enabled } from '@/lib/feature-flags/auth-v3';

const c = await cookies();
const override = c.get('auth-v3-override')?.value;
const userId = c.get('accessToken')?.value; // or decoded JWT sub
const isV3 = isAuthV3Enabled(userId, override);
```

The function lives in `src/lib/feature-flags/auth-v3.ts` and uses `node:crypto`
so it works in Server Components, Route Handlers, and Edge-incompatible server
runtimes. Do not import it from client components.

## Rollout plan

We roll out v3 in four stages, holding for 48h between each stage to watch
auth funnel metrics, error rates, and support tickets:

1. `percentage:0` - dark launch, code paths shipped but no traffic.
2. `percentage:10` - early adopters and internal users.
3. `percentage:50` - half the user base.
4. `percentage:100` (or `on`) - full rollout.

If a stage looks healthy after 48h we promote to the next stage by updating
`NEXT_PUBLIC_AUTH_V3` in the environment config.

## Rollback

If anything looks wrong at any stage, flip `NEXT_PUBLIC_AUTH_V3` to `off`. No
deploy is required - the next request will pick up the new env value and serve
v2 again. For a single user that is stuck, set `auth-v3-override=off` on their
browser to bypass the bucketing immediately.

See `.claude/skills/release-checklist.md` for the full release procedure.
