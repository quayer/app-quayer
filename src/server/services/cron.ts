/**
 * Cron Jobs Configuration
 *
 * Usa setInterval para executar jobs recorrentes.
 * For time-of-day jobs (billing), uses msUntilNext() to schedule
 * at the right local time (America/Sao_Paulo).
 */

// Intervalos em milissegundos
const SYNC_CONNECTING_INTERVAL_MS = 30 * 1000; // 30 segundos - sincronizar instâncias CONNECTING
const DEVICE_SESSION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas
const NFSE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Calculates milliseconds until the next occurrence of a given hour:minute
 * in America/Sao_Paulo timezone.
 */
function msUntilNext(hour: number, minute: number): number {
  const now = new Date();
  // Build a target date string in SP timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0';
  const nowHour = parseInt(get('hour'), 10);
  const nowMinute = parseInt(get('minute'), 10);
  const nowSecond = parseInt(get('second'), 10);

  // How many ms from now until the target time today (SP)
  let diffMs =
    (hour - nowHour) * 3600_000 +
    (minute - nowMinute) * 60_000 -
    nowSecond * 1000;

  // If the time already passed today, schedule for tomorrow
  if (diffMs <= 0) diffMs += ONE_DAY_MS;

  return diffMs;
}

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
    // CRON 4: Sync Connecting Instances - Executa a cada 30 segundos
    intervals.push(
      setInterval(async () => {
        try {
          const { database } = await import('@/server/services/database');
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

    // CRON 5: Cleanup DeviceSessions - Executa a cada 24 horas
    // Deleta sessions revogadas há mais de 30 dias e inativas há mais de 90 dias
    intervals.push(
      setInterval(async () => {
        try {
          const { database } = await import('@/server/services/database');
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

          const revokedResult = await database.deviceSession.deleteMany({
            where: {
              isRevoked: true,
              revokedAt: { lt: thirtyDaysAgo },
            },
          });

          const inactiveResult = await database.deviceSession.deleteMany({
            where: {
              lastActiveAt: { lt: ninetyDaysAgo },
              isRevoked: false,
            },
          });

          const total = revokedResult.count + inactiveResult.count;
          if (total > 0) {
            console.log(`[Cron] cleanupDeviceSessions: ${revokedResult.count} revoked (>30d) + ${inactiveResult.count} inactive (>90d) = ${total} deleted`);
          }
        } catch (error) {
          console.error('[Cron] Error in cleanupDeviceSessions:', error);
        }
      }, DEVICE_SESSION_CLEANUP_INTERVAL_MS)
    );
    // Executar cleanup imediatamente no startup (uma vez)
    setTimeout(async () => {
      try {
        const { database } = await import('@/server/services/database');
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const r = await database.deviceSession.deleteMany({ where: { isRevoked: true, revokedAt: { lt: thirtyDaysAgo } } });
        const i = await database.deviceSession.deleteMany({ where: { lastActiveAt: { lt: ninetyDaysAgo }, isRevoked: false } });
        if (r.count + i.count > 0) console.log(`[Cron] cleanupDeviceSessions (startup): ${r.count + i.count} deleted`);
      } catch (error) {
        console.error('[Cron] Error in cleanupDeviceSessions (startup):', error);
      }
    }, 5000); // 5s delay para DB estar pronto
    console.log('[Cron] ✅ Job "cleanupDeviceSessions" scheduled (every 24 hours + startup)');

    // ── BILLING CRON JOBS ─────────────────────────────────────────────

    // CRON 6: Billing Cycle — daily at 06:00 AM (America/Sao_Paulo)
    function scheduleBillingCycle() {
      const delay = msUntilNext(6, 0);
      console.log(`[Cron] billingCycle: next run in ${Math.round(delay / 60_000)} minutes`);
      const timeout = setTimeout(async () => {
        try {
          const { processBillingCycle } = await import(
            '@/server/core/billing/jobs/billing-cycle.job'
          );
          const result = await processBillingCycle();
          console.log(
            `[Cron] billingCycle: ${result.processed} processed, ${result.succeeded} ok, ${result.failed} failed`
          );
        } catch (error) {
          console.error('[Cron] Error in billingCycle:', error);
        }
        // Reschedule for next day
        scheduleBillingCycle();
      }, delay);
      // Store as interval-like handle for cleanup
      intervals.push(timeout as unknown as NodeJS.Timeout);
    }
    scheduleBillingCycle();
    console.log('[Cron] ✅ Job "billingCycle" scheduled (daily at 06:00 AM SP)');

    // CRON 7: NFS-e Queue + Poll — every 30 minutes
    intervals.push(
      setInterval(async () => {
        try {
          const { processNfseQueue, pollNfseStatus } = await import(
            '@/server/core/billing/jobs/nfse-emitter.job'
          );
          const result = await processNfseQueue();
          if (result.processed > 0) {
            console.log(
              `[Cron] nfseQueue: ${result.processed} processed, ${result.succeeded} ok, ${result.failed} failed`
            );
          }
          await pollNfseStatus();
        } catch (error) {
          console.error('[Cron] Error in nfseQueue:', error);
        }
      }, NFSE_INTERVAL_MS)
    );
    console.log('[Cron] ✅ Job "nfseQueue + pollNfseStatus" scheduled (every 30 minutes)');

    // CRON 8: Overdue Check + Suspend — daily at 08:00 AM (America/Sao_Paulo)
    function scheduleOverdueCheck() {
      const delay = msUntilNext(8, 0);
      console.log(`[Cron] overdueCheck: next run in ${Math.round(delay / 60_000)} minutes`);
      const timeout = setTimeout(async () => {
        try {
          const { processOverdueInvoices } = await import(
            '@/server/core/billing/jobs/overdue-check.job'
          );
          const result = await processOverdueInvoices();
          console.log(
            `[Cron] overdueCheck: ${result.markedOverdue} overdue, ${result.suspended} suspended`
          );
        } catch (error) {
          console.error('[Cron] Error in overdueCheck:', error);
        }
        // Reschedule for next day
        scheduleOverdueCheck();
      }, delay);
      intervals.push(timeout as unknown as NodeJS.Timeout);
    }
    scheduleOverdueCheck();
    console.log('[Cron] ✅ Job "overdueCheck" scheduled (daily at 08:00 AM SP)');

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
    for (const handle of intervals) {
      clearInterval(handle);
      clearTimeout(handle);
    }
    intervals.length = 0;
    cronJobsInitialized = false;
    console.log('[Cron] All cron jobs cleared');
  } catch (error) {
    console.error('[Cron] Error clearing cron jobs:', error);
    throw error;
  }
}
