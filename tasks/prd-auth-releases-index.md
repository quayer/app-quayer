# Auth Releases — Índice Sequencial

**Contexto:** O PRD original (`archive/prd-auth-rebrand-v3-monolithic-rejected.md`) foi rejeitado em review por acumular 31 stories e 3 releases distintas em um único entregável. Foi quebrado em 3 releases independentes, ordenadas pela dependência real: **testes primeiro (rede de segurança) → cleanup baseado em dados reais → rebrand com rollback instantâneo**.

---

## Ordem de execução (obrigatória)

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

### PR-1: Ambiente de homologação
- [ ] URL definitiva do homol (ex: `quayer-homol.vercel.app` ou `staging.quayer.com`)
- [ ] Credenciais de acesso (banco staging, env vars)
- [ ] Quem opera? Deploy automático ou manual?
- [ ] Mailhog ou serviço de email real com domínio de teste?

### PR-2: Estratégia de monitoramento sintético em produção
- [ ] **Decisão:** Checkly, Datadog Synthetics, ou GitHub Actions com runner externo?
- [ ] **NÃO usar conta `smoke@` com OTP fixo em prod** — isso é backdoor de auth. Se for única opção viável, escopo muda para smoke apenas de rotas públicas (landing, `/login` GET).
- [ ] Definir budget de erro: quantas falhas consecutivas disparam alerta?
- [ ] Webhook destino: Discord? Slack? Email?

### PR-3: Plano de rollback em produção
- [ ] SLA de revert: quanto tempo desde detecção até rollback completo?
- [ ] Vercel rollback manual via dashboard ou automação CI?
- [ ] Quem tem autoridade para disparar rollback sem aprovação?
- [ ] Critério objetivo para rollback (ex: taxa de erro > 2% por 5 min)

### PR-4: Conflito com branch `ralph/auth-platform-hardening`
- [ ] Essa branch tem trabalho em andamento que vai conflitar com tudo que planejamos em `src/app/(auth)/*` e `src/server/core/auth/`
- [ ] **Decisão:** merge de `ralph/*` em `main` primeiro, OU fazer Release 1 a partir de `ralph/*`?
- [ ] Se merge primeiro: quando? Quem revisa?

### PR-5: Baselines quantitativas de produção
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

Skills `.claude/`:
- `testing-pipeline.md` — criada em Release 1
- `release-checklist.md` — criada em Release 1
- `auth-pages.md` — criada em Release 3
