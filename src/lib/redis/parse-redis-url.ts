/**
 * parseRedisUrl — converte uma REDIS_URL em ConnectionOptions do BullMQ.
 *
 * BullMQ aceita objeto IORedis-compatível. Repassar como url-string em alguns
 * wrappers cobra parse manual; usamos o IORedis options diretamente para
 * evitar surpresas.
 *
 * Módulo LEAF puro (sem deps de runtime — `ConnectionOptions` é import só de
 * TIPO): pode ser importado por qualquer fila/worker sem risco de import
 * circular com o registry de jobs. Substitui as 3 cópias locais que existiam
 * em jobs/index.ts, source-enrich.queue.ts e outbound-retry.queue.ts.
 */

import type { ConnectionOptions } from 'bullmq'

export function parseRedisUrl(url: string): ConnectionOptions {
  const u = new URL(url)
  const password = u.password ? decodeURIComponent(u.password) : undefined
  return {
    host: u.hostname,
    port: Number(u.port || '6379'),
    password,
    db: u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : undefined,
  }
}
