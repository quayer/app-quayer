/**
 * Dashboard Service Unit Tests
 * Testa agregação de métricas do dashboard usando MSW
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../mocks/server'
import { DashboardService } from '@/lib/api/dashboard.service'

const UAZAPI_BASE_URL = process.env.NEXT_PUBLIC_UAZAPI_BASE_URL || 'http://localhost:3000'

describe('DashboardService', () => {
  let dashboardService: DashboardService

  beforeEach(() => {
    dashboardService = new DashboardService()
  })

  describe('getChatCounts', () => {
    it('deve buscar contadores de chat com sucesso', async () => {
      const mockResponse = {
        total_chats: 50,
        unread_chats: 10,
        groups: 5,
        pinned_chats: 3,
      }

      server.use(
        http.get(`${UAZAPI_BASE_URL}/chat/count`, () => {
          return HttpResponse.json(mockResponse)
        })
      )

      const result = await dashboardService.getChatCounts('instance-1', 'token-123')

      expect(result).toEqual(mockResponse)
    })

    it('deve retornar zeros quando houver erro', async () => {
      server.use(
        http.get('https://quayer.uazapi.com/chat/count', () => {
          return HttpResponse.error()
        })
      )

      const result = await dashboardService.getChatCounts('instance-1', 'token-123')

      expect(result).toEqual({
        total_chats: 0,
        unread_chats: 0,
        groups: 0,
        pinned_chats: 0,
        archived_chats: 0,
        blocked_chats: 0,
        groups_admin: 0,
        groups_announce: 0,
        groups_member: 0,
      })
    })
  })

  describe('findChats', () => {
    it('deve buscar chats com sucesso', async () => {
      const mockChats = {
        chats: [
          { wa_chatid: 'chat1', wa_name: 'Contato 1' },
          { wa_chatid: 'chat2', wa_name: 'Contato 2' },
        ],
        total: 2,
      }

      server.use(
        http.post('https://quayer.uazapi.com/chat/find', () => {
          return HttpResponse.json(mockChats)
        })
      )

      const result = await dashboardService.findChats('instance-1', 'token-123')

      // Verificar apenas os chats retornados, não toda a estrutura
      expect(result.chats).toEqual(mockChats.chats)
      expect(result.chats).toHaveLength(2)
    })
  })

  describe('getAggregatedMetrics', () => {
    it('deve agregar métricas de múltiplas instâncias', async () => {
      const instances = [
        { id: 'inst1', uazToken: 'token1', status: 'connected' },
        { id: 'inst2', uazToken: 'token2', status: 'connected' },
      ]

      // Mock com respostas diferentes por chamada
      let callIndex = 0
      const responses = [
        { total_chats: 30, unread_chats: 5, groups: 2, pinned_chats: 1, archived_chats: 0, blocked_chats: 0, groups_admin: 0, groups_announce: 0, groups_member: 0 },
        { total_chats: 20, unread_chats: 3, groups: 1, pinned_chats: 0, archived_chats: 0, blocked_chats: 0, groups_admin: 0, groups_announce: 0, groups_member: 0 },
      ]

      server.use(
        http.get('https://quayer.uazapi.com/chat/count', () => {
          const response = responses[callIndex % responses.length]
          callIndex++
          return HttpResponse.json(response)
        }),
        http.post('https://quayer.uazapi.com/chat/find', () => {
          return HttpResponse.json({ chats: [], total: 0 })
        }),
        http.post('https://quayer.uazapi.com/message/find', () => {
          return HttpResponse.json({ messages: [], total: 0 })
        })
      )

      const result = await dashboardService.getAggregatedMetrics(instances)

      // Verifica agregação
      expect(result.conversations.total).toBe(50) // 30 + 20
      expect(result.conversations.unread).toBe(8) // 5 + 3
    })

    it('deve retornar métricas vazias quando não há instâncias conectadas', async () => {
      const instances: any[] = []

      const result = await dashboardService.getAggregatedMetrics(instances)

      expect(result.conversations.total).toBe(0)
      expect(result.messages.sent).toBe(0)
      expect(result.charts.conversationsPerHour).toHaveLength(24)
    })

    it('deve ignorar instâncias sem token', async () => {
      const instances = [
        { id: 'inst1', uazToken: null, status: 'connected' },
        { id: 'inst2', uazToken: 'token2', status: 'disconnected' },
      ]

      const result = await dashboardService.getAggregatedMetrics(instances)

      expect(result.conversations.total).toBe(0)
    })
  })

  describe('generateConversationsPerHour', () => {
    it('deve gerar dados para gráfico de 24 horas', () => {
      const chats = [
        { wa_lastMsgTimestamp: Date.now() / 1000 }, // agora
        { wa_lastMsgTimestamp: (Date.now() / 1000) - 3600 }, // 1 hora atrás
        { wa_lastMsgTimestamp: (Date.now() / 1000) - 7200 }, // 2 horas atrás
      ]

      const result = dashboardService.generateConversationsPerHour(chats)

      expect(result).toHaveLength(24)
      expect(result[0]).toHaveProperty('hour')
      expect(result[0]).toHaveProperty('count')
    })

    it('deve retornar array com zeros para lista vazia', () => {
      const result = dashboardService.generateConversationsPerHour([])

      expect(result).toHaveLength(24)
      expect(result.every(item => item.count === 0)).toBe(true)
    })
  })

  describe('getEmptyMetrics', () => {
    it('deve retornar estrutura completa de métricas zeradas', () => {
      const result = dashboardService.getEmptyMetrics()

      expect(result.conversations.total).toBe(0)
      expect(result.messages.sent).toBe(0)
      expect(result.charts.conversationsPerHour).toHaveLength(24)
      // messagesByStatus retorna array com 4 status (Enviadas, Entregues, Lidas, Falhadas) todos com count 0
      expect(result.charts.messagesByStatus).toHaveLength(4)
      expect(result.charts.messagesByStatus.every(item => item.count === 0)).toBe(true)
    })
  })
})
