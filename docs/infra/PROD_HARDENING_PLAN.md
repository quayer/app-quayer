# Production Hardening Plan — `app.quayer.com`

**Servidor:** Hetzner Cloud `prd-quayer` (`91.98.142.177`)
**Status atual:** 🔴 **Vulnerabilidades reais em produção**
**Status deste documento:** ⏸️ **PLANO — não executar até aprovação explícita do founder em janela declarada**

---

## Sumário das vulnerabilidades identificadas (via API CF, sem tocar no servidor)

| # | Vulnerabilidade | Severidade | Impacto |
|---|---|---|---|
| 1 | **SSL mode = `flexible`** na zona `quayer.com` | 🔴 ALTA | MITM possível entre Cloudflare e servidor (HTTP plain). Atacante na rota CF→Hetzner pode interceptar/modificar tráfego, incluindo cookies de sessão. |
| 2 | **`Always Use HTTPS = off`** | 🔴 ALTA | Usuários acessando via `http://app.quayer.com` ficam em texto plano. Cookies marcados como Secure podem não aparecer no primeiro request. |
| 3 | **`Min TLS Version = 1.0`** | 🟡 MÉDIA | TLS 1.0 e 1.1 são quebrados (BEAST, POODLE, etc). Compliance PCI/SOC2 exige 1.2+. |
| 4 | **Delete protection = OFF** (corrigido pelo Claude em 2026-04-08) | ✅ Resolvido | Servidor não pode mais ser deletado por engano |
| 5 | **SSH com password auth via GitHub Secret** (`deploy-production.yml`) | 🔴 ALTA | Senha em CI/CD. Bruteforce via internet. Sem MFA. |
| 6 | **Subdomínios extras na mesma zona:** `chat`, `flows`, `supabase`, `clickhouse` | ⚠️ DESCONHECIDO | Cada um expõe um serviço diferente. Auditoria pendente. |

---

## Princípios de execução

1. **Zero downtime obrigatório** — prod tem usuários ativos
2. **Cada mudança é reversível em < 5 minutos**
3. **Snapshot Hetzner ANTES de qualquer mudança**
4. **Monitoramento ativo durante toda a janela** — abrir terminal com curl em loop, logs do app, metrics CF
5. **Janela de manutenção declarada** — fora do horário comercial brasileiro (ideal: madrugada, sábado/domingo)
6. **Founder presente e disponível** — comunicação síncrona caso algo dê errado
7. **Plano de rollback validado para CADA passo**

---

## Pré-requisitos antes da janela de manutenção

### Coleta de informações (não-destrutivo, pode fazer agora)

#### A. Inventory do servidor prod via SSH (read-only)
Precisa: credenciais SSH do prd-quayer (founder fornece via canal seguro)

```bash
ssh root@91.98.142.177 'bash -s' << 'EOF'
echo "=== OS ==="
cat /etc/os-release | head -5
echo
echo "=== UPTIME ==="
uptime
echo
echo "=== USERS ==="
cat /etc/passwd | grep -E "/(bash|sh|zsh)$"
echo
echo "=== SSH CONFIG ==="
grep -E "^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|Port|AllowUsers)" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null
echo
echo "=== PROCESSES (web/db) ==="
ps aux | grep -E "(nginx|caddy|apache|haproxy|postgres|redis|node|docker|supabase)" | grep -v grep
echo
echo "=== LISTENING PORTS ==="
ss -tlnp 2>/dev/null
echo
echo "=== DOCKER ==="
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null
echo
echo "=== UFW ==="
ufw status 2>/dev/null
echo
echo "=== FAIL2BAN ==="
fail2ban-client status 2>/dev/null
echo
echo "=== NGINX/CADDY CONFIG ==="
ls /etc/nginx/sites-enabled/ 2>/dev/null
ls /etc/caddy/ 2>/dev/null
echo
echo "=== CERTS ==="
find /etc/ssl /etc/letsencrypt /root /home /opt -name "*.pem" -o -name "*.crt" -o -name "*.key" 2>/dev/null | head -20
echo
echo "=== CRON ==="
crontab -l 2>/dev/null
ls /etc/cron.d/ /etc/cron.daily/ /etc/cron.hourly/ 2>/dev/null
echo
echo "=== RECENT LOGINS ==="
last -20
echo
echo "=== LAST PACKAGES UPDATED ==="
ls -lt /var/log/apt/history.log* 2>/dev/null | head -3
echo
echo "=== /opt CONTENT ==="
ls -la /opt/ 2>/dev/null
EOF
```

Cola a saída em `docs/infra/PROD_INVENTORY.md` (gitignored se contiver IPs/senhas).

#### B. Verificar todos os subdomínios respondem
```bash
for sub in app chat flows supabase; do
  echo "=== $sub.quayer.com ==="
  curl -sI -o /dev/null -w "Status: %{http_code}\nTime: %{time_total}s\n" "https://$sub.quayer.com" --max-time 10
  echo
done
```

