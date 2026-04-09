import type { ReactNode } from 'react'
import { AppShellClient } from './app-shell-client'
import { getBuilderSidebarData } from '@/server/ai-module/builder/get-sidebar-data'

/**
 * AppShell — Server Component. Layout padrão v3 do Quayer para TODAS as
 * rotas autenticadas.
 *
 * Responsável por fetchar os dados da sidebar server-side e delegar o
 * render + estado de visibilidade para o <AppShellClient>.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const { recentProjects, isSuperAdmin } = await getBuilderSidebarData()

  return (
    <AppShellClient
      recentProjects={recentProjects}
      isSuperAdmin={isSuperAdmin}
    >
      {children}
    </AppShellClient>
  )
}
