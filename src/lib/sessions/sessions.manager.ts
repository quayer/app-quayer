/**
 * Sessions Manager
 *
 * Gerenciador de sessões de atendimento WhatsApp
 * Controla criação, bloqueio de IA, e estado das sessões
 *
 * Features:
 * - Criação/recuperação de sessões
 * - Bloqueio de IA (manual e automático)
 * - WhatsApp 24h Window Tracking
 * - Auto-pause on human reply
 * - Bypass bots (blacklist/whitelist)
 * - Session expiration management
 */

import { database } from '@/services/database';
import { redis } from '@/services/redis';
import type { SessionStatus } from '@prisma/client';

// ===== CONSTANTS =====

/** WhatsApp 24h window duration in milliseconds */
const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Default AI block duration when human replies (in minutes) */
const DEFAULT_HUMAN_BLOCK_MINUTES = 24 * 60; // 24 hours

export interface GetOrCreateSessionInput {
  contactId: string;
  connectionId: string;
  organizationId: string;
}

export interface ListSessionsFilters {
  organizationId?: string;
  connectionId?: string;
  contactId?: string;
  status?: SessionStatus;
  // ⭐ NOVOS FILTROS AVANÇADOS
  aiStatus?: 'enabled' | 'disabled' | 'blocked';
  whatsappWindow?: 'active' | 'expiring' | 'expired' | 'none';
  assignedAgentId?: string;
  hasUnread?: boolean;
  search?: string;
  sortBy?: 'lastMessage' | 'created' | 'updated';
  sortOrder?: 'asc' | 'desc';
  // Paginação offset-based (padrão)
  page?: number;
  limit?: number;
  // 🚀 Paginação cursor-based (opcional, mais eficiente para grandes volumes)
  cursor?: string; // ID da última sessão recebida
  useCursor?: boolean; // Se true, usa cursor em vez de offset
}

