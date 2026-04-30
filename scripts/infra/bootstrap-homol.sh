#!/usr/bin/env bash
# ============================================================================
# BOOTSTRAP — primeiro provisionamento do app em /opt/quayer-homol
# ============================================================================
# Executa COMO deploy user no servidor homol (pós-hardening).
#
# Uso (remoto, via SSH):
#   ssh -i ~/.ssh/quayer_homol deploy@167.235.139.140 \
#       "export CF_TUNNEL_HOMOL_TOKEN='xxx'; bash -s" < scripts/infra/bootstrap-homol.sh
#
# Ou chamado pelo one-shot-homol.sh.
# ============================================================================

set -euo pipefail

APP_DIR=/opt/quayer-homol
REPO_URL=https://github.com/quayer/app-quayer.git
BRANCH=${BRANCH:-develop}

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date +%H:%M:%S)] $*${NC}"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] $*${NC}"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] $*${NC}" >&2; exit 1; }

[[ -n "${CF_TUNNEL_HOMOL_TOKEN:-}" ]] || err "CF_TUNNEL_HOMOL_TOKEN não está setado"
[[ "$(id -u)" != "0" ]] || err "Não rode como root — rode como 'deploy'"

# ----------------------------------------------------------------------------
# 1. Clone ou atualiza repo (funciona em dir não-vazio — hardening cria subdirs)
# ----------------------------------------------------------------------------
log "1/5 - Repo em $APP_DIR (branch $BRANCH)"
cd "$APP_DIR"
if [ ! -d ".git" ]; then
  log "    init + fetch (dir já existe com subdirs)"
  git init -q -b "$BRANCH"
  git remote add origin "$REPO_URL" 2>/dev/null || git remote set-url origin "$REPO_URL"
  git fetch --depth 1 origin "$BRANCH"
  git checkout -f -B "$BRANCH" "origin/$BRANCH"
else
  log "    atualizando"
  git fetch --depth 1 origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
fi

# ----------------------------------------------------------------------------
# 2. Criar .env.homol se não existir
# ----------------------------------------------------------------------------
log "2/5 - .env.homol"
if [ ! -f .env.homol ]; then
  log "    gerando com segredos aleatórios"
  # Remove caracteres que quebram shell vars
  gen_secret() { openssl rand -base64 32 | tr -d '=+/\n\r'; }
  gen_pass()   { openssl rand -base64 24 | tr -d '=+/\n\r'; }

  JWT_SECRET=$(gen_secret)
  IGNITER_APP_SECRET=$(gen_secret)
  ENCRYPTION_KEY=$(gen_secret)
  DB_PASSWORD=$(gen_pass)

  cat > .env.homol <<EOF
# ============================================
# HOMOL — gerado por bootstrap-homol.sh
# $(date -u +%Y-%m-%dT%H:%M:%SZ)
# ============================================

# --- APP ---
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://homol.quayer.com
PORT=3000
HOSTNAME=0.0.0.0

# --- CLOUDFLARE TUNNEL ---
CF_TUNNEL_HOMOL_TOKEN=${CF_TUNNEL_HOMOL_TOKEN}

# --- DB ---
DB_NAME=quayer_homol
DB_USER=quayer_homol
DB_PASSWORD=${DB_PASSWORD}
DATABASE_URL=postgresql://quayer_homol:${DB_PASSWORD}@homol-quayer-postgres:5432/quayer_homol?schema=public
DIRECT_DATABASE_URL=postgresql://quayer_homol:${DB_PASSWORD}@homol-quayer-postgres:5432/quayer_homol?schema=public

# --- REDIS ---
REDIS_URL=redis://homol-quayer-redis:6379
REDIS_HOST=homol-quayer-redis
REDIS_PORT=6379

