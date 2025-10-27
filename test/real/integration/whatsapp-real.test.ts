import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askPhoneNumber, displayQRCode, waitForUserAction, confirmAction } from '../setup/interactive'

/**
 * 📱 TESTE REAL DE INTEGRAÇÃO WHATSAPP
 *
 * Este teste:
 * - Cria uma instância REAL no UAZAPI
 * - Mostra o QR Code REAL no terminal
 * - Aguarda o usuário escanear MANUALMENTE com WhatsApp
 * - Envia mensagem REAL para um número
 * - Valida no banco de dados REAL (Prisma)
 * - Testa todo o fluxo: Frontend → API → Controller → Service → Database → WhatsApp
 */
describe('📱 WhatsApp REAL - Integração Completa', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let instanceId: string
  let instanceName: string
  let accessToken: string
  let testPhoneNumber: string

  beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE REAL: INTEGRAÇÃO WHATSAPP COM QR CODE       ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    env = validateRealTestEnv()
    await setupRealDatabase()

    // Login para obter access token
    console.log('🔐 Fazendo login para obter token de acesso...\n')
    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@quayer.com',
        password: 'admin123456',
      }),
    })

    const loginData = await loginResponse.json()
    expect(loginResponse.status).toBe(200)
    expect(loginData.data.accessToken).toBeDefined()
    accessToken = loginData.data.accessToken

    console.log('✅ Token de acesso obtido\n')
  })

  afterAll(async () => {
    await cleanupRealDatabase()
  })

  it('deve criar instância WhatsApp REAL', async () => {
    console.log('\n📱 PASSO 1: Criar Instância WhatsApp\n')

    instanceName = `test_${Date.now()}`
    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log(`⏳ Criando instância "${instanceName}"...`)

    const response = await fetch(`${baseUrl}/api/v1/instances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        instanceName,
        provider: 'uazapi',
      }),
    })

    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.success).toBe(true)
    expect(data.data.id).toBeDefined()
    expect(data.data.instanceName).toBe(instanceName)

    instanceId = data.data.id

    console.log('✅ Instância criada com sucesso!')
    console.log(`   ID: ${instanceId}`)
    console.log(`   Nome: ${instanceName}`)
    console.log(`   Provider: ${data.data.provider}`)
    console.log(`   Status: ${data.data.status}`)

    // Validar no banco de dados
    console.log('\n🗄️  Validando no banco de dados...')
    const prisma = getRealPrisma()
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
    })

    expect(instance).toBeTruthy()
    expect(instance?.instanceName).toBe(instanceName)
    console.log('✅ Instância encontrada no banco!')
  })

  it('deve obter QR Code REAL e aguardar scan manual', async () => {
    console.log('\n📲 PASSO 2: Obter e Escanear QR Code\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Solicitando QR Code...')

    const response = await fetch(`${baseUrl}/api/v1/instances/${instanceId}/qrcode`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.qrCode).toBeDefined()

    console.log('\n✅ QR Code obtido com sucesso!\n')

    // Exibir QR Code no terminal
    displayQRCode(data.data.qrCode)

    console.log('📱 INSTRUÇÕES:')
    console.log('   1. Abra o WhatsApp no seu celular')
    console.log('   2. Vá em Menu > Aparelhos conectados')
    console.log('   3. Clique em "Conectar um aparelho"')
    console.log('   4. Escaneie o QR Code acima\n')

    // Aguardar usuário escanear
    await waitForUserAction('Escaneie o QR Code com seu WhatsApp')

    // Polling para verificar conexão (máximo 60 segundos)
    console.log('\n⏳ Aguardando confirmação de conexão...')
    let connected = false
    let attempts = 0
    const maxAttempts = 30 // 30 tentativas x 2 segundos = 60 segundos

    while (!connected && attempts < maxAttempts) {
      const statusResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}/status`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })

      const statusData = await statusResponse.json()

      if (statusData.data.status === 'connected') {
        connected = true
        console.log('\n✅ WhatsApp conectado com sucesso!')
        console.log(`   Número: ${statusData.data.phoneNumber || 'N/A'}`)
        break
      }

      process.stdout.write(`\r⏳ Tentativa ${attempts + 1}/${maxAttempts}...`)
      await new Promise(resolve => setTimeout(resolve, 2000))
      attempts++
    }

    expect(connected).toBe(true)

    if (!connected) {
      throw new Error('Timeout: WhatsApp não foi conectado em 60 segundos')
    }

    // Validar status no banco
    console.log('\n🗄️  Validando status no banco...')
    const prisma = getRealPrisma()
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
    })

    expect(instance?.status).toBe('connected')
    console.log('✅ Status atualizado no banco!')
  })

  it('deve enviar mensagem REAL e validar no banco', async () => {
    console.log('\n💬 PASSO 3: Enviar Mensagem Real\n')

    // Pedir número ao usuário
    testPhoneNumber = await askPhoneNumber('📞 Digite o número de destino com DDI (ex: 5511999999999):')

    console.log(`\n⏳ Enviando mensagem para ${testPhoneNumber}...`)

    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const messageText = `🤖 TESTE REAL - ${new Date().toLocaleString()}\n\nEsta é uma mensagem de teste enviada pelo sistema de testes automáticos.\n\nInstância: ${instanceName}`

    const response = await fetch(`${baseUrl}/api/v1/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        instanceId,
        to: testPhoneNumber,
        message: messageText,
      }),
    })

    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.messageId).toBeDefined()

    const messageId = data.data.messageId

    console.log('\n✅ Mensagem enviada com sucesso!')
    console.log(`   ID: ${messageId}`)
    console.log(`   Para: ${testPhoneNumber}`)
    console.log(`   Status: ${data.data.status}`)

    // Validar no banco
    console.log('\n🗄️  Validando mensagem no banco...')
    const prisma = getRealPrisma()
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { instance: true },
    })

    expect(message).toBeTruthy()
    expect(message?.to).toBe(testPhoneNumber)
    expect(message?.message).toBe(messageText)
    expect(message?.instanceId).toBe(instanceId)
    expect(message?.instance.instanceName).toBe(instanceName)

    console.log('✅ Mensagem encontrada no banco!')
    console.log(`   ID do registro: ${message?.id}`)
    console.log(`   Timestamp: ${message?.createdAt}`)

    // Confirmar recebimento com usuário
    console.log('\n📱 CONFIRMAÇÃO MANUAL:')
    const received = await confirmAction(`Você recebeu a mensagem no número ${testPhoneNumber}?`)

    if (received) {
      console.log('✅ Usuário confirmou recebimento da mensagem!')
    } else {
      console.log('⚠️  Usuário NÃO confirmou recebimento - verificar logs do UAZAPI')
    }

    expect(received).toBe(true)
  })

  it('deve desconectar instância e cleanup', async () => {
    console.log('\n🧹 PASSO 4: Limpeza\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    // Desconectar instância
    console.log('⏳ Desconectando instância...')
    const disconnectResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}/disconnect`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    expect(disconnectResponse.status).toBe(200)
    console.log('✅ Instância desconectada')

    // Deletar instância
    console.log('⏳ Deletando instância...')
    const deleteResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    expect(deleteResponse.status).toBe(200)
    console.log('✅ Instância deletada')

    // Validar que foi deletada do banco
    const prisma = getRealPrisma()
    const instance = await prisma.instance.findUnique({
      where: { id: instanceId },
    })

    expect(instance).toBeNull()

    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE COMPLETO: WHATSAPP INTEGRAÇÃO 100% REAL      ║')
    console.log('║   ✅ API (Controllers + Services)                     ║')
    console.log('║   ✅ Database (Prisma + PostgreSQL)                   ║')
    console.log('║   ✅ UAZAPI (Instância + QR Code + Mensagem)          ║')
    console.log('║   ✅ Validação Manual (QR Scan + Recebimento)         ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')
  })
})
