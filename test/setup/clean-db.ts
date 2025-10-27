import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanDatabase() {
  console.log('🧹 Limpando banco de dados...')

  try {
    // Ordem correta devido às foreign keys
    await prisma.session.deleteMany()
    await prisma.invitation.deleteMany()
    await prisma.shareToken.deleteMany()
    await prisma.instance.deleteMany()
    await prisma.user.deleteMany()

    console.log('✅ Banco de dados limpo com sucesso!')
  } catch (error) {
    console.error('❌ Erro ao limpar banco:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

cleanDatabase()