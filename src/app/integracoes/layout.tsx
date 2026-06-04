import { AppShell } from '@/client/components/layout/app-shell'

export default async function IntegracoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <div className="container mx-auto px-4 py-8">{children}</div>
    </AppShell>
  )
}
