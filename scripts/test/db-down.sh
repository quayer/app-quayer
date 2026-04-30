#!/usr/bin/env bash
set -euo pipefail

# US-106A — Tear down the integration test postgres and wipe its volume.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

docker compose -f compose.test.yml down -v
