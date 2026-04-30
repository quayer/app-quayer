#!/bin/bash

# ===========================================
# 🚀 QUAYER - SETUP SCRIPT
# ===========================================
# Setup inicial completo do projeto
# Uso: ./scripts/deploy/setup.sh

set -e  # Exit on error

echo "=========================================="
echo "🚀 QUAYER - SETUP INICIAL"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Node.js version
echo "📦 Verificando Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js não encontrado!${NC}"
    echo "Instale Node.js 22+ e tente novamente."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo -e "${RED}❌ Node.js 22+ é obrigatório!${NC}"
    echo "Versão atual: $(node -v)"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v)${NC}"

# Check Docker
echo ""
echo "🐳 Verificando Docker..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker não encontrado!${NC}"
    echo "Instale Docker e tente novamente."
    exit 1
fi

if ! docker ps &> /dev/null; then
    echo -e "${RED}❌ Docker não está rodando!${NC}"
    echo "Inicie o Docker e tente novamente."
    exit 1
fi

echo -e "${GREEN}✅ Docker $(docker -v | cut -d' ' -f3 | tr -d ',')${NC}"

# Install dependencies
echo ""
echo "📦 Instalando dependências..."
npm install

echo -e "${GREEN}✅ Dependências instaladas${NC}"

# Setup environment
echo ""
echo "🔐 Configurando variáveis de ambiente..."

if [ ! -f .env ]; then
    cp .env.example .env
    echo -e "${GREEN}✅ .env criado a partir de .env.example${NC}"
    echo -e "${YELLOW}⚠️  Edite o arquivo .env com suas configurações reais${NC}"
else
    echo -e "${YELLOW}⚠️  .env já existe, não sobrescrevendo${NC}"
fi

# Generate secrets
echo ""
echo "🔑 Gerando secrets..."
JWT_SECRET=$(openssl rand -base64 32)
IGNITER_SECRET=$(openssl rand -base64 32)

echo ""
echo "Adicione ao seu .env:"
echo "JWT_SECRET=$JWT_SECRET"
echo "IGNITER_APP_SECRET=$IGNITER_SECRET"
echo ""

# Start Docker services
echo "🐳 Iniciando serviços Docker..."
docker compose up -d

# Wait for services
echo ""
echo "⏳ Aguardando PostgreSQL estar pronto..."
sleep 5

# Generate Prisma client
echo ""
echo "🔧 Gerando Prisma Client..."
npx prisma generate

# Push database schema
echo ""
echo "🗄️  Aplicando schema ao banco de dados..."
npx prisma db push

# Seed database
echo ""
read -p "Deseja popular o banco com dados de teste? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌱 Populando banco de dados..."
    npm run db:seed
    echo -e "${GREEN}✅ Banco de dados populado${NC}"
fi

# Summary
echo ""
echo "=========================================="
echo "✅ SETUP CONCLUÍDO!"
echo "=========================================="
echo ""
echo "📝 Próximos passos:"
echo ""
echo "1. Edite o arquivo .env com suas configurações"
echo "2. Execute 'npm run dev' para iniciar o servidor"
echo "3. Acesse http://localhost:3000"
echo ""
echo "Credenciais de teste:"
echo "  Email: admin@quayer.com"
echo "  Senha: admin123456"
echo ""
echo "=========================================="
