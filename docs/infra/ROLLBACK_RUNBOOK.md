# Rollback Runbook — Produção Quayer

**Escopo:** `prd-quayer` (Hetzner CX33, `91.98.142.177`) e `dev-quayer` (CX23, `167.235.139.140`)
**Última revisão:** 2026-04-08
**Mantenedor:** Gabriel (solo founder)

---

## 1. Princípios

1. **Backup antes de qualquer mudança arriscada.** Sem exceções. Docker compose, Caddyfile, schema Prisma, envs — tudo versionado em `.bak.<timestamp>` ou snapshot Hetzner antes de tocar.
2. **SLA de rollback: < 15 minutos** do momento da decisão de reverter até o sistema voltar ao estado anterior saudável.
3. **Responsável:** Gabriel (solo founder). Não há rotação on-call — o founder é o único ponto de contato.
4. **Critério de disparo de rollback:**
   - Taxa de erro HTTP 5xx > 2% sustentada por 5 minutos, OU
   - Downtime detectado em qualquer subdomínio crítico (`app.`, `flows.`, `chat.`), OU
   - Regressão funcional confirmada manualmente (ex: login quebrado, mensagens não chegam, dashboard em branco), OU
   - Alerta do Hetzner sobre uso anômalo de CPU/RAM/disco após deploy.
5. **Regra de ouro:** *prefer reverter e investigar depois* a tentar hotfix ao vivo. Rollback primeiro, post-mortem depois.
6. **Nunca fazer em rollback:**
   - Editar banco direto com `DELETE`/`UPDATE` sem backup.
   - `docker system prune -af --volumes` em prod.
   - `git push --force` na `main` sem coordenação.
   - Executar migrations Prisma destrutivas (`--accept-data-loss`).

---

## 2. Tipos de Rollback — Matriz de Decisão

| # | Tipo de mudança | Método de rollback | Tempo estimado | Cenário |
|---|---|---|---|---|
| A | Code deploy quebrado (app Next.js) | `git revert` + workflow redeploy | 5 min | §3A |
| B | Docker compose mudança quebrou container | Restore `.bak.<timestamp>` + `up -d` | 2 min | §3B |
| C | Env var errada | Editar `.env` + `restart` container | 1 min | §3C |
| D | Banco corrompido / dados ruins | Restore backup Hetzner (imagem) | 10–15 min | §3D |
| E | Servidor offline total (kernel panic, disk full fatal) | Rebuild from snapshot via API | 20 min | §3E |
| F | SSH lockout (perdido acesso root) | Rescue mode Hetzner + fix `authorized_keys` | 15 min | §3F |
| G | Caddy quebrado (config ruim, cert inválido) | Restore `Caddyfile.bak` ou fallback nginx | 3 min | §3G |
| H | Cloudflare config errada (SSL mode, DNS, WAF) | Revert via API CF | 2 min | §3H |
| I | Origin Cert expirado/revogado | Reissue via API CF + deploy em Caddy | 10 min | §3I |
| J | Migration Prisma quebrou schema | Migration reversa + `prisma migrate resolve` | 10 min | §3J |

---

## 3. Runbooks por Cenário

Todos os comandos assumem que você está no diretório do projeto local:

```bash
cd "/c/Users/gabri/OneDrive/Documentos/🚀 Projetos/app-quayer"
```

E que `~/.ssh/quayer_prod` é a chave SSH de prod.

---

### 3A. Code Deploy Quebrado

**Sintomas:** Após merge na `main` e deploy via GitHub Actions, `app.quayer.com` retorna 500/502, ou funcionalidade core quebra.

**Diagnóstico:**
```bash
# 1. Healthcheck rápido
curl -sI https://app.quayer.com/api/health

# 2. Logs do container
ssh -i ~/.ssh/quayer_prod deploy@91.98.142.177 'sudo docker logs quayer-app --tail 100'

# 3. Status do container
ssh -i ~/.ssh/quayer_prod deploy@91.98.142.177 'sudo docker ps --filter name=quayer-app --format "table {{.Names}}\t{{.Status}}"'
```

**Rollback:**
```bash
# 1. Identificar o commit quebrado
git log --oneline -10

# 2. Reverter o commit (cria um novo commit de revert — SEM force push)
git revert <SHA_DO_COMMIT_QUEBRADO> --no-edit
git push origin main

# 3. Disparar redeploy manual
gh workflow run deploy-production.yml --ref main

# 4. Acompanhar execução
gh run watch

# 5. Validar
curl -sI https://app.quayer.com/api/health
curl -sI https://app.quayer.com/
```

