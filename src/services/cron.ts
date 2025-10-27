/**
 * Cron Jobs Configuration
 *
 * Configura jobs recorrentes usando BullMQ repeatableJobs
 */

import { jobs } from './jobs';

/**
 * Inicializar todos os cron jobs
 * Deve ser chamado no startup da aplicação
 */
export async function initializeCronJobs() {
  console.log('[Cron] Initializing cron jobs...');

  try {
    // CRON: Unblock Expired AIs - Executa a cada 1 minuto
    await jobs.dispatch('sessions', 'unblockExpiredAIs', {}, {
      repeat: {
        pattern: '*/1 * * * *', // A cada 1 minuto
      },
      jobId: 'cron:unblockExpiredAIs', // ID único para evitar duplicatas
    });

    console.log('[Cron] ✅ Cron job "unblockExpiredAIs" scheduled (every 1 minute)');

    // Listar todos os cron jobs ativos
    const sessionsQueue = jobs.getQueue('sessions');
    const repeatableJobs = await sessionsQueue.getRepeatableJobs();

    console.log(`[Cron] Active repeatable jobs: ${repeatableJobs.length}`);
    repeatableJobs.forEach((job) => {
      console.log(`  - ${job.id}: ${job.pattern}`);
    });

    console.log('[Cron] All cron jobs initialized successfully');
  } catch (error) {
    console.error('[Cron] Error initializing cron jobs:', error);
    throw error;
  }
}

/**
 * Limpar todos os cron jobs
 * Útil para testes ou shutdown
 */
export async function clearAllCronJobs() {
  console.log('[Cron] Clearing all cron jobs...');

  try {
    const sessionsQueue = jobs.getQueue('sessions');
    const repeatableJobs = await sessionsQueue.getRepeatableJobs();

    for (const job of repeatableJobs) {
      await sessionsQueue.removeRepeatableByKey(job.key);
      console.log(`[Cron] Removed: ${job.id}`);
    }

    console.log('[Cron] All cron jobs cleared');
  } catch (error) {
    console.error('[Cron] Error clearing cron jobs:', error);
    throw error;
  }
}
