import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { askUser, confirmAction, waitForUserAction } from '../setup/interactive'

describe('🔔 Webhooks REAL', () => {
  let env: ReturnType<typeof validateRealTestEnv>
  let accessToken: string
  let webhookId: string
  let webhookUrl: string
  let webhookSecret: string
  let instanceId: string

  beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE REAL: WEBHOOKS E NOTIFICAÇÕES               ║')
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
    if (webhookId) {
      const baseUrl = env.NEXT_PUBLIC_APP_URL
      await fetch(`${baseUrl}/api/v1/webhooks/${webhookId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }).catch(() => {})
    }
    await cleanupRealDatabase()
  })

  it('deve criar webhook', async () => {
    console.log('\n🔨 PASSO 1: Criar Webhook\n')

    webhookUrl = await askUser('🔗 Digite URL do webhook (ex: https://webhook.site/...):')

    console.log('\n💡 DICA: Use https://webhook.site para testar webhooks')
    console.log('   1. Acesse webhook.site')
    console.log('   2. Copie a URL única gerada')
    console.log('   3. Use essa URL para receber webhooks\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Criando webhook...')

    const createResponse = await fetch(`${baseUrl}/api/v1/webhooks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        events: ['message.received', 'message.sent', 'instance.connected'],
        active: true,
      }),
    })

    const createData = await createResponse.json()

    expect(createResponse.status).toBe(201)
    expect(createData.success).toBe(true)
    expect(createData.data.id).toBeDefined()

    webhookId = createData.data.id
    webhookSecret = createData.data.secret

    console.log('\n✅ Webhook criado!')
    console.log(`   ID: ${webhookId}`)
    console.log(`   URL: ${webhookUrl}`)
    console.log(`   Secret: ${webhookSecret}`)
    console.log(`   Eventos: message.received, message.sent, instance.connected`)
  })

  it('deve validar webhook no banco', async () => {
    console.log('\n🗄️  PASSO 2: Validar no Banco\n')

    const prisma = getRealPrisma()
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
    })

    expect(webhook).toBeTruthy()
    expect(webhook?.url).toBe(webhookUrl)
    expect(webhook?.active).toBe(true)

    console.log('✅ Webhook validado!')
    console.log(`   URL: ${webhook?.url}`)
    console.log(`   Ativo: ${webhook?.active}`)
  })

  it('deve testar disparo manual', async () => {
    console.log('\n🧪 PASSO 3: Testar Disparo\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    console.log('⏳ Enviando evento de teste...')

    const testResponse = await fetch(`${baseUrl}/api/v1/webhooks/${webhookId}/test`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    const testData = await testResponse.json()

    expect(testResponse.status).toBe(200)
    expect(testData.success).toBe(true)

    console.log('\n✅ Evento enviado!')
    console.log('\n📋 VERIFIQUE:')
    console.log(`   1. Acesse: ${webhookUrl}`)
    console.log('   2. Verifique se recebeu a requisição POST')
    console.log('   3. Veja o payload JSON enviado\n')

    await waitForUserAction('Verifique o webhook em seu navegador')

    const received = await confirmAction('Você recebeu o webhook?')
    expect(received).toBe(true)
  })

  it('deve disparar webhook com evento real', async () => {
    console.log('\n📱 PASSO 4: Evento Real (Mensagem)\n')

    console.log('⏳ Criando instância para disparar evento...')

    const baseUrl = env.NEXT_PUBLIC_APP_URL
    const instanceName = `webhook_test_${Date.now()}`

    const instanceResponse = await fetch(`${baseUrl}/api/v1/instances`, {
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

    const instanceData = await instanceResponse.json()
    instanceId = instanceData.data.id

    console.log('✅ Instância criada!')
    console.log('   Isso deve ter disparado webhook: instance.created')

    console.log('\n📋 VERIFIQUE:')
    console.log(`   1. Acesse: ${webhookUrl}`)
    console.log('   2. Procure por evento instance.created')
    console.log('   3. Valide o payload\n')

    await waitForUserAction('Verifique o evento no webhook')

    const received = await confirmAction('Você recebeu o evento instance.created?')
    expect(received).toBe(true)
  })

  it('deve listar deliveries do webhook', async () => {
    console.log('\n📊 PASSO 5: Listar Deliveries\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    const deliveriesResponse = await fetch(
      `${baseUrl}/api/v1/webhooks/${webhookId}/deliveries`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    )

    const deliveriesData = await deliveriesResponse.json()

    expect(deliveriesResponse.status).toBe(200)
    expect(deliveriesData.data.length).toBeGreaterThan(0)

    console.log(`\n✅ Deliveries: ${deliveriesData.data.length}`)

    deliveriesData.data.forEach((delivery: any, index: number) => {
      console.log(`\n   ${index + 1}. ${delivery.event}`)
      console.log(`      Status: ${delivery.status}`)
      console.log(`      Tentativas: ${delivery.attempts}`)
      console.log(`      Data: ${new Date(delivery.createdAt).toLocaleString()}`)
    })
  })

  it('deve desativar webhook', async () => {
    console.log('\n🔇 PASSO 6: Desativar Webhook\n')

    const baseUrl = env.NEXT_PUBLIC_APP_URL

    const updateResponse = await fetch(`${baseUrl}/api/v1/webhooks/${webhookId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ active: false }),
    })

    expect(updateResponse.status).toBe(200)

    console.log('✅ Webhook desativado!')

    const prisma = getRealPrisma()
    const webhook = await prisma.webhook.findUnique({
      where: { id: webhookId },
    })

    expect(webhook?.active).toBe(false)
    console.log('✅ Validado no banco!')

    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   TESTE COMPLETO: WEBHOOKS 100% REAL                ║')
    console.log('║   ✅ Webhook criado                                   ║')
    console.log('║   ✅ Validado no banco                                ║')
    console.log('║   ✅ Teste manual disparado                           ║')
    console.log('║   ✅ Evento real recebido                             ║')
    console.log('║   ✅ Deliveries listadas                              ║')
    console.log('║   ✅ Webhook desativado                               ║')
    console.log('╚═══════════════════════════════════════════════════════╝\n')
  })
})
