#!/usr/bin/env bash
# ============================================================================
# ONE-SHOT — provisiona homol de ponta a ponta
# ============================================================================
# Roda LOCALMENTE na sua máquina. Faz:
#   1. SSH como root no servidor homol + roda hardening-homol.sh
#   2. SSH como deploy + roda bootstrap-homol.sh (passa CF_TUNNEL_HOMOL_TOKEN)
#   3. Smoke test externo via curl
#
# Pré-requisitos:
#   - .env.local com CF_TUNNEL_HOMOL_TOKEN
#   - ~/.ssh/quayer_homol (chave privada já gerada)
#   - Senha root do servidor (será pedida interativamente uma vez)
#
# Uso:
#   ./scripts/infra/one-shot-homol.sh
# ============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOMOL_HOST=167.235.139.140
SSH_KEY="${HOME}/.ssh/quayer_homol"
ENV_LOCAL="${REPO_ROOT}/.env.local"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date +%H:%M:%S)] $*${NC}"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] $*${NC}"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] $*${NC}" >&2; exit 1; }

# ----------------------------------------------------------------------------
# Validações
# ----------------------------------------------------------------------------
[[ -f "$ENV_LOCAL" ]] || err ".env.local não encontrado em $REPO_ROOT"
[[ -f "$SSH_KEY" ]]   || err "Chave privada não encontrada em $SSH_KEY — gere com ssh-keygen -t ed25519 -f $SSH_KEY -N ''"

CF_TUNNEL_HOMOL_TOKEN=$(grep '^CF_TUNNEL_HOMOL_TOKEN=' "$ENV_LOCAL" | cut -d= -f2-)
[[ -n "$CF_TUNNEL_HOMOL_TOKEN" ]] || err "CF_TUNNEL_HOMOL_TOKEN vazio no .env.local"

log "=== QUAYER HOMOL — ONE-SHOT DEPLOY ==="
echo "Host:           $HOMOL_HOST"
echo "SSH key:        $SSH_KEY"
echo "Tunnel token:   ${#CF_TUNNEL_HOMOL_TOKEN} chars"
echo

# ----------------------------------------------------------------------------
# STEP 1 — Hardening (como root, pedirá senha)
# ----------------------------------------------------------------------------
log "STEP 1/3 — Hardening do sistema (como root)"
log "Vai pedir a senha root UMA VEZ. Depois disso, password auth será desabilitado."
echo

ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 \
    root@"$HOMOL_HOST" 'bash -s' < "$REPO_ROOT/scripts/infra/hardening-homol.sh"

log "STEP 1 concluído — testando login como deploy"
if ! ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 \
     -o PasswordAuthentication=no \
     deploy@"$HOMOL_HOST" 'whoami && echo "sudo=$(sudo -n docker --version 2>&1)"'; then
  err "Login como deploy falhou. NÃO feche a janela root (se ainda aberta). Investigue."
fi

# ----------------------------------------------------------------------------
# STEP 2 — Bootstrap (como deploy, com token no env)
# ----------------------------------------------------------------------------
log "STEP 2/3 — Bootstrap do app (como deploy)"
echo

ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 \
    deploy@"$HOMOL_HOST" \
    "export CF_TUNNEL_HOMOL_TOKEN='$CF_TUNNEL_HOMOL_TOKEN'; bash -s" \
    < "$REPO_ROOT/scripts/infra/bootstrap-homol.sh"

log "STEP 2 concluído"

# ----------------------------------------------------------------------------
# STEP 3 — Smoke test externo
# ----------------------------------------------------------------------------
log "STEP 3/3 — Smoke test externo via Cloudflare"
log "Aguardando 15s para Cloudflare Tunnel terminar de subir"
sleep 15

SUCCESS=false
for i in 1 2 3 4 5 6; do
  STATUS=$(curl -sS -o /tmp/homol-check.txt -w "%{http_code}" --max-time 15 https://homol.quayer.com/api/health 2>/dev/null || echo "000")
  echo "  tentativa $i: HTTP $STATUS"
  if [[ "$STATUS" == "200" ]]; then
    SUCCESS=true
    break
  fi
  sleep 10
done

echo
if [[ "$SUCCESS" == "true" ]]; then
  log "=== DEPLOY CONCLUÍDO ==="
  echo
  echo "  URL:     https://homol.quayer.com"
  echo "  Health:  $(cat /tmp/homol-check.txt 2>/dev/null | head -c 200)"
  echo
  echo "  Próximos passos:"
  echo "    1. Edite /opt/quayer-homol/.env.homol no servidor com valores reais"
  echo "       (SMTP, UAZAPI, OpenAI, Google)"
  echo "    2. Restart: ssh -i $SSH_KEY deploy@$HOMOL_HOST 'cd /opt/quayer-homol && docker compose -f compose.homol.yml --env-file .env.homol restart app'"
  echo "    3. Daqui pra frente use: ./scripts/deploy.sh homol"
  rm -f /tmp/homol-check.txt
else
  warn "Smoke test externo falhou. Containers podem estar rodando mas tunnel não se conectou."
  warn "Investigar com:"
  echo "  ssh -i $SSH_KEY deploy@$HOMOL_HOST 'docker logs homol-quayer-cloudflared --tail 50'"
  echo "  ssh -i $SSH_KEY deploy@$HOMOL_HOST 'docker logs homol-quayer-app --tail 50'"
  exit 1
fi