**Fallback (se redeploy também falhar):** Fazer `docker pull` da imagem anterior via tag de SHA e subir manualmente:
```bash
ssh -i ~/.ssh/quayer_prod deploy@91.98.142.177 '
  cd /opt/quayer
  sudo docker compose pull
  # Editar docker-compose.yml e fixar a tag da imagem no SHA anterior (ex: ghcr.io/quayer/app:SHA_ANTERIOR)
  sudo docker compose up -d --force-recreate quayer-app
'
```

---

### 3B. Docker Compose Mudança Quebrou Container

**Sintomas:** Editou `docker-compose.yml` (n8n / chatwoot / supabase / quayer), rodou `up -d`, e um ou mais containers não sobem ou crasham.

**Rollback:**
```bash
ssh -i ~/.ssh/quayer_prod deploy@91.98.142.177 '
  # Substitua <DIR> por: /opt/quayer, /opt/n8n, /opt/chatwoot, ou /opt/supabase
  cd /opt/quayer

  # Listar backups disponíveis
  ls -t docker-compose.yml.bak.* 2>/dev/null | head -5

  # Restaurar o mais recente
  BACKUP=$(ls -t docker-compose.yml.bak.* | head -1)
  echo "Restaurando: $BACKUP"
  cp $BACKUP docker-compose.yml

  # Validar sintaxe
  sudo docker compose config > /dev/null && echo OK_CONFIG

  # Recriar containers
  sudo docker compose up -d --force-recreate

  # Status
  sudo docker compose ps
'
```

**Validação:**
```bash
curl -sI https://app.quayer.com/api/health
curl -sI https://flows.quayer.com/
curl -sI https://chat.quayer.com/
```

---

### 3C. Env Var Errada

**Sintomas:** Container sobe mas app erra em runtime (ex: DB connection refused, Redis auth failed, JWT secret inválido).

**Rollback:**
```bash
ssh -i ~/.ssh/quayer_prod deploy@91.98.142.177 '
  cd /opt/quayer  # ou /opt/n8n, /opt/chatwoot, /opt/supabase

  # 1. Backup do .env atual
  cp .env .env.bak.$(date +%s)

  # 2. Restaurar backup anterior (se existir)
  ls -t .env.bak.* 2>/dev/null | head -5
  # Editar manualmente ou copiar:
  # cp .env.bak.<timestamp_anterior> .env

  # 3. Restart do container afetado (não recreate — só restart)
  sudo docker compose restart quayer-app

  # 4. Verificar
  sudo docker logs quayer-app --tail 30
'
```

**Importante:** `restart` preserva o container; `up -d --force-recreate` recria do zero. Para env var bug, `restart` é suficiente e mais rápido.

---

### 3D. Banco Corrompido — Restore via Hetzner Backup

**Sintomas:** Queries retornam dados inconsistentes, constraint violations em massa, ou tabela inteira sumiu. Usar quando `pg_dump` local não resolve.

**Pré-requisitos:**
- `HETZNER_API_TOKEN` disponível em `.env.local` (load via `export HETZNER_API_TOKEN=$(grep ^HETZNER_API_TOKEN= .env.local | cut -d= -f2-)`).
- `SERVER_ID` de `prd-quayer` conhecido (buscar via API se necessário).

