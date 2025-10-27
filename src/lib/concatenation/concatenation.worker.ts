/**
 * Concatenation Worker
 *
 * BullMQ Worker para processar grupos de mensagens concatenadas
 * Dispara após o timeout de concatenação expirar
 */

import { Worker, Job, Queue } from 'bullmq';
import { redis } from '@/services/redis';
import { messageConcatenator } from './message-concatenator';

export interface ConcatenationJob {
  sessionId: string;
  contactId: string;
}

/**
 * Queue de concatenação
 */
export const concatenationQueue = new Queue<ConcatenationJob>('concatenation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // 2s, 4s, 8s
    },
    removeOnComplete: {
      age: 3600, // Manter completados por 1 hora
      count: 1000,
    },
    removeOnFail: {
      age: 86400, // Manter falhas por 24 horas
    },
  },
});

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
