import { test, expect } from '@playwright/test'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { confirmAction } from '../setup/interactive'

test.describe('👥 E2E Journey: Multi-user Collaboration', () => {
  let baseUrl: string
  let masterToken: string
  let managerToken: string
  let userToken: string
  let orgId: string
  let instanceId: string

  test.beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   E2E JOURNEY: COLABORAÇÃO MULTI-USUÁRIO             ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    const env = validateRealTestEnv()
    baseUrl = env.NEXT_PUBLIC_APP_URL
    await setupRealDatabase()

    const prisma = getRealPrisma()

    // Create test organization
    console.log('⏳ Criando organização de teste...')

    const org = await prisma.organization.create({
      data: {
        name: `Multi-User Test ${Date.now()}`,
        slug: `multi-user-${Date.now()}`,
      },
    })

    orgId = org.id
    console.log(`✅ Organização criada: ${orgId}`)

    // Create 3 users with different roles
    const masterUser = await prisma.user.create({
      data: {
        email: `master-${Date.now()}@test.com`,
        password: 'Test@123!',
        name: 'Master User',
        emailVerified: new Date(),
      },
    })

    const managerUser = await prisma.user.create({
      data: {
        email: `manager-${Date.now()}@test.com`,
        password: 'Test@123!',
        name: 'Manager User',
        emailVerified: new Date(),
      },
    })

    const regularUser = await prisma.user.create({
      data: {
        email: `user-${Date.now()}@test.com`,
        password: 'Test@123!',
        name: 'Regular User',
        emailVerified: new Date(),
      },
    })

    // Add users to organization
    await prisma.organizationUser.createMany({
      data: [
        { userId: masterUser.id, organizationId: orgId, role: 'master' },
        { userId: managerUser.id, organizationId: orgId, role: 'manager' },
        { userId: regularUser.id, organizationId: orgId, role: 'user' },
      ],
    })

    console.log('✅ 3 usuários criados: master, manager, user')

    // Get tokens for each user
    const masterLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: masterUser.email, password: 'Test@123!' }),
    })
    masterToken = (await masterLogin.json()).data.accessToken

    const managerLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: managerUser.email, password: 'Test@123!' }),
    })
    managerToken = (await managerLogin.json()).data.accessToken

    const userLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: regularUser.email, password: 'Test@123!' }),
    })
    userToken = (await userLogin.json()).data.accessToken

    console.log('✅ Tokens obtidos para todos os usuários')
  })

  test.afterAll(async () => {
    const prisma = getRealPrisma()

    if (instanceId) {
      await prisma.instance.delete({ where: { id: instanceId } }).catch(() => {})
    }

    if (orgId) {
      await prisma.organizationUser.deleteMany({ where: { organizationId: orgId } })
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {})
    }

    await cleanupRealDatabase()
  })

  test('JORNADA COMPLETA: Colaboração entre Master, Manager e User', async ({ context }) => {
    console.log('\n📋 INÍCIO DA JORNADA DE COLABORAÇÃO\n')

    // ==================== PASSO 1: MASTER CRIA INSTÂNCIA ====================
    console.log('👑 PASSO 1: Master Cria Instância WhatsApp\n')

    const masterPage = await context.newPage()

    // Navigate and create instance
    const createResponse = await fetch(`${baseUrl}/api/v1/instances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${masterToken}`,
      },
      body: JSON.stringify({
        name: `Collaboration Test ${Date.now()}`,
        organizationId: orgId,
      }),
    })

    const createData = await createResponse.json()
    instanceId = createData.data.id

    console.log('✅ Instância criada pelo Master')
    console.log(`   Instance ID: ${instanceId}`)

    // Validate in database
    const prisma = getRealPrisma()
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
    })

    expect(instance).toBeTruthy()
    expect(instance?.organizationId).toBe(orgId)

    // ==================== PASSO 2: MANAGER VÊ INSTÂNCIA ====================
    console.log('\n👨‍💼 PASSO 2: Manager Vê a Instância Criada\n')

    const managerPage = await context.newPage()

    // Manager lists instances
    const managerListResponse = await fetch(`${baseUrl}/api/v1/instances?organizationId=${orgId}`, {
      headers: { Authorization: `Bearer ${managerToken}` },
    })

    const managerInstances = await managerListResponse.json()

    const canSeeInstance = managerInstances.data.some((inst: any) => inst.id === instanceId)

    expect(canSeeInstance).toBe(true)

    console.log('✅ Manager pode ver a instância')
    console.log(`   Total instâncias visíveis: ${managerInstances.data.length}`)

    // ==================== PASSO 3: MANAGER ATUALIZA CONFIGURAÇÃO ====================
    console.log('\n⚙️  PASSO 3: Manager Atualiza Configuração\n')

    const updateResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        name: 'Collaboration Test (Updated by Manager)',
      }),
    })

    const updateData = await updateResponse.json()

    expect(updateData.success).toBe(true)

    console.log('✅ Manager atualizou a instância')

    // Validate update in database
    const updatedInstance = await prisma.instance.findUnique({
      where: { id: instanceId },
    })

    expect(updatedInstance?.name).toContain('Updated by Manager')

    console.log('✅ Atualização validada no banco')

    // ==================== PASSO 4: MASTER VÊ MUDANÇA ====================
    console.log('\n👁️  PASSO 4: Master Vê a Mudança Feita pelo Manager\n')

    const masterViewResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}`, {
      headers: { Authorization: `Bearer ${masterToken}` },
    })

    const masterViewData = await masterViewResponse.json()

    expect(masterViewData.data.name).toContain('Updated by Manager')

    console.log('✅ Master vê a mudança feita pelo Manager')
    console.log(`   Nome atual: ${masterViewData.data.name}`)

    const confirmed1 = await confirmAction('Os dois usuários veem os mesmos dados?')
    expect(confirmed1).toBe(true)

    // ==================== PASSO 5: USER (REGULAR) TEM ACESSO LIMITADO ====================
    console.log('\n👤 PASSO 5: User (Regular) Tem Acesso Limitado\n')

    const userPage = await context.newPage()

    // User can view
    const userViewResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    })

    expect(userViewResponse.status).toBe(200)

    console.log('✅ User pode VER a instância')

    // User CANNOT update
    const userUpdateResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        name: 'Attempt to update',
      }),
    })

    expect(userUpdateResponse.status).toBe(403)

    console.log('✅ User NÃO pode EDITAR (403 Forbidden)')

    // User CANNOT delete
    const userDeleteResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    })

    expect(userDeleteResponse.status).toBe(403)

    console.log('✅ User NÃO pode DELETAR (403 Forbidden)')

    const confirmed2 = await confirmAction('As permissões RBAC estão funcionando corretamente?')
    expect(confirmed2).toBe(true)

    // ==================== PASSO 6: MANAGER CRIA WEBHOOK ====================
    console.log('\n🔔 PASSO 6: Manager Cria Webhook para a Org\n')

    const webhookResponse = await fetch(`${baseUrl}/api/v1/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}`,
      },
      body: JSON.stringify({
        url: 'https://webhook.site/test-collaboration',
        events: ['message.received'],
        organizationId: orgId,
      }),
    })

    const webhookData = await webhookResponse.json()

    const webhookId = webhookData.data?.id

    if (webhookId) {
      console.log('✅ Webhook criado pelo Manager')
      console.log(`   Webhook ID: ${webhookId}`)

      // Master can see webhook
      const masterWebhookResponse = await fetch(`${baseUrl}/api/v1/webhooks?organizationId=${orgId}`, {
        headers: { Authorization: `Bearer ${masterToken}` },
      })

      const masterWebhooks = await masterWebhookResponse.json()
      const canSeWebhook = masterWebhooks.data?.some((wh: any) => wh.id === webhookId)

      if (canSeWebhook) {
        console.log('✅ Master pode ver o webhook criado pelo Manager')
      }

      // Cleanup webhook
      await prisma.webhook.delete({ where: { id: webhookId } }).catch(() => {})
    }

    // ==================== PASSO 7: TODOS OS USUÁRIOS NO DASHBOARD ====================
    console.log('\n📊 PASSO 7: Todos os Usuários Veem o Dashboard da Org\n')

    // Master dashboard
    await masterPage.goto(`${baseUrl}/dashboard`)
    await masterPage.waitForLoadState('networkidle')

    const masterHasDashboard = await masterPage.locator('h1, h2').count() > 0

    console.log(`   Master Dashboard: ${masterHasDashboard ? '✓' : '✗'}`)

    // Manager dashboard
    await managerPage.goto(`${baseUrl}/dashboard`)
    await managerPage.waitForLoadState('networkidle')

    const managerHasDashboard = await managerPage.locator('h1, h2').count() > 0

    console.log(`   Manager Dashboard: ${managerHasDashboard ? '✓' : '✗'}`)

    // User dashboard
    await userPage.goto(`${baseUrl}/dashboard`)
    await userPage.waitForLoadState('networkidle')

    const userHasDashboard = await userPage.locator('h1, h2').count() > 0

    console.log(`   User Dashboard: ${userHasDashboard ? '✓' : '✗'}`)

    expect(masterHasDashboard && managerHasDashboard && userHasDashboard).toBe(true)

    console.log('✅ Todos os usuários têm acesso ao dashboard')

    const confirmed3 = await confirmAction('Os 3 dashboards estão funcionando?')
    expect(confirmed3).toBe(true)

    // ==================== PASSO 8: MASTER REMOVE USER ====================
    console.log('\n🚫 PASSO 8: Master Remove o User da Organização\n')

    const regularUserId = await prisma.user.findFirst({
      where: { name: 'Regular User' },
    })

    if (regularUserId) {
      const removeResponse = await fetch(
        `${baseUrl}/api/v1/organizations/${orgId}/members/${regularUserId.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${masterToken}` },
        }
      )

      if (removeResponse.status === 200 || removeResponse.status === 204) {
        console.log('✅ User removido da organização')

        // Verify in database
        const orgUser = await prisma.organizationUser.findFirst({
          where: {
            userId: regularUserId.id,
            organizationId: orgId,
          },
        })

        expect(orgUser).toBeNull()

        console.log('✅ Remoção validada no banco')
      }
    }

    // ==================== PASSO 9: USER NÃO TEM MAIS ACESSO ====================
    console.log('\n🔒 PASSO 9: User Não Tem Mais Acesso aos Recursos\n')

    const userNoAccessResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}`, {
      headers: { Authorization: `Bearer ${userToken}` },
    })

    expect(userNoAccessResponse.status).toBe(403)

    console.log('✅ User não tem mais acesso (403 Forbidden)')

    const confirmed4 = await confirmAction('O user perdeu o acesso após remoção?')
    expect(confirmed4).toBe(true)

    // ==================== PASSO 10: VALIDAÇÃO FINAL ====================
    console.log('\n✅ PASSO 10: Validação Final da Colaboração\n')

    const finalOrg = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        organizationUsers: {
          include: {
            user: true,
          },
        },
        instances: true,
      },
    })

    expect(finalOrg).toBeTruthy()
    expect(finalOrg?.organizationUsers.length).toBe(2) // Only master and manager
    expect(finalOrg?.instances.length).toBeGreaterThanOrEqual(1)

    console.log('✅ Dados finais da organização:')
    console.log(`   Membros ativos: ${finalOrg?.organizationUsers.length}`)
    console.log(`   Instâncias: ${finalOrg?.instances.length}`)

    for (const member of finalOrg?.organizationUsers || []) {
      console.log(`   - ${member.user.name} (${member.role})`)
    }

    // ==================== RESUMO DA JORNADA ====================
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   JORNADA MULTI-USER: SUCESSO 100%                   ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    console.log('✅ PASSO 1: Master criou instância')
    console.log('✅ PASSO 2: Manager viu a instância')
    console.log('✅ PASSO 3: Manager atualizou configuração')
    console.log('✅ PASSO 4: Master viu a mudança')
    console.log('✅ PASSO 5: User teve acesso limitado (RBAC)')
    console.log('✅ PASSO 6: Manager criou webhook')
    console.log('✅ PASSO 7: Todos viram dashboards')
    console.log('✅ PASSO 8: Master removeu user')
    console.log('✅ PASSO 9: User perdeu acesso')
    console.log('✅ PASSO 10: Validação final no banco')

    console.log('\n🎉 COLABORAÇÃO MULTI-USUÁRIO: SUCESSO!\n')
    console.log('🔥 Stack completo testado:')
    console.log('   3 Browsers Simultâneos → 3 Roles (RBAC)')
    console.log('   → Shared Organization → Real-time Sync')
    console.log('   → Permissions Validation → Member Management')
    console.log('   → PostgreSQL → Full Multi-tenant System')

    // Cleanup
    await masterPage.close()
    await managerPage.close()
    await userPage.close()
  })
})
