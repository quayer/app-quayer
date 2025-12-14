import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const UAZAPI_BASE_URL = process.env.NEXT_PUBLIC_UAZAPI_BASE_URL || 'http://localhost:3000'

const handlers = [
  // Auth API routes
  http.post('/api/v1/auth/register', async ({ request }) => {
    const body = await request.json() as any
    
    // Simular validação de token de registro
    if (body.registrationToken === '12345678901234567890123456789012') {
      return HttpResponse.json({
        data: {
          token: 'mock-admin-token-123',
          user: {
            id: 'admin-user-id',
            email: body.email,
            name: body.name,
            role: 'admin'
          }
        }
      }, { status: 201 })
    }
    
    return HttpResponse.json({
      error: 'Token de registro inválido'
    }, { status: 400 })
  }),

  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = await request.json() as any
    
    if (body.email === 'admin@test.com' && body.password === 'admin123456') {
      return HttpResponse.json({
        data: {
          token: 'mock-admin-token-123',
          user: {
            id: 'admin-user-id',
            email: body.email,
            role: 'admin'
          }
        }
      }, { status: 200 })
    }
    
    return HttpResponse.json({
      error: 'Credenciais inválidas'
    }, { status: 401 })
  }),

  http.get('/api/v1/auth/me', ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    
    if (authHeader === 'Bearer mock-admin-token-123') {
      return HttpResponse.json({
        data: {
          id: 'admin-user-id',
          email: 'admin@test.com',
          name: 'Admin Test',
          role: 'admin'
        }
      }, { status: 200 })
    }
    
    return HttpResponse.json({
      error: 'Token inválido'
    }, { status: 401 })
  }),

  http.post('/api/v1/auth/invite', ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    
    if (authHeader === 'Bearer mock-admin-token-123') {
      return HttpResponse.json({
        data: {
          invitation: {
            id: 'invite-123',
            email: 'invited@test.com',
            role: 'user'
          },
          inviteUrl: 'http://localhost:3000/register?token=mock-invite-token'
        }
      }, { status: 201 })
    }
    
    return HttpResponse.json({
      error: 'Não autorizado'
    }, { status: 403 })
  }),

  http.get('/api/v1/auth/invite/:token', ({ params }) => {
    if (params.token === 'mock-invite-token') {
      return HttpResponse.json({
        data: {
          email: 'invited@test.com',
          role: 'user'
        }
      }, { status: 200 })
    }
    
    return HttpResponse.json({
      error: 'Convite não encontrado'
    }, { status: 404 })
  }),

  http.get('/api/v1/auth/users', ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    
    if (authHeader === 'Bearer mock-admin-token-123') {
      return HttpResponse.json({
        data: [
          {
            id: 'admin-user-id',
            email: 'admin@test.com',
            name: 'Admin Test',
            role: 'admin'
          }
        ]
      }, { status: 200 })
    }
    
    return HttpResponse.json({
      error: 'Não autorizado'
    }, { status: 403 })
  }),

  http.post('/api/v1/auth/change-password', ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    
    if (authHeader && authHeader.includes('token')) {
      return HttpResponse.json({
        data: { success: true }
      }, { status: 200 })
    }
    
    return HttpResponse.json({
      error: 'Não autorizado'
    }, { status: 401 })
  }),

  http.post('/api/v1/auth/logout', ({ request }) => {
    const authHeader = request.headers.get('Authorization')
    
    if (authHeader && authHeader.includes('token')) {
      return HttpResponse.json({
        data: { success: true }
      }, { status: 200 })
    }
    
    return HttpResponse.json({
      error: 'Não autorizado'
    }, { status: 401 })
  }),

  // Messages API routes
  http.get('http://localhost:3003/api/v1/chats/list', ({ request }) => {
    const url = new URL(request.url)
    const instanceId = url.searchParams.get('instanceId')
    
    if (!instanceId) {
      return HttpResponse.json({
        error: 'instanceId é obrigatório'
      }, { status: 400 })
    }
    
    return HttpResponse.json({
      data: []
    }, { status: 200 })
  }),

  http.get('http://localhost:3003/api/v1/messages/list', ({ request }) => {
    const url = new URL(request.url)
    const instanceId = url.searchParams.get('instanceId')
    const chatId = url.searchParams.get('chatId')
    
    if (!instanceId || !chatId) {
      return HttpResponse.json({
        error: 'instanceId e chatId são obrigatórios'
      }, { status: 400 })
    }
    
    return HttpResponse.json({
      data: []
    }, { status: 200 })
  }),

  http.post('http://localhost:3003/api/v1/messages/send-text', async ({ request }) => {
    const body = await request.json() as any
    
    if (!body.text || body.text.trim() === '') {
      return HttpResponse.json({
        error: 'Texto da mensagem é obrigatório'
      }, { status: 400 })
    }
    
    return HttpResponse.json({
      data: { success: true }
    }, { status: 200 })
  }),

  http.post('http://localhost:3003/api/v1/messages/send-image', async ({ request }) => {
    const body = await request.json() as any
    
    if (!body.imageUrl || !body.imageUrl.startsWith('http')) {
      return HttpResponse.json({
        error: 'URL da imagem inválida'
      }, { status: 400 })
    }
    
    return HttpResponse.json({
      data: { success: true }
    }, { status: 200 })
  }),

  http.post('http://localhost:3003/api/v1/messages/send-file', async ({ request }) => {
    const body = await request.json() as any
    
    if (!body.fileName || body.fileName.trim() === '') {
      return HttpResponse.json({
        error: 'Nome do arquivo é obrigatório'
      }, { status: 400 })
    }
    
    return HttpResponse.json({
      data: { success: true }
    }, { status: 200 })
  }),

  // App API routes
  http.get('/api/v1/dashboard', () => {
    return HttpResponse.json({
      instances: []
    }, { status: 200 })
  }),

  // UAZapi routes
  http.post('https://quayer.uazapi.com/instance/init', () => {
    return HttpResponse.json({
      instance: {
        name: 'test-instance',
        token: 'test-token-123'
      }
    }, { status: 200 })
  }),

  http.post('https://quayer.uazapi.com/instance/connect', () => {
    return HttpResponse.json({
      instance: {
        qrcode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        paircode: '123456'
      }
    }, { status: 200 })
  }),

  http.get('https://quayer.uazapi.com/instance/status', () => {
    return HttpResponse.json({
      instance: {
        status: 'connected',
        phoneNumber: '5511999887766',
        name: 'Test User',
        profileName: 'Test User'
      }
    }, { status: 200 })
  }),

  http.post('https://quayer.uazapi.com/instance/disconnect', () => {
    return HttpResponse.json({
      success: true
    }, { status: 200 })
  }),

  http.delete('https://quayer.uazapi.com/instance', () => {
    return HttpResponse.json({
      success: true
    }, { status: 200 })
  }),

  http.get('https://quayer.uazapi.com/instance/all', () => {
    return HttpResponse.json({
      instances: []
    }, { status: 200 })
  }),

  // Chat/Dashboard routes
  http.get('https://quayer.uazapi.com/chat/count', () => {
    return HttpResponse.json({
      total_chats: 50,
      unread_chats: 10,
      groups: 5,
      pinned_chats: 3,
    }, { status: 200 })
  }),

  http.get(`${UAZAPI_BASE_URL}/chat/count`, () => {
    return HttpResponse.json({
      total_chats: 50,
      unread_chats: 10,
      groups: 5,
      pinned_chats: 3,
    }, { status: 200 })
  }),

  // Handler para localhost
  http.post(`${UAZAPI_BASE_URL}/chat/find`, () => {
    return HttpResponse.json({
      chats: [
        { wa_chatid: 'chat1', wa_name: 'Contato 1' },
        { wa_chatid: 'chat2', wa_name: 'Contato 2' },
      ],
      total: 2,
    }, { status: 200 })
  }),

  // Handler para quayer.uazapi.com (usado nos testes)
  http.post('https://quayer.uazapi.com/chat/find', () => {
    return HttpResponse.json({
      chats: [
        { wa_chatid: 'chat1', wa_name: 'Contato 1' },
        { wa_chatid: 'chat2', wa_name: 'Contato 2' },
      ],
      total: 2,
    }, { status: 200 })
  }),

  http.post(`${UAZAPI_BASE_URL}/message/find`, () => {
    return HttpResponse.json({
      messages: [],
      total: 0,
    }, { status: 200 })
  }),
]

export const server = setupServer(...handlers)
