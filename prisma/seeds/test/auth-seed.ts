/**
 * Auth integration test seed.
 *
 * Idempotent fixtures (upsert) shared across C4 integration tests.
 * Tests that need ephemeral data should use `test/factories/` + `withTransaction`
 * instead of mutating these long-lived rows.
 *
 * Roster:
 *   org-default        Test Org              type=pj, billing=free, max 5 users
 *   confirmed@test     emailVerified, master role in org-default
 *   pending@test       emailVerified=null (mid-signup)
 *   twofa@test         emailVerified, twoFactorEnabled=true (no TotpDevice — tests create per case)
 *   admin@test         role='admin', system-wide
 *   multiorg@test      member of org-default AND org-secondary
 *   org-secondary      Test Org Secondary    used to exercise switch-organization
 *
 * All emails end in @test.local so production audit/analytics queries can
 * filter them out via `email NOT LIKE '%@test.local'`.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set for auth seed');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const PLACEHOLDER_BCRYPT = '$2a$10$testtesttesttesttesttuQpQpQpQpQpQpQpQpQpQpQpQpQpQpQ';

async function main() {
  const orgDefault = await prisma.organization.upsert({
    where: { slug: 'test-org' },
    update: {},
    create: { name: 'Test Org', slug: 'test-org', type: 'pj' },
  });

  const orgSecondary = await prisma.organization.upsert({
    where: { slug: 'test-org-secondary' },
    update: {},
    create: { name: 'Test Org Secondary', slug: 'test-org-secondary', type: 'pj' },
  });

  const confirmed = await prisma.user.upsert({
    where: { email: 'confirmed@test.local' },
    update: { emailVerified: new Date(), isActive: true },
    create: {
      email: 'confirmed@test.local',
      name: 'Confirmed Test User',
      emailVerified: new Date(),
      isActive: true,
      password: PLACEHOLDER_BCRYPT,
      onboardingCompleted: true,
      currentOrgId: orgDefault.id,
    },
  });

  const pending = await prisma.user.upsert({
    where: { email: 'pending@test.local' },
    update: { emailVerified: null, isActive: true },
    create: {
      email: 'pending@test.local',
      name: 'Pending Test User',
      emailVerified: null,
      isActive: true,
      password: null,
      onboardingCompleted: false,
    },
  });

  const twofa = await prisma.user.upsert({
    where: { email: 'twofa@test.local' },
    update: { twoFactorEnabled: true, isActive: true },
    create: {
      email: 'twofa@test.local',
      name: 'Two FA Test User',
      emailVerified: new Date(),
      isActive: true,
      twoFactorEnabled: true,
      onboardingCompleted: true,
      currentOrgId: orgDefault.id,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@test.local' },
    update: { role: 'admin', isActive: true },
    create: {
      email: 'admin@test.local',
      name: 'Admin Test User',
      role: 'admin',
      emailVerified: new Date(),
      isActive: true,
      password: PLACEHOLDER_BCRYPT,
      onboardingCompleted: true,
    },
  });

  const multiorg = await prisma.user.upsert({
    where: { email: 'multiorg@test.local' },
    update: { isActive: true },
    create: {
      email: 'multiorg@test.local',
      name: 'Multi Org Test User',
      emailVerified: new Date(),
      isActive: true,
      onboardingCompleted: true,
      currentOrgId: orgDefault.id,
    },
  });

  // Memberships -----------------------------------------------------------
  for (const [user, org, role] of [
    [confirmed, orgDefault, 'master'],
    [twofa, orgDefault, 'manager'],
    [multiorg, orgDefault, 'user'],
    [multiorg, orgSecondary, 'master'],
  ] as const) {
    await prisma.userOrganization.upsert({
      where: {
        userId_organizationId: { userId: user.id, organizationId: org.id },
      },
      update: { role, isActive: true },
      create: { userId: user.id, organizationId: org.id, role, isActive: true },
    });
  }

  console.log('[auth-seed] orgs=%s,%s users=%s,%s,%s,%s,%s',
    orgDefault.id, orgSecondary.id,
    confirmed.id, pending.id, twofa.id, admin.id, multiorg.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
