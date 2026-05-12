import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { getDatabase } from '@/server/services/database'
import { OrgSettingsForm, type OrgSettingsData } from '@/client/components/org/org-settings-form'

export const metadata: Metadata = {
  title: 'Configurações da Organização | Quayer',
}

export const dynamic = 'force-dynamic'

export default async function OrgGeneralPage() {
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  const orgId = headersList.get('x-current-org-id')

  if (!userId) redirect('/login')
  if (!orgId) redirect('/')

  const db = getDatabase()
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: {
      id: true,
      name: true,
      slug: true,
      document: true,
      type: true,
      maxInstances: true,
      maxUsers: true,
      billingType: true,
      isActive: true,
      createdAt: true,
    },
  })

  if (!org) redirect('/')

  // Narrow types for the client component.
  const data: OrgSettingsData = {
    id: org.id,
    name: org.name,
    slug: org.slug,
    document: org.document,
    type: org.type === 'pj' ? 'pj' : 'pf',
    maxInstances: org.maxInstances,
    maxUsers: org.maxUsers,
    billingType:
      org.billingType === 'pro'
        ? 'pro'
        : org.billingType === 'basic'
          ? 'basic'
          : 'free',
    isActive: org.isActive,
    createdAt: org.createdAt.toISOString(),
  }

  return <OrgSettingsForm data={data} />
}
