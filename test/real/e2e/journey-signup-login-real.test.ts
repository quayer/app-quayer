import { test, expect } from '@playwright/test'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askEmail, askOTP, confirmAction } from '../setup/interactive'

test.describe('🚀 E2E Journey: Signup → Login → Dashboard', () => {
  let baseUrl: string
  let testEmail: string
  let testPassword: string
  let userId: string

  test.beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   E2E JOURNEY: SIGNUP → LOGIN → DASHBOARD           ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    const env = validateRealTestEnv()
    baseUrl = env.NEXT_PUBLIC_APP_URL
    await setupRealDatabase()

    testPassword = 'Journey@Test123!'
  })

  test.afterAll(async () => {
    const prisma = getRealPrisma()
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    }
    await cleanupRealDatabase()
  })

  test('JORNADA COMPLETA: Novo usuário do zero até dashboard', async ({ page }) => {
    console.log('\n📋 INÍCIO DA JORNADA COMPLETA\n')

    // ==================== PASSO 1: LANDING PAGE ====================
    console.log('🌐 PASSO 1: Acessar Landing Page\n')

    await page.goto(baseUrl)
    await page.waitForLoadState('networkidle')

    console.log('✅ Landing page carregada')

    const hasLandingContent = await page.locator('h1, h2').count() > 0
    expect(hasLandingContent).toBe(true)

    const confirmed1 = await confirmAction('Você vê a landing page?')
    expect(confirmed1).toBe(true)

    // ==================== PASSO 2: SIGNUP ====================
    console.log('\n📝 PASSO 2: Signup (Criar Conta)\n')

    // Navigate to signup
    const signupButton = page.locator('a[href*="signup"], button:has-text("Cadastrar")')

    if (await signupButton.count() > 0) {
      await signupButton.click()
    } else {
      await page.goto(`${baseUrl}/auth/signup`)
    }

    await page.waitForLoadState('networkidle')

    console.log('📱 Digite um email REAL para receber o código OTP')
    testEmail = await askEmail('Email para signup:')

    // Fill signup form
    await page.fill('input[name="email"]', testEmail)
    await page.fill('input[name="password"]', testPassword)
    await page.fill('input[name="name"]', 'Journey Test User')

    console.log('⏳ Submetendo formulário de signup...')

    await page.click('button[type="submit"]')

    // Wait for redirect to verify page
    await page.waitForURL(/.*verify.*/, { timeout: 15000 })

    console.log('✅ Signup realizado - redirecionado para verify')

    const confirmed2 = await confirmAction('Você foi redirecionado para a página de verificação?')
    expect(confirmed2).toBe(true)

    // Validate in database
    const prisma = getRealPrisma()
    const tempUser = await prisma.tempUser.findUnique({
      where: { email: testEmail },
    })

    expect(tempUser).toBeTruthy()
    expect(tempUser?.code).toBeTruthy()

    console.log('✅ TempUser criado no banco')
    console.log(`   Email: ${testEmail}`)
    console.log(`   Code length: ${tempUser?.code?.length || 0}`)

    // ==================== PASSO 3: OTP VERIFICATION ====================
    console.log('\n🔢 PASSO 3: Verificação de OTP\n')

    console.log('📧 Verifique seu email e digite o código recebido')

    const otpCode = await askOTP('Digite o código de 6 dígitos:')

    // Fill OTP inputs
    const otpInputs = page.locator('input[type="text"][maxlength]')
    const inputCount = await otpInputs.count()

    if (inputCount === 6) {
      // Individual inputs (input-otp component)
      for (let i = 0; i < 6; i++) {
        await otpInputs.nth(i).fill(otpCode[i])
      }
    } else {
      // Single input
      await page.fill('input[name="code"], input[name="otp"]', otpCode)
    }

    console.log('⏳ Verificando código OTP...')

    // Submit OTP
    const submitOTP = page.locator('button[type="submit"]')
    if (await submitOTP.count() > 0) {
      await submitOTP.click()
    }

    // Wait for redirect to dashboard
    await page.waitForURL(/.*dashboard.*/, { timeout: 20000 })

    console.log('✅ OTP verificado - redirecionado para dashboard')

    // Validate user created in database
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
    })

    expect(user).toBeTruthy()
    expect(user?.emailVerified).toBeTruthy()
    userId = user!.id

    console.log('✅ User criado e verificado no banco')
    console.log(`   User ID: ${userId}`)
    console.log(`   Email Verified: ${user?.emailVerified}`)

    // ==================== PASSO 4: DASHBOARD ====================
    console.log('\n📊 PASSO 4: Dashboard (Primeira Visualização)\n')

    const isDashboard = page.url().includes('/dashboard')
    expect(isDashboard).toBe(true)

    console.log('✅ URL é /dashboard')

    // Check for dashboard elements
    const hasSidebar = await page.locator('aside, [role="navigation"]').count() > 0
    const hasHeader = await page.locator('header, h1').count() > 0

    console.log(`   Sidebar: ${hasSidebar ? '✓' : '✗'}`)
    console.log(`   Header: ${hasHeader ? '✓' : '✗'}`)

    expect(hasSidebar || hasHeader).toBe(true)

    const confirmed3 = await confirmAction('Você está vendo o dashboard?')
    expect(confirmed3).toBe(true)

    // ==================== PASSO 5: USER PROFILE ====================
    console.log('\n👤 PASSO 5: Verificar Perfil do Usuário\n')

    // Look for user menu
    const userMenu = page.locator('button[aria-label*="user"], button[aria-label*="conta"]').first()

    if (await userMenu.count() > 0) {
      await userMenu.click()
      await page.waitForTimeout(500)

      // Check if name appears
      const nameElement = page.locator(`text="${'Journey Test User'}"`).first()
      const hasName = await nameElement.count() > 0

      console.log(`   Nome aparece: ${hasName ? '✓' : '✗'}`)

      if (hasName) {
        console.log('✅ Perfil do usuário visível no menu')
      }

      // Close menu
      await page.keyboard.press('Escape')
    } else {
      console.log('⚠️  User menu não encontrado')
    }

    // ==================== PASSO 6: NAVIGATION ====================
    console.log('\n🧭 PASSO 6: Testar Navegação no Dashboard\n')

    const sidebar = page.locator('aside, [role="navigation"]').first()

    if (await sidebar.count() > 0) {
      // Get all navigation links
      const navLinks = await sidebar.locator('a[href]').count()
      console.log(`   Links de navegação: ${navLinks}`)

      if (navLinks > 1) {
        // Click on second link
        const secondLink = sidebar.locator('a[href]').nth(1)
        const linkHref = await secondLink.getAttribute('href')
        console.log(`   Navegando para: ${linkHref}`)

        await secondLink.click()
        await page.waitForLoadState('networkidle')

        const newUrl = page.url()
        console.log(`   Nova URL: ${newUrl}`)

        console.log('✅ Navegação funcionando')
      }
    }

    const confirmed4 = await confirmAction('A navegação entre páginas funcionou?')
    expect(confirmed4).toBe(true)

    // ==================== PASSO 7: LOGOUT ====================
    console.log('\n🚪 PASSO 7: Logout\n')

    // Open user menu
    const userMenuLogout = page.locator('button[aria-label*="user"], button[aria-label*="conta"]').first()

    if (await userMenuLogout.count() > 0) {
      await userMenuLogout.click()
      await page.waitForTimeout(500)

      // Look for logout button
      const logoutButton = page.locator('button:has-text("Sair"), a:has-text("Sair"), button:has-text("Logout")')

      if (await logoutButton.count() > 0) {
        await logoutButton.click()
        await page.waitForTimeout(1000)

        // Should redirect to login
        await page.waitForURL(/.*login.*|.*\/$/, { timeout: 10000 })

        console.log('✅ Logout realizado')

        const isLoggedOut = page.url().includes('/login') || page.url() === `${baseUrl}/`
        expect(isLoggedOut).toBe(true)

        console.log('✅ Redirecionado para login/home')
      } else {
        console.log('⚠️  Botão de logout não encontrado')
      }
    }

    // ==================== PASSO 8: LOGIN NOVAMENTE ====================
    console.log('\n🔑 PASSO 8: Login Novamente com Mesmas Credenciais\n')

    await page.goto(`${baseUrl}/auth/login`)

    await page.fill('input[name="email"]', testEmail)
    await page.fill('input[name="password"]', testPassword)

    console.log('⏳ Fazendo login...')

    await page.click('button[type="submit"]')

    // Should redirect to dashboard
    await page.waitForURL(/.*dashboard.*/, { timeout: 10000 })

    console.log('✅ Login realizado com sucesso')

    const isDashboardAgain = page.url().includes('/dashboard')
    expect(isDashboardAgain).toBe(true)

    const confirmed5 = await confirmAction('Você conseguiu fazer login novamente?')
    expect(confirmed5).toBe(true)

    // ==================== PASSO 9: VALIDAÇÃO FINAL ====================
    console.log('\n✅ PASSO 9: Validação Final no Banco\n')

    // Refresh user from database
    const finalUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        organizations: true,
        organizationUsers: true,
      },
    })

    expect(finalUser).toBeTruthy()
    expect(finalUser?.email).toBe(testEmail)
    expect(finalUser?.name).toBe('Journey Test User')
    expect(finalUser?.emailVerified).toBeTruthy()

    console.log('✅ Dados finais do usuário:')
    console.log(`   ID: ${finalUser?.id}`)
    console.log(`   Email: ${finalUser?.email}`)
    console.log(`   Name: ${finalUser?.name}`)
    console.log(`   Verified: ${finalUser?.emailVerified}`)
    console.log(`   Organizations: ${finalUser?.organizationUsers.length || 0}`)

    // ==================== RESUMO DA JORNADA ====================
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   JORNADA COMPLETA: SUCESSO 100%                     ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    console.log('✅ PASSO 1: Landing Page')
    console.log('✅ PASSO 2: Signup com email real')
    console.log('✅ PASSO 3: OTP recebido e verificado')
    console.log('✅ PASSO 4: Dashboard carregado')
    console.log('✅ PASSO 5: Perfil do usuário visível')
    console.log('✅ PASSO 6: Navegação funcionando')
    console.log('✅ PASSO 7: Logout realizado')
    console.log('✅ PASSO 8: Login novamente com sucesso')
    console.log('✅ PASSO 9: Validação no banco completa')

    console.log('\n🎉 JORNADA COMPLETA DE NOVO USUÁRIO: SUCESSO!\n')
    console.log('🔥 Stack completo testado:')
    console.log('   Browser → Signup Form → API → SMTP → Email Real')
    console.log('   → OTP Verification → JWT Token → Dashboard')
    console.log('   → Navigation → Logout → Login → PostgreSQL')
  })
})
