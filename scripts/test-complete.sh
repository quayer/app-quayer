#!/bin/bash
# Script Consolidado de Testes Completos
# Consolida: test-all-routes.sh, test-all-api-routes.sh, test-complete-flow.sh

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     QUAYER - SUITE DE TESTES COMPLETA           ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# Função para log colorido
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Verificar se servidor está rodando
check_server() {
  log_info "Verificando servidor em $BASE_URL..."
  if curl -s "$BASE_URL/api/health" > /dev/null 2>&1; then
    log_success "Servidor está rodando"
    return 0
  else
    log_error "Servidor não está rodando em $BASE_URL"
    echo ""
    echo "Por favor, inicie o servidor:"
    echo "  npm run dev"
    exit 1
  fi
}

# Testes de Health
test_health() {
  log_info "Testando Health Check..."
  response=$(curl -s -w "\n%{http_code}" "$BASE_URL/api/health")
  http_code=$(echo "$response" | tail -n1)

  if [ "$http_code" = "200" ]; then
    log_success "Health Check: OK"
    return 0
  else
    log_error "Health Check: FALHOU (HTTP $http_code)"
    return 1
  fi
}

# Testes de API (Unit)
test_unit() {
  log_info "Executando testes unitários..."
  if npm run test:unit --silent; then
    log_success "Testes unitários: PASSOU"
    return 0
  else
    log_error "Testes unitários: FALHOU"
    return 1
  fi
}

# Testes de API (Integration)
test_api() {
  log_info "Executando testes de API..."
  if npm run test:api --silent; then
    log_success "Testes de API: PASSOU"
    return 0
  else
    log_error "Testes de API: FALHOU"
    return 1
  fi
}

# Testes E2E
test_e2e() {
  log_info "Executando testes E2E..."
  if npm run test:e2e --silent; then
    log_success "Testes E2E: PASSOU"
    return 0
  else
    log_error "Testes E2E: FALHOU"
    return 1
  fi
}

# Testes de Lint
test_lint() {
  log_info "Executando lint..."
  if npm run lint --silent; then
    log_success "Lint: PASSOU"
    return 0
  else
    log_error "Lint: FALHOU"
    return 1
  fi
}

# Parse argumentos
RUN_UNIT=true
RUN_API=true
RUN_E2E=true
RUN_LINT=true
QUICK_MODE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --quick)
      QUICK_MODE=true
      RUN_E2E=false
      shift
      ;;
    --unit-only)
      RUN_API=false
      RUN_E2E=false
      RUN_LINT=false
      shift
      ;;
    --api-only)
      RUN_UNIT=false
      RUN_E2E=false
      RUN_LINT=false
      shift
      ;;
    --e2e-only)
      RUN_UNIT=false
      RUN_API=false
      RUN_LINT=false
      shift
      ;;
    --no-lint)
      RUN_LINT=false
      shift
      ;;
    --help)
      echo "Uso: $0 [opções]"
      echo ""
      echo "Opções:"
      echo "  --quick        Modo rápido (sem E2E)"
      echo "  --unit-only    Apenas testes unitários"
      echo "  --api-only     Apenas testes de API"
      echo "  --e2e-only     Apenas testes E2E"
      echo "  --no-lint      Pular verificação de lint"
      echo "  --help         Mostrar esta mensagem"
      exit 0
      ;;
    *)
      log_warning "Opção desconhecida: $1"
      shift
      ;;
  esac
done

# Executar testes
FAILED=0

echo ""
log_info "Iniciando suite de testes..."
echo ""

# Health check
check_server || exit 1
echo ""

# Lint
if [ "$RUN_LINT" = true ]; then
  test_lint || ((FAILED++))
  echo ""
fi

# Unit tests
if [ "$RUN_UNIT" = true ]; then
  test_unit || ((FAILED++))
  echo ""
fi

# API tests
if [ "$RUN_API" = true ]; then
  test_api || ((FAILED++))
  echo ""
fi

# E2E tests
if [ "$RUN_E2E" = true ]; then
  test_e2e || ((FAILED++))
  echo ""
fi

# Resumo
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║               RESUMO DOS TESTES                  ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════╝${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  log_success "Todos os testes passaram! 🎉"
  echo ""
  exit 0
else
  log_error "$FAILED suite(s) de testes falharam"
  echo ""
  echo "Dicas para debug:"
  echo "  - Verifique os logs acima para detalhes"
  echo "  - Execute testes específicos: npm run test:unit, test:api, test:e2e"
  echo "  - Use --quick para testes rápidos"
  exit 1
fi
