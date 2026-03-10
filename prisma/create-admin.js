#!/usr/bin/env node
/**
 * Creates the default admin user if it doesn't exist.
 * Safe to run multiple times (upsert).
 * Used by docker-entrypoint.sh on container startup.
 */
const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@quayer.com'
  const name = process.env.ADMIN_NAME || 'Administrator'

  // Check if admin already exists
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.role !== 'admin') {
      await prisma.user.update({ where: { email }, data: { role: 'admin' } })
      console.log(`✅ Promoted ${email} to admin`)
    } else {
      console.log(`✅ Admin user ${email} already exists`)
    }
    return
  }

  await prisma.user.create({
    data: {
      email,
      name,
      role: 'admin',
      emailVerified: new Date(),
      isActive: true,
    },
  })
  console.log(`✅ Admin user created: ${email}`)
  console.log(`   Login via OTP at /login`)
}

main()
  .catch((e) => {
    console.error('❌ Admin seed failed:', e.message)
  })
  .finally(() => prisma.$disconnect())
