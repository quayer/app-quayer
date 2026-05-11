# Synthetic Monitoring — Garantir que homol/prod realmente funciona

> Testes mockados (vitest, playwright local) provam que o código está correto. **Synthetic monitoring** prova que homol e prod realmente entregam email, OAuth e WhatsApp para usuários reais. Este doc é o plano canônico para Quayer.

Última atualização: 2026-05-10. Status: stack recomendada definida; implementação faseada (ver §6).

---

## 1. Princípio: dois tipos de "teste"

| Tipo | Camada existente | Velocidade | Custo | O que prova |
|---|---|---|---|---|
| Mock (vitest, playwright local) | C2–C5 | s | $0 | Código está correto |
| **Synthetic monitor (canary real)** | extra | min | ~$50/mês | Entrega real funciona em homol/prod |

Sem synthetic monitor, sua única forma de saber que email/Google/WhatsApp pararam é **o usuário reportar**. Inaceitável para produção.

---

## 2. Stack recomendada (verificada 2026)

| Canal | Ferramenta | Custo | Por que |
|---|---|---|---|
| Orquestração | **Checkly** ou GitHub Actions cron (que você já usa) | $40/mês (Checkly) ou $0 (GHA) | Checkly é purpose-built para synthetic, com Playwright nativo, CLI, Terraform, monitoring-as-code. GHA cron é o que você já tem — começa aqui. |
| Email canary | **Mailosaur** | $9/mês | Único que extrai OTP/magic-link automaticamente, API simples, integra Playwright. Mailtrap é mais barato em alguns tiers mas precisa parsing manual. |
| Google OAuth | Validação só do `getGoogleAuthUrl` no synthetic, **não** o callback real | $0 | Google bloqueia automação repetitiva. Validar callback exige Workspace conta + state cache + risco de bloqueio. ROI ruim para synthetic. |
| WhatsApp canary | Instância uazapi dedicada + webhook próprio em `/api/_canary/whatsapp-inbox` | preço uazapi atual | uazapi já é seu provider. Webhook recebe mensagens, monitor lê do nosso endpoint. Sem custo extra. |
| Error tracking (já tem) | **Sentry** (recém habilitado em homol — commit 5b99359) | $0 plano free | Captura erros runtime que synthetic não pega (memory leaks, errors silenciosos). |

### Por que NÃO Datadog Synthetics

- ~5× mais caro que Checkly para a mesma cobertura
- Só vale se você JÁ for cliente Datadog (correlação cross-stack)
- Quayer é cliente Sentry, não Datadog

### Por que NÃO Checkly de imediato

Você já tem `.github/workflows/synthetic-monitor.yml` rodando cron 5min. **Comece estendendo isso**. Migre para Checkly só quando precisar de:
- Multi-região (rodar de US/EU/BR simultaneamente)
- Dashboard visual sem construir
- Alertas integrados (PagerDuty, Slack já com formatação)

---

## 3. Cenários de canary (o que monitorar)

### P0 — disparar PagerDuty / quebra todo o produto

| # | Cenário | Frequência | Tempo limite |
|---|---|---|---|
| C1 | `GET /api/health` em homol e prod | 5 min | 15s |
| C2 | `GET /login` em prod retorna 200 + contém marker HTML | 5 min | 15s |
| C3 | Signup OTP roundtrip: email → Mailosaur → verify | 15 min | 60s |
| C4 | Login OTP roundtrip (usuário canário pré-criado) | 15 min | 60s |

### P1 — alerta Slack / degradação parcial

| # | Cenário | Frequência |
|---|---|---|
| C5 | `POST /api/v1/auth/google` retorna URL com `state` válido (32+ chars) | 15 min |
| C6 | `POST /api/v1/auth/passkey/login/challenge` retorna 200 (J16 conditional UI) | 15 min |
| C7 | Phone OTP roundtrip via uazapi → webhook canary → verify | 1 h |
| C8 | `GET /api/v1/auth/csrf` retorna cookie httpOnly | 15 min |

### P2 — relatório diário

| # | Cenário | Frequência |
|---|---|---|
| C9 | p95 das 5 rotas críticas vs baseline | 1 dia |
| C10 | Tempo médio de delivery do email canary (signal de degradação Resend/SMTP) | 1 dia |

---

