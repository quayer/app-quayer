#!/usr/bin/env bash
# ============================================================================
# DEPLOY RÁPIDO — iteração direta sem CI
# ============================================================================
# Uso:
#   ./scripts/deploy.sh homol          # deploy da branch atual no homol
#   ./scripts/deploy.sh homol develop  # deploy da branch 'develop' no homol
#   ./scripts/deploy.sh prod main      # deploy prod (precisa SSH configurado)
#
# Requer:
#   - ~/.ssh/quayer_homol  (key privada do homol)
#   - ~/.ssh/quayer_prod   (key privada do prod — depois do hardening de prod)
#
# O script faz:
#   1. Push do código local (caso haja commits não pushados)
#   2. SSH no servidor-alvo
#   3. git pull da branch
#   4. docker compose build + up
#   5. Health check
#   6. Reporte status
# ============================================================================

set -euo pipefail

ENV="${1:-}"
BRANCH="${2:-}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date +%H:%M:%S)] $*${NC}"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] $*${NC}"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] $*${NC}" >&2; exit 1; }

# ----------------------------------------------------------------------------
# Resolver config por ambiente
# ----------------------------------------------------------------------------
case "$ENV" in
  homol)
    HOST=167.235.139.140
    USER_REMOTE=deploy
    SSH_KEY="${HOME}/.ssh/quayer_homol"
    APP_DIR=/opt/quayer-homol
    COMPOSE_FILE=compose.homol.yml
    ENV_FILE=.env.homol
    PUBLIC_URL=https://homol.quayer.com
    DEFAULT_BRANCH=develop
    ;;
  prod)
    HOST=91.98.142.177
    USER_REMOTE=deploy
    SSH_KEY="${HOME}/.ssh/quayer_prod"
    APP_DIR=/opt/quayer
    COMPOSE_FILE=compose.yml
    ENV_FILE=.env
    PUBLIC_URL=https://app.quayer.com
    DEFAULT_BRANCH=main
    ;;
  *)
    cat <<EOF
Uso: ./scripts/deploy.sh <env> [branch]

Ambientes:
  homol   - Deploy no servidor homol (167.235.139.140)
  prod    - Deploy no servidor prod (91.98.142.177)

Exemplos:
  ./scripts/deploy.sh homol
  ./scripts/deploy.sh homol develop
  ./scripts/deploy.sh prod main
EOF
    exit 1
    ;;
esac

BRANCH="${BRANCH:-$DEFAULT_BRANCH}"

[[ -f "$SSH_KEY" ]] || err "SSH key não encontrada: $SSH_KEY"

log "=== DEPLOY QUAYER ($ENV) ==="
echo "Host:    $HOST"
echo "Branch:  $BRANCH"
echo "App dir: $APP_DIR"
echo "URL:     $PUBLIC_URL"
echo

# ----------------------------------------------------------------------------
# Confirmação extra para prod
# ----------------------------------------------------------------------------
if [[ "$ENV" == "prod" ]]; then
  warn "VOCÊ ESTÁ DEPLOYANDO EM PRODUÇÃO. Tem certeza? (yes/no)"
  read -r CONFIRM
  [[ "$CONFIRM" == "yes" ]] || err "Cancelado."
fi

# ----------------------------------------------------------------------------
# Push antes de deploy (garante que o git pull no servidor vai ter o código)
# ----------------------------------------------------------------------------
LOCAL_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$LOCAL_BRANCH" == "$BRANCH" ]]; then
  if [[ -n "$(git status --porcelain)" ]]; then
    warn "Working tree tem mudanças não commitadas. Deseja continuar? (y/n)"
    read -r CONFIRM
    [[ "$CONFIRM" == "y" ]] || err "Cancelado. Commita ou stasha primeiro."
  fi

  log "Pushing $LOCAL_BRANCH para origin"
  git push origin "$LOCAL_BRANCH" || warn "Push falhou — continuando assumindo que origin está atualizado"
fi

# ----------------------------------------------------------------------------
# Deploy remoto
# ----------------------------------------------------------------------------
log "Conectando em $USER_REMOTE@$HOST"

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 \
    "$USER_REMOTE@$HOST" bash -se <<REMOTE
set -euo pipefail
cd "$APP_DIR"

echo ">> git fetch + reset"
git fetch --depth 1 origin "$BRANCH"
git reset --hard "origin/$BRANCH"

echo ">> docker compose build"
export DOCKER_BUILDKIT=1
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build app

echo ">> docker compose up"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --force-recreate --remove-orphans app

echo ">> aguardando health"
MAX=120; INT=5; ELAPSED=0; OK=false
while [ \$ELAPSED -lt \$MAX ]; do
  STATUS=\$(docker inspect \$(basename "$APP_DIR" | sed 's|quayer-homol|homol-quayer-app|;s|quayer|quayer-app|') --format='{{.State.Health.Status}}' 2>/dev/null || echo "starting")
  echo "  [\${ELAPSED}s] \$STATUS"
  if [ "\$STATUS" = "healthy" ]; then OK=true; break; fi
  sleep \$INT
  ELAPSED=\$((ELAPSED + INT))
done
[ "\$OK" = "true" ] || { echo "App não ficou healthy"; exit 1; }

echo ">> limpeza"
docker image prune -f > /dev/null

echo ">> ps"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
REMOTE

# ----------------------------------------------------------------------------
# Smoke test externo
# ----------------------------------------------------------------------------
log "Smoke test externo"
for i in 1 2 3; do
  STATUS=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "$PUBLIC_URL/api/health" 2>/dev/null || echo "000")
  echo "  tentativa $i: HTTP $STATUS"
  [[ "$STATUS" == "200" ]] && { log "=== DEPLOY $ENV OK ($PUBLIC_URL) ==="; exit 0; }
  sleep 5
done

warn "Smoke test externo não retornou 200. App pode estar ok internamente mas CF/tunnel precisa verificação."
exit 1
