/**
 * Dashboard Service
 * Integração com UAZapi para métricas do dashboard
 */

import { UAZClient, UAZConfig } from '@/lib/uaz/uaz.client';

export interface DashboardMetrics {
  conversations: ConversationMetrics;
  messages: MessageMetrics;
  charts: ChartData;
}

export interface ConversationMetrics {
  total: number;
  unread: number;
  archived: number;
  pinned: number;
  groups: number;
  inProgress: number;
  aiControlled: number;
  humanControlled: number;
  avgResponseTime: number;
  resolutionRate: number;
}

export interface MessageMetrics {
  sent: number;
  delivered: number;
  deliveryRate: number;
  read: number;
  readRate: number;
  failed: number;
  failureRate: number;
  pending: number;
}

export interface ChartData {
  conversationsPerHour: Array<{ hour: string; count: number }>;
  messagesByStatus: Array<{ status: string; count: number; fill: string }>;
  aiVsHuman: Array<{ type: string; value: number; fill: string }>;
}

export interface ChatCountResponse {
  total_chats: number;
  unread_chats: number;
  archived_chats: number;
  pinned_chats: number;
  blocked_chats: number;
  groups: number;
  groups_admin: number;
  groups_announce: number;
  groups_member: number;
}

export interface ChatFindResponse {
  chats: Array<{
    wa_chatid: string;
    wa_name: string;
    wa_lastMsgTimestamp: number;
    wa_unreadCount: number;
    wa_isGroup: boolean;
    lead_status?: string;
    lead_isTicketOpen?: boolean;
    lead_assignedAttendant_id?: string;
  }>;
  totalChatsStats?: any;
  pagination?: {
    totalRecords: number;
    pageSize: number;
    currentPage: number;
    totalPages: number;
  };
}

export interface MessageFindResponse {
  messages: Array<{
    messageid: string;
    chatid: string;
    messageType: string;
    messageStatus: string;
    messageTimestamp: number;
    body?: string;
  }>;
  pagination?: {
    totalRecords: number;
  };
}

/**
 * Dashboard Service
 */
export class DashboardService {
  private clients: Map<string, UAZClient> = new Map();

  /**
   * Obter ou criar cliente UAZ para uma instância
   */
  private getClient(instanceId: string, token: string): UAZClient {
    if (!this.clients.has(instanceId)) {
      const config: UAZConfig = {
        baseUrl: process.env.NEXT_PUBLIC_UAZAPI_BASE_URL || 'https://quayer.uazapi.com',
        adminToken: token,
      };
      this.clients.set(instanceId, new UAZClient(config));
    }
    return this.clients.get(instanceId)!;
  }

