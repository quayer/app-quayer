/**
 * Message Concatenator
 *
 * Sistema de concatenação de mensagens rápidas com BullMQ
 * Aguarda X segundos e agrupa mensagens antes de processar
 */

import { redis } from '@/services/redis';
import { database } from '@/services/database';
import { jobs } from '@/services/jobs';
import type { MessageDirection, MessageType } from '@prisma/client';

export interface IncomingMessage {
  instanceId: string;
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
  private readonly JOB_PREFIX = 'concat_job:';

  constructor(timeoutSeconds: number = 8) {
    this.CONCAT_TIMEOUT = timeoutSeconds;
  }

  /**
   * Adicionar mensagem ao grupo de concatenação
   * Agora usa BullMQ delayed jobs ao invés de Redis SETEX
   */
  async addMessage(
    sessionId: string,
    contactId: string,
    message: IncomingMessage
  ): Promise<'queued' | 'processing'> {
    const key = `${this.REDIS_PREFIX}${sessionId}:${contactId}`;
    const jobKey = `${this.JOB_PREFIX}${sessionId}:${contactId}`;

    console.log(`[Concat] Adding message to ${key}`);

    // Verificar se já existe grupo de concatenação ativo
    const existing = await redis.get(key);
    const existingJobId = await redis.get(jobKey);

    if (existing) {
      // Adicionar à lista existente
      const messages: IncomingMessage[] = JSON.parse(existing);
      messages.push(message);

      // Atualizar mensagens no Redis (sem expiration agora)
      await redis.set(key, JSON.stringify(messages));

      // CANCELAR job antigo (se existir) e criar novo com delay resetado
      if (existingJobId) {
        try {
          const oldJob = await jobs.getQueue('concatenation').getJob(existingJobId);
          if (oldJob) {
            await oldJob.remove();
            console.log(`[Concat] Cancelled old job ${existingJobId}`);
          }
        } catch (error) {
          console.error(`[Concat] Error cancelling old job:`, error);
        }
      }

      // Criar novo job com delay resetado
      const job = await jobs.dispatch('concatenation', 'processConcatenatedMessages', {
        sessionId,
        contactId,
      }, {
        delay: this.CONCAT_TIMEOUT * 1000, // converter para ms
      });

      // Salvar job ID no Redis para poder cancelar depois
      await redis.set(jobKey, job.id!);

      console.log(`[Concat] Message added to existing group (${messages.length} total), job ${job.id} scheduled`);
      return 'queued';
    } else {
      // Iniciar novo grupo
      await redis.set(key, JSON.stringify([message]));

      // Criar job com delay
      const job = await jobs.dispatch('concatenation', 'processConcatenatedMessages', {
        sessionId,
        contactId,
      }, {
        delay: this.CONCAT_TIMEOUT * 1000, // converter para ms
      });

      // Salvar job ID no Redis
      await redis.set(jobKey, job.id!);

      console.log(`[Concat] New concatenation group started, job ${job.id} will process in ${this.CONCAT_TIMEOUT}s`);
      return 'processing';
    }
  }

  /**
   * Processar grupo de mensagens concatenadas
   * Chamado pelo BullMQ job quando delay expira
   */
  async processConcatenatedMessages(
    sessionId: string,
    contactId: string
  ): Promise<void> {
    const key = `${this.REDIS_PREFIX}${sessionId}:${contactId}`;
    const jobKey = `${this.JOB_PREFIX}${sessionId}:${contactId}`;
    const data = await redis.get(key);

    if (!data) {
      console.log(`[Concat] No messages to process for ${key}`);
      // Limpar job ID se existir
      await redis.del(jobKey);
      return;
    }

    const messages: IncomingMessage[] = JSON.parse(data);

    console.log(`[Concat] Processing ${messages.length} concatenated messages`);

    // Deletar do Redis (mensagens e job ID)
    await Promise.all([
      redis.del(key),
      redis.del(jobKey),
    ]);

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
          instanceId: messages[0].instanceId,
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
              instanceId: msg.instanceId,
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
            instanceId: msg.instanceId,
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
      instanceId: message.instanceId,
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
   * Limpar grupo de concatenação (cancelar job e remover dados)
   */
  async clearGroup(sessionId: string, contactId: string): Promise<void> {
    const key = `${this.REDIS_PREFIX}${sessionId}:${contactId}`;
    const jobKey = `${this.JOB_PREFIX}${sessionId}:${contactId}`;

    // Cancelar job se existir
    const existingJobId = await redis.get(jobKey);
    if (existingJobId) {
      try {
        const job = await jobs.getQueue('concatenation').getJob(existingJobId);
        if (job) {
          await job.remove();
          console.log(`[Concat] Cancelled job ${existingJobId}`);
        }
      } catch (error) {
        console.error(`[Concat] Error cancelling job:`, error);
      }
    }

    // Deletar dados do Redis
    await Promise.all([
      redis.del(key),
      redis.del(jobKey),
    ]);

    console.log(`[Concat] Cleared concatenation group: ${key}`);
  }
}

// Singleton com timeout de 8 segundos (configurável via env, range: 5-8s)
export const messageConcatenator = new MessageConcatenator(
  parseInt(process.env.MESSAGE_CONCAT_TIMEOUT || '8', 10)
);
