#!/bin/bash

# ============================================
# TestSprite Mode Setup Script
# ============================================
# 
# Este script configura as variáveis de ambiente
# necessárias para executar testes E2E com TestSprite
#
# Uso:
#   chmod +x scripts/setup-testsprite-mode.sh
#   ./scripts/setup-testsprite-mode.sh
# ============================================

echo ""
echo "🧪 TestSprite - Configuração de Ambiente de Teste"
echo "================================================="
echo ""

# Verificar se .env.local já existe
if [ -f .env.local ]; then
    echo "⚠️  Arquivo .env.local já existe!"
    echo ""
    read -p "Deseja sobrescrever? (S/N): " response
    
    if [ "$response" != "S" ] && [ "$response" != "s" ]; then
        echo ""
        echo "❌ Operação cancelada."
        echo ""
        exit 0
    fi
fi

# Criar conteúdo do .env.local
cat > .env.local << 'EOF'
# ============================================
# TestSprite - Ambiente de Teste E2E
# ============================================
# Gerado automaticamente
# ⚠️ NUNCA commitar este arquivo no Git!
# ⚠️ NUNCA usar TEST_MODE=true em produção!
# ============================================

# TestSprite Mode - Habilita códigos de teste (123456, 999999)
TESTSPRITE_MODE=true
TEST_MODE=true

# Recovery Token (código de fallback universal)
ADMIN_RECOVERY_TOKEN=123456

# ============================================
# Códigos OTP Aceitos em Modo de Teste:
# - 123456 (padrão)
# - 999999 (alternativo)
# ============================================

# ============================================
# Endpoints Afetados:
# - POST /api/v1/auth/verify-login-otp
# - POST /api/v1/auth/verify-signup-otp
# - POST /api/v1/auth/verify-email
# ============================================
EOF

echo ""
echo "✅ Arquivo .env.local criado com sucesso!"
echo ""
echo "📄 Localização: $(pwd)/.env.local"
echo ""
echo "🎯 Próximos passos:"
echo "   1. Reinicie o servidor: npm run dev"
echo "   2. Execute os testes TestSprite"
echo "   3. Verifique logs para: '🧪 MODO DE TESTE ATIVADO'"
echo ""
echo "⚠️  Lembre-se: NUNCA habilite TEST_MODE em produção!"
echo ""

# Configurar também no ambiente da sessão atual
export TESTSPRITE_MODE=true
export TEST_MODE=true
export ADMIN_RECOVERY_TOKEN=123456

echo "🔧 Variáveis de ambiente configuradas na sessão atual!"
echo ""
echo "📊 Verificação:"
echo "   TESTSPRITE_MODE = $TESTSPRITE_MODE"
echo "   TEST_MODE = $TEST_MODE"
echo "   ADMIN_RECOVERY_TOKEN = $ADMIN_RECOVERY_TOKEN"
echo ""
echo "🚀 Pronto para testes!"
echo ""





