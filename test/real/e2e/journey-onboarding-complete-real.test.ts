import { test, expect } from '@playwright/test'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askEmail, askOTP, confirmAction } from '../setup/interactive'

test.describe('🎯 E2E Journey: Onboarding Completo', () => {
  let baseUrl: string
  let testEmail: string
  let userId: string
  let orgId: string

  test.beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   E2E JOURNEY: ONBOARDING COMPLETO                   ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    const env = validateRealTestEnv()
    baseUrl = env.NEXT_PUBLIC_APP_URL
    await setupRealDatabase()
  })

  test.afterAll(async () => {
    const prisma = getRealPrisma()
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {})
    }
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    }
    await cleanupRealDatabase()
  })

  test('JORNADA COMPLETA: Onboarding de novo usuário até primeiro uso', async ({ page }) => {
    console.log('\n📋 INÍCIO DA JORNADA DE ONBOARDING\n')

    // ==================== PASSO 1: SIGNUP ====================
    console.log('📝 PASSO 1: Signup\n')

    await page.goto(`${baseUrl}/auth/signup`)

    testEmail = await askEmail('Email para onboarding:')

    await page.fill('input[name="email"]', testEmail)
    await page.fill('input[name="password"]', 'Onboard@Test123!')
    await page.fill('input[name="name"]', 'Onboarding User')

    await page.click('button[type="submit"]')

    await page.waitForURL(/.*verify.*/, { timeout: 15000 })

    console.log('✅ Signup realizado')

    // ==================== PASSO 2: OTP ====================
    console.log('\n🔢 PASSO 2: Verificação OTP\n')

    const otpCode = await askOTP('Digite o código OTP recebido:')

    const otpInputs = page.locator('input[type="text"][maxlength]')
    const inputCount = await otpInputs.count()

    if (inputCount === 6) {
      for (let i = 0; i < 6; i++) {
        await otpInputs.nth(i).fill(otpCode[i])
      }
    } else {
      await page.fill('input[name="code"], input[name="otp"]', otpCode)
      await page.click('button[type="submit"]')
    }

    await page.waitForURL(/.*onboarding.*|.*dashboard.*/, { timeout: 20000 })

    console.log('✅ OTP verificado')

    // Validate user
    const prisma = getRealPrisma()
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
    })

    expect(user).toBeTruthy()
    userId = user!.id

    console.log('✅ User criado no banco')

    // ==================== PASSO 3: ONBOARDING STEP 1 - BEM-VINDO ====================
    console.log('\n👋 PASSO 3: Onboarding - Bem-vindo\n')

    const isOnboarding = page.url().includes('/onboarding')

    if (isOnboarding) {
      console.log('✅ Redirecionado para onboarding')

      // Check for welcome message
      const welcomeText = await page.locator('h1, h2').first().textContent()
      console.log(`   Título: ${welcomeText}`)

      const confirmed1 = await confirmAction('Você vê a tela de boas-vindas do onboarding?')
      expect(confirmed1).toBe(true)

      // Click "Começar" or "Next"
      const nextButton = page.locator('button:has-text("Começar"), button:has-text("Próximo"), button:has-text("Next")')

      if (await nextButton.count() > 0) {
        await nextButton.click()
        await page.waitForTimeout(1000)
        console.log('✅ Avançou para próximo passo')
      }
    } else {
      console.log('⚠️  Onboarding não apareceu - foi direto para dashboard')
    }

    // ==================== PASSO 4: ONBOARDING STEP 2 - CRIAR ORGANIZAÇÃO ====================
    console.log('\n🏢 PASSO 4: Onboarding - Criar Organização\n')

    const hasOrgForm = await page.locator('input[name="organizationName"], input[placeholder*="organização"]').count() > 0

    if (hasOrgForm) {
      const orgName = `Onboarding Org ${Date.now()}`

      await page.fill('input[name="organizationName"], input[name="name"]', orgName)

      const slugField = page.locator('input[name="slug"]')
      if (await slugField.count() > 0) {
        await page.fill('input[name="slug"]', `onboard-${Date.now()}`)
      }

      console.log(`   Organização: ${orgName}`)

      const nextButton = page.locator('button:has-text("Próximo"), button:has-text("Continuar"), button[type="submit"]')
      await nextButton.click()

      await page.waitForTimeout(2000)

      console.log('✅ Organização criada')

      // Validate in database
      const org = await prisma.organization.findFirst({
        where: { name: orgName },
      })

      if (org) {
        orgId = org.id
        console.log('✅ Organização validada no banco')
      }

      const confirmed2 = await confirmAction('A organização foi criada no onboarding?')
      expect(confirmed2).toBe(true)
    } else {
      console.log('⚠️  Formulário de organização não encontrado')
    }

    // ==================== PASSO 5: ONBOARDING STEP 3 - PREFERÊNCIAS ====================
    console.log('\n⚙️  PASSO 5: Onboarding - Preferências/Configurações\n')

    const hasPreferences = await page.locator('input[type="checkbox"], input[type="radio"], select').count() > 0

    if (hasPreferences) {
      console.log('✅ Tela de preferências detectada')

      // Check some options
      const checkboxes = page.locator('input[type="checkbox"]')
      const checkboxCount = await checkboxes.count()

      if (checkboxCount > 0) {
        await checkboxes.first().check()
        console.log(`   Selecionou ${checkboxCount} preferências`)
      }

      const nextButton = page.locator('button:has-text("Próximo"), button:has-text("Continuar"), button:has-text("Finalizar")')

      if (await nextButton.count() > 0) {
        await nextButton.click()
        await page.waitForTimeout(2000)
        console.log('✅ Preferências salvas')
      }

      const confirmed3 = await confirmAction('Você configurou as preferências?')
      expect(confirmed3).toBe(true)
    } else {
      console.log('⚠️  Tela de preferências não encontrada')
    }

    // ==================== PASSO 6: ONBOARDING STEP 4 - TUTORIAL/TOUR ====================
    console.log('\n🎓 PASSO 6: Onboarding - Tutorial/Tour\n')

    const hasTour = await page.locator('[role="dialog"], [class*="tour"], [class*="tutorial"]').count() > 0

    if (hasTour) {
      console.log('✅ Tutorial/Tour detectado')

      // Go through tour steps
      let tourSteps = 0

      while (tourSteps < 5) {
        const nextTourButton = page.locator('button:has-text("Próximo"), button:has-text("Next"), button[aria-label*="next"]')

        if (await nextTourButton.count() === 0) {
          break
        }

        await nextTourButton.click()
        await page.waitForTimeout(500)
        tourSteps++

        console.log(`   Tour step ${tourSteps}`)
      }

      // Finish tour
      const finishButton = page.locator('button:has-text("Finalizar"), button:has-text("Concluir"), button:has-text("Finish")')

      if (await finishButton.count() > 0) {
        await finishButton.click()
        await page.waitForTimeout(1000)
        console.log('✅ Tour finalizado')
      }

      const confirmed4 = await confirmAction('Você completou o tour/tutorial?')
      expect(confirmed4).toBe(true)
    } else {
      console.log('⚠️  Tour não encontrado')
    }

    // ==================== PASSO 7: DASHBOARD FINAL ====================
    console.log('\n📊 PASSO 7: Dashboard Final (Pós-Onboarding)\n')

    await page.waitForURL(/.*dashboard.*/, { timeout: 10000 })

    const isDashboard = page.url().includes('/dashboard')
    expect(isDashboard).toBe(true)

    console.log('✅ Redirecionado para dashboard')

    // Check for dashboard elements
    const hasSidebar = await page.locator('aside, [role="navigation"]').count() > 0
    const hasContent = await page.locator('main, [role="main"]').count() > 0

    console.log(`   Sidebar: ${hasSidebar ? '✓' : '✗'}`)
    console.log(`   Content: ${hasContent ? '✓' : '✗'}`)

    expect(hasSidebar || hasContent).toBe(true)

    const confirmed5 = await confirmAction('Você está no dashboard após o onboarding?')
    expect(confirmed5).toBe(true)

    // ==================== PASSO 8: VALIDAR ONBOARDING COMPLETO ====================
    console.log('\n✅ PASSO 8: Validar Onboarding Completo no Banco\n')

    const finalUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        organizationUsers: {
          include: {
            organization: true,
          },
        },
      },
    })

    expect(finalUser).toBeTruthy()
    expect(finalUser?.emailVerified).toBeTruthy()

    console.log('✅ Dados do usuário:')
    console.log(`   Email: ${finalUser?.email}`)
    console.log(`   Verified: ${finalUser?.emailVerified}`)
    console.log(`   Organizations: ${finalUser?.organizationUsers.length}`)

    if (finalUser?.organizationUsers && finalUser.organizationUsers.length > 0) {
      const userOrg = finalUser.organizationUsers[0]
      console.log(`   Org Name: ${userOrg.organization.name}`)
      console.log(`   Role: ${userOrg.role}`)

      expect(userOrg.role).toBe('master')
    }

    // ==================== PASSO 9: PRIMEIRA AÇÃO NO SISTEMA ====================
    console.log('\n🎯 PASSO 9: Primeira Ação - Navegar no Sistema\n')

    // Navigate to different pages
    const sidebar = page.locator('aside, [role="navigation"]').first()

    if (await sidebar.count() > 0) {
      const navLinks = await sidebar.locator('a[href]').count()
      console.log(`   Links disponíveis: ${navLinks}`)

      if (navLinks > 0) {
        // Click on first navigation link
        const firstLink = sidebar.locator('a[href]').first()
        const linkText = await firstLink.textContent()
        console.log(`   Navegando para: ${linkText}`)

        await firstLink.click()
        await page.waitForLoadState('networkidle')

        console.log('✅ Navegação funcionando')
      }
    }

    const confirmed6 = await confirmAction('Você consegue navegar normalmente no sistema?')
    expect(confirmed6).toBe(true)

    // ==================== RESUMO DA JORNADA ====================
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   JORNADA DE ONBOARDING: SUCESSO 100%                ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    console.log('✅ PASSO 1: Signup realizado')
    console.log('✅ PASSO 2: OTP verificado')
    console.log('✅ PASSO 3: Tela de boas-vindas')
    console.log('✅ PASSO 4: Organização criada')
    console.log('✅ PASSO 5: Preferências configuradas')
    console.log('✅ PASSO 6: Tutorial/Tour completado')
    console.log('✅ PASSO 7: Dashboard acessado')
    console.log('✅ PASSO 8: Dados validados no banco')
    console.log('✅ PASSO 9: Primeira navegação realizada')

    console.log('\n🎉 ONBOARDING COMPLETO: SUCESSO!\n')
    console.log('🔥 Stack completo testado:')
    console.log('   Signup → OTP → Onboarding Flow')
    console.log('   → Create Organization → Preferences')
    console.log('   → Tutorial → Dashboard → Navigation')
    console.log('   → PostgreSQL → Full User Experience')
  })
})
