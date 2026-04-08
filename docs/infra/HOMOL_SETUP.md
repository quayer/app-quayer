# Homol Setup Runbook — `homol.quayer.com`

**Servidor:** Hetzner Cloud `dev-quayer` (`167.235.139.140`)
**Domínio:** `homol.quayer.com`
**Arquitetura:** Cloudflare Tunnel → Docker (cloudflared + app + Postgres + Redis)
**Sem nginx, sem porta 443 aberta.** O servidor não tem nada exposto além de SSH (22).
**Deploy:** GitHub Actions → SSH key → `docker compose up` em `develop`

---

## Visão geral da arquitetura

```
Usuário
  │ HTTPS
  ▼
Cloudflare (proxy laranja, edge)
  │ HTTPS via Tunnel (outbound)
  ▼
cloudflared (container no servidor)
  │ HTTP (rede docker interna)
  ▼
app:3000 (Next.js)
  │
  ├── homol-quayer-postgres:5432
  └── homol-quayer-redis:6379
```

**Por que Tunnel em vez de nginx?**
- Servidor não precisa ter porta 80/443 abertas para a internet
- Sem necessidade de SSL no origin (cloudflared faz mTLS direto com CF edge)
- Sem nginx pra manter
- DDoS impossível (servidor invisível, só sai conexão outbound)
- Free pra uso básico
- Rollback de URL é só apontar tunnel pra outra coisa

---

## Recursos provisionados (já existentes via API)

### Hetzner
| Item | ID | Detalhe |
|---|---|---|
| Servidor | 112883999 | dev-quayer, CX23, Ubuntu 24.04, IP 167.235.139.140 |
| Snapshot pre-hardening | 374520044 | safety-net 2026-04-08, 40GB |
| Cloud Firewall | 10813097 | fw-homol — só inbound 22/icmp, outbound livre |
| SSH key | 110475478 | deploy-homol-quayer-2026 |
| Backup automático | habilitado | janela 14-18 UTC, retenção 7 dias |

### Cloudflare
| Item | ID | Detalhe |
|---|---|---|
| Zone | aa20e8afc92fb86635ec0b71f61f003b | quayer.com |
| Tunnel | 23591a24-146f-4354-aafb-492b0b7393a8 | name=homol-quayer, status=inactive (até cloudflared subir) |
| DNS record | b5550b5c6bd03fb63f2dbd94a26ad559 | CNAME homol → tunnel.cfargotunnel.com (proxied) |
| Ingress configurado | - | homol.quayer.com → http://app:3000 |

---

## 1. Hardening do servidor (executar UMA vez)

Usar o script idempotente já criado em [scripts/infra/hardening-homol.sh](../../scripts/infra/hardening-homol.sh):

```bash
# A partir da raiz do projeto, no seu terminal local
ssh -o StrictHostKeyChecking=accept-new root@167.235.139.140 'bash -s' < scripts/infra/hardening-homol.sh
```

Vai pedir a senha root inicial. O script roda em ~3-5 min e:
- Atualiza o sistema
- Cria user `deploy` com sudo restrito (só docker)
- Instala SSH pubkey ed25519
- Hardening do sshd: desabilita root login, password auth, força AllowUsers deploy
- UFW só com porta 22 aberta (Tunnel não precisa de 80/443)
- fail2ban
- unattended-upgrades
- Swap 2GB
- Docker + log rotation
- Estrutura `/opt/quayer-homol/{data/{postgres,redis},backups,scripts}`

Validar de **outra janela** após o script terminar:
```bash
ssh -i ~/.ssh/quayer_homol deploy@167.235.139.140 'whoami && docker ps'
```

Esperado: `deploy` + lista vazia de containers.

---

## 2. Estrutura de diretórios no servidor

Criada pelo hardening:

```
/opt/quayer-homol/                  (owner: deploy:deploy)
├── .git/                           # repo (clonado pelo workflow)
├── .env.homol                      # secrets — CRIAR MANUALMENTE (passo 3)
├── compose.homol.yml               # vem do repo
├── Dockerfile                      # vem do repo
├── docker-entrypoint.sh            # vem do repo
├── data/
│   ├── postgres/                   # volume persistente
│   └── redis/
├── backups/                        # dumps pré-deploy
└── scripts/
```

