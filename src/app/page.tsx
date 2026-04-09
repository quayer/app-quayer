import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { getDatabase } from '@/server/services/database'
import { AppShell } from '@/client/components/layout/app-shell'
import { HomePage } from '@/client/components/home/home-page'

/**
 * Root Page — Quayer Builder Home (US-021)
 *
 * Server Component. Middleware injeta `x-user-id` / `x-current-org-id`.
 * Renderiza a nova shell (com BuilderSidebar) + <HomePage> no main.
 */
export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  const orgId = headersList.get('x-current-org-id')

  if (!userId) {
    redirect('/login')
  }

  let recentProjects: Array<{
    id: string
    name: string
    status: string
    type: string
  }> = []

  if (orgId) {
    try {
      const db = getDatabase() as unknown as {
        builderProject?: {
          findMany: (args: unknown) => Promise<
            Array<{ id: string; name: string; status: string; type: string }>
          >
        }
      }
      if (db.builderProject && typeof db.builderProject.findMany === 'function') {
        const projects = await db.builderProject.findMany({
          where: { organizationId: orgId, archivedAt: null },
          orderBy: { updatedAt: 'desc' },
          take: 7,
          select: { id: true, name: true, status: true, type: true },
        })
        recentProjects = projects
      }
    } catch {
      // Silent fallback — Turbopack dev cache pode servir um PrismaClient stale.
      // Degrada para lista vazia em vez de crashar o render.
    }
  }

  return (
    <AppShell>
      <HomePage recentProjects={recentProjects} />
    </AppShell>
  )
}
