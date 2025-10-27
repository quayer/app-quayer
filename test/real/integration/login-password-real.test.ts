import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askEmail, askUser, confirmAction } from '../setup/interactive'

/**
 * 🔐 TESTE REAL DE LOGIN COM SENHA
 *
 * Este teste:
 * - Cria um usuário REAL no banco de dados
 * - Faz login com email e senha REAIS
 * - Valida JWT token retornado
 * - Verifica access token e refresh token no banco
 * - Testa todo o fluxo: Frontend → API → Controller → Service → Prisma
 */
describe('🔐 Login com Senha REAL', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let testEmail: string
  let testPassword: string
  let testName: string
  let userId: string
  let accessToken: string
  let refreshToken: string

  beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE REAL: LOGIN COM SENHA                        ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    env = validateRealTestEnv()
    await setupRealDatabase()
  })

  afterAll(async () => {
    // Cleanup: deletar usuário de teste
    if (userId) {
      const prisma = getRealPrisma()
      await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    }
    await cleanupRealDatabase()
  })

  it('deve criar usuário REAL para teste de login', async () => {
    console.log('\n🔧 PASSO 1: Criar Usuário de Teste\n')

    // Pedir dados ao usuário
    testEmail = await askEmail('📧 Digite email para criar usuário de teste:')
    testPassword = await askUser('🔒 Digite senha (mínimo 8 caracteres):')
    testName = await askUser('👤 Digite nome do usuário:')

    // Validar senha
    if (testPassword.length < 8) {
      throw new Error('Senha deve ter pelo menos 8 caracteres')
    }

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log(`\n⏳ Criando usuário: ${testEmail}`)

    // Criar usuário via API de signup
    const signupResponse = await fetch(`${baseUrl}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        name: testName,
      }),
    })

    const signupData = await signupResponse.json()

    expect(signupResponse.status).toBe(201)
    expect(signupData.success).toBe(true)
    expect(signupData.data.user).toBeDefined()

    userId = signupData.data.user.id

    console.log('✅ Usuário criado com sucesso!')
    console.log(`   ID: ${userId}`)
    console.log(`   Email: ${testEmail}`)
    console.log(`   Nome: ${testName}`)

    // Validar no banco
    console.log('\n🗄️  Validando usuário no banco...')
    const prisma = getRealPrisma()
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    expect(user).toBeTruthy()
    expect(user?.email).toBe(testEmail)
    expect(user?.name).toBe(testName)
    expect(user?.password).toBeTruthy() // Hash da senha existe
    expect(user?.emailVerified).toBe(true) // Email verificado no signup

    console.log('✅ Usuário validado no banco!')
  })

  it('deve fazer login com senha REAL', async () => {
    console.log('\n🔐 PASSO 2: Login com Senha\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log(`⏳ Fazendo login com ${testEmail}...`)

    // Login via API
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
      }),
    })

    const loginData = await loginResponse.json()

    expect(loginResponse.status).toBe(200)
    expect(loginData.success).toBe(true)
    expect(loginData.data.accessToken).toBeDefined()
    expect(loginData.data.refreshToken).toBeDefined()
    expect(loginData.data.user).toBeDefined()

    accessToken = loginData.data.accessToken
    refreshToken = loginData.data.refreshToken

    console.log('\n✅ Login realizado com sucesso!')
    console.log(`   User ID: ${loginData.data.user.id}`)
    console.log(`   Email: ${loginData.data.user.email}`)
    console.log(`   Nome: ${loginData.data.user.name}`)
    console.log(`   Access Token: ${accessToken.substring(0, 20)}...`)
    console.log(`   Refresh Token: ${refreshToken.substring(0, 20)}...`)

    // Validar estrutura do usuário retornado
    expect(loginData.data.user.id).toBe(userId)
    expect(loginData.data.user.email).toBe(testEmail)
    expect(loginData.data.user.name).toBe(testName)
  })

  it('deve validar JWT token no banco', async () => {
    console.log('\n🔍 PASSO 3: Validar JWT Token\n')

    // Decodificar JWT (apenas para validar estrutura, não verificar assinatura aqui)
    const tokenParts = accessToken.split('.')
    expect(tokenParts.length).toBe(3) // Header.Payload.Signature

    const payload = JSON.parse(
      Buffer.from(tokenParts[1], 'base64').toString('utf-8')
    )

    console.log('📋 JWT Payload:')
    console.log(`   User ID: ${payload.userId || payload.sub}`)
    console.log(`   Email: ${payload.email}`)
    console.log(`   Issued At: ${new Date(payload.iat * 1000).toISOString()}`)
    console.log(`   Expires At: ${new Date(payload.exp * 1000).toISOString()}`)

    // Validar payload
    expect(payload.userId || payload.sub).toBe(userId)
    expect(payload.email).toBe(testEmail)
    expect(payload.exp).toBeGreaterThan(payload.iat)

    console.log('\n✅ JWT token válido!')

    // Validar refresh token no banco
    console.log('\n🗄️  Validando refresh token no banco...')
    const prisma = getRealPrisma()
    const storedRefreshToken = await prisma.refreshToken.findFirst({
      where: {
        userId,
        token: refreshToken,
      },
    })

    expect(storedRefreshToken).toBeTruthy()
    expect(storedRefreshToken?.userId).toBe(userId)
    expect(storedRefreshToken?.token).toBe(refreshToken)
    expect(storedRefreshToken?.expiresAt).toBeInstanceOf(Date)
    expect(storedRefreshToken?.expiresAt.getTime()).toBeGreaterThan(Date.now())

    console.log('✅ Refresh token encontrado no banco!')
    console.log(`   ID: ${storedRefreshToken?.id}`)
    console.log(`   Expira em: ${storedRefreshToken?.expiresAt.toISOString()}`)
  })

  it('deve usar access token para acessar rota protegida', async () => {
    console.log('\n🔒 PASSO 4: Acessar Rota Protegida\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Testando acesso com token...')

    // Tentar acessar rota protegida (ex: /api/v1/organizations)
    const response = await fetch(`${baseUrl}/api/v1/organizations`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.success).toBe(true)

    console.log('✅ Acesso autorizado!')
    console.log(`   Organizações: ${data.data?.length || 0}`)
  })

  it('deve rejeitar login com senha incorreta', async () => {
    console.log('\n❌ PASSO 5: Testar Senha Incorreta\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Tentando login com senha errada...')

    const wrongPassword = 'senha_incorreta_123'

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: wrongPassword,
      }),
    })

    expect(loginResponse.status).toBe(401)

    const errorData = await loginResponse.json()
    expect(errorData.success).toBe(false)
    expect(errorData.error).toBeDefined()

    console.log('✅ Login rejeitado corretamente!')
    console.log(`   Erro: ${errorData.error.message || errorData.error}`)
  })

  it('deve rejeitar login com email inexistente', async () => {
    console.log('\n❌ PASSO 6: Testar Email Inexistente\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const fakeEmail = `fake_${Date.now()}@example.com`

    console.log(`⏳ Tentando login com ${fakeEmail}...`)

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: fakeEmail,
        password: testPassword,
      }),
    })

    expect(loginResponse.status).toBe(401)

    const errorData = await loginResponse.json()
    expect(errorData.success).toBe(false)

    console.log('✅ Login rejeitado corretamente!')
    console.log(`   Erro: ${errorData.error.message || errorData.error}`)
  })

  it('deve usar refresh token para obter novo access token', async () => {
    console.log('\n🔄 PASSO 7: Renovar Access Token\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Usando refresh token...')

    const refreshResponse = await fetch(`${baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refreshToken,
      }),
    })

    expect(refreshResponse.status).toBe(200)

    const refreshData = await refreshResponse.json()
    expect(refreshData.success).toBe(true)
    expect(refreshData.data.accessToken).toBeDefined()
    expect(refreshData.data.accessToken).not.toBe(accessToken) // Novo token

    const newAccessToken = refreshData.data.accessToken

    console.log('✅ Novo access token obtido!')
    console.log(`   Novo token: ${newAccessToken.substring(0, 20)}...`)

    // Validar que novo token funciona
    const testResponse = await fetch(`${baseUrl}/api/v1/organizations`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${newAccessToken}` },
    })

    expect(testResponse.status).toBe(200)
    console.log('✅ Novo token validado!')
  })

  it('deve fazer logout e invalidar refresh token', async () => {
    console.log('\n🚪 PASSO 8: Logout e Cleanup\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Fazendo logout...')

    const logoutResponse = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    })

    expect(logoutResponse.status).toBe(200)

    console.log('✅ Logout realizado!')

    // Validar que refresh token foi invalidado no banco
    console.log('\n🗄️  Validando invalidação no banco...')
    const prisma = getRealPrisma()
    const deletedToken = await prisma.refreshToken.findFirst({
      where: {
        userId,
        token: refreshToken,
      },
    })

    expect(deletedToken).toBeNull()

    console.log('✅ Refresh token removido do banco!')

    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE COMPLETO: LOGIN COM SENHA 100% REAL         ║')
    console.log('║   ✅ Criar usuário                                    ║')
    console.log('║   ✅ Login com senha                                  ║')
    console.log('║   ✅ JWT token validado                               ║')
    console.log('║   ✅ Rota protegida acessada                          ║')
    console.log('║   ✅ Senha incorreta rejeitada                        ║')
    console.log('║   ✅ Email inexistente rejeitado                      ║')
    console.log('║   ✅ Refresh token funcionando                        ║')
    console.log('║   ✅ Logout e invalidação                             ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')
  })
})
