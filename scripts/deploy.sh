#!/bin/bash

# ===========================================
# 🚀 QUAYER - DEPLOY SCRIPT
# ===========================================
# Deploy manual para diferentes ambientes
# Uso: ./scripts/deploy.sh [environment]
# Environments: staging, production

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

ENVIRONMENT=${1:-staging}

echo "=========================================="
echo "🚀 QUAYER - DEPLOY"
echo "=========================================="
echo ""

if [ "$ENVIRONMENT" != "staging" ] && [ "$ENVIRONMENT" != "production" ]; then
    echo -e "${RED}❌ Environment inválido: $ENVIRONMENT${NC}"
    echo "Use: staging ou production"
    exit 1
fi

# Confirmation for production
if [ "$ENVIRONMENT" == "production" ]; then
    echo -e "${RED}⚠️  DEPLOY PARA PRODUÇÃO${NC}"
    echo ""
    read -p "Tem certeza? Digite 'yes' para confirmar: " -r
    echo ""
    if [ "$REPLY" != "yes" ]; then
        echo "Deploy cancelado."
        exit 0
    fi
fi

# Pre-deploy checks
echo -e "${BLUE}🔍 Running pre-deploy checks...${NC}"
echo ""

# Check git status
if ! git diff-index --quiet HEAD --; then
    echo -e "${RED}❌ Existem alterações não commitadas!${NC}"
    echo "Commit ou stash suas alterações antes de deployar."
    exit 1
fi

echo -e "${GREEN}✅ Git clean${NC}"

# Run tests
echo ""
echo -e "${BLUE}🧪 Running tests...${NC}"
npm run test:ci

echo -e "${GREEN}✅ Tests passed${NC}"

# Build
echo ""
echo -e "${BLUE}🏗️  Building...${NC}"
npm run build

echo -e "${GREEN}✅ Build successful${NC}"

# Deploy based on environment
echo ""
echo -e "${BLUE}🚀 Deploying to $ENVIRONMENT...${NC}"

if [ "$ENVIRONMENT" == "staging" ]; then
    # Vercel staging
    if command -v vercel &> /dev/null; then
        vercel --confirm
        echo -e "${GREEN}✅ Deployed to Vercel staging${NC}"
    else
        echo -e "${YELLOW}⚠️  Vercel CLI not found${NC}"
        echo "Install with: npm install -g vercel"
        exit 1
    fi

elif [ "$ENVIRONMENT" == "production" ]; then
    # Check if on main branch
    CURRENT_BRANCH=$(git branch --show-current)
    if [ "$CURRENT_BRANCH" != "main" ]; then
        echo -e "${RED}❌ Production deploy deve ser feito da branch 'main'${NC}"
        echo "Branch atual: $CURRENT_BRANCH"
        exit 1
    fi

    # Get version
    if [ -f VERSION ]; then
        VERSION=$(cat VERSION)
    else
        echo -e "${RED}❌ VERSION file not found${NC}"
        exit 1
    fi

    echo ""
    echo "Version: v$VERSION"
    echo ""

    # Create and push tag
    echo -e "${BLUE}🏷️  Creating tag v$VERSION...${NC}"

    if git rev-parse "v$VERSION" >/dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Tag v$VERSION already exists${NC}"
        read -p "Use existing tag? (y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        git tag -a "v$VERSION" -m "Release v$VERSION"
        echo -e "${GREEN}✅ Tag created${NC}"
    fi

    # Push tag
    echo ""
    echo -e "${BLUE}📤 Pushing tag to GitHub...${NC}"
    git push origin "v$VERSION"

    echo -e "${GREEN}✅ Tag pushed${NC}"
    echo ""
    echo "🎉 Production deploy iniciado!"
    echo ""
    echo "GitHub Actions irá:"
    echo "1. Run full test suite"
    echo "2. Security scan"
    echo "3. Aguardar aprovação manual"
    echo "4. Deploy to Vercel production"
    echo "5. Build and push Docker image"
    echo ""
    echo "Acompanhe em: https://github.com/Quayer/app-quayer/actions"
fi

# Post-deploy info
echo ""
echo "=========================================="
echo "📊 DEPLOY INFO"
echo "=========================================="
echo ""
echo "Environment: $ENVIRONMENT"
echo "Git Commit: $(git rev-parse --short HEAD)"
echo "Git Branch: $(git branch --show-current)"

if [ "$ENVIRONMENT" == "production" ] && [ -f VERSION ]; then
    echo "Version: v$(cat VERSION)"
fi

echo ""
echo -e "${GREEN}✅ Deploy completed!${NC}"
echo ""
echo "=========================================="
