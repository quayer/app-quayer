/**
 * Seed: Billing Plans (Free + Pro)
 *
 * Run:
 *   npx tsx prisma/seed-billing-plans.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const free = await prisma.plan.upsert({
    where: { slug: 'free' },
    update: {},
    create: {
      slug: 'free',
      name: 'Free',
      description: 'Para comecar a usar o Quayer',
      priceMonthly: 0,
      priceYearly: 0,
      currency: 'BRL',
      maxUsers: 2,
      maxInstances: 1,
      maxContacts: 500,
      maxMessages: 1000,
      maxStorage: 100,
      maxAiCredits: 0,
      hasWebhooks: false,
      hasApi: false,
      hasCustomRoles: false,
      hasSso: false,
      hasAiAgents: false,
      hasPrioritySupport: false,
      isActive: true,
      isFree: true,
      sortOrder: 0,
    },
  })

  const pro = await prisma.plan.upsert({
    where: { slug: 'pro' },
    update: {},
    create: {
      slug: 'pro',
      name: 'Pro',
      description: 'Para equipes que precisam de mais',
      priceMonthly: 14900, // R$ 149,00
      priceYearly: 149900, // R$ 1.499,00 (~16% discount)
      currency: 'BRL',
      maxUsers: 10,
      maxInstances: 5,
      maxContacts: 10000,
      maxMessages: 50000,
      maxStorage: 5000, // MB
      maxAiCredits: 1000,
      hasWebhooks: true,
      hasApi: true,
      hasCustomRoles: true,
      hasSso: false,
      hasAiAgents: true,
      hasPrioritySupport: true,
      isActive: true,
      isFree: false,
      sortOrder: 1,
    },
  })

  console.log('Seeded plans:', { free: free.slug, pro: pro.slug })
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
