import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { UAZapiService } from '@/lib/api/uazapi.service'

/**
 * @test Unit Tests - UAZapi Service
 * @description Testes unitários completos para o serviço UAZapi usando MSW
 */

describe('UAZapiService', () => {
  let service: UAZapiService
  const mockInstanceToken = 'test-instance-token-123'
  const mockAdminToken = 'test-admin-token-456'
  const mockBaseURL = 'https://test.uazapi.com'

  beforeEach(() => {
    // Mock environment variables
    process.env.UAZAPI_URL = mockBaseURL
    process.env.UAZAPI_ADMIN_TOKEN = mockAdminToken
    process.env.UAZAPI_TOKEN = mockAdminToken
    service = new UAZapiService()
  })

  describe('createInstance', () => {
    it('Deve criar instância com sucesso', async () => {
      const mockResponse = {
        success: true,
        data: {
          instanceId: '123',
          token: 'new-token-abc',
          name: 'Test Instance'
        }
      }

      server.use(
        http.post(`${mockBaseURL}/instance/init`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await service.createInstance('Test Instance')

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockResponse)
    })

    it('Deve usar admintoken ao criar instância', async () => {
      let receivedHeaders: Record<string, string> = {}

      server.use(
        http.post(`${mockBaseURL}/instance/init`, ({ request }) => {
          request.headers.forEach((value, key) => {
            receivedHeaders[key] = value
          })
          return HttpResponse.json({ success: true })
        })
      )

      await service.createInstance('Test Instance')

      expect(receivedHeaders).toHaveProperty('admintoken', mockAdminToken)
    })

    it('Deve lidar com erro na criação', async () => {
      server.use(
        http.post(`${mockBaseURL}/instance/init`, () => {
          return HttpResponse.json(
            { message: 'Nome inválido' },
            { status: 400, statusText: 'Bad Request' }
          )
        })
      )

      const result = await service.createInstance('Invalid')

      expect(result.success).toBe(false)
      expect(result.error).toContain('Nome inválido')
    })

    it('Deve lidar com exceção de rede', async () => {
      server.use(
        http.post(`${mockBaseURL}/instance/init`, () => {
          return HttpResponse.error()
        })
      )

      const result = await service.createInstance('Test')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Falha ao criar instância')
    })
  })

  describe('connectInstance', () => {
    it('Deve conectar e gerar QR Code', async () => {
      const mockResponse = {
        instance: {
          qrcode: 'data:image/png;base64,abc123',
          paircode: ''
        }
      }

      server.use(
        http.post(`${mockBaseURL}/instance/connect`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await service.connectInstance(mockInstanceToken)

      expect(result.success).toBe(true)
      expect(result.data?.qrcode).toBe('data:image/png;base64,abc123')
      expect(result.data?.expires).toBe(120000)
      expect(result.message).toContain('QR Code gerado')
    })

    it('Deve gerar código de pareamento com telefone', async () => {
      const mockResponse = {
        instance: {
          qrcode: '',
          paircode: '12345678'
        }
      }

      let requestBody: any = null

      server.use(
        http.post(`${mockBaseURL}/instance/connect`, async ({ request }) => {
          requestBody = await request.json()
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await service.connectInstance(mockInstanceToken, '5511999887766')

      expect(result.success).toBe(true)
      expect(result.data?.pairingCode).toBe('12345678')
      expect(result.message).toContain('Código de pareamento')
      expect(requestBody).toEqual({ phone: '5511999887766' })
    })

    it('Deve usar token da instância', async () => {
      let receivedHeaders: Record<string, string> = {}

      server.use(
        http.post(`${mockBaseURL}/instance/connect`, ({ request }) => {
          request.headers.forEach((value, key) => {
            receivedHeaders[key] = value
          })
          return HttpResponse.json({ instance: { qrcode: 'test' } })
        })
      )

      await service.connectInstance(mockInstanceToken)

      expect(receivedHeaders).toHaveProperty('token', mockInstanceToken)
    })

    it('Deve lidar com erro ao conectar', async () => {
      server.use(
        http.post(`${mockBaseURL}/instance/connect`, () => {
          return HttpResponse.error()
        })
      )

      const result = await service.connectInstance(mockInstanceToken)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Falha ao conectar instância')
    })
  })

  describe('disconnectInstance', () => {
    it('Deve desconectar instância com sucesso', async () => {
      server.use(
        http.post(`${mockBaseURL}/instance/disconnect`, () => {
          return HttpResponse.json({ success: true, message: 'Desconectado' })
        })
      )

      const result = await service.disconnectInstance(mockInstanceToken)

      expect(result.success).toBe(true)
    })

    it('Deve lidar com erro ao desconectar', async () => {
      server.use(
        http.post(`${mockBaseURL}/instance/disconnect`, () => {
          return HttpResponse.json(
            { message: 'Instância não encontrada' },
            { status: 404, statusText: 'Not Found' }
          )
        })
      )

      const result = await service.disconnectInstance(mockInstanceToken)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Instância não encontrada')
    })
  })

  describe('getInstanceStatus', () => {
    it('Deve obter status conectado', async () => {
      const mockResponse = {
        instance: {
          status: 'connected',
          phoneNumber: '5511999887766',
          name: 'Test User',
          profileName: 'Test Profile'
        }
      }

      server.use(
        http.get(`${mockBaseURL}/instance/status`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await service.getInstanceStatus(mockInstanceToken)

      expect(result.success).toBe(true)
      expect(result.data?.status).toBe('connected')
      expect(result.data?.phoneNumber).toBe('5511999887766')
      expect(result.data?.name).toBe('Test User')
    })

    it('Deve obter status desconectado com lastSeen', async () => {
      const lastDisconnect = '2025-10-11T10:00:00Z'
      const mockResponse = {
        instance: {
          status: 'disconnected',
          lastDisconnect
        }
      }

      server.use(
        http.get(`${mockBaseURL}/instance/status`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await service.getInstanceStatus(mockInstanceToken)

      expect(result.success).toBe(true)
      expect(result.data?.status).toBe('disconnected')
      expect(result.data?.lastSeen).toEqual(new Date(lastDisconnect))
    })

    it('Deve usar método GET', async () => {
      let requestMethod = ''

      server.use(
        http.get(`${mockBaseURL}/instance/status`, ({ request }) => {
          requestMethod = request.method
          return HttpResponse.json({ instance: { status: 'connecting' } })
        })
      )

      await service.getInstanceStatus(mockInstanceToken)

      expect(requestMethod).toBe('GET')
    })

    it('Deve lidar com erro ao obter status', async () => {
      server.use(
        http.get(`${mockBaseURL}/instance/status`, () => {
          return HttpResponse.error()
        })
      )

      const result = await service.getInstanceStatus(mockInstanceToken)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Falha ao obter status da instância')
    })
  })

  describe('deleteInstance', () => {
    it('Deve deletar instância com sucesso', async () => {
      server.use(
        http.delete(`${mockBaseURL}/instance`, () => {
          return HttpResponse.json({ success: true, message: 'Instância removida' })
        })
      )

      const result = await service.deleteInstance(mockInstanceToken)

      expect(result.success).toBe(true)
    })

    it('Deve usar admintoken ao deletar', async () => {
      let receivedHeaders: Record<string, string> = {}

      server.use(
        http.delete(`${mockBaseURL}/instance`, ({ request }) => {
          request.headers.forEach((value, key) => {
            receivedHeaders[key] = value
          })
          return HttpResponse.json({ success: true })
        })
      )

      await service.deleteInstance(mockInstanceToken)

      expect(receivedHeaders).toHaveProperty('admintoken', mockAdminToken)
    })

    it('Deve lidar com erro ao deletar', async () => {
      server.use(
        http.delete(`${mockBaseURL}/instance`, () => {
          return HttpResponse.error()
        })
      )

      const result = await service.deleteInstance(mockInstanceToken)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Falha ao deletar instância')
    })
  })

  describe('listAllInstances', () => {
    it('Deve listar todas as instâncias', async () => {
      const mockResponse = {
        instances: [
          { id: '1', name: 'Instance 1', status: 'connected' },
          { id: '2', name: 'Instance 2', status: 'disconnected' }
        ]
      }

      server.use(
        http.get(`${mockBaseURL}/instance/all`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await service.listAllInstances()

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockResponse)
    })

    it('Deve usar admintoken ao listar', async () => {
      let receivedHeaders: Record<string, string> = {}

      server.use(
        http.get(`${mockBaseURL}/instance/all`, ({ request }) => {
          request.headers.forEach((value, key) => {
            receivedHeaders[key] = value
          })
          return HttpResponse.json({ instances: [] })
        })
      )

      await service.listAllInstances()

      expect(receivedHeaders).toHaveProperty('admintoken', mockAdminToken)
    })

    it('Deve lidar com erro ao listar', async () => {
      server.use(
        http.get(`${mockBaseURL}/instance/all`, () => {
          return HttpResponse.error()
        })
      )

      const result = await service.listAllInstances()

      expect(result.success).toBe(false)
      expect(result.message).toBe('Falha ao listar instâncias')
    })
  })

  describe('generateQR', () => {
    it('Deve gerar novo QR Code', async () => {
      const mockResponse = {
        instance: {
          qrcode: 'data:image/png;base64,xyz789'
        }
      }

      server.use(
        http.post(`${mockBaseURL}/instance/connect`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await service.generateQR(mockInstanceToken)

      expect(result.success).toBe(true)
      expect(result.data?.qrcode).toBe('data:image/png;base64,xyz789')
    })

    it('Deve ser alias de connectInstance', async () => {
      let endpointCalled = ''

      server.use(
        http.post(`${mockBaseURL}/instance/connect`, ({ request }) => {
          endpointCalled = new URL(request.url).pathname
          return HttpResponse.json({ instance: { qrcode: 'test' } })
        })
      )

      await service.generateQR(mockInstanceToken)

      expect(endpointCalled).toBe('/instance/connect')
    })
  })

  describe('getProfilePicture', () => {
    it('Deve obter foto de perfil com sucesso', async () => {
      const mockResponse = {
        profilePictureUrl: 'https://example.com/profile.jpg'
      }

      server.use(
        http.get(`${mockBaseURL}/instance/profilePicture`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await service.getProfilePicture(mockInstanceToken)

      expect(result.success).toBe(true)
      expect(result.data?.profilePictureUrl).toBe('https://example.com/profile.jpg')
      expect(result.message).toContain('Foto de perfil obtida')
    })

    it('Deve lidar com campo "url" alternativo', async () => {
      const mockResponse = {
        url: 'https://example.com/avatar.png'
      }

      server.use(
        http.get(`${mockBaseURL}/instance/profilePicture`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await service.getProfilePicture(mockInstanceToken)

      expect(result.success).toBe(true)
      expect(result.data?.profilePictureUrl).toBe('https://example.com/avatar.png')
    })

    it('Deve retornar string vazia se não houver URL', async () => {
      server.use(
        http.get(`${mockBaseURL}/instance/profilePicture`, () => {
          return HttpResponse.json({})
        })
      )

      const result = await service.getProfilePicture(mockInstanceToken)

      expect(result.success).toBe(true)
      expect(result.data?.profilePictureUrl).toBe('')
    })

    it('Deve lidar com erro ao obter foto', async () => {
      server.use(
        http.get(`${mockBaseURL}/instance/profilePicture`, () => {
          return HttpResponse.error()
        })
      )

      const result = await service.getProfilePicture(mockInstanceToken)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Falha ao obter foto de perfil')
    })
  })

  describe('setWebhook', () => {
    it('Deve configurar webhook com eventos padrão', async () => {
      let requestBody: any = null

      server.use(
        http.post(`${mockBaseURL}/instance/webhook`, async ({ request }) => {
          requestBody = await request.json()
          return HttpResponse.json({ success: true, message: 'Webhook configurado' })
        })
      )

      const webhookUrl = 'https://example.com/webhook'
      const result = await service.setWebhook(mockInstanceToken, webhookUrl)

      expect(result.success).toBe(true)
      expect(requestBody).toEqual({
        url: webhookUrl,
        events: ['message.received', 'message.sent', 'instance.status']
      })
    })

    it('Deve configurar webhook com eventos customizados', async () => {
      let requestBody: any = null

      server.use(
        http.post(`${mockBaseURL}/instance/webhook`, async ({ request }) => {
          requestBody = await request.json()
          return HttpResponse.json({ success: true })
        })
      )

      const webhookUrl = 'https://example.com/webhook'
      const customEvents = ['message.received', 'call.incoming']
      const result = await service.setWebhook(mockInstanceToken, webhookUrl, customEvents)

      expect(result.success).toBe(true)
      expect(requestBody).toEqual({
        url: webhookUrl,
        events: customEvents
      })
    })

    it('Deve lidar com erro ao configurar webhook', async () => {
      server.use(
        http.post(`${mockBaseURL}/instance/webhook`, () => {
          return HttpResponse.error()
        })
      )

      const result = await service.setWebhook(mockInstanceToken, 'https://test.com')

      expect(result.success).toBe(false)
      expect(result.message).toBe('Falha ao configurar webhook')
    })
  })

  describe('getWebhook', () => {
    it('Deve obter configuração do webhook', async () => {
      const mockResponse = {
        url: 'https://example.com/webhook',
        events: ['message.received', 'message.sent']
      }

      server.use(
        http.get(`${mockBaseURL}/instance/webhook`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await service.getWebhook(mockInstanceToken)

      expect(result.success).toBe(true)
      expect(result.data?.webhookUrl).toBe('https://example.com/webhook')
      expect(result.data?.events).toEqual(['message.received', 'message.sent'])
    })

    it('Deve lidar com campo "webhookUrl" alternativo', async () => {
      const mockResponse = {
        webhookUrl: 'https://alt.example.com/webhook',
        events: []
      }

      server.use(
        http.get(`${mockBaseURL}/instance/webhook`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await service.getWebhook(mockInstanceToken)

      expect(result.success).toBe(true)
      expect(result.data?.webhookUrl).toBe('https://alt.example.com/webhook')
    })

    it('Deve retornar valores padrão se não houver configuração', async () => {
      server.use(
        http.get(`${mockBaseURL}/instance/webhook`, () => {
          return HttpResponse.json({})
        })
      )

      const result = await service.getWebhook(mockInstanceToken)

      expect(result.success).toBe(true)
      expect(result.data?.webhookUrl).toBe('')
      expect(result.data?.events).toEqual([])
    })

    it('Deve lidar com erro ao obter webhook', async () => {
      server.use(
        http.get(`${mockBaseURL}/instance/webhook`, () => {
          return HttpResponse.error()
        })
      )

      const result = await service.getWebhook(mockInstanceToken)

      expect(result.success).toBe(false)
      expect(result.message).toBe('Falha ao obter configuração do webhook')
    })
  })

  describe('handleResponse', () => {
    it('Deve lidar com resposta HTTP 404', async () => {
      server.use(
        http.get(`${mockBaseURL}/instance/status`, () => {
          return HttpResponse.json(
            { message: 'Recurso não encontrado' },
            { status: 404, statusText: 'Not Found' }
          )
        })
      )

      const result = await service.getInstanceStatus(mockInstanceToken)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Recurso não encontrado')
    })

    it('Deve lidar com resposta HTTP 500', async () => {
      server.use(
        http.get(`${mockBaseURL}/instance/status`, () => {
          return HttpResponse.json(
            { message: 'Erro interno' },
            { status: 500, statusText: 'Internal Server Error' }
          )
        })
      )

      const result = await service.getInstanceStatus(mockInstanceToken)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Erro interno')
    })

    it('Deve lidar com resposta sem JSON válido', async () => {
      server.use(
        http.get(`${mockBaseURL}/instance/status`, () => {
          return new HttpResponse(null, {
            status: 400,
            statusText: 'Bad Request',
            headers: { 'Content-Type': 'text/plain' }
          })
        })
      )

      const result = await service.getInstanceStatus(mockInstanceToken)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Erro desconhecido')
    })
  })

  describe('Environment Configuration', () => {
    it('Deve usar URL padrão se não configurada', async () => {
      delete process.env.UAZAPI_URL
      const newService = new UAZapiService()

      let requestedUrl = ''

      server.use(
        http.get('https://quayer.uazapi.com/instance/all', ({ request }) => {
          requestedUrl = request.url
          return HttpResponse.json({ instances: [] })
        })
      )

      await newService.listAllInstances()

      expect(requestedUrl).toContain('quayer.uazapi.com')
    })

    it('Deve usar token padrão se ADMIN_TOKEN não configurado', async () => {
      delete process.env.UAZAPI_ADMIN_TOKEN
      process.env.UAZAPI_TOKEN = 'fallback-token'
      const newService = new UAZapiService()

      let receivedHeaders: Record<string, string> = {}

      server.use(
        http.get(`${mockBaseURL}/instance/all`, ({ request }) => {
          request.headers.forEach((value, key) => {
            receivedHeaders[key] = value
          })
          return HttpResponse.json({ instances: [] })
        })
      )

      await newService.listAllInstances()

      expect(receivedHeaders).toHaveProperty('admintoken', 'fallback-token')
    })
  })
})
