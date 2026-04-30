# Auth Baselines — Quayer

Snapshot de latencia e metricas do fluxo de autenticacao de producao.
Usado pelas Releases 2 (cleanup) e 3 (rebrand) do Testing Pipeline para
provar "sem regressao" contra estes numeros.

---

## Caveat: Baseline v1

**Esta e a PRIMEIRA captura historica de baseline do fluxo de auth.**

Antes de 2026-04-08, a producao de `app.quayer.com` (e demais subdominios)
estava servindo a pagina default do nginx ("Welcome to nginx!") para
**todos** os paths. Nao existe nenhum registro anterior de latencia real,
nem de taxa de conversao, nem de erro, nem logs utilizaveis de request.

Consequencias praticas:

- Nao ha comparacao histórica possivel. Este snapshot **e** a referencia.
- Criterios de regressao (1.2x alerta, 1.5x critico) so fazem sentido
  depois desta primeira captura. Antes dela nao havia metrica.
- Qualquer "melhoria" observada nas proximas releases e, na verdade,
  apenas "primeira medicao que realmente bateu na app".
- Metricas de produto (conversao, OTP success, error rate) estao em
  modo placeholder: nao ha usuarios reais ainda.

Se alguma metrica deste documento parecer estranha (ex: p95 alto isolado),
**nao assumir regressao** — este e o piso, nao o teto.

---

## 1. Snapshot

| Campo | Valor |
|---|---|
| Data/hora (UTC) | `2026-04-08T18:54:43Z` |
| Metodo | `curl -sI` (HEAD), 10 samples/endpoint, delay 0.5s serial |
| Cliente | Git Bash (Windows 11) — maquina de dev, Brasil |
| Script | `scripts/infra/capture-auth-baselines.sh` |
| Endpoints | 4 (login, signup, login/verify, signup/verify) |
| Version | v1 (primeira captura real pos-infra) |

Medicao feita da maquina local do dev, saindo pela Internet publica via
Cloudflare edge. TTFB inclui DNS + TCP + TLS + request + processamento
origem + response first byte. Baseline equivalente ao `docs/infra/BASELINES.md`
em metodologia — este documento foca nos paths de auth.

---

## 2. Endpoints medidos (TTFB)

| Endpoint                               | Status | p50 TTFB | p95 TTFB | p99 TTFB | Success | Source |
|----------------------------------------|--------|----------|----------|----------|---------|--------|
| https://app.quayer.com/login           | 200    | 259ms    | 899ms    | 899ms    | 100%    | curl   |
| https://app.quayer.com/signup          | 200    | 254ms    | 291ms    | 291ms    | 80%     | curl   |
| https://app.quayer.com/login/verify    | 200    | 250ms    | 285ms    | 285ms    | 100%    | curl   |
| https://app.quayer.com/signup/verify   | 200    | 254ms    | 288ms    | 288ms    | 100%    | curl   |

Notas sobre anomalias observadas na captura:

- **/login p95=899ms**: um unico outlier de ~900ms entre 10 amostras.
  O p50 de 259ms esta alinhado com os outros endpoints. Provavelmente
  cold start do route handler Next.js ou pool do Prisma. Nao marcar como
  regressao em Release 2/3 enquanto nao houver re-captura com N maior.
- **/signup success=80%**: 2 amostras de 10 sofreram timeout de 21s
  (codigo 000 no curl — conexao aceita mas sem resposta no limite de 15s).
  Os outros 8 retornaram 200 normalmente em ~250ms. Suspeita: rate limit
  do endpoint `/signup` (Turnstile pre-check ou middleware) disparando em
  bursts sequenciais do mesmo IP. Acao: nao tratar como falha de infra
  ate Release 2 validar com cliente humano real.
- Comparado ao `docs/infra/BASELINES.md` (que mediu `/login` em 253ms p50 /
  284ms p95 com 50 samples), o p50 desta captura esta compativel. A
  diferenca no p95 de `/login` vem apenas do N menor (10 vs 50).

### 2.1 Baseline para comparacao (referencia)

Abaixo sao os numeros a serem usados como piso. Release 2 e 3 devem rodar
novamente `scripts/infra/capture-auth-baselines.sh` e comparar p50 e p95.

