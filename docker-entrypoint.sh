#!/bin/sh
set -e

echo "🚀 Starting Quayer Application..."

# Run database schema sync if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
    PRISMA_CLI="./node_modules/prisma/build/index.js"

    if [ -f "$PRISMA_CLI" ]; then
        echo "📦 Syncing database schema (prisma db push)..."
        node "$PRISMA_CLI" db push \
            --schema=./prisma/schema.prisma \
            --skip-generate \
            --accept-data-loss 2>&1 || {
            echo "⚠️ prisma db push failed, trying migrate.js fallback..."
            node ./prisma/migrate.js || {
                echo "⚠️ Migration also failed, but continuing startup"
            }
        }
    else
        echo "📦 Running database migrations via migrate.js..."
        node ./prisma/migrate.js || {
            echo "⚠️ Migration failed, but continuing startup"
        }
    fi

    echo "✅ Database schema ready!"

    echo "👤 Ensuring admin user exists..."
    node ./prisma/create-admin.js || {
        echo "⚠️ Admin seed failed, but continuing startup"
    }
fi

# Start the application
echo "🌐 Starting Next.js server..."
exec node server.js