**Rollback:**
```bash
# 1. Listar backups disponíveis
export HCLOUD=$(grep ^HETZNER_API_TOKEN= .env.local | cut -d= -f2-)
curl -sS -H "Authorization: Bearer $HCLOUD" \
  "https://api.hetzner.cloud/v1/images?type=backup&sort=created:desc" | jq '.images[] | {id, description, created, server}'

# 2. Identificar o backup do servidor prd-quayer (campo bound_to)
# Anotar o image_id do backup escolhido

# 3. OPÇÃO A — Restore no mesmo servidor (DESTRUTIVO — perde mudanças pós-backup)
#    Confirmar com user antes de executar.
SERVER_ID=<ID_DO_PRD_QUAYER>
IMAGE_ID=<ID_DO_BACKUP>
curl -sS -X POST -H "Authorization: Bearer $HCLOUD" \
  "https://api.hetzner.cloud/v1/servers/$SERVER_ID/actions/rebuild" \
  -H "Content-Type: application/json" \
  -d "{\"image\": $IMAGE_ID}"

# 4. OPÇÃO B — Criar novo servidor temporário com o backup, extrair dados, reimportar
#    Preferida em 90% dos casos (zero downtime, pode extrair só as tabelas necessárias)
curl -sS -X POST -H "Authorization: Bearer $HCLOUD" \
  "https://api.hetzner.cloud/v1/servers" \
  -H "Content-Type: application/json" \
  -d '{"name":"recovery-temp","server_type":"cx23","image":'"$IMAGE_ID"',"location":"nbg1","ssh_keys":["quayer_prod"]}'

# 5. SSH no servidor temp, exportar dados
ssh -i ~/.ssh/quayer_prod root@<IP_TEMP> '
  cd /opt/quayer
  sudo docker exec quayer-postgres pg_dump -U postgres quayer > /tmp/quayer-recovered.sql
'
scp -i ~/.ssh/quayer_prod root@<IP_TEMP>:/tmp/quayer-recovered.sql ./

# 6. Reimportar seletivamente em prod
scp -i ~/.ssh/quayer_prod ./quayer-recovered.sql deploy@91.98.142.177:/tmp/
ssh -i ~/.ssh/quayer_prod deploy@91.98.142.177 '
  sudo docker exec -i quayer-postgres psql -U postgres quayer < /tmp/quayer-recovered.sql
'

# 7. Apagar servidor temporário
curl -sS -X DELETE -H "Authorization: Bearer $HCLOUD" \
  "https://api.hetzner.cloud/v1/servers/<ID_TEMP>"
```

**Nota:** Backups Hetzner são diários (janela 14-18 UTC, 7 dias retenção). Para dados críticos com RPO menor, configurar `pg_dump` cron adicional (ainda não automatizado — ver §4).

---

### 3E. Servidor Offline Total — Rebuild from Snapshot

**Sintomas:** Servidor não responde a ping, console Hetzner mostra kernel panic, disk full fatal, ou filesystem read-only.

**Rollback:**
```bash
export HCLOUD=$(grep ^HETZNER_API_TOKEN= .env.local | cut -d= -f2-)
SERVER_ID=<ID_DO_PRD_QUAYER>

# 1. Verificar último snapshot manual (ou backup mais recente se não houver snapshot)
curl -sS -H "Authorization: Bearer $HCLOUD" \
  "https://api.hetzner.cloud/v1/images?type=snapshot&sort=created:desc" | jq '.images[] | {id, description, created}'

# 2. Rebuild com o snapshot escolhido (sobrescreve o disco do servidor)
IMAGE_ID=<ID_DO_SNAPSHOT>
curl -sS -X POST -H "Authorization: Bearer $HCLOUD" \
  "https://api.hetzner.cloud/v1/servers/$SERVER_ID/actions/rebuild" \
  -H "Content-Type: application/json" \
  -d "{\"image\": $IMAGE_ID}"

# 3. Aguardar ~3-5 min até o servidor subir
until ping -c1 -W2 91.98.142.177 >/dev/null 2>&1; do sleep 5; done

# 4. SSH e validar containers
ssh -i ~/.ssh/quayer_prod root@91.98.142.177 '
  systemctl status caddy docker
  docker ps
'

# 5. Validar subdomínios
curl -sI https://app.quayer.com/api/health
curl -sI https://flows.quayer.com/
curl -sI https://chat.quayer.com/
```

---

### 3F. SSH Lockout — Rescue Mode

**Sintomas:** `ssh` retorna `Permission denied (publickey)` mesmo com chave correta. Causa comum: editou `sshd_config` errado, ou removeu `authorized_keys`.

