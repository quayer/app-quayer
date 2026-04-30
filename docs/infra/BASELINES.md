# Baselines de Latência — Produção Quayer

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
