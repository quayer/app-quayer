import { store } from '@/services/store'
import { createBullMQAdapter } from '@igniter-js/adapter-bullmq'
import { z } from 'zod'
import { createJobHooks } from '@/services/metrics'

/**
 * Job queue adapter for background processing.
 * ✅ OTIMIZADO: Concurrency 5, retry strategies, auto-cleanup
 * ✅ v0.3.0: Suporte a repeatable jobs para crons
 * ✅ v0.4.0: Lifecycle hooks para métricas e observabilidade
 * ✅ v0.4.0: Multi-tenancy prefix para isolamento
 */
export const jobs = createBullMQAdapter({
  store,
  globalPrefix: process.env.QUEUE_PREFIX || 'quayer',
  autoStartWorker: {
    concurrency: parseInt(process.env.BULL_CONCURRENCY || '5'),
    queues: ['*']
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
        },
        ...createJobHooks('system.sampleJob'),
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
        },
        ...createJobHooks('concatenation.processConcatenatedMessages'),
        attempts: 3,
      })
    }
  }),
  /**
   * Cron Jobs - Tarefas recorrentes
   * Migrado de setInterval para BullMQ repeatable jobs
   */
  cron: jobs.router({
    jobs: {
      /**
       * Desbloquear sessões com IA expirada
       * Executa a cada 1 minuto
       */
      unblockExpiredAIs: jobs.register({
        name: 'cron:unblockExpiredAIs',
        input: z.object({}),
        handler: async () => {
          const { sessionsManager } = await import('@/lib/sessions/sessions.manager');
          const count = await sessionsManager.unblockExpiredAIs();
          if (count > 0) {
            console.log(`[Cron] unblockExpiredAIs: ${count} sessions unblocked`);
          }
        },
        ...createJobHooks('cron.unblockExpiredAIs'),
      }),

      /**
       * Fechar sessões expiradas
       * Executa a cada 5 minutos
       */
      closeExpiredSessions: jobs.register({
        name: 'cron:closeExpiredSessions',
        input: z.object({}),
        handler: async () => {
          const { sessionsManager } = await import('@/lib/sessions/sessions.manager');
          const result = await sessionsManager.closeExpiredSessions();
          if (result.closed > 0) {
            console.log(`[Cron] closeExpiredSessions: ${result.closed} sessions closed`);
          }
        },
        ...createJobHooks('cron.closeExpiredSessions'),
      }),

      /**
       * Retomar sessões pausadas que expiraram
       * Executa a cada 2 minutos
       */
      resumePausedSessions: jobs.register({
        name: 'cron:resumePausedSessions',
        input: z.object({}),
        handler: async () => {
          const { sessionsManager } = await import('@/lib/sessions/sessions.manager');
          const count = await sessionsManager.resumeExpiredPausedSessions();
          if (count > 0) {
            console.log(`[Cron] resumePausedSessions: ${count} sessions resumed`);
          }
        },
        ...createJobHooks('cron.resumePausedSessions'),
      }),

      /**
       * Sincronizar status de instâncias CONNECTING
       * Verifica via UAZapi se já foram conectadas e atualiza o banco
       * Executa a cada 30 segundos
       */
      syncConnectingInstances: jobs.register({
        name: 'cron:syncConnectingInstances',
        input: z.object({}),
        handler: async () => {
          const { database } = await import('@/services/database');
          const { uazapiService } = await import('@/lib/api/uazapi.service');

          try {
            // Buscar instâncias com status CONNECTING
            const connectingInstances = await database.connection.findMany({
              where: {
                status: 'CONNECTING',
                uazapiToken: { not: null }
              },
              select: {
                id: true,
                name: true,
                uazapiToken: true
              }
            });

            if (connectingInstances.length === 0) return;

            let syncedCount = 0;

            for (const instance of connectingInstances) {
              if (!instance.uazapiToken) continue;

              try {
                const statusResult = await uazapiService.getInstanceStatus(instance.uazapiToken);

                if (statusResult.success && statusResult.data) {
                  const realStatus = statusResult.data.status?.toLowerCase();

                  // Se UAZapi diz que está conectado, atualizar banco
                  if (realStatus === 'connected' || realStatus === 'open') {
                    await database.connection.update({
                      where: { id: instance.id },
                      data: {
                        status: 'CONNECTED',
                        phoneNumber: statusResult.data.phoneNumber || undefined,
                        updatedAt: new Date()
                      }
                    });
                    syncedCount++;
                    console.log(`[Cron] syncConnectingInstances: ${instance.name} synchronized to CONNECTED`);
                  }
                }
              } catch (instanceError) {
                // Erro individual não deve parar o loop
                console.warn(`[Cron] syncConnectingInstances: Error checking ${instance.name}:`, instanceError);
              }
            }

            if (syncedCount > 0) {
              console.log(`[Cron] syncConnectingInstances: ${syncedCount}/${connectingInstances.length} instances synced`);
            }
          } catch (error) {
            console.error('[Cron] syncConnectingInstances error:', error);
          }
        },
        ...createJobHooks('cron.syncConnectingInstances'),
      }),
    }
  })
})
