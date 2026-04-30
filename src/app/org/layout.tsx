import { AppShell } from '@/client/components/layout/app-shell'

/**
 * OrgLayout — shell compartilhado das páginas de configuração da Organização
 * (`/org`, `/org/equipe`, etc.).
 *
 * Reusa a mesma AppShell padrão (com BuilderSidebar) — diferente do /admin,
 * aqui não há sidebar override porque queremos a navegação principal do
 * produto visível.
 */
export default async function OrgLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppShell>{children}</AppShell>
}
