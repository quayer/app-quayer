import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanDatabase() {
  console.log('🧹 Limpando banco de dados...')

  try {
    // Ordem correta devido às foreign keys
    await prisma.message.deleteMany()
    await prisma.chatSession.deleteMany()
    await prisma.invitation.deleteMany()
    await prisma.connection.deleteMany()
    await prisma.userOrganization.deleteMany()
    await prisma.organization.deleteMany()
    await prisma.refreshToken.deleteMany()
    await prisma.tempUser.deleteMany()
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