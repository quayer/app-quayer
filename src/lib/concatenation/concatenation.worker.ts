/**
 * Concatenation Worker
 *
 * BullMQ Worker para processar grupos de mensagens concatenadas
 * Dispara após o timeout de concatenação expirar
 *
 * NOTE: This file has side effects (creates Worker on import).
 * Import the queue from ./concatenation.queue instead when you only need the queue.
 */

import { Worker, Job } from 'bullmq';
import { redis } from '@/services/redis';
import { messageConcatenator } from './message-concatenator';
import type { ConcatenationJob } from './concatenation.queue';

// Re-export for backward compatibility
export type { ConcatenationJob } from './concatenation.queue';
export { concatenationQueue } from './concatenation.queue';

/**
 * Worker de concatenação
 */
export const concatenationWorker = new Worker<ConcatenationJob>(
  'concatenation',
  async (job: Job<ConcatenationJob>) => {
    const { sessionId, contactId } = job.data;

    console.log(`[Concat Worker] Processing job ${job.id} - Session: ${sessionId}, Contact: ${contactId}`);

    try {
      await messageConcatenator.processConcatenatedMessages(sessionId, contactId);

      console.log(`[Concat Worker] ✅ Job ${job.id} completed successfully`);

      return {
        success: true,
        sessionId,
        contactId,
        processedAt: new Date(),
      };
    } catch (error: any) {
      console.error(`[Concat Worker] ❌ Job ${job.id} failed:`, error);
      throw error; // BullMQ vai fazer retry
    }
  },
  {
    connection: redis,
    concurrency: 10, // 10 concatenações simultâneas
    limiter: {
      max: 50, // Máximo 50 jobs por minuto
      duration: 60000,
    },
  }
);

// Event listeners
concatenationWorker.on('completed', (job: Job<ConcatenationJob>) => {
  console.log(`[Concat Worker] Job ${job.id} completed`);
});

concatenationWorker.on('failed', (job: Job<ConcatenationJob> | undefined, error: Error) => {
  console.error(`[Concat Worker] Job ${job?.id} failed:`, error.message);
});

concatenationWorker.on('error', (error: Error) => {
  console.error('[Concat Worker] Worker error:', error);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[Concat Worker] SIGTERM received, closing worker...');
  await concatenationWorker.close();
  console.log('[Concat Worker] Worker closed');
});

console.log('[Concat Worker] Worker started and listening for jobs');
