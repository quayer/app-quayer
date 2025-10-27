import { describe, it, expect, beforeAll } from 'vitest'

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1'

describe('🔗 Sistema de Compartilhamento - Testes Completos', () => {
  let authToken: string
  let instanceId: string
  let shareToken: string

  beforeAll(async () => {
    // Login
    const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@test.com',
        password: 'admin123456'
      })
    })
    const loginData = await loginResponse.json()
    authToken = loginData.data?.token || ''

    // Criar instância para testes
    const instanceResponse = await fetch(`${BASE_URL}/instances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        name: 'Share Test Instance',
        phoneNumber: '+5511777777777'
      })
    })
    const instanceData = await instanceResponse.json()
    instanceId = instanceData.data?.id || ''
  })

  describe('1. Criar Link de Compartilhamento', () => {
    it('✅ Deve criar link de compartilhamento', async () => {
      const response = await fetch(`${BASE_URL}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          instanceId,
          expiresInHours: 24
        })
      })

      const data = await response.json()
      console.log('🔗 Criar Link:', response.status, data)

      expect(response.status).toBe(201)
      expect(data.data.token).toBeDefined()
      expect(data.data.shareUrl).toContain('/connect/')

      shareToken = data.data.token
    })

    it('❌ Deve falhar sem instanceId', async () => {
      const response = await fetch(`${BASE_URL}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          expiresInHours: 24
        })
      })

      const data = await response.json()
      console.log('🚫 Link sem instanceId:', response.status, data)

      expect(response.status).toBe(400)
    })
  })

  describe('2. Validar Token de Compartilhamento', () => {
    it('✅ Deve validar token válido', async () => {
      const response = await fetch(`${BASE_URL}/share/validate/${shareToken}`)

      const data = await response.json()
      console.log('✔️ Validar Token:', response.status, data)

      expect(response.status).toBe(200)
      expect(data.data.isValid).toBe(true)
      expect(data.data.instance).toBeDefined()
    })

    it('❌ Deve falhar com token inválido', async () => {
      const response = await fetch(`${BASE_URL}/share/validate/token_fake_12345`)

      const data = await response.json()
      console.log('🚫 Token Inválido:', response.status, data)

      expect(response.status).toBe(404)
    })
  })

  describe('3. Listar Links Compartilhados', () => {
    it('✅ Deve listar links de uma instância', async () => {
      const response = await fetch(`${BASE_URL}/share/instance/${instanceId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      console.log('📋 Listar Links:', response.status, data)

      expect(response.status).toBe(200)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data.length).toBeGreaterThan(0)
    })
  })

  describe('4. Revogar Link', () => {
    it('✅ Deve revogar link de compartilhamento', async () => {
      const response = await fetch(`${BASE_URL}/share/${shareToken}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      })

      const data = await response.json()
      console.log('🗑️ Revogar Link:', response.status, data)

      expect(response.status).toBe(200)
    })

    it('❌ Link revogado não deve ser válido', async () => {
      const response = await fetch(`${BASE_URL}/share/validate/${shareToken}`)

      const data = await response.json()
      console.log('🚫 Token Revogado:', response.status, data)

      expect(response.status).toBe(404)
    })
  })
})