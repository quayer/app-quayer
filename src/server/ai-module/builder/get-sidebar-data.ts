import { headers } from 'next/headers'
import { listRecentProjects } from '@/server/ai-module/builder/queries'

/**
 * Server helper que resolve os dados necessários para <BuilderSidebar>.
 *
 * Lê `x-current-org-id` injetado pelo middleware e busca os projetos recentes
 * do Builder da org ativa via `listRecentProjects` (shared data-access layer).
 * Nunca lança — a camada de queries já degrada para lista vazia em qualquer
 * erro (Turbopack stale client, etc).
 */
export async function getBuilderSidebarData(): Promise<{
  recentProjects: Array<{
    id: string
    name: string
    status: string
    type: string
  }>
}> {
  try {
    const headersList = await headers()
    const orgId = headersList.get('x-current-org-id')

    if (!orgId) {
      return { recentProjects: [] }
    }

    const projects = await listRecentProjects(orgId)
    return {
      recentProjects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        type: p.type,
      })),
    }
  } catch {
    return { recentProjects: [] }
  }
}
