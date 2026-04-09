import { headers } from 'next/headers'
import { getDatabase } from '@/server/services/database'

/**
 * Server helper que resolve os dados necessários para <BuilderSidebar>.
 *
 * Lê `x-current-org-id` e `x-user-role` injetados pelo middleware e busca
 * os projetos recentes do Builder da org ativa.
 *
 * Totalmente defensivo: qualquer falha (ausência de headers, cliente Prisma
 * ainda sem o delegate do modelo, erro de query) degrada para sidebar vazia.
 * Nunca lança — a sidebar nunca deve quebrar o render da página.
 */
export async function getBuilderSidebarData(): Promise<{
  recentProjects: Array<{ id: string; name: string; status: string }>
  isSuperAdmin: boolean
}> {
  const fallback = { recentProjects: [], isSuperAdmin: false }

  try {
    const headersList = await headers()
    const orgId = headersList.get('x-current-org-id')
    const role = headersList.get('x-user-role')
    const isSuperAdmin = role === 'admin' || role === 'super_admin'

    if (!orgId) {
      return { recentProjects: [], isSuperAdmin }
    }

    const db = getDatabase() as unknown as {
      builderProject?: {
        findMany: (args: unknown) => Promise<
          Array<{ id: string; name: string; status: string }>
        >
      }
    }

    // Defensive: Turbopack dev cache pode servir um PrismaClient stale sem
    // o delegate `builderProject` registrado. Degrada silenciosamente.
    if (!db.builderProject || typeof db.builderProject.findMany !== 'function') {
      return { recentProjects: [], isSuperAdmin }
    }

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
        status: p.status,
      })),
      isSuperAdmin,
    }
  } catch {
    return fallback
  }
}
