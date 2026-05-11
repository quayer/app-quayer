# Baselines de Latência — Produção Quayer

> **Versão consolidada 10/Mai/2026 — `docs/auth/BASELINES.md` mesclado aqui (deletado).**
> Documento canônico único de baselines: 6 targets de infra + breakdown de auth (seção 8).
> Cross-refs antigos para `docs/auth/BASELINES.md` devem apontar para este arquivo
> (seção 8 especificamente). Queries SQL relacionadas a auth: `docs/infra/baseline-queries.sql`.

> Snapshot inicial pós-provisionamento. Usado como referência para detectar regressões
> futuras e dimensionar SLOs. **Antes desta captura, nginx default servia "Welcome to nginx!"
> nos hosts, portanto não há histórico anterior.**

---

## 1. Snapshot

| Campo | Valor |
|---|---|
| Data/hora (UTC) | `2026-04-08T17:48:27Z` |
| Data/hora (BRT) | `2026-04-08 14:48 BRT` |
| Método | `curl -sI` (HEAD), 50 samples/endpoint, delay 0.5s serial |
| Cliente | Git Bash (Windows 11) — máquina de dev do Gabriel, Brasil |
| Script | `scripts/infra/capture-baselines.sh` |
| Endpoints | 6 (homol health, app health, app login, flows, chat, supabase) |

**Importante sobre a origem do cliente:** medições feitas da máquina local do dev, no
Brasil, saindo pela Internet pública. Qualquer referência a "TTFB" aqui inclui:

```
DNS + TCP + TLS + HTTP request + server processing + HTTP response first byte
    ~7ms   ~23ms  ~39ms          + <rede BR→CF edge>  + <origem quayer>
```

Cloudflare está no caminho (TCP ~23ms sugere edge próximo do Brasil — provavelmente GRU
ou MIA). **Latência pura Brasil → Frankfurt seria ~180ms RTT**; como observamos conexões
de ~23ms, confirmado que o CF Anycast está servindo da borda.

---

## 2. Endpoints medidos

### 2.1 Resumo (time_total)

| Endpoint | Status | p50 TTFB | p95 TTFB | p50 Total | p75 | p90 | p95 | p99 | Max | Success |
|---|---|---|---|---|---|---|---|---|---|---|
| `https://homol.quayer.com/api/health` | 200 | 232ms | 262ms | 232ms | 243ms | 254ms | 261ms | 643ms | 643ms | 100% |
| `https://app.quayer.com/api/health` | 200 | 234ms | 268ms | 233ms | 247ms | 260ms | 267ms | 952ms | 952ms | 100% |
| `https://app.quayer.com/login` | 200 | 253ms | 284ms | 253ms | 267ms | 280ms | 284ms | 287ms | 287ms | 100% |
| `https://flows.quayer.com/` | 200 | 230ms | 256ms | 230ms | 245ms | 249ms | 256ms | 822ms | 822ms | 100% |
| `https://chat.quayer.com/` | 302 | 490ms | 580ms | 491ms | 526ms | 552ms | 580ms | 1191ms | 1191ms | 100% |
| `https://supabase.quayer.com/` | 503 | 223ms | 248ms | 223ms | 240ms | 245ms | 248ms | 810ms | 810ms | 100% |

### 2.2 Fases de conexão (médias)

| Endpoint | DNS | TCP | TLS handshake |
|---|---|---|---|
| homol.quayer.com | 7ms | 21ms | 37ms |
| app.quayer.com (health) | 11ms | 24ms | 39ms |
| app.quayer.com (login) | 7ms | 23ms | 39ms |
| flows.quayer.com | 8ms | 26ms | 42ms |
| chat.quayer.com | 8ms | 23ms | 38ms |
| supabase.quayer.com | 7ms | 24ms | 40ms |

Conexão base (DNS+TCP+TLS) custa ~70ms em todos os hosts — consistente com CF edge
próximo. Todo tempo acima disso é processamento de origem + roundtrip origem↔edge.

