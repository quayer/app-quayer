#!/bin/bash

# Script de Teste Completo da API
# Testa todas as rotas implementadas com requests reais

BASE_URL="http://localhost:3000/api/v1"
TOKEN=""

echo "=========================================="
echo "🧪 TESTE COMPLETO DA API - TODAS AS ROTAS"
echo "=========================================="
echo ""

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para testar endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4

    echo -e "${YELLOW}Testing:${NC} $method $endpoint"
    echo "Description: $description"

    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$BASE_URL$endpoint")
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo -e "${GREEN}✓ SUCCESS${NC} - HTTP $http_code"
        echo "Response: $(echo "$body" | head -c 200)..."
    else
        echo -e "${RED}✗ FAILED${NC} - HTTP $http_code"
        echo "Response: $body"
    fi
    echo ""
}

echo "=========================================="
echo "1️⃣  TESTANDO HEALTH CHECK"
echo "=========================================="
test_endpoint "GET" "/health" "" "Health check do servidor"

echo "=========================================="
echo "2️⃣  TESTANDO AUTENTICAÇÃO"
echo "=========================================="

# Login
echo "Tentando login..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
    -H "Content-Type: application/json" \
    -d '{
        "email": "admin@quayer.com",
        "password": "admin123456"
    }')

echo "Login Response: $LOGIN_RESPONSE"

# Extrair token (assumindo formato JSON com accessToken)
TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo -e "${RED}✗ ERRO: Não foi possível obter token de autenticação${NC}"
    echo "Tentando token alternativo do .env..."
    TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0IiwiZW1haWwiOiJ0ZXN0QHRlc3QuY29tIn0.test"
else
    echo -e "${GREEN}✓ Token obtido com sucesso${NC}"
    echo "Token: ${TOKEN:0:50}..."
fi

echo ""

echo "=========================================="
echo "3️⃣  TESTANDO ORGANIZATIONS"
echo "=========================================="
test_endpoint "GET" "/organizations?page=1&limit=10" "" "Listar organizações"

echo "=========================================="
echo "4️⃣  TESTANDO CONTACTS"
echo "=========================================="
test_endpoint "GET" "/contacts?page=1&limit=10" "" "Listar contatos"
test_endpoint "GET" "/contacts?page=1&limit=10&search=test" "" "Buscar contatos por nome"

echo "=========================================="
echo "5️⃣  TESTANDO TABULATIONS"
echo "=========================================="
test_endpoint "GET" "/tabulations" "" "Listar todas as tabulações"

# Criar tabulação de teste
echo "Criando tabulação de teste..."
CREATE_TAB_RESPONSE=$(curl -s -X POST "$BASE_URL/tabulations" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "teste_api_'$(date +%s)'",
        "description": "Tabulação criada por teste automatizado",
        "backgroundColor": "#ff5733"
    }')

echo "Response: $CREATE_TAB_RESPONSE"
TAB_ID=$(echo "$CREATE_TAB_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

if [ ! -z "$TAB_ID" ]; then
    echo -e "${GREEN}✓ Tabulação criada: $TAB_ID${NC}"

    # Testar GET by ID
    test_endpoint "GET" "/tabulations/$TAB_ID" "" "Buscar tabulação por ID"

    # Testar UPDATE
    test_endpoint "PATCH" "/tabulations/$TAB_ID" \
        '{"name":"teste_api_updated","backgroundColor":"#00ff00"}' \
        "Atualizar tabulação"

    # Testar DELETE
    test_endpoint "DELETE" "/tabulations/$TAB_ID" "" "Deletar tabulação"
fi

echo ""

echo "=========================================="
echo "6️⃣  TESTANDO SESSIONS"
echo "=========================================="
test_endpoint "GET" "/sessions?page=1&limit=10" "" "Listar sessões"
test_endpoint "GET" "/sessions?status=QUEUED&page=1&limit=10" "" "Filtrar sessões por status QUEUED"
test_endpoint "GET" "/sessions?status=ACTIVE&page=1&limit=10" "" "Filtrar sessões por status ACTIVE"

echo "=========================================="
echo "7️⃣  TESTANDO SESSIONS/CONTACTS (VIEW OTIMIZADA)"
echo "=========================================="
test_endpoint "GET" "/sessions/contacts?page=1&limit=10" "" "View otimizada para inbox"
test_endpoint "GET" "/sessions/contacts?status=QUEUED&responseFilter=unanswered" "" "Filtrar não respondidas"

echo "=========================================="
echo "8️⃣  TESTANDO MESSAGES"
echo "=========================================="
test_endpoint "GET" "/messages?page=1&limit=10" "" "Listar mensagens"

echo "=========================================="
echo "9️⃣  TESTANDO INSTANCES"
echo "=========================================="
test_endpoint "GET" "/instances?page=1&limit=10" "" "Listar instâncias WhatsApp"

echo ""
echo "=========================================="
echo "✅ TESTES CONCLUÍDOS"
echo "=========================================="
echo ""
echo "Resumo:"
echo "- Todas as rotas foram testadas"
echo "- Verifique os resultados acima para identificar problemas"
echo ""
