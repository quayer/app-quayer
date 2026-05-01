#!/usr/bin/env node
/**
 * Creates the default admin user if it doesn't exist.
 * Safe to run multiple times (idempotent).
 * Uses pg directly to avoid PrismaClient adapter requirements in Prisma v7.
 * Used by docker-entrypoint.sh on container startup.
 */
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  const client = await pool.connect()
  try {
    const email = process.env.ADMIN_EMAIL || 'admin@quayer.com'
    const name = process.env.ADMIN_NAME || 'Administrator'

    const { rows } = await client.query('SELECT id, role FROM "User" WHERE email = $1', [email])

    if (rows.length > 0) {
      if (rows[0].role !== 'admin') {
        await client.query('UPDATE "User" SET role = $1 WHERE email = $2', ['admin', email])
        console.log(`✅ Promoted ${email} to admin`)
      } else {
        console.log(`✅ Admin user ${email} already exists`)
      }
      return
    }

    await client.query(
      `INSERT INTO "User" (id, email, name, role, "emailVerified", "isActive", "onboardingCompleted", "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 'admin', NOW(), true, true, NOW(), NOW())`,
      [email, name]
    )
    console.log(`✅ Admin user created: ${email}`)
    console.log(`   Login via OTP at /login`)
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => {
  console.error('❌ Admin seed failed:', e.message)
  process.exit(0)
})