---

## 3. Análise por endpoint

### `homol.quayer.com/api/health` — 232ms p50 / 262ms p95
Bom. Deduzindo os ~70ms de DNS+TCP+TLS, sobra ~160ms de processamento + rede CF↔origem.
Health check deveria ser <50ms de processamento, logo os outros ~110ms são hop CF→origem.
Aceitável para homol. p99 pulou pra 643ms num outlier único (possivelmente cold start
de route handler do Next.js).

### `app.quayer.com/api/health` — 234ms p50 / 268ms p95
Similar ao homol (mesmo stack). p99 de **952ms** é preocupante — outlier único também,
provavelmente cold start ou connection pool expiration no Prisma. Monitorar: se repetir,
investigar warmup do Next.js standalone.

### `app.quayer.com/login` — 253ms p50 / 284ms p95
**Excelente.** Página SSR com JSX + auth cookies + shadcn. p99 de 287ms (sem spikes)
sugere que o CF está cacheando o HTML estático do login, ou o Next.js tem a página
totalmente otimizada. **Suspeita de cache CF:** distribuição apertada demais (max
praticamente igual a p95) — validar via header `cf-cache-status` em próxima captura.

### `flows.quayer.com/` — 230ms p50 / 256ms p95
N8N UI. Provavelmente servindo HTML estático (bundle do n8n). Bom. p99 822ms em outlier
único.

### `chat.quayer.com/` — 490ms p50 / 580ms p95
**Mais lento — esperado.** Chatwoot Rails em Docker. Redireciona 302 para `/app/login`.
Rails boot + middleware stack custa ~3-4x mais que health check do Next.js. p99 de
1.19s em outlier. **Ponto de atenção futuro:** se começar a crescer, avaliar
passenger/puma workers.

### `supabase.quayer.com/` — 223ms p50 / 248ms p95
Kong respondendo 503 na rota raiz (esperado — não há rota `/` no Kong). Baseline útil
só pra latência de rede + TLS, não pra processamento. **Nota:** num futuro próximo,
medir um endpoint real tipo `/auth/v1/health` quando o GoTrue estiver provisionado.

---

## 4. Critério de regressão

Regras concretas pra CI/monitoramento futuro. Baseadas no `p95 Total` de cada endpoint.

| Regime | Regra | Ação |
|---|---|---|
| **Melhoria suspeita** | p95 ≤ 0.8 × baseline | Validar se CF não começou a cachear algo que antes não cacheava |
| **Dentro do normal** | p95 ≤ 1.2 × baseline | OK, continuar |
| **Regressão menor** | 1.2 × baseline < p95 ≤ 1.5 × baseline | Alerta; abrir issue de investigação |
| **Regressão crítica** | p95 > 1.5 × baseline | **Bloqueia release**; investigação imediata |
| **Success rate** | < 98% | Regressão crítica independente de latência |

### Thresholds absolutos (derivados)

| Endpoint | Baseline p95 | Alerta (1.2x) | Crítico (1.5x) |
|---|---|---|---|
| homol.quayer.com/api/health | 262ms | 314ms | 393ms |
| app.quayer.com/api/health | 268ms | 322ms | 402ms |
| app.quayer.com/login | 284ms | 341ms | 426ms |
| flows.quayer.com/ | 256ms | 307ms | 384ms |
| chat.quayer.com/ | 580ms | 696ms | 870ms |
| supabase.quayer.com/ | 248ms | 298ms | 372ms |

---

## 5. Procedimento de recaptura

### Rodar o script
```bash
bash scripts/infra/capture-baselines.sh

# Com parâmetros customizados:
SAMPLES=100 DELAY=1 bash scripts/infra/capture-baselines.sh
```

O script emite bloco markdown em stdout e salva CSVs brutos em `/tmp/quayer-baselines/`.

