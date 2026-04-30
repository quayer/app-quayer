import { AppShell } from '@/client/components/layout/app-shell'

/**
 * ContaLayout — envolve as rotas /conta/* na AppShell (sidebar + tema).
 *
 * /conta é o domínio de configurações pessoais do usuário (perfil, segurança,
 * notificações, sessões). Para configurações da organização, ver /org.
 */
export default async function ContaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppShell>{children}</AppShell>
}
