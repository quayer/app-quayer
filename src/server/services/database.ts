import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

type GlobalWithPrisma = typeof globalThis & { prisma?: PrismaClient }
const globalForPrisma = globalThis as GlobalWithPrisma

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const database = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = database
}

export function getDatabase(): PrismaClient {
  return database
}