### Quando recapturar
- **Mensalmente** (primeira segunda do mês) para histórico
- **Após mudanças de infra**: novo provider, mudança no CF, novo IP do servidor,
  upgrade do Next.js major
- **Após rollouts de performance**: validar que melhorias são reais

### Como manter histórico
Ao recapturar, **não sobrescrever este arquivo**. Copiar pra `docs/infra/BASELINES_YYYY-MM-DD.md`
(ex: `BASELINES_2026-05-01.md`) e deixar `BASELINES.md` sempre apontando pro baseline
oficial atual.

### Comando curl manual (fallback sem o script)
```bash
URL="https://app.quayer.com/login"
for i in $(seq 1 50); do
  curl -sI -o /dev/null -w "%{http_code},%{time_namelookup},%{time_connect},%{time_appconnect},%{time_starttransfer},%{time_total}\n" --max-time 15 "$URL"
  sleep 0.5
done
```

---

## 6. Métricas NÃO capturadas (limitações)

Este baseline só mede **latência HTTP edge-perceived de um único cliente**. Não cobre:

1. **Latência sob carga** — requer load test (k6/Artillery). Ver `docs/infra/LOAD_TESTING.md` (TBD).
2. **Latência multi-região** — só medido do Brasil. Usuário em EU/US terá experiência diferente.
3. **Cold start real** — 50 samples em série aquece o pool; cold starts reais acontecem
   após idle longo.
4. **Taxa de conversão signup → onboarding** — precisa dados reais de produto, não sintético.
5. **Taxa de sucesso OTP** — `OTPs verificados / enviados`. Métrica de negócio, não de infra.
6. **Error rate `/api/v1/auth/*`** — precisa instrumentação APM (Sentry/Datadog) + carga real.
7. **Latência WebSocket** — `/api/igniter/stream` SSE não está no baseline (método diferente).
8. **Database query latency** — Prisma metrics + pg_stat_statements, não capturado aqui.
9. **CF cache hit ratio** — suspeita de cache no `/login` não validada (faltou capturar
   header `cf-cache-status`).

---

## 7. Próximas ações (backlog)

Ordenadas por prioridade baseada nos números observados:

- [ ] **[P1] Validar suposição de CF cache em `/login`** — capturar header `cf-cache-status`
  em próxima rodada. Se estiver em `HIT`, documentar porque isso acontece (e se é desejado
  — login deveria ser dinâmico por causa de CSRF token).
- [ ] **[P2] Investigar p99 outliers em `/api/health`** — 952ms vs p95 de 268ms é 3.5x.
  Provavelmente cold start. Se repetir em próxima captura, investigar Prisma connection
  pool warmup.
- [ ] **[P2] Substituir `supabase.quayer.com/` no baseline** — medir endpoint real como
  `/auth/v1/health` quando GoTrue estiver configurado. 503 atual é inútil como benchmark
  de processamento.
- [ ] **[P3] Baseline de `chat.quayer.com` em p95 580ms** — aceitável mas alto. Se crescer
  pra >800ms em uso real, avaliar puma workers do Chatwoot.
- [ ] **[P3] Adicionar captura de WebSocket / SSE** — `/api/igniter/stream` não tá coberto.
  Precisa método diferente (não HEAD).
- [ ] **[P4] Setup synthetic monitoring externo** — ver `docs/infra/SYNTHETIC_MONITORING.md`.
  Rodar essa captura automaticamente de 3 regiões (BR, US, EU) a cada hora.
- [ ] **[P4] Instrumentar APM** — Sentry Performance ou Datadog pra ter server-side timings
  reais (não só edge-perceived).

---

## Anexos

### A. Arquivos CSV brutos
Salvos em `/tmp/quayer-baselines/` após rodar o script. Formato:
```
http_code,time_namelookup,time_connect,time_appconnect,time_starttransfer,time_total
```

Não são commitados. Pra snapshot futuro, copiar pra `docs/infra/baselines-raw/YYYY-MM-DD/`.

