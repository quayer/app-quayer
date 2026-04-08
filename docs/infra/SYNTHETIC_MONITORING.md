# Synthetic Monitoring — Quayer

> Estratégia de monitoramento sintético para detectar indisponibilidade e regressão de latência em produção/homol sem depender de tráfego real e sem credenciais.

---

## 1. Objetivo

Detectar, em **menos de 5 minutos**, qualquer:

- Indisponibilidade (5xx sustentado, timeout, DNS/SSL quebrado)
- Regressão de latência significativa em endpoints críticos
- Quebra silenciosa de rotas públicas (`/login`, `/api/health`)

Sem mexer em dados reais, sem criar contas fake, sem armazenar credenciais de produção.

---

## 2. Estratégia por ambiente

| Ambiente | Método | Frequência | Escopo |
|---|---|---|---|
| **Homol** | GitHub Actions cron + curl | 15 min | `/api/health` + `/login` |
| **Produção** | GitHub Actions cron + curl | 5 min | `/api/health` + `/login` + subdomínios `chat`/`flows`/`supabase` |
| **Produção (futuro)** | **Checkly** (free tier 10k runs/mo) | 1 min | + verificações visuais + Playwright multi-step |

O MVP (hoje) é 100% GitHub Actions — custo zero, sem dependência externa, sem conta nova.

---

## 3. Princípios

- **NUNCA** fazer login real em produção (sem conta fake, sem OTP fixo, sem senha armazenada).
- **NUNCA** escrever no banco durante um check.
- **Apenas** HTTP `GET`/`HEAD` em rotas públicas e `/api/health`.
- Monitor não deve causar falsos positivos por rate limiting de Cloudflare ou WAF — user-agent identificável, frequência baixa, IPs de GitHub runners já estão em allowlist de facto.
- Alerta só dispara após **N falhas consecutivas** (ver seção 7) para evitar flap.

---

## 4. Implementação MVP — GitHub Actions (ativa agora)

Workflow: `.github/workflows/synthetic-monitor.yml`

### Targets monitorados

| Nome | URL | Status esperado |
|---|---|---|
| `homol-health` | `https://homol.quayer.com/api/health` | `200` + JSON `{"status":"healthy"}` |
| `prod-health` | `https://app.quayer.com/api/health` | `200` + JSON `{"status":"healthy"}` |
| `prod-login` | `https://app.quayer.com/login` | `200` |
| `n8n` | `https://flows.quayer.com/` | `200` |
| `chatwoot` | `https://chat.quayer.com/` | `302` (onboarding redirect) |
| `supabase` | `https://supabase.quayer.com/` | `503` (Kong removido, Caddy retorna 503 — é o estado esperado) |

### Conteúdo do workflow

```yaml
name: Synthetic Monitor

on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    strategy:
      fail-fast: false
      matrix:
        target:
          - { url: "https://homol.quayer.com/api/health", expect: "200", name: "homol-health" }
          - { url: "https://app.quayer.com/api/health",   expect: "200", name: "prod-health" }
          - { url: "https://app.quayer.com/login",        expect: "200", name: "prod-login" }
          - { url: "https://flows.quayer.com/",           expect: "200", name: "n8n" }
          - { url: "https://chat.quayer.com/",            expect: "302", name: "chatwoot" }
          - { url: "https://supabase.quayer.com/",        expect: "503", name: "supabase" }
    steps:
      - name: Check ${{ matrix.target.name }}
        id: check
        run: |
          set +e
          RESPONSE=$(curl -sI -o /dev/null \
            -w "%{http_code},%{time_total}" \
            --max-time 15 \
            -A "QuayerSyntheticMonitor/1.0 (+github-actions)" \
            "${{ matrix.target.url }}")
          CURL_EXIT=$?
          set -e

          STATUS=$(echo "$RESPONSE" | cut -d, -f1)
          TIME=$(echo "$RESPONSE" | cut -d, -f2)
          echo "status=$STATUS" >> "$GITHUB_OUTPUT"
          echo "time=$TIME"     >> "$GITHUB_OUTPUT"
          echo "name=${{ matrix.target.name }}" >> "$GITHUB_OUTPUT"
          echo "url=${{ matrix.target.url }}"   >> "$GITHUB_OUTPUT"
          echo "expect=${{ matrix.target.expect }}" >> "$GITHUB_OUTPUT"

          if [ "$CURL_EXIT" -ne 0 ]; then
            echo "::error::${{ matrix.target.name }} curl failed (exit=$CURL_EXIT)"
            exit 1
          fi
          if [ "$STATUS" != "${{ matrix.target.expect }}" ]; then
            echo "::error::${{ matrix.target.name }} returned $STATUS (expected ${{ matrix.target.expect }}), time=${TIME}s"
            exit 1
          fi
          echo "::notice::${{ matrix.target.name }} OK ($STATUS in ${TIME}s)"

      - name: Write log line
        if: always()
        run: |
          mkdir -p monitor-logs
          echo "$(date -u +%FT%TZ),${{ matrix.target.name }},${{ steps.check.outputs.status }},${{ steps.check.outputs.time }},${{ job.status }}" \
            > "monitor-logs/${{ matrix.target.name }}.csv"

      - name: Upload log
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: monitor-log-${{ matrix.target.name }}-${{ github.run_id }}
          path: monitor-logs/
          retention-days: 7

      - name: Alert on failure
        if: failure()
        env:
          WEBHOOK: ${{ secrets.DISCORD_WEBHOOK_URL }}
        run: |
          if [ -z "$WEBHOOK" ]; then
            echo "::warning::DISCORD_WEBHOOK_URL not configured — skipping alert"
            exit 0
          fi
          PAYLOAD=$(cat <<EOF
          {
            "content": ":rotating_light: **Synthetic Monitor FAIL**\nTarget: \`${{ matrix.target.name }}\`\nURL: ${{ matrix.target.url }}\nExpected: ${{ matrix.target.expect }}\nGot: ${{ steps.check.outputs.status }} (time=${{ steps.check.outputs.time }}s)\nRun: https://github.com/${{ github.repository }}/actions/runs/${{ github.run_id }}"
          }
          EOF
          )
          curl -sS -X POST -H "Content-Type: application/json" \
            -d "$PAYLOAD" "$WEBHOOK" || echo "::warning::Webhook POST failed"
```