  /**
   * Buscar contadores de chats de uma instância
   */
  async getChatCounts(instanceId: string, token: string): Promise<ChatCountResponse> {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_UAZAPI_BASE_URL || 'https://quayer.uazapi.com'}/chat/count`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            token: token,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch chat counts: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching chat counts:', error);
      return {
        total_chats: 0,
        unread_chats: 0,
        archived_chats: 0,
        pinned_chats: 0,
        blocked_chats: 0,
        groups: 0,
        groups_admin: 0,
        groups_announce: 0,
        groups_member: 0,
      };
    }
  }

  /**
   * Buscar chats com filtros
   */
  async findChats(
    instanceId: string,
    token: string,
    filters?: {
      operator?: 'AND' | 'OR';
      sort?: string;
      limit?: number;
      offset?: number;
      wa_isGroup?: boolean;
      lead_status?: string;
      lead_isTicketOpen?: boolean;
    }
  ): Promise<ChatFindResponse> {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_UAZAPI_BASE_URL || 'https://quayer.uazapi.com'}/chat/find`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            token: token,
          },
          body: JSON.stringify({
            operator: filters?.operator || 'AND',
            sort: filters?.sort || '-wa_lastMsgTimestamp',
            limit: filters?.limit || 100,
            offset: filters?.offset || 0,
            ...filters,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to find chats: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error finding chats:', error);
      return {
        chats: [],
        pagination: {
          totalRecords: 0,
          pageSize: 0,
          currentPage: 1,
          totalPages: 0,
        },
      };
    }
  }

  /**
   * Buscar mensagens
   */
  async findMessages(
    instanceId: string,
    token: string,
    filters?: {
      chatid?: string;
      messageType?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<MessageFindResponse> {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_UAZAPI_BASE_URL || 'https://quayer.uazapi.com'}/message/find`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            token: token,
          },
          body: JSON.stringify({
            limit: filters?.limit || 1000,
            offset: filters?.offset || 0,
            ...filters,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to find messages: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error finding messages:', error);
      return {
        messages: [],
        pagination: {
          totalRecords: 0,
        },
      };
    }
  }

  /**
   * Obter métricas agregadas do dashboard para múltiplas instâncias
   */
  async getAggregatedMetrics(
    instances: Array<{ id: string; uazToken: string | null; status: string }>
  ): Promise<DashboardMetrics> {
    // Filtrar apenas instâncias conectadas
    const connectedInstances = instances.filter(
      (i) => i.status === 'connected' && i.uazToken
    );

    if (connectedInstances.length === 0) {
      return this.getEmptyMetrics();
    }

    // Buscar dados de todas as instâncias em paralelo
    const chatCountsPromises = connectedInstances.map((instance) =>
      this.getChatCounts(instance.id, instance.uazToken!)
    );

    const chatsPromises = connectedInstances.map((instance) =>
      this.findChats(instance.id, instance.uazToken!, { limit: 1000 })
    );

    const messagesPromises = connectedInstances.map((instance) =>
      this.findMessages(instance.id, instance.uazToken!, { limit: 5000 })
    );

    const [chatCountsResults, chatsResults, messagesResults] = await Promise.all([
      Promise.all(chatCountsPromises),
      Promise.all(chatsPromises),
      Promise.all(messagesPromises),
    ]);

    // Agregar contadores de chats
    const totalChatCounts = chatCountsResults.reduce(
      (acc, counts) => ({
        total_chats: acc.total_chats + (counts.total_chats || 0),
        unread_chats: acc.unread_chats + (counts.unread_chats || 0),
        archived_chats: acc.archived_chats + (counts.archived_chats || 0),
        pinned_chats: acc.pinned_chats + (counts.pinned_chats || 0),
        blocked_chats: acc.blocked_chats + (counts.blocked_chats || 0),
        groups: acc.groups + (counts.groups || 0),
        groups_admin: acc.groups_admin + (counts.groups_admin || 0),
        groups_announce: acc.groups_announce + (counts.groups_announce || 0),
        groups_member: acc.groups_member + (counts.groups_member || 0),
      }),
      {
        total_chats: 0,
        unread_chats: 0,
        archived_chats: 0,
        pinned_chats: 0,
        blocked_chats: 0,
        groups: 0,
        groups_admin: 0,
        groups_announce: 0,
        groups_member: 0,
      }
    );

    // Agregar todos os chats
    const allChats = chatsResults.flatMap((result) => result.chats || []);

    // Calcular conversas em andamento (tickets abertos)
    const openChats = allChats.filter((chat) => chat.lead_isTicketOpen === true);
    const aiControlled = allChats.filter((chat) => chat.lead_status?.includes('bot'));
    const humanControlled = allChats.filter((chat) => chat.lead_assignedAttendant_id);

    // Agregar todas as mensagens
    const allMessages = messagesResults.flatMap((result) => result.messages || []);

    // Calcular métricas de mensagens
    const sentMessages = allMessages.filter((msg) => msg.messageStatus === 'sent');
    const deliveredMessages = allMessages.filter((msg) => msg.messageStatus === 'delivered');
    const readMessages = allMessages.filter((msg) => msg.messageStatus === 'read');
    const failedMessages = allMessages.filter((msg) => msg.messageStatus === 'failed');
    const pendingMessages = allMessages.filter((msg) => msg.messageStatus === 'pending');

    const totalSent = sentMessages.length + deliveredMessages.length + readMessages.length;
    const deliveryRate = totalSent > 0 ? ((deliveredMessages.length + readMessages.length) / totalSent) * 100 : 0;
    const readRate = totalSent > 0 ? (readMessages.length / totalSent) * 100 : 0;
    const failureRate = totalSent > 0 ? (failedMessages.length / totalSent) * 100 : 0;

    // Gerar dados de gráfico por hora (últimas 24 horas)
    const conversationsPerHour = this.generateConversationsPerHour(allChats);

    return {
      conversations: {
        total: totalChatCounts.total_chats,
        unread: totalChatCounts.unread_chats,
        archived: totalChatCounts.archived_chats,
        pinned: totalChatCounts.pinned_chats,
        groups: totalChatCounts.groups,
        inProgress: openChats.length,
        aiControlled: aiControlled.length,
        humanControlled: humanControlled.length,
        avgResponseTime: 0, // TODO: Calcular baseado em timestamps
        resolutionRate: 0, // TODO: Calcular baseado em tickets resolvidos
      },
      messages: {
        sent: totalSent,
        delivered: deliveredMessages.length + readMessages.length,
        deliveryRate: Math.round(deliveryRate * 10) / 10,
        read: readMessages.length,
        readRate: Math.round(readRate * 10) / 10,
        failed: failedMessages.length,
        failureRate: Math.round(failureRate * 10) / 10,
        pending: pendingMessages.length,
      },
      charts: {
        conversationsPerHour,
        messagesByStatus: [
          { status: 'Enviadas', count: totalSent, fill: 'hsl(var(--chart-1))' },
          {
            status: 'Entregues',
            count: deliveredMessages.length + readMessages.length,
            fill: 'hsl(var(--chart-2))',
          },
          { status: 'Lidas', count: readMessages.length, fill: 'hsl(var(--chart-3))' },
          { status: 'Falhadas', count: failedMessages.length, fill: 'hsl(var(--chart-4))' },
        ],
        aiVsHuman: [
          {
            type: 'IA',
            value: openChats.length > 0 ? Math.round((aiControlled.length / openChats.length) * 100) : 0,
            fill: 'hsl(var(--chart-1))',
          },
          {
            type: 'Humano',
            value: openChats.length > 0 ? Math.round((humanControlled.length / openChats.length) * 100) : 0,
            fill: 'hsl(var(--chart-2))',
          },
        ],
      },
    };
  }

  /**
   * Gerar dados de conversas por hora (últimas 24 horas)
   */
  private generateConversationsPerHour(
    chats: Array<{ wa_lastMsgTimestamp: number }>
  ): Array<{ hour: string; count: number }> {
    const now = Date.now();
    const hours: Array<{ hour: string; count: number }> = [];

    for (let i = 23; i >= 0; i--) {
      const hourStart = now - i * 3600000; // 1 hora em ms
      const hourEnd = hourStart + 3600000;

      const count = chats.filter((chat) => {
        const timestamp = chat.wa_lastMsgTimestamp * 1000; // Converter para ms
        return timestamp >= hourStart && timestamp < hourEnd;
      }).length;

      const hour = new Date(hourStart).getHours();
      hours.push({
        hour: `${hour.toString().padStart(2, '0')}h`,
        count,
      });
    }

    return hours;
  }

  /**
   * Retornar métricas vazias
   */
  private getEmptyMetrics(): DashboardMetrics {
    return {
      conversations: {
        total: 0,
        unread: 0,
        archived: 0,
        pinned: 0,
        groups: 0,
        inProgress: 0,
        aiControlled: 0,
        humanControlled: 0,
        avgResponseTime: 0,
        resolutionRate: 0,
      },
      messages: {
        sent: 0,
        delivered: 0,
        deliveryRate: 0,
        read: 0,
        readRate: 0,
        failed: 0,
        failureRate: 0,
        pending: 0,
      },
      charts: {
        conversationsPerHour: Array.from({ length: 24 }, (_, i) => ({
          hour: `${i.toString().padStart(2, '0')}h`,
          count: 0,
        })),
        messagesByStatus: [
          { status: 'Enviadas', count: 0, fill: 'hsl(var(--chart-1))' },
          { status: 'Entregues', count: 0, fill: 'hsl(var(--chart-2))' },
          { status: 'Lidas', count: 0, fill: 'hsl(var(--chart-3))' },
          { status: 'Falhadas', count: 0, fill: 'hsl(var(--chart-4))' },
        ],
        aiVsHuman: [
          { type: 'IA', value: 0, fill: 'hsl(var(--chart-1))' },
          { type: 'Humano', value: 0, fill: 'hsl(var(--chart-2))' },
        ],
      },
    };
  }
}

// Singleton
export const dashboardService = new DashboardService();
