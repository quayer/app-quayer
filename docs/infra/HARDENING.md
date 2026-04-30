# Hetzner Server Hardening — Quayer

**Aplica-se a:** todos os servidores Hetzner Cloud do projeto (homol e prod).
**Última revisão:** 2026-04-08

> ⚠️ **Política:** nenhum servidor Quayer pode aceitar login root via senha. Toda autenticação SSH usa chave ed25519 + usuário `deploy` com sudo restrito.

---

## 1. Modelo de ameaças resumido

| Vetor | Mitigação |
|---|---|
| Senha root vazada/bruta | SSH key only, root login desabilitado |
| Brute-force SSH | fail2ban + UFW + porta padrão (Cloudflare protege HTTP) |
| Container escape | Docker rootless ou daemon hardening, app roda como `nextjs` (UID 1001) |
| Pacotes desatualizados (CVE) | unattended-upgrades automático |
| Disco cheio derrubando serviço | swap configurado + log rotation + alertas |
| Perda de dados | Backup diário do Postgres + snapshot Hetzner semanal |
| Acesso lateral entre containers | Rede Docker dedicada, Postgres/Redis sem expose externa |

---

## 2. Checklist de provisionamento (executar uma vez por servidor)

### 2.1 Acesso inicial
- [ ] Acessar via SSH com credencial inicial (descartável)
- [ ] **Imediatamente** trocar senha root: `passwd`
- [ ] Atualizar pacotes: `apt update && apt upgrade -y`
- [ ] Configurar timezone: `timedatectl set-timezone America/Sao_Paulo`
- [ ] Configurar hostname: `hostnamectl set-hostname homol-quayer` (ou `prod-quayer`)
- [ ] Editar `/etc/hosts` adicionando o hostname

### 2.2 Usuário de deploy
- [ ] Criar grupo: `groupadd deploy`
- [ ] Criar usuário: `useradd -m -s /bin/bash -G deploy,docker deploy`
- [ ] Sudo restrito (sem senha apenas para comandos docker): criar `/etc/sudoers.d/deploy` com:
  ```
  deploy ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/bin/docker compose, /usr/bin/systemctl restart nginx, /usr/bin/systemctl reload nginx
  ```
  - **NÃO dar sudo total**. Só o que o deploy precisa.
  - Validar com `visudo -c`

### 2.3 SSH key
- [ ] Criar diretório: `mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh`
- [ ] Adicionar pubkey ed25519 em `/home/deploy/.ssh/authorized_keys`
- [ ] Permissões: `chmod 600 /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy/.ssh`
- [ ] Testar login a partir de máquina cliente: `ssh -i ~/.ssh/quayer_homol deploy@IP`
- [ ] **Confirmar funcionando antes de prosseguir** — senão você se tranca fora

### 2.4 Hardening do sshd
Editar `/etc/ssh/sshd_config`:
```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding no
ClientAliveInterval 300
ClientAliveCountMax 2
MaxAuthTries 3
MaxSessions 5
AllowUsers deploy
```
- [ ] Validar config: `sshd -t`
- [ ] Reload: `systemctl reload sshd`
- [ ] **Testar nova sessão SSH em outra janela ANTES de fechar a atual**
- [ ] Se travar fora: usar Hetzner Cloud Console (web) para entrar e desfazer

### 2.5 Firewall (UFW)
- [ ] Instalar: `apt install -y ufw`
- [ ] Política default: `ufw default deny incoming && ufw default allow outgoing`
- [ ] Liberar SSH: `ufw allow 22/tcp comment 'ssh'`
- [ ] Liberar HTTP/HTTPS: `ufw allow 80/tcp comment 'http' && ufw allow 443/tcp comment 'https'`
- [ ] Habilitar: `ufw enable`
- [ ] Validar: `ufw status verbose`

### 2.6 fail2ban
- [ ] Instalar: `apt install -y fail2ban`
- [ ] Criar `/etc/fail2ban/jail.local`:
  ```ini
  [DEFAULT]
  bantime  = 1h
  findtime = 10m
  maxretry = 5
  backend  = systemd

  [sshd]
  enabled = true
  port    = ssh
  ```
- [ ] Iniciar: `systemctl enable --now fail2ban`
- [ ] Verificar: `fail2ban-client status sshd`

### 2.7 Atualizações automáticas de segurança
- [ ] Instalar: `apt install -y unattended-upgrades apt-listchanges`
- [ ] Configurar: `dpkg-reconfigure -plow unattended-upgrades`
- [ ] Editar `/etc/apt/apt.conf.d/50unattended-upgrades` para liberar `${distro_id}:${distro_codename}-security`
- [ ] Habilitar reboot automático para CVEs críticos (opcional, define janela noturna)

