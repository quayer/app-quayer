import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askPhoneNumber, askUser, displayQRCode, waitForUserAction, confirmAction, showMenu } from '../setup/interactive'
import fs from 'fs'
import path from 'path'

/**
 * 📱 TESTE REAL DE WHATSAPP COM MÍDIA
 *
 * Este teste:
 * - Conecta WhatsApp via QR Code REAL
 * - Envia IMAGEM real
 * - Envia ÁUDIO real
 * - Envia VÍDEO real
 * - Envia DOCUMENTO real
 * - Valida entrega e status no banco
 * - Testa stack completo: API → UAZAPI → WhatsApp → Prisma
 */
describe('📱 WhatsApp Mídia REAL', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let instanceId: string
  let instanceName: string
  let accessToken: string
  let testPhoneNumber: string

  beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE REAL: WHATSAPP COM ENVIO DE MÍDIA           ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    env = validateRealTestEnv()
    await setupRealDatabase()

    // Login
    console.log('🔐 Fazendo login...\n')
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
    console.log('✅ Token obtido\n')
  })

  afterAll(async () => {
    // Cleanup
    if (instanceId) {
      const baseUrl = env.NEXT_PUBLIC_APP_URL
      await fetch(`${baseUrl}/api/v1/instances/${instanceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }).catch(() => {})
    }
    await cleanupRealDatabase()
  })

  it('deve criar e conectar instância WhatsApp', async () => {
    console.log('\n📱 PASSO 1: Criar e Conectar WhatsApp\n')

    instanceName = `test_media_${Date.now()}`
    const baseUrl = env.NEXT_PUBLIC_APP_URL

    // Criar instância
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

    console.log('✅ Instância criada!')

    // Obter QR Code
    const qrResponse = await fetch(`${baseUrl}/api/v1/instances/${instanceId}/qrcode`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    const qrData = await qrResponse.json()
    displayQRCode(qrData.data.qrCode)

    console.log('📱 INSTRUÇÕES:')
    console.log('   1. Abra WhatsApp no celular')
    console.log('   2. Menu > Aparelhos conectados')
    console.log('   3. Conectar aparelho')
    console.log('   4. Escaneie o QR Code\n')

    await waitForUserAction('Escaneie o QR Code')

    // Polling
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

      process.stdout.write(`\r⏳ Aguardando conexão... ${attempts + 1}/30`)
      await new Promise(resolve => setTimeout(resolve, 2000))
      attempts++
    }

    expect(connected).toBe(true)

    testPhoneNumber = await askPhoneNumber('📞 Digite número para receber mídias:')
  })

  it('deve enviar IMAGEM real', async () => {
    console.log('\n🖼️  PASSO 2: Enviar Imagem\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    // Opções para imagem
    const choice = await showMenu('Escolha a fonte da imagem:', [
      'URL de imagem pública',
      'Arquivo local (path)',
      'Base64 embutido',
    ])

    let imageUrl: string
    let caption = '🖼️  Imagem de teste automático'

    if (choice === 1) {
      imageUrl = await askUser('🔗 Digite URL da imagem:')
    } else if (choice === 2) {
      const filePath = await askUser('📁 Digite path do arquivo:')
      // Simular upload (em produção, usaria S3 ou similar)
      imageUrl = `file://${filePath}`
      console.log('⚠️  Nota: Em produção, fazer upload para S3/storage público')
    } else {
      // Imagem de teste padrão (1x1 px transparente PNG)
      imageUrl = 'https://via.placeholder.com/300x300.png?text=Teste+Automatico'
    }

    console.log(`\n⏳ Enviando imagem para ${testPhoneNumber}...`)

    const sendResponse = await fetch(`${baseUrl}/api/v1/messages/send-media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceId,
        to: testPhoneNumber,
        mediaUrl: imageUrl,
        mediaType: 'image',
        caption,
      }),
    })

    const sendData = await sendResponse.json()

    expect(sendResponse.status).toBe(200)
    expect(sendData.data.messageId).toBeDefined()

    const messageId = sendData.data.messageId

    console.log('\n✅ Imagem enviada!')
    console.log(`   Message ID: ${messageId}`)

    // Validar no banco
    const prisma = getRealPrisma()
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    })

    expect(message).toBeTruthy()
    expect(message?.type).toBe('image')
    expect(message?.mediaUrl).toBe(imageUrl)

    console.log('✅ Mensagem validada no banco!')

    // Confirmar recebimento
    const received = await confirmAction('Você recebeu a IMAGEM?')
    expect(received).toBe(true)
  })

  it('deve enviar ÁUDIO real', async () => {
    console.log('\n🎵 PASSO 3: Enviar Áudio\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    const audioUrl = await askUser('🔗 Digite URL do arquivo de áudio (MP3/OGG):')

    console.log(`\n⏳ Enviando áudio para ${testPhoneNumber}...`)

    const sendResponse = await fetch(`${baseUrl}/api/v1/messages/send-media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceId,
        to: testPhoneNumber,
        mediaUrl: audioUrl,
        mediaType: 'audio',
      }),
    })

    const sendData = await sendResponse.json()

    expect(sendResponse.status).toBe(200)

    const messageId = sendData.data.messageId

    console.log('\n✅ Áudio enviado!')
    console.log(`   Message ID: ${messageId}`)

    // Validar no banco
    const prisma = getRealPrisma()
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    })

    expect(message?.type).toBe('audio')

    console.log('✅ Validado no banco!')

    const received = await confirmAction('Você recebeu o ÁUDIO?')
    expect(received).toBe(true)
  })

  it('deve enviar VÍDEO real', async () => {
    console.log('\n🎬 PASSO 4: Enviar Vídeo\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    const videoUrl = await askUser('🔗 Digite URL do vídeo (MP4):')
    const caption = '🎬 Vídeo de teste automático'

    console.log(`\n⏳ Enviando vídeo para ${testPhoneNumber}...`)

    const sendResponse = await fetch(`${baseUrl}/api/v1/messages/send-media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceId,
        to: testPhoneNumber,
        mediaUrl: videoUrl,
        mediaType: 'video',
        caption,
      }),
    })

    const sendData = await sendResponse.json()

    expect(sendResponse.status).toBe(200)

    const messageId = sendData.data.messageId

    console.log('\n✅ Vídeo enviado!')
    console.log(`   Message ID: ${messageId}`)

    // Validar no banco
    const prisma = getRealPrisma()
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    })

    expect(message?.type).toBe('video')

    console.log('✅ Validado no banco!')

    const received = await confirmAction('Você recebeu o VÍDEO?')
    expect(received).toBe(true)
  })

  it('deve enviar DOCUMENTO real', async () => {
    console.log('\n📄 PASSO 5: Enviar Documento\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    const documentUrl = await askUser('🔗 Digite URL do documento (PDF, DOC, etc):')
    const fileName = await askUser('📝 Digite nome do arquivo:')

    console.log(`\n⏳ Enviando documento para ${testPhoneNumber}...`)

    const sendResponse = await fetch(`${baseUrl}/api/v1/messages/send-media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instanceId,
        to: testPhoneNumber,
        mediaUrl: documentUrl,
        mediaType: 'document',
        fileName,
      }),
    })

    const sendData = await sendResponse.json()

    expect(sendResponse.status).toBe(200)

    const messageId = sendData.data.messageId

    console.log('\n✅ Documento enviado!')
    console.log(`   Message ID: ${messageId}`)
    console.log(`   Arquivo: ${fileName}`)

    // Validar no banco
    const prisma = getRealPrisma()
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    })

    expect(message?.type).toBe('document')

    console.log('✅ Validado no banco!')

    const received = await confirmAction('Você recebeu o DOCUMENTO?')
    expect(received).toBe(true)
  })

  it('deve validar status de entrega', async () => {
    console.log('\n✅ PASSO 6: Validar Status de Entrega\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    // Listar mensagens da instância
    const listResponse = await fetch(
      `${baseUrl}/api/v1/messages?instanceId=${instanceId}&limit=10`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    )

    const listData = await listResponse.json()

    expect(listResponse.status).toBe(200)
    expect(listData.data.length).toBeGreaterThan(0)

    console.log(`\n📊 Mensagens enviadas: ${listData.data.length}`)

    listData.data.forEach((msg: any) => {
      console.log(`   - ${msg.type}: ${msg.status} (${msg.to})`)
    })

    console.log('\n✅ Status validado!')

    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE COMPLETO: WHATSAPP MÍDIA 100% REAL          ║')
    console.log('║   ✅ WhatsApp conectado via QR Code                   ║')
    console.log('║   ✅ Imagem enviada e recebida                        ║')
    console.log('║   ✅ Áudio enviado e recebido                         ║')
    console.log('║   ✅ Vídeo enviado e recebido                         ║')
    console.log('║   ✅ Documento enviado e recebido                     ║')
    console.log('║   ✅ Status validado no banco                         ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')
  })
})
