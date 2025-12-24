import { test, expect } from '@playwright/test'
import { TEST_CONFIG, getTestEmail, logTestConfig } from './test-config'
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
 * TESTE E2E COMPLETO: JORNADAS DE AUTENTICACAO
 * ============================================================
 *
 * Este arquivo executa todas as jornadas de auth em sequencia:
 * 1. Signup PF com verificacao de email
 * 2. Signup PJ com verificacao de email
 * 3. Login OTP
 * 4. Convite para equipe
 *
 * EXECUTAR:
 * npx playwright test test/e2e/auth/jornada-completa-auth.spec.ts --headed
 *
 * ou para gravar video:
 * npx playwright test test/e2e/auth/jornada-completa-auth.spec.ts --headed --video=on
 */

// Usar URL de producao
test.use({
  baseURL: TEST_CONFIG.baseUrl,
  video: 'on', // Gravar video de todos os testes
  trace: 'on', // Gravar trace para debug
})

// Rodar sequencialmente para evitar conflitos
test.describe.configure({ mode: 'serial' })

// Armazenar bugs encontrados
const allBugs: { test: string; bugs: string[] }[] = []

test.describe('Jornada Completa de Autenticacao - Producao', () => {
  test.setTimeout(600000) // 10 minutos por teste

  test.beforeAll(() => {
    logTestConfig()
  })

  // ============================================
  // TESTE 1: SIGNUP PESSOA FISICA
  // ============================================
  test('1. Signup Pessoa Fisica (PF)', async ({ page }) => {
    const email = getTestEmail('signupPF')
    const bugs: string[] = []

    console.log('\n' + '🔵'.repeat(30))
    console.log('🧪 TESTE 1: SIGNUP PESSOA FISICA')
    console.log(`📧 Email: ${email}`)
    console.log('🔵'.repeat(30) + '\n')

    // STEP 1: Acessar signup
    logStep(1, 'Acessar pagina de signup')
    await page.goto('/signup')
    await waitForPageLoad(page)
    await screenshot(page, '01-pf-signup-page', 1)

    // Verificar elementos
    const hasNameInput = await elementExists(page, 'input[name="name"], input[placeholder*="nome" i]')
    const hasEmailInput = await elementExists(page, 'input[type="email"], input[name="email"]')

    if (!hasNameInput || !hasEmailInput) {
      logBug('CRITICAL', 'Campos de signup nao encontrados')
      bugs.push('Form incompleto')
    } else {
      logSuccess('Pagina de signup OK')
    }

    // STEP 2: Preencher dados
    logStep(2, 'Preencher dados')
    const nameInput = page.locator('input[name="name"], input[placeholder*="nome" i]').first()
    const emailInput = page.locator('input[type="email"], input[name="email"]').first()

    const userName = `Teste PF ${Date.now()}`
    await nameInput.fill(userName)
    await emailInput.fill(email)
    await screenshot(page, '01-pf-signup-filled', 2)
    logSuccess(`Dados: ${userName} / ${email}`)

    // STEP 3: Submeter
    logStep(3, 'Submeter formulario')
    const submitBtn = page.locator('button[type="submit"]').first()
    await submitBtn.click()
    await page.waitForTimeout(3000)
    await screenshot(page, '01-pf-signup-submitted', 3)

    // Verificar redirecionamento
    const path = getCurrentPath(page)
    if (path.includes('/signup/verify')) {
      logSuccess('Redirecionado para verificacao OTP')
    } else {
      // Verificar se email ja existe
      const errorMsg = await page.locator('text=/ja existe|already exists|email cadastrado/i').first().isVisible()
      if (errorMsg) {
        logWarning('Email ja cadastrado - precisa excluir organizacao')
        bugs.push('Email ja cadastrado')
      } else {
        logBug('HIGH', 'Nao redirecionou para /signup/verify', path)
        bugs.push(`Redirect: ${path}`)
      }
    }

    // STEP 4: Aguardar OTP
    if (path.includes('/signup/verify')) {
      logStep(4, 'AGUARDANDO OTP')
      console.log('\n' + '⚠️'.repeat(20))
      console.log('ACAO MANUAL NECESSARIA:')
      console.log(`📧 Verifique o email: ${email}`)
      console.log('📝 Insira o codigo OTP no navegador')
      console.log('⏳ Tempo: 3 minutos')
      console.log('⚠️'.repeat(20) + '\n')

      await screenshot(page, '01-pf-otp-waiting', 4)

      try {
        await page.waitForURL(/\/(onboarding|integracoes)/, { timeout: TEST_CONFIG.timeouts.otp })
        logSuccess('OTP verificado!')
        await screenshot(page, '01-pf-otp-verified', 4)
      } catch (e) {
        logBug('CRITICAL', 'Timeout OTP')
        bugs.push('OTP timeout')
      }
    }

    // STEP 5: Onboarding PF
    const currentPath = getCurrentPath(page)
    if (currentPath.includes('/onboarding')) {
      logStep(5, 'Completar onboarding PF')
      await screenshot(page, '01-pf-onboarding-start', 5)

      console.log('\n' + '⚠️'.repeat(20))
      console.log('ACAO MANUAL:')
      console.log('📝 Selecione "Pessoa Fisica"')
      console.log('📝 Preencha os dados da organizacao')
      console.log('📝 Clique em Continuar/Finalizar')
      console.log('⚠️'.repeat(20) + '\n')

      try {
        await page.waitForURL(/\/integracoes/, { timeout: TEST_CONFIG.timeouts.otp })
        logSuccess('Onboarding PF completado!')
        await screenshot(page, '01-pf-onboarding-done', 5)
      } catch (e) {
        logWarning('Timeout onboarding')
      }
    }

    // STEP 6: Dashboard
    logStep(6, 'Verificar dashboard')
    const finalPath = getCurrentPath(page)
    await screenshot(page, '01-pf-final', 6)

    if (finalPath.includes('/integracoes')) {
      logSuccess('Usuario no dashboard!')
    }

    // Salvar bugs
    allBugs.push({ test: 'Signup PF', bugs })

    console.log('\n' + '='.repeat(50))
    console.log(`📊 RESULTADO: ${bugs.length === 0 ? '✅ PASSOU' : `❌ ${bugs.length} bug(s)`}`)
    console.log('='.repeat(50) + '\n')

    expect(bugs.length, 'Bugs encontrados').toBe(0)
  })

  // ============================================
  // TESTE 2: SIGNUP PESSOA JURIDICA
  // ============================================
  test('2. Signup Pessoa Juridica (PJ)', async ({ page }) => {
    const email = getTestEmail('signupPJ')
    const bugs: string[] = []

    console.log('\n' + '🔵'.repeat(30))
    console.log('🧪 TESTE 2: SIGNUP PESSOA JURIDICA')
    console.log(`📧 Email: ${email}`)
    console.log('🔵'.repeat(30) + '\n')

    // Mesmo fluxo do PF, mas seleciona PJ no onboarding
    logStep(1, 'Acessar signup')
    await page.goto('/signup')
    await waitForPageLoad(page)

    logStep(2, 'Preencher dados')
    const nameInput = page.locator('input[name="name"], input[placeholder*="nome" i]').first()
    const emailInput = page.locator('input[type="email"], input[name="email"]').first()

    const userName = `Teste PJ ${Date.now()}`
    await nameInput.fill(userName)
    await emailInput.fill(email)
    await screenshot(page, '02-pj-signup-filled', 2)

    logStep(3, 'Submeter')
    await page.locator('button[type="submit"]').first().click()
    await page.waitForTimeout(3000)

    const path = getCurrentPath(page)
    if (path.includes('/signup/verify')) {
      logStep(4, 'AGUARDANDO OTP')
      console.log(`📧 Verifique: ${email}`)

      try {
        await page.waitForURL(/\/(onboarding|integracoes)/, { timeout: TEST_CONFIG.timeouts.otp })
        logSuccess('OTP verificado!')
      } catch (e) {
        bugs.push('OTP timeout')
      }
    } else {
      const errorVisible = await page.locator('text=/ja existe|already/i').first().isVisible()
      if (errorVisible) {
        bugs.push('Email ja cadastrado')
      }
    }

    if (getCurrentPath(page).includes('/onboarding')) {
      logStep(5, 'Onboarding PJ')
      console.log('📝 Selecione "Pessoa Juridica" e complete')

      try {
        await page.waitForURL(/\/integracoes/, { timeout: TEST_CONFIG.timeouts.otp })
        logSuccess('Onboarding PJ OK!')
      } catch (e) {
        logWarning('Timeout onboarding')
      }
    }

    await screenshot(page, '02-pj-final', 6)
    allBugs.push({ test: 'Signup PJ', bugs })

    console.log(`📊 RESULTADO: ${bugs.length === 0 ? '✅ PASSOU' : `❌ ${bugs.length} bug(s)`}`)
    expect(bugs.length).toBe(0)
  })

  // ============================================
  // TESTE 3: LOGIN OTP
  // ============================================
  test('3. Login com OTP', async ({ page }) => {
    const email = getTestEmail('loginOTP')
    const bugs: string[] = []

    console.log('\n' + '🔵'.repeat(30))
    console.log('🧪 TESTE 3: LOGIN OTP')
    console.log(`📧 Email: ${email}`)
    console.log('🔵'.repeat(30) + '\n')

    logStep(1, 'Acessar login')
    await page.goto('/login')
    await waitForPageLoad(page)
    await screenshot(page, '03-login-page', 1)

    // Verificar opcoes
    const hasGoogle = await elementExists(page, 'button:has-text("Google"), [aria-label*="Google"]')
    const hasPasskey = await elementExists(page, 'button:has-text("Passkey"), button:has-text("Chave")')
    console.log(`📋 Opcoes: Email ✅ | Google ${hasGoogle ? '✅' : '❌'} | Passkey ${hasPasskey ? '✅' : '❌'}`)

    logStep(2, 'Preencher email')
    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    await emailInput.fill(email)
    await screenshot(page, '03-login-email', 2)

    logStep(3, 'Solicitar OTP')
    await page.locator('button[type="submit"]').first().click()
    await page.waitForTimeout(3000)
    await screenshot(page, '03-login-otp-sent', 3)

    const path = getCurrentPath(page)
    if (path.includes('/login/verify')) {
      logStep(4, 'AGUARDANDO OTP')
      console.log(`📧 Verifique: ${email}`)

      try {
        await page.waitForURL(/\/(integracoes|admin)/, { timeout: TEST_CONFIG.timeouts.otp })
        logSuccess('Login realizado!')
        await screenshot(page, '03-login-success', 4)
      } catch (e) {
        bugs.push('Login OTP timeout')
      }
    } else {
      // Verificar erro
      const errorMsg = await page.locator('[class*="error"], [role="alert"]').first().textContent().catch(() => null)
      if (errorMsg) {
        logBug('HIGH', 'Erro no login', errorMsg)
        bugs.push(`Erro: ${errorMsg}`)
      }
    }

    // Verificar estado final
    logStep(5, 'Verificar estado autenticado')
    const finalPath = getCurrentPath(page)
    await screenshot(page, '03-login-final', 5)

    if (finalPath.includes('/integracoes') || finalPath.includes('/admin')) {
      logSuccess('Usuario autenticado no dashboard!')

      // Verificar token
      const token = await page.evaluate(() => localStorage.getItem('accessToken'))
      if (token) {
        logSuccess('Token presente no localStorage')
      } else {
        logWarning('Token nao encontrado')
      }
    }

    allBugs.push({ test: 'Login OTP', bugs })
    console.log(`📊 RESULTADO: ${bugs.length === 0 ? '✅ PASSOU' : `❌ ${bugs.length} bug(s)`}`)
    expect(bugs.length).toBe(0)
  })

  // ============================================
  // TESTE 4: CONVITE PARA EQUIPE
  // ============================================
  test('4. Convite para Equipe', async ({ page }) => {
    const adminEmail = getTestEmail('inviteAdmin')
    const memberEmail = getTestEmail('inviteMember')
    const bugs: string[] = []

    console.log('\n' + '🔵'.repeat(30))
    console.log('🧪 TESTE 4: CONVITE PARA EQUIPE')
    console.log(`👤 Admin: ${adminEmail}`)
    console.log(`📧 Membro: ${memberEmail}`)
    console.log('🔵'.repeat(30) + '\n')

    // Primeiro, fazer login como admin
    logStep(1, 'Login como admin')
    await page.goto('/login')
    await waitForPageLoad(page)

    const emailInput = page.locator('input[type="email"], input[name="email"]').first()
    await emailInput.fill(adminEmail)
    await page.locator('button[type="submit"]').first().click()

    await page.waitForTimeout(2000)

    if (getCurrentPath(page).includes('/login/verify')) {
      console.log(`📧 OTP enviado para: ${adminEmail}`)
      console.log('⏳ Aguardando login...')

      try {
        await page.waitForURL(/\/(integracoes|admin)/, { timeout: TEST_CONFIG.timeouts.otp })
        logSuccess('Admin logado!')
      } catch (e) {
        bugs.push('Admin login timeout')
      }
    } else if (getCurrentPath(page).includes('/integracoes')) {
      logSuccess('Ja estava logado')
    }

    await screenshot(page, '04-invite-admin-logged', 1)

    // STEP 2: Navegar para equipe
    logStep(2, 'Navegar para equipe')

    // Tentar encontrar link de equipe
    const teamSelectors = [
      'a[href*="equipe"]',
      'a[href*="team"]',
      'a[href*="members"]',
      'text=Equipe',
      'text=Membros'
    ]

    let found = false
    for (const sel of teamSelectors) {
      const el = page.locator(sel).first()
      if (await el.isVisible().catch(() => false)) {
        await el.click()
        found = true
        break
      }
    }

    if (!found) {
      console.log('⚠️ Link de equipe nao encontrado automaticamente')
      console.log('📝 Navegue manualmente para a pagina de equipe')
      await page.pause()
    }

    await page.waitForTimeout(2000)
    await screenshot(page, '04-invite-team-page', 2)

    // STEP 3: Convidar membro
    logStep(3, 'Convidar novo membro')

    const inviteSelectors = [
      'button:has-text("Convidar")',
      'button:has-text("Adicionar")',
      'button:has-text("Novo")'
    ]

    for (const sel of inviteSelectors) {
      const btn = page.locator(sel).first()
      if (await btn.isVisible().catch(() => false)) {
        await btn.click()
        break
      }
    }

    await page.waitForTimeout(500)
    await screenshot(page, '04-invite-modal', 3)

    // Preencher email do convidado
    const inviteEmailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first()
    if (await inviteEmailInput.isVisible()) {
      await inviteEmailInput.fill(memberEmail)
      logSuccess(`Email do convidado: ${memberEmail}`)
    }

    await screenshot(page, '04-invite-filled', 3)

    // Enviar convite
    const sendBtn = page.locator('button:has-text("Enviar"), button:has-text("Convidar"), button[type="submit"]').first()
    if (await sendBtn.isVisible()) {
      await sendBtn.click()
    }

    await page.waitForTimeout(2000)
    await screenshot(page, '04-invite-sent', 3)

    // Verificar feedback
    const successToast = await page.locator('[data-sonner-toast][data-type="success"], text=/enviado|sucesso/i').first().isVisible().catch(() => false)
    if (successToast) {
      logSuccess('Convite enviado com sucesso!')
    } else {
      const errorToast = await page.locator('[data-sonner-toast][data-type="error"]').first().textContent().catch(() => null)
      if (errorToast) {
        logBug('HIGH', 'Erro ao enviar convite', errorToast)
        bugs.push(`Erro: ${errorToast}`)
      }
    }

    allBugs.push({ test: 'Convite Equipe', bugs })
    console.log(`📊 RESULTADO: ${bugs.length === 0 ? '✅ PASSOU' : `❌ ${bugs.length} bug(s)`}`)
    expect(bugs.length).toBe(0)
  })

  // ============================================
  // SUMARIO FINAL
  // ============================================
  test.afterAll(() => {
    console.log('\n\n' + '🎯'.repeat(30))
    console.log('SUMARIO FINAL - TESTES DE AUTENTICACAO')
    console.log('🎯'.repeat(30))

    let totalBugs = 0
    allBugs.forEach(({ test, bugs }) => {
      const status = bugs.length === 0 ? '✅' : '❌'
      console.log(`${status} ${test}: ${bugs.length === 0 ? 'OK' : bugs.join(', ')}`)
      totalBugs += bugs.length
    })

    console.log('\n' + '='.repeat(50))
    if (totalBugs === 0) {
      console.log('✅ TODOS OS TESTES PASSARAM!')
    } else {
      console.log(`❌ TOTAL DE BUGS: ${totalBugs}`)
    }
    console.log('='.repeat(50))
    console.log('📁 Videos salvos em: test-results/')
    console.log('📸 Screenshots em: test-results/screenshots/')
    console.log('🎯'.repeat(30) + '\n')
  })
})
