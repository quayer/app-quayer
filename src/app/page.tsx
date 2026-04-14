import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { listRecentProjects } from '@/server/ai-module/builder/queries'
import { RESOURCES } from '@/server/ai-module/content/content.data'
import { AppShell } from '@/client/components/layout/app-shell'
import { HomePage } from '@/client/components/home/home-page'

/**
 * Root Page — Quayer Builder Home (US-021)
 *
 * Server Component. Middleware injeta x-user-id / x-current-org-id.
 * Renderiza a nova shell (com BuilderSidebar) + <HomePage> no main,
 * passando projetos recentes e os 3 últimos recursos pra timeline inline.
 */
export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  const orgId = headersList.get('x-current-org-id')

  if (!userId) {
    redirect('/login')
  }

  const recentProjects = orgId ? await listRecentProjects(orgId) : []
  const recentResources = RESOURCES.slice(0, 3).map((r) => ({
    slug: r.slug,
    title: r.title,
    categoryLabel: r.categoryLabel,
    description: r.description,
    publishedAt: r.publishedAt,
  }))

  return (
    <AppShell>
      <HomePage
        recentProjects={recentProjects}
        recentResources={recentResources}
      />
    </AppShell>
  )
}
