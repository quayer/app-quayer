import { describe, it, expect, beforeAll } from 'vitest'

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1'

describe('📱 Sistema de Instâncias - Testes Completos', () => {
  let authToken: string
  let instanceId: string

  beforeAll(async () => {
    // Login para obter token
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@test.com',
        password: 'admin123456'
      })
    })

    const data = await response.json()
    authToken = data.data?.token || ''
  })

  describe('1. Criar Instância', () => {
    it('✅ Deve criar nova instância', async () => {
      const response = await fetch(`${BASE_URL}/instances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: 'Test Instance',
          phoneNumber: '+5511999999999',
          webhookUrl: 'https://webhook.test.com'
        })
      })

      const data = await response.json()
      console.log('📱 Criar Instância:', response.status, data)

      expect(response.status).toBe(201)
      expect(data.data.name).toBe('Test Instance')
      expect(data.data.id).toBeDefined()

      instanceId = data.data.id
    })

    it('❌ Deve falhar ao criar instância com nome duplicado', async () => {
      const response = await fetch(`${BASE_URL}/instances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: 'Test Instance',
          phoneNumber: '+5511999999999'
        })
      })

      const data = await response.json()
      console.log('🚫 Instância Duplicada:', response.status, data)

      expect(response.status).toBe(400)
    })
  })

  describe('2. Listar Instâncias', () => {
    it('✅ Deve listar todas as instâncias', async () => {
      const response = await fetch(`${BASE_URL}/instances`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      console.log('📋 Listar Instâncias:', response.status, data)

      expect(response.status).toBe(200)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data.length).toBeGreaterThan(0)
    })
  })

  describe('3. Buscar Instância por ID', () => {
    it('✅ Deve buscar instância por ID', async () => {
      const response = await fetch(`${BASE_URL}/instances/${instanceId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      console.log('🔍 Buscar Instância:', response.status, data)

      expect(response.status).toBe(200)
      expect(data.data.id).toBe(instanceId)
      expect(data.data.name).toBe('Test Instance')
    })

    it('❌ Deve retornar 404 para ID inexistente', async () => {
      const response = await fetch(`${BASE_URL}/instances/00000000-0000-0000-0000-000000000000`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      console.log('🚫 Instância Inexistente:', response.status, data)

      expect(response.status).toBe(404)
    })
  })

  describe('4. Atualizar Instância', () => {
    it('✅ Deve atualizar instância', async () => {
      const response = await fetch(`${BASE_URL}/instances/${instanceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          name: 'Test Instance Updated',
          phoneNumber: '+5511888888888'
        })
      })

      const data = await response.json()
      console.log('✏️ Atualizar Instância:', response.status, data)

      expect(response.status).toBe(200)
      expect(data.data.name).toBe('Test Instance Updated')
    })
  })

  describe('5. Status da Instância', () => {
    it('✅ Deve verificar status da instância', async () => {
      const response = await fetch(`${BASE_URL}/instances/${instanceId}/status`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      console.log('📊 Status Instância:', response.status, data)

      // Status pode retornar 200 ou 400 dependendo do UAZapi
      expect([200, 400]).toContain(response.status)
    })
  })

  describe('6. Conectar Instância (QR Code)', () => {
    it('✅ Deve tentar conectar instância', async () => {
      const response = await fetch(`${BASE_URL}/instances/${instanceId}/connect`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      console.log('🔗 Conectar Instância:', response.status, data)

      // Pode retornar 200 com QR Code ou 400 se já conectada
      expect([200, 400]).toContain(response.status)

      if (response.status === 200) {
        expect(data.data.expires).toBeDefined()
        expect(data.data.expires).toBe(120000) // 2 minutos em ms
      }
    })
  })

  describe('7. Desconectar Instância', () => {
    it('✅ Deve desconectar instância', async () => {
      const response = await fetch(`${BASE_URL}/instances/${instanceId}/disconnect`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      console.log('🔌 Desconectar Instância:', response.status, data)

      // Pode retornar 200 ou 400 dependendo do estado
      expect([200, 400]).toContain(response.status)
    })
  })

  describe('8. Deletar Instância', () => {
    it('✅ Deve deletar instância', async () => {
      const response = await fetch(`${BASE_URL}/instances/${instanceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      console.log('🗑️ Deletar Instância:', response.status, data)

      expect(response.status).toBe(200)
    })

    it('❌ Instância deletada não deve mais existir', async () => {
      const response = await fetch(`${BASE_URL}/instances/${instanceId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      console.log('🚫 Instância Deletada:', response.status, data)

      expect(response.status).toBe(404)
    })
  })
})