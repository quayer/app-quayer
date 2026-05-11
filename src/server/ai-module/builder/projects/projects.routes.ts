/**
 * Builder Projects — routes composer
 * Compõe os route files em projectsRoutes (consumido por builder.controller.ts).
 *
 * Route files:
 *   routes/crud.routes.ts       → listProjects, getProject, createProject, deleteProject, renameProject, archiveProject, duplicateProject
 *   routes/prompt.routes.ts     → updatePrompt, listVersions, rollbackPrompt
 *   routes/metrics.routes.ts    → getSidebar, getMetrics
 *   routes/channel.routes.ts    → getProjectChannel, attachChannel, detachChannel
 *   routes/playground.routes.ts → playgroundStream
 */

// Re-export types that consumers depend on
export type { ProjectMetrics } from './routes/metrics.routes'

import { crudRoutes } from './routes/crud.routes'
import { promptRoutes } from './routes/prompt.routes'
import { metricsRoutes } from './routes/metrics.routes'
import { channelRoutes } from './routes/channel.routes'
import { playgroundRoutes } from './routes/playground.routes'

export const projectsRoutes = {
  ...crudRoutes,
  ...promptRoutes,
  ...metricsRoutes,
  ...channelRoutes,
  ...playgroundRoutes,
}

export type ProjectsRoutes = typeof projectsRoutes
