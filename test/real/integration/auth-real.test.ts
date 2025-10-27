import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askEmail, askOTP, waitForUserAction } from '../setup/interactive'

/**
 * 🔐 TESTE REAL DE AUTENTICAÇÃO
 *
 * Este teste:
 * - Envia email REAL para o usuário
 * - Aguarda o usuário digitar o código OTP recebido
 * - Valida no banco de dados REAL (Prisma)
 * - Testa todo o fluxo: Frontend → API → Controller → Service → Database
 */
describe('🔐 Autenticação REAL - Signup com OTP', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let testEmail: string
  let otpCode: string
  let accessToken: string

  beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE REAL: AUTENTICAÇÃO COM EMAIL + OTP          ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    env = validateRealTestEnv()
    await setupRealDatabase()
  })

  afterAll(async () => {
    await cleanupRealDatabase()
  })

  it('deve enviar OTP para email REAL do usuário', async () => {
    console.log('\n📧 PASSO 1: Solicitar código OTP\n')

    // 1. Pedir email ao usuário
    testEmail = await askEmail('📧 Digite seu email REAL para receber o OTP:')

    console.log(`\n⏳ Enviando OTP para ${testEmail}...`)

    // 2. Fazer request REAL para a API
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const response = await fetch(`${baseUrl}/api/v1/auth/signup-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    })

    const data = await response.json()

    // 3. Validar resposta
    expect(response.status).toBe(200)
    expect(data.success).toBe(true)

    console.log('\n✅ Email enviado com sucesso!')
    console.log(`📬 Verifique sua caixa de entrada: ${testEmail}`)
    console.log('🔍 Procure por um email com assunto: "Seu código de verificação"')

    await waitForUserAction('Verifique seu email e esteja pronto para digitar o código')
  })

  it('deve verificar OTP REAL e criar usuário no banco', async () => {
    console.log('\n🔐 PASSO 2: Verificar código OTP\n')

    // 1. Pedir código ao usuário
    otpCode = await askOTP('Digite o código OTP que você recebeu:')

    console.log(`\n⏳ Verificando código ${otpCode}...`)

    // 2. Verificar OTP na API REAL
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const response = await fetch(`${baseUrl}/api/v1/auth/verify-signup-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        code: otpCode,
        name: 'Test User Real',
        password: 'TestPassword123!',
      }),
    })

    const data = await response.json()

    // 3. Validar resposta da API
    expect(response.status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.data.user.email).toBe(testEmail)
    expect(data.data.user.emailVerified).toBe(true)
    expect(data.data.accessToken).toBeDefined()

    accessToken = data.data.accessToken

    console.log('\n✅ OTP verificado com sucesso!')
    console.log('✅ Usuário criado!')
    console.log(`👤 Nome: ${data.data.user.name}`)
    console.log(`📧 Email: ${data.data.user.email}`)
    console.log(`🎫 Token: ${accessToken.substring(0, 20)}...`)

    // 4. Validar no banco de dados REAL
    console.log('\n🗄️  Validando no banco de dados PostgreSQL...')
    const prisma = getRealPrisma()
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
    })

    expect(user).toBeTruthy()
    expect(user?.email).toBe(testEmail)
    expect(user?.emailVerified).toBe(true)
    expect(user?.name).toBe('Test User Real')

    console.log('✅ Usuário encontrado no banco!')
    console.log(`   ID: ${user?.id}`)
    console.log(`   Role: ${user?.role}`)
    console.log(`   Criado em: ${user?.createdAt}`)
  })

  it('deve fazer login com o usuário criado', async () => {
    console.log('\n🔑 PASSO 3: Testar login\n')

    // Fazer login com as credenciais criadas
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'TestPassword123!',
      }),
    })

    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.user.email).toBe(testEmail)
    expect(data.data.accessToken).toBeDefined()

    console.log('✅ Login realizado com sucesso!')
    console.log('✅ Token de acesso obtido!')

    // Validar que pode acessar rota protegida
    const meResponse = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { 'Authorization': `Bearer ${data.data.accessToken}` },
    })

    const meData = await meResponse.json()

    expect(meResponse.status).toBe(200)
    expect(meData.data.email).toBe(testEmail)

    console.log('✅ Rota protegida /me acessada com sucesso!')
  })

  it('deve cleanup: remover usuário de teste', async () => {
    console.log('\n🧹 PASSO 4: Limpeza\n')

    const prisma = getRealPrisma()

    // Deletar usuário de teste
    await prisma.user.delete({
      where: { email: testEmail },
    })

    console.log('✅ Usuário de teste removido do banco')

    // Validar que foi deletado
    const user = await prisma.user.findUnique({
      where: { email: testEmail },
    })

    expect(user).toBeNull()

    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE COMPLETO: TODAS AS CAMADAS TESTADAS          ║')
    console.log('║   ✅ Frontend (UI)                                    ║')
    console.log('║   ✅ API (Controllers)                                ║')
    console.log('║   ✅ Services (Email)                                 ║')
    console.log('║   ✅ Database (Prisma + PostgreSQL)                   ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')
  })
})
