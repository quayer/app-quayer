import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { listOrgInstances } from '@/server/communication/instances/queries'
import { CanaisPagina } from '@/client/components/canais/canais-page'

export const metadata: Metadata = {
  title: 'Canais | Quayer',
}

export const dynamic = 'force-dynamic'

export default async function CanaisPage() {
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  const orgId = headersList.get('x-current-org-id')

  if (!userId) {
    redirect('/login')
  }
  if (!orgId) {
    redirect('/')
  }

  const rawInstances = await listOrgInstances(orgId)

  // Serialize Prisma Date objects to ISO strings before passing to client component.
  const initialInstances = rawInstances.map((i) => ({
    id: i.id,
    name: i.name,
    phoneNumber: i.phoneNumber,
    status: i.status as string,
    channel: String((i as Record<string, unknown>).channel ?? ''),
    provider: String((i as Record<string, unknown>).provider ?? ''),
    brokerType: String((i as Record<string, unknown>).brokerType ?? ''),
    connectedProjects: i.connectedProjects,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt?.toISOString() ?? undefined,
    uazapiToken: ((i as Record<string, unknown>).uazapiToken as string | null) ?? null,
    brokerId: ((i as Record<string, unknown>).brokerId as string | null) ?? null,
  }))

  return <CanaisPagina initialInstances={initialInstances} />
}
