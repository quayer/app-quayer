import { AppShell } from "@/client/components/layout/app-shell"
import { ErrorBoundary } from "@/client/components/error-boundary"

export default async function IntegracoesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ErrorBoundary>
      <AppShell>{children}</AppShell>
    </ErrorBoundary>
  )
}
