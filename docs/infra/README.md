---
Criado: 2026-05-10
Atualizado: 2026-06-06
Revisar em: quando adicionar/remover doc em docs/infra/
Relacionados:
  - docs/infra/BASELINES.md
  - docs/infra/HARDENING.md
  - docs/infra/ROLLBACK_RUNBOOK.md
---

# Infra Docs — Quayer

Índice navegável da documentação de infraestrutura (homol + prod, Hetzner + Cloudflare Tunnel).

## Documentos

| Doc | Para quê | Quando consultar |
|---|---|---|
| [BASELINES.md](./BASELINES.md) | Latência p50/p95/p99 de 6 endpoints + breakdown de auth (seção 8) | Suspeita de regressão de performance, definir SLO, comparar pré/pós-deploy |
| [HARDENING.md](./HARDENING.md) | Hardening genérico aplicado (SSH, firewall, TLS, headers) | Auditoria de servidor, onboarding de host novo |
| [HOMOL_SETUP.md](./HOMOL_SETUP.md) | Provisionamento de `homol.quayer.com` do zero | Recriar homol, migrar servidor, replicar ambiente |
| [MESSAGING_IDEMPOTENCY.md](./MESSAGING_IDEMPOTENCY.md) | Garantias de idempotência/dedup/rate-limit do pipeline de mensagem WhatsApp + gaps conhecidos | Mexer em outbound/inbound, debugar resposta duplicada/perdida, planejar FSM outbound |
| [PROD_HARDENING_PLAN.md](./PROD_HARDENING_PLAN.md) | Plano (não executado) com vulnerabilidades reais em prod | Janela de manutenção aprovada pelo founder |
| [ROLLBACK_RUNBOOK.md](./ROLLBACK_RUNBOOK.md) | Cenários A–J de rollback (deploy, DB, secret, DNS, etc.) | Incidente em produção, gate de rollback automático disparou |
| [SECRETS.md](./SECRETS.md) | Inventário de GitHub Secrets + procedimento de rotação | Secret vazou, rotação trimestral, novo workflow |
| [SYNTHETIC_MONITORING.md](./SYNTHETIC_MONITORING.md) | Workflow de monitor sintético (6 targets, cron 5min) + roadmap Checkly | Falha em synthetic-monitor, adicionar novo target |
| [baseline-queries.sql](./baseline-queries.sql) | SQL para capturar baselines de auth (Postgres/Supabase) | Refazer snapshot de baseline após mudança relevante |

## Quick links por situação

- **Vou fazer deploy** → [release-checklist](../../.claude/skills/release-checklist.md) + [ROLLBACK_RUNBOOK.md](./ROLLBACK_RUNBOOK.md)
- **Performance degradou** → [BASELINES.md](./BASELINES.md) (compare p95 atual vs tabela)
- **Vazou secret** → [SECRETS.md](./SECRETS.md) (procedimento de rotação)
- **Subir homol do zero** → [HOMOL_SETUP.md](./HOMOL_SETUP.md)
- **Hardening pendente em prod** → [PROD_HARDENING_PLAN.md](./PROD_HARDENING_PLAN.md) (requer aprovação)
- **Synthetic monitor falhou** → [SYNTHETIC_MONITORING.md](./SYNTHETIC_MONITORING.md) + [ROLLBACK_RUNBOOK.md](./ROLLBACK_RUNBOOK.md) cenário relevante
- **Auditoria de servidor** → [HARDENING.md](./HARDENING.md)

## Convenções de update

- **BASELINES.md**: recapturar após mudança de infra (novo target, troca de servidor, mudança de plano Hetzner) ou trimestralmente. Atualizar tabela + seção 8 (auth) juntas.
- **ROLLBACK_RUNBOOK.md**: adicionar cenário novo (K, L, …) sempre que um incidente revelar caminho de rollback inédito. Não renumerar A–J.
- **SECRETS.md**: atualizar imediatamente ao criar/remover secret. Nunca commitar valor.
- **SYNTHETIC_MONITORING.md**: se o workflow YAML em `.github/workflows/synthetic-monitor.yml` mudar, refletir aqui (single source de descrição).
- **PROD_HARDENING_PLAN.md**: marcar item como ✅ executado + data + commit hash. Não remover histórico.
- **HOMOL_SETUP.md / HARDENING.md**: revisar a cada migração de servidor ou mudança de arquitetura de rede.

## Cross-folder

- Configs de servidor (compose, nginx, scripts): [`../../infra/prod/`](../../infra/prod/)
- Skills relacionadas: [release-checklist](../../.claude/skills/release-checklist.md), [testing-pipeline](../../.claude/skills/testing-pipeline.md)
- Workflows CI/CD: [`../../.github/workflows/`](../../.github/workflows/) (deploy-homol, deploy-prod, synthetic-monitor, smoke-homol)
- Runbooks de auth: [`../auth/`](../auth/)
