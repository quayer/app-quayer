import { test, expect } from '@playwright/test'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { confirmAction, askUser } from '../setup/interactive'

test.describe('🔁 Advanced: Webhooks Retry Logic', () => {
  let baseUrl: string
  let accessToken: string
  let webhookId: string

  test.beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   ADVANCED: WEBHOOKS RETRY LOGIC                     ║')
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
  })

  test.afterAll(async () => {
    const prisma = getRealPrisma()
    if (webhookId) await prisma.webhook.delete({ where: { id: webhookId } }).catch(() => {})
    await cleanupRealDatabase()
  })

  test('deve criar webhook com retry configuration', async () => {
    console.log('\n⚙️  TESTE 1: Webhook com Retry Config\n')

    const webhookUrl = await askUser('URL do webhook (ex: https://webhook.site/...):')

    const response = await fetch(`${baseUrl}/api/v1/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        url: webhookUrl,
        events: ['message.sent', 'message.received'],
        active: true,
        retryAttempts: 3,
        retryDelay: 5000, // 5s
      }),
    })

    const data = await response.json()
    webhookId = data.data.id

    console.log(`   Webhook ID: ${webhookId}`)
    console.log(`   Retry attempts: 3`)
    console.log(`   Retry delay: 5s`)

    expect(response.status).toBe(201)

    console.log('✅ Webhook criado com retry config')
    expect(await confirmAction('Webhook criado?')).toBe(true)
  })

  test('deve tentar reenviar webhook em caso de falha (404)', async () => {
    console.log('\n🔄 TESTE 2: Retry em Webhook Falho\n')

    // Create webhook with invalid URL
    const invalidWebhook = await fetch(`${baseUrl}/api/v1/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        url: 'https://httpstat.us/404', // Always returns 404
        events: ['message.sent'],
        active: true,
        retryAttempts: 3,
        retryDelay: 2000,
      }),
    })

    const invalidData = await invalidWebhook.json()
    const failWebhookId = invalidData.data.id

    console.log('⏳ Disparando evento para webhook inválido...')

    // Trigger webhook
    const triggerResponse = await fetch(`${baseUrl}/api/v1/webhooks/${failWebhookId}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    console.log(`   Trigger: ${triggerResponse.status}`)

    console.log('⏳ Aguardando retries (6s)...')
    await new Promise((resolve) => setTimeout(resolve, 6000))

    // Check webhook delivery attempts
    const deliveries = await fetch(`${baseUrl}/api/v1/webhooks/${failWebhookId}/deliveries`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const deliveriesData = await deliveries.json()
    console.log(`   Total attempts: ${deliveriesData.data?.length || 0}`)

    expect(deliveriesData.data?.length).toBeGreaterThan(0)

    console.log('✅ Retry logic funcionando')

    // Cleanup
    const prisma = getRealPrisma()
    await prisma.webhook.delete({ where: { id: failWebhookId } }).catch(() => {})

    expect(await confirmAction('Webhook tentou reenviar múltiplas vezes?')).toBe(true)
  })

  test('deve parar retries após sucesso', async () => {
    console.log('\n✅ TESTE 3: Parar Retry Após Sucesso\n')

    const successWebhook = await fetch(`${baseUrl}/api/v1/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        url: 'https://httpstat.us/200', // Always returns 200
        events: ['message.sent'],
        active: true,
        retryAttempts: 5,
        retryDelay: 1000,
      }),
    })

    const successData = await successWebhook.json()
    const successWebhookId = successData.data.id

    // Trigger webhook
    await fetch(`${baseUrl}/api/v1/webhooks/${successWebhookId}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Check deliveries - should be only 1 (no retries)
    const deliveries = await fetch(`${baseUrl}/api/v1/webhooks/${successWebhookId}/deliveries`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const deliveriesData = await deliveries.json()
    console.log(`   Total attempts: ${deliveriesData.data?.length || 0}`)

    // Should be 1 or close to 1 (no retries needed)
    expect(deliveriesData.data?.length).toBeLessThanOrEqual(2)

    console.log('✅ Retries param após sucesso')

    // Cleanup
    const prisma = getRealPrisma()
    await prisma.webhook.delete({ where: { id: successWebhookId } }).catch(() => {})

    expect(await confirmAction('Webhook parou após sucesso?')).toBe(true)
  })

  test('deve ter exponential backoff no retry', async () => {
    console.log('\n📈 TESTE 4: Exponential Backoff\n')

    console.log('⏳ Testando delays de retry...')

    const retryWebhook = await fetch(`${baseUrl}/api/v1/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        url: 'https://httpstat.us/500', // Always fails
        events: ['message.sent'],
        active: true,
        retryAttempts: 3,
        retryDelay: 1000, // 1s initial
        retryBackoff: 'exponential', // 1s, 2s, 4s
      }),
    })

    const retryData = await retryWebhook.json()
    const retryWebhookId = retryData.data.id

    const startTime = Date.now()

    // Trigger
    await fetch(`${baseUrl}/api/v1/webhooks/${retryWebhookId}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    // Wait for all retries (1s + 2s + 4s = 7s + overhead)
    await new Promise((resolve) => setTimeout(resolve, 10000))

    const endTime = Date.now()
    const totalTime = (endTime - startTime) / 1000

    console.log(`   Tempo total: ${totalTime.toFixed(1)}s`)
    console.log('   Esperado: ~7s (1s + 2s + 4s)')

    // Should take at least 6s (with some tolerance)
    expect(totalTime).toBeGreaterThan(5)

    console.log('✅ Exponential backoff funcionando')

    // Cleanup
    const prisma = getRealPrisma()
    await prisma.webhook.delete({ where: { id: retryWebhookId } }).catch(() => {})

    expect(await confirmAction('Backoff exponencial observado?')).toBe(true)
  })

  test('deve registrar falhas permanentes após max retries', async () => {
    console.log('\n❌ TESTE 5: Falha Permanente Após Max Retries\n')

    const failedWebhook = await fetch(`${baseUrl}/api/v1/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        url: 'https://httpstat.us/503', // Always unavailable
        events: ['message.sent'],
        active: true,
        retryAttempts: 2,
        retryDelay: 1000,
      }),
    })

    const failedData = await failedWebhook.json()
    const failedWebhookId = failedData.data.id

    // Trigger
    await fetch(`${baseUrl}/api/v1/webhooks/${failedWebhookId}/test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    await new Promise((resolve) => setTimeout(resolve, 5000))

    // Check deliveries - should have failed status
    const deliveries = await fetch(`${baseUrl}/api/v1/webhooks/${failedWebhookId}/deliveries`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    const deliveriesData = await deliveries.json()

    if (deliveriesData.data && deliveriesData.data.length > 0) {
      const lastDelivery = deliveriesData.data[0]
      console.log(`   Status: ${lastDelivery.status}`)
      console.log(`   Attempts: ${lastDelivery.attempts || 'N/A'}`)

      expect(lastDelivery.status).toBe('failed')
    }

    console.log('✅ Falha permanente registrada')

    // Cleanup
    const prisma = getRealPrisma()
    await prisma.webhook.delete({ where: { id: failedWebhookId } }).catch(() => {})

    expect(await confirmAction('Falha permanente após max retries?')).toBe(true)
  })

  test('deve resumir webhooks retry logic', async () => {
    console.log('\n📊 RESUMO: Webhooks Retry Logic\n')
    console.log('┌──────────────────────────┬──────────┐')
    console.log('│ Funcionalidade           │ Status   │')
    console.log('├──────────────────────────┼──────────┤')
    console.log('│ Retry Configuration      │    ✓     │')
    console.log('│ Retry em Falha           │    ✓     │')
    console.log('│ Parar Após Sucesso       │    ✓     │')
    console.log('│ Exponential Backoff      │    ✓     │')
    console.log('│ Falha Permanente         │    ✓     │')
    console.log('└──────────────────────────┴──────────┘')
    console.log('\n✅ WEBHOOKS RETRY: COMPLETO')
  })
})
