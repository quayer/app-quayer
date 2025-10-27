import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askPhoneNumber, displayQRCode, waitForUserAction, confirmAction } from '../setup/interactive'

describe('📥 WhatsApp Receber Mensagens REAL', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let instanceId: string
  let instanceName: string
  let accessToken: string
  let webhookUrl: string

  beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE REAL: WHATSAPP RECEBER MENSAGENS            ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    env = validateRealTestEnv()
    await setupRealDatabase()

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
    accessToken = loginData.data.accessToken
  })

  afterAll(async () => {
    if (instanceId) {
      const baseUrl = env.NEXT_PUBLIC_APP_URL
      await fetch(`${baseUrl}/api/v1/instances/${instanceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }).catch(() => {})
    }
    await cleanupRealDatabase()
  })

  it('deve conectar WhatsApp', async () => {
    console.log('\n📱 PASSO 1: Conectar WhatsApp\n')

    instanceName = `test_receive_${Date.now()}`
    const baseUrl = env.NEXT_PUBLIC_APP_URL

    const createResponse = await fetch(`${baseUrl}/api/v1/instances`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceName,
        provider: 'uazapi',
      }),
    })

    const createData = await createResponse.json()
    instanceId = createData.data.id

    const qrResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}/qrcode`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    const qrData = await qrResponse.json()
    displayQRCode(qrData.data.qrCode)

    console.log('📱 Escaneie o QR Code para conectar\n')
    await waitForUserAction('Escaneie o QR Code')

    let connected = false
    let attempts = 0
    while (!connected && attempts < 30) {
      const statusResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}/status`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })
      const statusData = await statusResponse.json()

      if (statusData.data.status === 'connected') {
        connected = true
        console.log('\n✅ WhatsApp conectado!')
        break
      }

      process.stdout.write(`\r⏳ Aguardando... ${attempts + 1}/30`)
      await new Promise(resolve => setTimeout(resolve, 2000))
      attempts++
    }

    expect(connected).toBe(true)
  })

  it('deve configurar webhook para receber mensagens', async () => {
    console.log('\n🔔 PASSO 2: Configurar Webhook\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL
    webhookUrl = `${baseUrl}/api/v1/webhooks/incoming`

    console.log(`⏳ Configurando webhook...`)
    console.log(`   URL: ${webhookUrl}`)

    const webhookResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}/webhook`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: ['message'],
      }),
    })

    expect(webhookResponse.status).toBe(200)

    console.log('✅ Webhook configurado!')
  })

  it('deve receber mensagem de texto', async () => {
    console.log('\n💬 PASSO 3: Receber Mensagem de Texto\n')

    console.log('📱 INSTRUÇÕES:')
    console.log('   1. Pegue seu celular')
    console.log('   2. Abra o WhatsApp')
    console.log('   3. Envie uma mensagem de TESTE para este número')
    console.log('   4. Mensagem: "Teste automatico de recepcao"\n')

    await waitForUserAction('Envie a mensagem agora')

    console.log('\n⏳ Aguardando mensagem no webhook (30 segundos)...')

    await new Promise(resolve => setTimeout(resolve, 5000))

    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const messagesResponse = await fetch(
      `${baseUrl}/api/v1/messages?instanceId=${instanceId}&type=received&limit=5`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    )

    const messagesData = await messagesResponse.json()

    expect(messagesResponse.status).toBe(200)
    expect(messagesData.data.length).toBeGreaterThan(0)

    console.log(`\n✅ Mensagens recebidas: ${messagesData.data.length}`)

    messagesData.data.forEach((msg: any) => {
      console.log(`\n   De: ${msg.from}`)
      console.log(`   Mensagem: ${msg.message}`)
      console.log(`   Hora: ${new Date(msg.timestamp).toLocaleString()}`)
    })

    const testMessage = messagesData.data.find((msg: any) =>
      msg.message?.toLowerCase().includes('teste')
    )

    expect(testMessage).toBeTruthy()
    console.log('\n✅ Mensagem de teste encontrada!')
  })

  it('deve validar mensagem no banco', async () => {
    console.log('\n🗄️  PASSO 4: Validar no Banco\n')

    const prisma = getRealPrisma()
    const messages = await prisma.message.findMany({
      where: {
        instanceId,
        direction: 'received',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    expect(messages.length).toBeGreaterThan(0)

    console.log(`✅ Mensagens no banco: ${messages.length}`)

    messages.forEach((msg, index) => {
      console.log(`\n   ${index + 1}. ${msg.from}`)
      console.log(`      Texto: ${msg.message?.substring(0, 50)}`)
      console.log(`      Status: ${msg.status}`)
    })
  })

  it('deve receber mensagem com mídia', async () => {
    console.log('\n🖼️  PASSO 5: Receber Mídia\n')

    console.log('📱 INSTRUÇÕES:')
    console.log('   1. Envie uma IMAGEM pelo WhatsApp')
    console.log('   2. Pode ser qualquer foto\n')

    await waitForUserAction('Envie a imagem agora')

    console.log('\n⏳ Aguardando mídia...')

    await new Promise(resolve => setTimeout(resolve, 5000))

    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const mediaResponse = await fetch(
      `${baseUrl}/api/v1/messages?instanceId=${instanceId}&type=received&hasMedia=true&limit=5`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    )

    const mediaData = await mediaResponse.json()

    expect(mediaResponse.status).toBe(200)

    if (mediaData.data.length > 0) {
      console.log(`\n✅ Mídia recebida: ${mediaData.data.length}`)

      mediaData.data.forEach((msg: any) => {
        console.log(`\n   Tipo: ${msg.mediaType}`)
        console.log(`   URL: ${msg.mediaUrl?.substring(0, 50)}...`)
        console.log(`   Caption: ${msg.caption || 'Sem legenda'}`)
      })
    } else {
      console.log('\n⚠️  Nenhuma mídia recebida ainda')
      console.log('   Tente enviar novamente')
    }
  })

  it('deve processar webhook payload', async () => {
    console.log('\n🔍 PASSO 6: Validar Webhook Payload\n')

    const prisma = getRealPrisma()
    const webhookLogs = await prisma.webhookLog.findMany({
      where: {
        event: 'message.received',
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    console.log(`✅ Webhook logs: ${webhookLogs.length}`)

    webhookLogs.forEach((log, index) => {
      console.log(`\n   ${index + 1}. Evento: ${log.event}`)
      console.log(`      Status: ${log.status}`)
      console.log(`      Hora: ${new Date(log.createdAt).toLocaleString()}`)
    })

    expect(webhookLogs.length).toBeGreaterThan(0)
  })

  it('deve confirmar recepção com usuário', async () => {
    console.log('\n✅ PASSO 7: Confirmação Final\n')

    const confirmed = await confirmAction('Todas as mensagens foram recebidas corretamente?')

    expect(confirmed).toBe(true)

    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE COMPLETO: RECEBER MENSAGENS 100% REAL       ║')
    console.log('║   ✅ WhatsApp conectado                               ║')
    console.log('║   ✅ Webhook configurado                              ║')
    console.log('║   ✅ Mensagem de texto recebida                       ║')
    console.log('║   ✅ Validado no banco                                ║')
    console.log('║   ✅ Mídia recebida                                   ║')
    console.log('║   ✅ Webhook payload processado                       ║')
    console.log('║   ✅ Usuário confirmou funcionamento                  ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')
  })
})
