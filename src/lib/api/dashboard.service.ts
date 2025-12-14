/**
 * Dashboard Service
 * Integração com UAZapi para métricas do dashboard
 *
 * Features:
 * - Retry automático em falhas (até 3 tentativas)
 * - Cache em memória para reduzir chamadas
 * - Limites otimizados para performance
 */

import { UAZClient, UAZConfig } from '@/lib/uaz/uaz.client';
import { logger } from '@/services/logger';

// Configuração de retry e cache
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // ms
  backoffMultiplier: 2,
};

const CACHE_CONFIG = {
  ttl: 30 * 1000, // 30 segundos
};

// Limites otimizados para performance (reduzido para evitar sobrecarga)
const LIMITS = {
  chats: 500, // Reduzido de 1000
  messages: 1000, // Reduzido de 5000
};

// Cache em memória simples
const cache = new Map<string, { data: any; expires: number }>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: any): void {
  cache.set(key, { data, expires: Date.now() + CACHE_CONFIG.ttl });
}

// Helper para retry com backoff exponencial
async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt < RETRY_CONFIG.maxRetries) {
        const delay = RETRY_CONFIG.retryDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1);
        logger.warn(`[DashboardService] ${operationName} falhou, tentativa ${attempt}/${RETRY_CONFIG.maxRetries}`, {
          error: (error as Error).message,
          nextRetryIn: delay,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logger.error(`[DashboardService] ${operationName} falhou após ${RETRY_CONFIG.maxRetries} tentativas`, {
    error: lastError?.message,
  });
  throw lastError;
}

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
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_UAZAPI_BASE_URL || 'https://quayer.uazapi.com';
  }

  /**
   * Obter ou criar cliente UAZ para uma instância
   */
  private getClient(instanceId: string, token: string): UAZClient {
    if (!this.clients.has(instanceId)) {
      const config: UAZConfig = {
        baseUrl: this.baseUrl,
        adminToken: token,
      };
      this.clients.set(instanceId, new UAZClient(config));
    }
    return this.clients.get(instanceId)!;
  }

  /**
   * Buscar contadores de chats de uma instância (com retry e cache)
   */
  async getChatCounts(instanceId: string, token: string): Promise<ChatCountResponse> {
    const cacheKey = `chatCounts:${instanceId}`;
    const cached = getCached<ChatCountResponse>(cacheKey);
    if (cached) {
      logger.debug('[DashboardService] Cache hit: getChatCounts', { instanceId });
      return cached;
    }

    const defaultResponse: ChatCountResponse = {
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

    try {
      const result = await withRetry(async () => {
        const response = await fetch(`${this.baseUrl}/chat/count`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            token: token,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch chat counts: ${response.statusText}`);
        }

        return await response.json();
      }, 'getChatCounts');

      setCache(cacheKey, result);
      return result;
    } catch (error) {
      logger.error('[DashboardService] Error fetching chat counts:', { error, instanceId });
      return defaultResponse;
    }
  }

  /**
   * Buscar chats com filtros (com retry e cache)
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
    const effectiveLimit = Math.min(filters?.limit || LIMITS.chats, LIMITS.chats);
    const cacheKey = `findChats:${instanceId}:${effectiveLimit}`;
    const cached = getCached<ChatFindResponse>(cacheKey);
    if (cached) {
      logger.debug('[DashboardService] Cache hit: findChats', { instanceId });
      return cached;
    }

    const defaultResponse: ChatFindResponse = {
      chats: [],
      pagination: {
        totalRecords: 0,
        pageSize: 0,
        currentPage: 1,
        totalPages: 0,
      },
    };

    try {
      const result = await withRetry(async () => {
        const response = await fetch(`${this.baseUrl}/chat/find`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            token: token,
          },
          body: JSON.stringify({
            operator: filters?.operator || 'AND',
            sort: filters?.sort || '-wa_lastMsgTimestamp',
            limit: effectiveLimit,
            offset: filters?.offset || 0,
            ...filters,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to find chats: ${response.statusText}`);
        }

        return await response.json();
      }, 'findChats');

      setCache(cacheKey, result);
      return result;
    } catch (error) {
      logger.error('[DashboardService] Error finding chats:', { error, instanceId });
      return defaultResponse;
    }
  }

  /**
   * Buscar mensagens (com retry, cache e limite otimizado)
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
    // Limitar mensagens para performance
    const effectiveLimit = Math.min(filters?.limit || LIMITS.messages, LIMITS.messages);
    const cacheKey = `findMessages:${instanceId}:${effectiveLimit}`;
    const cached = getCached<MessageFindResponse>(cacheKey);
    if (cached) {
      logger.debug('[DashboardService] Cache hit: findMessages', { instanceId });
      return cached;
    }

    const defaultResponse: MessageFindResponse = {
      messages: [],
      pagination: {
        totalRecords: 0,
      },
    };

    try {
      const result = await withRetry(async () => {
        const response = await fetch(`${this.baseUrl}/message/find`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            token: token,
          },
          body: JSON.stringify({
            limit: effectiveLimit,
            offset: filters?.offset || 0,
            ...filters,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to find messages: ${response.statusText}`);
        }

        return await response.json();
      }, 'findMessages');

      setCache(cacheKey, result);
      return result;
    } catch (error) {
      logger.error('[DashboardService] Error finding messages:', { error, instanceId });
      return defaultResponse;
    }
  }

  /**
   * Obter métricas agregadas do dashboard para múltiplas conexões
   */
  async getAggregatedMetrics(
    connections: Array<{ id: string; uazapiToken: string | null; status: string }>
  ): Promise<DashboardMetrics> {
    // Filtrar apenas conexões conectadas
    const connectedInstances = connections.filter(
      (i) => i.status === 'CONNECTED' && i.uazapiToken
    );

    if (connectedInstances.length === 0) {
      return this.getEmptyMetrics();
    }

    logger.info('[DashboardService] Buscando métricas agregadas', {
      totalConnections: connections.length,
      connectedInstances: connectedInstances.length,
    });

    // Buscar dados de todas as conexões em paralelo (com limites otimizados)
    const chatCountsPromises = connectedInstances.map((connection) =>
      this.getChatCounts(connection.id, connection.uazapiToken!)
    );

    const chatsPromises = connectedInstances.map((connection) =>
      this.findChats(connection.id, connection.uazapiToken!, { limit: LIMITS.chats })
    );

    const messagesPromises = connectedInstances.map((connection) =>
      this.findMessages(connection.id, connection.uazapiToken!, { limit: LIMITS.messages })
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

    logger.info('[DashboardService] Métricas agregadas calculadas', {
      totalChats: allChats.length,
      totalMessages: allMessages.length,
      openChats: openChats.length,
    });

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
        avgResponseTime: 0, // Calculado via endpoint attendance no frontend
        resolutionRate: 0, // Calculado via endpoint attendance no frontend
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

  /**
   * Limpar cache manualmente (útil para testes)
   */
  clearCache(): void {
    cache.clear();
    logger.info('[DashboardService] Cache limpo');
  }
}

// Singleton
export const dashboardService = new DashboardService();
