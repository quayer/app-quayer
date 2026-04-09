import { AppShell } from "@/client/components/layout/app-shell"

export default async function RecursosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppShell>{children}</AppShell>
}
