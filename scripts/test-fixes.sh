#!/bin/bash
# Script para testar as correções de autenticação

BASE_URL="http://localhost:3000"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🧪 ===== TESTE DAS CORREÇÕES DE AUTENTICAÇÃO ====="
echo ""
echo "Base URL: $BASE_URL"
echo "=================================================="
echo ""

# Função para testar endpoint
test_endpoint() {
  local name=$1
  local url=$2
  local method=$3
  local data=$4

  echo -n "🔍 Testando $name... "

  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" "$url")
  else
    response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url")
  fi

  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo -e "${GREEN}✅ OK (HTTP $http_code)${NC}"
    return 0
  elif [ "$http_code" -ge 400 ] && [ "$http_code" -lt 500 ]; then
    echo -e "${YELLOW}⚠️  Client Error (HTTP $http_code)${NC}"
    echo "   Response: $(echo $body | jq -r '.error // .message // .' 2>/dev/null || echo $body)"
    return 1
  else
    echo -e "${RED}❌ FALHOU (HTTP $http_code)${NC}"
    echo "   Response: $body"
    return 1
  fi
}

echo "📡 TESTE 1: Health Check"
echo "────────────────────────────────────────"
test_endpoint "Health Endpoint" "$BASE_URL/api/health" "GET"
echo ""

echo "🔑 TESTE 2: Login OTP Request"
echo "────────────────────────────────────────"
test_endpoint "Solicitar OTP" "$BASE_URL/api/v1/auth/login-otp" "POST" '{"email":"admin@quayer.com"}'
echo ""

echo "🌐 TESTE 3: Google Auth URL"
echo "────────────────────────────────────────"
test_endpoint "Obter URL Google" "$BASE_URL/api/v1/auth/google" "GET"
echo ""

echo "👤 TESTE 4: Me Endpoint (Sem Auth - Deve Falhar)"
echo "────────────────────────────────────────"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/auth/me")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" -eq 401 ]; then
  echo -e "${GREEN}✅ OK - Rejeitou request sem auth (HTTP 401)${NC}"
else
  echo -e "${RED}❌ FALHOU - Deveria rejeitar sem auth (HTTP $http_code)${NC}"
fi
echo ""

echo "📊 TESTE 5: Instances Endpoint (Sem Auth - Deve Falhar)"
echo "────────────────────────────────────────"
response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/instances")
http_code=$(echo "$response" | tail -n1)

if [ "$http_code" -eq 401 ] || [ "$http_code" -eq 403 ]; then
  echo -e "${GREEN}✅ OK - Rejeitou request sem auth (HTTP $http_code)${NC}"
else
  echo -e "${RED}❌ FALHOU - Deveria rejeitar sem auth (HTTP $http_code)${NC}"
fi
echo ""

echo "=================================================="
echo "✅ Testes básicos concluídos!"
echo ""
echo "📝 PRÓXIMOS PASSOS MANUAIS:"
echo "1. Abra http://localhost:3000/login no navegador"
echo "2. Teste login com OTP: admin@quayer.com"
echo "3. Teste login com Google OAuth"
echo "4. Verifique se /integracoes carrega corretamente"
echo "5. Verifique console do navegador para warnings/errors"
echo ""
echo "📄 Documentação completa: CORRECOES_AUTENTICACAO.md"
echo "=================================================="