## 4. Por que cada canal é tratado diferente

### Email (Resend/SMTP)
**Risco real:** provider cai ou bloqueia o domínio sender. Você não percebe até usuário reclamar.
**Mitigação:** Mailosaur tem inbox programática. Você manda OTP para `canary+{ts}@<seu-id>.mailosaur.net`, espera 30s, lê inbox via API, extrai código, completa o signup, espera 200. Roundtrip completo, 1 vez a cada 15 min. Se falhar 2× seguidas → alerta.

### Google OAuth
**Risco real (1):** consent screen mudou e seu app virou "unverified" → usuários não conseguem completar.
**Risco real (2):** `state` validation regrediu → vulnerabilidade CSRF.

**Por que NÃO automatizar o consent screen completo:**
- Google ML detecta automação. Suspende a conta. Você fica sem login OAuth em produção.
- Workspace conta dedicada ajuda mas não elimina o risco.
- Tempo de manutenção alto (Google muda fluxos sem aviso).

**O que validar (cobertura prática de 80%):**
- `POST /api/v1/auth/google` retorna `{ data: { authUrl } }`
- `authUrl` começa com `https://accounts.google.com/o/oauth2/v2/auth`
- `authUrl` contém `state=` com valor >= 32 chars
- `authUrl` contém `client_id=` válido (matches env)
- `authUrl` contém `redirect_uri=` apontando para homol/prod, não localhost
- Cookie `oauth_state` foi setado no response

Isso valida que: app é OAuth-verified ainda, secrets carregaram, lógica de state funciona, redirect_uri está certo. Os 20% restantes (callback round-trip) ficam para QA manual mensal.

### WhatsApp (uazapi)
**Risco real:** uazapi cai, sua instância foi banida, ou o número canary virou shadow-banned.
**Mitigação:** instância uazapi dedicada para canary → webhook próprio recebe mensagem de volta → monitor lê.

```
[Monitor] POST /api/v1/auth/login-otp-phone { phone: "+5511CANARY" }
[Backend] -> uazapi.com/message/sendText/CANARY_INSTANCE
[uazapi]  -> WhatsApp -> +5511CANARY (número canary)
[uazapi]  -> webhook: POST quayer.com/api/_canary/whatsapp-inbox { from, body }
[Monitor] GET /api/_canary/whatsapp-inbox/latest?phone=+5511CANARY → { code: "123456" }
[Monitor] POST /api/v1/auth/verify-login-otp { phone, code }
[Monitor] Espera 200 + session cookie
```

**Limites:**
- WhatsApp Business API tem rate limit. Não rodar a cada 5min — máx **1×/hora** para não acionar shadow-ban.
- Número canary precisa ser real e dedicado (chip pré-pago num celular antigo, ou virtual via Twilio com WhatsApp Business).
- Custo: ~R$20/mês chip + plano uazapi atual.

---

## 5. Secrets que você precisa configurar

Adicionar em `Settings > Secrets and variables > Actions`:

| Secret | Valor | Quem usa |
|---|---|---|
| `MAILOSAUR_API_KEY` | da conta Mailosaur | C3, C4 (email canary) |
| `MAILOSAUR_SERVER_ID` | id do server Mailosaur | C3, C4 |
| `MAILOSAUR_CANARY_INBOX` | `canary@<id>.mailosaur.net` | C3, C4 |
| `CANARY_PHONE_NUMBER` | número whatsapp canary | C7 |
| `CANARY_WEBHOOK_SECRET` | HMAC para validar webhook uazapi | `/api/_canary/whatsapp-inbox` |
| `CANARY_USER_EMAIL` | email do usuário canary pré-criado em prod | C4 (login roundtrip) |
| `SLACK_CANARY_WEBHOOK` | webhook do canal de alertas | notificação de falha |

Sem esses secrets, os jobs `if: secrets.MAILOSAUR_API_KEY != ''` são automaticamente pulados — workflow não quebra.

---

## 6. Implementação faseada

