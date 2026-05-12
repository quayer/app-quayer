import type { ReactNode } from 'react'
import { AppShell } from '@/client/components/layout/app-shell'
import { OrgTabs } from '@/client/components/org/org-tabs'

/**
 * OrgLayout — wraps /org/* routes (geral, equipe, billing) in the
 * AppShell + a top tab nav. Each tab is a full page (/org, /org/equipe,
 * /org/billing). The active tab is detected client-side from usePathname.
 */
export default async function OrgLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <AppShell>
      <div className="container mx-auto px-4 py-8">
        <OrgTabs />
        <div className="mt-6">{children}</div>
      </div>
    </AppShell>
  )
}