**Procedimento (exatamente o mesmo usado em sessões anteriores):**
```bash
export HCLOUD=$(grep ^HETZNER_API_TOKEN= .env.local | cut -d= -f2-)
SERVER_ID=<ID_DO_PRD_QUAYER>

# 1. Obter o ID da chave SSH cadastrada no Hetzner
curl -sS -H "Authorization: Bearer $HCLOUD" \
  "https://api.hetzner.cloud/v1/ssh_keys" | jq '.ssh_keys[] | {id, name}'
SSH_KEY_ID=<ID_DA_CHAVE_QUAYER_PROD>

# 2. Habilitar rescue mode com a chave
curl -sS -X POST -H "Authorization: Bearer $HCLOUD" \
  "https://api.hetzner.cloud/v1/servers/$SERVER_ID/actions/enable_rescue" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"linux64\",\"ssh_keys\":[$SSH_KEY_ID]}"

# 3. Reset (reboot) do servidor para entrar em rescue
curl -sS -X POST -H "Authorization: Bearer $HCLOUD" \
  "https://api.hetzner.cloud/v1/servers/$SERVER_ID/actions/reset"

# 4. Aguardar rescue subir (~60s) e conectar
sleep 60
ssh -i ~/.ssh/quayer_prod -o StrictHostKeyChecking=no root@91.98.142.177

# 5. Dentro do rescue: montar disco, corrigir, sair
#    (sequência comum)
mount /dev/sda1 /mnt
chroot /mnt /bin/bash
# Ou diretamente:
# echo "ssh-ed25519 AAAA... gabriel@quayer" >> /mnt/root/.ssh/authorized_keys
# chmod 600 /mnt/root/.ssh/authorized_keys
# Se sshd_config está quebrado:
# cp /mnt/etc/ssh/sshd_config /mnt/etc/ssh/sshd_config.broken
# Editar /mnt/etc/ssh/sshd_config (PermitRootLogin prohibit-password, PubkeyAuthentication yes)
exit  # sai do chroot se aplicável
umount /mnt

# 6. Sair do rescue
exit

# 7. Desabilitar rescue mode
curl -sS -X POST -H "Authorization: Bearer $HCLOUD" \
  "https://api.hetzner.cloud/v1/servers/$SERVER_ID/actions/disable_rescue"

# 8. Reset para bootar normal
curl -sS -X POST -H "Authorization: Bearer $HCLOUD" \
  "https://api.hetzner.cloud/v1/servers/$SERVER_ID/actions/reset"

# 9. Validar acesso normal
sleep 60
ssh -i ~/.ssh/quayer_prod root@91.98.142.177 'hostname && uptime'
```

---

### 3G. Caddy Quebrado

**Sintomas:** `systemctl status caddy` mostra `failed`, ou subdomínios retornam erro TLS, ou `caddy validate` falha após edição do `Caddyfile`.

**Rollback Opção 1 — Restore backup:**
```bash
ssh -i ~/.ssh/quayer_prod root@91.98.142.177 '
  # Listar backups
  ls -t /etc/caddy/Caddyfile.bak.* 2>/dev/null | head -5

  # Restaurar o mais recente
  BACKUP=$(ls -t /etc/caddy/Caddyfile.bak.* | head -1)
  echo "Restaurando: $BACKUP"
  cp $BACKUP /etc/caddy/Caddyfile

  # Validar sintaxe
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

  # Reload (sem downtime) ou restart (com downtime curto)
  systemctl reload caddy || systemctl restart caddy
  systemctl status caddy --no-pager
'
```

**Rollback Opção 2 — Fallback nginx (nuclear):**
Usar apenas se Caddy estiver completamente inutilizável e precisamos restaurar HTTPS imediatamente.
```bash
ssh -i ~/.ssh/quayer_prod root@91.98.142.177 '
  # Parar Caddy
  systemctl stop caddy
  systemctl disable caddy

  # Instalar nginx se necessário
  apt-get update && apt-get install -y nginx

  # Deploy do fallback config (deve existir em /opt/quayer/nginx-fallback.conf — criar se não existir)
  if [ -f /opt/quayer/nginx-fallback.conf ]; then
    cp /opt/quayer/nginx-fallback.conf /etc/nginx/sites-available/quayer
    ln -sf /etc/nginx/sites-available/quayer /etc/nginx/sites-enabled/quayer
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl restart nginx
  else
    echo "ERRO: /opt/quayer/nginx-fallback.conf nao existe. Criar primeiro (ver §5)."
    exit 1
  fi
'
```

**Validação:**
```bash
curl -sI https://app.quayer.com/
curl -sI https://flows.quayer.com/
curl -sI https://chat.quayer.com/
```

---

### 3H. Cloudflare Config Errada

