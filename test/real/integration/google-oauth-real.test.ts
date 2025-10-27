import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askUser, waitForUserAction, confirmAction } from '../setup/interactive'

describe('🔐 Google OAuth REAL', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let userId: string
  let accessToken: string
  let testEmail: string

  beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE REAL: GOOGLE OAUTH LOGIN                     ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    env = validateRealTestEnv()
    await setupRealDatabase()
  })

  afterAll(async () => {
    if (userId) {
      const prisma = getRealPrisma()
      await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    }
    await cleanupRealDatabase()
  })

  it('deve iniciar fluxo OAuth e obter URL', async () => {
    console.log('\n🔗 PASSO 1: Iniciar OAuth Flow\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Gerando URL de autenticação Google...')

    const oauthResponse = await fetch(`${baseUrl}/api/v1/auth/google`, {
      method: 'GET',
    })

    const oauthData = await oauthResponse.json()

    expect(oauthResponse.status).toBe(200)
    expect(oauthData.data.authUrl).toBeDefined()

    const authUrl = oauthData.data.authUrl

    console.log('\n✅ URL gerada!')
    console.log(`\n🔗 URL de Login:\n${authUrl}\n`)
    console.log('📋 INSTRUÇÕES:')
    console.log('   1. Copie a URL acima')
    console.log('   2. Abra em seu navegador')
    console.log('   3. Faça login com sua conta Google')
    console.log('   4. Autorize o aplicativo')
    console.log('   5. Você será redirecionado de volta\n')

    await waitForUserAction('Complete o login no navegador')
  })

  it('deve processar callback OAuth', async () => {
    console.log('\n🔄 PASSO 2: Processar Callback\n')

    const authCode = await askUser('🔑 Cole o código de autorização (da URL de callback):')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('\n⏳ Processando callback...')

    const callbackResponse = await fetch(`${baseUrl}/api/v1/auth/google/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: authCode }),
    })

    const callbackData = await callbackResponse.json()

    expect(callbackResponse.status).toBe(200)
    expect(callbackData.success).toBe(true)
    expect(callbackData.data.accessToken).toBeDefined()
    expect(callbackData.data.user).toBeDefined()

    accessToken = callbackData.data.accessToken
    userId = callbackData.data.user.id
    testEmail = callbackData.data.user.email

    console.log('\n✅ Login OAuth concluído!')
    console.log(`   User ID: ${userId}`)
    console.log(`   Email: ${testEmail}`)
    console.log(`   Nome: ${callbackData.data.user.name}`)
  })

  it('deve validar usuário no banco', async () => {
    console.log('\n🗄️  PASSO 3: Validar no Banco\n')

    const prisma = getRealPrisma()
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { accounts: true },
    })

    expect(user).toBeTruthy()
    expect(user?.email).toBe(testEmail)
    expect(user?.emailVerified).toBe(true)

    const googleAccount = user?.accounts.find(acc => acc.provider === 'google')
    expect(googleAccount).toBeTruthy()

    console.log('✅ Usuário validado!')
    console.log(`   Email Verificado: ${user?.emailVerified}`)
    console.log(`   Google Account ID: ${googleAccount?.providerAccountId}`)
  })

  it('deve acessar rota protegida', async () => {
    console.log('\n🔒 PASSO 4: Testar Acesso\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    const response = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.data.email).toBe(testEmail)

    console.log('✅ Acesso autorizado!')
  })

  it('deve fazer logout', async () => {
    console.log('\n🚪 PASSO 5: Logout\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    expect(logoutResponse.status).toBe(200)

    console.log('✅ Logout realizado!')

    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE COMPLETO: GOOGLE OAUTH 100% REAL            ║')
    console.log('║   ✅ OAuth flow iniciado                              ║')
    console.log('║   ✅ Callback processado                              ║')
    console.log('║   ✅ Usuário criado/encontrado                        ║')
    console.log('║   ✅ Google Account vinculada                         ║')
    console.log('║   ✅ Acesso autorizado                                ║')
    console.log('║   ✅ Logout executado                                 ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')
  })
})
