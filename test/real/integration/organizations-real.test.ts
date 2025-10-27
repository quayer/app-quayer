import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askEmail, askUser, confirmAction, waitForUserAction } from '../setup/interactive'

/**
 * 🏢 TESTE REAL DE ORGANIZAÇÕES
 *
 * Este teste:
 * - Cria organização REAL
 * - Convida membro com email REAL
 * - Aceita convite via token REAL
 * - Troca de organização
 * - Gerencia permissões (master, manager, user)
 * - Remove membros
 * - Testa todo o fluxo: API → Email → Prisma
 */
describe('🏢 Organizações REAL', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let masterEmail: string
  let masterPassword: string
  let masterToken: string
  let masterUserId: string
  let memberEmail: string
  let memberPassword: string
  let memberToken: string
  let memberUserId: string
  let orgId: string
  let orgName: string
  let inviteToken: string

  beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE REAL: ORGANIZAÇÕES E CONVITES               ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    env = validateRealTestEnv()
    await setupRealDatabase()
  })

  afterAll(async () => {
    // Cleanup
    const prisma = getRealPrisma()
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {})
    }
    if (masterUserId) {
      await prisma.user.delete({ where: { id: masterUserId } }).catch(() => {})
    }
    if (memberUserId) {
      await prisma.user.delete({ where: { id: memberUserId } }).catch(() => {})
    }
    await cleanupRealDatabase()
  })

  it('deve criar usuário master (dono da organização)', async () => {
    console.log('\n👤 PASSO 1: Criar Usuário Master\n')

    masterEmail = await askEmail('📧 Digite email do MASTER (dono da org):')
    masterPassword = 'master_senha_123'

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log(`⏳ Criando usuário master ${masterEmail}...`)

    const signupResponse = await fetch(`${baseUrl}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: masterEmail,
        password: masterPassword,
        name: 'Master User',
      }),
    })

    const signupData = await signupResponse.json()
    expect(signupResponse.status).toBe(201)

    masterUserId = signupData.data.user.id

    // Login para obter token
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: masterEmail,
        password: masterPassword,
      }),
    })

    const loginData = await loginResponse.json()
    masterToken = loginData.data.accessToken

    console.log('✅ Usuário master criado!')
    console.log(`   ID: ${masterUserId}`)
    console.log(`   Email: ${masterEmail}`)
  })

  it('deve criar organização REAL', async () => {
    console.log('\n🏢 PASSO 2: Criar Organização\n')

    orgName = await askUser('🏢 Digite nome da organização:')
    const orgSlug = orgName.toLowerCase().replace(/\s+/g, '-')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log(`⏳ Criando organização "${orgName}"...`)

    const createResponse = await fetch(`${baseUrl}/api/v1/organizations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${masterToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: orgName,
        slug: orgSlug,
      }),
    })

    const createData = await createResponse.json()

    expect(createResponse.status).toBe(201)
    expect(createData.success).toBe(true)
    expect(createData.data.id).toBeDefined()

    orgId = createData.data.id

    console.log('✅ Organização criada!')
    console.log(`   ID: ${orgId}`)
    console.log(`   Nome: ${orgName}`)
    console.log(`   Slug: ${orgSlug}`)

    // Validar no banco
    console.log('\n🗄️  Validando no banco...')
    const prisma = getRealPrisma()
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: { members: true },
    })

    expect(org).toBeTruthy()
    expect(org?.name).toBe(orgName)
    expect(org?.slug).toBe(orgSlug)
    expect(org?.members.length).toBe(1) // Apenas master

    // Validar que master é dono
    const masterMember = org?.members[0]
    expect(masterMember?.userId).toBe(masterUserId)
    expect(masterMember?.role).toBe('master')

    console.log('✅ Organização validada no banco!')
    console.log(`   Membros: ${org?.members.length}`)
    console.log(`   Master: ${masterMember?.userId}`)
  })

  it('deve convidar membro com email REAL', async () => {
    console.log('\n📧 PASSO 3: Convidar Membro\n')

    memberEmail = await askEmail('📧 Digite email do MEMBRO a convidar:')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log(`⏳ Enviando convite para ${memberEmail}...`)

    const inviteResponse = await fetch(`${baseUrl}/api/v1/organizations/${orgId}/invites`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${masterToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: memberEmail,
        role: 'manager', // Manager pode gerenciar membros
      }),
    })

    const inviteData = await inviteResponse.json()

    expect(inviteResponse.status).toBe(201)
    expect(inviteData.success).toBe(true)

    console.log('✅ Convite enviado!')
    console.log('   📬 Email enviado com link de convite')

    // Aguardar usuário receber email
    await waitForUserAction('Verifique o email de convite')

    // Validar convite no banco
    console.log('\n🗄️  Validando convite no banco...')
    const prisma = getRealPrisma()
    const invite = await prisma.invitation.findFirst({
      where: {
        organizationId: orgId,
        email: memberEmail,
      },
    })

    expect(invite).toBeTruthy()
    expect(invite?.email).toBe(memberEmail)
    expect(invite?.role).toBe('manager')
    expect(invite?.status).toBe('pending')

    inviteToken = invite!.token

    console.log('✅ Convite encontrado no banco!')
    console.log(`   Token: ${inviteToken}`)
    console.log(`   Role: ${invite?.role}`)
    console.log(`   Status: ${invite?.status}`)
  })

  it('deve aceitar convite e criar conta', async () => {
    console.log('\n✅ PASSO 4: Aceitar Convite\n')

    memberPassword = 'member_senha_123'

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Aceitando convite e criando conta...')

    const acceptResponse = await fetch(`${baseUrl}/api/v1/invitations/${inviteToken}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: memberEmail,
        password: memberPassword,
        name: 'Member User',
      }),
    })

    const acceptData = await acceptResponse.json()

    expect(acceptResponse.status).toBe(200)
    expect(acceptData.success).toBe(true)
    expect(acceptData.data.user).toBeDefined()

    memberUserId = acceptData.data.user.id
    memberToken = acceptData.data.accessToken

    console.log('✅ Convite aceito!')
    console.log(`   User ID: ${memberUserId}`)
    console.log(`   Email: ${memberEmail}`)

    // Validar no banco
    console.log('\n🗄️  Validando membro na organização...')
    const prisma = getRealPrisma()
    const orgMember = await prisma.organizationUser.findFirst({
      where: {
        organizationId: orgId,
        userId: memberUserId,
      },
    })

    expect(orgMember).toBeTruthy()
    expect(orgMember?.role).toBe('manager')

    console.log('✅ Membro adicionado à organização!')
    console.log(`   Role: ${orgMember?.role}`)

    // Validar convite marcado como aceito
    const invite = await prisma.invitation.findFirst({
      where: { token: inviteToken },
    })

    expect(invite?.status).toBe('accepted')
    console.log('✅ Convite marcado como aceito!')
  })

  it('deve listar membros da organização', async () => {
    console.log('\n👥 PASSO 5: Listar Membros\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Listando membros...')

    const listResponse = await fetch(`${baseUrl}/api/v1/organizations/${orgId}/members`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${masterToken}` },
    })

    const listData = await listResponse.json()

    expect(listResponse.status).toBe(200)
    expect(listData.data.length).toBe(2) // Master + Member

    console.log('✅ Membros listados!')
    console.log(`   Total: ${listData.data.length}`)

    listData.data.forEach((member: any) => {
      console.log(`   - ${member.user.email} (${member.role})`)
    })
  })

  it('deve trocar de organização (member)', async () => {
    console.log('\n🔄 PASSO 6: Trocar Organização\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Membro trocando para organização...')

    const switchResponse = await fetch(`${baseUrl}/api/v1/users/me/switch-organization`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${memberToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organizationId: orgId,
      }),
    })

    const switchData = await switchResponse.json()

    expect(switchResponse.status).toBe(200)
    expect(switchData.success).toBe(true)

    console.log('✅ Organização trocada!')

    // Validar no banco
    const prisma = getRealPrisma()
    const user = await prisma.user.findUnique({
      where: { id: memberUserId },
    })

    expect(user?.currentOrgId).toBe(orgId)
    console.log('✅ currentOrgId atualizado no banco!')
  })

  it('deve remover membro da organização', async () => {
    console.log('\n🗑️  PASSO 7: Remover Membro\n')

    const shouldRemove = await confirmAction('Remover membro da organização?')

    if (!shouldRemove) {
      console.log('⏭️  Pulando remoção de membro...')
      return
    }

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log(`⏳ Removendo ${memberEmail}...`)

    const removeResponse = await fetch(
      `${baseUrl}/api/v1/organizations/${orgId}/members/${memberUserId}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${masterToken}` },
      }
    )

    expect(removeResponse.status).toBe(200)

    console.log('✅ Membro removido!')

    // Validar no banco
    const prisma = getRealPrisma()
    const orgMember = await prisma.organizationUser.findFirst({
      where: {
        organizationId: orgId,
        userId: memberUserId,
      },
    })

    expect(orgMember).toBeNull()
    console.log('✅ Membro removido do banco!')

    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE COMPLETO: ORGANIZAÇÕES 100% REAL             ║')
    console.log('║   ✅ Usuário master criado                            ║')
    console.log('║   ✅ Organização criada                               ║')
    console.log('║   ✅ Convite enviado com email REAL                   ║')
    console.log('║   ✅ Convite aceito e membro adicionado               ║')
    console.log('║   ✅ Membros listados                                 ║')
    console.log('║   ✅ Troca de organização OK                          ║')
    console.log('║   ✅ Membro removido                                  ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')
  })
})
