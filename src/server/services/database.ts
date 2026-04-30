import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

// Persist across Next.js HMR reloads in dev to avoid connection pool exhaustion
const globalForPrisma = globalThis as unknown as { _prismaClient: PrismaClient }

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  })
  return new PrismaClient({ adapter })
}

export function getDatabase(): PrismaClient {
  if (!globalForPrisma._prismaClient) {
    globalForPrisma._prismaClient = createPrismaClient()
  }
  return globalForPrisma._prismaClient
}

// Singleton proxy for backwards-compatible `database.user.findMany()` usage
export const database = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getDatabase() as any)[prop]
  },
})
