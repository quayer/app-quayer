# 🚀 Easypanel Setup Guide - Quayer

**Versão:** 1.0.0
**Data:** 2025-10-11

Guia completo para deploy do Quayer usando Easypanel.

---

## 📋 Índice

- [O que é Easypanel](#o-que-é-easypanel)
- [Pré-requisitos](#pré-requisitos)
- [Setup Inicial](#setup-inicial)
- [Criar Projeto](#criar-projeto)
- [Configurar Services](#configurar-services)
- [Environment Variables](#environment-variables)
- [Domain Setup](#domain-setup)
- [Deploy](#deploy)
- [Monitoramento](#monitoramento)
- [Troubleshooting](#troubleshooting)

---

## 🎯 O que é Easypanel

Easypanel é uma plataforma moderna de deployment que simplifica o gerenciamento de aplicações containerizadas. Oferece interface intuitiva similar ao Heroku, mas com controle total sobre a infraestrutura.

### Vantagens
- ✅ Interface visual amigável
- ✅ Deploy via Docker
- ✅ Auto-scaling
- ✅ SSL automático (Let's Encrypt)
- ✅ Backups automáticos
- ✅ Monitoramento integrado
- ✅ Logs centralizados

---

## 🔧 Pré-requisitos

### Obrigatório

1. **Servidor VPS**
   - Ubuntu 20.04+ ou Debian 11+
   - Mínimo: 2 GB RAM, 2 vCPU, 20 GB SSD
   - Recomendado: 4 GB RAM, 4 vCPU, 40 GB SSD

2. **Domínio Configurado**
   - Domínio apontando para IP do servidor
   - Exemplo: `app.quayer.com` → `IP_DO_SERVIDOR`

3. **Easypanel Instalado**
   - Instalação: https://easypanel.io/docs/installation

### Instalação do Easypanel

```bash
# SSH no servidor
ssh root@SEU_SERVIDOR_IP

# Instalar Easypanel
curl -sSL https://get.easypanel.io | sh

# Aguardar instalação (2-5 minutos)
# Acesse: https://SEU_SERVIDOR_IP:3000
```

---

## 🚀 Setup Inicial

### 1. Acessar Dashboard

Abra no navegador:
```
https://SEU_SERVIDOR_IP:3000
```

### 2. Criar Conta Admin

- Email: seu@email.com
- Password: (senha forte)

### 3. Configurar Servidor

**Settings → Server:**
- Server Name: `Quayer Production`
- Timezone: `America/Sao_Paulo`
- Auto Updates: Enabled

---

## 📦 Criar Projeto

### 1. New Project

No dashboard, clicar em **"New Project"**

**Configurações:**
- **Project Name:** `quayer-app`
- **Description:** `WhatsApp Multi-Instance Manager`

### 2. Estrutura do Projeto

O projeto terá 3 services:
1. **App** (Next.js + Igniter.js)
2. **PostgreSQL** (Database)
3. **Redis** (Cache & Queue)

---

## ⚙️ Configurar Services

### Service 1: PostgreSQL

#### Criar Service
- **Type:** Database
- **Engine:** PostgreSQL 15
- **Service Name:** `quayer-postgres`

#### Configurações
```yaml
Image: postgres:15-alpine
Port: 5432

Environment Variables:
POSTGRES_USER: quayer
POSTGRES_PASSWORD: <GERAR_SENHA_FORTE>
POSTGRES_DB: quayer_production

Volumes:
- /data/postgres:/var/lib/postgresql/data

Resources:
Memory: 512 MB
CPU: 0.5
```

#### Health Check
```bash
pg_isready -U quayer
```

---

### Service 2: Redis

#### Criar Service
- **Type:** Database
- **Engine:** Redis 7
- **Service Name:** `quayer-redis`

#### Configurações
```yaml
Image: redis:7-alpine
Port: 6379

Command:
redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru --save 60 1000 --appendonly yes

Volumes:
- /data/redis:/data

Resources:
Memory: 256 MB
CPU: 0.25
```

#### Health Check
```bash
redis-cli ping
```

---

### Service 3: App (Quayer)

#### Criar Service
- **Type:** Application
- **Source:** Docker Image
- **Service Name:** `quayer-app`

#### Build Settings

**Opção 1: Docker Hub (Recomendado)**
```yaml
Image: quayer/app:latest
Pull Policy: Always
```

**Opção 2: Git Repository**
```yaml
Repository: https://github.com/Quayer/app-quayer
Branch: main
Dockerfile: ./Dockerfile
Build Context: ./
```

#### Port Configuration
```yaml
Internal Port: 3000
External Port: 80 (HTTP)
              443 (HTTPS - auto SSL)
```

#### Health Check
```yaml
Path: /api/health
Interval: 30s
Timeout: 10s
Retries: 3
Start Period: 40s
```

---

## 🔐 Environment Variables

### Copiar de .env.example

No Easypanel, ir em **Service → quayer-app → Environment**

#### Variáveis Obrigatórias

```bash
# Application
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://app.quayer.com
PORT=3000

# Igniter.js
IGNITER_APP_NAME=quayer
IGNITER_APP_SECRET=<GERAR_OPENSSL_RAND_BASE64_32>
NEXT_PUBLIC_IGNITER_API_URL=https://app.quayer.com/
NEXT_PUBLIC_IGNITER_API_BASE_PATH=/api/v1
IGNITER_JOBS_QUEUE_PREFIX=igniter
IGNITER_LOG_LEVEL=info

# Auth
JWT_SECRET=<GERAR_OPENSSL_RAND_BASE64_32>

# Database (usar internal service name)
DATABASE_URL=postgresql://quayer:<PASSWORD>@quayer-postgres:5432/quayer_production?schema=public

# Redis (usar internal service name)
REDIS_URL=redis://quayer-redis:6379
REDIS_HOST=quayer-redis
REDIS_PORT=6379

# Email (Resend)
EMAIL_PROVIDER=resend
EMAIL_FROM=noreply@quayer.com
RESEND_API_KEY=<SEU_RESEND_API_KEY>

# WhatsApp (UAZ API)
UAZAPI_URL=https://quayer.uazapi.com
UAZAPI_ADMIN_TOKEN=<SEU_UAZ_ADMIN_TOKEN>
UAZAPI_TOKEN=<SEU_UAZ_TOKEN>

# Rate Limiting (Upstash - Opcional)
UPSTASH_REDIS_REST_URL=<URL_UPSTASH>
UPSTASH_REDIS_REST_TOKEN=<TOKEN_UPSTASH>

# Monitoring (Sentry - Opcional)
SENTRY_DSN=<SEU_SENTRY_DSN>
LOG_LEVEL=info

# Next.js
NEXT_TELEMETRY_DISABLED=1
```

### Gerar Secrets

```bash
# No seu terminal local
openssl rand -base64 32
# Copiar output para IGNITER_APP_SECRET

openssl rand -base64 32
# Copiar output para JWT_SECRET
```

⚠️ **IMPORTANTE:** Use secrets únicos para produção!

---

## 🌐 Domain Setup

### 1. Configurar DNS

No seu provedor de domínio (Cloudflare, GoDaddy, etc):

```
Type: A
Name: app
Value: <IP_DO_SERVIDOR_EASYPANEL>
TTL: Auto
```

Ou para domínio raiz:
```
Type: A
Name: @
Value: <IP_DO_SERVIDOR_EASYPANEL>
TTL: Auto
```

### 2. Configurar no Easypanel

**Service → quayer-app → Domains:**

1. Clicar em **"Add Domain"**
2. Inserir: `app.quayer.com`
3. SSL: **Enabled** (Let's Encrypt automático)
4. Force HTTPS: **Enabled**

### 3. Aguardar Propagação

- Propagação DNS: 5-15 minutos
- Certificado SSL: 1-2 minutos

Verificar:
```bash
dig app.quayer.com
curl https://app.quayer.com/api/health
```

---

## 🚀 Deploy

### Deploy Inicial

1. **Build & Start Services**
   - PostgreSQL → Start
   - Redis → Start
   - App → Build & Start

2. **Run Migrations**

Abrir terminal no service `quayer-app`:

```bash
# Gerar Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# Seed database (opcional)
npx prisma db seed
```

3. **Verificar Health**

```bash
curl https://app.quayer.com/api/health
```

Resposta esperada:
```json
{
  "status": "healthy",
  "services": {
    "database": "up",
    "redis": "up"
  }
}
```

### Deploy Updates

#### Opção 1: Pull Nova Imagem (Docker Hub)

```bash
# No Easypanel
Service → quayer-app → Actions → Pull & Restart
```

#### Opção 2: Rebuild (Git)

```bash
# No Easypanel
Service → quayer-app → Actions → Rebuild
```

#### Opção 3: Via CLI (Avançado)

```bash
# SSH no servidor
ssh root@SEU_SERVIDOR

# Pull nova imagem
docker pull quayer/app:latest

# Restart service
docker restart <CONTAINER_ID>
```

---

## 📊 Monitoramento

### Logs

**Ver Logs:**
```
Service → quayer-app → Logs
```

**Filtros:**
- Last 100 lines
- Last 1 hour
- Search by keyword

**Download Logs:**
```bash
# SSH no servidor
docker logs <CONTAINER_ID> > app-logs.txt
```

### Metrics

**Dashboard → Metrics:**
- CPU Usage
- Memory Usage
- Disk I/O
- Network Traffic
- Request Rate
- Error Rate

### Alerts

**Settings → Alerts:**

Configure alertas para:
- ❌ Service Down
- 🔥 High CPU (> 80%)
- 💾 High Memory (> 90%)
- 📊 High Error Rate (> 5%)

**Notificações via:**
- Email
- Slack
- Discord
- Webhook

---

## 🔧 Manutenção

### Backups

#### PostgreSQL

**Backup Manual:**
```bash
# SSH no servidor
docker exec quayer-postgres pg_dump -U quayer quayer_production > backup.sql
```

**Backup Automático (Easypanel):**
```
Service → quayer-postgres → Backups
Schedule: Daily at 3 AM
Retention: 7 days
```

#### Restore

```bash
# Upload backup.sql para servidor
scp backup.sql root@servidor:/tmp/

# Restore
docker exec -i quayer-postgres psql -U quayer quayer_production < /tmp/backup.sql
```

### Updates

#### Update Services

```bash
# PostgreSQL
Service → quayer-postgres → Update to latest

# Redis
Service → quayer-redis → Update to latest

# App
Service → quayer-app → Pull & Restart
```

#### Update Easypanel

```bash
# SSH no servidor
easypanel update
```

### Scaling

#### Vertical Scaling (Recursos)

```
Service → quayer-app → Resources

Memory: 1 GB → 2 GB
CPU: 1 core → 2 cores
```

#### Horizontal Scaling (Replicas)

```
Service → quayer-app → Replicas: 2

Load Balancer: Round Robin
Session Affinity: Enabled
```

⚠️ **Nota:** Para horizontal scaling, configure session store no Redis.

---

## 🔍 Troubleshooting

### App não inicia

**1. Verificar Logs**
```
Service → quayer-app → Logs
```

**2. Verificar Environment Variables**
```
Service → quayer-app → Environment
```

Conferir:
- DATABASE_URL está correto?
- REDIS_URL está correto?
- JWT_SECRET está definido?

**3. Verificar Dependencies**
```bash
# Terminal no service
docker exec -it <CONTAINER_ID> sh

# Verificar Prisma
npx prisma --version

# Test database connection
npx prisma db pull
```

### Database Connection Error

**Erro:** `Can't reach database server`

**Solução:**
1. Verificar se PostgreSQL service está rodando
2. Testar connection string:
```bash
docker exec -it quayer-postgres psql -U quayer -d quayer_production
```

3. Verificar internal network:
```bash
docker network inspect easypanel
```

### Redis Connection Error

**Erro:** `ECONNREFUSED redis:6379`

**Solução:**
1. Verificar se Redis service está rodando
2. Test connection:
```bash
docker exec -it quayer-redis redis-cli ping
# Esperado: PONG
```

### SSL Certificate Error

**Erro:** `SSL certificate problem`

**Solução:**
1. Verificar DNS:
```bash
dig app.quayer.com
```

2. Forçar renovação SSL:
```
Service → quayer-app → Domains → Renew Certificate
```

3. Aguardar 2-5 minutos

### High Memory Usage

**Solução:**
1. Aumentar recursos:
```
Service → quayer-app → Resources → Memory: 2 GB
```

2. Otimizar queries (adicionar indexes)

3. Configurar connection pooling:
```bash
DATABASE_URL=postgresql://user:pass@host:5432/db?connection_limit=10
```

---

## 📚 Recursos Adicionais

### Documentação Oficial
- [Easypanel Docs](https://easypanel.io/docs)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

### Suporte
- **Discord:** [Easypanel Community](https://discord.gg/easypanel)
- **Email:** support@easypanel.io

### Tutoriais
- [Deploy Next.js to Easypanel](https://easypanel.io/blog/deploy-nextjs)
- [PostgreSQL Backup Strategy](https://easypanel.io/docs/databases/postgresql)

---

## ✅ Checklist Pós-Deploy

Após deploy inicial, verificar:

- [ ] App acessível via HTTPS
- [ ] SSL válido e auto-renovável
- [ ] Health check retornando "healthy"
- [ ] Database migrations aplicadas
- [ ] Redis funcionando
- [ ] Logs sem erros críticos
- [ ] Backups automáticos configurados
- [ ] Alerts configurados
- [ ] Domínio propagado
- [ ] Performance adequada (< 500ms response)

---

**Última atualização:** 2025-10-11
**Versão do Guia:** 1.0.0
