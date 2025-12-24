/**
 * Transcription Worker
 *
 * BullMQ Worker para processar transcrições de mídia em background
 * Suporta: audio, voice, video, image, document
 *
 * NOTE: This file has side effects (creates Worker on import).
 * Import the queue from ./transcription.queue instead when you only need the queue.
 */

import { Worker, Job } from 'bullmq';
import { redis } from '@/services/redis';
import { database } from '@/services/database';
import { transcriptionEngine } from './transcription.engine';
import { transcriptionDLQ } from './transcription.queue';
import type { TranscriptionJob } from './transcription.queue';

// Re-export for backward compatibility
export type { TranscriptionJob } from './transcription.queue';
export { transcriptionQueue, transcriptionDLQ } from './transcription.queue';

/**
 * Worker de transcrição
 */
export const transcriptionWorker = new Worker<TranscriptionJob>(
  'transcription',
  async (job: Job<TranscriptionJob>) => {
    const { messageId, mediaType, mediaUrl, mimeType } = job.data;

    console.log(`[Transcription Worker] Processing ${mediaType} for message ${messageId}`);

    // Marcar como processando
    await database.message.update({
      where: { id: messageId },
      data: { transcriptionStatus: 'processing' },
    });

    try {
      let result;

      // Selecionar método de transcrição baseado no tipo
      switch (mediaType) {
        case 'audio':
        case 'voice':
          result = await transcriptionEngine.transcribeAudio(mediaUrl);
          break;

        case 'video':
          result = await transcriptionEngine.transcribeVideo(mediaUrl);
          break;

        case 'image':
          result = await transcriptionEngine.describeImage(mediaUrl);
          break;

        case 'document':
          if (!mimeType) {
            throw new Error('mimeType is required for document transcription');
          }
          result = await transcriptionEngine.extractDocumentText(mediaUrl, mimeType);
          break;

        default:
          throw new Error(`Unsupported media type: ${mediaType}`);
      }

      // Salvar transcrição no banco
      await database.message.update({
        where: { id: messageId },
        data: {
          transcription: result.text,
          transcriptionLanguage: result.language,
          transcriptionConfidence: result.confidence,
          transcriptionStatus: 'completed',
          transcriptionProcessedAt: new Date(),
        },
      });

      // Publicar evento no Redis (para websockets)
      await redis.publish('transcription:completed', JSON.stringify({
        messageId,
        text: result.text,
        language: result.language,
        confidence: result.confidence,
      }));

      console.log(`[Transcription Worker] ✅ Completed for message ${messageId}`);

      return {
        success: true,
        messageId,
        transcription: result.text,
        language: result.language,
        processedAt: new Date(),
      };
    } catch (error: any) {
      console.error(`[Transcription Worker] ❌ Failed for message ${messageId}:`, error);

      // Marcar como falha
      await database.message.update({
        where: { id: messageId },
        data: {
          transcriptionStatus: 'failed',
          transcriptionError: error.message,
        },
      });

      throw error; // BullMQ vai fazer retry
    }
  },
  {
    connection: redis,
    concurrency: 5, // 5 transcrições simultâneas
    limiter: {
      max: 10, // 10 jobs por minuto (limites OpenAI)
      duration: 60000,
    },
  }
);

// Event listeners
transcriptionWorker.on('completed', (job: Job<TranscriptionJob>) => {
  console.log(`[Transcription Worker] Job ${job.id} completed`);
});

transcriptionWorker.on('failed', async (job: Job<TranscriptionJob> | undefined, error: Error) => {
  console.error(`[Transcription Worker] Job ${job?.id} failed:`, error.message);

  // Se esgotou todas as tentativas, mover para Dead Letter Queue
  if (job && job.attemptsMade >= (job.opts.attempts || 3)) {
    console.warn(`[Transcription Worker] Moving job ${job.id} to DLQ after ${job.attemptsMade} attempts`);

    try {
      await transcriptionDLQ.add('failed-transcription', {
        ...job.data,
        error: error.message,
        failedAt: new Date().toISOString(),
      }, {
        jobId: `dlq-${job.id}`,
      });

      // Publicar evento para notificacao
      await redis.publish('transcription:dlq', JSON.stringify({
        messageId: job.data.messageId,
        instanceId: job.data.instanceId,
        error: error.message,
        attempts: job.attemptsMade,
      }));

      console.log(`[Transcription Worker] Job ${job.id} moved to DLQ`);
    } catch (dlqError) {
      console.error(`[Transcription Worker] Failed to move job to DLQ:`, dlqError);
    }
  }
});

transcriptionWorker.on('error', (error: Error) => {
  console.error('[Transcription Worker] Worker error:', error);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Transcription Worker] SIGTERM received, closing worker...');
  await transcriptionWorker.close();
  console.log('[Transcription Worker] Worker closed');
});

console.log('[Transcription Worker] Worker started and listening for jobs');
