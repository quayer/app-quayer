#!/bin/sh
set -e

echo "🚀 Starting Quayer Application..."

# Run database migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then

    echo "📦 Running database migrations..."
    # migrate.js applies incremental SQL migrations from prisma/migrations/.
    # On a fresh database it may fail (ALTER TABLE on non-existent tables) —
    # that is expected: the deploy step will run 'prisma db push' afterwards
    # to create the initial schema, and subsequent deploys will succeed.
    node ./prisma/migrate.js || {
        echo "⚠️ Migrations failed (likely fresh DB — schema will be created by deploy step)"
    }

    echo "👤 Ensuring admin user exists..."
    node ./prisma/create-admin.js || {
        echo "⚠️ Admin seed step failed (non-critical). Check logs above."
    }
fi

# Start the application
echo "🌐 Starting Next.js server..."
exec node server.js
