#!/bin/sh
set -e

echo "🚀 Starting Quayer Application..."

# Run database migrations if DATABASE_URL is set and SKIP_MIGRATIONS is not true
if [ -n "$DATABASE_URL" ] && [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then

    echo "📦 Running database migrations..."
    node ./prisma/migrate.js

    echo "👤 Ensuring admin user exists..."
    node ./prisma/create-admin.js || true

fi

# Start the application
echo "🌐 Starting Next.js server..."
exec node server.js