#### C. Verificar GitHub Secret atual de prod
GitHub repo → Settings → Secrets → procurar `HOST`, `USERNAME`, `PASSWORD`. Confirmar que valor de `HOST` é `91.98.142.177`. Você não precisa revelar a senha — só confirmar que existe.

#### D. Snapshot Hetzner manual de prod
```bash
# Via API (não-destrutivo)
curl -X POST -H "Authorization: Bearer $HCLOUD_TOKEN" -H "Content-Type: application/json" \
  -d '{"description":"pre-hardening 2026-04-XX","type":"snapshot","labels":{"purpose":"pre-prod-hardening"}}' \
  "https://api.hetzner.cloud/v1/servers/112884206/actions/create_image"
```

---

## Plano de execução (estimativa: 2-3 horas em janela de baixa atividade)

### Fase 1 — Hardening do SSH (15-20 min, baixo risco)
**Objetivo:** trocar password auth por SSH key, criar user `deploy`.

1. Snapshot Hetzner manual (se não feito no pré-requisito)
2. Provisionar `deploy` user no servidor (mesmo script `hardening-homol.sh` adaptado)
3. Instalar pubkey ed25519 (gerar nova `quayer_prod`, NÃO reutilizar `quayer_homol`)
4. **Validar nova SSH key em outra janela** antes de mexer no sshd
5. Atualizar `sshd_config`:
   - `PermitRootLogin no`
   - `PasswordAuthentication no`
   - `AllowUsers deploy`
6. `sshd -t && systemctl reload sshd`
7. **Validar de OUTRA janela ANTES de fechar a sessão root**
8. Criar GitHub Secrets `PROD_HOST`, `PROD_USER`, `PROD_SSH_KEY`, `PROD_SSH_PORT`
9. Editar `deploy-production.yml`: substituir `password: ${{ secrets.PASSWORD }}` por `key: ${{ secrets.PROD_SSH_KEY }}`
10. Disparar workflow_dispatch manual no `deploy-production.yml` para validar
11. Após validação: deletar secrets antigos `HOST/USERNAME/PASSWORD`
12. Resetar senha root para algo aleatório (anotada apenas no Hetzner Cloud Console fallback)

**Rollback:** snapshot Hetzner restore + reativar password auth via Hetzner Cloud Console (web).

### Fase 2 — Investigar stack atual (sem mudar nada, 30 min)
**Objetivo:** entender o que está rodando antes de mexer.

1. SSH como `deploy` no prod
2. Listar containers Docker (se existir)
3. Listar processos (`nginx`, `caddy`, `supabase`)
4. Identificar onde estão os certificados existentes (provavelmente self-signed ou nenhum)
5. Identificar como cada subdomínio é roteado (nginx server blocks? Caddyfile? supabase kong?)
6. Documentar tudo em `docs/infra/PROD_ARCHITECTURE.md`

**Risco:** zero. Só leitura.

### Fase 3 — Instalar Cloudflare Origin Certificate (20 min, baixo risco)
**Objetivo:** ter cert válido no origin antes de mudar SSL mode pra strict.

1. Criar Origin Cert via API CF para `*.quayer.com` (cobre todos subdomínios)
2. Salvar em `/etc/ssl/cloudflare/quayer.com.pem` e `.key` no servidor
3. Permissões: `chmod 600 .key`, `chmod 644 .pem`
4. **NÃO** apontar nenhum proxy pra ele ainda — só armazenar
5. Para cada subdomínio (nginx ou caddy), preparar configuração nova mas NÃO ativar

**Rollback:** apagar arquivos. Sem impacto.

### Fase 4 — Atualizar reverse proxy para usar Origin Cert (30-45 min, MÉDIO risco)
**Objetivo:** servir HTTPS válido no origin para que SSL strict funcione.

Atenção: este passo pode causar downtime de segundos por subdomínio durante reload.

1. Para cada server block / Caddyfile site:
   - Adicionar `ssl_certificate /etc/ssl/cloudflare/quayer.com.pem;`
   - Adicionar `ssl_certificate_key /etc/ssl/cloudflare/quayer.com.key;`
   - Manter cert atual como fallback (se existir)
2. `nginx -t` ou `caddy validate` — validar configs
3. **Testar de uma máquina externa** simulando CF: `curl --resolve app.quayer.com:443:91.98.142.177 https://app.quayer.com -k`
4. `systemctl reload nginx` (ou caddy)
5. Curl externo via CF: `curl https://app.quayer.com` — verificar 200
6. Repetir validação para `chat`, `flows`, `supabase`

**Rollback:** snapshot + reload nginx com config antiga.

### Fase 5 — Habilitar Authenticated Origin Pulls (15 min, baixo risco)
**Objetivo:** servidor só aceita conexões assinadas pelo Cloudflare.

1. Baixar CA do CF: `curl -fsSL https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem -o /etc/ssl/cloudflare/origin-pull-ca.pem`
2. Habilitar via API CF: `PUT /zones/{zone}/settings/tls_client_auth { "value": "on" }`
3. Em cada server block adicionar:
   ```
   ssl_client_certificate /etc/ssl/cloudflare/origin-pull-ca.pem;
   ssl_verify_client on;
   ```
