/**
 * Database Setup Helper for Tests
 *
 * Manages database state for integration tests:
 * - Creates test database if needed
 * - Runs migrations
 * - Seeds test data
 * - Cleans up after tests
 *
 * Usage:
 * ```typescript
 * import { setupTestDatabase, cleanupTestDatabase } from './helpers/database-setup'
 *
 * beforeAll(async () => {
 *   await setupTestDatabase()
 * })
 *
 * afterAll(async () => {
 *   await cleanupTestDatabase()
 * })
 * ```
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import { PrismaClient } from '@prisma/client'

const execAsync = promisify(exec)

let prisma: PrismaClient | null = null

/**
 * Get Prisma client instance
 */
export function getPrismaTestClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL || process.env.DATABASE_URL_TEST,
        },
      },
      log: process.env.DEBUG_TESTS === 'true' ? ['query', 'error', 'warn'] : ['error'],
    })
  }
  return prisma
}

/**
 * Setup test database
 * - Ensures migrations are applied
 * - Optionally seeds test data
 */
export async function setupTestDatabase(options?: {
  seed?: boolean
  clean?: boolean
}): Promise<void> {
  const { seed = false, clean = false } = options || {}

  console.log('🔧 Setting up test database...')

  try {
    // Clean database if requested
    if (clean) {
      console.log('🧹 Cleaning existing data...')
      await cleanDatabase()
    }

    // Run migrations
    console.log('🔄 Running migrations...')
    await execAsync('npx prisma migrate deploy', {
      env: {
        ...process.env,
        DATABASE_URL: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
      },
    })

    // Seed test data if requested
    if (seed) {
      console.log('🌱 Seeding test data...')
      await seedTestData()
    }

    console.log('✅ Test database ready')
  } catch (error: any) {
    console.error('❌ Failed to setup test database:', error.message)
    throw error
  }
}

/**
 * Cleanup test database
 * - Closes Prisma connection
 * - Optionally drops test data
 */
export async function cleanupTestDatabase(options?: {
  dropData?: boolean
}): Promise<void> {
  const { dropData = false } = options || {}

  console.log('🧹 Cleaning up test database...')

  try {
    if (dropData) {
      await cleanDatabase()
    }

    // Close Prisma connection
    if (prisma) {
      await prisma.$disconnect()
      prisma = null
    }

    console.log('✅ Test database cleaned up')
  } catch (error: any) {
    console.error('⚠️  Error during cleanup:', error.message)
    throw error
  }
}

/**
 * Clean all data from database
 * Preserves schema structure
 */
export async function cleanDatabase(): Promise<void> {
  const client = getPrismaTestClient()

  // Order matters due to foreign key constraints
  // Use actual PostgreSQL table names (some are mapped via @@map)
  const tables = [
    'RefreshToken',
    'TempUser',
    'Message',
    'ChatSession',
    'connections', // Connection model mapped to "connections"
    'UserOrganization',
    'Organization',
    'User',
    // Add more tables as needed
  ]

  for (const table of tables) {
    try {
      await client.$executeRawUnsafe(`DELETE FROM "${table}"`)
      console.log(`  ✓ Cleaned ${table}`)
    } catch (error: any) {
      // Ignore if table doesn't exist
      if (!error.message.includes('does not exist')) {
        console.warn(`  ⚠ Could not clean ${table}:`, error.message)
      }
    }
  }
}

/**
 * Seed test data
 * Creates minimal data needed for tests
 */
export async function seedTestData(): Promise<void> {
  const client = getPrismaTestClient()

  try {
    // Create test admin user
    const adminUser = await client.user.upsert({
      where: { email: 'admin@test.com' },
      update: {},
      create: {
        email: 'admin@test.com',
        name: 'Test Admin',
        role: 'admin',
        password: '$2a$10$1234567890123456789012', // Hashed password placeholder for tests
        emailVerified: new Date(),
      },
    })

    console.log('  ✓ Created admin user:', adminUser.email)

    // Create test organization
    const testOrg = await client.organization.upsert({
      where: { slug: 'test-org' },
      update: {},
      create: {
        name: 'Test Organization',
        slug: 'test-org',
        document: '12345678901', // CPF test
        type: 'pf',
      },
    })

    console.log('  ✓ Created test organization:', testOrg.slug)

    // Create master user with organization
    const masterUser = await client.user.upsert({
      where: { email: 'master@test.com' },
      update: {},
      create: {
        email: 'master@test.com',
        name: 'Test Master',
        role: 'user',
        password: '$2a$10$1234567890123456789012', // Hashed password placeholder for tests
        emailVerified: new Date(),
        currentOrgId: testOrg.id,
      },
    })

    console.log('  ✓ Created master user:', masterUser.email)

    // Link master to organization
    await client.userOrganization.upsert({
      where: {
        userId_organizationId: {
          userId: masterUser.id,
          organizationId: testOrg.id,
        },
      },
      update: {},
      create: {
        userId: masterUser.id,
        organizationId: testOrg.id,
        role: 'master',
        isActive: true,
      },
    })

    console.log('  ✓ Linked master to organization')

    // Create test connection (find existing or create new)
    let testConnection = await client.connection.findFirst({
      where: { name: 'test-connection', organizationId: testOrg.id },
    })

    if (!testConnection) {
      testConnection = await client.connection.create({
        data: {
          name: 'test-connection',
          organizationId: testOrg.id,
          status: 'DISCONNECTED',
          qrCode: null,
        },
      })
    }

    console.log('  ✓ Created test connection:', testConnection.name)

    console.log('✅ Test data seeded successfully')
  } catch (error: any) {
    console.error('❌ Failed to seed test data:', error.message)
    throw error
  }
}

/**
 * Create a test user
 */
export async function createTestUser(data: {
  email: string
  name: string
  role?: 'admin' | 'user'
  organizationId?: string
  password?: string
}): Promise<any> {
  const client = getPrismaTestClient()

  const user = await client.user.create({
    data: {
      email: data.email,
      name: data.name,
      role: data.role || 'user',
      password: data.password || '$2a$10$1234567890123456789012', // Hashed password placeholder
      emailVerified: new Date(),
      currentOrgId: data.organizationId,
    },
  })

  return user
}

/**
 * Create a test organization
 */
export async function createTestOrganization(data: {
  name: string
  slug: string
  document?: string
  type?: 'pf' | 'pj'
}): Promise<any> {
  const client = getPrismaTestClient()

  const org = await client.organization.create({
    data: {
      name: data.name,
      slug: data.slug,
      document: data.document || '12345678901',
      type: data.type || 'pf',
    },
  })

  return org
}

/**
 * Create a test connection
 */
export async function createTestConnection(data: {
  name: string
  organizationId: string
  status?: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING' | 'ERROR'
}): Promise<any> {
  const client = getPrismaTestClient()

  const connection = await client.connection.create({
    data: {
      name: data.name,
      organizationId: data.organizationId,
      status: data.status || 'DISCONNECTED',
      qrCode: null,
    },
  })

  return connection
}
