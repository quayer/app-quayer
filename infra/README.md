---
Criado: 2026-05-10
Atualizado: 2026-05-10
Revisar em: 2026-06-10
Relacionados:
  - infra/prod/Caddyfile
  - .claude/skills/infra.md
  - docs/infra/ROLLBACK_RUNBOOK.md
---

# infra/

## Visão geral

Configuração de infraestrutura **prod-only** do Quayer: Caddy como reverse proxy HTTPS na porta 443 e stacks Docker Compose para n8n (workflows) e Supabase self-hosted (Storage/Auth/Realtime/Studio). Tudo roda na mesma VM, com Cloudflare na frente terminando TLS edge → Caddy faz TLS origin com cert Cloudflare.

## Diagrama de tráfego

```
Internet → Cloudflare (edge TLS) → Caddy :443 (origin TLS) ┬→ localhost:3000  (Next.js app)
                                                           ├→ localhost:5678  (n8n-main container)
                                                           ├→ localhost:4000  (chat server)
                                                           └→ localhost:54323 (Supabase Studio)
```

## Componentes

| Arquivo | Função | Port interno | Domínio |
|---|---|---|---|
| [`prod/Caddyfile`](./prod/Caddyfile) | Reverse proxy + security headers + cert Cloudflare origin | 443 → 3000/5678/4000/54323 | 4 subdomínios |
| [`prod/n8n/docker-compose.yml`](./prod/n8n/docker-compose.yml) | n8n queue mode + Postgres 15 + Redis 7 | 5678 (n8n-main) | `flows.quayer.com` |
| [`prod/supabase/docker-compose.yml`](./prod/supabase/docker-compose.yml) | Studio + GoTrue (auth) + PostgREST + db + meta | 54323 (studio) | `supabase.quayer.com` |

App Next.js (`app.quayer.com` → :3000) e chat (`chat.quayer.com` → :4000) **não vivem aqui** — são deployados separadamente (PM2/systemd).

## Como deployar mudanças

```bash
# 1. Editar localmente
$EDITOR infra/prod/Caddyfile          # ou n8n/, supabase/

# 2. Commit + push
git add infra/ && git commit -m "infra: ..." && git push

# 3. SSH na VM prod
ssh prod-vm

# 4. Pull e aplicar
cd /opt/quayer && git pull
sudo cp infra/prod/Caddyfile /etc/caddy/Caddyfile && sudo caddy reload --config /etc/caddy/Caddyfile
# OU pra compose stacks:
cd infra/prod/n8n && docker compose pull && docker compose up -d
```

## Comandos comuns

```bash
sudo caddy validate --config /etc/caddy/Caddyfile   # dry-run antes do reload
sudo caddy reload   --config /etc/caddy/Caddyfile   # hot reload sem downtime
sudo journalctl -u caddy -f                         # logs Caddy
docker compose ps                                   # status containers
docker compose logs -f n8n-main                     # tail logs serviço
docker compose pull && docker compose up -d         # update imagem (n8n/supabase)
docker compose restart n8n-main                     # restart serviço único
```

## Quando editar cada arquivo

- **`Caddyfile`** → mudar roteamento (novo subdomínio, novo upstream port), security headers globais, ou TLS cert path. Mudança barata, `caddy reload` é instantâneo.
- **`n8n/docker-compose.yml`** → bump versão n8n, ajustar `EXECUTIONS_DATA_MAX_AGE`, adicionar variável de credencial, mudar `WEBHOOK_URL`. Restart serviço derruba workflows em execução.
- **`supabase/docker-compose.yml`** → bump versão de qualquer serviço Supabase (Studio, GoTrue, PostgREST, Realtime), trocar imagem, ajustar env de SMTP/JWT. **Tocar no serviço `db` é high-risk** — ver gotchas.

## Cuidados / gotchas

- **ATENÇÃO:** nunca `docker compose down -v` no stack Supabase em prod — `-v` apaga volumes e perde Storage/Auth data. Use `docker compose restart <serviço>`.
- **ATENÇÃO:** não restartar `supabase/db` durante carga (RLS sessions abertas, Realtime subscriptions). Janela de manutenção obrigatória.
- **ATENÇÃO:** senha do Postgres do n8n e `N8N_ENCRYPTION_KEY` estão hardcoded no compose (committed). Rotacionar requer re-criptografar todas as credentials persistidas — ver [`docs/infra/SECRETS.md`](../docs/infra/SECRETS.md).
- Cert Cloudflare origin (`/etc/ssl/cloudflare/quayer-origin.pem`) tem validade longa (15 anos) mas Cloudflare pode revogar — monitorar.
- `caddy reload` é hot-swap; `caddy restart` derruba conexões em flight (evitar).
- Cloudflare cacheia DNS — mudança de IP da VM precisa esperar TTL (300s default).
- Porta 80/443 são exclusivas do Caddy. Kong do Supabase foi removido em 2026-04-08 (ver comentário no compose); serviços internos se comunicam por nome de serviço Docker.

## Links

- [`docs/infra/HOMOL_SETUP.md`](../docs/infra/HOMOL_SETUP.md) — setup do ambiente homol (espelho desta config)
- [`docs/infra/ROLLBACK_RUNBOOK.md`](../docs/infra/ROLLBACK_RUNBOOK.md) — procedimento de rollback (cenários A–J)
- [`docs/infra/SECRETS.md`](../docs/infra/SECRETS.md) — rotação de segredos e localização
- [`docs/infra/HARDENING.md`](../docs/infra/HARDENING.md) — checklist de segurança aplicada
- [`docs/infra/PROD_HARDENING_PLAN.md`](../docs/infra/PROD_HARDENING_PLAN.md) — plano de hardening pendente
- [`docs/infra/SYNTHETIC_MONITORING.md`](../docs/infra/SYNTHETIC_MONITORING.md) — monitor sintético em prod
