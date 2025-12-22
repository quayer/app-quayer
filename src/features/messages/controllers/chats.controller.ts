/**
 * Chats Controller
 * Gerenciamento de conversas/chats via UAZapi
 */

import { igniter } from '@/igniter';
import { database } from '@/services/database';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { listChatsSchema, markAsReadSchema } from '../messages.schemas';
import { z } from 'zod';
import { ConnectionStatus } from '@prisma/client';
import { uazapiService } from '@/lib/api/uazapi.service';

/**
 * Cache TTL para listagem de chats (em segundos)
 * TTL curto para manter dados frescos, mas reduzir carga no banco
 */
const CHATS_CACHE_TTL = 15; // 15 segundos

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
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organization: {
              users: {
                some: { userId: userId },
              },
            },
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
          const now = new Date();
          if (query.attendanceType === 'ai') {
            // Sessões com IA ativa: aiEnabled = true E (aiBlockedUntil é null OU já expirou)
            where.AND = [
              ...(where.AND || []),
              { aiEnabled: true },
              {
                OR: [
                  { aiBlockedUntil: null },
                  { aiBlockedUntil: { lt: now } }
                ]
              }
            ];
          } else if (query.attendanceType === 'human') {
            // Sessões com humano: aiEnabled = false OU aiBlockedUntil ainda não expirou
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

          // Lógica de Sync (Função isolada)
          const runSync = async () => {
            if (!instance.uazapiToken || instance.status !== ConnectionStatus.CONNECTED) return false;

            try {
              console.log('[ChatsController] Iniciando sync brutal com UAZapi...');
              const uazChatsResponse = await uazapiService.findChats(instance.uazapiToken);
              const rawData = uazChatsResponse.data;
              const uazChats = Array.isArray(rawData) ? rawData : (rawData as any)?.chats || [];

              if (Array.isArray(uazChats) && uazChats.length > 0) {
                console.log(`[ChatsController] Processando ${uazChats.length} chats...`);

                for (const chat of uazChats) {
                  const phoneNumber = chat.id || chat.id?._serialized || chat.chatId;
                  if (!phoneNumber) continue;

                  const ts = Number(chat.lastMsgTimestamp);
                  const lastMessageAt = !isNaN(ts) && ts > 0 ? new Date(ts * 1000) : new Date();

                  const contactData = {
                    name: chat.name || chat.formattedTitle || phoneNumber,
                    profilePicUrl: chat.imgUrl || chat.picUrl || chat.contact?.profilePicUrl,
                    verifiedName: chat.pushname || chat.name,
                    isBusiness: chat.isBusiness || false
                  };

                  // Upsert Contact
                  const contact = await database.contact.upsert({
                    where: { phoneNumber },
                    create: {
                      phoneNumber,
                      name: contactData.name,
                      profilePicUrl: contactData.profilePicUrl,
                      verifiedName: contactData.verifiedName,
                      isBusiness: contactData.isBusiness,
                      organizationId: instance.organizationId,
                      source: instance.id
                    },
                    update: {
                      name: contactData.name,
                      profilePicUrl: contactData.profilePicUrl,
                      verifiedName: contactData.verifiedName,
                      // Não sobrescreve organizationId se já existe
                    }
                  });

                  // Upsert ChatSession
                  const sessionOrgId = instance.organizationId ?? undefined;
                  await (database.chatSession.upsert as any)({
                    where: {
                      connectionId_contactId: { // Check composite unique constraint if exists, otherwise assume manual check logic if unique constraint is missing
                        connectionId: instance.id,
                        contactId: contact.id
                      }
                    },
                    create: {
                      connectionId: instance.id,
                      contactId: contact.id,
                      organizationId: sessionOrgId,
                      status: 'ACTIVE',
                      lastMessageAt,
                      customerJourney: 'new'
                    },
                    update: {
                      lastMessageAt
                    }
                  }).catch(async (_e: unknown) => {
                    // Fallback se unique key não existir como esperado (Prisma às vezes trick)
                    // Tentativa manual se upsert falhar por constraint name mismatch
                    const existing = await database.chatSession.findFirst({
                      where: { connectionId: instance.id, contactId: contact.id }
                    });
                    if (existing) {
                      await database.chatSession.update({
                        where: { id: existing.id },
                        data: { lastMessageAt }
                      });
                    } else if (sessionOrgId) {
                      await database.chatSession.create({
                        data: {
                          connectionId: instance.id,
                          contactId: contact.id,
                          organizationId: sessionOrgId,
                          status: 'ACTIVE',
                          lastMessageAt
                        }
                      });
                    }
                  });
                }
                console.log('[ChatsController] Sync finalizado.');
                return true;
              }
            } catch (err) {
              console.error('[ChatsController] Erro no sync:', err);
            }
            return false;
          };

          // Estratégia de Sync
          if (total === 0 && instance.status === ConnectionStatus.CONNECTED) {
            // Blocking Sync
            await runSync();
            // Refetch
            const [newSessions, newTotal] = await fetchLocalChats();
            sessions = newSessions;
            total = newTotal;
          } else if (instance.status === ConnectionStatus.CONNECTED) {
            // Background Sync
            setImmediate(() => runSync());
          }

          // Mapper
          const mapSessionToChat = (session: any) => {
            const lastMsg = session.messages[0];
            const isGroup = session.contact.phoneNumber.endsWith('@g.us') || session.contact.isBusiness;

            return {
              // Session ID for proper identification
              id: session.id,
              wa_chatid: session.contact.phoneNumber.includes('@') ? session.contact.phoneNumber : `${session.contact.phoneNumber}@s.whatsapp.net`,
              wa_name: session.contact.name || session.contact.phoneNumber,
              wa_profilePicUrl: session.contact.profilePicUrl,
              wa_isGroup: isGroup,
              wa_lastMsgTimestamp: session.lastMessageAt.getTime(),
              wa_lastMsgBody: lastMsg?.content || null,
              wa_unreadCount: 0,
              wa_isPinned: false,
              wa_isArchived: session.status === 'CLOSED',
              wa_isMuted: false,
              lead_status: session.customerJourney || null,
              lead_source: session.leadSource || 'whatsapp',
              created_at: session.createdAt.toISOString(),
              updated_at: session.updatedAt.toISOString(),
              // Campos de status e IA
              status: session.status,
              aiEnabled: session.aiEnabled ?? true,
              aiBlockedUntil: session.aiBlockedUntil?.toISOString() ?? null,
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

        const instance = await database.instance.findFirst({
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

        const instance = await database.instance.findFirst({
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

        const instance = await database.instance.findFirst({
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
        return response.success({ message: 'Chat arquivado com sucesso' });
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

        const instance = await database.instance.findFirst({
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

        const instance = await database.instance.findFirst({
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
