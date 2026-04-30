import type { ReactNode } from 'react'
import { AppShellClient } from './app-shell-client'
import { getBuilderSidebarData } from '@/server/ai-module/builder/get-sidebar-data'

interface AppShellProps {
  children: ReactNode
  /**
   * Opcional: substitui a `<BuilderSidebar>` padrão por outra sidebar.
   * Usado pelo `/admin/*` pra renderizar a `<AdminNav>` como única sidebar
   * e evitar o problema de 2 sidebars em cascata.
   */
  sidebar?: ReactNode
}

/**
 * AppShell — Server Component. Layout padrão v3 do Quayer para TODAS as
 * rotas autenticadas.
 *
 * Responsável por fetchar os dados da sidebar server-side e delegar o
 * render + estado de visibilidade para o <AppShellClient>.
 */
export async function AppShell({ children, sidebar }: AppShellProps) {
  const { recentProjects, isSuperAdmin } = await getBuilderSidebarData()

  return (
    <AppShellClient
      recentProjects={recentProjects}
      isSuperAdmin={isSuperAdmin}
      sidebarOverride={sidebar}
    >
      {children}
    </AppShellClient>
  )
}
