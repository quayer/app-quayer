import { PrismaClient } from '@prisma/client'

/**
 * Prisma client instance for database operations.
 *
 * @remarks
 * Uses singleton pattern to prevent multiple instances during hot-reload.
 * Provides type-safe database access with Prisma ORM.
 * Includes alias `instance` -> `connection` for backward compatibility.
 *
 * @see https://www.prisma.io/docs/concepts/components/prisma-client
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

/**
 * Extended database client with model aliases
 *
 * - `database.connection` - Model real do Prisma (Connection)
 * - `database.instance` - Alias para `connection` (backward compatibility)
 */
export const database = Object.assign(prisma, {
  /**
   * Alias for `connection` model.
   * Use this when working with WhatsApp/provider instances.
   *
   * @deprecated Prefer using `database.connection` directly
   */
  get instance() {
    return prisma.connection
  }
})
