import type { Page } from '@playwright/test'

/**
 * Generate a unique disposable email for test runs.
 */
export function generateTestEmail(): string {
  return (
    'test-' +
    Date.now() +
    '-' +
    Math.random().toString(36).slice(2, 8) +
    '@test.local'
  )
}

interface VerificationCodeRow {
  code: string
}

interface UserOrgRow {
  id: string
  currentOrgId: string | null
}

interface MinimalPrismaClient {
  $connect: () => Promise<void>
  $disconnect: () => Promise<void>
  verificationCode: {
    findFirst: (args: {
      where: { identifier: string }
      orderBy: { createdAt: 'desc' }
    }) => Promise<VerificationCodeRow | null>
  }
  user: {
    findFirst: (args: {
      where: { email: string }
      select: { id: true; currentOrgId: true }
    }) => Promise<UserOrgRow | null>
  }
}

/**
 * Fetch the latest OTP code emitted for a given identifier (email or phone).
 *
 * Reads directly from the database via Prisma. Requires TEST_DATABASE_URL or
 * DATABASE_URL to be set in the environment running the Playwright suite.
 */
export async function getLatestOtp(email: string): Promise<string> {
  try {
    const databaseUrl =
      process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new Error('No database URL configured')
    }

    // Lazy import so the spec file does not fail to load if Prisma is missing.
    const mod = (await import('@prisma/client')) as {
      PrismaClient: new (opts?: {
        datasources?: { db: { url: string } }
      }) => MinimalPrismaClient
    }
    const prisma: MinimalPrismaClient = new mod.PrismaClient({
      datasources: { db: { url: databaseUrl } },
    })

    try {
      await prisma.$connect()
      const row = await prisma.verificationCode.findFirst({
        where: { identifier: email },
        orderBy: { createdAt: 'desc' },
      })
      if (!row) {
        throw new Error('No verification code found for ' + email)
      }
      return row.code
    } finally {
      await prisma.$disconnect()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      'OTP capture failed - ensure TEST_DATABASE_URL is set (' + message + ')'
    )
  }
}

/**
 * Read a logged-in user's id + active organization id straight from the test DB.
 *
 * Used by E2E specs that must seed tenant-scoped rows (BuilderProject, published
 * AIAgentConfig, …) for the SAME org the OTP session is bound to. The login flow
 * provisions the user + org server-side; this returns the `currentOrgId` the
 * session's `authProcedure` will resolve, so seeded rows are visible to the API
 * calls the spec drives. Requires TEST_DATABASE_URL or DATABASE_URL, exactly like
 * {@link getLatestOtp}.
 */
export async function getUserOrgId(
  email: string
): Promise<{ userId: string; organizationId: string }> {
  try {
    const databaseUrl =
      process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    if (!databaseUrl) {
      throw new Error('No database URL configured')
    }

    const mod = (await import('@prisma/client')) as {
      PrismaClient: new (opts?: {
        datasources?: { db: { url: string } }
      }) => MinimalPrismaClient
    }
    const prisma: MinimalPrismaClient = new mod.PrismaClient({
      datasources: { db: { url: databaseUrl } },
    })

    try {
      await prisma.$connect()
      const row = await prisma.user.findFirst({
        where: { email },
        select: { id: true, currentOrgId: true },
      })
      if (!row) {
        throw new Error('No user found for ' + email)
      }
      if (!row.currentOrgId) {
        throw new Error('User ' + email + ' has no currentOrgId set')
      }
      return { userId: row.id, organizationId: row.currentOrgId }
    } finally {
      await prisma.$disconnect()
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(
      'User/org lookup failed - ensure TEST_DATABASE_URL is set (' +
        message +
        ')'
    )
  }
}

/**
 * Wait for the page URL to match a regex, throwing on timeout.
 */
export async function waitForRedirect(
  page: Page,
  pattern: RegExp,
  timeoutMs = 10000
): Promise<void> {
  await page.waitForURL(pattern, { timeout: timeoutMs })
}