| Endpoint                               | Baseline p50 | Baseline p95 | Alerta (1.2x p95) | Critico (1.5x p95) |
|----------------------------------------|--------------|--------------|-------------------|--------------------|
| https://app.quayer.com/login           | 259ms        | 899ms*       | 1079ms            | 1349ms             |
| https://app.quayer.com/signup          | 254ms        | 291ms        | 349ms             | 437ms              |
| https://app.quayer.com/login/verify    | 250ms        | 285ms        | 342ms             | 428ms              |
| https://app.quayer.com/signup/verify   | 254ms        | 288ms        | 346ms             | 432ms              |

\* O p95 de `/login` esta inflado por 1 outlier. Para comparacoes iniciais,
pode-se usar 320ms (aprox 1.23x do p50) como alvo de saude ate re-medir com N=50.

---

## 3. Conversion metrics

**Status: requires real users — placeholder until data exists.**

Antes de 2026-04-08 a producao servia nginx default, entao nao ha usuarios
historicos para amostrar. As queries canonicas vivem em `docs/auth/baseline-queries.sql`
e devem ser rodadas quando o fluxo receber trafego organico.

| Metrica                                   | Valor atual | Fonte alvo                     | Source tag |
|-------------------------------------------|-------------|--------------------------------|------------|
| Signup -> onboarding completed rate (30d) | TODO        | SQL (`baseline-queries.sql#1`) | placeholder-TODO |
| OTP success rate (verified / sent) (30d)  | TODO        | SQL (`baseline-queries.sql#2`) | placeholder-TODO |
| Error rate `/api/v1/auth/*` (30d)         | TODO        | logs/APM (ver query #3)        | placeholder-TODO |
| Time-to-verify OTP (p50/p95)              | TODO        | SQL (`baseline-queries.sql#2`) | placeholder-TODO |
| Magic link click-through rate             | TODO        | logs/APM                       | placeholder-TODO |

Pre-requisitos para preencher:

1. Pelo menos 30 signups reais na tabela `User`.
2. Schema de `OtpVerification` (ou equivalente) confirmado — ver TODO em
   `baseline-queries.sql#2`.
3. Alguma fonte de request logs para `/api/v1/auth/*`. Opcoes possiveis:
   tabela dedicada `request_logs`, Sentry Performance, Datadog APM, ou
   Axiom ingest. Hoje nada disso esta provisionado.

Ate la: **nao comparar regressao de conversao entre releases**. Release 2
e 3 devem provar no-regression **apenas via latencia** + teste funcional
E2E (Playwright).

---

## 4. Procedimento de recaptura

```bash
bash scripts/infra/capture-auth-baselines.sh

# Com N maior (recomendado para baseline oficial):
SAMPLES=50 DELAY=0.5 bash scripts/infra/capture-auth-baselines.sh
```

Output markdown vai para stdout. CSVs brutos vao para `/tmp/quayer-auth-baselines/`.
Para snapshot pos-release, copiar este arquivo para `docs/auth/BASELINES_YYYY-MM-DD.md`
(mesma convencao do `docs/infra/BASELINES.md`).

### Quando recapturar

- Antes de encerrar cada Release do Testing Pipeline (2, 3 e subsequentes).
- Apos merge que toque `src/app/(auth)/*`, middleware, ou libs de auth.
- Mensalmente para histórico (mesma cadencia do baseline de infra).

---

## 5. Nao capturado (limitacoes)

Mesmas limitacoes de `docs/infra/BASELINES.md` (cliente unico, sem carga,
sem multi-regiao, sem cold start controlado) + especificas de auth:

1. **OAuth callback (`/api/v1/auth/oauth/*`)** — requer flow completo,
   nao serve com HEAD curl.
2. **Magic link click** — baseline real so com dispatch de email + click.
3. **Turnstile challenge** — pode mudar latencia em primeira requisicao
   quando cookie de desafio ainda nao existe.
4. **2FA challenge** — nao incluido, requer user state.
5. **SSE / stream** — `/api/igniter/stream` nao esta neste baseline.

---

## 6. Referencias

- `docs/infra/BASELINES.md` — baseline equivalente para endpoints de infra
  (health checks, landing, integrations).
- `scripts/infra/capture-auth-baselines.sh` — script de captura deste doc.
- `scripts/infra/capture-baselines.sh` — script original (infra).
- `docs/auth/baseline-queries.sql` — queries SQL canonicas para metricas
  de conversao e erro (rodar manualmente).
