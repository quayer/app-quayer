import { test, expect } from '@playwright/test'
import {
  waitForPageLoad,
  screenshot,
  logStep,
  logBug,
  logSuccess,
  logWarning,
  getCurrentPath,
  elementExists
} from './test-helpers'

/**
 * ============================================================
 * TESTE E2E: JORNADA DE LOGIN COM OTP
 * ============================================================
 *
 * Este teste valida a jornada de login:
 * 1. Acessar /login
 * 2. Inserir email
 * 3. Receber OTP via email
 * 4. Verificar OTP
 * 5. Redirecionamento correto (admin/integracoes)
 *
 * MODO: INTERATIVO (pausa para inserir OTP manualmente)
 *
 * Para executar:
 * npm run test:e2e -- test/e2e/auth/login-otp.spec.ts --headed
 */

test.describe('Jornada Login OTP', () => {
  test.setTimeout(300000) // 5 minutos

  test('deve fazer login com OTP e redirecionar corretamente', async ({ page }) => {
    // IMPORTANTE: Use um email de usuario existente
    const testEmail = process.env.TEST_USER_EMAIL || 'seu.email@exemplo.com'
    const bugs: string[] = []

    console.log('\n' + '='.repeat(60))
    console.log('🧪 TESTE: Login com OTP')
    console.log('='.repeat(60))
    console.log(`📧 Email: ${testEmail}`)
    console.log('⚠️  Use um email de usuario JA CADASTRADO')
    console.log('='.repeat(60))

    // ========================================
    // STEP 1: Acessar pagina de login
    // ========================================
    logStep(1, 'Acessar pagina de login')

    await page.goto('/login')
    await waitForPageLoad(page)
    await screenshot(page, 'login-page', 1)

    // Verificar elementos da pagina
    const hasForm = await elementExists(page, 'form')
    if (!hasForm) {
      logBug('CRITICAL', 'Formulario de login nao encontrado')
      bugs.push('Form ausente')
    }

    // Verificar opcoes de login
    const hasGoogleButton = await page.locator('button:has-text("Google"), [aria-label*="Google"]').isVisible()
    const hasPasskeyOption = await page.locator('button:has-text("Passkey"), button:has-text("Chave")').isVisible()
    const hasEmailInput = await page.locator('input[type="email"], input[name="email"]').isVisible()

    console.log('📋 Opcoes de login encontradas:')
    console.log(`   - Email/OTP: ${hasEmailInput ? '✅' : '❌'}`)
    console.log(`   - Google OAuth: ${hasGoogleButton ? '✅' : '❌'}`)
    console.log(`   - Passkey: ${hasPasskeyOption ? '✅' : '❌'}`)

    if (!hasEmailInput) {
      logBug('CRITICAL', 'Campo de email nao encontrado')
      bugs.push('Email input ausente')
    }

    logSuccess('Pagina de login carregada')

    // ========================================
    // STEP 2: Preencher email
    // ========================================
    logStep(2, 'Preencher email')

    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    await emailInput.fill(testEmail)
    await screenshot(page, 'login-email-filled', 2)

    logSuccess(`Email preenchido: ${testEmail}`)

    // ========================================
    // STEP 3: Solicitar OTP
    // ========================================
    logStep(3, 'Solicitar codigo OTP')

    const submitButton = page.locator('button[type="submit"]').first()
    await submitButton.click()

    // Aguardar resposta
    await page.waitForTimeout(2000)
    await screenshot(page, 'login-otp-requested', 3)

    // Verificar redirecionamento para verify
    const currentPath = getCurrentPath(page)

    if (currentPath.includes('/login/verify')) {
      logSuccess('Redirecionado para /login/verify')
    } else if (currentPath.includes('/login')) {
      // Pode ter mostrado erro (usuario nao existe)
      const errorMessage = await page.locator('[class*="error"], [role="alert"], text=/erro|nao encontrado|not found/i').first().textContent().catch(() => null)
      if (errorMessage) {
        logWarning(`Mensagem exibida: ${errorMessage}`)
        logBug('MEDIUM', 'Usuario pode nao existir', errorMessage)
      }
    } else {
      logBug('HIGH', 'Redirecionamento inesperado', currentPath)
      bugs.push(`Redirect errado: ${currentPath}`)
    }

    // ========================================
    // STEP 4: Aguardar OTP (INTERATIVO)
    // ========================================
    logStep(4, 'Aguardar OTP via email')

    console.log('\n' + '!'.repeat(60))
    console.log('⏸️  PAUSA PARA INTERACAO MANUAL')
    console.log('!'.repeat(60))
    console.log(`📧 Verifique o email: ${testEmail}`)
    console.log('📝 Insira o codigo OTP de 6 digitos no navegador')
    console.log('⏳ Timeout: 2 minutos')
    console.log('!'.repeat(60) + '\n')

    await screenshot(page, 'login-otp-waiting', 4)

    // Aguardar redirecionamento apos OTP
    try {
      await page.waitForURL(/\/(integracoes|admin|onboarding)/, { timeout: 120000 })
      logSuccess('OTP verificado com sucesso!')
    } catch (e) {
      // Verificar se ainda esta na pagina de verify
      if (getCurrentPath(page).includes('/verify')) {
        logBug('CRITICAL', 'OTP nao foi verificado - timeout')
        bugs.push('OTP verification timeout')
        await screenshot(page, 'login-otp-failed', 4)
      }
      throw new Error('Login OTP timeout')
    }

    await screenshot(page, 'login-otp-verified', 4)

    // ========================================
    // STEP 5: Verificar redirecionamento
    // ========================================
    logStep(5, 'Verificar redirecionamento pos-login')

    const finalPath = getCurrentPath(page)
    console.log(`📍 Path final: ${finalPath}`)

    if (finalPath.includes('/integracoes')) {
      logSuccess('Usuario redirecionado para /integracoes (usuario comum)')
    } else if (finalPath.includes('/admin')) {
      logSuccess('Usuario redirecionado para /admin (administrador)')
    } else if (finalPath.includes('/onboarding')) {
      logWarning('Usuario redirecionado para /onboarding - onboarding incompleto?')
    } else {
      logBug('MEDIUM', 'Redirecionamento inesperado', finalPath)
      bugs.push(`Redirect final: ${finalPath}`)
    }

    await screenshot(page, 'login-final', 5)

    // ========================================
    // STEP 6: Verificar estado autenticado
    // ========================================
    logStep(6, 'Verificar estado autenticado')

    // Verificar se ha elementos de usuario autenticado
    const hasUserMenu = await elementExists(page, '[class*="avatar"], [class*="user-menu"], button:has-text("Sair")')
    const hasNavigation = await elementExists(page, 'nav, aside, [class*="sidebar"]')

    if (hasUserMenu) {
      logSuccess('Menu de usuario visivel')
    } else {
      logWarning('Menu de usuario nao encontrado')
    }

    if (hasNavigation) {
      logSuccess('Navegacao visivel')
    }

    // Verificar localStorage
    const accessToken = await page.evaluate(() => localStorage.getItem('accessToken'))
    if (accessToken) {
      logSuccess('Access token presente no localStorage')
    } else {
      logWarning('Access token nao encontrado no localStorage')
    }

    // ========================================
    // SUMARIO
    // ========================================
    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMARIO DO TESTE LOGIN OTP')
    console.log('='.repeat(60))

    if (bugs.length === 0) {
      console.log('✅ TESTE PASSOU - Login funcionando corretamente')
    } else {
      console.log(`❌ ${bugs.length} BUG(S) ENCONTRADO(S):`)
      bugs.forEach((bug, i) => console.log(`   ${i + 1}. ${bug}`))
    }

    console.log('='.repeat(60) + '\n')

    expect(bugs.length, 'Bugs encontrados no login').toBe(0)
  })

  test('deve exibir erro para email nao cadastrado', async ({ page }) => {
    const fakeEmail = `naoexiste.${Date.now()}@teste.com`
    const bugs: string[] = []

    console.log('\n' + '='.repeat(60))
    console.log('🧪 TESTE: Login com Email Inexistente')
    console.log('='.repeat(60))

    // STEP 1: Acessar login
    logStep(1, 'Acessar pagina de login')
    await page.goto('/login')
    await waitForPageLoad(page)

    // STEP 2: Inserir email fake
    logStep(2, 'Inserir email nao cadastrado')
    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    await emailInput.fill(fakeEmail)
    await screenshot(page, 'login-fake-email', 2)

    // STEP 3: Submeter
    logStep(3, 'Tentar login')
    const submitButton = page.locator('button[type="submit"]').first()
    await submitButton.click()

    await page.waitForTimeout(3000)
    await screenshot(page, 'login-fake-result', 3)

    // STEP 4: Verificar erro
    logStep(4, 'Verificar mensagem de erro')

    // Verificar se exibiu erro
    const errorVisible = await page.locator('[class*="error"], [role="alert"], [data-sonner-toast]').first().isVisible()
    const errorText = await page.locator('[class*="error"], [role="alert"], [data-sonner-toast]').first().textContent().catch(() => null)

    if (errorVisible && errorText) {
      logSuccess(`Erro exibido: "${errorText}"`)

      // Verificar se a mensagem e clara
      const isClareMessage = /nao encontrad|not found|email|usuario|inexistente/i.test(errorText)
      if (!isClareMessage) {
        logWarning('Mensagem de erro pode nao ser clara para o usuario')
      }
    } else {
      logBug('HIGH', 'Erro nao exibido para email inexistente')
      bugs.push('Sem feedback para email invalido')
    }

    // Verificar se nao redirecionou para verify
    const currentPath = getCurrentPath(page)
    if (currentPath.includes('/verify')) {
      logBug('CRITICAL', 'Redirecionou para verify mesmo com email inexistente!')
      bugs.push('Redirect indevido para verify')
    } else {
      logSuccess('Permaneceu na pagina de login (correto)')
    }

    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMARIO')
    console.log('='.repeat(60))
    if (bugs.length === 0) {
      console.log('✅ TESTE PASSOU - Erro tratado corretamente')
    } else {
      console.log(`❌ ${bugs.length} BUG(S): ${bugs.join(', ')}`)
    }
    console.log('='.repeat(60) + '\n')

    expect(bugs.length).toBe(0)
  })
})
