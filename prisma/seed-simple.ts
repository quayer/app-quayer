import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database com ADMIN LIMPO para onboarding...\n')

  // Get admin config from .env
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@quayer.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123456'
  const adminName = process.env.ADMIN_NAME || 'Administrator'
  const recoveryToken = process.env.ADMIN_RECOVERY_TOKEN || '123456'

  const hashedPassword = await bcrypt.hash(adminPassword, 12)

  console.log('👤 Criando Admin user SEM organização...')
  console.log(`   Email: ${adminEmail}`)
  console.log(`   Recovery Token: ${recoveryToken} (usar no login OTP)`)

  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: hashedPassword,
      name: adminName,
      role: 'admin',
      emailVerified: new Date(), // Email verificado
      isActive: true,
      currentOrgId: null, // ❌ NO ORGANIZATION - vai fazer onboarding
      onboardingCompleted: false, // ❌ Onboarding NOT completed
      // Salvar recovery token para login sem email
      resetToken: recoveryToken,
      resetTokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Válido por 1 ano
    },
  })

  console.log(`✅ Admin criado: ${adminUser.email}`)
  console.log(`   Current Org: null (vai fazer onboarding)`)
  console.log(`   Onboarding Completed: ${adminUser.onboardingCompleted}`)
  console.log(`\n🔑 IMPORTANTE: Use o recovery token "${recoveryToken}" para login OTP`)
}

main()
  .catch((e) => {
    console.error('❌ Erro no seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
