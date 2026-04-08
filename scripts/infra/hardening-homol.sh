#!/usr/bin/env bash
# ============================================================================
# HARDENING — dev-quayer (homol) — 167.235.139.140
# ============================================================================
# Como executar (UMA VEZ, como root):
#   ssh root@167.235.139.140 'bash -s' < scripts/infra/hardening-homol.sh
#
# O script é IDEMPOTENTE — pode rodar mais de uma vez sem quebrar nada.
# Se algo falhar, ele para imediatamente (set -e) e reporta a etapa.
#
# Pré-requisitos antes de rodar:
#   - Você deve ter acesso root via senha (atual)
#   - Pubkey SSH `ssh-ed25519 ...quayer_homol` será instalada para o user 'deploy'
#
# Após sucesso, validar de OUTRA janela ANTES de fechar a atual:
#   ssh -i ~/.ssh/quayer_homol deploy@167.235.139.140 'whoami && sudo docker ps'
# ============================================================================

set -euo pipefail

# Cores para legibilidade
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[$(date +%H:%M:%S)] $*${NC}"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] WARN: $*${NC}"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ERR: $*${NC}" >&2; exit 1; }

# Pubkey ed25519 do deploy-homol-quayer-2026 (gerada local em ~/.ssh/quayer_homol.pub)
DEPLOY_PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP56AGqdu7BHpjmG5FxXewhcr6iksqtEub++IKu6fIOY deploy-homol-quayer-2026"

[[ $EUID -eq 0 ]] || err "Este script precisa rodar como root"

log "=== HARDENING dev-quayer iniciando ==="

# ----------------------------------------------------------------------------
# 1. Atualização inicial do sistema
# ----------------------------------------------------------------------------
log "1/12 - Atualizando sistema (apt update + upgrade)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"

# ----------------------------------------------------------------------------
# 2. Pacotes essenciais
# ----------------------------------------------------------------------------
log "2/12 - Instalando pacotes essenciais"
apt-get install -y -qq \
  curl wget gnupg lsb-release ca-certificates apt-transport-https \
  ufw fail2ban unattended-upgrades apt-listchanges \
  htop ncdu iotop tree jq \
  rsync chrony \
  unzip

# ----------------------------------------------------------------------------
# 3. Hostname + timezone
# ----------------------------------------------------------------------------
log "3/12 - Configurando hostname e timezone"
hostnamectl set-hostname homol-quayer || true
timedatectl set-timezone America/Sao_Paulo || true
systemctl enable --now chrony || systemctl enable --now systemd-timesyncd || true

# Garante que /etc/hosts tem o hostname
grep -q "homol-quayer" /etc/hosts || echo "127.0.1.1 homol-quayer" >> /etc/hosts

# ----------------------------------------------------------------------------
# 4. Usuário deploy
# ----------------------------------------------------------------------------
log "4/12 - Criando usuário deploy"
if ! id -u deploy &>/dev/null; then
  useradd -m -s /bin/bash deploy
  log "    user 'deploy' criado"
else
  log "    user 'deploy' já existe"
fi

# Sudo restrito (somente docker e systemctl reload de serviços específicos)
cat > /etc/sudoers.d/deploy <<'EOF'
# deploy user — least privilege
deploy ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/bin/docker compose, /usr/bin/systemctl reload nginx, /usr/bin/systemctl restart nginx, /usr/bin/systemctl status nginx, /usr/bin/journalctl
EOF
chmod 0440 /etc/sudoers.d/deploy
visudo -c -f /etc/sudoers.d/deploy >/dev/null || err "sudoers.d/deploy inválido"

# ----------------------------------------------------------------------------
# 5. SSH key do deploy
# ----------------------------------------------------------------------------
log "5/12 - Instalando pubkey SSH do deploy"
install -d -m 0700 -o deploy -g deploy /home/deploy/.ssh
echo "$DEPLOY_PUBKEY" > /home/deploy/.ssh/authorized_keys
chmod 0600 /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys

# ----------------------------------------------------------------------------
# 6. Hardening sshd
# ----------------------------------------------------------------------------
log "6/12 - Hardening do sshd"
SSHD_CFG=/etc/ssh/sshd_config
SSHD_DROPIN=/etc/ssh/sshd_config.d/00-quayer-hardening.conf

# Backup antes de mexer
[[ -f $SSHD_CFG.bak ]] || cp $SSHD_CFG $SSHD_CFG.bak

