#!/bin/sh
set -e

# Entrypoint do serviço `app` (Next server). Os workers BullMQ NÃO sobem aqui:
# rodam no serviço `worker` do compose (mesma imagem, command sobrescrito para
# `node workers/start-workers.js`). Este entrypoint roda migrations + server.js;
# o worker apenas consome filas. Nenhuma mudança de código necessária aqui.
echo "🚀 Starting Quayer Application..."

# Run database migrations if DATABASE_URL is set and SKIP_MIGRATIONS is not true
if [ -n "$DATABASE_URL" ] && [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then

    echo "📦 Running database migrations..."
    node ./prisma/migrate.js

fi

# Start the application
echo "🌐 Starting Next.js server..."
exec node server.js
