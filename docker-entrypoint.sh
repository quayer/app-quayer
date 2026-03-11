#!/bin/sh
set -e

echo "🚀 Starting Quayer Application..."

# Run database migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
    echo "📦 Running database migrations..."
    node ./prisma/migrate.js || {
        echo "⚠️ Migration failed, but continuing startup"
    }
    echo "✅ Migrations complete!"

    echo "👤 Ensuring admin user exists..."
    node ./prisma/create-admin.js || {
        echo "⚠️ Admin seed failed, but continuing startup"
    }
fi

# Start the application
echo "🌐 Starting Next.js server..."
exec node server.js
