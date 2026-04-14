import { headers } from 'next/headers'
import { listRecentProjects } from '@/server/ai-module/builder/queries'

/**
 * Server helper que resolve os dados necessários para <BuilderSidebar>.
 *
 * Lê `x-current-org-id` e `x-user-role` injetados pelo middleware e busca
 * os projetos recentes do Builder da org ativa via `listRecentProjects`
 * (shared data-access layer). Nunca lança — a camada de queries já degrada
 * para lista vazia em qualquer erro (Turbopack stale client, etc).
 */
export async function getBuilderSidebarData(): Promise<{
  recentProjects: Array<{
    id: string
    name: string
    status: string
    type: string
  }>
  isSuperAdmin: boolean
}> {
  try {
    const headersList = await headers()
    const orgId = headersList.get('x-current-org-id')
    const role = headersList.get('x-user-role')
    const isSuperAdmin = role === 'admin' || role === 'super_admin'

    if (!orgId) {
      return { recentProjects: [], isSuperAdmin }
    }

    const projects = await listRecentProjects(orgId)
    return {
      recentProjects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        type: p.type,
      })),
      isSuperAdmin,
    }
  } catch {
    return { recentProjects: [], isSuperAdmin: false }
  }
}
