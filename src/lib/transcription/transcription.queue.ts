/**
 * Transcription Queue
 *
 * Queue definitions only - worker is in a separate file to avoid
 * side effects during SSR/build
 */

import { Queue } from 'bullmq';
import { redis } from '@/services/redis';
import type { MessageType } from '@prisma/client';

export interface TranscriptionJob {
  messageId: string;
  instanceId: string;
  mediaType: MessageType;
  mediaUrl: string;
  mimeType?: string;
}

/**
 * Dead Letter Queue para transcricoes que falharam apos todos os retries
 * Permite analise posterior e reprocessamento manual
 */
export const transcriptionDLQ = new Queue<TranscriptionJob & { error: string; failedAt: string }>('transcription-dlq', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: false, // Manter para analise
    removeOnFail: false,
  },
});

/**
 * Queue de transcrição
 */
export const transcriptionQueue = new Queue<TranscriptionJob>('transcription', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // 5s, 10s, 20s
    },
    removeOnComplete: {
      age: 86400, // Manter completados por 24 horas
      count: 1000,
    },
    removeOnFail: {
      age: 604800, // Manter falhas por 7 dias
      count: 500,
    },
  },
});
