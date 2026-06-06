/**
 * start-workers — entrypoint dedicado dos workers BullMQ do Quayer.
 *
 * Sobe TODOS os workers do registry (`registerAllWorkers`) num processo
 * separado do servidor Next:
 *   - quayer-session-close   (cron: encerra sessões inativas + resumo de longo prazo)
 *   - quayer-source-enrich   (on-demand: ingestão "cole seu site/IG" do Builder)
 *   - quayer-outbound-retry  (QH-02: reenvio da resposta barrada por rate-limit de instância)
 *
 * Por que um processo dedicado (e NÃO o runtime Next): jobs/index.ts documenta
 * que `registerAllWorkers` deve ser chamado por um entrypoint dedicado, nunca
 * pelo Next runtime (que é efêmero/serverless e não pode hospedar consumidores
 * de fila de longa duração). Até este script existir, as filas enfileiravam mas
 * NINGUÉM consumia (workers inertes).
 *
 * Run:
 *   npm run start:workers          (= tsx scripts/start-workers.ts)
 *   REDIS_URL=... npx tsx scripts/start-workers.ts
 *
 * Env necessária: REDIS_URL (filas) + DATABASE_URL (handlers que tocam o DB).
 * Em prod, o processo de worker injeta env via compose/orquestrador (mesmo
 * env_file do app). Localmente, .env/.env.local são carregados via @next/env.
 */

import { loadEnvConfig } from '@next/env'

// Carrega .env/.env.local do mesmo jeito que o Next faz (antes de qualquer
// import que leia process.env no top-level, ex.: o singleton do Redis).
loadEnvConfig(process.cwd())

import type { Worker } from 'bullmq'
import {
  registerAllWorkers,
  registerSessionCloseQueueSchedule,
} from '@/server/services/jobs'

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL
  if (!redisUrl) {
    console.error(
      '[start-workers] REDIS_URL ausente — impossível subir os workers BullMQ. ' +
        'Defina REDIS_URL no ambiente.',
    )
    process.exit(1)
  }

  console.info('[start-workers] subindo workers BullMQ...')
  const workers: Worker[] = registerAllWorkers(redisUrl)

  // Agenda o cron repetido do session-close (idempotente — chamar N vezes não
  // duplica). source-enrich e outbound-retry são on-demand, não precisam de cron.
  try {
    await registerSessionCloseQueueSchedule(redisUrl)
    console.info('[start-workers] session-close schedule (cron) registrado')
  } catch (err) {
    console.error(
      '[start-workers] falha ao registrar session-close schedule:',
      err instanceof Error ? err.message : String(err),
    )
  }

  // Observabilidade: loga erros de conexão/processamento de cada worker sem
  // derrubar o processo (BullMQ re-tenta a conexão sozinho).
  for (const w of workers) {
    w.on('error', (err) =>
      console.error(`[start-workers] worker ${w.name} error:`, err?.message ?? err),
    )
    w.on('failed', (job, err) =>
      console.error(
        `[start-workers] job ${job?.id ?? '?'} (${w.name}) failed:`,
        err?.message ?? err,
      ),
    )
  }

  console.info(
    `[start-workers] ${workers.length} worker(s) ativos: ${workers
      .map((w) => w.name)
      .join(', ')}`,
  )

  // Graceful shutdown: fecha todos os workers no SIGTERM/SIGINT (drena o job em
  // andamento antes de sair). Idempotente.
  let shuttingDown = false
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    console.info(`[start-workers] ${signal} recebido — encerrando workers...`)
    await Promise.allSettled(workers.map((w) => w.close()))
    console.info('[start-workers] workers encerrados.')
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[start-workers] boot falhou:', err)
  process.exit(1)
})