| Fase | Item | Esforço | Quando |
|---|---|---|---|
| 1 | Estender `synthetic-monitor.yml` com C5/C6 (URL validation) — não precisa de Mailosaur | 2h | Agora |
| 2 | Endpoint `/api/_canary/whatsapp-inbox` + webhook + secret | ½ dia | Agora |
| 3 | Mailosaur signup roundtrip (C3) | ½ dia | Quando criar conta Mailosaur |
| 4 | Mailosaur login roundtrip com user canary (C4) | ½ dia | Após C3 funcionar |
| 5 | uazapi instância dedicada + WhatsApp canary (C7) | 1 dia | Quando tiver número dedicado |
| 6 | Migrar para Checkly (opcional, se GHA cron não escalar) | 1 dia | Quando precisar multi-região |

Implementações concretas neste branch:
- [test/canary/signup-roundtrip.ts](../../test/canary/signup-roundtrip.ts) — script standalone usado pelo workflow
- [src/app/api/_canary/whatsapp-inbox/route.ts](../../src/app/api/_canary/whatsapp-inbox/route.ts) — endpoint webhook
- [.github/workflows/synthetic-monitor.yml](../../.github/workflows/synthetic-monitor.yml) — workflow estendido

---

## 7. Regras duras

- **Nunca** o canary user logar em produção sem flag `isCanary=true` no DB — evita poluir analytics/billing
- Mailosaur inbox tem domínio dedicado por server — usar `canary+{timestamp}@<server-id>.mailosaur.net` para correlacionar
- Webhook canary só aceita requests com header `X-Canary-Secret` matching `CANARY_WEBHOOK_SECRET` — uazapi precisa enviar esse header no setWebhook
- Quando um canary falha 2× consecutivas → criar issue automática no GitHub + alerta Slack
- Logs de canary NUNCA escrevem em produção DB de auditoria (`AuditLog`) — só em logs do GitHub Actions e Sentry breadcrumbs

---

## 8. Links de referência (verificados 2026-05-10)

### Email testing
- [Mailosaur — comparação oficial com Mailtrap](https://mailosaur.com/blog/mailosaur-vs-mailtrap) — fonte da decisão Mailosaur
- [Mailosaur preços e features no Capterra](https://www.capterra.com/p/201911/Mailosaur/)
- [Top 7 Mailtrap Alternatives (Sender, 2026)](https://www.sender.net/blog/mailtrap-alternatives/)

### uazapi / WhatsApp
- [uazapi docs oficiais](https://docs.uazapi.com/) — payload de webhook `{instance, event, data: {id, from, body, type, timestamp}}`
- [uazapi Postman collection v2.0](https://www.postman.com/augustofcs/uazapi-v2/collection/dhsg7sc/uazapigo-whatsapp-api-v2-0)
- [Whapi.cloud docs](https://whapi.cloud/docs) — alternativa caso uazapi vire problema

### Synthetic monitoring
- [Checkly vs Datadog (oficial Checkly)](https://www.checklyhq.com/datadog-alternative/) — fonte da decisão de manter GHA cron por enquanto
- [Datadog vs Sentry 2026 (Better Stack)](https://betterstack.com/community/comparisons/datadog-vs-sentry/) — confirma Sentry é error tracking, não synthetic
- [Top 9 Datadog Alternatives (SigNoz 2026)](https://signoz.io/blog/datadog-alternatives/)

### Google OAuth automation
- [How to Automate Google Login (Checkly Docs)](https://www.checklyhq.com/docs/learn/playwright/google-login-automation/) — padrão project-based auth.setup
- [Playwright Google Auth + 2FA exemplo (GitHub)](https://github.com/playwrightsolutions/playwright-google-auth-2fa) — uso de otpauth lib para TOTP
- [Playwright Authentication docs](https://playwright.dev/docs/auth) — storageState pattern

### Sentry (já habilitado)
- Commits recentes: `5b99359 fix(docker): symlink hashed import-in-the-middle names for Sentry tracer`, `1641557 feat(sentry): re-enable in homol via --webpack build`

---

## 9. KPIs do programa de canary

Quando estiver tudo no ar:

| KPI | Alvo | Onde medir |
|---|---|---|
| MTTR (mean time to recovery) | < 15 min | tempo entre canary falhar e issue resolvida |
| MTTD (mean time to detect) | < 5 min | tempo entre incidente real e canary detectar |
| False positive rate | < 1% | canaries que falharam mas serviço estava OK |
| Canary uptime | > 99.5% | uptime do próprio sistema de canary |
| Cost per detected incident | < $10 | mensalidades / incidentes pegos antes de usuário reportar |