### B. Comando de percentil usado
```awk
awk -v p="95" '
  { a[NR]=$1 }
  END {
    idx = int((p/100) * NR + 0.9999)
    if (idx < 1) idx = 1
    if (idx > NR) idx = NR
    printf "%.0f\n", a[idx]*1000
  }
' sorted.txt
```

---

## 8. Auth Endpoints Breakdown

> Conteúdo mesclado de `docs/auth/BASELINES.md` (v1, deletado em 10/Mai/2026).
> Foca em endpoints do fluxo de autenticação. Captura **independente** da seção 2 —
> usa N=10 (vs N=50 em infra), por isso p95 pode parecer mais ruidoso.
> `/login` já está coberto na seção 2.1 com N=50 (253ms p50 / 284ms p95) — esses
> são os números canônicos. A medição abaixo serve como cross-check do dia 2026-04-08.

### 8.1 Caveat — Baseline v1 de auth

Esta é a **primeira captura histórica** do fluxo de auth. Antes de 2026-04-08, a produção
servia nginx default em todos os paths. Não há comparação histórica possível; este é o piso.

- Critérios de regressão (1.2x alerta, 1.5x crítico) só fazem sentido a partir desta captura.
- "Melhoria" observada em releases futuras é apenas "primeira medição que realmente bateu na app".
- Métricas de produto (conversão, OTP success, error rate) estão em modo placeholder — sem
  usuários reais ainda.

Se alguma métrica parecer estranha (ex: p95 alto isolado), **não assumir regressão** sem N maior.

### 8.2 Snapshot de captura

| Campo | Valor |
|---|---|
| Data/hora (UTC) | `2026-04-08T18:54:43Z` |
| Método | `curl -sI` (HEAD), 10 samples/endpoint, delay 0.5s serial |
| Cliente | Git Bash (Windows 11) — máquina de dev, Brasil |
| Script | `scripts/infra/capture-auth-baselines.sh` |
| Endpoints | 4 (login, signup, login/verify, signup/verify) |
| Version | v1 (primeira captura real pós-infra) |

### 8.3 Endpoints de auth medidos (TTFB)

| Endpoint                               | Status | p50 TTFB | p95 TTFB | p99 TTFB | Success |
|----------------------------------------|--------|----------|----------|----------|---------|
| https://app.quayer.com/login           | 200    | 259ms    | 899ms*   | 899ms    | 100%    |
| https://app.quayer.com/signup          | 200    | 254ms    | 291ms    | 291ms    | 80%†    |
| https://app.quayer.com/login/verify    | 200    | 250ms    | 285ms    | 285ms    | 100%    |
| https://app.quayer.com/signup/verify   | 200    | 254ms    | 288ms    | 288ms    | 100%    |

**Anomalias observadas:**

- **\* /login p95=899ms**: outlier único de ~900ms em 10 amostras. p50 de 259ms alinhado
  com os outros. Provável cold start do route handler Next.js ou pool do Prisma. **Não marcar
  como regressão** em Release 2/3 sem re-captura N=50. A seção 2.1 (N=50) mostra p95=284ms,
  que é o número canônico.
- **† /signup success=80%**: 2 de 10 sofreram timeout de 21s (código 000 — conexão aceita
  sem resposta no limite de 15s). Os outros 8 retornaram 200 em ~250ms. Suspeita: rate limit
  do `/signup` (Turnstile pre-check ou middleware) em bursts sequenciais do mesmo IP. Não
  tratar como falha de infra até Release 2 validar com cliente humano real.

### 8.4 Thresholds de regressão para auth

Aplicar as mesmas regras da seção 4 (1.2x alerta / 1.5x crítico). Recaptura em Release 2/3
deve comparar p50 e p95 contra estes valores via `scripts/infra/capture-auth-baselines.sh`.

