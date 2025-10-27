/**
 * Sessions Manager
 *
 * Gerenciador de sessões de atendimento WhatsApp
 * Controla criação, bloqueio de IA, e estado das sessões
 */

import { database } from '@/services/database';
import { redis } from '@/services/redis';
import type { SessionStatus } from '@prisma/client';

export interface GetOrCreateSessionInput {
  contactId: string;
  instanceId: string;
  organizationId: string;
}

export interface ListSessionsFilters {
  organizationId?: string;
  instanceId?: string;
  contactId?: string;
  status?: SessionStatus;
  page?: number;
  limit?: number;
}

export class SessionsManager {
  /**
   * Criar ou recuperar sessão ativa
   */
  async getOrCreateSession(input: GetOrCreateSessionInput) {
    const { contactId, instanceId, organizationId } = input;

    // Buscar sessão ativa (QUEUED ou ACTIVE)
    let session = await database.chatSession.findFirst({
      where: {
        contactId,
        instanceId,
        status: { in: ['QUEUED', 'ACTIVE'] },
      },
      include: {
        contact: true,
        instance: true,
      },
    });

    // Criar nova se não existir
    if (!session) {
      console.log(`[Sessions] Creating new session for contact ${contactId}`);

      session = await database.chatSession.create({
        data: {
          contactId,
          instanceId,
          organizationId,
          status: 'QUEUED',
          lastMessageAt: new Date(),
        },
        include: {
          contact: true,
          instance: true,
        },
      });

      // Publicar evento de nova sessão
      await redis.publish('session:created', JSON.stringify({
        sessionId: session.id,
        contactId,
        instanceId,
        organizationId,
      }));
    } else {
      // Atualizar lastMessageAt
      session = await database.chatSession.update({
        where: { id: session.id },
        data: { lastMessageAt: new Date() },
        include: {
          contact: true,
          instance: true,
        },
      });
    }

    return session;
  }

  /**
   * Bloquear IA quando humano responde
   */
  async blockAI(
    sessionId: string,
    durationMinutes: number,
    reason: string = 'manual_response'
  ): Promise<void> {
    const blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);

    console.log(`[Sessions] Blocking AI for session ${sessionId} until ${blockedUntil}`);

    await database.chatSession.update({
      where: { id: sessionId },
      data: {
        aiEnabled: false,
        aiBlockedUntil: blockedUntil,
        aiBlockReason: reason,
      },
    });

    // Publicar evento
    await redis.publish('session:ai_blocked', JSON.stringify({
      sessionId,
      blockedUntil,
      reason,
      durationMinutes,
    }));
  }

  /**
   * Desbloquear IA (manual ou automático)
   */
  async unblockAI(sessionId: string): Promise<void> {
    console.log(`[Sessions] Unblocking AI for session ${sessionId}`);

    await database.chatSession.update({
      where: { id: sessionId },
      data: {
        aiEnabled: true,
        aiBlockedUntil: null,
        aiBlockReason: null,
      },
    });

    // Publicar evento
    await redis.publish('session:ai_unblocked', JSON.stringify({ sessionId }));
  }

  /**
   * Verificar se IA está bloqueada
   */
  async isAIBlocked(sessionId: string): Promise<boolean> {
    const session = await database.chatSession.findUnique({
      where: { id: sessionId },
      select: { aiEnabled: true, aiBlockedUntil: true },
    });

    if (!session) {
      console.warn(`[Sessions] Session ${sessionId} not found`);
      return false;
    }

    // Se AI desabilitada, verificar se expirou
    if (!session.aiEnabled) {
      // Se tem data de bloqueio e já expirou, desbloquear automaticamente
      if (session.aiBlockedUntil && new Date() > session.aiBlockedUntil) {
        console.log(`[Sessions] AI block expired for ${sessionId}, auto-unblocking`);
        await this.unblockAI(sessionId);
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Listar sessões com filtros e paginação
   */
  async listSessions(filters: ListSessionsFilters = {}) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.instanceId) where.instanceId = filters.instanceId;
    if (filters.contactId) where.contactId = filters.contactId;
    if (filters.status) where.status = filters.status;

    const [sessions, total] = await Promise.all([
      database.chatSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastMessageAt: 'desc' },
        include: {
          contact: true,
          instance: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
          _count: {
            select: { messages: true },
          },
        },
      }),
      database.chatSession.count({ where }),
    ]);

    return {
      data: sessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Buscar sessão por ID com mensagens
   */
  async getSessionById(sessionId: string, options?: {
    includeMessages?: boolean;
    messagesLimit?: number;
  }) {
    return database.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        contact: true,
        instance: {
          select: {
            id: true,
            name: true,
            status: true,
            phoneNumber: true,
          },
        },
        messages: options?.includeMessages ? {
          orderBy: { createdAt: 'asc' },
          take: options.messagesLimit ?? 100,
        } : false,
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  /**
   * Atualizar status da sessão
   */
  async updateSessionStatus(sessionId: string, status: SessionStatus): Promise<void> {
    console.log(`[Sessions] Updating session ${sessionId} status to ${status}`);

    await database.chatSession.update({
      where: { id: sessionId },
      data: { status },
    });

    // Publicar evento
    await redis.publish('session:status_updated', JSON.stringify({
      sessionId,
      status,
    }));
  }

  /**
   * Encerrar sessão
   */
  async closeSession(sessionId: string): Promise<void> {
    console.log(`[Sessions] Closing session ${sessionId}`);

    await database.chatSession.update({
      where: { id: sessionId },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
      },
    });

    // Publicar evento
    await redis.publish('session:closed', JSON.stringify({ sessionId }));
  }

  /**
   * Adicionar tags à sessão
   */
  async addTags(sessionId: string, tags: string[]): Promise<void> {
    const session = await database.chatSession.findUnique({
      where: { id: sessionId },
      select: { tags: true },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const updatedTags = Array.from(new Set([...session.tags, ...tags]));

    await database.chatSession.update({
      where: { id: sessionId },
      data: { tags: updatedTags },
    });
  }

  /**
   * Remover tags da sessão
   */
  async removeTags(sessionId: string, tags: string[]): Promise<void> {
    const session = await database.chatSession.findUnique({
      where: { id: sessionId },
      select: { tags: true },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const updatedTags = session.tags.filter(tag => !tags.includes(tag));

    await database.chatSession.update({
      where: { id: sessionId },
      data: { tags: updatedTags },
    });
  }

  /**
   * Worker: Desbloquear IAs expiradas
   * Deve ser executado periodicamente (cron job ou worker)
   */
  async unblockExpiredAIs(): Promise<number> {
    const expired = await database.chatSession.findMany({
      where: {
        aiEnabled: false,
        aiBlockedUntil: {
          lte: new Date(), // Menor ou igual a agora (expirado)
        },
      },
      select: { id: true },
    });

    console.log(`[Sessions] Found ${expired.length} expired AI blocks`);

    for (const session of expired) {
      await this.unblockAI(session.id);
    }

    return expired.length;
  }
}

// Singleton
export const sessionsManager = new SessionsManager();
