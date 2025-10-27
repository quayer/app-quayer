# 🚀 Guia Completo de Deployment - Quayer

**Versão:** 1.0.0
**Data:** 2025-10-11

Este guia fornece instruções detalhadas para deploy do Quayer em diferentes ambientes.

---

## 📋 Índice

- [Pré-requisitos](#pré-requisitos)
- [Ambientes](#ambientes)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Deploy Vercel](#deploy-vercel)
- [Deploy Docker](#deploy-docker)
- [Deploy Easypanel](#deploy-easypanel)
- [CI/CD Automation](#cicd-automation)
- [Troubleshooting](#troubleshooting)

---

## 🔧 Pré-requisitos

### Obrigatório

- Node.js 22+
- PostgreSQL 15+
- Redis 7+
- Conta Vercel (para deploy serverless)
- Docker (para deploy containerizado)

### Recomendado

- Upstash Redis (rate limiting)
- Resend API key (emails)
- Sentry (error tracking)
- UAZ API token (WhatsApp)

---

## 🌍 Ambientes

O projeto possui 3 ambientes configurados:

### 1. Development (Local)

**URL:** http://localhost:3000
**Database:** PostgreSQL local (Docker)
**Redis:** Redis local (Docker)
**Email:** Mock provider (logs no console)

**Iniciar:**
```bash
docker-compose up -d
npm run dev
```

### 2. Staging (Vercel Preview)

**URL:** https://app-quayer-*.vercel.app
**Trigger:** Push em branch `develop`
**Database:** PostgreSQL em cloud (ex: Supabase)
**Redis:** Redis em cloud (ex: Upstash)
**Email:** Resend (sandbox mode)

**Deploy automático via GitHub Actions** (cd-staging.yml)

### 3. Production (Vercel Production)

**URL:** https://quayer.com
**Trigger:** Tag `v*.*.*` com aprovação manual
**Database:** PostgreSQL em cloud (pooling obrigatório)
**Redis:** Redis em cloud (TLS obrigatório)
**Email:** Resend (production mode)

**Deploy automático via GitHub Actions** (cd-production.yml)

---

## 🔐 Variáveis de Ambiente

### Variáveis por Ambiente

#### **Todas os Ambientes**
```bash
# Application
NODE_ENV=                        # development | production
NEXT_PUBLIC_APP_URL=            # URL pública da aplicação
PORT=3000                        # Porta (opcional, padrão: 3000)

# Igniter.js
IGNITER_APP_SECRET=             # OBRIGATÓRIO: Secret único por ambiente
NEXT_PUBLIC_IGNITER_API_URL=    # URL da API (geralmente igual a NEXT_PUBLIC_APP_URL)
NEXT_PUBLIC_IGNITER_API_BASE_PATH=/api/v1

# Auth
JWT_SECRET=                      # OBRIGATÓRIO: Secret único por ambiente

# Database
DATABASE_URL=                    # OBRIGATÓRIO: Connection string completa

# Redis
REDIS_URL=                       # OBRIGATÓRIO: Connection string

# Email
EMAIL_PROVIDER=                  # mock | resend | smtp
EMAIL_FROM=                      # Remetente padrão

# WhatsApp
UAZAPI_URL=                      # URL UAZ API
UAZAPI_ADMIN_TOKEN=             # OBRIGATÓRIO: Token admin
```

#### **Production Adicional**
```bash
# Database (com pooling)
DATABASE_URL=postgresql://user:pass@pooler.supabase.com:6543/db?pgbouncer=true

# Redis (com TLS)
REDIS_URL=rediss://default:pass@redis.upstash.io:6379

# Email (Resend)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxx

# Rate Limiting
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxx

# Monitoring
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
LOG_LEVEL=info
```

### Gerar Secrets

```bash
# JWT_SECRET e IGNITER_APP_SECRET
openssl rand -base64 32

# Ou usando Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

⚠️ **IMPORTANTE:** Use secrets diferentes para cada ambiente!

---

## 🌐 Deploy Vercel

### Setup Inicial

#### 1. Install Vercel CLI
```bash
npm install -g vercel
```

#### 2. Login
```bash
vercel login
```

#### 3. Link Project
```bash
vercel link
```

### Deploy Manual

#### Staging (Preview)
```bash
vercel
```

#### Production
```bash
vercel --prod
```

### Configurar no Dashboard

#### 1. Acessar Settings
https://vercel.com/your-org/app-quayer/settings

#### 2. Environment Variables

**Development:**
- Variáveis para preview deployments
- Use valores de teste

**Preview:**
- Variáveis para branch deployments
- Use staging database/redis

**Production:**
- Variáveis para production
- Use valores reais e seguros

#### 3. Configurações Importantes

**General:**
- Node.js Version: 22.x
- Framework Preset: Next.js
- Root Directory: `./`
- Build Command: `npm run build`
- Output Directory: `.next`

**Domains:**
- Production: `quayer.com`
- Staging: `staging.quayer.com` (opcional)

**Functions:**
- Maximum Duration: 10s (Hobby) / 60s (Pro)
- Memory: 1024 MB

**Edge Network:**
- Regions: All (ou específicas por região)

### Database Setup (Supabase)

#### 1. Criar Projeto
https://supabase.com/dashboard

#### 2. Connection Pooling
```bash
# Direct connection (migrations)
DATABASE_URL=postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres

# Pooled connection (app)
DATABASE_URL=postgresql://postgres:pass@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```

#### 3. Run Migrations
```bash
# Localmente
DATABASE_URL="direct-url" npx prisma migrate deploy

# Via Vercel (após deploy)
vercel env pull .env.production
npx prisma migrate deploy
```

### Redis Setup (Upstash)

#### 1. Criar Database
https://console.upstash.com/

#### 2. Get Connection String
```bash
# REST API (rate limiting)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxxxx

# Redis connection (cache/queue)
REDIS_URL=rediss://default:pass@xxx.upstash.io:6379
```

---

## 🐳 Deploy Docker

### Build Local

```bash
# Build imagem
docker build -t quayer-app:latest .

# Test localmente
docker run -p 3000:3000 --env-file .env quayer-app:latest

# Test health check
curl http://localhost:3000/api/health
```

### Docker Compose (Production)

```bash
# Copiar env file
cp .env.example .env.production
# Editar .env.production com valores reais

# Start stack
docker-compose -f docker-compose.prod.yml up -d

# Ver logs
docker-compose -f docker-compose.prod.yml logs -f app

# Stop stack
docker-compose -f docker-compose.prod.yml down
```

### Deploy Docker Hub

#### 1. Build e Push
```bash
# Login
docker login

# Build multi-platform
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 \
  -t quayer/app:1.0.0 \
  -t quayer/app:latest \
  --push .
```

#### 2. Pull e Run
```bash
# Pull
docker pull quayer/app:latest

# Run
docker run -d \
  --name quayer-app \
  -p 3000:3000 \
  --env-file .env.production \
  --restart always \
  quayer/app:latest
```

### Health Checks

```bash
# HTTP check
curl -f http://localhost:3000/api/health || exit 1

# HEAD check (lightweight)
curl -I http://localhost:3000/api/health
```

---

## 🚀 Deploy Easypanel

Veja documentação completa em: [EASYPANEL_SETUP.md](./EASYPANEL_SETUP.md)

### Resumo Rápido

1. **Criar Projeto** no Easypanel Dashboard
2. **Adicionar Service** (Docker)
3. **Configurar Image:** `quayer/app:latest`
4. **Configurar Environment Variables**
5. **Adicionar PostgreSQL Service**
6. **Adicionar Redis Service**
7. **Configurar Domain**
8. **Deploy!**

---

## ⚙️ CI/CD Automation

### Workflows Disponíveis

#### 1. ci.yml (Continuous Integration)
**Trigger:** Push em qualquer branch, Pull Requests

**Jobs:**
- Lint & TypeCheck
- Unit Tests (com coverage)
- API Tests (com PostgreSQL)
- E2E Tests (com Playwright)
- Build
- Security Audit

#### 2. cd-staging.yml (Deploy Staging)
**Trigger:** Push em `develop`

**Jobs:**
- Build & Test
- Deploy to Vercel Preview
- Notify

#### 3. cd-production.yml (Deploy Production)
**Trigger:** Tag `v*.*.*`

**Jobs:**
- Validate tag
- Build & Full Test Suite
- Security Scan
- **Approval Gate** (manual)
- Deploy to Vercel Production
- Build & Push Docker Image
- Notify

#### 4. release.yml (Release Notes)
**Trigger:** Tag `v*.*.*`

**Jobs:**
- Generate categorized changelog
- Create GitHub Release
- Update CHANGELOG.md

### Configurar GitHub Secrets

Vá em: **GitHub → Settings → Secrets and variables → Actions**

**Obrigatórios:**
```
VERCEL_TOKEN=              # Token Vercel
VERCEL_ORG_ID=             # Org ID Vercel
VERCEL_PROJECT_ID=         # Project ID Vercel
```

**Opcionais:**
```
DOCKERHUB_USERNAME=        # Docker Hub username
DOCKERHUB_TOKEN=           # Docker Hub token
CODECOV_TOKEN=             # Codecov token
```

### Workflow de Release

#### 1. Desenvolver Feature
```bash
git checkout develop
git pull origin develop
git checkout -b feature/nova-feature
# ... fazer alterações ...
git commit -m "feat: adiciona nova feature"
git push origin feature/nova-feature
```

#### 2. Pull Request
```bash
# Criar PR: feature/nova-feature → develop
# CI rodará automaticamente
# Aguardar aprovação e merge
```

#### 3. Deploy Staging
```bash
# Após merge em develop
git checkout develop
git pull origin develop
# cd-staging.yml rodará automaticamente
```

#### 4. Release Production
```bash
# Atualizar VERSION
echo "1.1.0" > VERSION

# Commit
git commit -am "chore: bump version to 1.1.0"
git push origin develop

# Merge develop → main
git checkout main
git merge develop
git push origin main

# Criar tag
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0

# Workflows rodarão:
# - release.yml (cria release notes)
# - cd-production.yml (aguarda aprovação)
```

#### 5. Aprovar Deploy
- GitHub → Actions → cd-production workflow
- Clicar em "Review deployments"
- Aprovar deploy para production
- Workflow continua automaticamente

---

## 🔍 Troubleshooting

### Build Errors

#### Erro: "Module not found"
```bash
# Limpar cache
rm -rf .next node_modules
npm install
npm run build
```

#### Erro: Prisma Client
```bash
npx prisma generate
npm run build
```

### Docker Issues

#### Erro: Health check failing
```bash
# Verificar logs
docker logs quayer-app

# Entrar no container
docker exec -it quayer-app sh

# Test endpoint manualmente
curl localhost:3000/api/health
```

#### Erro: Database connection
```bash
# Verificar network
docker network ls
docker network inspect quayer-network

# Verificar se PostgreSQL está up
docker ps | grep postgres
docker logs quayer-postgres
```

### Vercel Issues

#### Erro: Build timeout
- Aumentar timeout em Settings → Functions
- Otimizar build (remover dependências desnecessárias)

#### Erro: Memory limit
- Upgrade para plan Pro (3000 MB)
- Ou otimizar bundle size

#### Erro: Environment variables
```bash
# Pull vars localmente para debug
vercel env pull .env.vercel

# Verificar
cat .env.vercel
```

### Database Issues

#### Erro: Too many connections
- Use connection pooling (PgBouncer)
- Configure `connection_limit` no DATABASE_URL
```
DATABASE_URL=postgresql://user:pass@host:5432/db?connection_limit=10
```

#### Erro: Migration failed
```bash
# Reset (CUIDADO: apaga dados)
npx prisma migrate reset --force

# Ou deploy específico
npx prisma migrate deploy
```

### Redis Issues

#### Erro: Connection refused
```bash
# Verificar se Redis está rodando
docker ps | grep redis
redis-cli ping

# Ou via Node.js
node -e "const redis = require('redis'); const client = redis.createClient({ url: process.env.REDIS_URL }); client.connect().then(() => console.log('OK')).catch(console.error)"
```

---

## 📊 Monitoramento

### Logs

**Vercel:**
```bash
# Ver logs em tempo real
vercel logs --follow

# Logs específicos
vercel logs --since 1h
```

**Docker:**
```bash
# App logs
docker logs -f quayer-app

# PostgreSQL logs
docker logs -f quayer-postgres

# Redis logs
docker logs -f quayer-redis
```

### Métricas

**Vercel Dashboard:**
- Requests per second
- Error rate
- Response time
- Bandwidth usage

**Docker:**
```bash
# Stats em tempo real
docker stats quayer-app

# Disk usage
docker system df
```

### Alerts

Configure alerts no:
- **Vercel:** Integrations → Slack/Discord/Email
- **Sentry:** Projects → Settings → Alerts
- **Uptime monitors:** UptimeRobot, Pingdom, etc

---

## 🔒 Security Checklist

Antes de ir para produção:

- [ ] Secrets únicos por ambiente (JWT_SECRET, etc)
- [ ] HTTPS habilitado (Vercel faz automaticamente)
- [ ] Rate limiting configurado (Upstash)
- [ ] CORS configurado corretamente
- [ ] Database em rede privada
- [ ] Redis com password
- [ ] Environment variables não commitadas
- [ ] Dependencies atualizadas (`npm audit`)
- [ ] Security headers configurados
- [ ] Backups automáticos habilitados

---

## 📚 Referências

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Prisma Deployment](https://www.prisma.io/docs/guides/deployment)
- [GitHub Actions](https://docs.github.com/en/actions)

---

**Última atualização:** 2025-10-11
**Versão do Guia:** 1.0.0
