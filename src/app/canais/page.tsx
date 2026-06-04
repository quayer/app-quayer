import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getDatabase } from '@/server/services/database'
import { AppShell } from '@/client/components/layout/app-shell'
import {
  CanaisPage,
  type CanaisConnection,
} from '@/client/components/canais/canais-page'

/**
 * /canais — Lista as conexões WhatsApp (Connection) da organização ativa.
 *
 * Server Component: lê direto via Prisma (não há ainda controller Igniter
 * `listConnections` — usar diretamente até o backend ser criado).
 *
 * Auth: middleware injeta x-user-id e x-current-org-id no header da request.
 */

export const metadata: Metadata = {
  title: 'Canais | Quayer',
}

export const dynamic = 'force-dynamic'

export default async function CanaisRoute() {
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  const orgId = headersList.get('x-current-org-id')

  if (!userId) {
    redirect('/login')
  }
  if (!orgId) {
    redirect('/')
  }

  const db = getDatabase()
  const rows = await db.connection.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      channel: true,
      provider: true,
      status: true,
      phoneNumber: true,
      profileName: true,
      profilePictureUrl: true,
      isBusiness: true,
      uazapiInstanceId: true,
      lastConnected: true,
      lastDisconnect: true,
      lastDisconnectReason: true,
      cloudApiPhoneNumberId: true,
      cloudApiVerifiedName: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  // Serializar dates → ISO string para passar boundary server → client sem
  // depender do RSC Flight serializer de Date.
  const connections: CanaisConnection[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    channel: c.channel,
    provider: c.provider,
    status: c.status,
    phoneNumber: c.phoneNumber,
    profileName: c.profileName,
    profilePictureUrl: c.profilePictureUrl,
    isBusiness: c.isBusiness,
    uazapiInstanceId: c.uazapiInstanceId,
    lastConnected: c.lastConnected ? c.lastConnected.toISOString() : null,
    lastDisconnect: c.lastDisconnect ? c.lastDisconnect.toISOString() : null,
    lastDisconnectReason: c.lastDisconnectReason,
    cloudApiPhoneNumberId: c.cloudApiPhoneNumberId,
    cloudApiVerifiedName: c.cloudApiVerifiedName,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }))

  return (
    <AppShell>
      <div className="container mx-auto px-4 py-8">
        <CanaisPage connections={connections} />
      </div>
    </AppShell>
  )
}
