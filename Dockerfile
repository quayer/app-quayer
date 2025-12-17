# ==================================
# 🐳 QUAYER - DOCKERFILE MULTI-STAGE
# ==================================
# Otimizado para produção com Next.js 15 + Igniter.js
# Imagem final: ~200-300MB
#
# OTIMIZAÇÕES DE CACHE:
# 1. Prisma schema copiado ANTES de npm install
# 2. Código fonte copiado DEPOIS de npm install
# 3. Layers ordenadas por frequência de mudança

# ==================================
# STAGE 1: Dependencies (Cache Heavy)
# ==================================
FROM node:22-alpine AS deps

LABEL maintainer="contato@quayer.com"
LABEL description="Quayer WhatsApp Multi-Instance Manager"

# Install system dependencies (raramente muda)
RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# 1. Copiar APENAS arquivos de dependência (cache máximo)
COPY package.json package-lock.json* ./

# 2. Copiar Prisma schema ANTES de install (gera client correto)
COPY prisma/schema.prisma ./prisma/

# 3. Instalar dependências de produção
RUN npm install --omit=dev --ignore-scripts --legacy-peer-deps && \
    npm cache clean --force

# ==================================
# STAGE 2: Builder
# ==================================
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# 1. Copiar arquivos de dependência
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# 2. Instalar TODAS as dependências (dev + prod)
RUN npm install --ignore-scripts --legacy-peer-deps

# 3. Gerar Prisma Client (antes de copiar código)
RUN npx prisma generate

# 4. Copiar código fonte (muda frequentemente - por último)
COPY . .

# 5. Configurar ambiente de build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# NEXT_PUBLIC_* variables - embedded no JS bundle
ARG NEXT_PUBLIC_APP_URL=https://app.quayer.com
ARG NEXT_PUBLIC_IGNITER_API_URL=https://app.quayer.com/
ARG NEXT_PUBLIC_IGNITER_API_BASE_PATH=/api/v1

ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_IGNITER_API_URL=$NEXT_PUBLIC_IGNITER_API_URL
ENV NEXT_PUBLIC_IGNITER_API_BASE_PATH=$NEXT_PUBLIC_IGNITER_API_BASE_PATH

# 6. Build Next.js
RUN npm run build

# ==================================
# STAGE 3: Runner (Production)
# ==================================
FROM node:22-alpine AS runner

# Instalar apenas runtime necessário
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    curl \
    tini

WORKDIR /app

# Environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Criar usuário não-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app

# Copiar arquivos necessários do builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Prisma client e schema
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Segurança: rodar como non-root
USER nextjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if(r.statusCode !== 200) throw new Error('Health check failed')})" || exit 1

# Init system para signals corretos
ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "server.js"]
