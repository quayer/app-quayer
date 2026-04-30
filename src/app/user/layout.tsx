import { AppShell } from "@/client/components/layout/app-shell"

/**
 * UserLayout — wraps /user/* routes (seguranca, dashboard, etc) in
 * the AppShell so they render with the BuilderSidebar + theme.
 *
 * Was missing entirely, which is why /user/seguranca rendered as a
 * naked page without sidebar.
 */
export default async function UserLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppShell>{children}</AppShell>
}
