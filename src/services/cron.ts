/**
 * Cron Jobs Configuration
 *
 * Usa setInterval para executar jobs recorrentes
 */

import { sessionsManager } from '@/lib/sessions/sessions.manager';

// Intervalos em milissegundos
const UNBLOCK_AI_INTERVAL_MS = 60 * 1000; // 1 minuto
const SESSION_TIMEOUT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const RESUME_PAUSED_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos
const SYNC_CONNECTING_INTERVAL_MS = 30 * 1000; // 30 segundos - sincronizar instâncias CONNECTING

let cronJobsInitialized = false;
const intervals: NodeJS.Timeout[] = [];

/**
 * Inicializar todos os cron jobs
 * Deve ser chamado no startup da aplicação
 */
export async function initializeCronJobs() {
  if (cronJobsInitialized) {
    console.log('[Cron] Cron jobs already initialized, skipping...');
    return;
  }

  console.log('[Cron] Initializing cron jobs...');

  try {
    // CRON 1: Unblock Expired AIs - Executa a cada 1 minuto
    intervals.push(
      setInterval(async () => {
        try {
          const count = await sessionsManager.unblockExpiredAIs();
          if (count > 0) {
            console.log(`[Cron] unblockExpiredAIs: ${count} sessions unblocked`);
          }
        } catch (error) {
          console.error('[Cron] Error in unblockExpiredAIs:', error);
        }
      }, UNBLOCK_AI_INTERVAL_MS)
    );
    console.log('[Cron] ✅ Job "unblockExpiredAIs" scheduled (every 1 minute)');

    // CRON 2: Close Expired Sessions - Executa a cada 5 minutos
    intervals.push(
      setInterval(async () => {
        try {
          const result = await sessionsManager.closeExpiredSessions();
          if (result.closed > 0) {
            console.log(`[Cron] closeExpiredSessions: ${result.closed} sessions closed`);
          }
        } catch (error) {
          console.error('[Cron] Error in closeExpiredSessions:', error);
        }
      }, SESSION_TIMEOUT_INTERVAL_MS)
    );
    console.log('[Cron] ✅ Job "closeExpiredSessions" scheduled (every 5 minutes)');

    // CRON 3: Resume Paused Sessions - Executa a cada 2 minutos
    intervals.push(
      setInterval(async () => {
        try {
          const count = await sessionsManager.resumeExpiredPausedSessions();
          if (count > 0) {
            console.log(`[Cron] resumePausedSessions: ${count} sessions resumed`);
          }
        } catch (error) {
          console.error('[Cron] Error in resumePausedSessions:', error);
        }
      }, RESUME_PAUSED_INTERVAL_MS)
    );
    console.log('[Cron] ✅ Job "resumePausedSessions" scheduled (every 2 minutes)');

    // CRON 4: Sync Connecting Instances - Executa a cada 30 segundos
    intervals.push(
      setInterval(async () => {
        try {
          const { database } = await import('@/services/database');
          const { uazapiService } = await import('@/lib/api/uazapi.service');

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
                  console.log(`[Cron] syncConnectingInstances: ${instance.name} -> CONNECTED`);
                }
              }
            } catch (e) {
              // Erro individual não para o loop
            }
          }
          if (syncedCount > 0) {
            console.log(`[Cron] syncConnectingInstances: ${syncedCount}/${connectingInstances.length} synced`);
          }
        } catch (error) {
          console.error('[Cron] Error in syncConnectingInstances:', error);
        }
      }, SYNC_CONNECTING_INTERVAL_MS)
    );
    console.log('[Cron] ✅ Job "syncConnectingInstances" scheduled (every 30 seconds)');

    cronJobsInitialized = true;
    console.log('[Cron] All cron jobs initialized successfully');
  } catch (error) {
    console.error('[Cron] Error initializing cron jobs:', error);
  }
}

/**
 * Limpar todos os cron jobs
 */
export async function clearAllCronJobs() {
  console.log('[Cron] Clearing all cron jobs...');

  try {
    for (const interval of intervals) {
      clearInterval(interval);
    }
    intervals.length = 0;
    cronJobsInitialized = false;
    console.log('[Cron] All cron jobs cleared');
  } catch (error) {
    console.error('[Cron] Error clearing cron jobs:', error);
    throw error;
  }
}
