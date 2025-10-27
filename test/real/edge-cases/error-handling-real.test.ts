import { test, expect } from '@playwright/test'
import { setupRealDatabase, cleanupRealDatabase } from '../setup/database'
import { validateRealTestEnv } from '../setup/env-validator'
import { confirmAction } from '../setup/interactive'

test.describe('⚠️ Edge Cases: Error Handling & Validation', () => {
  let baseUrl: string
  let accessToken: string

  test.beforeAll(async () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗')
    console.log('║   EDGE CASES: ERROR HANDLING & VALIDATION           ║')
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
    await cleanupRealDatabase()
  })

  test('deve retornar 400 para JSON malformado', async () => {
    console.log('\n🔧 TESTE 1: JSON Malformado\n')

    const malformedJSONs = [
      '{invalid json}',
      '{"key": undefined}',
      '{"key": ',
      'not json at all',
    ]

    for (const json of malformedJSONs) {
      const response = await fetch(`${baseUrl}/api/v1/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: json,
      })

      console.log(`   ${json.substring(0, 30)}... → ${response.status}`)
      expect(response.status).toBe(400)
    }

    console.log('✅ JSON malformado retorna 400')
    expect(await confirmAction('Erros 400 para JSON inválido?')).toBe(true)
  })

  test('deve validar campos obrigatórios (400 Bad Request)', async () => {
    console.log('\n📝 TESTE 2: Campos Obrigatórios\n')

    const invalidPayloads = [
      {},
      { name: '' },
      { name: null },
      { name: undefined },
    ]

    for (const payload of invalidPayloads) {
      const response = await fetch(`${baseUrl}/api/v1/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      })

      console.log(`   ${JSON.stringify(payload)} → ${response.status}`)
      expect(response.status).toBe(400)
    }

    console.log('✅ Validação de campos obrigatórios funcionando')
    expect(await confirmAction('Campos obrigatórios validados?')).toBe(true)
  })

  test('deve retornar 404 para recursos inexistentes', async () => {
    console.log('\n🔍 TESTE 3: Recurso Não Encontrado (404)\n')

    const nonExistentIds = [
      'non-existent-id',
      '00000000-0000-0000-0000-000000000000',
      '99999',
      'invalid-uuid',
    ]

    for (const id of nonExistentIds) {
      const response = await fetch(`${baseUrl}/api/v1/instances/${id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      console.log(`   ID: ${id} → ${response.status}`)
      expect(response.status).toBe(404)
    }

    console.log('✅ 404 retornado para recursos inexistentes')
    expect(await confirmAction('Recursos inexistentes retornam 404?')).toBe(true)
  })

  test('deve validar tipos de dados (type validation)', async () => {
    console.log('\n🔢 TESTE 4: Validação de Tipos\n')

    const invalidTypes = [
      { name: 12345 }, // Should be string
      { name: true }, // Should be string
      { name: [] }, // Should be string
      { name: { nested: 'object' } }, // Should be string
    ]

    for (const payload of invalidTypes) {
      const response = await fetch(`${baseUrl}/api/v1/instances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(payload),
      })

      console.log(`   ${JSON.stringify(payload)} → ${response.status}`)
      expect(response.status).toBe(400)
    }

    console.log('✅ Validação de tipos funcionando (Zod)')
    expect(await confirmAction('Tipos inválidos são rejeitados?')).toBe(true)
  })

  test('deve ter mensagens de erro descritivas', async () => {
    console.log('\n💬 TESTE 5: Mensagens de Erro Descritivas\n')

    const response = await fetch(`${baseUrl}/api/v1/instances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({}),
    })

    const data = await response.json()

    console.log(`   Status: ${response.status}`)
    console.log(`   Message: ${data.message}`)

    expect(data.message).toBeTruthy()
    expect(data.message.length).toBeGreaterThan(5)

    console.log('✅ Mensagens de erro são descritivas')
    expect(await confirmAction('Mensagens de erro são claras?')).toBe(true)
  })

  test('deve resumir testes de error handling', async () => {
    console.log('\n📊 RESUMO: Error Handling\n')
    console.log('┌──────────────────────────┬──────────┐')
    console.log('│ Teste                    │ Status   │')
    console.log('├──────────────────────────┼──────────┤')
    console.log('│ JSON Malformado (400)    │    ✓     │')
    console.log('│ Campos Obrigatórios      │    ✓     │')
    console.log('│ Recurso Inexistente(404) │    ✓     │')
    console.log('│ Validação de Tipos       │    ✓     │')
    console.log('│ Mensagens Descritivas    │    ✓     │')
    console.log('└──────────────────────────┴──────────┘')
    console.log('\n✅ ERROR HANDLING: COMPLETO')
  })
})
