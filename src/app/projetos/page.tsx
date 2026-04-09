import { redirect } from 'next/navigation'
import Link from 'next/link'
import { headers } from 'next/headers'
import { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { listOrgProjects } from '@/server/features/builder-projects/queries'
import { ProjetosList } from '@/client/components/projetos/projetos-list'
import { Button } from '@/client/components/ui/button'

export const metadata: Metadata = {
  title: 'Conversas | Quayer',
}

export const dynamic = 'force-dynamic'

export default async function ProjetosPage() {
  // Auth pattern (matches src/app/integracoes/settings/billing/actions.ts):
  // middleware populates `x-user-id` and `x-current-org-id` headers after verifying JWT.
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  const orgId = headersList.get('x-current-org-id')

  if (!userId) {
    redirect('/login')
  }
  if (!orgId) {
    redirect('/')
  }

  const projects = await listOrgProjects(orgId)

  return (
    <div className="min-h-screen bg-background">
      {/* Simple header bar (no sidebar) */}
      <header className="border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Link>
            </Button>
            <span className="text-sm font-semibold tracking-tight">Quayer</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <ProjetosList projects={projects} />
      </main>
    </div>
  )
}
