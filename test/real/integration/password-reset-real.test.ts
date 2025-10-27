import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askEmail, askUser, waitForUserAction } from '../setup/interactive'

/**
 * 🔐 TESTE REAL DE RESET DE SENHA
 *
 * Este teste:
 * - Envia email REAL de reset de senha
 * - Usuário recebe email e copia token
 * - Valida token no banco de dados
 * - Reseta senha com token REAL
 * - Faz login com nova senha
 * - Testa todo o fluxo: Frontend → API → Email Service → Prisma
 */
describe('🔐 Reset de Senha REAL', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let testEmail: string
  let testPassword: string
  let newPassword: string
  let resetToken: string
  let userId: string

  beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE REAL: RESET DE SENHA COM EMAIL              ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    env = validateRealTestEnv()
    await setupRealDatabase()
  })

  afterAll(async () => {
    // Cleanup
    if (userId) {
      const prisma = getRealPrisma()
      await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    }
    await cleanupRealDatabase()
  })

  it('deve criar usuário de teste', async () => {
    console.log('\n🔧 PASSO 1: Criar Usuário de Teste\n')

    testEmail = await askEmail('📧 Digite email para teste de reset:')
    testPassword = 'senha_original_123'
    const testName = 'Teste Reset'

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log(`⏳ Criando usuário ${testEmail}...`)

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

    userId = signupData.data.user.id

    console.log('✅ Usuário criado!')
    console.log(`   ID: ${userId}`)
    console.log(`   Email: ${testEmail}`)
  })

  it('deve solicitar reset de senha e enviar email REAL', async () => {
    console.log('\n📧 PASSO 2: Solicitar Reset de Senha\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log(`⏳ Solicitando reset para ${testEmail}...`)

    const resetResponse = await fetch(`${baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
      }),
    })

    const resetData = await resetResponse.json()

    expect(resetResponse.status).toBe(200)
    expect(resetData.success).toBe(true)

    console.log('\n✅ Email de reset enviado!')
    console.log('   📬 Verifique sua caixa de entrada')

    // Aguardar usuário receber email
    await waitForUserAction('Verifique seu email e localize o link/token de reset')
  })

  it('deve validar token de reset no banco', async () => {
    console.log('\n🔍 PASSO 3: Obter Token de Reset\n')

    // Usuário fornece o token recebido no email
    resetToken = await askUser('🔑 Digite o token de reset recebido no email:')

    console.log('\n🗄️  Validando token no banco...')

    const prisma = getRealPrisma()
    const passwordReset = await prisma.passwordReset.findFirst({
      where: {
        token: resetToken,
        userId,
      },
    })

    expect(passwordReset).toBeTruthy()
    expect(passwordReset?.userId).toBe(userId)
    expect(passwordReset?.used).toBe(false)
    expect(passwordReset?.expiresAt.getTime()).toBeGreaterThan(Date.now())

    console.log('✅ Token válido no banco!')
    console.log(`   Token ID: ${passwordReset?.id}`)
    console.log(`   Expira em: ${passwordReset?.expiresAt.toISOString()}`)
    console.log(`   Usado: ${passwordReset?.used}`)
  })

  it('deve resetar senha com token REAL', async () => {
    console.log('\n🔒 PASSO 4: Resetar Senha\n')

    newPassword = await askUser('🔑 Digite NOVA senha (mínimo 8 caracteres):')

    if (newPassword.length < 8) {
      throw new Error('Nova senha deve ter pelo menos 8 caracteres')
    }

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Resetando senha...')

    const resetResponse = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: resetToken,
        password: newPassword,
      }),
    })

    const resetData = await resetResponse.json()

    expect(resetResponse.status).toBe(200)
    expect(resetData.success).toBe(true)

    console.log('✅ Senha resetada com sucesso!')

    // Validar que token foi marcado como usado
    console.log('\n🗄️  Validando token marcado como usado...')
    const prisma = getRealPrisma()
    const usedToken = await prisma.passwordReset.findFirst({
      where: {
        token: resetToken,
        userId,
      },
    })

    expect(usedToken?.used).toBe(true)

    console.log('✅ Token marcado como usado no banco!')
  })

  it('deve fazer login com NOVA senha', async () => {
    console.log('\n🔐 PASSO 5: Login com Nova Senha\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log(`⏳ Fazendo login com nova senha...`)

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: newPassword,
      }),
    })

    const loginData = await loginResponse.json()

    expect(loginResponse.status).toBe(200)
    expect(loginData.success).toBe(true)
    expect(loginData.data.accessToken).toBeDefined()

    console.log('✅ Login com nova senha bem-sucedido!')
    console.log(`   Access Token: ${loginData.data.accessToken.substring(0, 20)}...`)
  })

  it('deve rejeitar login com senha ANTIGA', async () => {
    console.log('\n❌ PASSO 6: Testar Senha Antiga\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Tentando login com senha antiga...')

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword, // Senha original
      }),
    })

    expect(loginResponse.status).toBe(401)

    const errorData = await loginResponse.json()
    expect(errorData.success).toBe(false)

    console.log('✅ Senha antiga rejeitada corretamente!')
    console.log(`   Erro: ${errorData.error.message || errorData.error}`)
  })

  it('deve rejeitar token já usado', async () => {
    console.log('\n❌ PASSO 7: Tentar Reutilizar Token\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Tentando usar token novamente...')

    const resetResponse = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: resetToken,
        password: 'outra_senha_123',
      }),
    })

    expect(resetResponse.status).toBe(400)

    const errorData = await resetResponse.json()
    expect(errorData.success).toBe(false)

    console.log('✅ Token usado rejeitado corretamente!')
    console.log(`   Erro: ${errorData.error.message || errorData.error}`)
  })

  it('deve rejeitar token inválido', async () => {
    console.log('\n❌ PASSO 8: Testar Token Inválido\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const fakeToken = 'token_invalido_' + Date.now()

    console.log('⏳ Tentando usar token inválido...')

    const resetResponse = await fetch(`${baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: fakeToken,
        password: 'senha_qualquer_123',
      }),
    })

    expect(resetResponse.status).toBe(400)

    const errorData = await resetResponse.json()
    expect(errorData.success).toBe(false)

    console.log('✅ Token inválido rejeitado corretamente!')
    console.log(`   Erro: ${errorData.error.message || errorData.error}`)

    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE COMPLETO: RESET DE SENHA 100% REAL          ║')
    console.log('║   ✅ Email enviado com token                          ║')
    console.log('║   ✅ Token validado no banco                          ║')
    console.log('║   ✅ Senha resetada com sucesso                       ║')
    console.log('║   ✅ Login com nova senha OK                          ║')
    console.log('║   ✅ Senha antiga rejeitada                           ║')
    console.log('║   ✅ Token usado rejeitado                            ║')
    console.log('║   ✅ Token inválido rejeitado                         ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')
  })
})
