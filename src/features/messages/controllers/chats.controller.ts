/**
 * Chats Controller
 * Gerenciamento de conversas/chats via UAZapi
 */

import { igniter } from '@/igniter';
import { database } from '@/services/database';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { listChatsSchema, markAsReadSchema } from '../messages.schemas';
import { z } from 'zod';
import type { Chat, ChatCounters } from '../messages.interfaces';

const UAZAPI_BASE_URL = process.env.NEXT_PUBLIC_UAZAPI_BASE_URL || 'http://localhost:3000';

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
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const query = listChatsSchema.parse(request.query);

        // Buscar instância e verificar permissão
        const instance = await database.instance.findFirst({
          where: {
            id: query.instanceId,
            organization: {
              users: {
                some: {
                  userId: userId,
                },
              },
            },
          },
        });

        if (!instance) {
          return response.notFound('Instância não encontrada');
        }

        if (instance.status !== 'connected' || !instance.uazToken) {
          return response.badRequest('Instância não está conectada');
        }

        try {
          // Montar filtros para UAZapi
          const filters: any[] = [];

          if (query.search) {
            filters.push({
              column: 'wa_name',
              operator: 'LIKE',
              value: `%${query.search}%`,
            });
          }

          if (query.status === 'unread') {
            filters.push({
              column: 'wa_unreadCount',
              operator: '>',
              value: 0,
            });
          } else if (query.status === 'groups') {
            filters.push({
              column: 'wa_isGroup',
              operator: '=',
              value: true,
            });
          } else if (query.status === 'pinned') {
            filters.push({
              column: 'wa_isPinned',
              operator: '=',
              value: true,
            });
          }

          // Buscar chats via UAZapi
          const uazResponse = await fetch(`${UAZAPI_BASE_URL}/chat/find`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              token: instance.uazToken,
            },
            body: JSON.stringify({
              filters,
              operator: 'AND',
              sort: '-wa_lastMsgTimestamp',
              limit: query.limit,
              offset: query.offset,
            }),
          });

          if (!uazResponse.ok) {
            throw new Error('Erro ao buscar chats na UAZapi');
          }

          const uazData = await uazResponse.json();

          return response.success({
            chats: uazData.chats || [],
            pagination: {
              total: uazData.total || 0,
              limit: query.limit,
              offset: query.offset,
              hasMore: (query.offset + query.limit) < (uazData.total || 0),
            },
          });
        } catch (error) {
          console.error('Erro ao buscar chats:', error);
          return response.serverError('Erro ao buscar conversas');
        }
      },
    }),

    /**
     * GET /api/v1/chats/count
     * Buscar contadores de chats
     */
    count: igniter.query({
      path: '/count',
      method: 'GET',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { instanceId } = request.query as { instanceId: string };

        if (!instanceId) {
          return response.badRequest('instanceId é obrigatório');
        }

        // Buscar instância e verificar permissão
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organization: {
              users: {
                some: {
                  userId: userId,
                },
              },
            },
          },
        });

        if (!instance) {
          return response.notFound('Instância não encontrada');
        }

        if (instance.status !== 'connected' || !instance.uazToken) {
          return response.success({
            total_chats: 0,
            unread_chats: 0,
            groups: 0,
            pinned_chats: 0,
          });
        }

        try {
          // Buscar contadores via UAZapi
          const uazResponse = await fetch(`${UAZAPI_BASE_URL}/chat/count`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              token: instance.uazToken,
            },
          });

          if (!uazResponse.ok) {
            throw new Error('Erro ao buscar contadores na UAZapi');
          }

          const counters: ChatCounters = await uazResponse.json();

          return response.success(counters);
        } catch (error) {
          console.error('Erro ao buscar contadores:', error);
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
     * Marcar chat como lido
     */
    markAsRead: igniter.mutation({
      path: '/mark-read',
      method: 'POST',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const body = markAsReadSchema.parse(request.body);

        // Buscar instância e verificar permissão
        const instance = await database.instance.findFirst({
          where: {
            id: body.instanceId,
            organization: {
              users: {
                some: {
                  userId: userId,
                },
              },
            },
          },
        });

        if (!instance) {
          return response.notFound('Instância não encontrada');
        }

        if (instance.status !== 'connected' || !instance.uazToken) {
          return response.badRequest('Instância não está conectada');
        }

        try {
          // Marcar como lido via UAZapi
          const uazResponse = await fetch(`${UAZAPI_BASE_URL}/chat/mark-read`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              token: instance.uazToken,
            },
            body: JSON.stringify({
              chatId: body.chatId,
            }),
          });

          if (!uazResponse.ok) {
            throw new Error('Erro ao marcar como lido na UAZapi');
          }

          return response.success({ message: 'Chat marcado como lido' });
        } catch (error) {
          console.error('Erro ao marcar como lido:', error);
          return response.serverError('Erro ao marcar chat como lido');
        }
      },
    }),

    /**
     * POST /api/v1/chats/:chatId/archive
     * Arquivar chat
     */
    archive: igniter.mutation({
      path: '/:chatId/archive',
      method: 'POST',
      params: z.object({
        chatId: z.string().min(1, 'chatId é obrigatório'),
      }),
      body: z.object({
        instanceId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { chatId } = request.params as { chatId: string };
        const { instanceId } = request.body;

        // Buscar instância e verificar permissão
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organization: {
              users: {
                some: {
                  userId: userId,
                },
              },
            },
          },
        });

        if (!instance) {
          return response.notFound('Instância não encontrada');
        }

        if (instance.status !== 'connected' || !instance.uazToken) {
          return response.badRequest('Instância não está conectada');
        }

        try {
          // Arquivar chat via UAZapi
          const uazResponse = await fetch(`${UAZAPI_BASE_URL}/chat/archive`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              token: instance.uazToken,
            },
            body: JSON.stringify({
              chatId,
              archive: true,
            }),
          });

          if (!uazResponse.ok) {
            const errorData = await uazResponse.text();
            throw new Error(`Erro ao arquivar chat na UAZapi: ${errorData}`);
          }

          return response.success({ message: 'Chat arquivado com sucesso' });
        } catch (error) {
          console.error('Erro ao arquivar chat:', error);
          return response.serverError('Erro ao arquivar chat');
        }
      },
    }),

    /**
     * DELETE /api/v1/chats/:chatId
     * Deletar chat
     */
    delete: igniter.mutation({
      path: '/:chatId',
      method: 'DELETE',
      params: z.object({
        chatId: z.string().min(1, 'chatId é obrigatório'),
      }),
      body: z.object({
        instanceId: z.string().uuid(),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { chatId } = request.params as { chatId: string };
        const { instanceId } = request.body;

        // Buscar instância e verificar permissão
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organization: {
              users: {
                some: {
                  userId: userId,
                },
              },
            },
          },
        });

        if (!instance) {
          return response.notFound('Instância não encontrada');
        }

        if (instance.status !== 'connected' || !instance.uazToken) {
          return response.badRequest('Instância não está conectada');
        }

        try {
          // Deletar chat via UAZapi
          const uazResponse = await fetch(`${UAZAPI_BASE_URL}/chat/delete`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              token: instance.uazToken,
            },
            body: JSON.stringify({
              chatId,
            }),
          });

          if (!uazResponse.ok) {
            const errorData = await uazResponse.text();
            throw new Error(`Erro ao deletar chat na UAZapi: ${errorData}`);
          }

          // Deletar sessão correspondente no banco de dados (se existir)
          await database.session.deleteMany({
            where: {
              instanceId: instanceId,
              contact: {
                phoneNumber: chatId.replace('@s.whatsapp.net', '').replace('@g.us', ''),
              },
            },
          });

          return response.success({ message: 'Chat deletado com sucesso' });
        } catch (error) {
          console.error('Erro ao deletar chat:', error);
          return response.serverError('Erro ao deletar chat');
        }
      },
    }),

    /**
     * POST /api/v1/chats/:chatId/block
     * Bloquear contato
     */
    block: igniter.mutation({
      path: '/:chatId/block',
      method: 'POST',
      params: z.object({
        chatId: z.string().min(1, 'chatId é obrigatório'),
      }),
      body: z.object({
        instanceId: z.string().uuid(),
        block: z.boolean().default(true),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const userId = context.auth?.session?.user?.id!;
        const { chatId } = request.params as { chatId: string };
        const { instanceId, block } = request.body;

        // Buscar instância e verificar permissão
        const instance = await database.instance.findFirst({
          where: {
            id: instanceId,
            organization: {
              users: {
                some: {
                  userId: userId,
                },
              },
            },
          },
        });

        if (!instance) {
          return response.notFound('Instância não encontrada');
        }

        if (instance.status !== 'connected' || !instance.uazToken) {
          return response.badRequest('Instância não está conectada');
        }

        try {
          // Bloquear/desbloquear contato via UAZapi
          const uazResponse = await fetch(`${UAZAPI_BASE_URL}/contact/${block ? 'block' : 'unblock'}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              token: instance.uazToken,
            },
            body: JSON.stringify({
              number: chatId,
            }),
          });

          if (!uazResponse.ok) {
            const errorData = await uazResponse.text();
            throw new Error(`Erro ao ${block ? 'bloquear' : 'desbloquear'} contato na UAZapi: ${errorData}`);
          }

          const message = block ? 'Contato bloqueado com sucesso' : 'Contato desbloqueado com sucesso';
          return response.success({ message });
        } catch (error) {
          console.error(`Erro ao ${block ? 'bloquear' : 'desbloquear'} contato:`, error);
          return response.serverError(`Erro ao ${block ? 'bloquear' : 'desbloquear'} contato`);
        }
      },
    }),
  },
});
