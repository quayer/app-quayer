import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { listRecentProjects } from '@/server/ai-module/builder/queries'
import { AppShell } from '@/client/components/layout/app-shell'
import { HomePage } from '@/client/components/home/home-page'

/**
 * Root Page — Quayer Builder Home (US-021)
 *
 * Server Component. Middleware injeta x-user-id / x-current-org-id.
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

  return (
    <AppShell>
      <HomePage recentProjects={recentProjects} />
    </AppShell>
  )
}
