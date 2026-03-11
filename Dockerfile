# ==================================
# 🐳 QUAYER - DOCKERFILE MULTI-STAGE
# ==================================
# Otimizado para produção com Next.js 15 + Igniter.js
# Imagem final: ~200-300MB

# ==================================
# STAGE 1: Dependencies
# ==================================
FROM node:22-alpine AS deps

# Metadata
LABEL maintainer="contato@quayer.com"
LABEL description="Quayer WhatsApp Multi-Instance Manager"
LABEL version="1.0.0"

# Install OpenSSL for Prisma
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (BuildKit cache mount persists across docker system prune)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production --ignore-scripts --legacy-peer-deps

# ==================================
# STAGE 2: Builder
# ==================================
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install ALL dependencies (BuildKit cache mount persists across docker system prune)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --ignore-scripts --legacy-peer-deps

# Copy application code
COPY . .

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Generate Prisma Client
RUN npx prisma generate

# Set environment for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time public env vars (baked into client bundle by Next.js)
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_IGNITER_API_URL
ARG NEXT_PUBLIC_IGNITER_API_BASE_PATH=/api/v1
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_IGNITER_API_URL=${NEXT_PUBLIC_IGNITER_API_URL}
ENV NEXT_PUBLIC_IGNITER_API_BASE_PATH=${NEXT_PUBLIC_IGNITER_API_BASE_PATH}

# Build Next.js application
# This will create .next/standalone for optimal production bundle
RUN npm run build

# ==================================
# STAGE 3: Runner (Production)
# ==================================
FROM node:22-alpine AS runner

RUN apk add --no-cache \
    libc6-compat \
    openssl \
    curl \
    tini

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app

# Copy necessary files from builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Copy standalone output (optimized by Next.js)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma client and CLI (required for database access and migrations)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma

# Copy pg and all sub-dependencies (required by prisma/migrate.js at runtime)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg ./node_modules/pg
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pg-protocol ./node_modules/pg-protocol

# Copy prisma schema (for migrations if needed)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy entrypoint script (runs migrations before starting app)
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if(r.statusCode !== 200) throw new Error('Health check failed')})" || exit 1

# Use tini as init system (handles signals properly)
ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
