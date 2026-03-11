#!/bin/sh
set -e

echo "🚀 Starting Quayer Application..."

# Run database migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then

    echo "📦 Running database migrations (prisma migrate deploy)..."
    # migrate.js implements prisma migrate deploy with per-migration transactions.
    # It exits with code 1 on any failure — container will NOT start with a broken schema.
    # DO NOT add "|| true" or similar — a migration failure must stop the container.
    node ./prisma/migrate.js

    echo "✅ Database migrations applied successfully!"

    echo "👤 Ensuring admin user exists..."
    node ./prisma/create-admin.js || {
        # Non-fatal: admin may already exist or email config may not be ready yet.
        echo "⚠️ Admin seed step failed (non-critical). Check logs above."
    }
fi

# Start the application
echo "🌐 Starting Next.js server..."
exec node server.js
