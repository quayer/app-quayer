/**
 * Webhooks Receiver Controller
 *
 * Recebe webhooks do UAZ API, enriquece dados e reenvia para webhooks dos clientes
 */

import { igniter } from '@/igniter';
import { z } from 'zod';
import { webhooksService } from './webhooks.service';
import { database } from '@/services/database';
import { logger } from '@/services/logger';
import { openaiMediaProcessor } from '@/lib/media-processor/openai-media-processor.service';
import { messageConcatenator } from '@/lib/concatenation/message-concatenator.service';

/**
 * Schema do payload que vem do UAZ
 * Baseado na documentação: https://docs.uazapi.com/webhooks
 */
const uazWebhookPayloadSchema = z.object({
  event: z.string(), // 'messages', 'connection', 'presence', etc
  instance: z.object({
    name: z.string(),
    id: z.string().optional(),
  }).optional(),
  data: z.any(), // Payload varia por tipo de evento
  server_url: z.string().optional(),
  date_time: z.string().optional(),
  sender: z.string().optional(),
});

export const webhooksReceiverController = igniter.controller({
  name: 'webhooks-receiver',
  path: '/webhooks/uaz',
  description: 'Recebe webhooks do UAZ API e processa',

  actions: {
    /**
     * POST /webhooks/uaz/receive/:instanceId
     *
     * Endpoint que o UAZ API deve chamar quando houver eventos
     *
     * Fluxo:
     * 1. UAZ envia webhook para este endpoint
     * 2. Validamos e enriquecemos os dados
     * 3. Reenviamos para os webhooks configurados pelo cliente
     */
    receive: igniter.mutation({
      path: '/receive/:instanceId',
      params: z.object({
        instanceId: z.string().uuid('ID da instância inválido'),
      }),
      body: uazWebhookPayloadSchema,
      handler: async ({ request, response, context }) => {
        const { instanceId } = request.params;
        const uazPayload = request.body;

        logger.info('[WebhookReceiver] Webhook recebido do UAZ', {
          instanceId,
          event: uazPayload.event,
          sender: uazPayload.sender,
        });

        try {
          // 1. Buscar instância no banco
          const instance = await database.instance.findUnique({
            where: { id: instanceId },
            include: {
              organization: true,
            },
          });

          if (!instance) {
            logger.warn('[WebhookReceiver] Instância não encontrada', { instanceId });
            return response.notFound('Instância não encontrada');
          }

          // 2. Enriquecer payload com dados da Quayer
          const enrichedPayload = await enrichWebhookData(uazPayload, instance);

          // 3. Processar baseado no tipo de evento
          await processEventByType(uazPayload.event, enrichedPayload, instance);

          // 4. Trigger webhooks configurados pelo cliente
          await webhooksService.trigger(
            instance.organizationId,
            uazPayload.event,
            enrichedPayload
          );

          logger.info('[WebhookReceiver] Webhook processado com sucesso', {
            instanceId,
            event: uazPayload.event,
          });

          return response.success({
            message: 'Webhook processado com sucesso',
            event: uazPayload.event,
          });
        } catch (error) {
          logger.error('[WebhookReceiver] Erro ao processar webhook', {
            error,
            instanceId,
            event: uazPayload.event,
          });

          return response.error('Erro ao processar webhook', {
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        }
      },
    }),

    /**
     * GET /webhooks/uaz/test/:instanceId
     *
     * Endpoint de teste para simular webhook do UAZ
     */
    test: igniter.query({
      path: '/test/:instanceId',
      params: z.object({
        instanceId: z.string().uuid(),
      }),
      handler: async ({ request, response }) => {
        const { instanceId } = request.params;

        // Payload de teste simulando mensagem recebida
        const testPayload = {
          event: 'messages',
          instance: {
            name: 'test-instance',
            id: instanceId,
          },
          data: {
            key: {
              remoteJid: '5511999999999@s.whatsapp.net',
              fromMe: false,
              id: 'TEST_MESSAGE_ID',
            },
            message: {
              conversation: 'Mensagem de teste do webhook',
            },
            messageType: 'text',
            messageTimestamp: Date.now(),
            pushName: 'Teste',
          },
          server_url: 'https://test.uazapi.com',
          date_time: new Date().toISOString(),
          sender: '5511999999999@s.whatsapp.net',
        };

        logger.info('[WebhookReceiver] Teste de webhook iniciado', { instanceId });

        return response.success({
          message: 'Webhook de teste gerado',
          payload: testPayload,
          instructions: `
            Use este payload para testar seu endpoint:

            curl -X POST http://localhost:3000/api/v1/webhooks/uaz/receive/${instanceId} \\
              -H "Content-Type: application/json" \\
              -d '${JSON.stringify(testPayload, null, 2)}'
          `,
        });
      },
    }),
  },
});

/**
 * Enriquece payload do UAZ com dados da Quayer
 */
async function enrichWebhookData(uazPayload: any, instance: any) {
  const enriched = {
    // Dados originais do UAZ
    uaz: uazPayload,

    // Metadados Quayer
    quayer: {
      instanceId: instance.id,
      instanceName: instance.name,
      organizationId: instance.organizationId,
      organizationName: instance.organization?.name,
      receivedAt: new Date().toISOString(),
    },

    // Dados contextuais
    context: {} as any,
  };

  // Se for mensagem, buscar dados da sessão e contato
  if (uazPayload.event === 'messages' && uazPayload.sender) {
    try {
      const phoneNumber = uazPayload.sender.replace('@s.whatsapp.net', '');

      // Buscar contato
      const contact = await database.contact.findFirst({
        where: {
          phoneNumber,
          organizationId: instance.organizationId,
        },
        include: {
          tabulation: true,
        },
      });

      if (contact) {
        enriched.context.contact = {
          id: contact.id,
          name: contact.name,
          phoneNumber: contact.phoneNumber,
          tabulation: contact.tabulation?.name,
        };
      }

      // Buscar sessão ativa
      const session = await database.chatSession.findFirst({
        where: {
          instanceId: instance.id,
          contact: {
            phoneNumber,
          },
          status: 'ACTIVE',
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (session) {
        enriched.context.session = {
          id: session.id,
          status: session.status,
          assignedTo: session.assignedUser?.name,
          startedAt: session.startedAt,
        };
      }
    } catch (error) {
      logger.error('[WebhookReceiver] Erro ao enriquecer contexto', { error });
    }
  }

  return enriched;
}

/**
 * Processa evento baseado no tipo
 */
async function processEventByType(event: string, payload: any, instance: any) {
  switch (event) {
    case 'messages':
      await processMessageEvent(payload, instance);
      break;

    case 'connection':
      await processConnectionEvent(payload, instance);
      break;

    case 'presence':
      await processPresenceEvent(payload, instance);
      break;

    case 'call':
      await processCallEvent(payload, instance);
      break;

    // Adicionar mais tipos conforme necessário
    default:
      logger.debug('[WebhookReceiver] Evento não processado especificamente', { event });
  }
}

/**
 * Processa evento de mensagem
 */
async function processMessageEvent(payload: any, instance: any) {
  try {
    const messageData = payload.uaz.data;
    const sender = payload.uaz.sender;

    if (!sender || !messageData) {
      return;
    }

    const phoneNumber = sender.replace('@s.whatsapp.net', '');

    // Criar ou atualizar contato
    const contact = await database.contact.upsert({
      where: {
        phoneNumber_organizationId: {
          phoneNumber,
          organizationId: instance.organizationId,
        },
      },
      create: {
        phoneNumber,
        name: messageData.pushName || phoneNumber,
        organizationId: instance.organizationId,
      },
      update: {
        name: messageData.pushName || undefined,
        lastMessageAt: new Date(),
      },
    });

    // Criar mensagem no banco (se ainda não existe)
    const messageId = messageData.key?.id;
    if (messageId) {
      const existingMessage = await database.message.findFirst({
        where: {
          externalId: messageId,
          organizationId: instance.organizationId,
        },
      });

      if (!existingMessage) {
        // Buscar ou criar sessão
        let session = await database.chatSession.findFirst({
          where: {
            contactId: contact.id,
            instanceId: instance.id,
            status: 'ACTIVE',
          },
        });

        if (!session) {
          session = await database.chatSession.create({
            data: {
              contactId: contact.id,
              instanceId: instance.id,
              organizationId: instance.organizationId,
              status: 'ACTIVE',
              startedAt: new Date(),
            },
          });
        }

        // Extrair conteúdo da mensagem
        let messageContent = messageData.message?.conversation ||
                           messageData.message?.extendedTextMessage?.text ||
                           '[Mídia]';

        const messageType = messageData.messageType || 'text';

        // 🎯 PROCESSAR MÍDIA AUTOMATICAMENTE COM OPENAI
        const mediaUrl = messageData.message?.imageMessage?.url ||
                        messageData.message?.videoMessage?.url ||
                        messageData.message?.audioMessage?.url ||
                        messageData.message?.documentMessage?.url;

        const mimeType = messageData.message?.imageMessage?.mimetype ||
                        messageData.message?.videoMessage?.mimetype ||
                        messageData.message?.audioMessage?.mimetype ||
                        messageData.message?.documentMessage?.mimetype;

        // Se há mídia, processar com OpenAI
        if (mediaUrl && mimeType) {
          try {
            logger.info('[WebhookReceiver] Processando mídia com OpenAI', {
              messageId,
              mimeType,
              mediaUrl,
            });

            const processResult = await openaiMediaProcessor.processMedia({
              mediaUrl,
              mimeType,
              fileName: messageData.message?.documentMessage?.fileName,
            });

            // ✅ CAMPO TEXT JÁ PREENCHIDO AUTOMATICAMENTE!
            messageContent = processResult.text;

            logger.info('[WebhookReceiver] Mídia processada com sucesso', {
              messageId,
              type: processResult.type,
              textLength: processResult.text.length,
              cached: processResult.metadata.cached,
              processingTimeMs: processResult.metadata.processingTimeMs,
            });
          } catch (error) {
            logger.error('[WebhookReceiver] Erro ao processar mídia', {
              error,
              messageId,
              mediaUrl,
            });
            // Fallback: usar caption ou indicador de mídia
            messageContent = messageData.message?.imageMessage?.caption ||
                           messageData.message?.videoMessage?.caption ||
                           `[${mimeType.split('/')[0].toUpperCase()}]`;
          }
        }

        // 🔗 VERIFICAR CONCATENAÇÃO (somente para mensagens INBOUND)
        const isFromMe = messageData.key?.fromMe || false;

        if (!isFromMe) {
          const shouldConcat = await messageConcatenator.shouldConcatenate({
            sender,
            sessionId: session.id,
            messageType,
          });

          if (shouldConcat.shouldConcat) {
            // Adicionar ao bloco de concatenação (NÃO salvar ainda)
            await messageConcatenator.addToBlock({
              blockId: shouldConcat.blockId,
              sender,
              sessionId: session.id,
              message: {
                id: messageId!,
                content: messageContent,
                type: messageType,
                timestamp: new Date(messageData.messageTimestamp * 1000 || Date.now()),
              },
            });

            logger.info('[WebhookReceiver] Mensagem adicionada ao bloco de concatenação', {
              messageId,
              blockId: shouldConcat.blockId,
              contactId: contact.id,
            });

            // NÃO criar mensagem individual - será criada quando bloco finalizar
            return;
          } else {
            // Iniciar novo bloco
            await messageConcatenator.addToBlock({
              sender,
              sessionId: session.id,
              message: {
                id: messageId!,
                content: messageContent,
                type: messageType,
                timestamp: new Date(messageData.messageTimestamp * 1000 || Date.now()),
              },
            });

            logger.info('[WebhookReceiver] Novo bloco de concatenação iniciado', {
              messageId,
              contactId: contact.id,
            });

            // NÃO criar mensagem individual - aguardar timeout
            return;
          }
        }

        // Criar mensagem com texto processado (apenas para mensagens OUTBOUND)
        await database.message.create({
          data: {
            sessionId: session.id,
            type: messageType,
            direction: isFromMe ? 'OUTBOUND' : 'INBOUND',
            author: sender,
            content: messageContent, // ✅ JÁ TEM O TEXTO DA MÍDIA!
            status: 'DELIVERED',
            externalId: messageId,
            organizationId: instance.organizationId,
          },
        });

        logger.info('[WebhookReceiver] Mensagem salva no banco', {
          messageId,
          contactId: contact.id,
          hasMedia: !!mediaUrl,
          contentLength: messageContent.length,
          isFromMe,
        });
      }
    }
  } catch (error) {
    logger.error('[WebhookReceiver] Erro ao processar mensagem', { error });
  }
}

/**
 * Processa evento de conexão
 */
async function processConnectionEvent(payload: any, instance: any) {
  try {
    const connectionData = payload.uaz.data;

    if (connectionData.state) {
      // Atualizar status da instância
      await database.instance.update({
        where: { id: instance.id },
        data: {
          status: connectionData.state.toUpperCase(),
        },
      });

      logger.info('[WebhookReceiver] Status da instância atualizado', {
        instanceId: instance.id,
        newStatus: connectionData.state,
      });
    }
  } catch (error) {
    logger.error('[WebhookReceiver] Erro ao processar conexão', { error });
  }
}

/**
 * Processa evento de presença
 */
async function processPresenceEvent(payload: any, instance: any) {
  // TODO: Implementar lógica de presença
  logger.debug('[WebhookReceiver] Evento de presença recebido', {
    instanceId: instance.id,
    data: payload.uaz.data,
  });
}

/**
 * Processa evento de chamada
 */
async function processCallEvent(payload: any, instance: any) {
  // TODO: Implementar lógica de chamadas
  logger.debug('[WebhookReceiver] Evento de chamada recebido', {
    instanceId: instance.id,
    data: payload.uaz.data,
  });
}
