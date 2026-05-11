import { describe, it, expect, beforeAll } from 'vitest'

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1'

/**
 * Testes de API para endpoints de device-sessions.
 *
 * Requer um token de admin valido. Configure via variavel de ambiente:
 *   TEST_ADMIN_TOKEN  - JWT de um usuario admin
 *   TEST_USER_TOKEN   - JWT de um usuario comum (para testar 403)
 *   TEST_CSRF_TOKEN   - Token CSRF valido (header X-CSRF-Token)
 *   TEST_CSRF_COOKIE  - Cookie csrf_token correspondente
 *
 * Caso nao fornecidos, os testes que exigem auth serao ignorados (skip).
 */

let adminToken = process.env.TEST_ADMIN_TOKEN ?? ''
let userToken = process.env.TEST_USER_TOKEN ?? ''

/** Helpers */
const authHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
})

const hasAdminToken = () => adminToken.length > 0
const hasUserToken = () => userToken.length > 0

describe('Device Sessions - Testes de API', () => {
  beforeAll(async () => {
    // Tentar login via register/login se tokens nao foram fornecidos
    // Como o sistema usa OTP, dependemos de tokens pre-configurados
    if (!hasAdminToken()) {
      // Tentar login classico como fallback
      try {
        const res = await fetch(`${BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'admin@test.com',
            password: 'admin123456',
          }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.data?.token) {
            adminToken = data.data.token
            console.log('Admin token obtido via login classico')
          }
        }
      } catch {
        console.log('Login classico nao disponivel, testes com auth serao ignorados')
      }
    }

    if (!hasUserToken()) {
      try {
        const res = await fetch(`${BASE_URL}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'user@test.com',
            password: 'user123456',
          }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.data?.token) {
            userToken = data.data.token
            console.log('User token obtido via login classico')
          }
        }
      } catch {
        // Ignora silenciosamente
      }
    }
  })

  // ─────────────────────────────────────────────
  // 1. Autenticacao e Autorizacao
  // ─────────────────────────────────────────────
  describe('1. Autenticacao e Autorizacao', () => {
    it('Deve rejeitar acesso sem token nos device-sessions (401)', async () => {
      const response = await fetch(`${BASE_URL}/device-sessions/all?page=1&limit=20`)
      const data = await response.json()
      console.log('Device Sessions sem token:', response.status, data)

      expect(response.status).toBe(401)
    })

    it.skipIf(!hasUserToken())('Deve rejeitar acesso de usuario nao-admin nos device-sessions (403)', async () => {
      const response = await fetch(`${BASE_URL}/device-sessions/all?page=1&limit=20`, {
        headers: authHeaders(userToken),
      })
      const data = await response.json()
      console.log('Device Sessions usuario comum:', response.status, data)

      expect(response.status).toBe(403)
    })

    it('Deve rejeitar token invalido (401)', async () => {
      const response = await fetch(`${BASE_URL}/device-sessions/all?page=1&limit=20`, {
        headers: authHeaders('token_completamente_invalido'),
      })
      const data = await response.json()
      console.log('Token invalido:', response.status, data)

      expect(response.status).toBe(401)
    })
  })

  // ─────────────────────────────────────────────
  // 2. Device Sessions
  // ─────────────────────────────────────────────
  describe('2. Device Sessions', () => {
    it.skipIf(!hasAdminToken())('Deve listar dispositivos (GET /device-sessions/all)', async () => {
      const response = await fetch(`${BASE_URL}/device-sessions/all?page=1&limit=20`, {
        headers: authHeaders(adminToken),
      })
      const data = await response.json()
      console.log('Listar dispositivos:', response.status, JSON.stringify(data).slice(0, 200))

      expect(response.status).toBe(200)
      expect(data.data).toBeDefined()
      expect(data.data.data).toBeInstanceOf(Array)
      expect(data.data.pagination).toBeDefined()
      expect(data.data.pagination.page).toBe(1)
      expect(data.data.pagination.limit).toBe(20)
      expect(typeof data.data.pagination.total).toBe('number')
      expect(typeof data.data.pagination.totalPages).toBe('number')
    })

    it.skipIf(!hasAdminToken())('Deve filtrar por status active', async () => {
      const response = await fetch(`${BASE_URL}/device-sessions/all?page=1&limit=20&status=active`, {
        headers: authHeaders(adminToken),
      })
      const data = await response.json()
      console.log('Filtrar active:', response.status)

      expect(response.status).toBe(200)
      expect(data.data).toBeDefined()
      // Todas as sessoes retornadas devem estar ativas (isRevoked = false)
      if (data.data.data.length > 0) {
        for (const session of data.data.data) {
          expect(session.isRevoked).toBe(false)
        }
      }
    })

    it.skipIf(!hasAdminToken())('Deve filtrar por status revoked', async () => {
      const response = await fetch(`${BASE_URL}/device-sessions/all?page=1&limit=20&status=revoked`, {
        headers: authHeaders(adminToken),
      })
      const data = await response.json()
      console.log('Filtrar revoked:', response.status)

      expect(response.status).toBe(200)
      expect(data.data).toBeDefined()
      // Todas as sessoes retornadas devem estar revogadas (isRevoked = true)
      if (data.data.data.length > 0) {
        for (const session of data.data.data) {
          expect(session.isRevoked).toBe(true)
        }
      }
    })

    it.skipIf(!hasAdminToken())('Deve paginar resultados', async () => {
      const response = await fetch(`${BASE_URL}/device-sessions/all?page=1&limit=2`, {
        headers: authHeaders(adminToken),
      })
      const data = await response.json()
      console.log('Paginacao (limit=2):', response.status, data.data?.pagination)

      expect(response.status).toBe(200)
      expect(data.data.pagination.limit).toBe(2)
      expect(data.data.data.length).toBeLessThanOrEqual(2)

      // Se tem mais de 2 resultados, verificar segunda pagina
      if (data.data.pagination.total > 2) {
        const page2 = await fetch(`${BASE_URL}/device-sessions/all?page=2&limit=2`, {
          headers: authHeaders(adminToken),
        })
        const data2 = await page2.json()

        expect(page2.status).toBe(200)
        expect(data2.data.pagination.page).toBe(2)
        expect(data2.data.data.length).toBeGreaterThan(0)
      }
    })

    it('Deve rejeitar revogacao sem CSRF token', async () => {
      // Mesmo com auth valido, mutations precisam de CSRF
      if (!hasAdminToken()) {
        // Sem token, espera 401
        const response = await fetch(`${BASE_URL}/device-sessions/revoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceSessionId: 'fake-id' }),
        })
        expect(response.status).toBe(401)
        return
      }

      const response = await fetch(`${BASE_URL}/device-sessions/revoke`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          // Sem X-CSRF-Token e sem Cookie csrf_token
        },
        body: JSON.stringify({ deviceSessionId: 'fake-id' }),
      })
      const data = await response.json()
      console.log('Revogar sem CSRF:', response.status, data)

      expect(response.status).toBe(403)
      expect(data.error).toContain('CSRF')
    })

    it('Deve rejeitar revogacao por usuario sem CSRF token', async () => {
      if (!hasAdminToken()) {
        const response = await fetch(`${BASE_URL}/device-sessions/revoke-by-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000000000' }),
        })
        expect(response.status).toBe(401)
        return
      }

      const response = await fetch(`${BASE_URL}/device-sessions/revoke-by-user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000000000' }),
      })
      const data = await response.json()
      console.log('Revogar por usuario sem CSRF:', response.status, data)

      expect(response.status).toBe(403)
      expect(data.error).toContain('CSRF')
    })
  })
})
