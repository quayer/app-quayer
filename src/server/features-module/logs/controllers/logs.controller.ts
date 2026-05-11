/**
 * Logs — Controller (composer)
 *
 * Compoe os route files do modulo logs.
 * Nao confundir com logs-sse.controller.ts, que e separado.
 *
 * Route files:
 *   query.routes.ts    → GET  / (list), /stats, /sources
 *   analysis.routes.ts → POST /analyze, /analyze/:id, GET /analyses
 *   ingest.routes.ts   → POST / (create)
 */

import { igniter } from '@/igniter'
import { queryRoutes } from './query.routes'
import { analysisRoutes } from './analysis.routes'
import { ingestRoutes } from './ingest.routes'

export const logsController = igniter.controller({
  name: 'logs',
  path: '/logs',
  description: 'Log management and AI analysis (admin only)',
  actions: {
    ...queryRoutes,
    ...analysisRoutes,
    ...ingestRoutes,
  },
})
