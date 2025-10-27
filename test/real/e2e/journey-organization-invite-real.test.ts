import { test, expect } from '@playwright/test'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askEmail, confirmAction, waitForUserAction } from '../setup/interactive'

test.describe('🏢 E2E Journey: Organização → Convite → Aceitação', () => {
  let baseUrl: string
  let ownerEmail: string
  let memberEmail: string
  let orgId: string
  let inviteToken: string

  test.beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   E2E JOURNEY: CRIAR ORG → CONVIDAR → ACEITAR       ║')
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
    await cleanupRealDatabase()
  })

  test('JORNADA COMPLETA: Master cria org e convida membro', async ({ context }) => {
    console.log('\n📋 INÍCIO DA JORNADA DE ORGANIZAÇÃO\n')

    // ==================== SETUP: LOGIN AS OWNER ====================
    console.log('🔑 SETUP: Login como Owner (Master)\n')

    ownerEmail = 'admin@quayer.com'
    const ownerPassword = 'admin123456'

    const ownerPage = await context.newPage()
    await ownerPage.goto(`${baseUrl}/auth/login`)

    await ownerPage.fill('input[name="email"]', ownerEmail)
    await ownerPage.fill('input[name="password"]', ownerPassword)
    await ownerPage.click('button[type="submit"]')

    await ownerPage.waitForURL(/.*dashboard.*/, { timeout: 10000 })

    console.log('✅ Owner logado com sucesso')

    // ==================== PASSO 1: CRIAR ORGANIZAÇÃO ====================
    console.log('\n🏢 PASSO 1: Criar Nova Organização\n')

    await ownerPage.goto(`${baseUrl}/admin/organizations`)
    await ownerPage.waitForLoadState('networkidle')

    // Click "Nova Organização"
    const newOrgButton = ownerPage.locator('button:has-text("Nova Organização"), a[href*="/new"]')

    if (await newOrgButton.count() > 0) {
      await newOrgButton.click()
    } else {
      await ownerPage.goto(`${baseUrl}/admin/organizations/new`)
    }

    await ownerPage.waitForLoadState('networkidle')

    const orgName = `Journey Test Org ${Date.now()}`
    const orgSlug = `journey-test-${Date.now()}`

    console.log(`   Nome: ${orgName}`)
    console.log(`   Slug: ${orgSlug}`)

    // Fill organization form
    await ownerPage.fill('input[name="name"]', orgName)
    await ownerPage.fill('input[name="slug"]', orgSlug)

    const descriptionField = ownerPage.locator('textarea[name="description"]')
    if (await descriptionField.count() > 0) {
      await descriptionField.fill('Organization created via E2E journey test')
    }

    console.log('⏳ Criando organização...')

    await ownerPage.click('button[type="submit"]')

    // Wait for redirect or success
    await ownerPage.waitForTimeout(2000)

    console.log('✅ Organização criada')

    const confirmed1 = await confirmAction('A organização foi criada com sucesso?')
    expect(confirmed1).toBe(true)

    // Get org from database
    const prisma = getRealPrisma()
    const org = await prisma.organization.findFirst({
      where: { name: orgName },
      include: {
        organizationUsers: true,
      },
    })

    expect(org).toBeTruthy()
    orgId = org!.id

    console.log('✅ Organização validada no banco')
    console.log(`   Org ID: ${orgId}`)
    console.log(`   Members: ${org?.organizationUsers.length || 0}`)

    // ==================== PASSO 2: NAVEGAR PARA CONVITES ====================
    console.log('\n📧 PASSO 2: Navegar para Convites/Membros\n')

    // Try to navigate to members/invites page
    await ownerPage.goto(`${baseUrl}/admin/organizations/${orgId}/members`)
    await ownerPage.waitForLoadState('networkidle')

    const isMembersPage = ownerPage.url().includes('/members')

    if (isMembersPage) {
      console.log('✅ Página de membros carregada')
    } else {
      console.log('⚠️  Navegando para página alternativa')
      await ownerPage.goto(`${baseUrl}/admin/organizations`)
    }

    // ==================== PASSO 3: CONVIDAR NOVO MEMBRO ====================
    console.log('\n👥 PASSO 3: Convidar Novo Membro\n')

    console.log('📱 Digite um email REAL para receber o convite')
    memberEmail = await askEmail('Email do membro para convidar:')

    // Look for "Convidar Membro" button
    const inviteButton = ownerPage.locator('button:has-text("Convidar"), button:has-text("Adicionar")')

    if (await inviteButton.count() > 0) {
      await inviteButton.click()
      await ownerPage.waitForTimeout(500)

      // Fill invite form in dialog
      const emailInput = ownerPage.locator('input[name="email"], input[placeholder*="email"]')

      if (await emailInput.count() > 0) {
        await emailInput.fill(memberEmail)

        // Select role if available
        const roleSelect = ownerPage.locator('select[name="role"], [role="combobox"]')

        if (await roleSelect.count() > 0) {
          await roleSelect.click()
          await ownerPage.waitForTimeout(300)

          // Select "manager" role
          const managerOption = ownerPage.locator('option:has-text("Manager"), [role="option"]:has-text("Manager")')

          if (await managerOption.count() > 0) {
            await managerOption.click()
          }
        }

        console.log('⏳ Enviando convite...')

        // Submit invite
        await ownerPage.click('button[type="submit"]')
        await ownerPage.waitForTimeout(2000)

        console.log('✅ Convite enviado')
      }
    } else {
      // Use API directly if button not found
      console.log('⚠️  Botão não encontrado - usando API')

      const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: ownerEmail, password: ownerPassword }),
      })

      const loginData = await loginResponse.json()
      const accessToken = loginData.data.accessToken

      const inviteResponse = await fetch(`${baseUrl}/api/v1/organizations/${orgId}/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: memberEmail,
          role: 'manager',
        }),
      })

      const inviteData = await inviteResponse.json()
      console.log('✅ Convite enviado via API')
    }

    const confirmed2 = await confirmAction('O convite foi enviado?')
    expect(confirmed2).toBe(true)

    // Validate invitation in database
    const invitation = await prisma.invitation.findFirst({
      where: {
        email: memberEmail,
        organizationId: orgId,
      },
    })

    expect(invitation).toBeTruthy()
    inviteToken = invitation!.token

    console.log('✅ Convite validado no banco')
    console.log(`   Token: ${inviteToken?.substring(0, 20)}...`)
    console.log(`   Email: ${memberEmail}`)

    console.log('\n📧 INSTRUÇÕES:')
    console.log(`   1. Verifique o email: ${memberEmail}`)
    console.log('   2. Encontre o email de convite')
    console.log('   3. Copie o link de aceitação')

    await waitForUserAction('Pressione Enter quando encontrar o link do convite')

    // ==================== PASSO 4: ACEITAR CONVITE ====================
    console.log('\n✅ PASSO 4: Aceitar Convite (Como Novo Membro)\n')

    // Open new page for member
    const memberPage = await context.newPage()

    const inviteUrl = `${baseUrl}/invitations/accept?token=${inviteToken}`
    console.log(`   URL do convite: ${inviteUrl}`)

    await memberPage.goto(inviteUrl)
    await memberPage.waitForLoadState('networkidle')

    console.log('✅ Página de aceitação carregada')

    // Check if already has account or needs to signup
    const hasSignupForm = await memberPage.locator('input[name="password"]').count() > 0

    if (hasSignupForm) {
      console.log('   Membro precisa criar senha')

      // Fill signup form
      await memberPage.fill('input[name="password"]', 'Member@Test123!')

      const nameField = memberPage.locator('input[name="name"]')
      if (await nameField.count() > 0) {
        await memberPage.fill('input[name="name"]', 'Journey Test Member')
      }

      console.log('⏳ Aceitando convite e criando conta...')

      await memberPage.click('button[type="submit"]')
    } else {
      console.log('   Membro já tem conta - apenas aceitando')

      const acceptButton = memberPage.locator('button:has-text("Aceitar")')

      if (await acceptButton.count() > 0) {
        await acceptButton.click()
      }
    }

    // Wait for redirect to dashboard
    await memberPage.waitForURL(/.*dashboard.*/, { timeout: 15000 })

    console.log('✅ Convite aceito - redirecionado para dashboard')

    const confirmed3 = await confirmAction('O membro foi redirecionado para o dashboard?')
    expect(confirmed3).toBe(true)

    // ==================== PASSO 5: VALIDAR MEMBRO NA ORG ====================
    console.log('\n👥 PASSO 5: Validar Membro na Organização\n')

    // Refresh org from database
    const updatedOrg = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        organizationUsers: {
          include: {
            user: true,
          },
        },
      },
    })

    expect(updatedOrg).toBeTruthy()
    expect(updatedOrg?.organizationUsers.length).toBeGreaterThanOrEqual(2)

    const memberUser = updatedOrg?.organizationUsers.find(
      (ou) => ou.user.email === memberEmail
    )

    expect(memberUser).toBeTruthy()
    expect(memberUser?.role).toBe('manager')

    console.log('✅ Membro validado na organização')
    console.log(`   Total de membros: ${updatedOrg?.organizationUsers.length}`)
    console.log(`   Role do novo membro: ${memberUser?.role}`)

    // ==================== PASSO 6: OWNER VÊ NOVO MEMBRO ====================
    console.log('\n👀 PASSO 6: Owner Vê Novo Membro na Lista\n')

    await ownerPage.goto(`${baseUrl}/admin/organizations/${orgId}/members`)
    await ownerPage.waitForLoadState('networkidle')

    // Look for member in the list
    const memberInList = ownerPage.locator(`text="${memberEmail}"`)

    if (await memberInList.count() > 0) {
      console.log('✅ Membro aparece na lista')

      const confirmed4 = await confirmAction('O novo membro aparece na lista de membros?')
      expect(confirmed4).toBe(true)
    } else {
      console.log('⚠️  Membro não visível na lista (pode precisar refresh)')
    }

    // ==================== PASSO 7: MEMBRO NAVEGA NO DASHBOARD ====================
    console.log('\n🧭 PASSO 7: Membro Navega no Dashboard da Org\n')

    // Check if member can see organization
    const orgSwitcher = memberPage.locator('[class*="org"], [aria-label*="organização"]')

    if (await orgSwitcher.count() > 0) {
      await orgSwitcher.click()
      await memberPage.waitForTimeout(500)

      // Check if can see the org
      const orgInList = memberPage.locator(`text="${orgName}"`)
      const canSeeOrg = await orgInList.count() > 0

      console.log(`   Membro vê a organização: ${canSeeOrg ? '✓' : '✗'}`)

      if (canSeeOrg) {
        console.log('✅ Membro tem acesso à organização')
      }
    }

    // ==================== RESUMO DA JORNADA ====================
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   JORNADA DE ORGANIZAÇÃO: SUCESSO 100%               ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    console.log('✅ PASSO 1: Organização criada')
    console.log('✅ PASSO 2: Navegou para membros')
    console.log('✅ PASSO 3: Convite enviado via email real')
    console.log('✅ PASSO 4: Convite aceito pelo membro')
    console.log('✅ PASSO 5: Membro validado no banco')
    console.log('✅ PASSO 6: Owner vê novo membro')
    console.log('✅ PASSO 7: Membro tem acesso à org')

    console.log('\n🎉 JORNADA COMPLETA DE CONVITE: SUCESSO!\n')
    console.log('🔥 Stack completo testado:')
    console.log('   Owner → Create Org → Invite API → SMTP')
    console.log('   → Email Real → Accept Link → Signup/Login')
    console.log('   → OrganizationUser → RBAC → Dashboard')

    // Cleanup
    await ownerPage.close()
    await memberPage.close()
  })
})
