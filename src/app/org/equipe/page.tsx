import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import type { Metadata } from 'next'
import { getDatabase } from '@/server/services/database'
import { TeamList, type TeamMember, type TeamInvitation } from '@/client/components/org/team-list'

export const metadata: Metadata = {
  title: 'Equipe | Quayer',
}

export const dynamic = 'force-dynamic'

export default async function OrgTeamPage() {
  const headersList = await headers()
  const userId = headersList.get('x-user-id')
  const orgId = headersList.get('x-current-org-id')

  if (!userId) redirect('/login')
  if (!orgId) redirect('/')

  const db = getDatabase()

  const [memberships, invitations] = await Promise.all([
    db.userOrganization.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            emailVerified: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    db.invitation.findMany({
      // Schema uses `usedAt` (not `acceptedAt`); pending = never used + not expired.
      where: {
        organizationId: orgId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
    }),
  ])

  const members: TeamMember[] = memberships.map((m) => ({
    id: m.id,
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    membershipRole: m.role,
    systemRole: m.user.role,
    emailVerified: m.user.emailVerified !== null,
    joinedAt: m.createdAt.toISOString(),
  }))

  const pending: TeamInvitation[] = invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
  }))

  return <TeamList members={members} invitations={pending} />
}
