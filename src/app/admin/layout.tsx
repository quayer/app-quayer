import { AppShell } from "@/client/components/layout/app-shell"
import { AdminNav } from "@/client/components/layout/admin-nav"

/**
 * AdminLayout — usa AppShell com sidebar override.
 *
 * Em vez de renderizar BuilderSidebar + AdminNav (2 sidebars empilhadas),
 * substitui a BuilderSidebar padrão pela AdminNav. Resultado:
 * 1 sidebar só (AdminNav) + conteúdo da página.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppShell sidebar={<AdminNav />}>{children}</AppShell>
}
