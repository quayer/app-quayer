import { AppShell } from "@/client/components/layout/app-shell"
import { AdminNav } from "@/client/components/layout/admin-nav"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AppShell>
      <div className="flex min-h-screen flex-1">
        <AdminNav />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </AppShell>
  )
}