### 2.8 Swap (importante em VPS pequeno)
Se o servidor tem < 4GB RAM, criar swap:
```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl vm.swappiness=10
echo 'vm.swappiness=10' >> /etc/sysctl.conf
```

### 2.9 Docker
- [ ] Instalar Docker via script oficial: `curl -fsSL https://get.docker.com | sh`
- [ ] Habilitar: `systemctl enable --now docker`
- [ ] Adicionar `deploy` ao grupo docker: `usermod -aG docker deploy`
- [ ] Validar: `sudo -u deploy docker ps`
- [ ] Configurar log rotation do daemon — `/etc/docker/daemon.json`:
  ```json
  {
    "log-driver": "json-file",
    "log-opts": {
      "max-size": "10m",
      "max-file": "3"
    },
    "live-restore": true
  }
  ```
- [ ] Reload: `systemctl restart docker`

### 2.10 Nginx
- [ ] Instalar: `apt install -y nginx`
- [ ] Habilitar: `systemctl enable --now nginx`
- [ ] Remover default: `rm /etc/nginx/sites-enabled/default`
- [ ] Configurar site (ver `nginx-homol.conf` em `docs/infra/`)

### 2.11 Cloudflare Origin Certificate
- [ ] No painel Cloudflare → SSL/TLS → Origin Server → Create Certificate
- [ ] Tipo: ECC, validade 15 anos
- [ ] Hostnames: `homol.quayer.com` (ou wildcard `*.quayer.com`)
- [ ] Salvar `cert.pem` em `/etc/ssl/cloudflare/homol.quayer.com.pem`
- [ ] Salvar `key.pem` em `/etc/ssl/cloudflare/homol.quayer.com.key`
- [ ] Permissões: `chmod 600 /etc/ssl/cloudflare/*.key && chmod 644 /etc/ssl/cloudflare/*.pem`
- [ ] No painel Cloudflare → SSL/TLS → Overview → modo **Full (strict)**
- [ ] Habilitar **Authenticated Origin Pulls** (camada extra: nginx só aceita conexões assinadas pelo CF)

### 2.12 Backup diário automatizado
- [ ] Criar `/opt/quayer-homol/scripts/backup-db.sh` (ver template em `docs/infra/`)
- [ ] Cron diário às 03:00: `crontab -e`
  ```
  0 3 * * * /opt/quayer-homol/scripts/backup-db.sh >> /var/log/quayer-backup.log 2>&1
  ```
- [ ] Considerar Hetzner Cloud Backups (paid feature, snapshot semanal automático)
- [ ] Replicação opcional para S3/B2 via `rclone`

### 2.13 Monitoramento mínimo
- [ ] Instalar `htop`, `ncdu`, `iotop` para diagnóstico
- [ ] (Opcional) `node_exporter` + Grafana Cloud free tier
- [ ] (Opcional) Hetzner integra com syslog externo

---

## 3. Verificação final (smoke test do hardening)

Após completar todos os passos, validar:

```bash
# 1. Não consegue logar como root
ssh root@IP   # deve falhar

# 2. Não consegue logar com senha
ssh -o PreferredAuthentications=password deploy@IP   # deve falhar

# 3. SSH key funciona
ssh -i ~/.ssh/quayer_homol deploy@IP 'whoami'   # retorna 'deploy'

# 4. Firewall ativo
ssh deploy@IP 'sudo ufw status'   # mostra regras 22/80/443

# 5. fail2ban ativo
ssh deploy@IP 'sudo fail2ban-client status sshd'

# 6. Docker funciona
ssh deploy@IP 'docker ps'

# 7. Nginx serve HTTPS
curl -I https://homol.quayer.com   # 200 ou 502 (502 = backend não rodando, mas TLS OK)
```

---

## 4. Pós-incidente / rotação de credenciais

Se houver suspeita de comprometimento:
1. Revogar pubkey antiga em `/home/deploy/.ssh/authorized_keys`
2. Adicionar nova pubkey
3. Atualizar GitHub Secret `HOMOL_SSH_KEY` com nova privada
4. Rotacionar JWT_SECRET, IGNITER_APP_SECRET, ENCRYPTION_KEY no `.env.homol`
5. Restart containers: `docker compose -f compose.homol.yml --env-file .env.homol restart`
6. Invalidar todas as sessões ativas no banco
7. Rotacionar credenciais Cloudflare se afetadas
8. Documentar incidente em `docs/infra/incidents/`
