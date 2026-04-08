#!/usr/bin/env bash
# capture-auth-baselines.sh
# Mede latencia HTTP dos endpoints de auth de producao Quayer e emite
# tabela markdown com percentis p50/p95/p99 de TTFB.
#
# Uso:
#   bash scripts/infra/capture-auth-baselines.sh
#   SAMPLES=20 DELAY=0.3 bash scripts/infra/capture-auth-baselines.sh
#
# Flags:
#   -h, --help    mostra esta ajuda e sai
#
# Requisitos: curl, awk, sort
#
# Output: imprime bloco markdown em stdout + salva CSVs em /tmp/quayer-auth-baselines/.
# Baseado em scripts/infra/capture-baselines.sh mas com 4 URLs de auth
# e 10 samples (loop de dev mais rapido).
set -euo pipefail

case "${1:-}" in
  -h|--help)
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
esac

URLS=(
  "https://app.quayer.com/login|200"
  "https://app.quayer.com/signup|200"
  "https://app.quayer.com/login/verify|200"
  "https://app.quayer.com/signup/verify|200"
)

SAMPLES="${SAMPLES:-10}"
DELAY="${DELAY:-0.5}"
OUTDIR="${OUTDIR:-/tmp/quayer-auth-baselines}"
mkdir -p "$OUTDIR"

# Percentil p<N> de uma lista ordenada (awk)
pct() {
  local f=$1 p=$2
  awk -v p="$p" '
    { a[NR]=$1 }
    END {
      if (NR==0) { print "NaN"; exit }
      idx = int((p/100) * NR + 0.9999)
      if (idx < 1) idx = 1
      if (idx > NR) idx = NR
      printf "%.0f\n", a[idx]*1000
    }
  ' "$f"
}

fmt_ms() { printf "%sms" "$1"; }

echo "# Capturing auth baselines ($SAMPLES samples, ${DELAY}s delay)" >&2
echo "# $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >&2
echo >&2

MD_TABLE="| Endpoint | Status observado | p50 TTFB | p95 TTFB | p99 TTFB | Success | Source |
|---|---|---|---|---|---|---|"

for entry in "${URLS[@]}"; do
  url="${entry%|*}"
  expected="${entry#*|}"
  slug=$(echo "$url" | sed 's|https\?://||; s|/|_|g')
  csv="$OUTDIR/${slug}.csv"
  : > "$csv"

  echo "[*] $url (expect $expected)" >&2
  ok=0
  last_code="000"
  for i in $(seq 1 "$SAMPLES"); do
    line=$(curl -sI -o /dev/null -w "%{http_code},%{time_namelookup},%{time_connect},%{time_appconnect},%{time_starttransfer},%{time_total}" --max-time 15 "$url" || echo "000,0,0,0,0,0")
    echo "$line" >> "$csv"
    code="${line%%,*}"
    last_code="$code"
    if [ "$code" = "$expected" ]; then ok=$((ok+1)); fi
    sleep "$DELAY"
  done

  awk -F, '{print $5}' "$csv" | sort -n > "$OUTDIR/${slug}.ttfb.sorted"

  p50=$(pct "$OUTDIR/${slug}.ttfb.sorted" 50)
  p95=$(pct "$OUTDIR/${slug}.ttfb.sorted" 95)
  p99=$(pct "$OUTDIR/${slug}.ttfb.sorted" 99)

  # Status dominante observado (ultima amostra como proxy)
  status_obs="$last_code"
  success=$(awk -v ok="$ok" -v n="$SAMPLES" 'BEGIN{printf "%.0f%%", (ok/n)*100}')

  MD_TABLE+="
| ${url} | ${status_obs} | $(fmt_ms $p50) | $(fmt_ms $p95) | $(fmt_ms $p99) | ${success} | curl |"
done

echo
echo "## Resultado (copie para docs/auth/BASELINES.md)"
echo
echo "$MD_TABLE"
echo
echo "Timestamp (UTC): $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "CSVs salvos em: $OUTDIR"
