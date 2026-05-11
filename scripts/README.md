---
Criado: 2026-05-10
Atualizado: 2026-05-10
Revisar em: quando adicionar/remover script ou mudar infra
Relacionados:
  - docs/infra/HOMOL_SETUP.md
  - docs/infra/BASELINES.md
  - docs/infra/ROLLBACK_RUNBOOK.md
  - infra/README.md
  - .claude/skills/infra.md
  - .claude/skills/testing-pipeline.md
---

# scripts/ — Índice

Automação local e remota do Quayer. Use este índice antes de criar script novo: pode já existir um equivalente.

## Mapa rápido

| Script | Tipo | Uso | Doc |
|---|---|---|---|
| [deploy.sh](deploy.sh) | runtime | `./scripts/deploy.sh <homol\|prod> [branch]` — SSH + git pull + docker compose + health check | [.claude/skills/infra.md](../.claude/skills/infra.md), [docs/infra/ROLLBACK_RUNBOOK.md](../docs/infra/ROLLBACK_RUNBOOK.md) |
| [test/db-up.sh](test/db-up.sh) | runtime | `npm run test:db:up` — sobe Postgres de teste (porta 5433), migra, semeia | [docs/testing/AUTH_INTEGRATION_PATTERNS.md](../docs/testing/AUTH_INTEGRATION_PATTERNS.md) |
| [test/db-down.sh](test/db-down.sh) | runtime | `npm run test:db:down` — destrói container e volume de teste | idem |
| [infra/capture-baselines.sh](infra/capture-baselines.sh) | runtime | Mede latência de endpoints públicos, emite tabela markdown | [docs/infra/BASELINES.md](../docs/infra/BASELINES.md) |
| [infra/capture-auth-baselines.sh](infra/capture-auth-baselines.sh) | runtime | Idem, focado em rotas de auth (gate de release) | [docs/infra/BASELINES.md](../docs/infra/BASELINES.md) §8 |
| [infra/one-shot-homol.sh](infra/one-shot-homol.sh) | one-shot ✅ consumido | Provisão inicial de homol (root → deploy → bootstrap). Idempotente — pode reusar. | [docs/infra/HOMOL_SETUP.md](../docs/infra/HOMOL_SETUP.md) |
| [infra/hardening-homol.sh](infra/hardening-homol.sh) | one-shot ✅ consumido | Hardening do SO (ufw, fail2ban, sshd, docker, swap, user deploy). Idempotente. | idem |
| [infra/bootstrap-homol.sh](infra/bootstrap-homol.sh) | one-shot ✅ consumido | Clone repo + gera `.env.homol` + sobe compose. Idempotente. | idem |

**Tipos:**
- **runtime** — rodado regularmente (CI, testes, deploys, rollback)
- **one-shot consumido** — já cumpriu papel inicial; vive como infra-as-code documentado para reprovisão

## Decisões

- **Sem `scripts/ralph/`** — diretório removido em 2026-05-10. Era PRD legado (`ralph/quayer-builder`, 66 stories) referenciando admin/SCIM que foi deletado. Histórico no git.
- **Sem `*-prod.sh`** — homol foi provisionada por script versionado; prod foi ad-hoc. Se precisar reprovisionar prod, replicar `hardening-homol.sh`/`bootstrap-homol.sh` ajustando IP/paths/branch.

## Convenção para script novo

1. Header com `set -euo pipefail` + bloco de docstring (uso + exemplos + pré-req)
2. Cores via `log/warn/err` helpers (ver `deploy.sh`)
3. Wirearapidamente como `npm run …` no [package.json](../package.json) se for usado por CI ou dev
4. Adicionar linha nesta tabela
5. Linkar em skill ou doc relevante
