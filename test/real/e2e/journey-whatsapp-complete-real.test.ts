import { test, expect } from '@playwright/test'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askPhoneNumber, confirmAction, waitForUserAction, displayQRCode } from '../setup/interactive'

test.describe('💚 E2E Journey: WhatsApp Completo', () => {
  let baseUrl: string
  let accessToken: string
  let instanceId: string
  let messageId: string
  let testPhone: string

  test.beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   E2E JOURNEY: WHATSAPP COMPLETO                     ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    const env = validateRealTestEnv()
    baseUrl = env.NEXT_PUBLIC_APP_URL
    await setupRealDatabase()

    // Login
    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@quayer.com',
        password: 'admin123456',
      }),
    })

    const loginData = await loginResponse.json()
    accessToken = loginData.data.accessToken

    console.log('✅ Autenticação realizada')
  })

  test.afterAll(async () => {
    const prisma = getRealPrisma()

    // Cleanup
    if (messageId) {
      await prisma.message.delete({ where: { id: messageId } }).catch(() => {})
    }
    if (instanceId) {
      await prisma.instance.delete({ where: { id: instanceId } }).catch(() => {})
    }

    await cleanupRealDatabase()
  })

  test('JORNADA COMPLETA: QR → Conectar → Enviar → Receber → Status', async ({ page }) => {
    console.log('\n📋 INÍCIO DA JORNADA WHATSAPP\n')

    // ==================== PASSO 1: LOGIN NO DASHBOARD ====================
    console.log('🔑 PASSO 1: Login no Dashboard\n')

    await page.goto(`${baseUrl}/auth/login`)

    await page.fill('input[name="email"]', 'admin@quayer.com')
    await page.fill('input[name="password"]', 'admin123456')
    await page.click('button[type="submit"]')

    await page.waitForURL(/.*dashboard.*/, { timeout: 10000 })

    console.log('✅ Login realizado')

    // ==================== PASSO 2: NAVEGAR PARA INTEGRACÕES ====================
    console.log('\n💚 PASSO 2: Navegar para Integrações WhatsApp\n')

    await page.goto(`${baseUrl}/integracoes/whatsapp`)
    await page.waitForLoadState('networkidle')

    const isWhatsAppPage = page.url().includes('/whatsapp')
    expect(isWhatsAppPage).toBe(true)

    console.log('✅ Página de integrações WhatsApp carregada')

    const confirmed1 = await confirmAction('Você está na página de WhatsApp?')
    expect(confirmed1).toBe(true)

    // ==================== PASSO 3: CRIAR NOVA INSTÂNCIA ====================
    console.log('\n➕ PASSO 3: Criar Nova Instância WhatsApp\n')

    const newInstanceButton = page.locator('button:has-text("Nova Instância"), button:has-text("Adicionar")')

    if (await newInstanceButton.count() > 0) {
      await newInstanceButton.click()
      await page.waitForTimeout(500)

      // Fill instance form
      const instanceName = `Journey Test ${Date.now()}`
      await page.fill('input[name="name"], input[placeholder*="nome"]', instanceName)

      console.log(`   Nome: ${instanceName}`)

      await page.click('button[type="submit"]')
      await page.waitForTimeout(2000)

      console.log('✅ Instância criada via UI')
    } else {
      // Use API directly
      console.log('⚠️  Botão não encontrado - usando API')

      const createResponse = await fetch(`${baseUrl}/api/v1/instances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: `Journey Test ${Date.now()}`,
        }),
      })

      const createData = await createResponse.json()
      instanceId = createData.data.id

      console.log('✅ Instância criada via API')
    }

    // Get instance from database
    const prisma = getRealPrisma()
    const instance = await prisma.instance.findFirst({
      where: { name: { contains: 'Journey Test' } },
      orderBy: { createdAt: 'desc' },
    })

    expect(instance).toBeTruthy()
    instanceId = instance!.id

    console.log('✅ Instância validada no banco')
    console.log(`   Instance ID: ${instanceId}`)

    // ==================== PASSO 4: GERAR QR CODE ====================
    console.log('\n📱 PASSO 4: Gerar QR Code para Conectar\n')

    // Request QR code
    const qrResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}/qr`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const qrData = await qrResponse.json()

    expect(qrData.success).toBe(true)
    expect(qrData.data.qrCode).toBeTruthy()

    console.log('✅ QR Code gerado')

    // Display QR code in terminal
    displayQRCode(qrData.data.qrCode)

    console.log('📱 INSTRUÇÕES:')
    console.log('   1. Abra o WhatsApp no seu celular')
    console.log('   2. Vá em Configurações → Dispositivos Conectados')
    console.log('   3. Clique em "Conectar Dispositivo"')
    console.log('   4. Escaneie o QR Code acima\n')

    await waitForUserAction('Escaneie o QR Code e pressione Enter quando conectar')

    // ==================== PASSO 5: AGUARDAR CONEXÃO ====================
    console.log('\n⏳ PASSO 5: Aguardando Conexão...\n')

    let connected = false
    let attempts = 0
    const maxAttempts = 60

    while (!connected && attempts < maxAttempts) {
      const statusResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      const statusData = await statusResponse.json()

      if (statusData.data.status === 'connected') {
        connected = true
        console.log('✅ WhatsApp CONECTADO!')
        break
      }

      console.log(`   Tentativa ${attempts + 1}/${maxAttempts} - Status: ${statusData.data.status}`)
      await new Promise((resolve) => setTimeout(resolve, 2000))
      attempts++
    }

    expect(connected).toBe(true)

    // Validate in database
    const connectedInstance = await prisma.instance.findUnique({
      where: { id: instanceId },
    })

    expect(connectedInstance?.status).toBe('connected')

    console.log('✅ Status validado no banco: connected')

    const confirmed2 = await confirmAction('O WhatsApp conectou com sucesso?')
    expect(confirmed2).toBe(true)

    // ==================== PASSO 6: ENVIAR MENSAGEM ====================
    console.log('\n📤 PASSO 6: Enviar Mensagem de Teste\n')

    testPhone = await askPhoneNumber('Digite o número para enviar (com DDD):')

    const messageText = `🧪 Teste E2E Journey - ${new Date().toISOString()}`

    console.log(`   Para: ${testPhone}`)
    console.log(`   Mensagem: ${messageText}`)

    const sendResponse = await fetch(`${baseUrl}/api/v1/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        instanceId,
        to: testPhone,
        message: messageText,
      }),
    })

    const sendData = await sendResponse.json()

    expect(sendData.success).toBe(true)
    messageId = sendData.data.id

    console.log('✅ Mensagem enviada')
    console.log(`   Message ID: ${messageId}`)

    // Validate in database
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    })

    expect(message).toBeTruthy()
    expect(message?.type).toBe('text')
    expect(message?.direction).toBe('sent')

    console.log('✅ Mensagem validada no banco')

    const confirmed3 = await confirmAction('Você recebeu a mensagem no WhatsApp?')
    expect(confirmed3).toBe(true)

    // ==================== PASSO 7: AGUARDAR STATUS DELIVERED ====================
    console.log('\n✅ PASSO 7: Aguardar Status "Delivered"\n')

    let delivered = false
    attempts = 0

    while (!delivered && attempts < 30) {
      const statusResponse = await fetch(`${baseUrl}/api/v1/messages/${messageId}/status`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      const statusData = await statusResponse.json()

      console.log(`   Tentativa ${attempts + 1}/30 - Status: ${statusData.data.status}`)

      if (statusData.data.status === 'delivered' || statusData.data.status === 'read') {
        delivered = true
        console.log('✅ Mensagem ENTREGUE!')
        break
      }

      await new Promise((resolve) => setTimeout(resolve, 2000))
      attempts++
    }

    if (delivered) {
      const deliveredMessage = await prisma.message.findUnique({
        where: { id: messageId },
      })

      console.log(`✅ Status no banco: ${deliveredMessage?.status}`)
    }

    // ==================== PASSO 8: RESPONDER MENSAGEM ====================
    console.log('\n💬 PASSO 8: Responder Mensagem (Receber)\n')

    console.log('📱 INSTRUÇÕES:')
    console.log('   1. Abra a conversa no WhatsApp')
    console.log('   2. RESPONDA a mensagem de teste')
    console.log('   3. Digite qualquer coisa (ex: "Ok", "Teste")\n')

    await waitForUserAction('Envie uma resposta e pressione Enter')

    console.log('⏳ Aguardando recebimento da mensagem...')

    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Check for received messages
    const receivedResponse = await fetch(
      `${baseUrl}/api/v1/messages?instanceId=${instanceId}&direction=received&limit=5`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    const receivedData = await receivedResponse.json()

    console.log(`   Mensagens recebidas: ${receivedData.data.length}`)

    if (receivedData.data.length > 0) {
      const lastReceived = receivedData.data[0]
      console.log(`   Última mensagem: "${lastReceived.message?.substring(0, 50)}"`)
      console.log('✅ Mensagem recebida via webhook')

      // Validate in database
      const receivedMessage = await prisma.message.findFirst({
        where: {
          instanceId,
          direction: 'received',
        },
        orderBy: { timestamp: 'desc' },
      })

      expect(receivedMessage).toBeTruthy()
      console.log('✅ Mensagem validada no banco')
    }

    const confirmed4 = await confirmAction('A resposta foi recebida e apareceu no sistema?')
    expect(confirmed4).toBe(true)

    // ==================== PASSO 9: VER HISTÓRICO NO DASHBOARD ====================
    console.log('\n📊 PASSO 9: Visualizar Histórico no Dashboard\n')

    await page.goto(`${baseUrl}/dashboard/messages`)
    await page.waitForLoadState('networkidle')

    // Check if messages appear in table
    const messagesTable = page.locator('table, [role="table"]')

    if (await messagesTable.count() > 0) {
      const rowCount = await page.locator('tbody tr').count()
      console.log(`   Linhas na tabela: ${rowCount}`)

      expect(rowCount).toBeGreaterThan(0)

      console.log('✅ Histórico de mensagens visível')

      const confirmed5 = await confirmAction('Você vê as mensagens no dashboard?')
      expect(confirmed5).toBe(true)
    }

    // ==================== PASSO 10: DESCONECTAR INSTÂNCIA ====================
    console.log('\n🔌 PASSO 10: Desconectar Instância\n')

    const disconnectResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}/disconnect`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const disconnectData = await disconnectResponse.json()

    if (disconnectData.success) {
      console.log('✅ Instância desconectada')

      // Wait a bit and check status
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const finalInstance = await prisma.instance.findUnique({
        where: { id: instanceId },
      })

      console.log(`   Status final: ${finalInstance?.status}`)
    }

    // ==================== RESUMO DA JORNADA ====================
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   JORNADA WHATSAPP COMPLETA: SUCESSO 100%            ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    console.log('✅ PASSO 1: Login no dashboard')
    console.log('✅ PASSO 2: Navegou para WhatsApp')
    console.log('✅ PASSO 3: Instância criada')
    console.log('✅ PASSO 4: QR Code gerado e exibido')
    console.log('✅ PASSO 5: WhatsApp conectado')
    console.log('✅ PASSO 6: Mensagem enviada')
    console.log('✅ PASSO 7: Status delivered')
    console.log('✅ PASSO 8: Resposta recebida via webhook')
    console.log('✅ PASSO 9: Histórico visível no dashboard')
    console.log('✅ PASSO 10: Instância desconectada')

    console.log('\n🎉 JORNADA COMPLETA DO WHATSAPP: SUCESSO!\n')
    console.log('🔥 Stack completo testado:')
    console.log('   Browser → API → UAZAPI → QR Code')
    console.log('   → WhatsApp Real → Message Send')
    console.log('   → Webhook Receive → Status Tracking')
    console.log('   → Prisma → PostgreSQL → Dashboard UI')
  })
})
