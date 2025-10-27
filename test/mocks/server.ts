import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const UAZAPI_BASE_URL = process.env.NEXT_PUBLIC_UAZAPI_BASE_URL || 'http://localhost:3000'

const handlers = [
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
