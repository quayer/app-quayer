#!/usr/bin/env bash
set -euo pipefail

# US-106A — Bring up the integration test postgres, run migrations, seed.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

echo "[db-up] Starting compose.test.yml..."
docker compose -f compose.test.yml up -d

echo "[db-up] Waiting for quayer-test-postgres to become healthy..."
ATTEMPTS=0
MAX_ATTEMPTS=30
until [ "$(docker inspect quayer-test-postgres --format='{{.State.Health.Status}}' 2>/dev/null || echo starting)" = "healthy" ]; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "[db-up] ERROR: postgres did not become healthy in ${MAX_ATTEMPTS}s" >&2
    docker inspect quayer-test-postgres --format='{{json .State.Health}}' >&2 || true
    exit 1
  fi
  sleep 1
done
echo "[db-up] Postgres is healthy."

export TEST_DATABASE_URL="postgresql://quayer_test:quayer_test@localhost:5433/quayer_test?schema=public"

echo "[db-up] Running prisma migrate deploy..."
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy

echo "[db-up] Seeding auth fixtures..."
DATABASE_URL="$TEST_DATABASE_URL" npx tsx prisma/seeds/test/auth-seed.ts

echo "[db-up] Done."
echo "TEST_DATABASE_URL=$TEST_DATABASE_URL"
