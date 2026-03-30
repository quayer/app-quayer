import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000/api/v1'

/**
 * Testes de API para endpoints de seguranca administrativa.
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
const csrfToken = process.env.TEST_CSRF_TOKEN ?? 'test-csrf-token'
const csrfCookie = process.env.TEST_CSRF_COOKIE ?? 'test-csrf-token'

/** Helpers */
const authHeaders = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
})

const authHeadersWithCsrf = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
  'X-CSRF-Token': csrfToken,
  'Cookie': `csrf_token=${csrfCookie}`,
})

const hasAdminToken = () => adminToken.length > 0
const hasUserToken = () => userToken.length > 0

/** IDs de recursos criados durante os testes, para cleanup */
const createdIpRuleIds: string[] = []

describe('Admin Security - Testes de API', () => {
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

  afterAll(async () => {
    // Cleanup: deletar regras de IP criadas durante os testes
    if (hasAdminToken() && createdIpRuleIds.length > 0) {
      for (const id of createdIpRuleIds) {
        try {
          await fetch(`${BASE_URL}/ip-rules/${id}`, {
            method: 'DELETE',
            headers: authHeadersWithCsrf(adminToken),
          })
        } catch {
          // Ignora erros de cleanup
        }
      }
      console.log(`Cleanup: ${createdIpRuleIds.length} regra(s) de IP removida(s)`)
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

    it('Deve rejeitar acesso sem token nas ip-rules (401)', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules?page=1&limit=50`)
      const data = await response.json()
      console.log('IP Rules sem token:', response.status, data)

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

    it.skipIf(!hasUserToken())('Deve rejeitar acesso de usuario nao-admin nas ip-rules (403)', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules?page=1&limit=50`, {
        headers: authHeaders(userToken),
      })
      const data = await response.json()
      console.log('IP Rules usuario comum:', response.status, data)

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

  // ─────────────────────────────────────────────
  // 3. IP Rules - CRUD
  // ─────────────────────────────────────────────
  describe('3. IP Rules - CRUD', () => {
    let blockRuleId: string
    let allowRuleId: string

    it.skipIf(!hasAdminToken())('Deve listar regras de IP', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules?page=1&limit=50`, {
        headers: authHeaders(adminToken),
      })
      const data = await response.json()
      console.log('Listar IP Rules:', response.status, JSON.stringify(data).slice(0, 200))

      expect(response.status).toBe(200)
      expect(data.data).toBeDefined()
      expect(data.data.data).toBeInstanceOf(Array)
      expect(data.data.pagination).toBeDefined()
      expect(data.data.pagination.page).toBe(1)
      expect(data.data.pagination.limit).toBe(50)
      expect(typeof data.data.pagination.total).toBe('number')
    })

    it.skipIf(!hasAdminToken())('Deve criar regra de bloqueio (POST)', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules`, {
        method: 'POST',
        headers: authHeadersWithCsrf(adminToken),
        body: JSON.stringify({
          ipAddress: '10.0.0.99',
          type: 'BLOCK',
          description: 'Teste automatizado - regra de bloqueio',
        }),
      })
      const data = await response.json()
      console.log('Criar regra BLOCK:', response.status, data)

      expect(response.status).toBe(201)
      expect(data.data).toBeDefined()
      expect(data.data.rule).toBeDefined()
      expect(data.data.rule.ipAddress).toBe('10.0.0.99')
      expect(data.data.rule.type).toBe('BLOCK')
      expect(data.data.rule.isActive).toBe(true)
      expect(data.data.rule.id).toBeDefined()

      blockRuleId = data.data.rule.id
      createdIpRuleIds.push(blockRuleId)
    })

    it.skipIf(!hasAdminToken())('Deve criar regra de permissao (POST)', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules`, {
        method: 'POST',
        headers: authHeadersWithCsrf(adminToken),
        body: JSON.stringify({
          ipAddress: '192.168.1.100',
          type: 'ALLOW',
          description: 'Teste automatizado - regra de permissao',
        }),
      })
      const data = await response.json()
      console.log('Criar regra ALLOW:', response.status, data)

      expect(response.status).toBe(201)
      expect(data.data).toBeDefined()
      expect(data.data.rule).toBeDefined()
      expect(data.data.rule.ipAddress).toBe('192.168.1.100')
      expect(data.data.rule.type).toBe('ALLOW')

      allowRuleId = data.data.rule.id
      createdIpRuleIds.push(allowRuleId)
    })

    it.skipIf(!hasAdminToken())('Deve rejeitar IP invalido (999.999.999.999)', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules`, {
        method: 'POST',
        headers: authHeadersWithCsrf(adminToken),
        body: JSON.stringify({
          ipAddress: '999.999.999.999',
          type: 'BLOCK',
        }),
      })
      const data = await response.json()
      console.log('IP invalido 999.999.999.999:', response.status, data)

      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.status).toBeLessThan(500)
    })

    it.skipIf(!hasAdminToken())('Deve rejeitar IP malformado (abc.def)', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules`, {
        method: 'POST',
        headers: authHeadersWithCsrf(adminToken),
        body: JSON.stringify({
          ipAddress: 'abc.def',
          type: 'BLOCK',
        }),
      })
      const data = await response.json()
      console.log('IP malformado abc.def:', response.status, data)

      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.status).toBeLessThan(500)
    })

    it.skipIf(!hasAdminToken())('Deve atualizar regra (toggle isActive)', async () => {
      if (!blockRuleId) {
        console.log('Sem blockRuleId, criacao anterior pode ter falhado')
        return
      }

      // Desativar a regra
      const response = await fetch(`${BASE_URL}/ip-rules/${blockRuleId}`, {
        method: 'PUT',
        headers: authHeadersWithCsrf(adminToken),
        body: JSON.stringify({ isActive: false }),
      })
      const data = await response.json()
      console.log('Atualizar regra (desativar):', response.status, data)

      expect(response.status).toBe(200)
      expect(data.data).toBeDefined()
      expect(data.data.rule.isActive).toBe(false)

      // Reativar a regra
      const response2 = await fetch(`${BASE_URL}/ip-rules/${blockRuleId}`, {
        method: 'PUT',
        headers: authHeadersWithCsrf(adminToken),
        body: JSON.stringify({ isActive: true }),
      })
      const data2 = await response2.json()
      console.log('Atualizar regra (reativar):', response2.status, data2)

      expect(response2.status).toBe(200)
      expect(data2.data.rule.isActive).toBe(true)
    })

    it.skipIf(!hasAdminToken())('Deve deletar regra', async () => {
      if (!blockRuleId) {
        console.log('Sem blockRuleId, criacao anterior pode ter falhado')
        return
      }

      const response = await fetch(`${BASE_URL}/ip-rules/${blockRuleId}`, {
        method: 'DELETE',
        headers: authHeadersWithCsrf(adminToken),
      })
      const data = await response.json()
      console.log('Deletar regra:', response.status, data)

      expect(response.status).toBe(200)

      // Remover do array de cleanup pois ja foi deletado
      const idx = createdIpRuleIds.indexOf(blockRuleId)
      if (idx > -1) createdIpRuleIds.splice(idx, 1)
    })

    it.skipIf(!hasAdminToken())('Deve retornar 404 para regra inexistente (GET check)', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await fetch(`${BASE_URL}/ip-rules/${fakeId}`, {
        method: 'PUT',
        headers: authHeadersWithCsrf(adminToken),
        body: JSON.stringify({ isActive: false }),
      })
      const data = await response.json()
      console.log('Regra inexistente (PUT):', response.status, data)

      expect(response.status).toBe(404)
    })

    it.skipIf(!hasAdminToken())('Deve retornar 404 ao deletar regra inexistente', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000'

      const response = await fetch(`${BASE_URL}/ip-rules/${fakeId}`, {
        method: 'DELETE',
        headers: authHeadersWithCsrf(adminToken),
      })
      const data = await response.json()
      console.log('Deletar inexistente:', response.status, data)

      expect(response.status).toBe(404)
    })

    it('Deve rejeitar criacao sem CSRF token', async () => {
      if (!hasAdminToken()) {
        const response = await fetch(`${BASE_URL}/ip-rules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ipAddress: '10.0.0.1',
            type: 'BLOCK',
          }),
        })
        expect(response.status).toBe(401)
        return
      }

      const response = await fetch(`${BASE_URL}/ip-rules`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          // Sem X-CSRF-Token
        },
        body: JSON.stringify({
          ipAddress: '10.0.0.1',
          type: 'BLOCK',
        }),
      })
      const data = await response.json()
      console.log('Criar sem CSRF:', response.status, data)

      expect(response.status).toBe(403)
      expect(data.error).toContain('CSRF')
    })
  })

  // ─────────────────────────────────────────────
  // 4. IP Rules - Validacao IPv4
  // ─────────────────────────────────────────────
  describe('4. IP Rules - Validacao IPv4', () => {
    // Regex usada no controller: /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/
    // Testamos via endpoint check que tambem valida o formato

    it.skipIf(!hasAdminToken())('Deve aceitar 192.168.1.1 (check endpoint)', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules/check/192.168.1.1`, {
        headers: authHeaders(adminToken),
      })
      const data = await response.json()
      console.log('Check 192.168.1.1:', response.status, data)

      expect(response.status).toBe(200)
      expect(data.data.ipAddress).toBe('192.168.1.1')
      expect(['BLOCKED', 'ALLOWED', 'NO_RULE']).toContain(data.data.status)
    })

    it.skipIf(!hasAdminToken())('Deve aceitar 0.0.0.0 (check endpoint)', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules/check/0.0.0.0`, {
        headers: authHeaders(adminToken),
      })
      const data = await response.json()
      console.log('Check 0.0.0.0:', response.status, data)

      expect(response.status).toBe(200)
      expect(data.data.ipAddress).toBe('0.0.0.0')
    })

    it.skipIf(!hasAdminToken())('Deve aceitar 255.255.255.255 (check endpoint)', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules/check/255.255.255.255`, {
        headers: authHeaders(adminToken),
      })
      const data = await response.json()
      console.log('Check 255.255.255.255:', response.status, data)

      expect(response.status).toBe(200)
      expect(data.data.ipAddress).toBe('255.255.255.255')
    })

    it.skipIf(!hasAdminToken())('Deve rejeitar 256.0.0.0 (check endpoint)', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules/check/256.0.0.0`, {
        headers: authHeaders(adminToken),
      })
      const data = await response.json()
      console.log('Check 256.0.0.0:', response.status, data)

      expect(response.status).toBe(400)
    })

    it.skipIf(!hasAdminToken())('Deve rejeitar 999.999.999.999 (check endpoint)', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules/check/999.999.999.999`, {
        headers: authHeaders(adminToken),
      })
      const data = await response.json()
      console.log('Check 999.999.999.999:', response.status, data)

      expect(response.status).toBe(400)
    })

    // Validacao via criacao (POST) - IPs validos e invalidos
    it.skipIf(!hasAdminToken())('Deve aceitar criacao com 192.168.1.1', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules`, {
        method: 'POST',
        headers: authHeadersWithCsrf(adminToken),
        body: JSON.stringify({
          ipAddress: '192.168.1.1',
          type: 'ALLOW',
          description: 'Teste IPv4 valido - 192.168.1.1',
        }),
      })
      const data = await response.json()
      console.log('Criar com 192.168.1.1:', response.status)

      expect(response.status).toBe(201)
      if (data.data?.rule?.id) {
        createdIpRuleIds.push(data.data.rule.id)
      }
    })

    it.skipIf(!hasAdminToken())('Deve aceitar criacao com 0.0.0.0', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules`, {
        method: 'POST',
        headers: authHeadersWithCsrf(adminToken),
        body: JSON.stringify({
          ipAddress: '0.0.0.0',
          type: 'ALLOW',
          description: 'Teste IPv4 valido - 0.0.0.0',
        }),
      })
      const data = await response.json()
      console.log('Criar com 0.0.0.0:', response.status)

      expect(response.status).toBe(201)
      if (data.data?.rule?.id) {
        createdIpRuleIds.push(data.data.rule.id)
      }
    })

    it.skipIf(!hasAdminToken())('Deve aceitar criacao com 255.255.255.255', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules`, {
        method: 'POST',
        headers: authHeadersWithCsrf(adminToken),
        body: JSON.stringify({
          ipAddress: '255.255.255.255',
          type: 'BLOCK',
          description: 'Teste IPv4 valido - 255.255.255.255',
        }),
      })
      const data = await response.json()
      console.log('Criar com 255.255.255.255:', response.status)

      expect(response.status).toBe(201)
      if (data.data?.rule?.id) {
        createdIpRuleIds.push(data.data.rule.id)
      }
    })

    it.skipIf(!hasAdminToken())('Deve rejeitar criacao com 256.0.0.0', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules`, {
        method: 'POST',
        headers: authHeadersWithCsrf(adminToken),
        body: JSON.stringify({
          ipAddress: '256.0.0.0',
          type: 'BLOCK',
        }),
      })
      const data = await response.json()
      console.log('Criar com 256.0.0.0:', response.status, data)

      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.status).toBeLessThan(500)
    })

    it.skipIf(!hasAdminToken())('Deve rejeitar criacao com 999.999.999.999', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules`, {
        method: 'POST',
        headers: authHeadersWithCsrf(adminToken),
        body: JSON.stringify({
          ipAddress: '999.999.999.999',
          type: 'BLOCK',
        }),
      })
      const data = await response.json()
      console.log('Criar com 999.999.999.999:', response.status, data)

      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.status).toBeLessThan(500)
    })
  })

  // ─────────────────────────────────────────────
  // 5. IP Rules - Check Endpoint
  // ─────────────────────────────────────────────
  describe('5. IP Rules - Check Endpoint', () => {
    it.skipIf(!hasAdminToken())('Deve verificar status de IP sem regras (NO_RULE)', async () => {
      // IP improvavel de ter regra no sistema
      const response = await fetch(`${BASE_URL}/ip-rules/check/172.31.255.254`, {
        headers: authHeaders(adminToken),
      })
      const data = await response.json()
      console.log('Check IP sem regra:', response.status, data)

      expect(response.status).toBe(200)
      expect(data.data.ipAddress).toBe('172.31.255.254')
      expect(data.data.status).toBe('NO_RULE')
      expect(data.data.rules).toBeInstanceOf(Array)
      expect(data.data.rules.length).toBe(0)
    })

    it('Deve rejeitar check sem autenticacao (401)', async () => {
      const response = await fetch(`${BASE_URL}/ip-rules/check/10.0.0.1`)
      const data = await response.json()
      console.log('Check sem auth:', response.status, data)

      expect(response.status).toBe(401)
    })
  })
})
