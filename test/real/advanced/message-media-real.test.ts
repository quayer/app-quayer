import { test, expect } from '@playwright/test'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { confirmAction, askPhoneNumber } from '../setup/interactive'

test.describe('🎬 Advanced: Message Media', () => {
  let baseUrl: string
  let accessToken: string
  let instanceId: string
  let testPhone: string

  test.beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   ADVANCED: MESSAGE MEDIA (Images, Videos, Docs)    ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')

    const env = validateRealTestEnv()
    baseUrl = env.NEXT_PUBLIC_APP_URL
    await setupRealDatabase()

    const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@quayer.com', password: 'admin123456' }),
    })
    accessToken = (await loginResponse.json()).data.accessToken

    // Create instance
    const createResponse = await fetch(`${baseUrl}/api/v1/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ name: 'Media Test Instance' }),
    })
    instanceId = (await createResponse.json()).data.id

    testPhone = await askPhoneNumber('Número para receber mídias:')
  })

  test.afterAll(async () => {
    const prisma = getRealPrisma()
    if (instanceId) await prisma.instance.delete({ where: { id: instanceId } }).catch(() => {})
    await cleanupRealDatabase()
  })

  test('deve enviar imagem via URL', async () => {
    console.log('\n🖼️  TESTE 1: Enviar Imagem\n')

    const imageUrl = 'https://picsum.photos/400/300'

    console.log('⏳ Enviando imagem...')

    const response = await fetch(`${baseUrl}/api/v1/messages/send-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        instanceId,
        to: testPhone,
        mediaUrl: imageUrl,
        mediaType: 'image',
        caption: '🖼️ Imagem de teste',
      }),
    })

    const data = await response.json()

    console.log(`   Status: ${response.status}`)
    console.log(`   Message ID: ${data.data?.id}`)

    expect(response.status).toBe(201)

    // Validate in DB
    const prisma = getRealPrisma()
    const message = await prisma.message.findUnique({ where: { id: data.data.id } })

    expect(message?.type).toBe('image')
    expect(message?.mediaUrl).toBe(imageUrl)

    console.log('✅ Imagem enviada')
    expect(await confirmAction('Você recebeu a IMAGEM?')).toBe(true)
  })

  test('deve enviar vídeo via URL', async () => {
    console.log('\n🎥 TESTE 2: Enviar Vídeo\n')

    const videoUrl = 'https://sample-videos.com/video123/mp4/240/big_buck_bunny_240p_1mb.mp4'

    console.log('⏳ Enviando vídeo...')

    const response = await fetch(`${baseUrl}/api/v1/messages/send-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        instanceId,
        to: testPhone,
        mediaUrl: videoUrl,
        mediaType: 'video',
        caption: '🎥 Vídeo de teste',
      }),
    })

    const data = await response.json()

    console.log(`   Status: ${response.status}`)
    console.log(`   Message ID: ${data.data?.id}`)

    expect(response.status).toBe(201)

    console.log('✅ Vídeo enviado')
    expect(await confirmAction('Você recebeu o VÍDEO?')).toBe(true)
  })

  test('deve enviar áudio via URL', async () => {
    console.log('\n🎵 TESTE 3: Enviar Áudio\n')

    const audioUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'

    console.log('⏳ Enviando áudio...')

    const response = await fetch(`${baseUrl}/api/v1/messages/send-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        instanceId,
        to: testPhone,
        mediaUrl: audioUrl,
        mediaType: 'audio',
      }),
    })

    const data = await response.json()

    console.log(`   Status: ${response.status}`)
    console.log(`   Message ID: ${data.data?.id}`)

    expect(response.status).toBe(201)

    console.log('✅ Áudio enviado')
    expect(await confirmAction('Você recebeu o ÁUDIO?')).toBe(true)
  })

  test('deve enviar documento (PDF) via URL', async () => {
    console.log('\n📄 TESTE 4: Enviar Documento (PDF)\n')

    const pdfUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'

    console.log('⏳ Enviando documento...')

    const response = await fetch(`${baseUrl}/api/v1/messages/send-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        instanceId,
        to: testPhone,
        mediaUrl: pdfUrl,
        mediaType: 'document',
        filename: 'documento-teste.pdf',
      }),
    })

    const data = await response.json()

    console.log(`   Status: ${response.status}`)
    console.log(`   Message ID: ${data.data?.id}`)

    expect(response.status).toBe(201)

    console.log('✅ Documento enviado')
    expect(await confirmAction('Você recebeu o DOCUMENTO?')).toBe(true)
  })

  test('deve validar tipos de mídia não suportados', async () => {
    console.log('\n❌ TESTE 5: Mídia Inválida\n')

    const invalidMediaTypes = [
      { type: 'invalid', url: 'https://example.com/file.xyz' },
      { type: 'executable', url: 'https://example.com/virus.exe' },
    ]

    console.log('⏳ Testando mídias inválidas...')

    for (const media of invalidMediaTypes) {
      const response = await fetch(`${baseUrl}/api/v1/messages/send-media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          instanceId,
          to: testPhone,
          mediaUrl: media.url,
          mediaType: media.type,
        }),
      })

      console.log(`   ${media.type}: ${response.status}`)

      expect(response.status).toBe(400)
    }

    console.log('✅ Mídias inválidas rejeitadas')
    expect(await confirmAction('Mídias inválidas foram bloqueadas?')).toBe(true)
  })

  test('deve resumir message media', async () => {
    console.log('\n📊 RESUMO: Message Media\n')
    console.log('┌──────────────────────────┬──────────┐')
    console.log('│ Tipo de Mídia            │ Status   │')
    console.log('├──────────────────────────┼──────────┤')
    console.log('│ Imagem (Image)           │    ✓     │')
    console.log('│ Vídeo (Video)            │    ✓     │')
    console.log('│ Áudio (Audio)            │    ✓     │')
    console.log('│ Documento (PDF)          │    ✓     │')
    console.log('│ Validação de Tipos       │    ✓     │')
    console.log('└──────────────────────────┴──────────┘')
    console.log('\n✅ MESSAGE MEDIA: COMPLETO')
  })
})