| Endpoint                               | Baseline p50 | Baseline p95 | Alerta (1.2x p95) | Crítico (1.5x p95) |
|----------------------------------------|--------------|--------------|-------------------|--------------------|
| https://app.quayer.com/login           | 259ms        | 899ms*       | 1079ms            | 1349ms             |
| https://app.quayer.com/signup          | 254ms        | 291ms        | 349ms             | 437ms              |
| https://app.quayer.com/login/verify    | 250ms        | 285ms        | 342ms             | 428ms              |
| https://app.quayer.com/signup/verify   | 254ms        | 288ms        | 346ms             | 432ms              |

\* p95 de `/login` inflado por 1 outlier. Para comparações iniciais, usar 320ms (≈1.23x p50)
como alvo de saúde até re-medir com N=50. Vide seção 2.1 para baseline canônico (284ms).

### 8.5 Conversion metrics (placeholder)

**Status: requires real users — placeholder até existir dado.**

Antes de 2026-04-08, produção servia nginx default — sem usuários históricos. Queries canônicas
vivem em `docs/infra/baseline-queries.sql` (movido de `docs/auth/`); rodar manualmente quando
houver tráfego orgânico.

| Métrica                                   | Valor atual | Fonte alvo                                   | Tag              |
|-------------------------------------------|-------------|----------------------------------------------|------------------|
| Signup → onboarding completed rate (30d)  | TODO        | SQL (`baseline-queries.sql#1`)               | placeholder-TODO |
| OTP success rate (verified / sent) (30d)  | TODO        | SQL (`baseline-queries.sql#2`)               | placeholder-TODO |
| Error rate `/api/v1/auth/*` (30d)         | TODO        | logs/APM (ver query #3)                      | placeholder-TODO |
| Time-to-verify OTP (p50/p95)              | TODO        | SQL (`baseline-queries.sql#2`)               | placeholder-TODO |
| Magic link click-through rate             | TODO        | logs/APM                                     | placeholder-TODO |

**Pré-requisitos para preencher:**

1. Pelo menos 30 signups reais na tabela `User`.
2. Schema de `OtpVerification` (ou equivalente) confirmado — ver TODO em `baseline-queries.sql#2`.
3. Alguma fonte de request logs para `/api/v1/auth/*`: tabela dedicada `request_logs`,
   Sentry Performance, Datadog APM, ou Axiom ingest. Hoje nada disso está provisionado.

Até lá: **não comparar regressão de conversão entre releases**. Release 2 e 3 devem provar
no-regression **apenas via latência** + teste funcional E2E (Playwright).

### 8.6 Procedimento de recaptura (auth)

```bash
bash scripts/infra/capture-auth-baselines.sh

# Com N maior (recomendado para baseline oficial):
SAMPLES=50 DELAY=0.5 bash scripts/infra/capture-auth-baselines.sh
```

Output markdown vai para stdout. CSVs brutos vão para `/tmp/quayer-auth-baselines/`. Para
snapshot pós-release, copiar este arquivo para `docs/infra/BASELINES_YYYY-MM-DD.md` (mesma
convenção do baseline de infra).

**Quando recapturar auth especificamente:**

- Antes de encerrar cada Release do Testing Pipeline (2, 3 e subsequentes).
- Após merge que toque `src/app/(auth)/*`, middleware, ou libs de auth.
- Mensalmente para histórico (mesma cadência do baseline de infra — seção 5).

### 8.7 Não capturado (limitações específicas de auth)

Mesmas limitações da seção 6 (cliente único, sem carga, sem multi-região, sem cold start
controlado) + específicas de auth:

1. **OAuth callback (`/api/v1/auth/oauth/*`)** — requer flow completo, não serve com HEAD curl.
2. **Magic link click** — baseline real só com dispatch de email + click.
3. **Turnstile challenge** — pode mudar latência em primeira requisição quando cookie de
   desafio ainda não existe.
4. **2FA challenge** — não incluído, requer user state.
5. **SSE / stream** — `/api/igniter/stream` não está neste baseline (vide item 7 da seção 6).