---

## 3. Criar o `.env.homol` no servidor

Conectar como `deploy` (após hardening) e criar o arquivo:

```bash
ssh -i ~/.ssh/quayer_homol deploy@167.235.139.140
cd /opt/quayer-homol

# Gerar segredos limpos
JWT_SECRET=$(openssl rand -base64 32 | tr -d '=')
IGNITER_APP_SECRET=$(openssl rand -base64 32 | tr -d '=')
ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '=')
DB_PASSWORD=$(openssl rand -base64 24 | tr -d '=/+')

cat > .env.homol <<EOF
# === APP ===
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://homol.quayer.com
PORT=3000
HOSTNAME=0.0.0.0

# === CLOUDFLARE TUNNEL ===
# (será sobrescrito pelo workflow no primeiro deploy)
CF_TUNNEL_HOMOL_TOKEN=__placeholder__

# === DB ===
DB_NAME=quayer_homol
DB_USER=quayer_homol
DB_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://quayer_homol:${DB_PASSWORD}@homol-quayer-postgres:5432/quayer_homol?schema=public
DIRECT_DATABASE_URL=postgresql://quayer_homol:${DB_PASSWORD}@homol-quayer-postgres:5432/quayer_homol?schema=public

# === REDIS ===
REDIS_URL=redis://homol-quayer-redis:6379
REDIS_HOST=homol-quayer-redis
REDIS_PORT=6379

# === SECRETS ===
JWT_SECRET=${JWT_SECRET}
IGNITER_APP_SECRET=${IGNITER_APP_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# === EMAIL (preencher) ===
EMAIL_PROVIDER=smtp
EMAIL_FROM=noreply-homol@quayer.com
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# === WHATSAPP (preencher) ===
UAZAPI_URL=https://quayer.uazapi.com
UAZAPI_ADMIN_TOKEN=
UAZAPI_WEBHOOK_URL=https://homol.quayer.com/api/v1/webhooks/uaz

# === OPENAI (preencher) ===
OPENAI_API_KEY=

# === GOOGLE OAUTH (preencher) ===
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://homol.quayer.com/api/v1/auth/google/callback
EOF

chmod 600 .env.homol
```

**Você precisa preencher os valores em branco** (SMTP, UAZAPI, OpenAI, Google) antes de subir.

---

## 4. GitHub Secrets

Ver lista completa em [SECRETS.md](SECRETS.md). Para o workflow `deploy-homol.yml` rodar, você precisa criar 5 secrets:

| Secret | Como obter |
|---|---|
| `HOMOL_HOST` | `167.235.139.140` |
| `HOMOL_USER` | `deploy` |
| `HOMOL_SSH_PORT` | `22` |
| `HOMOL_SSH_KEY` | conteúdo de `~/.ssh/quayer_homol` (chave **privada**) |
| `CF_TUNNEL_HOMOL_TOKEN` | token do tunnel (180 chars), no `.env.local` local em `CF_TUNNEL_HOMOL_TOKEN=...` |

Como adicionar:
**GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

---

## 5. Primeiro deploy

1. Abrir GitHub → Actions → "Homol Deploy"
2. **Run workflow** → branch `develop`
3. Marcar **`skip_backup: true`** (primeiro deploy, ainda não há banco)
4. Aguardar logs (~5-10 min)

O workflow vai:
- Rodar testes (lint, typecheck, unit) — se quebrar, aborta
- SSH no servidor
- Clonar repo em `/opt/quayer-homol`
- Atualizar `CF_TUNNEL_HOMOL_TOKEN` no `.env.homol`
- `docker compose build` (Dockerfile multi-stage)
- `docker compose up -d`
- Aguardar health check do app (até 120s)
- Smoke test público: `curl https://homol.quayer.com/api/health`

---

## 6. Validação manual pós-deploy