# Config drop-in (sobrescreve config principal)
cat > $SSHD_DROPIN <<'EOF'
# Quayer hardening — gerado por scripts/infra/hardening-homol.sh
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
MaxAuthTries 3
MaxSessions 5
AllowUsers deploy
LoginGraceTime 30
EOF

# Validar antes de aplicar
sshd -t || err "sshd config inválido — abortando ANTES de reload"

# Ubuntu 24.04 usa ssh.service; distros antigas usam sshd.service
if systemctl list-unit-files ssh.service &>/dev/null; then
  systemctl reload ssh
elif systemctl list-unit-files sshd.service &>/dev/null; then
  systemctl reload sshd
else
  err "Nem ssh.service nem sshd.service encontrados"
fi
log "    sshd recarregado — TESTE EM OUTRA JANELA antes de fechar esta!"

# ----------------------------------------------------------------------------
# 7. UFW firewall
# ----------------------------------------------------------------------------
log "7/12 - Configurando UFW"
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'ssh'
# 80/443 NÃO são abertos — usaremos Cloudflare Tunnel (outbound only)
ufw --force enable
ufw status verbose

# ----------------------------------------------------------------------------
# 8. fail2ban
# ----------------------------------------------------------------------------
log "8/12 - Configurando fail2ban"
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port    = ssh
EOF
systemctl enable --now fail2ban
systemctl reload fail2ban
fail2ban-client status sshd || warn "fail2ban sshd jail não inicializado ainda"

# ----------------------------------------------------------------------------
# 9. unattended-upgrades
# ----------------------------------------------------------------------------
log "9/12 - Habilitando unattended-upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades

# ----------------------------------------------------------------------------
# 10. Swap (apenas se RAM < 4GB e não tiver swap)
# ----------------------------------------------------------------------------
log "10/12 - Verificando swap"
RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
SWAP_MB=$(free -m | awk '/^Swap:/{print $2}')
if [[ $SWAP_MB -lt 100 && $RAM_MB -lt 8192 ]]; then
  log "    criando swap de 2GB"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl vm.swappiness=10 >/dev/null
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
else
  log "    swap já existe ou RAM suficiente — pulando"
fi

# ----------------------------------------------------------------------------
# 11. Docker
# ----------------------------------------------------------------------------
log "11/12 - Instalando Docker"
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker deploy
systemctl enable --now docker

# Daemon hardening + log rotation
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true
}
EOF
systemctl restart docker
docker --version
docker compose version || warn "docker compose plugin não disponível"

# ----------------------------------------------------------------------------
# 12. Estrutura de diretórios para o app
# ----------------------------------------------------------------------------
log "12/12 - Criando estrutura /opt/quayer-homol"
install -d -m 0755 -o deploy -g deploy /opt/quayer-homol
install -d -m 0755 -o deploy -g deploy /opt/quayer-homol/data/postgres
install -d -m 0755 -o deploy -g deploy /opt/quayer-homol/data/redis
install -d -m 0755 -o deploy -g deploy /opt/quayer-homol/backups
install -d -m 0755 -o deploy -g deploy /opt/quayer-homol/scripts

# ----------------------------------------------------------------------------
# Resumo final
# ----------------------------------------------------------------------------
log "=== HARDENING CONCLUÍDO ==="
echo
echo "Hostname:    $(hostname)"
echo "Timezone:    $(timedatectl | grep 'Time zone' | awk '{print $3}')"
echo "Kernel:      $(uname -r)"
echo "Docker:      $(docker --version)"
echo "Deploy user: $(id deploy)"
echo "UFW:         $(ufw status | head -1)"
echo "fail2ban:    $(systemctl is-active fail2ban)"
echo "Swap:        $(free -m | awk '/^Swap:/{print $2 " MB"}')"
echo
echo "PROXIMOS PASSOS (faca AGORA, sem fechar esta janela):"
echo
echo "  1. De OUTRA janela (PowerShell/Git Bash):"
echo "     ssh -i ~/.ssh/quayer_homol deploy@167.235.139.140 'whoami && docker ps'"
echo
echo "  2. Se a saida acima for 'deploy' + lista vazia de containers, esta OK"
echo
echo "  3. Se OK, voce pode fechar esta sessao root."
echo
echo "  4. Se NAO funcionar, NAO feche esta janela — me chame para debugar."
echo
log "=== FIM ==="
