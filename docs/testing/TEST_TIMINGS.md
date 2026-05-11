# Test Timings

Snapshot of total and per-layer test execution time for `npm run test:all`.

## How to measure

```bash
npm run test:all 2>&1 | grep "^real\|^user\|^sys"
```

Or capture full output:
```bash
npm run test:all 2>&1 | tee test-timings.txt
```

## Windows note

`time -p` works in git-bash and WSL. On pure cmd.exe / PowerShell, use `Measure-Command { npm run test:all }` instead and adapt per-layer.

## Layers measured

| Layer | Script | Typical range |
|---|---|---|
| Lint | test:all:lint | TBD |
| Typecheck | test:all:typecheck | TBD |
| Unit backend | test:all:unit | TBD |
| Unit React | test:all:react | TBD |
| API integration | test:all:api | TBD |
| Contract | test:all:contract | TBD |
| E2E | test:all:e2e | TBD |
| **Total** | test:all | TBD |

## Baseline (to be captured)

Date: TODO (run `npm run test:all` and paste output here)
Commit: TODO

Total: TODO
Per-layer: TODO

## Budget

There is NO enforced SLA. If total exceeds 10 minutes, document a parallelization strategy in `docs/auth/TESTING_PERFORMANCE.md` and investigate which layer is the bottleneck. Do not artificially cap.

## Failure behavior

`test:all` runs scripts sequentially via `&&` -- first failure stops the chain and leaves the layer name visible in the terminal. Rerun only that layer to iterate.

## Reference

- `.claude/skills/testing-pipeline.md`
- `.claude/skills/release-checklist.md`
