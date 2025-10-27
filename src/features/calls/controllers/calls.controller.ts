/**
 * Calls Controller
 * Gerenciamento de chamadas do WhatsApp
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { uazService } from '@/lib/uaz/uaz.service';
import { database } from '@/services/database';
import { logger } from '@/services/logger';

/**
 * Schema para fazer chamada
 */
const makeCallSchema = z.object({
  instanceId: z.string().uuid('ID da instância inválido'),
  number: z.string()
    .min(10, 'Número deve ter no mínimo 10 dígitos')
    .regex(/^\d+@s\.whatsapp\.net$|^\d+$/, 'Formato de número inválido'),
});

/**
 * Schema para rejeitar chamada
 */
const rejectCallSchema = z.object({
  instanceId: z.string().uuid('ID da instância inválido'),
  callId: z.string().min(1, 'ID da chamada é obrigatório'),
});

/**
 * Schema para listar histórico de chamadas
 */
const listCallsSchema = z.object({
  instanceId: z.string().uuid('ID da instância inválido'),
  status: z.enum(['INCOMING', 'OUTGOING', 'MISSED', 'REJECTED']).optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
});

export const callsController = igniter.controller({
  name: 'calls',
  description: 'Gerenciamento de chamadas do WhatsApp',

  actions: {
    /**
     * POST /calls/make
     * Fazer chamada para um contato
     *
     * @example
     * {
     *   "instanceId": "uuid",
     *   "number": "5511999999999@s.whatsapp.net"
     * }
     */
    make: igniter.mutation({
      body: makeCallSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { instanceId, number } = request.body;

        try {
          // 1. Buscar instância e verificar permissão
          const instance = await database.instance.findUnique({
            where: { id: instanceId },
            include: { organization: true },
          });

          if (!instance) {
            return response.notFound('Instância não encontrada');
          }

          if (user.role !== 'admin' && instance.organizationId !== user.currentOrgId) {
            return response.forbidden('Acesso negado a esta instância');
          }

          if (instance.status !== 'CONNECTED') {
            return response.badRequest('Instância não está conectada');
          }

          // 2. Normalizar número para formato WhatsApp
          const normalizedNumber = number.includes('@')
            ? number
            : `${number}@s.whatsapp.net`;

          // 3. Fazer chamada via UAZ API
          const callResult = await uazService.makeCall(
            instance.token,
            normalizedNumber
          );

          // 4. Registrar chamada no banco
          const phoneNumber = normalizedNumber.replace('@s.whatsapp.net', '');

          // Buscar ou criar contato
          const contact = await database.contact.upsert({
            where: {
              phoneNumber_organizationId: {
                phoneNumber,
                organizationId: instance.organizationId,
              },
            },
            create: {
              phoneNumber,
              name: phoneNumber,
              organizationId: instance.organizationId,
            },
            update: {},
          });

          // Registrar chamada
          const call = await database.call.create({
            data: {
              instanceId: instance.id,
              contactId: contact.id,
              organizationId: instance.organizationId,
              direction: 'OUTGOING',
              status: 'INITIATED',
              initiatedBy: user.id,
              startedAt: new Date(),
            },
          });

          logger.info('[Calls] Chamada iniciada', {
            callId: call.id,
            instanceId,
            number: phoneNumber,
            userId: user.id,
          });

          return response.success({
            message: 'Chamada iniciada com sucesso',
            call: {
              id: call.id,
              instanceId: instance.id,
              contactId: contact.id,
              direction: call.direction,
              status: call.status,
              startedAt: call.startedAt,
            },
            uazResponse: callResult,
          });
        } catch (error) {
          logger.error('[Calls] Erro ao fazer chamada', {
            error,
            instanceId,
            number,
          });

          return response.error('Erro ao fazer chamada', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * POST /calls/reject
     * Rejeitar chamada recebida
     *
     * @example
     * {
     *   "instanceId": "uuid",
     *   "callId": "call-id-from-webhook"
     * }
     */
    reject: igniter.mutation({
      body: rejectCallSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { instanceId, callId } = request.body;

        try {
          // 1. Buscar instância
          const instance = await database.instance.findUnique({
            where: { id: instanceId },
          });

          if (!instance) {
            return response.notFound('Instância não encontrada');
          }

          if (user.role !== 'admin' && instance.organizationId !== user.currentOrgId) {
            return response.forbidden('Acesso negado a esta instância');
          }

          if (instance.status !== 'CONNECTED') {
            return response.badRequest('Instância não está conectada');
          }

          // 2. Rejeitar chamada via UAZ API
          const rejectResult = await uazService.rejectCall(
            instance.token,
            callId
          );

          // 3. Atualizar status da chamada no banco (se existir)
          const call = await database.call.findFirst({
            where: {
              externalId: callId,
              instanceId: instance.id,
            },
          });

          if (call) {
            await database.call.update({
              where: { id: call.id },
              data: {
                status: 'REJECTED',
                endedAt: new Date(),
              },
            });
          }

          logger.info('[Calls] Chamada rejeitada', {
            callId,
            instanceId,
            userId: user.id,
          });

          return response.success({
            message: 'Chamada rejeitada com sucesso',
            callId,
            uazResponse: rejectResult,
          });
        } catch (error) {
          logger.error('[Calls] Erro ao rejeitar chamada', {
            error,
            instanceId,
            callId,
          });

          return response.error('Erro ao rejeitar chamada', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * GET /calls/list
     * Listar histórico de chamadas
     *
     * @query instanceId - ID da instância
     * @query status - Filtrar por status (opcional)
     * @query page - Número da página (padrão: 1)
     * @query limit - Itens por página (padrão: 20, máx: 100)
     */
    list: igniter.query({
      query: listCallsSchema,
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { instanceId, status, page, limit } = request.query;

        try {
          // 1. Verificar permissão
          const instance = await database.instance.findUnique({
            where: { id: instanceId },
          });

          if (!instance) {
            return response.notFound('Instância não encontrada');
          }

          if (user.role !== 'admin' && instance.organizationId !== user.currentOrgId) {
            return response.forbidden('Acesso negado a esta instância');
          }

          // 2. Buscar chamadas com paginação
          const where = {
            instanceId,
            ...(status && { status }),
          };

          const [calls, total] = await Promise.all([
            database.call.findMany({
              where,
              include: {
                contact: {
                  select: {
                    id: true,
                    name: true,
                    phoneNumber: true,
                    profilePicture: true,
                  },
                },
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: { startedAt: 'desc' },
              skip: (page - 1) * limit,
              take: limit,
            }),
            database.call.count({ where }),
          ]);

          const totalPages = Math.ceil(total / limit);

          return response.success({
            calls,
            pagination: {
              page,
              limit,
              total,
              totalPages,
            },
          });
        } catch (error) {
          logger.error('[Calls] Erro ao listar chamadas', {
            error,
            instanceId,
          });

          return response.error('Erro ao listar chamadas', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * GET /calls/:callId
     * Buscar detalhes de uma chamada específica
     */
    get: igniter.query({
      path: '/:callId',
      params: z.object({
        callId: z.string().uuid('ID da chamada inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { callId } = request.params;

        try {
          const call = await database.call.findUnique({
            where: { id: callId },
            include: {
              contact: {
                select: {
                  id: true,
                  name: true,
                  phoneNumber: true,
                  profilePicture: true,
                },
              },
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              instance: {
                select: {
                  id: true,
                  name: true,
                  organizationId: true,
                },
              },
            },
          });

          if (!call) {
            return response.notFound('Chamada não encontrada');
          }

          if (user.role !== 'admin' && call.instance.organizationId !== user.currentOrgId) {
            return response.forbidden('Acesso negado a esta chamada');
          }

          return response.success({ call });
        } catch (error) {
          logger.error('[Calls] Erro ao buscar chamada', {
            error,
            callId,
          });

          return response.error('Erro ao buscar chamada', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),
  },
});
