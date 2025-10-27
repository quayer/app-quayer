#!/bin/bash

# ===========================================
# 🧪 QUAYER - TEST SCRIPT
# ===========================================
# Executa suite completa de testes
# Uso: ./scripts/test.sh [tipo]
# Tipos: unit, api, e2e, all (default)

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

TEST_TYPE=${1:-all}

echo "=========================================="
echo "🧪 QUAYER - TEST SUITE"
echo "=========================================="
echo ""

# Start time
START_TIME=$(date +%s)

# Function to print test result
print_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2 PASSED${NC}"
        return 0
    else
        echo -e "${RED}❌ $2 FAILED${NC}"
        return 1
    fi
}

# Run linting
if [ "$TEST_TYPE" == "all" ]; then
    echo -e "${BLUE}🔍 Running Lint...${NC}"
    npm run lint
    print_result $? "Lint"
    echo ""
fi

# Run unit tests
if [ "$TEST_TYPE" == "unit" ] || [ "$TEST_TYPE" == "all" ]; then
    echo -e "${BLUE}🧪 Running Unit Tests...${NC}"
    npm run test:unit
    print_result $? "Unit Tests"
    echo ""
fi

# Run API tests
if [ "$TEST_TYPE" == "api" ] || [ "$TEST_TYPE" == "all" ]; then
    echo -e "${BLUE}🌐 Running API Tests...${NC}"

    # Ensure Docker services are running
    if ! docker ps | grep -q quayer-postgres; then
        echo -e "${YELLOW}⚠️  Starting Docker services...${NC}"
        docker-compose up -d
        sleep 5
    fi

    npm run test:api
    print_result $? "API Tests"
    echo ""
fi

# Run E2E tests
if [ "$TEST_TYPE" == "e2e" ] || [ "$TEST_TYPE" == "all" ]; then
    echo -e "${BLUE}🎭 Running E2E Tests...${NC}"

    # Check if server is running
    if ! curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
        echo -e "${YELLOW}⚠️  Server not running, starting...${NC}"
        npm run dev > /dev/null 2>&1 &
        SERVER_PID=$!

        # Wait for server
        echo "⏳ Waiting for server to be ready..."
        for i in {1..30}; do
            if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
                echo -e "${GREEN}✅ Server ready${NC}"
                break
            fi
            sleep 1
        done
    fi

    # Install Playwright browsers if needed
    if [ ! -d ~/.cache/ms-playwright ]; then
        echo "📦 Installing Playwright browsers..."
        npx playwright install
    fi

    npm run test:e2e
    E2E_RESULT=$?

    # Kill server if we started it
    if [ ! -z "$SERVER_PID" ]; then
        kill $SERVER_PID 2> /dev/null || true
    fi

    print_result $E2E_RESULT "E2E Tests"
    echo ""
fi

# Build test
if [ "$TEST_TYPE" == "all" ]; then
    echo -e "${BLUE}🏗️  Running Build...${NC}"
    npm run build
    print_result $? "Build"
    echo ""
fi

# End time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Summary
echo "=========================================="
echo "📊 TEST SUMMARY"
echo "=========================================="
echo ""
echo "Test Type: $TEST_TYPE"
echo "Duration: ${DURATION}s"
echo ""

# Coverage report (if available)
if [ -d coverage ]; then
    echo "📈 Coverage Report:"
    if command -v jq &> /dev/null && [ -f coverage/coverage-summary.json ]; then
        cat coverage/coverage-summary.json | jq '.total | {lines: .lines.pct, statements: .statements.pct, functions: .functions.pct, branches: .branches.pct}'
    else
        echo "Run 'npm run test:unit:coverage' for detailed coverage"
    fi
    echo ""
fi

echo -e "${GREEN}✅ All tests completed!${NC}"
echo ""
echo "=========================================="
