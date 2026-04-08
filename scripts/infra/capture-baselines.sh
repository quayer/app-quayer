#!/usr/bin/env bash
# capture-baselines.sh
# Mede latência HTTP de endpoints de produção Quayer e emite markdown com percentis.
#
# Uso:
#   bash scripts/infra/capture-baselines.sh
#   SAMPLES=100 DELAY=1 bash scripts/infra/capture-baselines.sh
#
# Requisitos: curl, awk, sort
#
# Output: imprime bloco markdown em stdout + salva CSVs em /tmp/quayer-baselines/
set -euo pipefail

URLS=(
  "https://homol.quayer.com/api/health|200"
  "https://app.quayer.com/api/health|200"
  "https://app.quayer.com/login|200"
  "https://flows.quayer.com/|200"
  "https://chat.quayer.com/|302"
  "https://supabase.quayer.com/|503"
)

SAMPLES="${SAMPLES:-50}"
DELAY="${DELAY:-0.5}"
OUTDIR="${OUTDIR:-/tmp/quayer-baselines}"
mkdir -p "$OUTDIR"

# Percentil p<N> de uma lista ordenada (awk)
pct() {
  # $1 = arquivo com valores (um por linha, já ordenados), $2 = percentil (ex 50, 95)
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

echo "# Capturing baselines ($SAMPLES samples, ${DELAY}s delay)"
echo "# $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo

# Cabeçalho markdown
MD_TABLE="| Endpoint | Expected | p50 TTFB | p95 TTFB | p50 Total | p95 Total | p99 Total | Max | Success |
|---|---|---|---|---|---|---|---|---|"

for entry in "${URLS[@]}"; do
  url="${entry%|*}"
  expected="${entry#*|}"
  slug=$(echo "$url" | sed 's|https\?://||; s|/|_|g')
  csv="$OUTDIR/${slug}.csv"
  : > "$csv"

  echo "[*] $url (expect $expected)" >&2
  ok=0
  for i in $(seq 1 "$SAMPLES"); do
    line=$(curl -sI -o /dev/null -w "%{http_code},%{time_namelookup},%{time_connect},%{time_appconnect},%{time_starttransfer},%{time_total}" --max-time 15 "$url" || echo "000,0,0,0,0,0")
    echo "$line" >> "$csv"
    code="${line%%,*}"
    if [ "$code" = "$expected" ]; then ok=$((ok+1)); fi
    sleep "$DELAY"
  done

  # Extrai colunas para sort
  awk -F, '{print $5}' "$csv" | sort -n > "$OUTDIR/${slug}.ttfb.sorted"
  awk -F, '{print $6}' "$csv" | sort -n > "$OUTDIR/${slug}.total.sorted"

  p50_ttfb=$(pct "$OUTDIR/${slug}.ttfb.sorted" 50)
  p95_ttfb=$(pct "$OUTDIR/${slug}.ttfb.sorted" 95)
  p50_tot=$(pct "$OUTDIR/${slug}.total.sorted" 50)
  p95_tot=$(pct "$OUTDIR/${slug}.total.sorted" 95)
  p99_tot=$(pct "$OUTDIR/${slug}.total.sorted" 99)
  max_tot=$(pct "$OUTDIR/${slug}.total.sorted" 100)

  success=$(awk -v ok="$ok" -v n="$SAMPLES" 'BEGIN{printf "%.0f%%", (ok/n)*100}')

  MD_TABLE+="
| ${url} | ${expected} | $(fmt_ms $p50_ttfb) | $(fmt_ms $p95_ttfb) | $(fmt_ms $p50_tot) | $(fmt_ms $p95_tot) | $(fmt_ms $p99_tot) | $(fmt_ms $max_tot) | ${success} |"
done

echo
echo "## Resultado"
echo
echo "$MD_TABLE"
echo
echo "CSVs salvos em: $OUTDIR"
