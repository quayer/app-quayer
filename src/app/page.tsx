import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { database } from '@/server/services/database'
import { BuilderSidebar } from '@/client/components/layout/builder-sidebar'
import { HomePage } from '@/client/components/home/home-page'

/**
 * Root Page — Quayer Builder Home (US-021)
 *
 * Server Component: lê o JWT do cookie, busca os projetos recentes do Builder
 * da org atual e renderiza o layout `<BuilderSidebar> + <HomePage>`.
 *
 * Middleware global já garante que rotas protegidas exigem accessToken.
 * Fazemos a verificação aqui também como defense-in-depth.
 */
export default async function RootPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('accessToken')?.value

  if (!token) {
    redirect('/login')
  }

  const payload = verifyAccessToken(token)
  if (!payload) {
    redirect('/login')
  }

  // Sem org selecionada → fluxo de onboarding/seleção de org cuida disso
  const orgId = payload.currentOrgId ?? null

  const projects = orgId
    ? await database.builderProject.findMany({
        where: {
          organizationId: orgId,
          archivedAt: null,
        },
        orderBy: { updatedAt: 'desc' },
        take: 7,
        select: {
          id: true,
          name: true,
          status: true,
          type: true,
        },
      })
    : []

  const recentProjects = projects.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status as string,
    type: p.type as string,
  }))

  const isSuperAdmin = payload.role === 'admin'

  return (
    <div className="flex min-h-screen bg-background">
      <BuilderSidebar
        recentProjects={recentProjects.map(({ id, name, status }) => ({
          id,
          name,
          status,
        }))}
        isSuperAdmin={isSuperAdmin}
      />
      <HomePage recentProjects={recentProjects} />
    </div>
  )
}
