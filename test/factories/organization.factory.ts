/**
 * Organization factory — produces Organization rows with sane defaults
 * and helpers to attach users via UserOrganization.
 */

import type { Organization, Prisma, PrismaClient, User, UserOrganization } from '@prisma/client'

type TxOrClient = PrismaClient | Prisma.TransactionClient

let seq = 0
const nextSeq = () => ++seq

export interface OrganizationOverrides {
  name?: string
  slug?: string
  type?: 'pf' | 'pj'
  document?: string | null
  isActive?: boolean
  billingType?: string
  maxInstances?: number
  maxUsers?: number
  customDomain?: string | null
  timezone?: string
  primaryColor?: string
  secondaryColor?: string
  providerType?: string
}

export async function makeOrganization(
  tx: TxOrClient,
  overrides: OrganizationOverrides = {},
): Promise<Organization> {
  const n = nextSeq()
  return tx.organization.create({
    data: {
      name: overrides.name ?? `Test Org ${n}`,
      slug: overrides.slug ?? `test-org-${n}-${Date.now()}`,
      type: overrides.type ?? 'pj',
      document: overrides.document ?? null,
      isActive: overrides.isActive ?? true,
      billingType: overrides.billingType ?? 'free',
      maxInstances: overrides.maxInstances ?? 1,
      maxUsers: overrides.maxUsers ?? 5,
      customDomain: overrides.customDomain ?? null,
      timezone: overrides.timezone ?? 'America/Sao_Paulo',
      primaryColor: overrides.primaryColor ?? '#0066ff',
      secondaryColor: overrides.secondaryColor ?? '#003399',
      providerType: overrides.providerType ?? 'uazapi',
    },
  })
}

export interface MembershipOverrides {
  role?: 'master' | 'manager' | 'user'
  isActive?: boolean
  customRoleId?: string | null
}

/**
 * Creates a UserOrganization membership and sets the user's currentOrgId
 * if not already set. Use this to put a user "inside" an org for tests
 * that filter by organizationId.
 */
export async function addUserToOrg(
  tx: TxOrClient,
  user: Pick<User, 'id' | 'currentOrgId'>,
  org: Pick<Organization, 'id'>,
  overrides: MembershipOverrides = {},
): Promise<UserOrganization> {
  const membership = await tx.userOrganization.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      role: overrides.role ?? 'master',
      isActive: overrides.isActive ?? true,
      customRoleId: overrides.customRoleId ?? null,
    },
  })

  if (!user.currentOrgId) {
    await tx.user.update({
      where: { id: user.id },
      data: { currentOrgId: org.id },
    })
  }

  return membership
}

/**
 * Shortcut: create org + user + membership in one call, returning all three.
 */
export async function makeUserInOrg(
  tx: TxOrClient,
  makeUser: (tx: TxOrClient) => Promise<User>,
  orgOverrides: OrganizationOverrides = {},
  membershipOverrides: MembershipOverrides = {},
): Promise<{ user: User; org: Organization; membership: UserOrganization }> {
  const org = await makeOrganization(tx, orgOverrides)
  const user = await makeUser(tx)
  const membership = await addUserToOrg(tx, user, org, membershipOverrides)
  const refreshed = await tx.user.findUniqueOrThrow({ where: { id: user.id } })
  return { user: refreshed, org, membership }
}