# --- SECRETS ---
JWT_SECRET=${JWT_SECRET}
IGNITER_APP_SECRET=${IGNITER_APP_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

# --- IGNITER ---
IGNITER_APP_NAME=quayer-homol
NEXT_PUBLIC_IGNITER_API_URL=https://homol.quayer.com/
NEXT_PUBLIC_IGNITER_API_BASE_PATH=/api/v1
IGNITER_JOBS_QUEUE_PREFIX=quayer-homol
IGNITER_LOG_LEVEL=info

# --- EMAIL (mock por padrão, preencha com valores reais depois) ---
EMAIL_PROVIDER=mock
EMAIL_FROM=noreply-homol@quayer.com
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# --- WHATSAPP (preencher quando integrar) ---
UAZAPI_URL=https://quayer.uazapi.com
UAZAPI_ADMIN_TOKEN=
UAZAPI_WEBHOOK_URL=https://homol.quayer.com/api/v1/webhooks/uaz

# --- OPENAI (preencher quando integrar) ---
OPENAI_API_KEY=

# --- GOOGLE OAUTH (preencher quando integrar) ---
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://homol.quayer.com/api/v1/auth/google/callback

# --- SUPABASE STORAGE (opcional) ---
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET_MEDIA=homol-media-whatsapp
SUPABASE_STORAGE_BUCKET_PROFILES=homol-profile-pictures
SUPABASE_STORAGE_BUCKET_ATTACHMENTS=homol-attachments
EOF
  chmod 600 .env.homol
  log "    .env.homol criado"
else
  log "    já existe — atualizando apenas CF_TUNNEL_HOMOL_TOKEN"
  if grep -q '^CF_TUNNEL_HOMOL_TOKEN=' .env.homol; then
    sed -i "s|^CF_TUNNEL_HOMOL_TOKEN=.*|CF_TUNNEL_HOMOL_TOKEN=${CF_TUNNEL_HOMOL_TOKEN}|" .env.homol
  else
    echo "CF_TUNNEL_HOMOL_TOKEN=${CF_TUNNEL_HOMOL_TOKEN}" >> .env.homol
  fi
fi

# ----------------------------------------------------------------------------
# 3. Docker compose build + up
# ----------------------------------------------------------------------------
log "3/5 - docker compose up (build)"
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

docker compose -f compose.homol.yml --env-file .env.homol build app
docker compose -f compose.homol.yml --env-file .env.homol up -d --force-recreate --remove-orphans

# ----------------------------------------------------------------------------
# 4. Aguardar health do app (até 3min)
# ----------------------------------------------------------------------------
log "4/5 - Aguardando health check do app"
MAX_WAIT=180
INTERVAL=10
ELAPSED=0
HEALTHY=false
while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS=$(docker inspect homol-quayer-app --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")
  echo "  [${ELAPSED}s] app=$STATUS"
  if [ "$STATUS" = "healthy" ]; then HEALTHY=true; break; fi
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

if [ "$HEALTHY" != "true" ]; then
  warn "App não ficou healthy em ${MAX_WAIT}s — logs abaixo"
  docker compose -f compose.homol.yml --env-file .env.homol logs app --tail 80
  err "Bootstrap falhou"
fi

# ----------------------------------------------------------------------------
# 5. Verificar cloudflared também
# ----------------------------------------------------------------------------
log "5/5 - Verificando cloudflared"
sleep 5
CF_STATUS=$(docker inspect homol-quayer-cloudflared --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
echo "  cloudflared health: $CF_STATUS"
docker logs homol-quayer-cloudflared --tail 10 2>&1 | grep -i "connection\|registered\|error" || true

echo
log "=== CONTAINERS ==="
docker compose -f compose.homol.yml --env-file .env.homol ps

echo
log "=== BOOTSTRAP CONCLUÍDO ==="
echo
echo "Verifique de fora: curl -I https://homol.quayer.com"
echo "Logs:              docker compose -f compose.homol.yml --env-file .env.homol logs -f"
echo
echo "IMPORTANTE: Edite /opt/quayer-homol/.env.homol para preencher:"
echo "  - SMTP (email transacional)"
echo "  - UAZAPI_ADMIN_TOKEN (WhatsApp)"
echo "  - OPENAI_API_KEY"
echo "  - GOOGLE_CLIENT_ID/SECRET"
echo "Depois: docker compose -f compose.homol.yml --env-file .env.homol restart app"
