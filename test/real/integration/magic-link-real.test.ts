import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askEmail, askUser, waitForUserAction } from '../setup/interactive'

describe('🔗 Magic Link REAL', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let testEmail: string
  let magicToken: string
  let userId: string
  let accessToken: string

  beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE REAL: MAGIC LINK LOGIN                       ║')
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

  it('deve solicitar magic link', async () => {
    console.log('\n📧 PASSO 1: Solicitar Magic Link\n')

    testEmail = await askEmail('📧 Digite seu email para receber magic link:')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log(`\n⏳ Enviando magic link para ${testEmail}...`)

    const requestResponse = await fetch(`${baseUrl}/api/v1/auth/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail }),
    })

    const requestData = await requestResponse.json()

    expect(requestResponse.status).toBe(200)
    expect(requestData.success).toBe(true)

    console.log('\n✅ Magic link enviado!')
    console.log('   📬 Verifique sua caixa de entrada')

    await waitForUserAction('Abra seu email e localize o magic link')
  })

  it('deve validar token no banco', async () => {
    console.log('\n🔍 PASSO 2: Validar Token\n')

    magicToken = await askUser('🔑 Cole o token do magic link (da URL do email):')

    console.log('\n🗄️  Validando token no banco...')

    const prisma = getRealPrisma()
    const magicLink = await prisma.magicLink.findFirst({
      where: { token: magicToken },
    })

    expect(magicLink).toBeTruthy()
    expect(magicLink?.email).toBe(testEmail)
    expect(magicLink?.used).toBe(false)
    expect(magicLink?.expiresAt.getTime()).toBeGreaterThan(Date.now())

    console.log('✅ Token válido!')
    console.log(`   Token ID: ${magicLink?.id}`)
    console.log(`   Expira em: ${magicLink?.expiresAt.toISOString()}`)
  })

  it('deve fazer login com magic link', async () => {
    console.log('\n🔐 PASSO 3: Login com Magic Link\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Fazendo login...')

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/magic-link/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: magicToken }),
    })

    const loginData = await loginResponse.json()

    expect(loginResponse.status).toBe(200)
    expect(loginData.success).toBe(true)
    expect(loginData.data.accessToken).toBeDefined()
    expect(loginData.data.user).toBeDefined()

    accessToken = loginData.data.accessToken
    userId = loginData.data.user.id

    console.log('\n✅ Login realizado!')
    console.log(`   User ID: ${userId}`)
    console.log(`   Email: ${loginData.data.user.email}`)
  })

  it('deve marcar token como usado', async () => {
    console.log('\n✔️  PASSO 4: Validar Token Usado\n')

    const prisma = getRealPrisma()
    const usedToken = await prisma.magicLink.findFirst({
      where: { token: magicToken },
    })

    expect(usedToken?.used).toBe(true)

    console.log('✅ Token marcado como usado!')
  })

  it('deve rejeitar token já usado', async () => {
    console.log('\n❌ PASSO 5: Testar Reutilização\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Tentando usar token novamente...')

    const retryResponse = await fetch(`${baseUrl}/api/v1/auth/magic-link/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: magicToken }),
    })

    expect(retryResponse.status).toBe(400)

    const errorData = await retryResponse.json()
    expect(errorData.success).toBe(false)

    console.log('✅ Token usado rejeitado!')
  })

  it('deve acessar rota protegida', async () => {
    console.log('\n🔒 PASSO 6: Testar Acesso\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    const response = await fetch(`${baseUrl}/api/v1/users/me`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    expect(response.status).toBe(200)

    console.log('✅ Acesso autorizado!')

    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE COMPLETO: MAGIC LINK 100% REAL              ║')
    console.log('║   ✅ Magic link enviado por email                     ║')
    console.log('║   ✅ Token validado no banco                          ║')
    console.log('║   ✅ Login realizado com sucesso                      ║')
    console.log('║   ✅ Token marcado como usado                         ║')
    console.log('║   ✅ Reutilização bloqueada                           ║')
    console.log('║   ✅ Acesso autorizado                                ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')
  })
})
