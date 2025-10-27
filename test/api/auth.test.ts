import { describe, it, expect, beforeAll } from 'vitest'

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1'

describe('🔐 Sistema de Autenticação - Testes Completos', () => {
  let adminToken: string
  let adminUserId: string
  let inviteToken: string
  let secondUserToken: string

  describe('1. Registro e Login', () => {
    it('✅ Deve registrar o primeiro usuário (admin)', async () => {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@test.com',
          password: 'admin123456',
          name: 'Admin Test',
          registrationToken: '12345678901234567890123456789012'
        })
      })

      const data = await response.json()
      console.log('📝 Registro Admin:', response.status, data)

      expect(response.status).toBe(201)
      expect(data.data.token).toBeDefined()
      expect(data.data.user.role).toBe('admin')
      expect(data.data.user.email).toBe('admin@test.com')

      adminToken = data.data.token
      adminUserId = data.data.user.id
    })

    it('✅ Deve fazer login com credenciais corretas', async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@test.com',
          password: 'admin123456'
        })
      })

      const data = await response.json()
      console.log('🔑 Login:', response.status, data)

      expect(response.status).toBe(200)
      expect(data.data.token).toBeDefined()
      expect(data.data.user.email).toBe('admin@test.com')
    })

    it('❌ Deve falhar login com senha incorreta', async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'admin@test.com',
          password: 'senhaerrada'
        })
      })

      const data = await response.json()
      console.log('🚫 Login Inválido:', response.status, data)

      expect(response.status).toBe(401)
    })

    it('❌ Deve falhar registro com token inválido', async () => {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'user@test.com',
          password: 'user123456',
          name: 'User Test',
          registrationToken: 'token_invalido'
        })
      })

      const data = await response.json()
      console.log('🚫 Registro Token Inválido:', response.status, data)

      expect(response.status).toBe(400)
    })
  })

  describe('2. Rotas Protegidas', () => {
    it('✅ Deve obter usuário autenticado (/me)', async () => {
      const response = await fetch(`${BASE_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })

      const data = await response.json()
      console.log('👤 Usuário Atual:', response.status, data)

      expect(response.status).toBe(200)
      expect(data.data.email).toBe('admin@test.com')
      expect(data.data.role).toBe('admin')
    })

    it('❌ Deve falhar /me sem token', async () => {
      const response = await fetch(`${BASE_URL}/auth/me`)

      const data = await response.json()
      console.log('🚫 /me Sem Token:', response.status, data)

      expect(response.status).toBe(401)
    })

    it('❌ Deve falhar /me com token inválido', async () => {
      const response = await fetch(`${BASE_URL}/auth/me`, {
        headers: { 'Authorization': 'Bearer token_invalido' }
      })

      const data = await response.json()
      console.log('🚫 /me Token Inválido:', response.status, data)

      expect(response.status).toBe(401)
    })
  })

  describe('3. Sistema de Convites (Admin)', () => {
    it('✅ Admin deve criar convite', async () => {
      const response = await fetch(`${BASE_URL}/auth/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({
          email: 'invited@test.com',
          role: 'user'
        })
      })

      const data = await response.json()
      console.log('📧 Convite Criado:', response.status, data)

      expect(response.status).toBe(201)
      expect(data.data.invitation).toBeDefined()
      expect(data.data.inviteUrl).toContain('/register?token=')

      // Extrair token do URL
      const urlMatch = data.data.inviteUrl.match(/token=([^&]+)/)
      inviteToken = urlMatch ? urlMatch[1] : ''
    })

    it('✅ Deve validar token de convite', async () => {
      const response = await fetch(`${BASE_URL}/auth/invite/${inviteToken}`)

      const data = await response.json()
      console.log('✔️ Validar Convite:', response.status, data)

      expect(response.status).toBe(200)
      expect(data.data.email).toBe('invited@test.com')
      expect(data.data.role).toBe('user')
    })

    it('❌ Deve falhar validação com token inválido', async () => {
      const response = await fetch(`${BASE_URL}/auth/invite/token_fake`)

      const data = await response.json()
      console.log('🚫 Convite Inválido:', response.status, data)

      expect(response.status).toBe(404)
    })

    it('✅ Admin deve listar usuários', async () => {
      const response = await fetch(`${BASE_URL}/auth/users`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      })

      const data = await response.json()
      console.log('📋 Lista Usuários:', response.status, data)

      expect(response.status).toBe(200)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data.length).toBeGreaterThan(0)
    })
  })

  describe('4. Registro via Convite', () => {
    it('✅ Deve registrar usuário com convite válido', async () => {
      const response = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invited@test.com',
          password: 'invited123456',
          name: 'Invited User',
          registrationToken: inviteToken
        })
      })

      const data = await response.json()
      console.log('👥 Registro via Convite:', response.status, data)

      expect(response.status).toBe(201)
      expect(data.data.token).toBeDefined()
      expect(data.data.user.role).toBe('user')
      expect(data.data.user.email).toBe('invited@test.com')

      secondUserToken = data.data.token
    })

    it('❌ Usuário comum não deve acessar rota admin', async () => {
      const response = await fetch(`${BASE_URL}/auth/users`, {
        headers: { 'Authorization': `Bearer ${secondUserToken}` }
      })

      const data = await response.json()
      console.log('🚫 User tentando /users:', response.status, data)

      expect(response.status).toBe(403)
    })
  })

  describe('5. Alterar Senha', () => {
    it('✅ Deve alterar senha com sucesso', async () => {
      const response = await fetch(`${BASE_URL}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${secondUserToken}`
        },
        body: JSON.stringify({
          currentPassword: 'invited123456',
          newPassword: 'novaSenha12345'
        })
      })

      const data = await response.json()
      console.log('🔒 Alterar Senha:', response.status, data)

      expect(response.status).toBe(200)
    })

    it('✅ Deve fazer login com nova senha', async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invited@test.com',
          password: 'novaSenha12345'
        })
      })

      const data = await response.json()
      console.log('🔑 Login Nova Senha:', response.status, data)

      expect(response.status).toBe(200)
      expect(data.data.token).toBeDefined()
    })

    it('❌ Não deve fazer login com senha antiga', async () => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invited@test.com',
          password: 'invited123456'
        })
      })

      const data = await response.json()
      console.log('🚫 Login Senha Antiga:', response.status, data)

      expect(response.status).toBe(401)
    })
  })

  describe('6. Logout', () => {
    it('✅ Deve fazer logout com sucesso', async () => {
      const response = await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${secondUserToken}` }
      })

      const data = await response.json()
      console.log('👋 Logout:', response.status, data)

      expect(response.status).toBe(200)
    })

    it('❌ Token não deve funcionar após logout', async () => {
      const response = await fetch(`${BASE_URL}/auth/me`, {
        headers: { 'Authorization': `Bearer ${secondUserToken}` }
      })

      const data = await response.json()
      console.log('🚫 Token pós-logout:', response.status, data)

      expect(response.status).toBe(401)
    })
  })
})