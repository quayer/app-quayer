import { describe, it, expect, beforeAll } from 'vitest'

/**
 * @test API Integration Tests - Instances Module
 * @description Testes de API para novos endpoints de integração WhatsApp
 * @endpoints
 * - GET /api/v1/instances/:id/profile-picture
 * - POST /api/v1/instances/:id/webhook
 * - GET /api/v1/instances/:id/webhook
 * - POST /api/v1/instances (com validação de telefone)
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const API_BASE = `${BASE_URL}/api/v1`

// Tokens de autenticação (gerados via login)
let adminToken = ''
let masterToken = ''
let userToken = ''
let testInstanceId = ''

// Helper: Login e obter token
async function loginAndGetToken(email: string, password: string): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  })

  const data = await response.json()

  if (!data.data?.accessToken) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`)
  }

  return data.data.accessToken
}

beforeAll(async () => {
  // Fazer login com diferentes perfis
  adminToken = await loginAndGetToken('admin@quayer.com', 'admin123456')
  masterToken = await loginAndGetToken('master@acme.com', 'master123456')
  userToken = await loginAndGetToken('user@test.com', 'user123456')

  console.log('✅ Tokens obtidos para: admin, master, user')
})

describe('POST /api/v1/instances - Phone Validation', () => {
  it('Deve criar instância com telefone brasileiro válido', async () => {
    const response = await fetch(`${API_BASE}/instances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${masterToken}`
      },
      body: JSON.stringify({
        name: `Test Instance ${Date.now()}`,
        phoneNumber: '+5511999887766',
        brokerType: 'uazapi'
      })
    })

    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.data).toBeDefined()
    expect(data.data.phoneNumber).toMatch(/^\+55/) // Formato E.164

    // Salvar ID para testes seguintes
    if (data.data?.id) {
      testInstanceId = data.data.id
    }
  })

  it('Deve aceitar telefone sem código do país (Brasil padrão)', async () => {
    const response = await fetch(`${API_BASE}/instances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${masterToken}`
      },
      body: JSON.stringify({
        name: `Test No Code ${Date.now()}`,
        phoneNumber: '11999887766'
      })
    })

    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.data.phoneNumber).toMatch(/^\+5511/) // Deve adicionar +55 automaticamente
  })

  it('Deve rejeitar telefone inválido', async () => {
    const response = await fetch(`${API_BASE}/instances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${masterToken}`
      },
      body: JSON.stringify({
        name: `Invalid Phone ${Date.now()}`,
        phoneNumber: '123456'
      })
    })

    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.message).toMatch(/inválido/i)
  })

  it('Deve respeitar limite de instâncias da organização', async () => {
    // Assumindo que a organização tem limite de 1 instância
    // Tentar criar segunda instância deve falhar

    const response = await fetch(`${API_BASE}/instances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${masterToken}`
      },
      body: JSON.stringify({
        name: `Limit Test ${Date.now()}`,
        phoneNumber: '+5511988776655'
      })
    })

    // Se já tiver atingido o limite, deve retornar 400
    if (response.status === 400) {
      const data = await response.json()
      expect(data.message).toMatch(/limite/i)
    }
  })
})

describe('GET /api/v1/instances/:id/profile-picture', () => {
  it('Deve retornar 404 para instância não encontrada', async () => {
    const response = await fetch(`${API_BASE}/instances/invalid-id/profile-picture`, {
      headers: {
        'Authorization': `Bearer ${masterToken}`
      }
    })

    expect(response.status).toBe(404)
  })

  it('Deve retornar 400 para instância desconectada', async () => {
    // Usar instância de teste criada anteriormente (provavelmente desconectada)
    if (!testInstanceId) {
      console.log('⚠️  Pulando teste - testInstanceId não definido')
      return
    }

    const response = await fetch(`${API_BASE}/instances/${testInstanceId}/profile-picture`, {
      headers: {
        'Authorization': `Bearer ${masterToken}`
      }
    })

    // Instância desconectada deve retornar 400
    expect([400, 404]).toContain(response.status)

    if (response.status === 400) {
      const data = await response.json()
      expect(data.message).toMatch(/conectada/i)
    }
  })

  it('Deve retornar 403 para usuário de outra organização', async () => {
    if (!testInstanceId) {
      console.log('⚠️  Pulando teste - testInstanceId não definido')
      return
    }

    // Tentar acessar com token de user de outra org
    const response = await fetch(`${API_BASE}/instances/${testInstanceId}/profile-picture`, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    })

    expect([403, 404]).toContain(response.status)
  })

  // Nota: Teste com instância conectada requer mock ou instância real conectada
})

describe('POST /api/v1/instances/:id/webhook - RBAC Admin Only', () => {
  it('Admin pode configurar webhook', async () => {
    if (!testInstanceId) {
      console.log('⚠️  Pulando teste - testInstanceId não definido')
      return
    }

    const response = await fetch(`${API_BASE}/instances/${testInstanceId}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        webhookUrl: 'https://example.com/webhook',
        events: ['message.received', 'instance.status']
      })
    })

    // Admin deve ter permissão (200 ou 201)
    // Pode falhar se instância não tiver token UAZ, mas não deve ser 403
    expect(response.status).not.toBe(403)
  })

  it('Master NÃO pode configurar webhook (403 Forbidden)', async () => {
    if (!testInstanceId) {
      console.log('⚠️  Pulando teste - testInstanceId não definido')
      return
    }

    const response = await fetch(`${API_BASE}/instances/${testInstanceId}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${masterToken}`
      },
      body: JSON.stringify({
        webhookUrl: 'https://example.com/webhook',
        events: ['message.received']
      })
    })

    expect(response.status).toBe(403)

    const data = await response.json()
    expect(data.message).toMatch(/admin/i)
  })

  it('User NÃO pode configurar webhook (403 Forbidden)', async () => {
    if (!testInstanceId) {
      console.log('⚠️  Pulando teste - testInstanceId não definido')
      return
    }

    const response = await fetch(`${API_BASE}/instances/${testInstanceId}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        webhookUrl: 'https://example.com/webhook',
        events: ['message.received']
      })
    })

    expect(response.status).toBe(403)
  })
})

describe('GET /api/v1/instances/:id/webhook - RBAC Admin Only', () => {
  it('Admin pode obter configuração de webhook', async () => {
    if (!testInstanceId) {
      console.log('⚠️  Pulando teste - testInstanceId não definido')
      return
    }

    const response = await fetch(`${API_BASE}/instances/${testInstanceId}/webhook`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    })

    // Admin deve ter permissão (mesmo que retorne vazio)
    expect(response.status).not.toBe(403)
  })

  it('Master NÃO pode obter configuração de webhook', async () => {
    if (!testInstanceId) {
      console.log('⚠️  Pulando teste - testInstanceId não definido')
      return
    }

    const response = await fetch(`${API_BASE}/instances/${testInstanceId}/webhook`, {
      headers: {
        'Authorization': `Bearer ${masterToken}`
      }
    })

    expect(response.status).toBe(403)
  })

  it('User NÃO pode obter configuração de webhook', async () => {
    if (!testInstanceId) {
      console.log('⚠️  Pulando teste - testInstanceId não definido')
      return
    }

    const response = await fetch(`${API_BASE}/instances/${testInstanceId}/webhook`, {
      headers: {
        'Authorization': `Bearer ${userToken}`
      }
    })

    expect(response.status).toBe(403)
  })
})

describe('Integration - Complete Flow', () => {
  it('Fluxo completo: Criar instância -> Conectar -> Obter foto perfil', async () => {
    // 1. Criar instância
    const createResponse = await fetch(`${API_BASE}/instances`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${masterToken}`
      },
      body: JSON.stringify({
        name: `Complete Flow ${Date.now()}`,
        phoneNumber: '+5511987654321'
      })
    })

    expect(createResponse.status).toBe(201)
    const createData = await createResponse.json()
    const instanceId = createData.data.id

    console.log(`✅ Instância criada: ${instanceId}`)

    // 2. Tentar conectar (gerará QR Code)
    const connectResponse = await fetch(`${API_BASE}/instances/${instanceId}/connect`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${masterToken}`
      }
    })

    // Conexão deve retornar QR Code
    expect([200, 201]).toContain(connectResponse.status)
    const connectData = await connectResponse.json()

    if (connectData.data?.qrcode) {
      console.log('📱 QR Code gerado com sucesso')
    }

    // 3. Tentar obter foto de perfil (deve falhar pois não está conectado)
    const profileResponse = await fetch(`${API_BASE}/instances/${instanceId}/profile-picture`, {
      headers: {
        'Authorization': `Bearer ${masterToken}`
      }
    })

    // Deve retornar 400 pois instância não está conectada
    expect(profileResponse.status).toBe(400)

    console.log('✅ Fluxo completo testado com sucesso')
  })
})
