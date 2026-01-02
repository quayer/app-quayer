/**
 * Debug script para investigar por que chats não aparecem
 * Organização: Gabriel Rizzatto / Quayer Tech Antigravity
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function debug() {
  console.log('\n========================================')
  console.log('DEBUG: Investigando chats não aparecendo')
  console.log('========================================\n')

  // 1. Buscar organizações
  console.log('1. ORGANIZAÇÕES:')
  const orgs = await prisma.organization.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      _count: {
        select: {
          users: true,
          connections: true,
        }
      }
    }
  })
  console.log('Total de organizações:', orgs.length)
  for (const org of orgs) {
    console.log(`  - ${org.name} (${org.slug})`)
    console.log(`    ID: ${org.id}`)
    console.log(`    Usuários: ${org._count.users}`)
    console.log(`    Conexões: ${org._count.connections}`)
  }

  // 2. Buscar usuários
  console.log('\n2. USUÁRIOS:')
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      currentOrgId: true,
      organizations: {
        select: {
          organization: {
            select: {
              id: true,
              name: true,
            }
          }
        }
      }
    }
  })
  console.log('Total de usuários:', users.length)
  for (const user of users) {
    console.log(`  - ${user.email}`)
    console.log(`    ID: ${user.id}`)
    console.log(`    currentOrgId: ${user.currentOrgId || 'NULL ⚠️'}`)
    console.log(`    Organizações vinculadas: ${user.organizations.map(o => o.organization.name).join(', ') || 'Nenhuma ⚠️'}`)
  }

  // 3. Buscar conexões
  console.log('\n3. CONEXÕES/INSTÂNCIAS:')
  const connections = await prisma.connection.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      provider: true,
      organizationId: true,
      organization: {
        select: { name: true }
      },
      _count: {
        select: {
          chatSessions: true,
        }
      }
    }
  })
  console.log('Total de conexões:', connections.length)
  for (const conn of connections) {
    console.log(`  - ${conn.name} (${conn.provider || 'sem provider'})`)
    console.log(`    ID: ${conn.id}`)
    console.log(`    Status: ${conn.status}`)
    console.log(`    Organização: ${conn.organization?.name || 'NULL ⚠️'} (${conn.organizationId})`)
    console.log(`    Sessões de chat: ${conn._count.chatSessions}`)
  }

  // 4. Buscar sessões de chat
  console.log('\n4. SESSÕES DE CHAT:')
  const sessions = await prisma.chatSession.findMany({
    take: 20,
    orderBy: { lastMessageAt: 'desc' },
    select: {
      id: true,
      status: true,
      lastMessageAt: true,
      connectionId: true,
      connection: {
        select: {
          name: true,
          organizationId: true,
        }
      },
      contact: {
        select: {
          name: true,
          phoneNumber: true,
        }
      },
      _count: {
        select: { messages: true }
      }
    }
  })
  console.log('Total de sessões (últimas 20):', sessions.length)
  for (const session of sessions) {
    console.log(`  - ${session.contact?.name || session.contact?.phoneNumber || 'Sem contato'}`)
    console.log(`    ID: ${session.id}`)
    console.log(`    Status: ${session.status}`)
    console.log(`    Conexão: ${session.connection?.name} (orgId: ${session.connection?.organizationId})`)
    console.log(`    Última msg: ${session.lastMessageAt?.toISOString() || 'nunca'}`)
    console.log(`    Total msgs: ${session._count.messages}`)
  }

  // 5. Verificar relação usuário <-> organização <-> conexão
  console.log('\n5. VERIFICAÇÃO DE FLUXO:')
  for (const user of users) {
    console.log(`\n  Usuário: ${user.email}`)
    console.log(`  currentOrgId: ${user.currentOrgId}`)

    if (!user.currentOrgId) {
      console.log('  ⚠️ PROBLEMA: Usuário não tem currentOrgId definido!')
      continue
    }

    // Verificar se organização existe
    const org = orgs.find(o => o.id === user.currentOrgId)
    if (!org) {
      console.log('  ⚠️ PROBLEMA: currentOrgId não corresponde a nenhuma organização!')
      continue
    }
    console.log(`  Organização: ${org.name}`)

    // Verificar conexões da organização
    const orgConnections = connections.filter(c => c.organizationId === user.currentOrgId)
    console.log(`  Conexões da org: ${orgConnections.length}`)

    if (orgConnections.length === 0) {
      console.log('  ⚠️ PROBLEMA: Organização não tem conexões!')
      continue
    }

    // Verificar sessões das conexões
    const connectionIds = orgConnections.map(c => c.id)
    const orgSessions = sessions.filter(s => connectionIds.includes(s.connectionId))
    console.log(`  Sessões nas conexões: ${orgSessions.length}`)

    if (orgSessions.length === 0) {
      console.log('  ⚠️ PROBLEMA: Nenhuma sessão de chat nas conexões da organização!')
      console.log('     Isso pode significar:')
      console.log('     - Webhooks não estão configurados/funcionando')
      console.log('     - Nenhuma mensagem foi recebida ainda')
      console.log('     - Sync manual desativado (modo reativo)')
    }
  }

  // 6. Contar totais
  console.log('\n6. TOTAIS NO BANCO:')
  const [totalOrgs, totalUsers, totalConnections, totalSessions, totalMessages, totalContacts] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.connection.count(),
    prisma.chatSession.count(),
    prisma.message.count(),
    prisma.contact.count(),
  ])
  console.log(`  Organizações: ${totalOrgs}`)
  console.log(`  Usuários: ${totalUsers}`)
  console.log(`  Conexões: ${totalConnections}`)
  console.log(`  Sessões de chat: ${totalSessions}`)
  console.log(`  Mensagens: ${totalMessages}`)
  console.log(`  Contatos: ${totalContacts}`)

  console.log('\n========================================')
  console.log('DEBUG COMPLETO')
  console.log('========================================\n')
}

debug()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