**Sintomas:** SSL mode errado (ex: mudou de `full (strict)` para `flexible` e quebrou redirect loops), DNS apontando errado, WAF bloqueando tráfego legítimo.

**Rollback — SSL mode:**
```bash
cd "/c/Users/gabri/OneDrive/Documentos/🚀 Projetos/app-quayer"
export CF=$(grep '^CLOUDFLARE_API_TOKEN=' .env.local | cut -d= -f2-)
export ZONE=aa20e8afc92fb86635ec0b71f61f003b  # quayer.com zone id

# Reverter SSL mode para full (strict) — estado conhecido bom
curl -sS -X PATCH \
  -H "Authorization: Bearer $CF" \
  -H "Content-Type: application/json" \
  -d '{"value":"full"}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/settings/ssl"
```

**Rollback — DNS record:**
```bash
# 1. Listar records
curl -sS -H "Authorization: Bearer $CF" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records?per_page=100" | jq '.result[] | {id, name, type, content}'

# 2. Atualizar record específico (ex: app.quayer.com A record)
RECORD_ID=<ID_DO_RECORD>
curl -sS -X PATCH \
  -H "Authorization: Bearer $CF" \
  -H "Content-Type: application/json" \
  -d '{"content":"91.98.142.177","proxied":true}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records/$RECORD_ID"
```

**Rollback — Desabilitar WAF rule que está bloqueando:**
```bash
# Listar rulesets
curl -sS -H "Authorization: Bearer $CF" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/rulesets" | jq '.result'
# Desabilitar rule específica via PATCH no ruleset (ver docs CF para schema)
```

---

### 3I. Origin Cert Cloudflare Expirado/Revogado

**Sintomas:** Browser mostra erro de TLS, `curl -v` mostra cert expirado ou `unable to verify the first certificate`.

**Rollback — Emitir novo Origin Cert via API:**
```bash
cd "/c/Users/gabri/OneDrive/Documentos/🚀 Projetos/app-quayer"
export CF_USER_TOKEN=$(grep '^CLOUDFLARE_USER_TOKEN=' .env.local | cut -d= -f2-)
# NOTA: Origin CA requer User API Token, nao Zone Token. Criar em dash.cloudflare.com/profile/api-tokens.

# 1. Gerar nova CSR localmente (ou usar a existente em /etc/caddy/origin.csr no prod)
ssh -i ~/.ssh/quayer_prod root@91.98.142.177 '
  if [ ! -f /etc/caddy/origin.key ]; then
    openssl req -new -newkey rsa:2048 -nodes -keyout /etc/caddy/origin.key \
      -out /etc/caddy/origin.csr -subj "/CN=*.quayer.com"
  fi
  cat /etc/caddy/origin.csr
' > /tmp/origin.csr

# 2. Solicitar cert via API Origin CA
CSR=$(cat /tmp/origin.csr | jq -Rs .)
curl -sS -X POST \
  -H "X-Auth-User-Service-Key: $CF_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"hostnames\":[\"*.quayer.com\",\"quayer.com\"],\"requested_validity\":5475,\"request_type\":\"origin-rsa\",\"csr\":$CSR}" \
  "https://api.cloudflare.com/client/v4/certificates" | jq '.result.certificate' -r > /tmp/origin.pem

# 3. Copiar cert pro servidor
scp -i ~/.ssh/quayer_prod /tmp/origin.pem root@91.98.142.177:/etc/caddy/origin.pem

# 4. Reload Caddy
ssh -i ~/.ssh/quayer_prod root@91.98.142.177 '
  chown caddy:caddy /etc/caddy/origin.pem /etc/caddy/origin.key
  chmod 640 /etc/caddy/origin.pem /etc/caddy/origin.key
  caddy validate --config /etc/caddy/Caddyfile
  systemctl reload caddy
'

# 5. Validar
curl -vI https://app.quayer.com/ 2>&1 | grep -E "expire|subject|issuer"
```

---

### 3J. Migration Prisma Quebrou Schema

**Sintomas:** Deploy aplicou uma migration que quebrou constraints, deletou coluna em uso, ou causou lock prolongado.

