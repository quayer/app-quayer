#!/bin/bash
# ==============================================
# SCRIPT DE DEPLOY MANUAL
# ==============================================
# Execute no servidor via SSH:
# ssh root@91.98.142.177
# curl -s https://raw.githubusercontent.com/quayer/app-quayer/main/scripts/deploy/manual-deploy.sh | bash
# OU copie e cole os comandos abaixo
# ==============================================

set -e

APP_DIR="/opt/quayer"
COMPOSE_FILE="compose.yml"

echo "🔥 Iniciando Deploy Manual Quayer..."
echo "================================================"

# Navegar para diretório
cd "$APP_DIR"

# Atualizar código
echo "📥 Atualizando código..."
git fetch --depth 1 origin main
git reset --hard origin/main
git clean -fd -e .env

# Verificar .env
if [ ! -f .env ]; then
  echo "❌ ERRO: .env não encontrado!"
  exit 1
fi
echo "✅ .env encontrado"

# Garantir rede existe
docker network inspect supabase_default &> /dev/null || docker network create supabase_default

# Detectar docker compose
if docker compose version &> /dev/null; then
  COMPOSE_CMD="docker compose"
else
  COMPOSE_CMD="docker-compose"
fi

echo "🐳 Usando: $COMPOSE_CMD"

# Limpar espaço
echo "🧹 Limpando espaço em disco..."
docker system prune -af --volumes 2>/dev/null || true
docker builder prune -af 2>/dev/null || true

# Build
echo "🏗️ Construindo imagem..."
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
$COMPOSE_CMD -f $COMPOSE_FILE build --parallel app

# Deploy
echo "🚀 Subindo aplicação..."
$COMPOSE_CMD -f $COMPOSE_FILE up -d --force-recreate app

# Aguardar health check
echo "⏳ Aguardando health check..."
sleep 15

STATUS=$(docker inspect quayer-app --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")

if [ "$STATUS" = "healthy" ]; then
  echo "✅ App está healthy!"
else
  echo "⚠️ Status: $STATUS - Verificando logs..."
  docker logs quayer-app --tail 30
fi

# Limpar imagens antigas
docker image prune -f || true

echo ""
echo "================================================"
echo "✅ Deploy concluído!"
echo "🌐 https://app.quayer.com"
