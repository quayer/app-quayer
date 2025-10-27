# 📊 ANÁLISE COMPLETA E SISTEMÁTICA - QUAYER WHATSAPP PLATFORM

**Data:** 15 de outubro de 2025
**Analista:** Lia AI Agent
**Escopo:** Arquitetura Docker, UX/UI, API Integration, Testes E2E

---

## 📑 ÍNDICE

1. [FASE 1: ANÁLISE DE ARQUITETURA](#fase-1-análise-de-arquitetura)
   - [1.1 Mapeamento Docker](#11-mapeamento-docker)
   - [1.2 Arquitetura da Aplicação](#12-arquitetura-da-aplicação)
2. [FASE 2: ANÁLISE CRÍTICA DE UX/UI](#fase-2-análise-crítica-de-uxui)
3. [FASE 3: TESTES AUTOMATIZADOS PLAYWRIGHT](#fase-3-testes-automatizados-playwright)
4. [FASE 4: INTEGRAÇÃO API UAZAPI](#fase-4-integração-api-uazapi)
5. [FASE 5: AÇÕES MANUAIS NECESSÁRIAS](#fase-5-ações-manuais-necessárias)
6. [FASE 6: APPWRITE VS CODEIGNITER](#fase-6-appwrite-vs-codeigniter)

---

# FASE 1: ANÁLISE DE ARQUITETURA

## 1.1 Mapeamento Docker

### 📦 **docker-compose.yml** (Desenvolvimento)

**Serviços Configurados:**

| Serviço | Imagem | Porta | Volume | Status |
|---------|--------|-------|--------|--------|
| **Redis** | `redis:7-alpine` | 6379 | `redis_data:/data` | ✅ Configurado |
| **PostgreSQL** | `postgres:16-alpine` | 5432 | `postgres_data:/var/lib/postgresql/data` | ✅ Configurado |

**Variáveis de Ambiente (PostgreSQL):**
```yaml
POSTGRES_DB: ${DB_NAME}        # docker
POSTGRES_USER: ${DB_USER}      # docker
POSTGRES_PASSWORD: ${DB_PASSWORD} # docker
```

**Variáveis de Ambiente (Redis):**
```yaml
REDIS_PASSWORD:  # Vazio (sem senha)
```

**Volumes Nomeados:**
- `redis_data` - Persiste cache e sessões
- `postgres_data` - Persiste banco de dados

**⚠️ PROBLEMAS IDENTIFICADOS:**

1. **Sem Health Checks**
   - Redis e PostgreSQL não têm health checks configurados
   - Aplicação pode tentar conectar antes dos serviços estarem prontos
   - **Impacto:** Erros intermitentes no início

2. **Sem Restart Policy**
   - Nenhum serviço tem `restart: always`
   - **Impacto:** Serviços não reiniciam automaticamente após crash

3. **Sem Networking Customizado**
   - Usando rede padrão do Docker
   - **Impacto:** Menos controle sobre comunicação entre containers

4. **Redis Sem Senha**
   - Vulnerabilidade de segurança
   - **Impacto:** Acesso não autorizado se porta for exposta

**🔧 CORREÇÃO RECOMENDADA:**

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    container_name: quayer-redis-dev
    restart: unless-stopped
    ports:
      - "6379:6379"
    environment:
      REDIS_PASSWORD: dev_redis_password_change_me
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - quayer-dev

  postgres:
    image: postgres:16-alpine
    container_name: quayer-postgres-dev
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: ${DB_NAME:-docker}
      POSTGRES_USER: ${DB_USER:-docker}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-docker}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-docker}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - quayer-dev

volumes:
  redis_data:
  postgres_data:

networks:
  quayer-dev:
    driver: bridge
```

---

### 🚀 **docker-compose.prod.yml** (Produção)

**Stack Completa - 3 Serviços:**

#### 1. **Serviço: app** (Aplicação Next.js)

```yaml
Imagem: quayer-app:latest (multi-stage build)
Container: quayer-app
Porta: 3000
Restart: always
Health Check: ✅ /api/health
Dependências: postgres (healthy) + redis (healthy)
Logging: json-file (max 10MB, 3 arquivos)
```

**Variáveis de Ambiente (38 variáveis):**
```bash
# Application
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}

# Database
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}

# Redis
REDIS_URL=redis://redis:6379
REDIS_HOST=redis
REDIS_PORT=6379

# Auth
JWT_SECRET=${JWT_SECRET}
IGNITER_APP_SECRET=${IGNITER_APP_SECRET}

# Igniter.js
IGNITER_APP_NAME=quayer
NEXT_PUBLIC_IGNITER_API_URL=${NEXT_PUBLIC_APP_URL}/
NEXT_PUBLIC_IGNITER_API_BASE_PATH=/api/v1
IGNITER_JOBS_QUEUE_PREFIX=igniter
IGNITER_LOG_LEVEL=info

# Email
EMAIL_PROVIDER=${EMAIL_PROVIDER:-mock}
EMAIL_FROM=${EMAIL_FROM}
RESEND_API_KEY=${RESEND_API_KEY}

# WhatsApp (UAZapi)
UAZAPI_URL=${UAZAPI_URL}
UAZAPI_ADMIN_TOKEN=${UAZAPI_ADMIN_TOKEN}
UAZAPI_TOKEN=${UAZAPI_TOKEN}

# Rate Limiting (Upstash)
UPSTASH_REDIS_REST_URL=${UPSTASH_REDIS_REST_URL}
UPSTASH_REDIS_REST_TOKEN=${UPSTASH_REDIS_REST_TOKEN}

# Monitoring (Sentry)
SENTRY_DSN=${SENTRY_DSN}
LOG_LEVEL=info
```

**Depends On com Condições:**
```yaml
depends_on:
  postgres:
    condition: service_healthy  # ✅ Aguarda PostgreSQL estar saudável
  redis:
    condition: service_healthy  # ✅ Aguarda Redis estar saudável
```

**Health Check:**
```yaml
healthcheck:
  test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/health')"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s  # Aguarda 40s antes de iniciar checks
```

#### 2. **Serviço: postgres** (Banco de Dados)

```yaml
Imagem: postgres:15-alpine
Container: quayer-postgres
Porta: 5432
Restart: always
Health Check: ✅ pg_isready
Volume: postgres_data (named volume)
```

**Configurações de Performance (PostgreSQL):**
```bash
shared_buffers=256MB           # Buffer de memória compartilhada
max_connections=200            # Máximo de conexões simultâneas
effective_cache_size=1GB       # Cache disponível para o SO
maintenance_work_mem=64MB      # Memória para operações de manutenção
checkpoint_completion_target=0.9
wal_buffers=16MB
default_statistics_target=100
random_page_cost=1.1          # Otimizado para SSD
effective_io_concurrency=200  # Operações I/O simultâneas
work_mem=2621kB               # Memória por operação de sort
min_wal_size=1GB              # Tamanho mínimo do WAL
max_wal_size=4GB              # Tamanho máximo do WAL
```

**Health Check:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-docker}"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 10s
```

#### 3. **Serviço: redis** (Cache & Job Queue)

```yaml
Imagem: redis:7-alpine
Container: quayer-redis
Porta: 6379
Restart: always
Health Check: ✅ redis-cli ping
Volume: redis_data (named volume)
```

**Configurações de Performance (Redis):**
```bash
maxmemory 256mb               # Limite de memória
maxmemory-policy allkeys-lru  # Política de eviction (LRU em todas as chaves)
save 60 1000                  # Snapshot: salvar se 1000 mudanças em 60s
appendonly yes                # Habilitar AOF (append-only file)
appendfsync everysec          # Sincronizar AOF a cada segundo
```

**Health Check:**
```yaml
healthcheck:
  test: ["CMD", "redis-cli", "ping"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 5s
```

---

### 🐳 **Dockerfile** (Multi-Stage Build)

**3 Estágios de Build:**

#### **STAGE 1: Dependencies** (`deps`)
```dockerfile
FROM node:22-alpine AS deps

# Instalar dependências de sistema
RUN apk add --no-cache libc6-compat openssl

# Copiar package files
COPY package.json package-lock.json* ./

# Instalar APENAS dependências de produção
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force
```

**Tamanho esperado:** ~100-150MB

#### **STAGE 2: Builder** (`builder`)
```dockerfile
FROM node:22-alpine AS builder

# Instalar dependências de sistema
RUN apk add --no-cache libc6-compat openssl

# Instalar TODAS as dependências (dev + prod)
RUN npm ci --ignore-scripts

# Copiar código da aplicação
COPY . .

# Copiar deps de produção do stage anterior
COPY --from=deps /app/node_modules ./node_modules

# Gerar Prisma Client
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build
```

**Tamanho esperado:** ~800MB-1.2GB (descartado após build)

#### **STAGE 3: Runner** (Produção Final)
```dockerfile
FROM node:22-alpine AS runner

# Instalar ferramentas necessárias
RUN apk add --no-cache \
    libc6-compat \
    openssl \
    curl \
    tini  # Init system para lidar com sinais corretamente

# Criar usuário não-root (segurança)
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app

# Copiar arquivos necessários do builder
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Executar como usuário não-root
USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {if(r.statusCode !== 200) throw new Error('Health check failed')})" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
```

**Tamanho final:** ~200-300MB ✅ (excelente otimização)

---

### 📊 **Análise de Segurança Docker**

| Aspecto | Desenvolvimento | Produção | Status |
|---------|----------------|----------|--------|
| **Usuário não-root** | ❌ Root | ✅ nextjs (UID 1001) | Produção OK |
| **Secrets Management** | ⚠️ .env file | ⚠️ .env file | Melhorar ambos |
| **Health Checks** | ❌ Nenhum | ✅ Todos | Adicionar em dev |
| **Restart Policy** | ❌ Nenhum | ✅ always | Adicionar em dev |
| **Network Isolation** | ❌ Default | ✅ quayer-network | Adicionar em dev |
| **Redis Password** | ❌ Sem senha | ❌ Sem senha | ⚠️ CRÍTICO |
| **Resource Limits** | ❌ Ilimitado | ❌ Ilimitado | Adicionar |
| **Logging** | ❌ Docker default | ✅ Structured | OK |

**🚨 VULNERABILIDADES CRÍTICAS:**

1. **Redis sem autenticação em produção** - SEVERIDADE: ALTA
2. **Secrets em variáveis de ambiente** - SEVERIDADE: MÉDIA
3. **Sem limites de recursos** - SEVERIDADE: BAIXA

**🔒 RECOMENDAÇÕES DE SEGURANÇA:**

```yaml
# docker-compose.prod.yml - Melhorias de Segurança

services:
  app:
    # ... configuração existente ...
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
    read_only: true  # Filesystem read-only
    tmpfs:
      - /tmp
      - /app/.next/cache
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE
    security_opt:
      - no-new-privileges:true

  postgres:
    # ... configuração existente ...
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
    read_only: true
    tmpfs:
      - /tmp
      - /var/run/postgresql

  redis:
    # ... configuração existente ...
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}  # ← ADICIONAR SENHA
      --maxmemory 256mb
      --maxmemory-policy allkeys-lru
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
```

---

### 🗂️ **.dockerignore** (Otimização de Build)

**Categorias Excluídas:**

```
✅ Dependencies (node_modules) - Instalado durante build
✅ Git & VCS (.git, .github)
✅ Environment files (.env*) - Passado via variáveis
✅ Build artifacts (.next, dist, out)
✅ Testing (test/, *.spec.ts, coverage)
✅ Documentation (docs/, *.md)
✅ IDE configs (.vscode, .idea)
✅ Docker files (Dockerfile, docker-compose*)
✅ Logs (*.log, logs/)
✅ Database files (*.db, prisma/migrations/)
```

**Impacto:**
- Reduz contexto de build de ~2GB para ~50MB
- Build ~10x mais rápido
- Menor uso de disco

---

### 📈 **Volumes e Persistência de Dados**

#### **Desenvolvimento:**

| Volume | Tipo | Tamanho Esperado | Backup |
|--------|------|------------------|--------|
| `redis_data` | Named Volume | ~100MB | ❌ Não configurado |
| `postgres_data` | Named Volume | ~1-5GB | ❌ Não configurado |

**Localização física:**
```bash
# Windows (Docker Desktop)
\\wsl$\docker-desktop-data\data\docker\volumes\
```

#### **Produção:**

| Volume | Nome | Tipo | Tamanho Esperado | Backup |
|--------|------|------|------------------|--------|
| `postgres_data` | `quayer-postgres-data` | Local Driver | ~5-50GB | ⚠️ Recomendado |
| `redis_data` | `quayer-redis-data` | Local Driver | ~100-500MB | ⚠️ Recomendado |

**🔄 ESTRATÉGIA DE BACKUP RECOMENDADA:**

```yaml
# Adicionar serviço de backup
services:
  backup:
    image: postgres:15-alpine
    container_name: quayer-backup
    volumes:
      - postgres_data:/var/lib/postgresql/data:ro
      - ./backups:/backups
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    command: >
      sh -c "
        while true; do
          pg_dump -U ${DB_USER} -h postgres -d ${DB_NAME} > /backups/backup_$$(date +%Y%m%d_%H%M%S).sql
          find /backups -name 'backup_*.sql' -mtime +7 -delete
          sleep 86400
        done
      "
    networks:
      - quayer-network
    restart: unless-stopped
```

---

### 🌐 **Networks e Comunicação**

#### **Desenvolvimento:**
```yaml
# Usa rede padrão do Docker (bridge)
# Containers se comunicam via nome do serviço
- redis -> redis:6379
- postgres -> postgres:5432
```

#### **Produção:**
```yaml
networks:
  quayer-network:
    driver: bridge
    name: quayer-network

# Comunicação interna:
- app -> postgres:5432 (via quayer-network)
- app -> redis:6379 (via quayer-network)

# Acesso externo:
- app:3000 (mapeado para host)
- postgres:5432 (mapeado para host) ⚠️ EXPOSTO
- redis:6379 (mapeado para host) ⚠️ EXPOSTO
```

**🚨 PROBLEMA DE SEGURANÇA:**

PostgreSQL e Redis estão expostos na rede do host em produção!

**🔒 CORREÇÃO:**

```yaml
# Remover mapeamento de portas em produção
services:
  postgres:
    # ports:  # ← REMOVER ESTA LINHA
    #   - "5432:5432"
    # Apenas app interno precisa acessar

  redis:
    # ports:  # ← REMOVER ESTA LINHA
    #   - "6379:6379"
    # Apenas app interno precisa acessar
```

---

## 1.2 Arquitetura da Aplicação

### 📁 Estrutura de Pastas Completa

```
app-quayer/
├── 📂 .cursor/                    # Regras e configurações do Claude
│   ├── mcp.json                   # MCP Server config
│   └── rules/                     # 23 arquivos de regras .mdc
│
├── 📂 .github/
│   └── workflows/                 # CI/CD GitHub Actions
│       ├── ci.yml                 # Testes e build
│       ├── cd-staging.yml         # Deploy staging
│       ├── cd-production.yml      # Deploy produção
│       ├── release.yml            # Geração de releases
│       └── tests.yml              # Testes automatizados
│
├── 📂 docs/                       # Documentação do projeto
│   ├── README.md
│   ├── components/                # Docs de componentes
│   ├── guides/                    # Guias de uso
│   ├── implementation/            # Specs de implementação
│   └── archive/                   # Documentação antiga
│       ├── audits/
│       └── sprints/
│
├── 📂 prisma/                     # Prisma ORM
│   ├── schema.prisma              # Schema do banco de dados
│   ├── seed.ts                    # Seed de dados
│   ├── seed-simple.ts
│   └── migrations/                # Migrações do banco
│
├── 📂 public/                     # Assets estáticos
│   ├── logo.svg
│   ├── image-login.svg
│   └── openapi.json               # Spec da API
│
├── 📂 scripts/                    # Scripts utilitários
│   ├── setup.sh                   # Setup inicial
│   ├── test.sh                    # Executar testes
│   ├── deploy.sh                  # Deploy manual
│   ├── backup.sh                  # Backup do banco
│   ├── bump-version.sh            # Versionamento
│   ├── restart-server.bat         # Restart (Windows)
│   └── analyze-test-coverage.ts   # Análise de cobertura
│
├── 📂 src/
│   │
│   ├── 📂 app/                    # Next.js App Router
│   │   │
│   │   ├── 📂 (auth)/             # ✅ Grupo de rotas de autenticação
│   │   │   ├── layout.tsx
│   │   │   ├── login/
│   │   │   │   ├── page.tsx       # /login
│   │   │   │   ├── verify/page.tsx          # /login/verify (OTP)
│   │   │   │   └── verify-magic/page.tsx    # /login/verify-magic (Magic Link)
│   │   │   ├── signup/
│   │   │   │   ├── page.tsx       # /signup
│   │   │   │   ├── verify/page.tsx          # /signup/verify
│   │   │   │   └── verify-magic/page.tsx    # /signup/verify-magic
│   │   │   ├── register/page.tsx            # /register
│   │   │   ├── forgot-password/page.tsx     # /forgot-password
│   │   │   ├── reset-password/[token]/page.tsx  # /reset-password/:token
│   │   │   ├── verify-email/page.tsx        # /verify-email
│   │   │   ├── onboarding/page.tsx          # /onboarding
│   │   │   └── google-callback/page.tsx     # /google-callback
│   │   │
│   │   ├── 📂 (dashboard)/        # ✅ Grupo de rotas com dashboard
│   │   │   └── organizacao/page.tsx         # /organizacao
│   │   │
│   │   ├── 📂 (public)/           # ✅ Grupo de rotas públicas
│   │   │   ├── connect/
│   │   │   │   ├── page.tsx       # /connect
│   │   │   │   └── [token]/page.tsx         # /connect/:token
│   │   │   └── conversas/page.tsx           # /conversas
│   │   │
│   │   ├── 📂 admin/              # 🔴 Área administrativa (ADMIN/GOD)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx           # /admin (Dashboard)
│   │   │   ├── integracoes/page.tsx         # /admin/integracoes
│   │   │   ├── clients/page.tsx             # /admin/clients
│   │   │   ├── organizations/page.tsx       # /admin/organizations
│   │   │   ├── permissions/page.tsx         # /admin/permissions
│   │   │   ├── webhooks/page.tsx            # /admin/webhooks
│   │   │   ├── brokers/page.tsx             # /admin/brokers
│   │   │   └── logs/page.tsx                # /admin/logs
│   │   │
│   │   ├── 📂 integracoes/        # 🟢 Área de integrações (USER/ADMIN)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx           # /integracoes (Lista)
│   │   │   ├── dashboard/page.tsx           # /integracoes/dashboard
│   │   │   ├── conversations/page.tsx       # /integracoes/conversations
│   │   │   ├── settings/page.tsx            # /integracoes/settings
│   │   │   ├── users/page.tsx               # /integracoes/users
│   │   │   ├── admin/
│   │   │   │   └── clients/page.tsx         # /integracoes/admin/clients
│   │   │   └── compartilhar/
│   │   │       └── [token]/page.tsx         # /integracoes/compartilhar/:token
│   │   │
│   │   ├── 📂 user/               # 🟡 Área do usuário comum
│   │   │   └── dashboard/page.tsx           # /user/dashboard
│   │   │
│   │   ├── 📂 api/                # 🔌 API Routes
│   │   │   ├── health/route.ts              # GET /api/health
│   │   │   ├── mcp/[transport]/route.ts     # MCP Server
│   │   │   └── v1/[[...all]]/route.ts       # Igniter.js API (/api/v1/*)
│   │   │
│   │   ├── layout.tsx             # Root layout
│   │   ├── page.tsx               # Homepage (/)
│   │   └── globals.css            # Estilos globais
│   │
│   ├── 📂 components/             # Componentes React
│   │   │
│   │   ├── 📂 ui/                 # shadcn/ui components (43 componentes)
│   │   │   ├── accordion.tsx
│   │   │   ├── alert-dialog.tsx
│   │   │   ├── alert.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── input.tsx
│   │   │   ├── select.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── table.tsx
│   │   │   ├── ... (30+ outros)
│   │   │   └── charts/            # Componentes de gráficos
│   │   │
│   │   ├── 📂 auth/               # Componentes de autenticação
│   │   ├── 📂 custom/             # Componentes customizados
│   │   ├── 📂 integrations/       # Componentes de integrações
│   │   │   ├── IntegrationCard.tsx
│   │   │   └── CreateIntegrationModal.tsx
│   │   ├── 📂 onboarding/         # Componentes de onboarding
│   │   ├── 📂 providers/          # Context providers
│   │   ├── 📂 skeletons/          # Loading skeletons
│   │   ├── 📂 whatsapp/           # Componentes WhatsApp
│   │   │
│   │   ├── app-sidebar.tsx        # Sidebar principal
│   │   ├── error-boundary.tsx     # Error boundary
│   │   ├── login-form.tsx         # Formulário de login
│   │   ├── nav-main.tsx           # Navegação principal
│   │   ├── nav-projects.tsx       # Navegação de projetos
│   │   ├── nav-secondary.tsx      # Navegação secundária
│   │   ├── nav-user.tsx           # Menu do usuário
│   │   └── organization-switcher.tsx  # Seletor de organização
│   │
│   ├── 📂 features/               # Features (arquitetura modular)
│   │   │
│   │   ├── 📂 auth/               # ✅ Autenticação
│   │   │   ├── controllers/
│   │   │   │   └── auth.controller.ts
│   │   │   ├── procedures/
│   │   │   │   └── auth.procedure.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── 📂 dashboard/          # Dashboard
│   │   ├── 📂 example/            # Feature de exemplo
│   │   │   ├── controllers/example.controller.ts
│   │   │   ├── example.interfaces.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── 📂 instances/          # ✅ Instâncias WhatsApp
│   │   │   ├── controllers/
│   │   │   │   └── instances.controller.ts  # CRUD, connect, disconnect
│   │   │   ├── procedures/
│   │   │   │   └── instances.procedure.ts
│   │   │   ├── repositories/
│   │   │   │   └── instances.repository.ts  # Data access layer
│   │   │   ├── instances.interfaces.ts      # Types & schemas
│   │   │   ├── instances.schemas.ts         # Zod validation
│   │   │   └── index.ts
│   │   │
│   │   ├── 📂 invitations/        # Convites de organização
│   │   ├── 📂 messages/           # Mensagens WhatsApp
│   │   ├── 📂 onboarding/         # Onboarding de usuários
│   │   ├── 📂 organizations/      # Organizações
│   │   ├── 📂 projects/           # Projetos
│   │   ├── 📂 share/              # Compartilhamento
│   │   └── 📂 webhooks/           # Webhooks
│   │
│   ├── 📂 hooks/                  # React Hooks customizados
│   │   ├── use-mobile.ts
│   │   ├── use-toast.ts
│   │   ├── useInstance.ts
│   │   ├── useOnboarding.ts
│   │   ├── useOrganization.ts
│   │   └── usePermissions.ts
│   │
│   ├── 📂 lib/                    # Bibliotecas e utilitários
│   │   ├── 📂 api/
│   │   │   └── uazapi.service.ts  # Cliente UAZapi
│   │   ├── 📂 auth/               # Utilitários de auth
│   │   ├── 📂 email/              # Envio de emails
│   │   ├── 📂 rate-limit/         # Rate limiting
│   │   ├── 📂 uaz/                # Integração UAZapi
│   │   ├── 📂 validators/         # Validadores Zod
│   │   ├── theme-switcher.ts     # Troca de tema
│   │   └── utils.ts               # Utilitários gerais
│   │
│   ├── 📂 services/               # Serviços globais
│   │   ├── database.ts            # Prisma client
│   │   ├── jobs.ts                # BullMQ job queue
│   │   ├── logger.ts              # Winston logger
│   │   ├── redis.ts               # Redis client
│   │   ├── store.ts               # State management
│   │   └── telemetry.ts           # OpenTelemetry
│   │
│   ├── 📂 styles/                 # Estilos adicionais
│   ├── 📂 types/                  # Type definitions
│   │
│   ├── igniter.ts                 # Igniter.js app instance
│   ├── igniter.client.ts          # Igniter.js client
│   ├── igniter.context.ts         # Context types
│   ├── igniter.router.ts          # Router config
│   ├── igniter.schema.ts          # Global schemas
│   └── middleware.ts              # Next.js middleware
│
├── 📂 test/                       # Testes
│   └── e2e/                       # Testes E2E (Playwright)
│       ├── dashboard-real-data.spec.ts
│       ├── test-integrations-admin.spec.ts
│       └── ... (outros testes)
│
├── 📂 test-screenshots/           # Screenshots dos testes
│
├── .dockerignore
├── .editorconfig
├── .env                           # Variáveis de ambiente
├── .env.example                   # Template de .env
├── .gitignore
├── .nvmrc                         # Node version (22)
├── components.json                # shadcn/ui config
├── docker-compose.yml             # Docker dev
├── docker-compose.prod.yml        # Docker prod
├── Dockerfile                     # Multi-stage build
├── eslint.config.mjs              # ESLint config
├── next.config.ts                 # Next.js config
├── package.json                   # Dependencies
├── playwright.config.ts           # Playwright config
├── postcss.config.mjs             # PostCSS config
├── tailwind.config.ts             # Tailwind CSS config
├── tsconfig.json                  # TypeScript config
├── uazapi-openapi-spec.yaml       # Spec da API UAZapi (11727 linhas)
├── VERSION                        # Versão do projeto
└── vitest.config.ts               # Vitest config

```

**📊 Estatísticas:**

| Categoria | Quantidade |
|-----------|------------|
| **Páginas** | 36 páginas |
| **Layouts** | 4 layouts |
| **Features** | 11 features modulares |
| **Componentes UI** | 43 componentes shadcn/ui |
| **Hooks** | 6 hooks customizados |
| **Services** | 6 serviços globais |
| **API Routes** | 3 grupos de rotas |
| **Workflows CI/CD** | 5 workflows |

---

### 🗺️ Mapeamento de Rotas e Páginas

#### **🔓 ROTAS PÚBLICAS (Sem autenticação)**

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/` | `app/page.tsx` | Homepage / Landing page |
| `/login` | `app/(auth)/login/page.tsx` | Login com email/senha |
| `/login/verify` | `app/(auth)/login/verify/page.tsx` | Verificação OTP (código 6 dígitos) |
| `/login/verify-magic` | `app/(auth)/login/verify-magic/page.tsx` | Verificação Magic Link |
| `/signup` | `app/(auth)/signup/page.tsx` | Cadastro de novo usuário |
| `/signup/verify` | `app/(auth)/signup/verify/page.tsx` | Verificação OTP pós-cadastro |
| `/signup/verify-magic` | `app/(auth)/signup/verify-magic/page.tsx` | Verificação Magic Link pós-cadastro |
| `/register` | `app/(auth)/register/page.tsx` | Registro alternativo |
| `/forgot-password` | `app/(auth)/forgot-password/page.tsx` | Esqueci minha senha |
| `/reset-password/:token` | `app/(auth)/reset-password/[token]/page.tsx` | Reset de senha com token |
| `/verify-email` | `app/(auth)/verify-email/page.tsx` | Verificação de email |
| `/google-callback` | `app/(auth)/google-callback/page.tsx` | Callback OAuth Google |
| `/connect` | `app/(public)/connect/page.tsx` | Conectar instância pública |
| `/connect/:token` | `app/(public)/connect/[token]/page.tsx` | Conectar com token compartilhado |
| `/conversas` | `app/(public)/conversas/page.tsx` | Conversas públicas |
| `/integracoes/compartilhar/:token` | `app/integracoes/compartilhar/[token]/page.tsx` | Compartilhar integração |

**Total:** 16 rotas públicas

---

#### **🔐 ROTAS AUTENTICADAS (Requer login)**

##### **🟢 Área do Usuário (Role: USER, ADMIN, GOD)**

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/onboarding` | `app/(auth)/onboarding/page.tsx` | Onboarding inicial |
| `/organizacao` | `app/(dashboard)/organizacao/page.tsx` | Gerenciar organização |
| `/user/dashboard` | `app/user/dashboard/page.tsx` | Dashboard do usuário |
| `/integracoes` | `app/integracoes/page.tsx` | Lista de integrações WhatsApp |
| `/integracoes/dashboard` | `app/integracoes/dashboard/page.tsx` | Dashboard de integrações |
| `/integracoes/conversations` | `app/integracoes/conversations/page.tsx` | Conversas WhatsApp |
| `/integracoes/settings` | `app/integracoes/settings/page.tsx` | Configurações |
| `/integracoes/users` | `app/integracoes/users/page.tsx` | Usuários da integração |
| `/integracoes/admin/clients` | `app/integracoes/admin/clients/page.tsx` | Clientes (admin de integração) |

**Total:** 9 rotas usuário

---

##### **🔴 Área Administrativa (Role: ADMIN, GOD)**

| Rota | Arquivo | Descrição |
|------|---------|-----------|
| `/admin` | `app/admin/page.tsx` | Dashboard administrativo |
| `/admin/integracoes` | `app/admin/integracoes/page.tsx` | Gerenciar integrações (admin) |
| `/admin/clients` | `app/admin/clients/page.tsx` | Gerenciar clientes |
| `/admin/organizations` | `app/admin/organizations/page.tsx` | Gerenciar organizações |
| `/admin/permissions` | `app/admin/permissions/page.tsx` | Gerenciar permissões |
| `/admin/webhooks` | `app/admin/webhooks/page.tsx` | Gerenciar webhooks |
| `/admin/brokers` | `app/admin/brokers/page.tsx` | Gerenciar brokers |
| `/admin/logs` | `app/admin/logs/page.tsx` | Logs do sistema |

**Total:** 8 rotas admin

---

#### **🔌 API ROUTES**

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/health` | GET | Health check endpoint |
| `/api/mcp/:transport` | ALL | MCP Server (Claude integration) |
| `/api/v1/*` | ALL | Igniter.js API (catch-all) |

**Subrotas Igniter.js (`/api/v1/`):**

Baseado nos controllers em `src/features/`:

| Feature | Endpoints Principais |
|---------|---------------------|
| **Auth** | `/api/v1/auth/signup`, `/api/v1/auth/login`, `/api/v1/auth/me`, `/api/v1/auth/logout` |
| **Instances** | `/api/v1/instances` (CRUD), `/api/v1/instances/:id/connect`, `/api/v1/instances/:id/status` |
| **Messages** | `/api/v1/messages` (envio e listagem) |
| **Organizations** | `/api/v1/organizations` (CRUD) |
| **Projects** | `/api/v1/projects` (CRUD) |
| **Webhooks** | `/api/v1/webhooks` (CRUD) |

---

### 🏗️ Arquitetura de Código (Igniter.js + Next.js)

#### **Padrão de Feature-Based Architecture**

Cada feature segue a estrutura:

```
src/features/<feature-name>/
├── controllers/
│   └── <feature>.controller.ts    # API endpoints (Igniter.js)
├── procedures/
│   └── <feature>.procedure.ts     # Middleware/procedures
├── repositories/ (opcional)
│   └── <feature>.repository.ts    # Data access layer
├── <feature>.interfaces.ts        # TypeScript interfaces
├── <feature>.schemas.ts           # Zod validation schemas
└── index.ts                       # Export barrel
```

**Exemplo: Feature `instances`**

```typescript
// controllers/instances.controller.ts
export const instancesController = igniter.controller({
  name: "instances",
  path: "/instances",
  actions: {
    create: igniter.mutation({
      method: "POST",
      path: "/",
      use: [authProcedure({ required: true }), instancesProcedure()],
      body: CreateInstanceSchema,
      handler: async ({ request, response, context }) => {
        // Lógica de criação
        return response.created(instance);
      },
    }),
    list: igniter.query({
      method: "GET",
      path: "/",
      use: [authProcedure({ required: true })],
      query: ListInstancesQueryDTO,
      handler: async ({ request, response, context }) => {
        // Lógica de listagem
        return response.success({ data, pagination });
      },
    }),
    // ... mais actions
  },
});
```

---

### 🔄 Fluxo de Autenticação

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ 1. POST /api/v1/auth/login
       │    { email, password }
       ▼
┌─────────────────────────┐
│  authController.login   │
│  (Igniter.js)          │
└──────┬──────────────────┘
       │ 2. Valida credenciais
       │    (Prisma + bcrypt)
       ▼
┌─────────────────────────┐
│  Gera JWT tokens       │
│  - accessToken (15min) │
│  - refreshToken (7d)   │
└──────┬──────────────────┘
       │ 3. Retorna tokens
       │    + user data
       ▼
┌─────────────────────────┐
│  Browser armazena:     │
│  - localStorage        │
│  - httpOnly cookies    │
└──────┬──────────────────┘
       │ 4. Próximas requests:
       │    Authorization: Bearer <token>
       ▼
┌─────────────────────────┐
│  authProcedure()       │
│  (middleware)          │
│  - Valida JWT          │
│  - Extrai user context │
└─────────────────────────┘
```

---

### 📊 Diagrama de Navegação

```
┌──────────────────────────────────────────────────────────┐
│                      Homepage (/)                         │
│                                                           │
│  [Entrar]  [Cadastrar]  [Google Login]                  │
└───────┬──────────────────────────────────────────────────┘
        │
        ├─ Login (/login) ──────────┐
        │                            │
        │   ┌──────────────────┐    │
        │   │ Email + Senha    │    │
        │   └────────┬─────────┘    │
        │            │               │
        │            ▼               │
        │   ┌──────────────────┐    │
        │   │ OTP Verification │    │
        │   │ /login/verify    │    │
        │   └────────┬─────────┘    │
        │            │               │
        ├─ Signup (/signup) ────────┤
        │                            │
        │   ┌──────────────────┐    │
        │   │ Dados cadastro   │    │
        │   └────────┬─────────┘    │
        │            │               │
        │            ▼               │
        │   ┌──────────────────┐    │
        │   │ Email Verify OTP │    │
        │   │ /signup/verify   │    │
        │   └────────┬─────────┘    │
        │            │               │
        ├────────────┴───────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│           Onboarding (/onboarding)                        │
│  - Criar primeira organização                            │
│  - Configurações iniciais                                │
└───────┬──────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│        Dashboard Principal (Role-based)                   │
└───────┬──────────────────────────────────────────────────┘
        │
        ├─ USER Role ────────────────┐
        │                             │
        │  /integracoes               │  Lista de integrações
        │  /integracoes/dashboard     │  Métricas e gráficos
        │  /integracoes/conversations │  Conversas WhatsApp
        │  /integracoes/settings      │  Configurações
        │  /user/dashboard            │  Dashboard pessoal
        │
        ├─ ADMIN Role ───────────────┼─ (herda tudo de USER)
        │                             │
        │  /admin                     │  Dashboard admin
        │  /admin/integracoes         │  Gerenciar instâncias
        │  /admin/clients             │  Gerenciar clientes
        │  /admin/organizations       │  Gerenciar organizações
        │  /admin/webhooks            │  Gerenciar webhooks
        │  /admin/permissions         │  Gerenciar permissões
        │
        └─ GOD Role ─────────────────┴─ (herda tudo de ADMIN)
                                        │
           /admin/brokers               │  Gerenciar brokers
           /admin/logs                  │  Logs do sistema
```

---

### 🎨 Design System e Componentes

**Baseado em:** shadcn/ui + Radix UI + Tailwind CSS

**Temas:**
- Light mode
- Dark mode
- Sistema (auto)

**Componentes UI Disponíveis (43):**

| Categoria | Componentes |
|-----------|-------------|
| **Layout** | `accordion`, `card`, `separator`, `tabs`, `sheet`, `sidebar` |
| **Forms** | `input`, `input-otp`, `textarea`, `select`, `checkbox`, `radio-group`, `form`, `label` |
| **Buttons** | `button`, `toggle`, `toggle-group` |
| **Feedback** | `alert`, `alert-dialog`, `toast`, `sonner`, `progress`, `skeleton` |
| **Navigation** | `breadcrumb`, `menubar`, `navigation-menu`, `pagination` |
| **Overlays** | `dialog`, `popover`, `hover-card`, `tooltip`, `drawer`, `context-menu`, `dropdown-menu` |
| **Data Display** | `table`, `badge`, `avatar`, `calendar`, `carousel`, `scroll-area`, `aspect-ratio` |
| **Charts** | `chart` (recharts wrapper) |
| **Misc** | `command`, `collapsible`, `resizable`, `slider` |

---

### 🔌 Integração com UAZapi

**Cliente UAZapi:** `src/lib/api/uazapi.service.ts`

**Métodos principais:**

```typescript
class UazapiService {
  // Instâncias
  createInstance(name: string, webhookUrl?: string)
  connectInstance(token: string)
  disconnectInstance(token: string)
  deleteInstance(token: string)
  getInstanceStatus(token: string)
  getQrCode(token: string)

  // Mensagens
  sendMessage(token: string, to: string, message: string)
  sendMedia(token: string, to: string, mediaUrl: string, caption?: string)

  // Webhooks
  setWebhook(token: string, url: string, events: string[])
  getWebhook(token: string)

  // Perfil
  getProfilePicture(token: string)
}
```

**Endpoints UAZapi utilizados:**

```
POST   /instance/init              # Criar instância
POST   /instance/connect           # Gerar QR Code
POST   /instance/disconnect        # Desconectar
GET    /instance/status            # Status da conexão
POST   /send/text                  # Enviar mensagem texto
POST   /send/media                 # Enviar mídia
POST   /webhook                    # Configurar webhook
GET    /profile/image              # Foto de perfil
```

---

Continua na próxima seção...
