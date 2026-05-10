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

# Generate Prisma Client
RUN npx prisma generate

# Set environment for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build-time public env vars (baked into client bundle by Next.js)
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_IGNITER_API_URL
ARG NEXT_PUBLIC_IGNITER_API_BASE_PATH=/api/v1
ARG NEXT_PUBLIC_SIGNUP_ENABLED=false
ARG NEXT_PUBLIC_AUTH_V3=off
# SENTRY_BUILD_DISABLED=1 bypassa withSentryConfig no build. Default mantido
# em 1 para builds que ainda usam Turbopack (vercel/next.js#87737 + #88844
# quebram o boot quando @sentry/nextjs é importado sob Turbopack runtime).
# Builds com NEXT_BUILD_FLAGS=--webpack devem passar SENTRY_BUILD_DISABLED=0
# para reativar withSentryConfig (sourcemaps + auto-instrumentação OTel).
ARG SENTRY_BUILD_DISABLED=1
# NEXT_BUILD_FLAGS permite passar flags extras para `next build`. Usado em
# homol com `--webpack` enquanto os bugs de Turbopack acima não são corrigidos
# upstream. Vazio = Turbopack default (Next.js 16).
ARG NEXT_BUILD_FLAGS=
# SENTRY_RELEASE marca os eventos com a versão do código. Setado no CI a
# partir do SHA do commit (deploy-homol/production.yml).
ARG SENTRY_RELEASE=
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_IGNITER_API_URL=${NEXT_PUBLIC_IGNITER_API_URL}
ENV NEXT_PUBLIC_IGNITER_API_BASE_PATH=${NEXT_PUBLIC_IGNITER_API_BASE_PATH}
ENV NEXT_PUBLIC_SIGNUP_ENABLED=${NEXT_PUBLIC_SIGNUP_ENABLED}
ENV NEXT_PUBLIC_AUTH_V3=${NEXT_PUBLIC_AUTH_V3}
ENV SENTRY_BUILD_DISABLED=${SENTRY_BUILD_DISABLED}
ENV SENTRY_RELEASE=${SENTRY_RELEASE}

# Build Next.js application
# This will create .next/standalone for optimal production bundle.
# `next build $NEXT_BUILD_FLAGS` permite opt-out de Turbopack via --webpack.
RUN npx next build ${NEXT_BUILD_FLAGS}

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

# Copy Prisma client runtime (prisma CLI removed — migrate.js uses pg directly)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Sentry OTel instrumentation hooks. O tracer do Next.js 16 + Turbopack tem
# regressão (vercel/next.js#88844): além de omitir os pacotes import-in-the-middle
# e require-in-the-middle do .next/standalone/node_modules, ele também os
# referencia *com hash sufixado* nos chunks (ex.: `import-in-the-middle-8c7f9689dc1aad0b`).
# Em runtime o `require` falha porque o nome com hash não existe no node_modules.
#
# Workaround:
#   1. Copia os pacotes reais (sem hash).
#   2. Lê os chunks já buildados em /app/.next/server/chunks e cria symlinks
#      dos nomes hashados apontando para o pacote canônico.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/import-in-the-middle ./node_modules/import-in-the-middle
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/require-in-the-middle ./node_modules/require-in-the-middle

USER root
RUN set -e; \
    cd /app/node_modules; \
    for pkg in import-in-the-middle require-in-the-middle; do \
      grep -rohE "${pkg}-[a-f0-9]+" /app/.next/server/chunks 2>/dev/null \
        | sort -u \
        | while read -r hashed; do \
            [ -e "$hashed" ] && continue; \
            ln -sf "$pkg" "$hashed"; \
            echo "[sentry-shim] linked $hashed -> $pkg"; \
          done; \
    done; \
    chown -h -R nextjs:nodejs /app/node_modules/import-in-the-middle* /app/node_modules/require-in-the-middle*
USER nextjs

# Install pg fresh in runner stage — resolves all transitive deps correctly
# (migrate.js uses pg directly and needs the full dependency tree)
USER root
RUN npm install --omit=dev --ignore-scripts --no-save --legacy-peer-deps --prefix /app pg@8 \
    && chown -R nextjs:nodejs /app/node_modules/pg /app/node_modules/pg-* /app/node_modules/postgres-* /app/node_modules/xtend /app/node_modules/pg-int8 /app/node_modules/split2 2>/dev/null || true
USER nextjs

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
