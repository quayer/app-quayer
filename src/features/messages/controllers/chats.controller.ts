/**
 * Chats Controller
 * Gerenciamento de conversas/chats via UAZapi
 */

import { igniter } from '@/igniter';
import { database } from '@/services/database';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { listChatsSchema, listAllChatsSchema, markAsReadSchema } from '../messages.schemas';
import { z } from 'zod';
import { ConnectionStatus } from '@prisma/client';
import { uazapiService } from '@/lib/api/uazapi.service';

/**
 * Cache TTL para listagem de chats (em segundos)
 * TTL aumentado para 60s - SSE garante atualizações em tempo real
 */
const CHATS_CACHE_TTL = 60; // 60 segundos (SSE garante real-time)

export const chatsController = igniter.controller({
  name: 'chats',
  path: '/chats',
  actions: {
    /**
     * GET /api/v1/chats/list
     * Listar conversas de uma instância
     */
    list: igniter.query({
      path: '/list',
      method: 'GET',
      query: listChatsSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const query = request.query as z.infer<typeof listChatsSchema>;
        const { instanceId } = query;

        // Buscar instância e verificar permissão
        // IMPORTANTE: Incluir 'provider' para detectar UAZapi vs Cloud API
        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: {
              users: {
                some: { userId: userId },
              },
            },
          },
          select: {
            id: true,
            organizationId: true,
            uazapiToken: true,
            status: true,
            provider: true, // 🚀 CRITICAL: Detectar tipo de provider
            n8nWebhookUrl: true, // Incluir para verificar se IA está disponível na integração
          },
        });

        if (!instance) {
          return response.notFound('Instância não encontrada');
        }

        try {
          // 🚀 Cache: Verificar cache antes de buscar no banco
          const cacheKey = `chats:list:${instanceId}:${query.search || ''}:${query.status || ''}:${query.sessionStatus || ''}:${query.attendanceType || ''}:${query.offset || 0}:${query.limit || 20}`;

          try {
            const cached = await igniter.store.get<any>(cacheKey);
            if (cached) {
              return response.success({ ...cached, source: 'cache' });
            }
          } catch {
            // Cache miss ou erro - continuar sem cache
          }

          // Filtros
          const where: any = {
            connectionId: instanceId,
          };

          if (query.search) {
            where.contact = {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { phoneNumber: { contains: query.search } },
              ],
            };
          }

          if (query.status === 'groups') {
            where.contact = {
              ...where.contact,
              phoneNumber: { contains: '@g.us' }
            };
          }

          // Filtro por status da sessão
          if (query.sessionStatus) {
            where.status = query.sessionStatus;
          }

          // Filtro por tipo de atendimento (IA, Humano, Arquivado)
          // IMPORTANTE: IA só está disponível quando n8nWebhookUrl está configurado na conexão
          const connectionHasWebhook = !!instance.n8nWebhookUrl;
          const now = new Date();

          if (query.attendanceType === 'ai') {
            // Sessões com IA ativa:
            // 1. Conexão deve ter webhook configurado
            // 2. aiEnabled = true E (aiBlockedUntil é null OU já expirou)
            if (!connectionHasWebhook) {
              // Se conexão não tem webhook, nenhuma sessão pode ser IA
              where.id = 'NEVER_MATCH'; // Força resultado vazio
            } else {
              where.AND = [
                ...(where.AND || []),
                { aiEnabled: true },
                {
                  OR: [
                    { aiBlockedUntil: null },
                    { aiBlockedUntil: { lt: now } }
                  ]
                },
                // Exclui arquivados deste filtro
                { status: { notIn: ['CLOSED', 'PAUSED'] } }
              ];
            }
          } else if (query.attendanceType === 'human') {
            // Sessões com humano:
            // 1. Se conexão não tem webhook → todas são humanas (exceto arquivadas)
            // 2. Se tem webhook → aiEnabled = false OU aiBlockedUntil ainda não expirou
            if (!connectionHasWebhook) {
              // Sem webhook, todas sessões ativas são humanas
              where.status = { notIn: ['CLOSED', 'PAUSED'] };
            } else {
              where.AND = [
                ...(where.AND || []),
                {
                  OR: [
                    { aiEnabled: false },
                    { aiBlockedUntil: { gte: now } }
                  ]
                },
                // Exclui arquivados deste filtro
                { status: { notIn: ['CLOSED', 'PAUSED'] } }
              ];
            }
          } else if (query.attendanceType === 'archived') {
            // Sessões arquivadas: status é CLOSED ou PAUSED
            where.status = { in: ['CLOSED', 'PAUSED'] };
          }

          // Paginação
          const limit = query.limit || 20;
          const offset = query.offset || 0;

          const fetchLocalChats = async () => {
            return Promise.all([
              database.chatSession.findMany({
                where,
                include: {
                  contact: true,
                  messages: {
                    take: 1,
                    orderBy: { createdAt: 'desc' },
                  },
                },
                orderBy: { lastMessageAt: 'desc' },
                skip: offset,
                take: limit,
              }),
              database.chatSession.count({ where }),
            ]);
          };

          let [sessions, total] = await fetchLocalChats();

          // 🚀 SYNC DESATIVADO - Modo Reativo
          // Sessões são criadas automaticamente via webhooks quando mensagens chegam
          // Isso simplifica a lógica e evita overhead de sync com APIs externas
          //
          // Benefícios do modo reativo:
          // 1. Menos chamadas de API = menor custo e latência
          // 2. Sessões só existem quando há interação real
          // 3. Funciona igual para UAZapi e Cloud API
          // 4. Webhooks garantem dados em tempo real
          //
          // Para reativar sync, descomentar o bloco abaixo

          // 🚀 SYNC DESATIVADO - Modo Reativo (webhooks only)
          // Sessões são criadas automaticamente via webhooks quando mensagens chegam
          // Benefícios:
          // 1. Menos chamadas de API = menor custo e latência
          // 2. Sessões só existem quando há interação real
          // 3. Funciona igual para UAZapi e Cloud API
          // 4. Webhooks garantem dados em tempo real
          //
          // Para reativar sync, restaurar código do git ou ver comentário abaixo

          // Helper para formatar preview de mensagem baseada no tipo
          const formatMessagePreview = (msg: any): string => {
            if (!msg) return '';
            if (msg.content && msg.content.trim()) return msg.content;

            // Fallback para tipos de mídia
            const typeLabels: Record<string, string> = {
              'image': '📷 Imagem',
              'video': '🎥 Vídeo',
              'audio': '🎵 Áudio',
              'voice': '🎤 Mensagem de voz',
              'ptt': '🎤 Mensagem de voz',
              'document': '📄 Documento',
              'sticker': '🎨 Sticker',
              'location': '📍 Localização',
              'contact': '👤 Contato',
            };

            return typeLabels[msg.type] || `📎 ${msg.type || 'Mídia'}`;
          };

          // Mapper
          const mapSessionToChat = (session: any) => {
            const lastMsg = session.messages[0];
            const phoneNumber = session.contact.phoneNumber || '';
            const isGroup = phoneNumber.endsWith('@g.us') || phoneNumber.includes('-');

            // Formatar nome do contato corretamente
            // Prioridade: name do contato > verifiedName > formatar phoneNumber
            let displayName = session.contact.name;
            if (!displayName || displayName === phoneNumber) {
              displayName = session.contact.verifiedName;
            }
            if (!displayName || displayName === phoneNumber) {
              // Formatar número para exibição
              if (isGroup) {
                displayName = 'Grupo WhatsApp';
              } else {
                // Extrair apenas os números e formatar
                const cleanNumber = phoneNumber.replace(/@.*$/, '').replace(/\D/g, '');
                if (cleanNumber.length >= 10) {
                  // Formato brasileiro: +55 (11) 99999-9999
                  const countryCode = cleanNumber.slice(0, 2);
                  const areaCode = cleanNumber.slice(2, 4);
                  const part1 = cleanNumber.slice(4, 9);
                  const part2 = cleanNumber.slice(9);
                  displayName = `+${countryCode} (${areaCode}) ${part1}-${part2}`;
                } else {
                  displayName = cleanNumber || 'Contato';
                }
              }
            }

            // Extrair número limpo para exibição
            const cleanPhoneNumber = phoneNumber.replace(/@.*$/, '');

            return {
              // Session ID for proper identification
              id: session.id,
              wa_chatid: phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`,
              wa_name: displayName,
              wa_phoneNumber: cleanPhoneNumber, // Número limpo para exibição
              wa_profilePicUrl: session.contact.profilePicUrl,
              wa_isGroup: isGroup,
              wa_lastMsgTimestamp: session.lastMessageAt.getTime(),
              wa_lastMsgBody: formatMessagePreview(lastMsg),
              wa_unreadCount: 0,
              wa_isPinned: false,
              wa_isArchived: session.status === 'CLOSED',
              wa_isMuted: false,
              lead_status: session.customerJourney || null,
              lead_source: session.leadSource || 'whatsapp',
              created_at: session.createdAt.toISOString(),
              updated_at: session.updatedAt.toISOString(),
              // Campos de status e IA
              // IMPORTANTE: IA só está disponível quando:
              // 1. Conexão tem webhook configurado (n8nWebhookUrl)
              // 2. aiEnabled = true na sessão
              // 3. aiBlockedUntil não existe ou já expirou
              status: session.status,
              aiEnabled: session.aiEnabled ?? false,
              aiBlockedUntil: session.aiBlockedUntil?.toISOString() ?? null,
              // Indica se a conexão tem IA disponível (webhook configurado)
              connectionHasWebhook: connectionHasWebhook,
            };
          };

          const result = {
            chats: sessions.map(mapSessionToChat),
            pagination: {
              total,
              limit,
              offset,
              hasMore: offset + limit < total,
            },
          };

          // 🚀 Cache: Salvar resultado com TTL
          try {
            await igniter.store.set(cacheKey, result, { ttl: CHATS_CACHE_TTL });
          } catch {
            // Erro ao salvar cache - não crítico
          }

          return response.success(result);

        } catch (error: any) {
          console.error('[ChatsController] Erro geral:', error);
          return response.badRequest(`Erro ao buscar conversas: ${error.message}`);
        }
      },
    }),

    /**
     * GET /api/v1/chats/all
     * Endpoint unificado que busca chats de TODAS as instâncias do usuário
     * Elimina a necessidade de N requisições paralelas no frontend
     * Suporta cursor-based pagination para melhor performance
     */
    all: igniter.query({
      path: '/all',
      method: 'GET',
      query: listAllChatsSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const user = context.auth?.session?.user;
        const organizationId = user?.currentOrgId;
        const query = request.query as z.infer<typeof listAllChatsSchema>;

        try {
          // 1. Buscar todas as instâncias do usuário (usando organizationId como o endpoint de instances)
          // CORREÇÃO: Usar organizationId diretamente em vez de relação indireta
          const instanceFilter: any = {};

          // Filtrar por organização do usuário
          if (organizationId) {
            instanceFilter.organizationId = organizationId;
          } else {
            // Se usuário não tem organização, não retorna nada (segurança)
            console.warn('[ChatsController.all] User has no organizationId, returning empty');
            return response.success({
              chats: [],
              instances: [],
              pagination: { total: 0, limit: query.limit || 50, cursor: null, hasMore: false },
              counts: { ai: 0, human: 0, archived: 0, groups: 0 },
            });
          }

          if (query.instanceIds && query.instanceIds.length > 0) {
            instanceFilter.id = { in: query.instanceIds };
          }

          const instances = await database.connection.findMany({
            where: instanceFilter,
            select: {
              id: true,
              name: true,
              organizationId: true,
              n8nWebhookUrl: true,
              status: true,
              provider: true, // 🚀 CRITICAL: Detectar tipo de provider
            },
          });

          if (instances.length === 0) {
            return response.success({
              chats: [],
              instances: [],
              pagination: {
                total: 0,
                limit: query.limit || 50,
                cursor: null,
                hasMore: false,
              },
              counts: { ai: 0, human: 0, archived: 0, groups: 0 },
            });
          }

          const instanceIds = instances.map(i => i.id);
          const instancesMap = new Map(instances.map(i => [i.id, i]));

          // 🚀 SYNC DESATIVADO - Modo Reativo (webhooks only)
          // Sessões são criadas automaticamente via webhooks quando mensagens chegam
          // Isso simplifica a lógica e evita overhead de sync com APIs externas
          //
          // Benefícios do modo reativo:
          // 1. Menos chamadas de API = menor custo e latência
          // 2. Sessões só existem quando há interação real
          // 3. Funciona igual para UAZapi e Cloud API
          // 4. Webhooks garantem dados em tempo real
          //
          // Para reativar sync, restaurar código do git

          // 3. Cache check (skip if forceSync)
          const cacheKey = `chats:all:${userId}:${instanceIds.sort().join(',')}:${query.search || ''}:${query.attendanceType || ''}:${query.cursor || '0'}:${query.limit || 50}`;
          if (!query.forceSync) {
            try {
              const cached = await igniter.store.get<any>(cacheKey);
              if (cached) {
                return response.success({ ...cached, source: 'cache' });
              }
            } catch {
              // Cache miss - continue
            }
          }

          // 4. Build filters for unified query
          const now = new Date();
          const where: any = {
            connectionId: { in: instanceIds },
          };

          // Search filter
          if (query.search) {
            where.contact = {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { phoneNumber: { contains: query.search } },
              ],
            };
          }

          // Groups filter
          if (query.status === 'groups') {
            where.contact = {
              ...where.contact,
              phoneNumber: { contains: '@g.us' },
            };
          }

          // Session status filter
          if (query.sessionStatus) {
            where.status = query.sessionStatus;
          }

          // 5. Attendance type filter (more complex with multi-instance)
          // For unified endpoint, we need to handle per-instance webhook status
          if (query.attendanceType === 'ai') {
            // Only instances with webhook can have AI sessions
            const instancesWithWebhook = instances.filter(i => !!i.n8nWebhookUrl).map(i => i.id);
            if (instancesWithWebhook.length === 0) {
              // No instances have webhook - return empty
              return response.success({
                chats: [],
                instances: instances.map(i => ({ id: i.id, name: i.name, status: i.status })),
                pagination: { total: 0, limit: query.limit || 50, cursor: null, hasMore: false },
                counts: { ai: 0, human: 0, archived: 0, groups: 0 },
              });
            }
            where.connectionId = { in: instancesWithWebhook };
            where.AND = [
              ...(where.AND || []),
              { aiEnabled: true },
              {
                OR: [
                  { aiBlockedUntil: null },
                  { aiBlockedUntil: { lt: now } },
                ],
              },
              { status: { notIn: ['CLOSED', 'PAUSED'] } },
            ];
          } else if (query.attendanceType === 'human') {
            const instancesWithWebhook = instances.filter(i => !!i.n8nWebhookUrl).map(i => i.id);
            const instancesWithoutWebhook = instances.filter(i => !i.n8nWebhookUrl).map(i => i.id);

            // Human = (instances without webhook) OR (instances with webhook but AI disabled/blocked)
            where.AND = [
              ...(where.AND || []),
              { status: { notIn: ['CLOSED', 'PAUSED'] } },
              {
                OR: [
                  // All sessions from instances without webhook
                  { connectionId: { in: instancesWithoutWebhook } },
                  // Sessions from instances with webhook but AI is disabled or blocked
                  {
                    connectionId: { in: instancesWithWebhook },
                    OR: [
                      { aiEnabled: false },
                      { aiBlockedUntil: { gte: now } },
                    ],
                  },
                ],
              },
            ];
          } else if (query.attendanceType === 'archived') {
            where.status = { in: ['CLOSED', 'PAUSED'] };
          }

          // 6. Pagination (cursor-based or offset-based)
          const limit = query.limit || 50;
          let paginationOptions: any = {
            take: limit + 1, // Take one extra to check if there's more
            orderBy: { lastMessageAt: 'desc' as const },
          };

          if (query.cursor) {
            // Cursor-based: cursor is the ID of the last item
            paginationOptions.cursor = { id: query.cursor };
            paginationOptions.skip = 1; // Skip the cursor item itself
          } else if (query.offset) {
            // Fallback to offset-based
            paginationOptions.skip = query.offset;
          }

          // 7. Fetch sessions with all necessary data
          const [sessions, totalCount] = await Promise.all([
            database.chatSession.findMany({
              where,
              include: {
                contact: true,
                messages: {
                  take: 1,
                  orderBy: { createdAt: 'desc' },
                },
                connection: {
                  select: {
                    id: true,
                    name: true,
                    n8nWebhookUrl: true,
                    status: true,
                  },
                },
              },
              ...paginationOptions,
            }),
            // Get total count for stats (without pagination)
            database.chatSession.count({ where }),
          ]);

          // Check if there's more data
          const hasMore = sessions.length > limit;
          const resultSessions = hasMore ? sessions.slice(0, limit) : sessions;
          const nextCursor = hasMore ? resultSessions[resultSessions.length - 1]?.id : null;

          // 8. Calculate counts for tabs (from ALL sessions matching base filters)
          // We need counts without attendance type filter
          const baseWhere: any = { connectionId: { in: instanceIds } };
          if (query.search) {
            baseWhere.contact = {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { phoneNumber: { contains: query.search } },
              ],
            };
          }

          const [allSessions, archivedCount, groupsCount] = await Promise.all([
            database.chatSession.findMany({
              where: {
                ...baseWhere,
                status: { notIn: ['CLOSED', 'PAUSED'] },
              },
              select: {
                id: true,
                aiEnabled: true,
                aiBlockedUntil: true,
                connectionId: true,
                contact: { select: { phoneNumber: true } },
              },
            }),
            database.chatSession.count({
              where: { ...baseWhere, status: { in: ['CLOSED', 'PAUSED'] } },
            }),
            database.chatSession.count({
              where: {
                ...baseWhere,
                status: { notIn: ['CLOSED', 'PAUSED'] },
                contact: { phoneNumber: { contains: '@g.us' } },
              },
            }),
          ]);

          // Calculate AI and Human counts
          let aiCount = 0;
          let humanCount = 0;
          for (const s of allSessions) {
            const inst = instancesMap.get(s.connectionId);
            const hasWebhook = !!inst?.n8nWebhookUrl;
            const aiNotBlocked = !s.aiBlockedUntil || new Date(s.aiBlockedUntil) < now;

            if (hasWebhook && s.aiEnabled && aiNotBlocked) {
              aiCount++;
            } else {
              humanCount++;
            }
          }

          // 9. Map sessions to chat format with instance info
          const formatMessagePreview = (msg: any): string => {
            if (!msg) return '';
            if (msg.content && msg.content.trim()) return msg.content;
            const typeLabels: Record<string, string> = {
              image: '📷 Imagem',
              video: '🎥 Vídeo',
              audio: '🎵 Áudio',
              voice: '🎤 Mensagem de voz',
              ptt: '🎤 Mensagem de voz',
              document: '📄 Documento',
              sticker: '🎨 Sticker',
              location: '📍 Localização',
              contact: '👤 Contato',
            };
            return typeLabels[msg.type] || `📎 ${msg.type || 'Mídia'}`;
          };

          const chats = resultSessions.map((session: any) => {
            const lastMsg = session.messages[0];
            const phoneNumber = session.contact.phoneNumber || '';
            const isGroup = phoneNumber.endsWith('@g.us') || phoneNumber.includes('-');
            const instance = instancesMap.get(session.connectionId);
            const connectionHasWebhook = !!instance?.n8nWebhookUrl;

            // Format contact name
            let displayName = session.contact.name;
            if (!displayName || displayName === phoneNumber) {
              displayName = session.contact.verifiedName;
            }
            if (!displayName || displayName === phoneNumber) {
              if (isGroup) {
                displayName = 'Grupo WhatsApp';
              } else {
                const cleanNumber = phoneNumber.replace(/@.*$/, '').replace(/\D/g, '');
                if (cleanNumber.length >= 10) {
                  const countryCode = cleanNumber.slice(0, 2);
                  const areaCode = cleanNumber.slice(2, 4);
                  const part1 = cleanNumber.slice(4, 9);
                  const part2 = cleanNumber.slice(9);
                  displayName = `+${countryCode} (${areaCode}) ${part1}-${part2}`;
                } else {
                  displayName = cleanNumber || 'Contato';
                }
              }
            }

            return {
              id: session.id,
              wa_chatid: phoneNumber.includes('@') ? phoneNumber : `${phoneNumber}@s.whatsapp.net`,
              wa_name: displayName,
              wa_phoneNumber: phoneNumber.replace(/@.*$/, ''),
              wa_profilePicUrl: session.contact.profilePicUrl,
              wa_isGroup: isGroup,
              wa_lastMsgTimestamp: session.lastMessageAt.getTime(),
              wa_lastMsgBody: formatMessagePreview(lastMsg),
              wa_unreadCount: 0,
              wa_isPinned: false,
              wa_isArchived: session.status === 'CLOSED',
              wa_isMuted: false,
              lead_status: session.customerJourney || null,
              lead_source: session.leadSource || 'whatsapp',
              created_at: session.createdAt.toISOString(),
              updated_at: session.updatedAt.toISOString(),
              status: session.status,
              aiEnabled: session.aiEnabled ?? false,
              aiBlockedUntil: session.aiBlockedUntil?.toISOString() ?? null,
              connectionHasWebhook,
              // Instance info attached to each chat
              instanceId: session.connectionId,
              instanceName: instance?.name || 'Instância',
            };
          });

          console.log('[ChatsController.all] Query result:', {
            sessionsCount: sessions.length,
            totalCount,
            chatsReturned: chats.length,
            instanceIds,
            organizationId,
            hasMore,
          });

          const result = {
            chats,
            instances: instances.map(i => ({
              id: i.id,
              name: i.name,
              status: i.status,
              hasWebhook: !!i.n8nWebhookUrl,
              provider: i.provider, // 🚀 Incluir provider para frontend
            })),
            pagination: {
              total: totalCount,
              limit,
              cursor: nextCursor,
              hasMore,
            },
            counts: {
              ai: aiCount,
              human: humanCount,
              archived: archivedCount,
              groups: groupsCount,
            },
          };

          // 10. Cache result
          try {
            await igniter.store.set(cacheKey, result, { ttl: CHATS_CACHE_TTL });
          } catch {
            // Cache error - non-critical
          }

          return response.success(result);
        } catch (error: any) {
          console.error('[ChatsController] Erro no endpoint all:', error);
          return response.badRequest(`Erro ao buscar conversas: ${error.message}`);
        }
      },
    }),

    /**
     * GET /api/v1/chats/count
     */
    count: igniter.query({
      path: '/count',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { instanceId } = request.query as { instanceId: string };

        if (!instanceId) return response.badRequest('instanceId é obrigatório');

        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');

        try {
          const [total, groups] = await Promise.all([
            database.chatSession.count({ where: { connectionId: instanceId } }),
            database.chatSession.count({
              where: {
                connectionId: instanceId,
                contact: { phoneNumber: { contains: '@g.us' } }
              }
            })
          ]);

          return response.success({
            total_chats: total,
            unread_chats: 0,
            groups: groups,
            pinned_chats: 0,
          });
        } catch (error) {
          return response.success({
            total_chats: 0,
            unread_chats: 0,
            groups: 0,
            pinned_chats: 0,
          });
        }
      },
    }),

    /**
     * POST /api/v1/chats/mark-read
     */
    markAsRead: igniter.mutation({
      path: '/mark-read',
      method: 'POST',
      body: markAsReadSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const body = request.body;

        const instance = await database.connection.findFirst({
          where: {
            id: body.instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');
        if (instance.status !== ConnectionStatus.CONNECTED || !instance.uazapiToken) {
          return response.badRequest('Instância não está conectada');
        }

        const result = await uazapiService.markAsRead(instance.uazapiToken, body.chatId);
        if (!result.success) {
          return response.badRequest(result.error || 'Erro ao marcar chat como lido');
        }
        return response.success({ message: 'Chat marcado como lido' });
      },
    }),

    /**
     * POST /api/v1/chats/:chatId/archive
     */
    archive: igniter.mutation({
      path: '/:chatId/archive',
      method: 'POST',
      body: z.object({ instanceId: z.string().uuid() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { chatId } = request.params as { chatId: string };
        const { instanceId } = request.body;

        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');
        if (instance.status !== ConnectionStatus.CONNECTED || !instance.uazapiToken) {
          return response.badRequest('Instância não está conectada');
        }

        const result = await uazapiService.archiveChat(instance.uazapiToken, chatId, true);
        if (!result.success) {
          return response.badRequest(result.error || 'Erro ao arquivar chat');
        }

        // Also close the local session
        const phoneNumber = chatId.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
        const contact = await database.contact.findUnique({
          where: { phoneNumber },
        });

        if (contact) {
          await database.chatSession.updateMany({
            where: {
              connectionId: instanceId,
              contactId: contact.id,
              status: { in: ['QUEUED', 'ACTIVE'] },
            },
            data: {
              status: 'CLOSED',
              closedAt: new Date(),
              endReason: 'Arquivado manualmente pelo usuário',
            },
          });
        }

        return response.success({ message: 'Chat arquivado com sucesso' });
      },
    }),

    /**
     * POST /api/v1/chats/:chatId/unarchive
     * Restore an archived chat session
     */
    unarchive: igniter.mutation({
      path: '/:chatId/unarchive',
      method: 'POST',
      body: z.object({ instanceId: z.string().uuid() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { chatId } = request.params as { chatId: string };
        const { instanceId } = request.body;

        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');
        if (instance.status !== ConnectionStatus.CONNECTED || !instance.uazapiToken) {
          return response.badRequest('Instância não está conectada');
        }

        // Unarchive on UAZapi
        const result = await uazapiService.archiveChat(instance.uazapiToken, chatId, false);
        if (!result.success) {
          return response.badRequest(result.error || 'Erro ao desarquivar chat');
        }

        // Also reactivate the local session
        const phoneNumber = chatId.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
        const contact = await database.contact.findUnique({
          where: { phoneNumber },
        });

        if (contact) {
          await database.chatSession.updateMany({
            where: {
              connectionId: instanceId,
              contactId: contact.id,
              status: 'CLOSED',
            },
            data: {
              status: 'ACTIVE',
              closedAt: null,
              endReason: null,
            },
          });
        }

        return response.success({ message: 'Chat desarquivado com sucesso' });
      },
    }),

    /**
     * DELETE /api/v1/chats/:chatId
     */
    delete: igniter.mutation({
      path: '/:chatId',
      method: 'DELETE',
      body: z.object({ instanceId: z.string().uuid() }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { chatId } = request.params as { chatId: string };
        const { instanceId } = request.body;

        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');
        if (instance.status !== ConnectionStatus.CONNECTED || !instance.uazapiToken) {
          return response.badRequest('Instância não está conectada');
        }

        const result = await uazapiService.deleteChat(instance.uazapiToken, chatId);
        if (!result.success) {
          return response.badRequest(result.error || 'Erro ao deletar chat');
        }

        // Limpar sessão local
        await database.chatSession.deleteMany({
          where: {
            connectionId: instanceId,
            contact: { phoneNumber: chatId.replace('@s.whatsapp.net', '').replace('@g.us', '') },
          },
        });

        return response.noContent();
      },
    }),

    /**
     * POST /api/v1/chats/sync
     * Sync manual - Importa chats existentes da UAZapi para o banco local
     * Útil quando sync reativo está ativado mas não há chats no banco
     */
    sync: igniter.mutation({
      path: '/sync',
      method: 'POST',
      body: z.object({
        instanceId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { instanceId } = request.body;

        console.log('[ChatsController.sync] Starting sync for instance:', instanceId);

        // 1. Verificar permissão
        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: {
              users: { some: { userId } },
            },
          },
          select: {
            id: true,
            organizationId: true,
            uazapiToken: true,
            status: true,
            provider: true,
          },
        });

        if (!instance) {
          return response.notFound('Instância não encontrada');
        }

        if (!instance.uazapiToken) {
          return response.badRequest('Instância sem token UAZapi configurado');
        }

        if (!instance.organizationId) {
          return response.badRequest('Instância sem organização associada');
        }

        if (instance.status !== ConnectionStatus.CONNECTED) {
          return response.badRequest('Instância não está conectada');
        }

        try {
          // 2. Buscar chats da UAZapi
          const chatsResult = await uazapiService.findChats(instance.uazapiToken);

          if (!chatsResult.success) {
            return response.badRequest(chatsResult.error || 'Erro ao buscar chats da UAZapi');
          }

          const uazapiChats = chatsResult.data || [];
          console.log(`[ChatsController.sync] Found ${uazapiChats.length} chats from UAZapi`);

          let created = 0;
          let updated = 0;
          let skipped = 0;

          // 3. Processar cada chat
          for (const chat of uazapiChats) {
            try {
              // Extrair dados do chat UAZapi
              const chatId = chat.id || chat.chatid || chat.jid;
              if (!chatId) {
                skipped++;
                continue;
              }

              // Extrair phoneNumber
              const phoneNumber = chatId.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
              const isGroup = chatId.endsWith('@g.us') || phoneNumber.includes('-');

              // Nome do contato
              const contactName = chat.name || chat.pushName || chat.notify || (isGroup ? 'Grupo WhatsApp' : phoneNumber);

              // 4. Criar/atualizar contato
              let contact = await database.contact.findUnique({
                where: { phoneNumber },
              });

              if (!contact) {
                contact = await database.contact.create({
                  data: {
                    phoneNumber,
                    name: contactName,
                    verifiedName: chat.verifiedName || null,
                    profilePicUrl: chat.profilePicUrl || null,
                    // isGroup é indicado pelo formato do phoneNumber (termina em @g.us)
                  },
                });
                console.log(`[ChatsController.sync] Created contact: ${phoneNumber}`);
              } else if (contactName && contact.name !== contactName) {
                contact = await database.contact.update({
                  where: { id: contact.id },
                  data: {
                    name: contactName,
                    verifiedName: chat.verifiedName || contact.verifiedName,
                    profilePicUrl: chat.profilePicUrl || contact.profilePicUrl,
                  },
                });
              }

              // 5. Criar/atualizar sessão de chat
              const existingSession = await database.chatSession.findFirst({
                where: {
                  connectionId: instanceId,
                  contactId: contact.id,
                },
              });

              if (!existingSession) {
                // Criar nova sessão
                const lastMessageAt = chat.lastMessageAt
                  ? new Date(chat.lastMessageAt)
                  : chat.conversationTimestamp
                  ? new Date(chat.conversationTimestamp * 1000)
                  : new Date();

                await database.chatSession.create({
                  data: {
                    connectionId: instanceId,
                    contactId: contact.id,
                    organizationId: instance.organizationId,
                    status: chat.archived ? 'CLOSED' : 'ACTIVE',
                    aiEnabled: false, // Default: atendimento humano
                    lastMessageAt,
                    createdAt: lastMessageAt,
                  },
                });
                created++;
                console.log(`[ChatsController.sync] Created session for: ${phoneNumber}`);
              } else {
                // Atualizar timestamp se necessário
                const newTimestamp = chat.lastMessageAt
                  ? new Date(chat.lastMessageAt)
                  : chat.conversationTimestamp
                  ? new Date(chat.conversationTimestamp * 1000)
                  : null;

                if (newTimestamp && newTimestamp > existingSession.lastMessageAt) {
                  await database.chatSession.update({
                    where: { id: existingSession.id },
                    data: { lastMessageAt: newTimestamp },
                  });
                }
                updated++;
              }
            } catch (chatError: any) {
              console.error(`[ChatsController.sync] Error processing chat:`, chatError.message);
              skipped++;
            }
          }

          // 6. Invalidar cache
          try {
            const cachePattern = `chats:*:${instanceId}:*`;
            // Note: igniter.store may not support pattern deletion, clear specific keys
            await igniter.store.delete(`chats:all:${userId}:${instanceId}:*`);
          } catch {
            // Cache clear error - non-critical
          }

          const result = {
            success: true,
            totalFromUazapi: uazapiChats.length,
            created,
            updated,
            skipped,
            message: `Sync completo: ${created} criados, ${updated} atualizados, ${skipped} ignorados`,
          };

          console.log('[ChatsController.sync] Sync complete:', result);

          return response.success(result);
        } catch (error: any) {
          console.error('[ChatsController.sync] Sync error:', error);
          return response.badRequest(`Erro no sync: ${error.message}`);
        }
      },
    }),

    /**
     * POST /api/v1/chats/:chatId/block
     */
    block: igniter.mutation({
      path: '/:chatId/block',
      method: 'POST',
      body: z.object({
        instanceId: z.string().uuid(),
        block: z.boolean().default(true),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { chatId } = request.params as { chatId: string };
        const { instanceId, block } = request.body;

        const instance = await database.connection.findFirst({
          where: {
            id: instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');
        if (!instance.uazapiToken) {
          return response.badRequest('Instância sem token configurado');
        }

        const result = await uazapiService.blockContact(instance.uazapiToken, chatId, block);
        if (!result.success) {
          return response.badRequest(result.error || `Erro ao ${block ? 'bloquear' : 'desbloquear'}`);
        }
        return response.success({ message: block ? 'Bloqueado' : 'Desbloqueado' });
      },
    }),
  },
});
