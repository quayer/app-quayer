import type { ReactNode } from 'react'
import { BuilderSidebar } from './builder-sidebar'
import { getBuilderSidebarData } from '@/server/ai-module/builder/get-sidebar-data'

/**
 * AppShell — Server Component que resolve os dados da sidebar
 * e renderiza o layout padrão do Quayer Builder.
 *
 * Uso (dentro de um layout.tsx autenticado):
 *   export default async function MyLayout({ children }) {
 *     return <AppShell>{children}</AppShell>
 *   }
 *
 * Responsabilidades:
 *  - Buscar projetos recentes + role do usuário via middleware headers
 *  - Renderizar <BuilderSidebar> à esquerda (oculta em mobile)
 *  - Renderizar conteúdo à direita num container flexível
 *
 * Mobile (< lg): sidebar oculta; usuário navega pelo header da página filha.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const { recentProjects, isSuperAdmin } = await getBuilderSidebarData()

  return (
    <div className="flex min-h-screen bg-background">
      <BuilderSidebar
        recentProjects={recentProjects}
        isSuperAdmin={isSuperAdmin}
      />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}
