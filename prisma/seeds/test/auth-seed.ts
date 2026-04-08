/**
 * US-106A — Auth integration test seed.
 *
 * Creates the minimal fixtures shared across auth integration tests:
 *   - 1 Organization (Test Org / test-org)
 *   - 1 confirmed user  (confirmed@test.local) with emailVerified set
 *   - 1 pending  user   (pending@test.local)   with emailVerified null
 *
 * Idempotent: safe to re-run (uses upsert).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: 'test-org' },
    update: {},
    create: {
      name: 'Test Org',
      slug: 'test-org',
      // Required by schema: "pf" (pessoa fisica) or "pj" (pessoa juridica)
      type: 'pj',
    },
  });

  const confirmed = await prisma.user.upsert({
    where: { email: 'confirmed@test.local' },
    update: {
      emailVerified: new Date(),
      isActive: true,
    },
    create: {
      email: 'confirmed@test.local',
      name: 'Confirmed Test User',
      emailVerified: new Date(),
      isActive: true,
      // TODO: password — placeholder bcrypt-shaped string; tests that exercise
      //       login should overwrite this with a real hash via withTransaction.
      password: '$2a$10$testtesttesttesttesttuQpQpQpQpQpQpQpQpQpQpQpQpQpQpQ',
      onboardingCompleted: true,
      currentOrgId: org.id,
    },
  });

  const pending = await prisma.user.upsert({
    where: { email: 'pending@test.local' },
    update: {
      emailVerified: null,
      isActive: true,
    },
    create: {
      email: 'pending@test.local',
      name: 'Pending Test User',
      emailVerified: null,
      isActive: true,
      // TODO: password — placeholder; pending users normally finish signup via OTP.
      password: null,
      onboardingCompleted: false,
    },
  });

  // Link confirmed user to the test org as master so org-scoped queries work.
  await prisma.userOrganization.upsert({
    where: {
      userId_organizationId: {
        userId: confirmed.id,
        organizationId: org.id,
      },
    },
    update: { role: 'master', isActive: true },
    create: {
      userId: confirmed.id,
      organizationId: org.id,
      role: 'master',
      isActive: true,
    },
  });

  console.log('[auth-seed] org=%s confirmed=%s pending=%s', org.id, confirmed.id, pending.id);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
