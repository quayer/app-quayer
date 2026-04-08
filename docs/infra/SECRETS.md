# GitHub Secrets — Quayer

> ⚠️ Nunca commitar valores reais. Apenas nomes e descrição.
> Secrets ficam em **GitHub repo → Settings → Secrets and variables → Actions**.

---

## Homol (workflow `deploy-homol.yml`)

| Nome | Valor / formato | Origem |
|---|---|---|
| `HOMOL_HOST` | `167.235.139.140` | Hetzner Cloud Console |
| `HOMOL_USER` | `deploy` | Criado durante hardening |
| `HOMOL_SSH_PORT` | `22` | Default SSH |
| `HOMOL_SSH_KEY` | Conteúdo de `~/.ssh/quayer_homol` (chave **privada**) | Gerado local: `ssh-keygen -t ed25519 -f ~/.ssh/quayer_homol` |
| `CF_TUNNEL_HOMOL_TOKEN` | Token do tunnel `homol-quayer` (180 chars base64) | API CF: `GET /accounts/{acct}/cfd_tunnel/{id}/token` — atualmente em `.env.local` (não commitado) |

### Como adicionar `CF_TUNNEL_HOMOL_TOKEN`
1. Local (já feito automaticamente): o valor está em `.env.local` (gitignored)
2. Copiar valor: `grep CF_TUNNEL_HOMOL_TOKEN .env.local | cut -d= -f2-`
3. GitHub repo → Settings → Secrets and variables → Actions → New repository secret
4. Name: `CF_TUNNEL_HOMOL_TOKEN`, Secret: colar
5. Add secret

**Importante:** se o tunnel for recriado (delete + create), o token muda. Atualizar este secret.

### Como adicionar `HOMOL_SSH_KEY`
1. No terminal local: `cat ~/.ssh/quayer_homol`
2. Copiar saída inteira (incluindo `-----BEGIN OPENSSH PRIVATE KEY-----` e `-----END OPENSSH PRIVATE KEY-----`)
3. GitHub repo → Settings → Secrets and variables → Actions → New repository secret
4. Name: `HOMOL_SSH_KEY`
5. Secret: colar
6. Add secret

---

## Production (workflow `deploy-production.yml` — A SER MIGRADO)

⚠️ **Status atual:** usando senha SSH (`secrets.HOST/USERNAME/PASSWORD`).
⚠️ **Migração pendente:** trocar para SSH key, mesmo padrão do homol.

| Nome (atual) | Tipo | Status |
|---|---|---|
| `HOST` | IP `91.98.142.177` | ✅ existe |
| `USERNAME` | provavelmente `root` | ⚠️ migrar para `deploy` |
| `PASSWORD` | senha SSH | 🔴 **VULNERABILIDADE** — substituir por SSH key |

### Plano de migração (zero downtime)
1. Provisionar usuário `deploy` no servidor 91.98.142.177 (mesmo passo do homol)
2. Adicionar SSH key
3. Adicionar **novos** secrets sem remover os antigos:
   - `PROD_HOST`
   - `PROD_USER`
   - `PROD_SSH_KEY`
   - `PROD_SSH_PORT`
4. Atualizar `deploy-production.yml` para usar os novos secrets
5. Rodar `workflow_dispatch` manual e validar deploy
6. Remover secrets antigos (`HOST/USERNAME/PASSWORD`)
7. Trocar senha root no servidor para algo aleatório (anotada apenas no Hetzner Cloud Console fallback)
8. Desabilitar `PasswordAuthentication no` no `sshd_config` do prod

---

## Secrets compartilhados (Vercel — A REMOVER)

Não usamos Vercel. Os seguintes secrets devem ser **deletados**:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN` (a menos que comecem a usar Docker Hub)

Os workflows que os referenciam serão removidos:
- `cd-staging.yml`
- `cd-production.yml`

---

## Cloudflare (futuro — automação avançada)

Se um dia automatizarmos cache purge ou DNS via API:

| Nome | Origem |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → escopo Zone:DNS:Edit |
| `CLOUDFLARE_ZONE_ID` | Cloudflare → quayer.com → Overview (sidebar direita) |

---

## Convenções

- Nomes em **MAIÚSCULAS_COM_UNDERSCORE**
- Prefixo de ambiente (`HOMOL_`, `PROD_`, `DEV_`) para evitar confusão
- Secrets sensíveis (chaves privadas, tokens) **nunca** logados — usar `::add-mask::` se necessário
- Rotação obrigatória a cada 90 dias para keys SSH e a cada incidente