```bash
# 1. Status dos containers no servidor
ssh deploy@167.235.139.140 'docker ps --format "table {{.Names}}\t{{.Status}}"'
# Esperado:
#   homol-quayer-cloudflared    Up X minutes (healthy)
#   homol-quayer-app            Up X minutes (healthy)
#   homol-quayer-postgres       Up X minutes (healthy)
#   homol-quayer-redis          Up X minutes (healthy)

# 2. Status do tunnel via API CF
curl -sS -H "Authorization: Bearer $CF" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCT/cfd_tunnel/23591a24-146f-4354-aafb-492b0b7393a8" \
  | jq '.result | {status, connections: (.connections | length)}'
# Esperado: status="healthy", connections >= 1

# 3. Public reachability
curl -I https://homol.quayer.com
# Esperado: 200 OK + headers do CF

# 4. Health endpoint
curl https://homol.quayer.com/api/health
# Esperado: JSON com status ok
```

---

## 7. Operações comuns

### Ver logs do app
```bash
ssh deploy@167.235.139.140
cd /opt/quayer-homol
docker compose -f compose.homol.yml --env-file .env.homol logs -f app
```

### Ver logs do tunnel
```bash
docker compose -f compose.homol.yml --env-file .env.homol logs -f cloudflared
```

### Restart sem deploy
```bash
docker compose -f compose.homol.yml --env-file .env.homol restart app
```

### Conectar no Postgres
```bash
docker exec -it homol-quayer-postgres psql -U quayer_homol -d quayer_homol
```

### Backup manual
```bash
docker exec homol-quayer-postgres pg_dump -U quayer_homol quayer_homol \
  | gzip > /opt/quayer-homol/backups/manual-$(date +%Y%m%d-%H%M%S).sql.gz
```

### Restore
```bash
gunzip -c /opt/quayer-homol/backups/FILE.sql.gz \
  | docker exec -i homol-quayer-postgres psql -U quayer_homol quayer_homol
```

---

## 8. Troubleshooting

| Sintoma | Diagnóstico | Solução |
|---|---|---|
| `homol.quayer.com` retorna 530 | Tunnel não está rodando | `docker logs homol-quayer-cloudflared` — verificar erro de auth (token errado?) |
| Tunnel "inactive" no CF dashboard | cloudflared não conectou | Verificar `CF_TUNNEL_HOMOL_TOKEN` no `.env.homol` corresponde ao tunnel atual |
| App health check falha | App não sobe | `docker logs homol-quayer-app` — provavelmente migration ou env var faltando |
| 502 do tunnel | Tunnel ok mas app não responde | Verificar `app:3000` está acessível na rede docker (`docker exec homol-quayer-cloudflared wget -O- http://app:3000/api/health`) |
| Postgres não inicializa | Volume corrompido ou senha errada | Conferir `DB_PASSWORD` no `.env.homol`. Reset extremo: `down -v` (CUIDADO, apaga dados) |
| OOM kill | RAM cheia (4GB total) | Reduzir Postgres `shared_buffers` em compose, ou upgrade do servidor |

### Reativar tunnel após mudança de token
Se você gerou novo tunnel token (rotação ou recriação):
```bash
ssh deploy@167.235.139.140
sed -i "s|^CF_TUNNEL_HOMOL_TOKEN=.*|CF_TUNNEL_HOMOL_TOKEN=NEW_TOKEN|" /opt/quayer-homol/.env.homol
docker compose -f compose.homol.yml --env-file .env.homol restart cloudflared
```

---

## 9. Rollback

### Rollback de código
```bash
ssh deploy@167.235.139.140
cd /opt/quayer-homol
git log --oneline -10
git reset --hard <COMMIT_ANTERIOR>
docker compose -f compose.homol.yml --env-file .env.homol up -d --force-recreate app
```

### Rollback de banco
```bash
LATEST=$(ls -t /opt/quayer-homol/backups/pre-deploy-*.sql.gz | head -1)
gunzip -c "$LATEST" | docker exec -i homol-quayer-postgres psql -U quayer_homol quayer_homol
```

### Rollback completo do servidor (catastrófico)
Usar snapshot Hetzner ID `374520044` via Cloud Console → dev-quayer → Snapshots → "pre-hardening 2026-04-08" → Rebuild from this snapshot.

### Rollback do tunnel (apontar pra outra coisa)
Atualizar ingress via API CF — ver script `scripts/infra/cf-tunnel-update.sh` (a criar se necessário).
