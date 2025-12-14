/**
 * Message Concatenator
 *
 * Sistema de concatenação de mensagens rápidas com BullMQ
 * Aguarda X segundos e agrupa mensagens antes de processar
 */

import { redis } from '@/services/redis';
import { database } from '@/services/database';
import { chatwootSyncService } from '@/features/chatwoot';
import type { MessageDirection, MessageType } from '@prisma/client';

export interface IncomingMessage {
  connectionId: string;
  waMessageId: string;
  type: MessageType;
  content: string;
  direction: MessageDirection;
  mediaUrl?: string;
  mediaType?: string;
  mimeType?: string;
  fileName?: string;
}

export class MessageConcatenator {
  private readonly CONCAT_TIMEOUT: number;
  private readonly REDIS_PREFIX = 'concat:';

  constructor(timeoutSeconds: number = 8) {
    this.CONCAT_TIMEOUT = timeoutSeconds;
  }

  /**
   * Adicionar mensagem ao grupo de concatenação
   * Usa Redis SETEX com TTL para auto-processamento
   */
  async addMessage(
    sessionId: string,
    contactId: string,
    message: IncomingMessage
  ): Promise<'queued' | 'processing'> {
    const key = `${this.REDIS_PREFIX}${sessionId}:${contactId}`;

    console.log(`[Concat] Adding message to ${key}`);

    // Verificar se já existe grupo de concatenação ativo
    const existing = await redis.get(key);

    if (existing) {
      // Adicionar à lista existente
      const messages: IncomingMessage[] = JSON.parse(existing);
      messages.push(message);

      // Atualizar mensagens no Redis com TTL estendido
      await redis.setex(key, this.CONCAT_TIMEOUT, JSON.stringify(messages));

      console.log(`[Concat] Message added to existing group (${messages.length} total)`);
      return 'queued';
    } else {
      // Iniciar novo grupo com TTL
      await redis.setex(key, this.CONCAT_TIMEOUT, JSON.stringify([message]));

      // Agendar processamento após timeout usando setTimeout (em-memory)
      // Note: Em produção, considerar usar BullMQ diretamente ou Redis keyspace notifications
      setTimeout(async () => {
        try {
          await this.processConcatenatedMessages(sessionId, contactId);
        } catch (error) {
          console.error(`[Concat] Error processing messages:`, error);
        }
      }, this.CONCAT_TIMEOUT * 1000);

      console.log(`[Concat] New concatenation group started, will process in ${this.CONCAT_TIMEOUT}s`);
      return 'processing';
    }
  }

  /**
   * Processar grupo de mensagens concatenadas
   * Chamado após o timeout expirar
   */
  async processConcatenatedMessages(
    sessionId: string,
    contactId: string
  ): Promise<void> {
    const key = `${this.REDIS_PREFIX}${sessionId}:${contactId}`;
    const data = await redis.get(key);

    if (!data) {
      console.log(`[Concat] No messages to process for ${key}`);
      return;
    }

    const messages: IncomingMessage[] = JSON.parse(data);

    console.log(`[Concat] Processing ${messages.length} concatenated messages`);

    // Deletar do Redis
    await redis.del(key);

    // Concatenar apenas mensagens de texto
    const textMessages = messages.filter(m => m.type === 'text');
    const concatenatedText = textMessages
      .map(m => m.content)
      .join('\n');

    // Coletar mídias separadas (serão salvas individualmente)
    const mediaMessages = messages.filter(m => m.type !== 'text');

    // Criar grupo de concatenação no banco
    const concatGroupId = `concat_${Date.now()}_${sessionId}`;

    // Salvar mensagem concatenada de texto (se houver textos)
    if (textMessages.length > 0) {
      const finalMessage = await database.message.create({
        data: {
          sessionId,
          contactId,
          connectionId: messages[0].connectionId,
          waMessageId: `concat_${concatGroupId}`,
          direction: 'INBOUND',
          type: 'text',
          content: concatenatedText,
          isConcatenated: true,
          concatGroupId,
          status: 'delivered',
        },
      });

      console.log(`[Concat] Created concatenated text message: ${finalMessage.id}`);

      // Processar mensagem final (IA, etc)
      await this.processMessage(finalMessage);

      // ⭐ CHATWOOT SYNC: Sincronizar mensagem concatenada com Chatwoot
      try {
        const contact = await database.contact.findUnique({
          where: { id: contactId },
          select: { phoneNumber: true, name: true },
        });
        const instance = await database.instance.findUnique({
          where: { id: messages[0].connectionId },
          select: { organizationId: true },
        });
        
        if (contact && instance?.organizationId) {
          await chatwootSyncService.syncIncomingMessage({
            instanceId: messages[0].connectionId,
            organizationId: instance.organizationId,
            phoneNumber: contact.phoneNumber,
            contactName: contact.name || contact.phoneNumber,
            messageContent: concatenatedText,
            messageType: 'text',
            isFromGroup: contact.phoneNumber.includes('@g.us'),
          });
        }
      } catch (chatwootError) {
        console.error('[Concat] Chatwoot sync failed (non-blocking):', chatwootError);
      }
    }

    // Salvar mensagens individuais de mídia
    if (mediaMessages.length > 0) {
      console.log(`[Concat] Saving ${mediaMessages.length} media messages individually`);

      await Promise.all(
        mediaMessages.map(async (msg) => {
          const savedMessage = await database.message.create({
            data: {
              sessionId,
              contactId,
              connectionId: msg.connectionId,
              waMessageId: msg.waMessageId,
              direction: msg.direction,
              type: msg.type,
              content: msg.content || '',
              mediaUrl: msg.mediaUrl,
              mediaType: msg.mediaType,
              mimeType: msg.mimeType,
              fileName: msg.fileName,
              concatGroupId,
              isConcatenated: false,
              transcriptionStatus: 'pending',
              status: 'delivered',
            },
          });

          console.log(`[Concat] Saved media message: ${savedMessage.id} (${msg.type})`);

          // Enfileirar transcrição para mensagens de mídia
          if (msg.mediaUrl) {
            await this.enqueueTranscription(savedMessage.id, msg);
          }
        })
      );
    }

    // Salvar todas mensagens originais para histórico completo
    await Promise.all(
      textMessages.map(msg =>
        database.message.create({
          data: {
            sessionId,
            contactId,
            connectionId: msg.connectionId,
            waMessageId: msg.waMessageId,
            direction: msg.direction,
            type: msg.type,
            content: msg.content,
            concatGroupId,
            isConcatenated: false,
            status: 'delivered',
          },
        })
      )
    );

    console.log(`[Concat] ✅ Concatenation completed for group ${concatGroupId}`);
  }