**Rollback:**
```bash
ssh -i ~/.ssh/quayer_prod deploy@91.98.142.177 '
  cd /opt/quayer

  # 1. Identificar migration aplicada mais recente
  sudo docker exec quayer-app npx prisma migrate status

  # 2. Marcar a migration como rolled back
  sudo docker exec quayer-app npx prisma migrate resolve --rolled-back <NOME_DA_MIGRATION>

  # 3. Se a migration aplicou mudanças destrutivas, precisa restaurar via pg dump
  #    (ver §3D para restore Hetzner, ou usar dump manual se disponivel)
  sudo docker exec quayer-postgres pg_dump -U postgres quayer > /tmp/pre-rollback-$(date +%s).sql
'

# 4. No local: reverter o commit da migration, gerar nova migration reversa
cd "/c/Users/gabri/OneDrive/Documentos/🚀 Projetos/app-quayer"
git revert <SHA_DA_MIGRATION> --no-edit
npx prisma migrate dev --name revert_<nome_original>
git add prisma/migrations
git commit -m "fix: revert migration <nome>"
git push origin main
gh workflow run deploy-production.yml --ref main
```

**Nota crítica:** Migrations destrutivas (DROP COLUMN, DROP TABLE) NÃO são revertíveis sem backup. Se aplicou uma por engano, pular direto pro §3D (restore Hetzner).

---

## 4. Backups Disponíveis — Inventário

| Tipo | Localização | Retenção | Como acessar | Verificado |
|---|---|---|---|---|
| Hetzner Cloud Backup (automático) | Hetzner infra (us-east datacenter) | 7 dias rolling | API `/images?type=backup` ou Console → Server → Backups | ___ |
| Hetzner Snapshot (manual) | Hetzner infra | Indefinido (paga storage) | API `/images?type=snapshot` | ___ |
| Docker compose backups | `/opt/quayer/docker-compose.yml.bak.*`, `/opt/n8n/...`, `/opt/chatwoot/...`, `/opt/supabase/...` | Manual (sem cleanup automático) | SSH direto, `ls -t` | ___ |
| Caddy config backups | `/etc/caddy/Caddyfile.bak.*` | Manual | SSH direto | ___ |
| Quayer Postgres dumps | **NÃO AUTOMATIZADO** | N/A | Executar manualmente: `docker exec quayer-postgres pg_dump -U postgres quayer` | ___ |
| n8n Postgres dumps | **NÃO AUTOMATIZADO** | N/A | `docker exec n8n-postgres pg_dump -U n8n n8n` | ___ |
| Chatwoot Postgres dumps | **NÃO AUTOMATIZADO** | N/A | `docker exec chatwoot-postgres pg_dump -U postgres chatwoot` | ___ |
| Supabase Postgres dumps | **NÃO AUTOMATIZADO** | N/A | `docker exec supabase-db pg_dumpall -U postgres` | ___ |
| Git history (code) | GitHub `Quayer/app-quayer` | Indefinido | `git log`, `git revert` | OK |
| `.env.local` (secrets source of truth) | Workstation do founder + 1Password (TBD) | N/A | Manual | ___ |

**Gap crítico identificado:** Não há `pg_dump` automatizado fora do backup Hetzner (RPO de até 24h). Para aumentar o RPO, agendar cron diário em cada Postgres container com upload para Hetzner Storage Box ou S3.

---

## 5. Testes de Restore Obrigatórios

Checklist a executar **antes de considerar este runbook validado**. Marcar data de última execução.

- [ ] **5.1 — Code deploy revert drill (homol):** Introduzir bug intencional em branch, mergear em `main`, deploy em `dev-quayer`, validar que detectamos em < 5 min, executar §3A, validar recuperação. Data: ___
- [ ] **5.2 — Docker compose backup restore:** Em homol, editar `docker-compose.yml` com erro de sintaxe, rodar `up -d`, executar §3B, validar. Data: ___
- [ ] **5.3 — Restore backup Hetzner em servidor temporário:** Seguir §3D opção B (criar servidor temp, extrair SQL, apagar). Validar que o dump é consistente. Data: ___
- [ ] **5.4 — Rescue mode drill:** Em `dev-quayer` (não em prod), executar §3F até o passo 5 (entrar em rescue, montar disco, listar `/mnt`), depois sair sem modificações. Data: ___
- [ ] **5.5 — Caddy config restore:** Em homol, quebrar `Caddyfile` propositalmente, executar §3G opção 1. Data: ___
- [ ] **5.6 — Cloudflare SSL mode revert:** Em horário de baixo tráfego, mudar SSL mode para `flexible`, validar que quebra, executar §3H. Data: ___
- [ ] **5.7 — Origin cert reissue:** Emitir novo cert em homol (não precisa revogar o atual, apenas testar o fluxo API). Data: ___
- [ ] **5.8 — Nginx fallback:** Criar `/opt/quayer/nginx-fallback.conf` com config mínima servindo os 3 subdomínios. Testar em homol. Data: ___

