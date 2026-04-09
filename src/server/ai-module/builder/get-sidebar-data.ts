import { headers } from 'next/headers'
import { getDatabase } from '@/server/services/database'

/**
 * Server helper que resolve os dados necessários para <BuilderSidebar>.
 *
 * Lê `x-user-id`, `x-current-org-id` e `x-user-role` injetados pelo middleware
 * e busca os projetos recentes do Builder da org ativa.
 *
 * Retorna `{ recentProjects: [], isSuperAdmin: false }` se não houver org
 * ativa — a sidebar degrada graciosamente.
 */
export async function getBuilderSidebarData(): Promise<{
  recentProjects: Array<{ id: string; name: string; status: string }>
  isSuperAdmin: boolean
}> {
  const headersList = await headers()
  const orgId = headersList.get('x-current-org-id')
  const role = headersList.get('x-user-role')

  const isSuperAdmin = role === 'admin' || role === 'super_admin'

  if (!orgId) {
    return { recentProjects: [], isSuperAdmin }
  }

  try {
    const db = getDatabase()
    const projects = await db.builderProject.findMany({
      where: { organizationId: orgId, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 7,
      select: { id: true, name: true, status: true },
    })

    return {
      recentProjects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status as string,
      })),
      isSuperAdmin,
    }
  } catch (err) {
    console.error('[getBuilderSidebarData] Failed to load sidebar data:', err)
    return { recentProjects: [], isSuperAdmin }
  }
}