4. Reload nginx
5. Testar via CF (deve funcionar) e via curl direto (`curl --resolve app.quayer.com:443:91.98.142.177 ...` deve falhar com handshake error — isso é o esperado)

**Rollback:** desabilitar `ssl_verify_client` + reload.

### Fase 6 — Mudar SSL mode da zona para `strict` (5 min, RISCO ALTO se 4-5 não forem validados)
**Objetivo:** Cloudflare valida cert do origin, fim do MITM.

1. **Última verificação:** todos subdomínios devem servir HTTPS com cert Origin Pull
2. Via API CF: `PATCH /zones/{zone}/settings/ssl { "value": "strict" }`
3. Aguardar 30s (propagação interna do CF)
4. Smoke test em loop: `while true; do curl -sI https://app.quayer.com | head -1; sleep 2; done`
5. Repetir para chat, flows, supabase
6. Se qualquer um quebrar: rollback IMEDIATO via API: `PATCH ssl { "value": "flexible" }`

**Rollback:** 1 chamada API, propaga em < 1 min.

### Fase 7 — Habilitar Always Use HTTPS + Min TLS 1.2 (10 min, baixo risco)
**Objetivo:** força HTTPS, bloqueia TLS antigo.

1. `PATCH /settings/always_use_https { "value": "on" }`
2. `PATCH /settings/min_tls_version { "value": "1.2" }`
3. Smoke test: `curl -v http://app.quayer.com 2>&1 | grep -i "location"` — esperar 301 → https
4. Tentar TLS 1.1: `curl --tls-max 1.1 https://app.quayer.com` — esperar erro

**Rollback:** PATCH revertendo para `off` / `1.0`.

### Fase 8 — UFW + Firewall Hetzner Cloud (15 min, baixo risco)
**Objetivo:** porta 22 só do meu IP, 80/443 só de IPs Cloudflare.

1. Buscar lista atual de IPs CF: `curl -fsSL https://www.cloudflare.com/ips-v4`
2. Criar Hetzner Cloud Firewall `fw-prod`:
   - Inbound 22/tcp: só do IP do founder
   - Inbound 80,443/tcp: só dos IPs CF
   - Inbound ICMP: qualquer
3. Aplicar ao `prd-quayer`
4. Configurar UFW no host (defesa em profundidade) com regras espelhadas
5. Validar que `curl https://app.quayer.com` (via CF) ainda funciona
6. Validar que `curl https://91.98.142.177 -k` (direto) **falha** (porta bloqueada)

**Rollback:** remover firewall do servidor via API Hetzner.

---

## Não inclui nesta janela (pendente futuras releases)

- ❌ Migrar prod para Cloudflare Tunnel (eliminar exposição de portas)
- ❌ Auditoria de Supabase Studio em `supabase.quayer.com` (se acessível publicamente, é grave)
- ❌ Auditoria do servidor `clickhouse.quayer.com` (5.161.177.117) — é de outro provedor?
- ❌ Auditoria do servidor `quayer.com` raiz (84.32.84.32)
- ❌ Configurar Hetzner Cloud Backups de prod com retenção maior
- ❌ Implementar monitoramento sintético externo (Checkly/Datadog)
- ❌ Rotacionar todos os secrets de prod (JWT, encryption key, DB password)

Cada um vira PRD separado com plano próprio.

---

## Critérios de SUCESSO

- [ ] `curl https://app.quayer.com` retorna 200 OK
- [ ] `curl http://app.quayer.com` redireciona para HTTPS (301/308)
- [ ] SSL Labs report (`https://www.ssllabs.com/ssltest/analyze.html?d=app.quayer.com`) nota >= A
- [ ] `curl --tls-max 1.1 https://app.quayer.com` falha com handshake error
- [ ] `curl https://91.98.142.177 -k` falha (firewall ou origin pulls bloqueia)
- [ ] Workflow `deploy-production.yml` faz deploy bem-sucedido com SSH key
- [ ] Zero alertas de erro ou downtime detectados durante a janela
- [ ] Todos subdomínios (`chat`, `flows`, `supabase`) continuam funcionando

---

## Critérios de ABORT (rollback completo via snapshot)

Aborta a janela imediatamente se:
- Qualquer subdomínio retornar 5xx por mais de 60 segundos
- Mais de 3 erros de auth nos logs do app
- Latência p95 dobrar
- Founder solicitar parada
- Algum serviço crítico (ex: webhooks UAZ) parar de funcionar

Procedimento de abort:
1. Reverter SSL mode pra `flexible` via API (1 chamada)
2. Reverter `always_use_https` pra `off`
3. Reverter `min_tls_version` pra `1.0`
4. Se sshd quebrou: Hetzner Cloud Console → console web → desfazer
5. Se nada disso resolver: rebuild from snapshot
