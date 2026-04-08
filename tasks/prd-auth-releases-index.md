# Auth Releases — Índice Sequencial

**Contexto:** O PRD original (`archive/prd-auth-rebrand-v3-monolithic-rejected.md`) foi rejeitado em review por acumular 31 stories e 3 releases distintas em um único entregável. Foi quebrado em 3 releases independentes, ordenadas pela dependência real: **testes primeiro (rede de segurança) → cleanup baseado em dados reais → rebrand com rollback instantâneo**.

---

## Ordem de execução (obrigatória)

> **Nota (2026-04-08):** Esta sessão focou em **hardening de produção** e **provisionamento do homol**, trabalho paralelo ao plano original das 3 releases abaixo. Ver `docs/infra/` para documentação da infra atual. As 3 releases continuam válidas mas podem ter premissas atualizadas.

| # | Release | PRD | Objetivo | Duração alvo |
|---|---|---|---|---|
| 1 | **Testing Pipeline** | [prd-01-testing-pipeline.md](prd-01-testing-pipeline.md) | Estabelecer rede de segurança (5 camadas × 3 ambientes) contra o código **atual** de auth. Zero mudança funcional. | ~1-2 semanas |
| 2 | **Auth Cleanup** | [prd-02-auth-cleanup.md](prd-02-auth-cleanup.md) | Medir tráfego real nas rotas candidatas (14 dias de observação), deprecate com warning, depois deletar. | ~3 semanas (com observação) |
| 3 | **Auth Rebrand v3** | [prd-03-auth-rebrand-v3.md](prd-03-auth-rebrand-v3.md) | Aplicar DS v3 em `(auth)/*` com feature flag `NEXT_PUBLIC_AUTH_V3`. Rollout por % de usuários. | ~2 semanas |

**Por que nessa ordem:**
- Release 2 e 3 **não podem começar sem Release 1** — sem pipeline de testes, não há como garantir ausência de regressão.
- Release 3 assume Release 2 completo — refazer UI de rota que vai ser deletada é desperdício.
- Cada release entrega valor independente e pode ir para prod sozinha.

---

## Pré-requisitos bloqueantes (resolver ANTES de Release 1)

Issues que impedem início de qualquer trabalho. **Founder precisa responder:**

### PR-1: Ambiente de homologação — ✅ RESOLVIDO 2026-04-08
- URL: `https://homol.quayer.com`
- Servidor: Hetzner CX23 `dev-quayer` (IP `167.235.139.140`)
- Stack: Docker (app + postgres + redis) atrás de Cloudflare Tunnel (`homol-quayer`, ID `23591a24-146f-4354-aafb-492b0b7393a8`)
- SSH: user `deploy`, chave `~/.ssh/quayer_homol`
- GitHub Secrets: `HOMOL_HOST`, `HOMOL_USER`, `HOMOL_SSH_PORT`, `HOMOL_SSH_KEY`, `CF_TUNNEL_HOMOL_TOKEN`
- Email: `EMAIL_PROVIDER=mock` (precisa SMTP real antes de testar OTP real)
- **Known issue:** `SKIP_MIGRATIONS=true` no entrypoint (bug em `prisma/migrate.js` com transitivos `pg` não resolvido)
- Runbook: `docs/infra/HOMOL_SETUP.md`

### PR-2: Estratégia de monitoramento sintético em produção — ❌ ABERTO
- [ ] **Decisão:** Checkly, Datadog Synthetics, UptimeRobot, ou GitHub Actions cron?
- **Candidatos avaliados (2026-04-08):** Checkly (free 10k runs/mo), Datadog Synthetics, UptimeRobot, GitHub Actions cron
- **Recomendação pessoal:** **Checkly** pelo free tier generoso + scripting em Playwright
- **Mínimo viável:** monitor HTTP status + latência de `app.quayer.com/api/health` e `homol.quayer.com/api/health`, alerta via webhook Discord
- [ ] **NÃO usar conta `smoke@` com OTP fixo em prod** — isso é backdoor de auth. Se for única opção viável, escopo muda para smoke apenas de rotas públicas (landing, `/login` GET).
- [ ] Definir budget de erro: quantas falhas consecutivas disparam alerta?
- [ ] Webhook destino: Discord? Slack? Email?

### PR-3: Plano de rollback em produção — 🟡 PARCIAL
**Capacidades existentes (2026-04-08):**
- ✅ Backups automáticos Hetzner (diários, 7 dias retenção, janela 14-18 UTC)
- ✅ Snapshot manual Hetzner sob demanda (via API `POST /servers/{id}/actions/create_image`)
- ✅ Delete + rebuild protection em `prd-quayer` (API)
- ✅ Git revert (workflow_dispatch + redeploy)
- ✅ Docker compose rollback (backups `.bak.<timestamp>` em `/opt/*/docker-compose.yml.bak.*`)
- ✅ Caddy config rollback (`/etc/caddy/Caddyfile.bak.*`)

