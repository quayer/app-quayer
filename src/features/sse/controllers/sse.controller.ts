/**
 * SSE (Server-Sent Events) Controller
 * Streaming de eventos em tempo real
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';

export const sseController = igniter.controller({
  name: 'sse',
  description: 'Server-Sent Events para streaming de dados em tempo real',

  actions: {
    /**
     * GET /sse/instance/:instanceId
     * Conectar ao stream SSE de uma instância
     *
     * Eventos enviados:
     * - message.received: Nova mensagem recebida
     * - message.sent: Mensagem enviada
     * - session.updated: Status da sessão atualizado
     * - instance.status: Status da instância mudou
     */
    streamInstance: igniter.query({
      path: '/instance/:instanceId',
      params: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { instanceId } = request.params;

        // 1. Verificar se instância existe e pertence à organização do usuário
        const instance = await database.instance.findUnique({
          where: { id: instanceId },
        });

        if (!instance) {
          return response.notFound('Instância não encontrada');
        }

        if (user.role !== 'admin' && instance.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta instância');
        }

        // 2. Configurar headers SSE
        const headers = new Headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no', // Nginx support
        });

        // 3. Criar ReadableStream para SSE
        const stream = new ReadableStream({
          async start(controller) {
            // Enviar evento de conexão
            const encoder = new TextEncoder();
            const sendEvent = (event: string, data: any) => {
              const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
              controller.enqueue(encoder.encode(message));
            };

            // Evento inicial de conexão
            sendEvent('connected', {
              instanceId,
              timestamp: new Date().toISOString(),
              message: 'Conectado ao stream SSE',
            });

            // Heartbeat para manter conexão viva
            const heartbeatInterval = setInterval(() => {
              sendEvent('heartbeat', {
                timestamp: new Date().toISOString(),
              });
            }, 30000); // 30 segundos

            // Listener para novos eventos (via Prisma ou Redis Pub/Sub)
            // TODO: Integrar com Redis Pub/Sub quando disponível
            const eventListener = async () => {
              try {
                // Buscar novos eventos para esta instância
                // Por enquanto, apenas mantém a conexão ativa
                // Quando Redis estiver configurado, usar pub/sub aqui
              } catch (error) {
                console.error('[SSE] Erro no listener:', error);
              }
            };

            // Poll a cada 5 segundos para novos eventos
            const pollInterval = setInterval(eventListener, 5000);

            // Cleanup ao fechar conexão
            request.signal?.addEventListener('abort', () => {
              clearInterval(heartbeatInterval);
              clearInterval(pollInterval);
              controller.close();
            });
          },
        });

        // 4. Retornar Response com stream
        return new Response(stream, { headers });
      },
    }),

    /**
     * GET /sse/organization/:organizationId
     * Conectar ao stream SSE de toda a organização
     */
    streamOrganization: igniter.query({
      path: '/organization/:organizationId',
      params: z.object({
        organizationId: z.string().uuid('ID da organização inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { organizationId } = request.params;

        // Verificar permissão
        if (user.role !== 'admin' && user.currentOrgId !== organizationId) {
          return response.forbidden('Acesso negado a esta organização');
        }

        // Configurar headers SSE
        const headers = new Headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        // Criar ReadableStream
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            const sendEvent = (event: string, data: any) => {
              const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
              controller.enqueue(encoder.encode(message));
            };

            // Evento inicial
            sendEvent('connected', {
              organizationId,
              timestamp: new Date().toISOString(),
              message: 'Conectado ao stream SSE da organização',
            });

            // Heartbeat
            const heartbeatInterval = setInterval(() => {
              sendEvent('heartbeat', {
                timestamp: new Date().toISOString(),
              });
            }, 30000);

            // Cleanup
            request.signal?.addEventListener('abort', () => {
              clearInterval(heartbeatInterval);
              controller.close();
            });
          },
        });

        return new Response(stream, { headers });
      },
    }),

    /**
     * GET /sse/session/:sessionId
     * Conectar ao stream SSE de uma sessão específica
     */
    streamSession: igniter.query({
      path: '/session/:sessionId',
      params: z.object({
        sessionId: z.string().uuid('ID da sessão inválido'),
      }),
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { sessionId } = request.params;

        // Verificar sessão
        const session = await database.chatSession.findUnique({
          where: { id: sessionId },
        });

        if (!session) {
          return response.notFound('Sessão não encontrada');
        }

        if (user.role !== 'admin' && session.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta sessão');
        }

        // Configurar headers SSE
        const headers = new Headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        // Criar ReadableStream
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            const sendEvent = (event: string, data: any) => {
              const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
              controller.enqueue(encoder.encode(message));
            };

            // Evento inicial
            sendEvent('connected', {
              sessionId,
              timestamp: new Date().toISOString(),
              message: 'Conectado ao stream SSE da sessão',
            });

            // Heartbeat
            const heartbeatInterval = setInterval(() => {
              sendEvent('heartbeat', {
                timestamp: new Date().toISOString(),
              });
            }, 30000);

            // Cleanup
            request.signal?.addEventListener('abort', () => {
              clearInterval(heartbeatInterval);
              controller.close();
            });
          },
        });

        return new Response(stream, { headers });
      },
    }),
  },
});
