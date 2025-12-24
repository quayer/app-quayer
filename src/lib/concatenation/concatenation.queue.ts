/**
 * Concatenation Queue
 *
 * Queue definition only - worker is in a separate file to avoid
 * side effects during SSR/build
 */

import { Queue } from 'bullmq';
import { redis } from '@/services/redis';

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
