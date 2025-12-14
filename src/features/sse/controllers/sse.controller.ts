/**
 * SSE (Server-Sent Events) Controller
 * Streaming de eventos em tempo real via Redis Pub/Sub
 */

import { igniter } from '@/igniter';
import { authProcedure } from '@/features/auth/procedures/auth.procedure';
import { database } from '@/services/database';
import { sseEvents, type SSEEventPayload } from '@/lib/events/sse-events.service';

export const sseController = igniter.controller({
  name: 'sse',
  path: '/sse',
  description: 'Server-Sent Events para streaming de dados em tempo real via Redis Pub/Sub',

  actions: {
    /**
     * GET /sse/instance/:instanceId
     * Conectar ao stream SSE de uma instância
     *
     * Eventos enviados via Redis Pub/Sub:
     * - message.received: Nova mensagem recebida
     * - message.sent: Mensagem enviada
     * - status.changed: Status da instância mudou
     */
    streamInstance: igniter.query({
      path: '/instance/:instanceId',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { instanceId } = request.params as { instanceId: string };

        // 1. Verificar se instância existe e pertence à organização do usuário
        const connection = await database.connection.findUnique({
          where: { id: instanceId },
        });

        if (!connection) {
          return response.notFound('Instância não encontrada');
        }

        if (user.role !== 'admin' && connection.organizationId !== user.currentOrgId) {
          return response.forbidden('Acesso negado a esta instância');
        }

        // 2. Configurar headers SSE
        const headers = new Headers({
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        });

        // 3. Criar ReadableStream para SSE com Redis Pub/Sub
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            const sendEvent = (event: string, data: any) => {
              try {
                const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(encoder.encode(message));
              } catch (error) {
                console.error('[SSE] Error sending event:', error);
              }
            };

            // Evento inicial de conexão
            sendEvent('connected', {
              instanceId,
              timestamp: new Date().toISOString(),
              message: 'Conectado ao stream SSE via Redis Pub/Sub',
            });

            // Heartbeat para manter conexão viva
            const heartbeatInterval = setInterval(() => {
              sendEvent('heartbeat', { timestamp: new Date().toISOString() });
            }, 30000);

            // Subscribe to instance-specific channel via Redis
            const channel = `instance:status:${instanceId}`;
            const unsubscribe = await sseEvents.subscribe(channel, (payload: SSEEventPayload) => {
              sendEvent(payload.event, payload.data);
            });

            // Also subscribe to organization events for this instance (if org exists)
            if (connection.organizationId) {
              const orgChannel = sseEvents.getOrgChannel(connection.organizationId);
              await sseEvents.subscribe(orgChannel, (payload: SSEEventPayload) => {
                // Filter events related to this instance
                if (payload.data?.connectionId === instanceId || payload.data?.instanceId === instanceId) {
                  sendEvent(payload.event, payload.data);
                }
              });
            }

            // Note: Cleanup would ideally be triggered by client disconnect
            // For now, heartbeat keeps connection alive
          },
        });

        return new Response(stream, { headers });
      },
    }),

    /**
     * GET /sse/organization/:organizationId
     * Conectar ao stream SSE de toda a organização via Redis Pub/Sub
     */
    streamOrganization: igniter.query({
      path: '/organization/:organizationId',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { organizationId } = request.params as { organizationId: string };

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

        // Criar ReadableStream com Redis Pub/Sub
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            const sendEvent = (event: string, data: any) => {
              try {
                const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(encoder.encode(message));
              } catch (error) {
                console.error('[SSE] Error sending event:', error);
              }
            };

            // Evento inicial
            sendEvent('connected', {
              organizationId,
              timestamp: new Date().toISOString(),
              message: 'Conectado ao stream SSE da organização via Redis Pub/Sub',
            });

            // Heartbeat
            const heartbeatInterval = setInterval(() => {
              sendEvent('heartbeat', { timestamp: new Date().toISOString() });
            }, 30000);

            // Subscribe to organization channel via Redis Pub/Sub
            const unsubscribe = await sseEvents.subscribeToOrg(organizationId, (payload: SSEEventPayload) => {
              sendEvent(payload.event, payload.data);
            });

            // Note: Cleanup handled by stream end
          },
        });

        return new Response(stream, { headers });
      },
    }),

    /**
     * GET /sse/session/:sessionId
     * Conectar ao stream SSE de uma sessão específica via Redis Pub/Sub
     */
    streamSession: igniter.query({
      path: '/session/:sessionId',
      use: [authProcedure({ required: true })],
      handler: async ({ request, response, context }) => {
        const user = context.auth?.session?.user;
        if (!user) {
          return response.unauthorized('Usuário não autenticado');
        }

        const { sessionId } = request.params as { sessionId: string };

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

        // Criar ReadableStream com Redis Pub/Sub
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            const sendEvent = (event: string, data: any) => {
              try {
                const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
                controller.enqueue(encoder.encode(message));
              } catch (error) {
                console.error('[SSE] Error sending event:', error);
              }
            };

            // Evento inicial
            sendEvent('connected', {
              sessionId,
              timestamp: new Date().toISOString(),
              message: 'Conectado ao stream SSE da sessão via Redis Pub/Sub',
            });

            // Heartbeat
            const heartbeatInterval = setInterval(() => {
              sendEvent('heartbeat', { timestamp: new Date().toISOString() });
            }, 30000);

            // Subscribe to session-specific channel via Redis
            const channel = `session:events:${sessionId}`;
            const unsubscribe = await sseEvents.subscribe(channel, (payload: SSEEventPayload) => {
              sendEvent(payload.event, payload.data);
            });

            // Also subscribe to organization events for messages in this session
            const unsubscribeOrg = await sseEvents.subscribeToOrg(session.organizationId, (payload: SSEEventPayload) => {
              // Filter events related to this session
              if (payload.data?.sessionId === sessionId) {
                sendEvent(payload.event, payload.data);
              }
            });

            // Note: Cleanup handled by stream end
          },
        });

        return new Response(stream, { headers });
      },
    }),
  },
});
