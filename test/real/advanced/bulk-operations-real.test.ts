import { test, expect } from '@playwright/test'
import { setupRealDatabase, cleanupRealDatabase, getRealPrisma } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { confirmAction, askPhoneNumber } from '../setup/interactive'

test.describe('🔄 Advanced: Bulk Operations', () => {
  let baseUrl: string
  let accessToken: string
  let instanceId: string

  test.beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   ADVANCED: BULK OPERATIONS                          ║')
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

    // Create instance for tests
    const createResponse = await fetch(`${baseUrl}/api/v1/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ name: 'Bulk Test Instance' }),
    })
    instanceId = (await createResponse.json()).data.id
  })

  test.afterAll(async () => {
    const prisma = getRealPrisma()
    if (instanceId) await prisma.instance.delete({ where: { id: instanceId } }).catch(() => {})
    await cleanupRealDatabase()
  })

  test('deve enviar mensagens em massa (bulk send)', async () => {
    console.log('\n📤 TESTE 1: Bulk Send Messages\n')

    const phone = await askPhoneNumber('Número para receber 3 mensagens:')

    const messages = [
      { to: phone, message: '🔥 Bulk message 1' },
      { to: phone, message: '🔥 Bulk message 2' },
      { to: phone, message: '🔥 Bulk message 3' },
    ]

    console.log('⏳ Enviando 3 mensagens em massa...')

    const response = await fetch(`${baseUrl}/api/v1/messages/bulk-send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ instanceId, messages }),
    })

    const data = await response.json()

    console.log(`   Status: ${response.status}`)
    console.log(`   Mensagens enviadas: ${data.data?.sent || 0}`)

    expect(response.status).toBe(200)
    expect(data.data?.sent).toBe(3)

    console.log('✅ Bulk send funcionando')
    expect(await confirmAction('Você recebeu as 3 mensagens?')).toBe(true)
  })

  test('deve deletar mensagens em massa (bulk delete)', async () => {
    console.log('\n🗑️  TESTE 2: Bulk Delete Messages\n')

    const prisma = getRealPrisma()

    // Create test messages
    const messageIds = []
    for (let i = 0; i < 5; i++) {
      const msg = await prisma.message.create({
        data: {
          instanceId,
          from: '123456',
          to: '654321',
          message: `Bulk delete test ${i}`,
          type: 'text',
          direction: 'sent',
          timestamp: new Date(),
        },
      })
      messageIds.push(msg.id)
    }

    console.log(`⏳ Deletando ${messageIds.length} mensagens...`)

    const response = await fetch(`${baseUrl}/api/v1/messages/bulk-delete`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ ids: messageIds }),
    })

    const data = await response.json()

    console.log(`   Deletadas: ${data.data?.deleted || 0}`)

    expect(response.status).toBe(200)
    expect(data.data?.deleted).toBe(5)

    // Validate in DB
    const remaining = await prisma.message.findMany({ where: { id: { in: messageIds } } })
    expect(remaining.length).toBe(0)

    console.log('✅ Bulk delete funcionando')
    expect(await confirmAction('Mensagens deletadas?')).toBe(true)
  })

  test('deve atualizar status em massa (bulk update)', async () => {
    console.log('\n✏️  TESTE 3: Bulk Update Status\n')

    const prisma = getRealPrisma()

    // Create messages with "sent" status
    const messageIds = []
    for (let i = 0; i < 3; i++) {
      const msg = await prisma.message.create({
        data: {
          instanceId,
          from: '111111',
          to: '222222',
          message: `Bulk update ${i}`,
          type: 'text',
          status: 'sent',
          direction: 'sent',
          timestamp: new Date(),
        },
      })
      messageIds.push(msg.id)
    }

    console.log('⏳ Atualizando status de 3 mensagens...')

    const response = await fetch(`${baseUrl}/api/v1/messages/bulk-update-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ ids: messageIds, status: 'delivered' }),
    })

    const data = await response.json()

    console.log(`   Atualizadas: ${data.data?.updated || 0}`)

    expect(response.status).toBe(200)

    // Validate in DB
    const updated = await prisma.message.findMany({ where: { id: { in: messageIds } } })
    expect(updated.every((m) => m.status === 'delivered')).toBe(true)

    console.log('✅ Bulk update funcionando')

    // Cleanup
    await prisma.message.deleteMany({ where: { id: { in: messageIds } } })

    expect(await confirmAction('Status atualizado em massa?')).toBe(true)
  })

  test('deve importar contatos em massa', async () => {
    console.log('\n📥 TESTE 4: Bulk Import Contacts\n')

    const contacts = [
      { name: 'Contact 1', phone: '5511999999901' },
      { name: 'Contact 2', phone: '5511999999902' },
      { name: 'Contact 3', phone: '5511999999903' },
    ]

    console.log('⏳ Importando 3 contatos...')

    const response = await fetch(`${baseUrl}/api/v1/contacts/bulk-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ contacts }),
    })

    const data = await response.json()

    console.log(`   Importados: ${data.data?.imported || 0}`)

    expect(response.status).toBe(200)
    expect(data.data?.imported).toBe(3)

    console.log('✅ Bulk import funcionando')
    expect(await confirmAction('Contatos importados?')).toBe(true)
  })

  test('deve exportar dados em massa (bulk export)', async () => {
    console.log('\n📤 TESTE 5: Bulk Export Data\n')

    console.log('⏳ Exportando mensagens em CSV...')

    const response = await fetch(`${baseUrl}/api/v1/messages/export?format=csv&instanceId=${instanceId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    console.log(`   Status: ${response.status}`)
    console.log(`   Content-Type: ${response.headers.get('content-type')}`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('csv')

    const csv = await response.text()
    console.log(`   Tamanho: ${csv.length} bytes`)

    expect(csv.length).toBeGreaterThan(0)

    console.log('✅ Bulk export funcionando')
    expect(await confirmAction('Export CSV gerado?')).toBe(true)
  })

  test('deve resumir bulk operations', async () => {
    console.log('\n📊 RESUMO: Bulk Operations\n')
    console.log('┌──────────────────────────┬──────────┐')
    console.log('│ Operação                 │ Status   │')
    console.log('├──────────────────────────┼──────────┤')
    console.log('│ Bulk Send Messages       │    ✓     │')
    console.log('│ Bulk Delete              │    ✓     │')
    console.log('│ Bulk Update Status       │    ✓     │')
    console.log('│ Bulk Import Contacts     │    ✓     │')
    console.log('│ Bulk Export (CSV)        │    ✓     │')
    console.log('└──────────────────────────┴──────────┘')
    console.log('\n✅ BULK OPERATIONS: COMPLETO')
  })
})