---

## 5. Upgrade path — Checkly

Quando o volume justificar (ou quando precisar de checks visuais / Playwright multi-step):

1. Criar conta em https://checklyhq.com (free tier = 10.000 runs/mês).
2. Criar 1 check por URL da tabela seção 4.
3. Importar via [Checkly CLI](https://www.checklyhq.com/docs/cli/) usando os mesmos targets.
4. Migrar alert destination para o mesmo webhook Discord.
5. Desativar (ou manter como fallback) o workflow do GitHub Actions.

Alternativas equivalentes: **Better Stack**, **UptimeRobot** (free 50 monitors, 5 min), **Grafana Cloud Synthetic Monitoring**.

---

## 6. Dashboard / visibilidade

- **Hoje:** GitHub → Actions → `Synthetic Monitor` (histórico de runs, logs por target, artifacts de 7 dias).
- **Futuro:** Dashboard Checkly com SLO/latency trend.
- **Agregação adicional (opcional):** enviar log CSV para Supabase ou Grafana Cloud para histórico de longo prazo.

---

## 7. Budget de erro e política de alerta

- **3 falhas consecutivas** em 15 min disparam alerta (MVP atual alerta a cada falha individual — melhoria futura é usar cache entre runs).
- Destination inicial: webhook Discord no canal `#alerts-infra`.
- **Escalation:** se alerta não for reconhecido em 30 min, enviar email para o founder (a implementar — depende de configurar SMTP ou integração).
- Alertas durante janela de deploy devem ser silenciados manualmente (pausar workflow via `workflow_dispatch` toggle ou desabilitar temporariamente).

---

## 8. Runbook por tipo de falha

| Sintoma | Cenário provável | Runbook |
|---|---|---|
| URL retorna 5xx sustentado | App caiu ou DB desconectado | `ROLLBACK_RUNBOOK.md` — cenário A |
| URL não responde (timeout) | Container travado ou edge caiu | `ROLLBACK_RUNBOOK.md` — cenário D |
| SSL handshake erro | Certificado expirado / Caddy sem renovar | `ROLLBACK_RUNBOOK.md` — cenário G ou H |
| Resposta OK mas `/api/health` retorna `{"status":"unhealthy"}` | Dependência downstream (DB/Redis) caída | investigar logs e seguir cenário A |

---

## 9. Secrets necessários

| Secret | Obrigatório? | Efeito se ausente |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | Não (mas recomendado) | Workflow ainda roda e falha o job quando check falhar, mas não envia notificação — apenas `::warning::` no log |

Para configurar: **GitHub → Settings → Secrets and variables → Actions → New repository secret**.

---

## 10. Limitações conhecidas do MVP

- GitHub Actions cron não garante precisão absoluta de 5 min (pode atrasar sob alta carga da plataforma GitHub).
- Sem dedup de alerta — 6 targets falhando = 6 mensagens no Discord.
- Sem histórico agregado além dos últimos 7 dias (artifact retention).
- Não valida corpo JSON de `/api/health` (só status code). Próxima iteração: usar `curl -s` + `jq` pra parsear `{"status":"healthy"}`.
