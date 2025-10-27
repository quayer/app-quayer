import { store } from '@/services/store'
import { createBullMQAdapter } from '@igniter-js/adapter-bullmq'
import { z } from 'zod'

/**
 * Job queue adapter for background processing.
 * ✅ OTIMIZADO: Concurrency 5, retry strategies, auto-cleanup
 */
export const jobs = createBullMQAdapter({
  store,
  autoStartWorker: {
    concurrency: parseInt(process.env.BULL_CONCURRENCY || '5'),
    queues: ['*']
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400 },
  },
})

export const REGISTERED_JOBS = jobs.merge({
  system: jobs.router({
    jobs: {
      sampleJob: jobs.register({
        name: 'sampleJob',
        input: z.object({ message: z.string() }),
        handler: async ({ input }) => {
          console.log(input.message)
        }
      })
    }
  }),
  concatenation: jobs.router({
    jobs: {
      processConcatenatedMessages: jobs.register({
        name: 'processConcatenatedMessages',
        input: z.object({
          sessionId: z.string(),
          contactId: z.string(),
        }),
        handler: async ({ input }) => {
          const { messageConcatenator } = await import('@/lib/concatenation');
          await messageConcatenator.processConcatenatedMessages(
            input.sessionId,
            input.contactId
          );
        }
      })
    }
  }),
  sessions: jobs.router({
    jobs: {
      unblockExpiredAIs: jobs.register({
        name: 'unblockExpiredAIs',
        input: z.object({}),
        handler: async () => {
          const { sessionsManager } = await import('@/lib/sessions/sessions.manager');
          await sessionsManager.unblockExpiredAIs();
        }
      })
    }
  })
})
