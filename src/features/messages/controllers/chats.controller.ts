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

const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || process.env.UAZAPI_URL || 'https://quayer.uazapi.com';

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
                  const sessionOrgId = instance.organizationId;
                  await database.chatSession.upsert({
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
                  }).catch(async (e) => {
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
                    } else {
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
            };
          };

          return response.success({
            chats: sessions.map(mapSessionToChat),
            pagination: {
              total,
              limit,
              offset,
              hasMore: offset + limit < total,
            },
          });

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

        try {
          await uazapiService.markAsRead(instance.uazapiToken, body.chatId);
          return response.success({ message: 'Chat marcado como lido' });
        } catch (error) {
          // Fallback se helper nao existir
          try {
            await fetch(`${UAZAPI_BASE_URL}/chat/mark-read`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', token: instance.uazapiToken },
              body: JSON.stringify({ chatId: body.chatId }),
            });
            return response.success({ message: 'Chat marcado como lido' });
          } catch (e) {
            return response.badRequest('Erro ao marcar chat como lido');
          }
        }
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

        try {
          const uazResponse = await fetch(`${UAZAPI_BASE_URL}/chat/archive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token: instance.uazapiToken },
            body: JSON.stringify({ chatId, archive: true }),
          });

          if (!uazResponse.ok) throw new Error('Falha na API UAZapi');
          return response.success({ message: 'Chat arquivado com sucesso' });
        } catch (error) {
          return response.badRequest('Erro ao arquivar chat');
        }
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

        try {
          const uazResponse = await fetch(`${UAZAPI_BASE_URL}/chat/delete`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', token: instance.uazapiToken },
            body: JSON.stringify({ chatId }),
          });

          if (!uazResponse.ok) throw new Error('Falha na API UAZapi');

          await database.chatSession.deleteMany({
            where: {
              connectionId: instanceId,
              contact: { phoneNumber: chatId.replace('@s.whatsapp.net', '').replace('@g.us', '') },
            },
          });

          return response.success({ message: 'Chat deletado com sucesso' });
        } catch (error) {
          return response.badRequest('Erro ao deletar chat');
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

        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organization: { users: { some: { userId } } },
          },
        });

        if (!instance) return response.notFound('Instância não encontrada');
        try {
          const uazResponse = await fetch(`${UAZAPI_BASE_URL}/contact/${block ? 'block' : 'unblock'}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token: instance.uazapiToken! },
            body: JSON.stringify({ number: chatId }),
          });

          if (!uazResponse.ok) throw new Error('Falha na API UAZapi');
          return response.success({ message: block ? 'Bloqueado' : 'Desbloqueado' });
        } catch (error) {
          return response.badRequest(`Erro ao ${block ? 'bloquear' : 'desbloquear'}`);
        }
      },
    }),
  },
});