**Meta:** executar todos os drills nos próximos 30 dias. Registrar datas acima.

---

## 6. Log de Incidentes

Template para registrar incidentes reais. Adicionar entradas em ordem cronológica reversa (mais novo no topo).

```
## YYYY-MM-DD — <titulo curto>
**Impacto:** <tempo de downtime, % de usuarios afetados, features quebradas>
**Detecção:** <como foi detectado — alerta? usuario reportou? deploy?>
**Rollback executado:** §3<letra> (<nome do cenario>)
**Tempo total (deteccao -> recuperado):** <X minutos>
**Root cause:** <o que efetivamente causou o incidente>
**Aprendizados:**
- <o que faltava neste runbook>
- <o que precisa mudar no processo de deploy>
- <backup/monitoramento que faltava>
**Action items:**
- [ ] <item 1>
- [ ] <item 2>
```

---

### Incidentes registrados

*(Nenhum incidente registrado ainda — adicionar acima deste marcador conforme ocorrerem.)*

---

## Apêndice A — Variáveis de Ambiente Necessárias

Carregar de `.env.local` antes de executar comandos API:

```bash
cd "/c/Users/gabri/OneDrive/Documentos/🚀 Projetos/app-quayer"
export HETZNER_API_TOKEN=$(grep ^HETZNER_API_TOKEN= .env.local | cut -d= -f2-)
export CLOUDFLARE_API_TOKEN=$(grep ^CLOUDFLARE_API_TOKEN= .env.local | cut -d= -f2-)
export CLOUDFLARE_USER_TOKEN=$(grep ^CLOUDFLARE_USER_TOKEN= .env.local | cut -d= -f2-)
export CF_ZONE_ID=aa20e8afc92fb86635ec0b71f61f003b
```

## Apêndice B — IDs e Endereços de Referência

| Recurso | Valor |
|---|---|
| `prd-quayer` IPv4 | `91.98.142.177` |
| `prd-quayer` server_id | _preencher_ |
| `dev-quayer` IPv4 | `167.235.139.140` |
| `dev-quayer` server_id | _preencher_ |
| Cloudflare Zone (quayer.com) | `aa20e8afc92fb86635ec0b71f61f003b` |
| SSH key path | `~/.ssh/quayer_prod` |
| GitHub repo | `Quayer/app-quayer` |
| Deploy workflow | `.github/workflows/deploy-production.yml` |

## Apêndice C — Comandos de Validação Pós-Rollback

Execute sempre ao final de qualquer rollback:

```bash
# HTTP health
curl -sI https://app.quayer.com/api/health
curl -sI https://app.quayer.com/
curl -sI https://flows.quayer.com/
curl -sI https://chat.quayer.com/

# TLS cert info
echo | openssl s_client -connect app.quayer.com:443 -servername app.quayer.com 2>/dev/null | openssl x509 -noout -dates -subject

# Containers rodando
ssh -i ~/.ssh/quayer_prod deploy@91.98.142.177 'sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"'

# Uso de recursos
ssh -i ~/.ssh/quayer_prod deploy@91.98.142.177 'free -h && df -h / && uptime'

# Logs sem erros recentes
ssh -i ~/.ssh/quayer_prod deploy@91.98.142.177 'sudo docker logs quayer-app --since 5m 2>&1 | grep -iE "error|fatal|panic" | head -20'
```

Se todos retornam saudável, rollback concluído. Registrar o incidente no §6.

## Smoke Validation After Rollback (US-112)

After executing any rollback scenario (A-J), run `.github/workflows/smoke-prod.yml` manually via workflow_dispatch to validate the rolled-back version is serving correctly:

1. Navigate to Actions tab on GitHub
2. Select "Smoke Prod (read-only)"
3. Click "Run workflow" on main branch
4. Verify all 5 smoke checks pass: home 200, login has form, signup has form, api/v1/health 200, security headers present

If smoke fails after rollback, escalate immediately — rollback target may be corrupted.
