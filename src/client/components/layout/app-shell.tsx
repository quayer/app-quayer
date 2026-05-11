import type { ReactNode } from 'react'
import { AppShellClient } from './app-shell-client'
import { getBuilderSidebarData } from '@/server/ai-module/builder/get-sidebar-data'

interface AppShellProps {
  children: ReactNode
  /** Opcional: substitui a `<BuilderSidebar>` padrão por outra sidebar. */
  sidebar?: ReactNode
}

/**
 * AppShell — Server Component. Layout padrão v3 do Quayer para TODAS as
 * rotas autenticadas. Fetcha dados da sidebar server-side e delega o
 * render + estado de visibilidade para o <AppShellClient>.
 */
export async function AppShell({ children, sidebar }: AppShellProps) {
  const { recentProjects } = await getBuilderSidebarData()

  return (
    <AppShellClient
      recentProjects={recentProjects}
      sidebarOverride={sidebar}
    >
      {children}
    </AppShellClient>
  )
}
