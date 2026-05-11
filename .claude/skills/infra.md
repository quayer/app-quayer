---
Criado: 2026-05-10
Atualizado: 2026-05-10
Revisar em: 2026-08-10
Relacionados:
  - infra/README.md
  - docs/infra/
  - scripts/deploy.sh
---

# Skill: Infra & Deploy

## Quando carregar esta skill
Ao editar qualquer um destes:
- `infra/prod/Caddyfile` (reverse proxy HTTPS)
- `infra/prod/n8n/docker-compose.yml` (workflows automation)
- `infra/prod/supabase/docker-compose.yml` (Storage/Auth/Realtime self-hosted)
- `scripts/deploy.sh` ou workflows `.github/workflows/deploy-*.yml`
- Qualquer `.env` de produção/homol no host
- Docs em `docs/infra/**`

---

## Mapa "preciso fazer X → mudo onde"

| Tarefa | Arquivo / Local | Comando após mudança |
|---|---|---|
| Adicionar novo subdomínio | `infra/prod/Caddyfile` (novo bloco `dominio { reverse_proxy ... }`) | `docker exec caddy caddy reload --config /etc/caddy/Caddyfile` |
| Mudar env var de produção (app) | SSH no host + editar `.env` do compose Next.js | `docker compose up -d --force-recreate app` |
| Atualizar versão do n8n | `infra/prod/n8n/docker-compose.yml` (campo `image:`) | `docker compose -f infra/prod/n8n/docker-compose.yml pull && up -d` |
| Adicionar bucket Supabase Storage | Studio UI (preferido) ou `infra/prod/supabase/docker-compose.yml` | n/a (UI) ou `docker compose up -d storage` |
| Rotacionar JWT/secret | `docs/infra/SECRETS.md` (procedimento) + `.env` do host | Restart de todos serviços que consomem o secret |
| Adicionar volume novo | compose relevante + backup do anterior | `docker compose up -d` (NUNCA `down -v`) |
| Mudar regra de cache/headers do Caddy | `infra/prod/Caddyfile` | `caddy reload` (zero downtime) |
| Investigar 502/504 | `docs/infra/ROLLBACK_RUNBOOK.md` cenário 3B | `docker logs <container> --tail 200 -f` |

---

## Checklist antes de tocar em produção

Obrigatório, na ordem:

- [ ] Ler `docs/infra/ROLLBACK_RUNBOOK.md` — identificar cenário (3A–3J) aplicável e anotar
- [ ] Snapshot de baseline atual: error rate, p95, CPU/mem dos containers (comparar contra `docs/infra/BASELINES.md`)
- [ ] Anunciar deploy no canal (Discord/Slack) ANTES de SSH
- [ ] Backup do arquivo a mudar: `cp Caddyfile Caddyfile.bak-$(date +%Y%m%d-%H%M)` (idem para compose)
- [ ] Para mudança em secret/env: revisar `docs/infra/SECRETS.md` e `docs/infra/HARDENING.md`
- [ ] Janela ≥30min de monitoramento ativo após aplicar
- [ ] Comando de rollback pronto em terminal separado

---

## Comandos comuns

```bash
# Caddy — sempre prefira reload (zero downtime) a restart
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile

# Compose — subir/reiniciar serviço específico
docker compose -f infra/prod/n8n/docker-compose.yml up -d
docker compose -f infra/prod/supabase/docker-compose.yml ps

# Logs ao vivo
docker logs <container> --tail 200 -f
journalctl -u docker -n 200 --no-pager

# Estado do host
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
df -h && free -m

# Deploy app
./scripts/deploy.sh homol <hash>     # sempre primeiro
./scripts/deploy.sh prod <hash>      # somente após smoke homol verde + aprovação
```

---

## Conexão com outras skills

- **Antes de release prod:** carregar `.claude/skills/release-checklist.md` — checklist obrigatório
- **Testes pré-deploy:** carregar `.claude/skills/testing-pipeline.md` — gate `npm run test:all`
- **Mudou auth/middleware:** carregar `.claude/skills/auth.md` antes de deploy
- **Rollback em andamento:** ir direto a `docs/infra/ROLLBACK_RUNBOOK.md` cenário 3A–3J

---

## DISCLAIMERS — aprovação humana obrigatória antes de

PARE e peça confirmação explícita do Gabriel antes de qualquer um destes:

- `./scripts/deploy.sh prod <hash>` — deploy em produção
- Edits em `infra/prod/Caddyfile` que mudem roteamento de domínio existente (não apenas adicionar novo)
- `docker compose down -v` ou qualquer comando que remova volumes (perde dados Postgres/Storage/n8n)
- `rm -rf` em qualquer path do host de produção
- Rotação de `JWT_SECRET` ou secrets compartilhados (invalida sessões de todos os usuários)
- Restart de Postgres/Supabase em horário comercial (interrompe app)
- Aplicar migration Prisma direto em prod sem passar por homol antes
- Mudança em DNS / registros A/CNAME

Regra final: produção quebrada é sempre mais cara que aprovação atrasada. Se está em dúvida, **pergunte**.

---

## Referências cruzadas

- `docs/infra/ROLLBACK_RUNBOOK.md` — cenários 3A–3J com comandos exatos, SLA 15min
- `docs/infra/BASELINES.md` — baselines p95/error rate/CPU para comparar pós-deploy
- `docs/infra/HARDENING.md` + `docs/infra/PROD_HARDENING_PLAN.md` — security checklist do host
- `docs/infra/HOMOL_SETUP.md` — réplica de homol, sempre testar lá primeiro
- `docs/infra/SECRETS.md` — gestão e rotação de secrets
- `docs/infra/SYNTHETIC_MONITORING.md` — monitors externos, alertas
