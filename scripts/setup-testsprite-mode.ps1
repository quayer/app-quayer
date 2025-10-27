# ============================================
# TestSprite Mode Setup Script
# ============================================
# 
# Este script configura as variáveis de ambiente
# necessárias para executar testes E2E com TestSprite
#
# Uso:
#   .\scripts\setup-testsprite-mode.ps1
# ============================================

Write-Host ""
Write-Host "🧪 TestSprite - Configuração de Ambiente de Teste" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se .env.local já existe
$envLocalPath = Join-Path $PSScriptRoot "..\..\.env.local"

if (Test-Path $envLocalPath) {
    Write-Host "⚠️  Arquivo .env.local já existe!" -ForegroundColor Yellow
    Write-Host ""
    $response = Read-Host "Deseja sobrescrever? (S/N)"
    
    if ($response -ne "S" -and $response -ne "s") {
        Write-Host ""
        Write-Host "❌ Operação cancelada." -ForegroundColor Red
        Write-Host ""
        exit 0
    }
}

# Criar conteúdo do .env.local
$envContent = @"
# ============================================
# TestSprite - Ambiente de Teste E2E
# ============================================
# Gerado automaticamente em: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
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
"@

# Escrever arquivo
try {
    $envContent | Out-File -FilePath $envLocalPath -Encoding UTF8 -Force
    
    Write-Host ""
    Write-Host "✅ Arquivo .env.local criado com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📄 Localização: $envLocalPath" -ForegroundColor White
    Write-Host ""
    Write-Host "🎯 Próximos passos:" -ForegroundColor Cyan
    Write-Host "   1. Reinicie o servidor: npm run dev" -ForegroundColor White
    Write-Host "   2. Execute os testes TestSprite" -ForegroundColor White
    Write-Host "   3. Verifique logs para: '🧪 MODO DE TESTE ATIVADO'" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  Lembre-se: NUNCA habilite TEST_MODE em produção!" -ForegroundColor Yellow
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "❌ Erro ao criar arquivo .env.local:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    exit 1
}

# Configurar também no ambiente da sessão atual
Write-Host "🔧 Configurando variáveis de ambiente da sessão atual..." -ForegroundColor Cyan
$env:TESTSPRITE_MODE = "true"
$env:TEST_MODE = "true"
$env:ADMIN_RECOVERY_TOKEN = "123456"

Write-Host "✅ Variáveis de ambiente configuradas!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Verificação:" -ForegroundColor Cyan
Write-Host "   TESTSPRITE_MODE = $env:TESTSPRITE_MODE" -ForegroundColor White
Write-Host "   TEST_MODE = $env:TEST_MODE" -ForegroundColor White
Write-Host "   ADMIN_RECOVERY_TOKEN = $env:ADMIN_RECOVERY_TOKEN" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Pronto para testes!" -ForegroundColor Green
Write-Host ""