export class SessionsManager {
  /**
   * Criar ou recuperar sessão ativa
   */
  async getOrCreateSession(input: GetOrCreateSessionInput) {
    const { contactId, connectionId, organizationId } = input;

    // Buscar sessão ativa (QUEUED ou ACTIVE)
    let session = await database.chatSession.findFirst({
      where: {
        contactId,
        connectionId,
        status: { in: ['QUEUED', 'ACTIVE'] },
      },
      include: {
        contact: true,
        connection: true,
      },
    });

    // Criar nova se não existir
    if (!session) {
      console.log(`[Sessions] Creating new session for contact ${contactId}`);

      session = await database.chatSession.create({
        data: {
          contactId,
          connectionId,
          organizationId,
          status: 'QUEUED',
          lastMessageAt: new Date(),
        },
        include: {
          contact: true,
          connection: true,
        },
      });

      // Publicar evento de nova sessão
      await redis.publish('session:created', JSON.stringify({
        sessionId: session.id,
        contactId,
        connectionId,
        organizationId,
      }));
    } else {
      // Atualizar lastMessageAt
      session = await database.chatSession.update({
        where: { id: session.id },
        data: { lastMessageAt: new Date() },
        include: {
          contact: true,
          connection: true,
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
   * Suporta tanto offset-based (padrão) quanto cursor-based (mais eficiente)
   */
  async listSessions(filters: ListSessionsFilters = {}) {
    const limit = filters.limit ?? 50;
    const now = new Date();
    const useCursor = filters.useCursor && filters.cursor;

    // 🚀 Paginação: offset-based vs cursor-based
    const page = filters.page ?? 1;
    const skip = useCursor ? undefined : (page - 1) * limit;

    const where: any = {};
    if (filters.organizationId) where.organizationId = filters.organizationId;
    if (filters.connectionId) where.connectionId = filters.connectionId;
    if (filters.contactId) where.contactId = filters.contactId;
    if (filters.status) where.status = filters.status;
    if (filters.assignedAgentId) where.assignedAgentId = filters.assignedAgentId;

    // ⭐ FILTRO: AI Status
    if (filters.aiStatus === 'enabled') {
      where.aiEnabled = true;
      where.OR = [
        { aiBlockedUntil: null },
        { aiBlockedUntil: { lt: now } },
      ];
    } else if (filters.aiStatus === 'disabled') {
      where.aiEnabled = false;
    } else if (filters.aiStatus === 'blocked') {
      where.aiBlockedUntil = { gte: now };
    }

    // ⭐ FILTRO: WhatsApp 24h Window
    if (filters.whatsappWindow === 'active') {
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      where.whatsappWindowExpiresAt = { gte: twoHoursFromNow };
    } else if (filters.whatsappWindow === 'expiring') {
      const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      where.whatsappWindowExpiresAt = { gte: now, lt: twoHoursFromNow };
    } else if (filters.whatsappWindow === 'expired') {
      where.whatsappWindowExpiresAt = { lt: now };
    } else if (filters.whatsappWindow === 'none') {
      where.whatsappWindowExpiresAt = null;
    }

    // ⭐ FILTRO: Search (nome ou telefone do contato)
    if (filters.search) {
      where.contact = {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { phoneNumber: { contains: filters.search } },
        ],
      };
    }

    // ⭐ ORDENAÇÃO
    const sortBy = filters.sortBy || 'lastMessage';
    const sortOrder = filters.sortOrder || 'desc';
    const orderByMap: Record<string, any> = {
      lastMessage: { lastMessageAt: sortOrder },
      created: { createdAt: sortOrder },
      updated: { updatedAt: sortOrder },
    };
    const orderBy = orderByMap[sortBy] || { lastMessageAt: 'desc' };

    // 🚀 Cursor-based: buscar sessões após o cursor
    const cursorConfig = useCursor ? {
      cursor: { id: filters.cursor! },
      skip: 1, // Pular o item do cursor
    } : {
      skip,
    };

    const [sessions, total] = await Promise.all([
      database.chatSession.findMany({
        where,
        ...(cursorConfig as any),
        take: limit,
        orderBy,
        include: {
          contact: true,
          connection: {
            select: {
              id: true,
              name: true,
              status: true,
              provider: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
            },
          },
          department: {
            select: {
              id: true,
              name: true,
              description: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              content: true,
              type: true,
              direction: true,
              createdAt: true,
            },
          },
          _count: {
            select: { messages: true },
          },
        },
      }),
      database.chatSession.count({ where }),
    ]);

    // ⭐ Enriquecer sessões com dados computados
    const enrichedSessions = sessions.map((session: any) => {
      const lastMessage = session.messages?.[0];

      // Calcular status do WhatsApp Window
      let whatsappWindowStatus: 'active' | 'expiring' | 'expired' | 'none' = 'none';
      let whatsappWindowRemaining = 0;

      if (session.whatsappWindowExpiresAt) {
        const expiresAt = new Date(session.whatsappWindowExpiresAt);
        const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

        if (expiresAt > twoHoursFromNow) {
          whatsappWindowStatus = 'active';
        } else if (expiresAt > now) {
          whatsappWindowStatus = 'expiring';
        } else {
          whatsappWindowStatus = 'expired';
        }

        whatsappWindowRemaining = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 60000));
      }

      // Calcular status da IA
      let aiStatus: 'enabled' | 'disabled' | 'blocked' = 'disabled';
      if (session.aiEnabled) {
        if (session.aiBlockedUntil && new Date(session.aiBlockedUntil) > now) {
          aiStatus = 'blocked';
        } else {
          aiStatus = 'enabled';
        }
      }

      // Calcular duração da sessão
      const durationMs = now.getTime() - new Date(session.createdAt).getTime();
      const durationMinutes = Math.floor(durationMs / 60000);

      return {
        ...session,
        lastMessage,
        computed: {
          whatsappWindowStatus,
          whatsappWindowRemaining, // minutos
          aiStatus,
          durationMinutes,
          messageCount: session._count.messages,
        },
      };
    });

    // 🚀 Cursor para próxima página (último ID da lista)
    const nextCursor = enrichedSessions.length > 0
      ? enrichedSessions[enrichedSessions.length - 1].id
      : null;
    const hasMore = enrichedSessions.length === limit;

    return {
      data: enrichedSessions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        // 🚀 Campos para paginação cursor-based
        nextCursor,
        hasMore,
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
        connection: {
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

  // ============================================
  // SESSION PAUSE/RESUME (Inspirado no N8N)
  // ============================================

  /**
   * Pausar sessão (mantém IA bloqueada)
   */
  async pauseSession(
    sessionId: string,
    durationHours?: number,
    reason: string = 'AWAITING_AGENT'
  ): Promise<void> {
    const session = await database.chatSession.findUnique({
      where: { id: sessionId },
      select: { organizationId: true },
    });

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Se não especificou duração, usar timeout da organização
    let pauseDuration = durationHours;
    if (!pauseDuration) {
      const org = await database.organization.findUnique({
        where: { id: session.organizationId },
        select: { sessionTimeoutHours: true },
      });
      pauseDuration = org?.sessionTimeoutHours ?? 24;
    }

    const pausedUntil = new Date(Date.now() + pauseDuration * 60 * 60 * 1000);

    console.log(`[Sessions] Pausing session ${sessionId} until ${pausedUntil}`);

    await database.chatSession.update({
      where: { id: sessionId },
      data: {
        status: 'PAUSED',
        statusReason: reason,
        pausedUntil,
        pausedBy: 'system',
        aiEnabled: false,
        aiBlockedUntil: pausedUntil,
        aiBlockReason: `Sessão pausada: ${reason}`,
      },
    });

    // Publicar evento
    try {
      await redis.publish('session:paused', JSON.stringify({
        sessionId,
        pausedUntil,
        durationHours: pauseDuration,
        reason,
      }));
    } catch {
      // Ignore Redis errors
    }
  }

  /**
   * Retomar sessão pausada
   */
  async resumeSession(sessionId: string): Promise<void> {
    console.log(`[Sessions] Resuming session ${sessionId}`);

    await database.chatSession.update({
      where: { id: sessionId },
      data: {
        status: 'ACTIVE',
        statusReason: 'RESUMED',
        pausedUntil: null,
        pausedBy: null,
        aiEnabled: true,
        aiBlockedUntil: null,
        aiBlockReason: null,
      },
    });

    // Publicar evento
    try {
      await redis.publish('session:resumed', JSON.stringify({ sessionId }));
    } catch {
      // Ignore Redis errors
    }
  }

  /**
   * Worker: Retomar sessões pausadas que expiraram
   */
  async resumeExpiredPausedSessions(): Promise<number> {
    const expired = await database.chatSession.findMany({
      where: {
        status: 'PAUSED',
        pausedUntil: {
          lte: new Date(),
        },
      },
      select: { id: true },
    });

    console.log(`[Sessions] Found ${expired.length} expired paused sessions`);

    for (const session of expired) {
      await this.resumeSession(session.id);
    }

    return expired.length;
  }

  // ============================================
  // BYPASS BOTS (Blacklist/Whitelist)
  // ============================================

  /**
   * Verificar se contato deve ignorar bots (blacklist)
   */
  async shouldBypassBots(contactId: string): Promise<boolean> {
    const contact = await database.contact.findUnique({
      where: { id: contactId },
      select: { bypassBots: true },
    });

    return contact?.bypassBots ?? false;
  }

  /**
   * Definir bypass de bots para contato
   */
  async setContactBypassBots(contactId: string, bypass: boolean): Promise<void> {
    console.log(`[Sessions] Setting bypassBots=${bypass} for contact ${contactId}`);

    await database.contact.update({
      where: { id: contactId },
      data: { bypassBots: bypass },
    });

    // Publicar evento
    try {
      await redis.publish(bypass ? 'contact:blacklisted' : 'contact:whitelisted', JSON.stringify({
        contactId,
        bypassBots: bypass,
      }));
    } catch {
      // Ignore Redis errors
    }
  }

  // ============================================
  // WHATSAPP 24H WINDOW TRACKING
  // ============================================

  /**
   * Atualizar janela 24h do WhatsApp quando cliente envia mensagem
   * A janela permite enviar mensagens template-free por 24h após última msg do cliente
   */
  async updateWhatsAppWindow(
    sessionId: string,
    isCustomerMessage: boolean
  ): Promise<{ expiresAt: Date | null; canReply: boolean }> {
    // Só atualiza janela quando CLIENTE envia mensagem
    if (!isCustomerMessage) {
      const session = await database.chatSession.findUnique({
        where: { id: sessionId },
        select: { whatsappWindowExpiresAt: true },
      });
      return {
        expiresAt: session?.whatsappWindowExpiresAt || null,
        canReply: session?.whatsappWindowExpiresAt ? new Date() < session.whatsappWindowExpiresAt : false,
      };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + WHATSAPP_WINDOW_MS);

    console.log(`[Sessions] Updating WhatsApp 24h window for session ${sessionId} - expires at ${expiresAt.toISOString()}`);

    await database.chatSession.update({
      where: { id: sessionId },
      data: {
        lastCustomerMessageAt: now,
        whatsappWindowExpiresAt: expiresAt,
        whatsappWindowType: 'CUSTOMER_INITIATED',
      },
    });

    // Publicar evento
    try {
      await redis.publish('session:window_updated', JSON.stringify({
        sessionId,
        expiresAt,
        type: 'CUSTOMER_INITIATED',
      }));
    } catch {
      // Ignore Redis errors
    }

    return { expiresAt, canReply: true };
  }

  /**
   * Verificar se a janela 24h do WhatsApp ainda está ativa
   * Retorna true se podemos enviar mensagens livres (sem template)
   */
  async canReplyWithinWindow(sessionId: string): Promise<boolean> {
    const session = await database.chatSession.findUnique({
      where: { id: sessionId },
      select: { whatsappWindowExpiresAt: true },
    });

    if (!session?.whatsappWindowExpiresAt) {
      return false;
    }

    return new Date() < session.whatsappWindowExpiresAt;
  }

  /**
   * Obter informações da janela 24h do WhatsApp
   */
  async getWhatsAppWindowInfo(sessionId: string): Promise<{
    isActive: boolean;
    expiresAt: Date | null;
    lastCustomerMessageAt: Date | null;
    windowType: string | null;
    remainingMinutes: number;
  }> {
    const session = await database.chatSession.findUnique({
      where: { id: sessionId },
      select: {
        whatsappWindowExpiresAt: true,
        lastCustomerMessageAt: true,
        whatsappWindowType: true,
      },
    });

    if (!session) {
      return {
        isActive: false,
        expiresAt: null,
        lastCustomerMessageAt: null,
        windowType: null,
        remainingMinutes: 0,
      };
    }

    const now = new Date();
    const isActive = session.whatsappWindowExpiresAt
      ? now < session.whatsappWindowExpiresAt
      : false;

    const remainingMinutes = isActive && session.whatsappWindowExpiresAt
      ? Math.max(0, Math.floor((session.whatsappWindowExpiresAt.getTime() - now.getTime()) / 60000))
      : 0;

    return {
      isActive,
      expiresAt: session.whatsappWindowExpiresAt,
      lastCustomerMessageAt: session.lastCustomerMessageAt,
      windowType: session.whatsappWindowType,
      remainingMinutes,
    };
  }

  // ============================================
  // AUTO-PAUSE ON HUMAN REPLY
  // ============================================

  /**
   * Auto-pausar sessão quando humano responde
   * Bloqueia IA automaticamente para evitar interferência
   */
  async autoPauseOnHumanReply(
    sessionId: string,
    agentId?: string,
    agentName?: string
  ): Promise<void> {
    console.log(`[Sessions] Auto-pausing session ${sessionId} due to human reply`);

    const session = await database.chatSession.findUnique({
      where: { id: sessionId },
      select: { organizationId: true },
    });

    if (!session) {
      console.warn(`[Sessions] Session ${sessionId} not found for auto-pause`);
      return;
    }

    // Buscar timeout da organização
    const org = await database.organization.findUnique({
      where: { id: session.organizationId },
      select: { sessionTimeoutHours: true },
    });

    const pauseDurationHours = org?.sessionTimeoutHours ?? 24;
    const pausedUntil = new Date(Date.now() + pauseDurationHours * 60 * 60 * 1000);

    await database.chatSession.update({
      where: { id: sessionId },
      data: {
        status: 'ACTIVE', // Mantém ativa mas com IA bloqueada
        aiEnabled: false,
        aiBlockedUntil: pausedUntil,
        aiBlockReason: 'AUTO_PAUSED_HUMAN',
        pausedBy: agentName || agentId || 'human_agent',
      },
    });

    // Publicar evento
    try {
      await redis.publish('session:auto_paused', JSON.stringify({
        sessionId,
        pausedUntil,
        reason: 'human_reply',
        agentId,
        agentName,
      }));
    } catch {
      // Ignore Redis errors
    }
  }

  /**
   * Verificar se deve auto-pausar (mensagem de saída de humano)
   */
  shouldAutoPause(direction: 'INBOUND' | 'OUTBOUND', author: string): boolean {
    return direction === 'OUTBOUND' && (author === 'HUMAN' || author === 'AGENT');
  }

  // ============================================
  // SESSION EXPIRATION (expiresAt)
  // ============================================

  /**
   * Calcular data de expiração baseado no timeout da organização
   */
  async calculateExpiresAt(organizationId: string, fromDate?: Date): Promise<Date> {
    const org = await database.organization.findUnique({
      where: { id: organizationId },
      select: { sessionTimeoutHours: true },
    });

    const timeoutHours = org?.sessionTimeoutHours ?? 24;
    const baseDate = fromDate || new Date();

    return new Date(baseDate.getTime() + timeoutHours * 60 * 60 * 1000);
  }

  /**
   * Renovar expiração da sessão (quando nova mensagem chega)
   */
  async renewSessionExpiration(sessionId: string): Promise<Date | null> {
    const session = await database.chatSession.findUnique({
      where: { id: sessionId },
      select: { organizationId: true, status: true },
    });

    if (!session || session.status === 'CLOSED') {
      return null;
    }

    const expiresAt = await this.calculateExpiresAt(session.organizationId);

    await database.chatSession.update({
      where: { id: sessionId },
      data: {
        lastMessageAt: new Date(),
        expiresAt,
      },
    });

    return expiresAt;
  }

  /**
   * Verificar se deve continuar processamento de IA
   * Retorna true se a mensagem deve ser processada pela IA
   */
  async shouldProcessWithAI(
    sessionId: string,
    contactId: string,
    isInbound: boolean
  ): Promise<{ process: boolean; reason: string }> {
    // Só processa mensagens de entrada (do cliente)
    if (!isInbound) {
      return { process: false, reason: 'outbound_message' };
    }

    // Verificar se contato está na blacklist
    const bypassBots = await this.shouldBypassBots(contactId);
    if (bypassBots) {
      return { process: false, reason: 'contact_blacklisted' };
    }

    // Verificar status da sessão
    const session = await database.chatSession.findUnique({
      where: { id: sessionId },
      select: {
        status: true,
        aiEnabled: true,
        aiBlockedUntil: true,
      },
    });

    if (!session) {
      return { process: false, reason: 'session_not_found' };
    }

    // Sessão deve estar QUEUED ou ACTIVE
    if (!['QUEUED', 'ACTIVE'].includes(session.status)) {
      return { process: false, reason: `session_${session.status.toLowerCase()}` };
    }

    // Verificar se IA está bloqueada
    if (!session.aiEnabled) {
      // Verificar se bloqueio expirou
      if (session.aiBlockedUntil && new Date() > session.aiBlockedUntil) {
        await this.unblockAI(sessionId);
        return { process: true, reason: 'ai_block_expired' };
      }
      return { process: false, reason: 'ai_blocked' };
    }

    return { process: true, reason: 'ok' };
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

  /**
   * Worker: Fechar sessões inativas por timeout
   * Verifica o sessionTimeoutHours de cada organização
   * Deve ser executado periodicamente (cron job - cada 5 minutos)
   */
  async closeExpiredSessions(): Promise<{ closed: number; organizations: string[] }> {
    console.log('[Sessions] Checking for expired sessions...');

    // Buscar todas as organizações com suas configurações de timeout
    const organizations = await database.organization.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        sessionTimeoutHours: true,
      },
    });

    let totalClosed = 0;
    const affectedOrgs: string[] = [];

    for (const org of organizations) {
      const timeoutHours = org.sessionTimeoutHours ?? 24; // Default: 24 horas
      const cutoffTime = new Date(Date.now() - timeoutHours * 60 * 60 * 1000);

      // Buscar sessões expiradas (QUEUED ou ACTIVE que não tiveram mensagem no período)
      const expiredSessions = await database.chatSession.findMany({
        where: {
          organizationId: org.id,
          status: { in: ['QUEUED', 'ACTIVE'] },
          lastMessageAt: {
            lte: cutoffTime,
          },
        },
        select: { id: true, contactId: true },
      });

      if (expiredSessions.length > 0) {
        console.log(`[Sessions] Found ${expiredSessions.length} expired sessions in org "${org.name}" (timeout: ${timeoutHours}h)`);

        // Fechar todas as sessões expiradas
        const result = await database.chatSession.updateMany({
          where: {
            id: { in: expiredSessions.map(s => s.id) },
          },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            endReason: `Encerrada automaticamente por inatividade (${timeoutHours}h)`,
          },
        });

        totalClosed += result.count;
        affectedOrgs.push(org.name);

        // Publicar eventos para cada sessão fechada
        for (const session of expiredSessions) {
          try {
            await redis.publish('session:closed', JSON.stringify({
              sessionId: session.id,
              reason: 'timeout',
              timeoutHours,
            }));
          } catch (err) {
            // Ignore Redis errors, log and continue
            console.warn(`[Sessions] Failed to publish close event for session ${session.id}`);
          }
        }
      }
    }

    if (totalClosed > 0) {
      console.log(`[Sessions] ✅ Closed ${totalClosed} expired sessions across ${affectedOrgs.length} organizations`);
    } else {
      console.log('[Sessions] No expired sessions found');
    }

    return { closed: totalClosed, organizations: affectedOrgs };
  }
}

// Singleton
export const sessionsManager = new SessionsManager();
