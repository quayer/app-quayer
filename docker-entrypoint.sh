#!/bin/sh
set -e

echo "🚀 Starting Quayer Application..."

# Run database migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
    echo "📦 Running database migrations..."
    npx prisma migrate deploy --schema=./prisma/schema.prisma || {
        echo "⚠️ Migration failed, but continuing startup (might already be up to date)"
    }
    echo "✅ Migrations complete!"
fi

# Start the application
echo "🌐 Starting Next.js server..."
exec node server.js
