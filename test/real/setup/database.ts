import { PrismaClient } from '@prisma/client'
import { execSync } from 'child_process'

let prisma: PrismaClient | null = null

export async function setupRealDatabase(): Promise<PrismaClient> {
  console.log('🗄️  Configurando banco de dados REAL para testes...\n')

  try {
    // 1. Garantir que as migrations estão aplicadas
    console.log('1️⃣  Aplicando migrations...')
    execSync('npx prisma migrate deploy', { stdio: 'inherit' })
    console.log('✅ Migrations aplicadas\n')

    // 2. Gerar Prisma Client
    console.log('2️⃣  Gerando Prisma Client...')
    execSync('npx prisma generate', { stdio: 'pipe' })
    console.log('✅ Prisma Client gerado\n')

    // 3. Conectar ao banco
    console.log('3️⃣  Conectando ao banco...')
    prisma = new PrismaClient({
      log: process.env.DEBUG ? ['query', 'info', 'warn', 'error'] : ['error'],
    })

    await prisma.$connect()
    console.log('✅ Conectado ao banco\n')

    // 4. Limpar dados de testes anteriores
    console.log('4️⃣  Limpando dados de testes anteriores...')
    await cleanupTestData()
    console.log('✅ Banco limpo e pronto para testes\n')

    return prisma
  } catch (error: any) {
    console.error('❌ Erro ao configurar banco de dados:', error.message)
    throw error
  }
}

export async function cleanupTestData(): Promise<void> {
  if (!prisma) {
    throw new Error('Prisma não está inicializado. Chame setupRealDatabase() primeiro.')
  }

  try {
    // Limpar na ordem correta (respeitando foreign keys)
    await prisma.$transaction([
      prisma.message.deleteMany(),
      prisma.chatSession.deleteMany(),
      prisma.connection.deleteMany(),
      prisma.userOrganization.deleteMany(),
      prisma.invitation.deleteMany(),
      prisma.organization.deleteMany(),
      prisma.refreshToken.deleteMany(),
      prisma.tempUser.deleteMany(),
      prisma.user.deleteMany(),
    ])

    console.log('   ✓ Todos os dados limpos')
  } catch (error: any) {
    console.error('   ⚠️  Aviso ao limpar dados:', error.message)
    // Não lançar erro, apenas avisar
  }
}

export async function cleanupRealDatabase(): Promise<void> {
  if (prisma) {
    console.log('\n🧹 Desconectando do banco...')
    await prisma.$disconnect()
    prisma = null
    console.log('✅ Desconectado')
  }
}

export function getRealPrisma(): PrismaClient {
  if (!prisma) {
    throw new Error('Prisma não está inicializado. Chame setupRealDatabase() primeiro.')
  }
  return prisma
}

/**
 * Seed inicial para testes (usuário admin)
 */
export async function seedTestData() {
  if (!prisma) {
    throw new Error('Prisma não está inicializado.')
  }

  console.log('🌱 Seedando dados iniciais para testes...')

  // Criar usuário admin padrão para testes
  const admin = await prisma.user.upsert({
    where: { email: 'admin@quayer.com' },
    update: {},
    create: {
      email: 'admin@quayer.com',
      name: 'Admin Test',
      password: '$2a$10$rZ1vG9X9X9X9X9X9X9X9XuZQ1Z1Z1Z1Z1Z1Z1Z1Z1Z1Z1Z1Z1Z1Z1', // admin123456
      role: 'admin',
      emailVerified: new Date(),
    },
  })

  console.log(`✅ Admin criado: ${admin.email}`)

  return { admin }
}
