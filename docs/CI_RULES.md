# CI Rules — Quayer

This document defines the rules and expectations for Continuous Integration on the Quayer codebase.

## Branch Protection (required on `main`)

The `main` branch MUST have the following status checks marked as **required** in GitHub branch protection settings:

- `Static Analysis / typecheck`
- `Static Analysis / lint`

**Rule:** PRs cannot merge with failing static analysis — this is enforced by branch protection, not just the workflow. A red workflow alone does not block merging unless the check is explicitly listed as required in the branch protection rule.

## CI Workflows

Workflows live in `.github/workflows/`:

| Workflow | File | Purpose |
|---|---|---|
| Static Analysis | `static.yml` | typecheck (`tsc --noEmit`) + lint (`next lint`) on every PR/push |
| CI | `ci.yml` | General CI pipeline |
| Tests | `tests.yml` | Unit / integration / E2E test suite |
| Synthetic Monitor | `synthetic-monitor.yml` | Production health probes |
| Deploy Homol | `deploy-homol.yml` | Homologation deploy |
| Deploy Production | `deploy-production.yml` | Production deploy |
| Hotfix | `hotfix.yml` | Hotfix branch flow |
| Release | `release.yml` | Release tagging |
| Docs Sync | `docs-sync.yml` | Documentation synchronization |
| PR Welcome | `pr-welcome.yml` | First-PR contributor greeting |

## Running Static Checks Locally

Before committing, run the same checks CI runs:

```bash
npx tsc --noEmit && npx next lint
```

These also run automatically on staged files via the Husky `pre-commit` hook (powered by `lint-staged`).

## Expected Timing

- **typecheck job:** to be measured after first run
- **lint job:** to be measured after first run

Both jobs have a 10-minute timeout. If they consistently exceed 5 minutes, consider caching strategies (Turbo, Nx, or `tsc --incremental`).

## Failure Policy

1. A failing static check blocks merge.
2. Do not bypass with admin merge unless explicitly authorized by the engineering lead.
3. If the workflow itself is broken (not the code), open a PR to fix the workflow first.

## API Integration Tests (US-106C)

Workflow: `.github/workflows/test-api.yml`

Triggers: pull_request on main/develop, push to main.

Provisions ephemeral postgres:16-alpine via GitHub services on port 5433. Runs prisma migrate deploy + seed + vitest integration tests against `test/integration/`.

Secrets: uses dummy test values for JWT_SECRET, IGNITER_APP_SECRET, ENCRYPTION_KEY. Real secrets NOT used in this job.

Timeout: 15 minutes.

Branch protection MUST require this job to pass before merge to main.
