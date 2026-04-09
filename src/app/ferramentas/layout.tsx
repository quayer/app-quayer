import { AppShell } from '@/client/components/layout/app-shell'

export default async function FerramentasLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AppShell>{children}</AppShell>
}