**Pendências:**
- ❌ SLA de rollback objetivo (quanto tempo até revert completo?)
- ❌ Responsável designado (solo founder = Gabriel por enquanto)
- ❌ Runbook documentado em `docs/infra/ROLLBACK_RUNBOOK.md` (a criar)
- ❌ Teste de restore real (nunca foi exercitado)
- [ ] Critério objetivo para rollback (ex: taxa de erro > 2% por 5 min)

### PR-4: Conflito com branch `ralph/auth-platform-hardening` — 🔄 DECISÃO MUDOU
- O plano original era criar `feat/testing-pipeline` separada
- Na prática, commitamos direto em `ralph/auth-platform-hardening` porque a infra de deploy foi misturada com outros trabalhos dessa branch
- **Commits de infra nesta sessão (2026-04-08):** `b2ea0d6`, `c2c4dd6`, `5d7d3e8`, `cfb973d`, `5b9d3e0`, `b90c661`
- **Decisão pendente:** na próxima release, criar `feat/testing-pipeline` do zero a partir de `main` OU continuar misturando

### PR-5: Baselines quantitativas de produção — ❌ ABERTO

> **ATENÇÃO (2026-04-08):** Antes de 2026-04-08 o servidor `prd-quayer` servia "Welcome to nginx!" (nginx default) para TODOS os subdomínios. Portanto:
> - Não existem baselines anteriores confiáveis — qualquer métrica de antes é do nginx default, não do app real
> - **Baselines precisam ser capturadas AGORA** com o app verdadeiramente servindo
> - Métricas mínimas a capturar:
>   - p50/p95/p99 TTFB e LCP de `app.quayer.com/api/health`
>   - p50/p95/p99 TTFB e LCP de `app.quayer.com/login`
>   - Error rate de `/api/v1/auth/*`
>   - Conversão signup → onboarding (a partir de dados reais quando houver usuários)

Precisamos desses números **antes** de qualquer release para definir critério de "não regrediu":
- [ ] p50, p95, p99 atual de `/login` (TTFB + LCP)
- [ ] Taxa de conversão signup → onboarding (últimos 30 dias)
- [ ] Taxa de sucesso de OTP (OTPs verificados / OTPs enviados)
- [ ] Tempo médio do fluxo completo signup → primeira ação no dashboard
- [ ] Error rate atual de `/api/v1/auth/*` endpoints

**Fonte dos dados:** Vercel Analytics, logs de aplicação, queries SQL diretas no banco.

---

## Feature flags — decisão revisada

O PRD original decidiu "não usar flag, git backup é suficiente". **Revisado:** Release 3 **obrigatoriamente** usa feature flag `NEXT_PUBLIC_AUTH_V3` porque:

1. Git revert em Next.js App Router pode quebrar build se houver mudança em env vars, fontes, ou dependências
2. Flag permite rollback em **segundos** sem deploy
3. Flag permite rollout gradual (1% → 10% → 50% → 100%)
4. Flag permite A/B testing para medir impacto em conversão

Releases 1 e 2 não precisam de flag — são backward-compatible por design.

---

## Documentação compartilhada

Criada durante Release 1, referenciada pelas três:

- `docs/auth/TESTING_ENVIRONMENTS.md` (Release 1)
- `docs/auth/BASELINES.md` (Release 1) — snapshot dos números de PR-5
- `docs/auth/USER_JOURNEY.md` (Release 3)
- `docs/auth/AUTH_FLOW.md` (Release 3)
- `docs/auth/CLEANUP_AUDIT.md` (Release 2)

**Infra (Release 0 — criadas em 2026-04-08):**
- `docs/infra/HARDENING.md`
- `docs/infra/HOMOL_SETUP.md`
- `docs/infra/PROD_HARDENING_PLAN.md`
- `docs/infra/SECRETS.md`
- `infra/prod/Caddyfile` (snapshot da config prod)
- `infra/prod/n8n/docker-compose.yml` (snapshot)
- `infra/prod/supabase/docker-compose.yml` (snapshot)

**Infra a criar:**
- `docs/infra/ROLLBACK_RUNBOOK.md` — PR-3
- `docs/infra/BASELINES.md` — PR-5 (começar vazio com placeholder)
- `docs/infra/SYNTHETIC_MONITORING.md` — PR-2

Skills `.claude/`:
- `testing-pipeline.md` — criada em Release 1
- `release-checklist.md` — criada em Release 1
- `auth-pages.md` — criada em Release 3
