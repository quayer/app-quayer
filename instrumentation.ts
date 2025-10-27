/**
 * Next.js Instrumentation
 * Runs once when the server starts (both dev and production)
 */

export async function register() {
  // Only run on server-side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Initializing server-side setup...');

    try {
      // Initialize cron jobs
      const { initializeCronJobs } = await import('./src/services/cron');
      await initializeCronJobs();

      console.log('[Instrumentation] Server-side setup complete');
    } catch (error) {
      console.error('[Instrumentation] Error during setup:', error);
      // Não lançar erro para não quebrar o servidor
      // throw error;
    }
  }
}
