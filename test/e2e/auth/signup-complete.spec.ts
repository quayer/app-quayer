import { test, expect } from '@playwright/test'
import { getTestEmail } from './test-config'
import {
  generateTestUser,
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
 * TESTE E2E: JORNADA COMPLETA DE SIGNUP
 * ============================================================
 *
 * Este teste valida a jornada completa de criacao de conta:
 * 1. Signup (nome + email)
 * 2. Verificacao OTP via email
 * 3. Onboarding (PF ou PJ)
 * 4. Redirecionamento para dashboard
 *
 * MODO: INTERATIVO (pausa para inserir OTP manualmente)
 *
 * Para executar:
 * npm run test:e2e -- test/e2e/auth/signup-complete.spec.ts --headed
 */

test.describe('Jornada Signup Completo', () => {
  // Configuracao para teste interativo
  test.setTimeout(300000) // 5 minutos para permitir interacao manual

  test.describe('Pessoa Fisica (PF)', () => {
    test('deve criar conta PF, verificar email e completar onboarding', async ({ page }) => {
      // Usar email real do config
      const realEmail = getTestEmail('signupPF')
      const user = {
        ...generateTestUser('pf'),
        email: realEmail, // Sobrescrever com email real
      }
      const bugs: string[] = []

      console.log('\n' + '='.repeat(60))
      console.log('🧪 TESTE: Criar Conta Pessoa Fisica (PF)')
      console.log('='.repeat(60))
      console.log(`📧 Email: ${user.email}`)
      console.log(`👤 Nome: ${user.name}`)
      console.log('='.repeat(60))

      // ========================================
      // STEP 1: Acessar pagina de signup
      // ========================================
      logStep(1, 'Acessar pagina de signup')

      await page.goto('/signup')
      await waitForPageLoad(page)
      await screenshot(page, 'signup-page', 1)

      // Verificar se a pagina carregou corretamente
      const hasSignupForm = await elementExists(page, 'form')
      if (!hasSignupForm) {
        logBug('CRITICAL', 'Formulario de signup nao encontrado')
        bugs.push('Formulario de signup nao renderizado')
      }

      // Verificar elementos esperados
      const nameInput = page.locator('input[name="name"], input[placeholder*="nome" i]').first()
      const emailInput = page.locator('input[name="email"], input[type="email"]').first()

      if (!(await nameInput.isVisible())) {
        logBug('HIGH', 'Campo de nome nao visivel')
        bugs.push('Campo nome ausente')
      }

      if (!(await emailInput.isVisible())) {
        logBug('HIGH', 'Campo de email nao visivel')
        bugs.push('Campo email ausente')
      }

      logSuccess('Pagina de signup carregada')

      // ========================================
      // STEP 2: Preencher dados de signup
      // ========================================
      logStep(2, 'Preencher dados de signup')

      await nameInput.fill(user.name)
      await emailInput.fill(user.email)
      await screenshot(page, 'signup-filled', 2)

      logSuccess(`Dados preenchidos: ${user.name} / ${user.email}`)

      // ========================================
      // STEP 3: Submeter formulario
      // ========================================
      logStep(3, 'Submeter formulario de signup')

      const submitButton = page.locator('button[type="submit"]').first()
      await submitButton.click()

      // Aguardar resposta
      await page.waitForTimeout(2000)
      await screenshot(page, 'signup-submitted', 3)

      // Verificar redirecionamento para verify
      const currentPath = getCurrentPath(page)
      if (!currentPath.includes('/signup/verify')) {
        logBug('CRITICAL', 'Nao redirecionou para /signup/verify', `Path atual: ${currentPath}`)
        bugs.push(`Redirect errado: ${currentPath}`)
      } else {
        logSuccess('Redirecionado para verificacao OTP')
      }

      // ========================================
      // STEP 4: Aguardar OTP (INTERATIVO)
      // ========================================
      logStep(4, 'Aguardar OTP via email')

      console.log('\n' + '!'.repeat(60))
      console.log('⏸️  PAUSA PARA INTERACAO MANUAL')
      console.log('!'.repeat(60))
      console.log(`📧 Verifique o email: ${user.email}`)
      console.log('📝 Insira o codigo OTP de 6 digitos no navegador')
      console.log('⏳ Timeout: 2 minutos')
      console.log('!'.repeat(60) + '\n')

      await screenshot(page, 'otp-waiting', 4)

      // Aguardar usuario inserir OTP e submeter
      // O teste continuara quando detectar mudanca de pagina
      try {
        await page.waitForURL(/\/(onboarding|integracoes)/, { timeout: 120000 })
        logSuccess('OTP verificado com sucesso!')
      } catch (e) {
        logBug('CRITICAL', 'Timeout aguardando verificacao OTP')
        bugs.push('OTP nao verificado em 2 minutos')
        await screenshot(page, 'otp-timeout', 4)
        throw new Error('OTP verification timeout')
      }

      await screenshot(page, 'otp-verified', 4)

      // ========================================
      // STEP 5: Verificar redirecionamento pos-OTP
      // ========================================
      logStep(5, 'Verificar redirecionamento pos-OTP')

      const postOtpPath = getCurrentPath(page)
      console.log(`📍 Path apos OTP: ${postOtpPath}`)

      if (postOtpPath.includes('/onboarding')) {
        logSuccess('Redirecionado para onboarding (correto para novo usuario)')
      } else if (postOtpPath.includes('/integracoes')) {
        logWarning('Redirecionado para /integracoes - usuario pode ter pulado onboarding')
        // Isso pode ser um bug se for novo usuario
      } else {
        logBug('HIGH', 'Redirecionamento inesperado', postOtpPath)
        bugs.push(`Redirect inesperado: ${postOtpPath}`)
      }

      // ========================================
      // STEP 6: Completar Onboarding PF
      // ========================================
      if (postOtpPath.includes('/onboarding')) {
        logStep(6, 'Completar onboarding como PF')

        await waitForPageLoad(page)
        await screenshot(page, 'onboarding-start', 6)

        // Verificar se wizard de onboarding esta visivel
        const onboardingTitle = await page.locator('h1, h2, [class*="title"]').first().textContent()
        console.log(`📋 Titulo onboarding: ${onboardingTitle}`)

        // Selecionar tipo PF
        const pfOption = page.locator('button:has-text("Pessoa F"), [data-value="pf"], input[value="pf"]').first()
        if (await pfOption.isVisible()) {
          await pfOption.click()
          logSuccess('Tipo PF selecionado')
        } else {
          // Tentar encontrar por texto
          const pfButton = page.locator('button, div[role="button"]').filter({ hasText: /pessoa\s*f/i }).first()
          if (await pfButton.isVisible()) {
            await pfButton.click()
            logSuccess('Tipo PF selecionado (via texto)')
          } else {
            logWarning('Botao PF nao encontrado - pode estar em outro passo')
          }
        }

        await screenshot(page, 'onboarding-pf-selected', 6)

        // Preencher campos de organizacao
        const orgNameInput = page.locator('input[name="name"], input[placeholder*="nome" i]').first()
        const documentInput = page.locator('input[name="document"], input[placeholder*="cpf" i]').first()

        if (await orgNameInput.isVisible()) {
          await orgNameInput.fill(user.orgName)
          logSuccess(`Nome organizacao: ${user.orgName}`)
        }

        if (await documentInput.isVisible()) {
          await documentInput.fill(user.document)
          logSuccess(`CPF: ${user.document}`)
        }

        await screenshot(page, 'onboarding-filled', 6)

        // Submeter onboarding
        console.log('\n⏸️  Aguardando usuario completar onboarding...')
        console.log('📝 Preencha os campos e clique em Continuar/Finalizar')

        try {
          await page.waitForURL(/\/integracoes/, { timeout: 120000 })
          logSuccess('Onboarding completado!')
        } catch (e) {
          logWarning('Timeout no onboarding - verificar se completou')
          await screenshot(page, 'onboarding-timeout', 6)
        }
      }

      // ========================================
      // STEP 7: Verificar dashboard final
      // ========================================
      logStep(7, 'Verificar acesso ao dashboard')

      const finalPath = getCurrentPath(page)
      await screenshot(page, 'final-state', 7)

      if (finalPath.includes('/integracoes')) {
        logSuccess('Usuario no dashboard /integracoes')

        // Verificar elementos do dashboard
        const hasNavigation = await elementExists(page, 'nav, aside, [class*="sidebar"]')
        const hasHeader = await elementExists(page, 'header, [class*="header"]')

        if (hasNavigation) logSuccess('Navegacao visivel')
        if (hasHeader) logSuccess('Header visivel')

        // Verificar empty state (esperado para novo usuario)
        const emptyState = await page.locator('text=/nenhum|empty|vazio|criar/i').first().isVisible()
        if (emptyState) {
          logSuccess('Empty state exibido (correto para novo usuario)')
        }
      } else {
        logBug('MEDIUM', 'Nao esta no dashboard', finalPath)
        bugs.push(`Pagina final incorreta: ${finalPath}`)
      }

      // ========================================
      // SUMARIO
      // ========================================
      console.log('\n' + '='.repeat(60))
      console.log('📊 SUMARIO DO TESTE')
      console.log('='.repeat(60))

      if (bugs.length === 0) {
        console.log('✅ TESTE PASSOU - Nenhum bug encontrado')
      } else {
        console.log(`❌ ${bugs.length} BUG(S) ENCONTRADO(S):`)
        bugs.forEach((bug, i) => console.log(`   ${i + 1}. ${bug}`))
      }

      console.log('='.repeat(60) + '\n')

      expect(bugs.length, 'Bugs encontrados na jornada').toBe(0)
    })
  })

  test.describe('Pessoa Juridica (PJ)', () => {
    test('deve criar conta PJ, verificar email e completar onboarding', async ({ page }) => {
      // Usar email real do config
      const realEmail = getTestEmail('signupPJ')
      const user = {
        ...generateTestUser('pj'),
        email: realEmail, // Sobrescrever com email real
      }
      const bugs: string[] = []

      console.log('\n' + '='.repeat(60))
      console.log('🧪 TESTE: Criar Conta Pessoa Juridica (PJ)')
      console.log('='.repeat(60))
      console.log(`📧 Email: ${user.email}`)
      console.log(`👤 Nome: ${user.name}`)
      console.log(`🏢 CNPJ: ${user.document}`)
      console.log('='.repeat(60))

      // STEP 1: Acessar pagina de signup
      logStep(1, 'Acessar pagina de signup')
      await page.goto('/signup')
      await waitForPageLoad(page)
      await screenshot(page, 'signup-pj-page', 1)

      // STEP 2: Preencher dados
      logStep(2, 'Preencher dados de signup')
      const nameInput = page.locator('input[name="name"], input[placeholder*="nome" i]').first()
      const emailInput = page.locator('input[name="email"], input[type="email"]').first()

      await nameInput.fill(user.name)
      await emailInput.fill(user.email)
      await screenshot(page, 'signup-pj-filled', 2)

      logSuccess(`Dados preenchidos: ${user.name} / ${user.email}`)

      // STEP 3: Submeter
      logStep(3, 'Submeter formulario')
      const submitButton = page.locator('button[type="submit"]').first()
      await submitButton.click()
      await page.waitForTimeout(2000)

      // STEP 4: Aguardar OTP
      logStep(4, 'Aguardar OTP via email')
      console.log('\n⏸️  PAUSA: Verifique email e insira OTP no navegador')
      console.log(`📧 Email: ${user.email}`)

      try {
        await page.waitForURL(/\/(onboarding|integracoes)/, { timeout: 120000 })
        logSuccess('OTP verificado!')
      } catch (e) {
        bugs.push('OTP timeout')
        throw new Error('OTP verification timeout')
      }

      // STEP 5: Onboarding PJ
      const postOtpPath = getCurrentPath(page)
      if (postOtpPath.includes('/onboarding')) {
        logStep(5, 'Completar onboarding como PJ')
        await waitForPageLoad(page)
        await screenshot(page, 'onboarding-pj-start', 5)

        // Selecionar PJ
        const pjOption = page.locator('button:has-text("Pessoa J"), [data-value="pj"], input[value="pj"]').first()
        if (await pjOption.isVisible()) {
          await pjOption.click()
          logSuccess('Tipo PJ selecionado')
        }

        console.log('\n⏸️  Aguardando usuario completar onboarding PJ...')
        console.log(`📋 CNPJ para usar: ${user.document}`)

        try {
          await page.waitForURL(/\/integracoes/, { timeout: 120000 })
          logSuccess('Onboarding PJ completado!')
        } catch (e) {
          logWarning('Timeout no onboarding PJ')
        }
      }

      // STEP 6: Verificar resultado
      logStep(6, 'Verificar resultado final')
      const finalPath = getCurrentPath(page)
      await screenshot(page, 'final-pj-state', 6)

      console.log('\n' + '='.repeat(60))
      console.log('📊 SUMARIO DO TESTE PJ')
      console.log('='.repeat(60))
      if (bugs.length === 0) {
        console.log('✅ TESTE PASSOU')
      } else {
        console.log(`❌ ${bugs.length} BUG(S): ${bugs.join(', ')}`)
      }
      console.log('='.repeat(60) + '\n')

      expect(bugs.length).toBe(0)
    })
  })
})
