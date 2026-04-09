import type { ReactNode } from 'react'
import { BuilderSidebar } from './builder-sidebar'
import { getBuilderSidebarData } from '@/server/ai-module/builder/get-sidebar-data'

/**
 * AppShell — Server Component. Layout padrão v3 do Quayer para TODAS as
 * rotas autenticadas.
 *
 * - Fundo #000 (var(--color-bg-base)) e texto branco (var(--color-text-primary))
 * - Fonte DM Sans
 * - Sidebar fixa à esquerda em desktop (>= lg), oculta em mobile
 * - `data-app-v3="true"` permite hooks CSS opt-in nas páginas filhas
 *
 * Usado por layouts de /admin, /contatos, /conversas, /ferramentas,
 * /integracoes, /projetos e a home /.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const { recentProjects, isSuperAdmin } = await getBuilderSidebarData()

  return (
    <div
      data-app-v3="true"
      className="flex min-h-screen"
      style={{
        backgroundColor: 'var(--color-bg-base, #000000)',
        color: 'var(--color-text-primary, #ffffff)',
        fontFamily: "var(--font-dm-sans), 'DM Sans', system-ui, sans-serif",
      }}
    >
      <BuilderSidebar
        recentProjects={recentProjects}
        isSuperAdmin={isSuperAdmin}
      />
      <main className="flex min-h-screen flex-1 flex-col min-w-0">
        {children}
      </main>
    </div>
  )
}
