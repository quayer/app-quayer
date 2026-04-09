import { AppShell } from "@/client/components/layout/app-shell"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppShell>{children}</AppShell>
}