  /**
   * Processar mensagem (enviar para IA se não bloqueada)
   */
  private async processMessage(message: any): Promise<void> {
    // Import dinâmico para evitar dependência circular
    const { sessionsManager } = await import('@/lib/sessions/sessions.manager');

    // Verificar se IA está bloqueada
    const blocked = await sessionsManager.isAIBlocked(message.sessionId);

    if (blocked) {
      console.log(`[Concat] AI blocked for session ${message.sessionId}, skipping processing`);
      return;
    }

    console.log(`[Concat] Message ready for AI processing: ${message.id}`);

    // TODO: Enfileirar para IA processar (FASE futura)
    // await aiQueue.add('process-message', {
    //   messageId: message.id,
    //   sessionId: message.sessionId,
    //   content: message.content,
    // });

    // Por enquanto, apenas publicar evento no Redis
    await redis.publish('message:ready_for_ai', JSON.stringify({
      messageId: message.id,
      sessionId: message.sessionId,
      content: message.content,
    }));
  }

  /**
   * Enfileirar transcrição de mídia
   */
  private async enqueueTranscription(messageId: string, message: IncomingMessage): Promise<void> {
    console.log(`[Concat] Enqueueing transcription for message ${messageId} (${message.type})`);

    // Import dinâmico para evitar dependência circular
    const { transcriptionQueue } = await import('@/lib/transcription');

    // Enfileirar transcrição
    await transcriptionQueue.add('transcribe-media', {
      messageId,
      instanceId: message.connectionId, // Note: transcriptionQueue still uses 'instanceId' parameter name
      mediaType: message.type,
      mediaUrl: message.mediaUrl!,
      mimeType: message.mimeType,
    });

    // Atualizar status no banco
    await database.message.update({
      where: { id: messageId },
      data: { transcriptionStatus: 'pending' },
    });
  }

  /**
   * Obter mensagens pendentes de um grupo
   */
  async getPendingMessages(sessionId: string, contactId: string): Promise<IncomingMessage[] | null> {
    const key = `${this.REDIS_PREFIX}${sessionId}:${contactId}`;
    const data = await redis.get(key);

    if (!data) return null;

    return JSON.parse(data);
  }

  /**
   * Cancelar concatenação e processar imediatamente
   */
  async forceProcess(sessionId: string, contactId: string): Promise<void> {
    console.log(`[Concat] Force processing for ${sessionId}/${contactId}`);
    await this.processConcatenatedMessages(sessionId, contactId);
  }

  /**
   * Limpar grupo de concatenação (remover dados do Redis)
   */
  async clearGroup(sessionId: string, contactId: string): Promise<void> {
    const key = `${this.REDIS_PREFIX}${sessionId}:${contactId}`;

    // Deletar dados do Redis
    await redis.del(key);

    console.log(`[Concat] Cleared concatenation group: ${key}`);
  }
}

// Singleton com timeout de 8 segundos (configurável via env, range: 5-8s)
export const messageConcatenator = new MessageConcatenator(
  parseInt(process.env.MESSAGE_CONCAT_TIMEOUT || '8', 10)
);
