import type { ReactNode } from 'react'
import { cookies, headers } from 'next/headers'
import { AppShellClient } from './app-shell-client'
import { getBuilderSidebarData } from '@/server/ai-module/builder/get-sidebar-data'

interface AppShellProps {
  children: ReactNode
  /** Opcional: substitui a `<BuilderSidebar>` padrão por outra sidebar. */
  sidebar?: ReactNode
  /** Preferencia inicial da sidebar quando o caller ja sabe o estado desejado. */
  initialSidebarCollapsed?: boolean
}

const SIDEBAR_COLLAPSED_COOKIE = 'quayer.sidebar.collapsed'

function isWorkspacePath(pathname: string | null): boolean {
  return /^\/projetos\/[^/]+/.test(pathname ?? '')
}

/**
 * AppShell — Server Component. Layout padrão v3 do Quayer para TODAS as
 * rotas autenticadas. Fetcha dados da sidebar server-side e delega o
 * render + estado de visibilidade para o <AppShellClient>.
 */
export async function AppShell({
  children,
  sidebar,
  initialSidebarCollapsed,
}: AppShellProps) {
  const { recentProjects } = await getBuilderSidebarData()
  const [cookieStore, headersList] = await Promise.all([cookies(), headers()])
  const persistedCollapsed =
    cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value === 'true'
  const shouldCollapseForWorkspace = isWorkspacePath(
    headersList.get('x-pathname'),
  )

  return (
    <AppShellClient
      recentProjects={recentProjects}
      sidebarOverride={sidebar}
      initialCollapsed={
        initialSidebarCollapsed ?? (shouldCollapseForWorkspace || persistedCollapsed)
      }
    >
      {children}
    </AppShellClient>
  )
}
