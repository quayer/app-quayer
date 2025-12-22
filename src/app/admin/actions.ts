'use server'

import { cookies } from 'next/headers'
import jwt from 'jsonwebtoken'
import { database as db } from '@/services/database'
import { getOrFetch, resilientCacheDel } from '@/services/store'

// ==================== CACHE KEYS ====================
const CACHE_KEYS = {
  DASHBOARD_STATS: 'admin:dashboard:stats',
  RECENT_ACTIVITY: (limit: number) => `admin:dashboard:activity:${limit}`,
  RECENT_ORGS: (limit: number) => `admin:dashboard:orgs:${limit}`,
  PERMISSIONS_STATS: 'admin:permissions:stats',
  MESSAGES_STATS: 'admin:messages:stats',
} as const

// Cache TTL em milissegundos (60 segundos)
const CACHE_TTL = 60 * 1000

/**
 * Invalida caches do dashboard admin
 * Chamado quando dados são modificados (create/update/delete)
 */
async function invalidateDashboardCache() {
  try {
    await Promise.all([
      resilientCacheDel(CACHE_KEYS.DASHBOARD_STATS),
      resilientCacheDel(CACHE_KEYS.RECENT_ACTIVITY(5)),
      resilientCacheDel(CACHE_KEYS.RECENT_ORGS(5)),
    ])
    console.log('[Admin Cache] Dashboard cache invalidated')
  } catch (error) {
    console.warn('[Admin Cache] Failed to invalidate cache:', error)
  }
}

/**
 * Server Actions para páginas admin
 * ✅ CORREÇÃO BRUTAL: Acessar banco diretamente no servidor (sem API HTTP)
 * Usa database service com alias instance -> connection
 */

// Helper para formatar mensagem de log de auditoria
function formatLogMessage(action: string, resource: string, resourceId: string | null): string {
  const actionLabels: Record<string, string> = {
    CREATE: 'criou',
    UPDATE: 'atualizou',
    DELETE: 'excluiu',
    LOGIN: 'fez login',
    LOGOUT: 'fez logout',
    VIEW: 'visualizou',
    EXPORT: 'exportou',
    IMPORT: 'importou',
    SEND: 'enviou',
    RECEIVE: 'recebeu',
  }

  const resourceLabels: Record<string, string> = {
    USER: 'usuário',
    ORGANIZATION: 'organização',
    INSTANCE: 'instância',
    MESSAGE: 'mensagem',
    CONTACT: 'contato',
    WEBHOOK: 'webhook',
    SETTINGS: 'configurações',
    TEMPLATE: 'template',
  }

  const actionLabel = actionLabels[action] || action.toLowerCase()
  const resourceLabel = resourceLabels[resource] || resource.toLowerCase()
  const idSuffix = resourceId ? ` #${resourceId.substring(0, 8)}` : ''

  return `${actionLabel} ${resourceLabel}${idSuffix}`
}

// Helper para obter usuário autenticado dos cookies
async function getAuthenticatedUser() {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('accessToken')?.value

  if (!accessToken) {
    throw new Error('Não autenticado')
  }

  const secret = process.env.JWT_SECRET || process.env.IGNITER_APP_SECRET || 'your_random_secret_key_here_change_in_production'
  const decoded = jwt.verify(accessToken, secret) as any

  return {
    userId: decoded.userId,
    email: decoded.email,
    role: decoded.role,
    currentOrgId: decoded.currentOrgId,
  }
}

export async function listOrganizationsAction(params?: { page?: number; limit?: number; search?: string }) {
  try {
    console.log('[Server Action] listOrganizationsAction called with:', params)

    // ✅ CORREÇÃO BRUTAL: Verificar autenticação e acessar banco diretamente
    const user = await getAuthenticatedUser()
    console.log('[Server Action] Authenticated user:', user.email, 'role:', user.role)

    // ✅ CORREÇÃO BRUTAL: Apenas admins podem listar todas organizações
    if (user.role !== 'admin') {
      return { data: null, error: { message: 'Acesso negado. Apenas administradores podem listar organizações.' } }
    }

    const page = params?.page || 1
    const limit = params?.limit || 20
    const skip = (page - 1) * limit

    // Buscar organizações do banco
    const where = params?.search
      ? {
          OR: [
            { name: { contains: params.search, mode: 'insensitive' as any } },
            { document: { contains: params.search, mode: 'insensitive' as any } },
          ],
        }
      : {}

    const [organizations, total] = await Promise.all([
      db.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.organization.count({ where }),
    ])

    console.log('[Server Action] Found', organizations.length, 'organizations')

    return {
      data: {
        data: organizations,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
      error: null,
    }
  } catch (error: any) {
    console.error('[Server Action] Error listing organizations:', error)
    return { data: null, error: { message: error.message } }
  }
}

export async function getOrganizationAction(id: string) {
  try {
    await getAuthenticatedUser()

    const organization = await db.organization.findUnique({
      where: { id },
    })

    return { data: organization, error: null }
  } catch (error: any) {
    return { data: null, error: { message: error.message } }
  }
}

export async function deleteOrganizationAction(id: string) {
  try {
    const user = await getAuthenticatedUser()

    // ✅ CORREÇÃO BRUTAL: Apenas admins podem deletar organizações
    if (user.role !== 'admin') {
      return { data: null, error: { message: 'Acesso negado. Apenas administradores podem excluir organizações.' } }
    }

    // ✅ CORREÇÃO BRUTAL: Usar soft delete (isActive = false) em vez de hard delete
    await db.organization.update({
      where: { id },
      data: { isActive: false },
    })

    // ✅ CACHE: Invalidar cache do dashboard
    await invalidateDashboardCache()

    return { data: { success: true }, error: null }
  } catch (error: any) {
    return { data: null, error: { message: error.message } }
  }
}

export async function listInstancesAction(params?: { page?: number; limit?: number }) {
  try {
    await getAuthenticatedUser()

    const page = params?.page || 1
    const limit = params?.limit || 20
    const skip = (page - 1) * limit

    const [instances, total] = await Promise.all([
      db.instance.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { organization: true },
      }),
      db.instance.count(),
    ])

    return {
      data: {
        data: instances,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      error: null,
    }
  } catch (error: any) {
    return { data: null, error: { message: error.message } }
  }
}

export async function listAllInstancesFromProvidersAction() {
  try {
    const user = await getAuthenticatedUser()

    // Verificar se é admin
    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado. Apenas administradores.', data: [] }
    }

    // Usar o ProviderOrchestrator para listar todas as instâncias
    const { providerOrchestrator } = await import('@/lib/providers/orchestrator/provider.orchestrator')
    const result = await providerOrchestrator.listAllInstances()

    console.log('[listAllInstancesFromProviders] Orchestrator result:', {
      success: result.success,
      dataLength: result.data.length,
      meta: result.meta,
    })

    return result
  } catch (error: any) {
    console.error('[listAllInstancesFromProviders] Error:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function listWebhooksAction(params?: { page?: number; limit?: number }) {
  try {
    await getAuthenticatedUser()

    const page = params?.page || 1
    const limit = params?.limit || 20
    const skip = (page - 1) * limit

    const [webhooks, total] = await Promise.all([
      db.webhook.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.webhook.count(),
    ])

    return {
      data: {
        data: webhooks,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
      error: null,
    }
  } catch (error: any) {
    return { data: null, error: { message: error.message } }
  }
}

export async function listUsersAction() {
  try {
    const user = await getAuthenticatedUser()

    // ✅ SECURITY FIX: Verify admin role before listing all users
    if (user.role !== 'admin') {
      console.warn('[Server Action] Unauthorized attempt to list users by:', user.email)
      return { success: false, error: 'Acesso negado. Apenas administradores podem listar todos os usuários.', data: [] }
    }

    const users = await db.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
        role: true,
      },
    })

    return { success: true, data: users }
  } catch (error: any) {
    console.error('[Server Action] Error listing users:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function getDashboardStatsAction() {
  try {
    await getAuthenticatedUser()

    // ✅ CACHE: Usar cache com TTL de 60s para reduzir carga no banco
    const stats = await getOrFetch(
      CACHE_KEYS.DASHBOARD_STATS,
      async () => {
        console.log('[getDashboardStatsAction] Cache miss, fetching from DB...')
        const [totalOrganizations, totalUsers, totalConnections, totalWebhooks] = await Promise.all([
          db.organization.count(),
          db.user.count(),
          db.connection.count(),
          db.webhook.count(),
        ])
        return {
          totalOrganizations,
          totalUsers,
          totalInstances: totalConnections,
          totalWebhooks,
        }
      },
      { ttl: CACHE_TTL }
    )

    return { success: true, data: stats }
  } catch (error: any) {
    console.error('[getDashboardStatsAction] Error:', error);
    return { success: false, error: error.message }
  }
}

/**
 * Server Action para listar mensagens de todas as organizações (admin only)
 */
export async function listMessagesAction(params?: {
  page?: number
  limit?: number
  search?: string
  status?: string
  organizationId?: string
}) {
  try {
    const user = await getAuthenticatedUser()

    // Apenas admins podem ver mensagens de todas organizações
    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: null }
    }

    const page = params?.page || 1
    const limit = params?.limit || 20
    const skip = (page - 1) * limit

    // Construir filtros
    const where: any = {}

    if (params?.status && params.status !== 'all') {
      where.status = params.status
    }

    if (params?.organizationId && params.organizationId !== 'all') {
      where.session = {
        organizationId: params.organizationId,
      }
    }

    if (params?.search) {
      where.OR = [
        { content: { contains: params.search, mode: 'insensitive' } },
        { contact: { phoneNumber: { contains: params.search } } },
      ]
    }

    const [messages, total] = await Promise.all([
      db.message.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          contact: {
            select: {
              id: true,
              phoneNumber: true,
              name: true,
            },
          },
          session: {
            select: {
              id: true,
              organizationId: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      db.message.count({ where }),
    ])

    return {
      success: true,
      data: {
        data: messages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    }
  } catch (error: any) {
    console.error('[listMessagesAction] Error:', error)
    return { success: false, error: error.message, data: null }
  }
}

/**
 * Server Action para obter estatísticas de mensagens (admin only)
 */
export async function getMessagesStatsAction() {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: null }
    }

    // Estatísticas das últimas 24h
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    const [
      totalMessages,
      totalDelivered,
      totalRead,
      totalFailed,
      messagesLast24h,
    ] = await Promise.all([
      db.message.count(),
      db.message.count({ where: { status: 'delivered' } }),
      db.message.count({ where: { status: 'read' } }),
      db.message.count({ where: { status: 'failed' } }),
      db.message.count({ where: { createdAt: { gte: yesterday } } }),
    ])

    const deliveryRate = totalMessages > 0 ? ((totalDelivered + totalRead) / totalMessages) * 100 : 0
    const readRate = totalMessages > 0 ? (totalRead / totalMessages) * 100 : 0
    const failedRate = totalMessages > 0 ? (totalFailed / totalMessages) * 100 : 0

    return {
      success: true,
      data: {
        totalMessages,
        totalDelivered,
        totalRead,
        totalFailed,
        messagesLast24h,
        deliveryRate: deliveryRate.toFixed(1),
        readRate: readRate.toFixed(1),
        failedRate: failedRate.toFixed(1),
      },
    }
  } catch (error: any) {
    console.error('[getMessagesStatsAction] Error:', error)
    return { success: false, error: error.message, data: null }
  }
}

/**
 * Server Action para listar organizações (para selects/filtros)
 */
export async function listOrganizationsForFilterAction() {
  try {
    await getAuthenticatedUser()

    const organizations = await db.organization.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: 'asc' },
    })

    return { success: true, data: organizations }
  } catch (error: any) {
    console.error('[listOrganizationsForFilterAction] Error:', error)
    return { success: false, error: error.message, data: [] }
  }
}

// NOTE: Audit Log server actions removed - Use REST API at /api/v1/logs instead
// The Logs system uses LogEntry (not AuditLog) via loggerService

/**
 * Server Action para atribuir/alterar organizacao de uma instancia (admin only)
 */
export async function assignOrganizationToInstanceAction(params: {
  connectionId: string
  organizationId: string | null // null para remover atribuicao
}) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado. Apenas administradores podem atribuir organizacoes.' }
    }

    const { connectionId, organizationId } = params

    // Verificar se a conexao existe
    const connection = await db.connection.findUnique({
      where: { id: connectionId },
    })

    if (!connection) {
      return { success: false, error: 'Conexao nao encontrada' }
    }

    // Verificar se a organizacao existe (se fornecida)
    if (organizationId) {
      const organization = await db.organization.findUnique({
        where: { id: organizationId },
      })

      if (!organization) {
        return { success: false, error: 'Organizacao nao encontrada' }
      }
    }

    // Atualizar a conexao
    const updated = await db.connection.update({
      where: { id: connectionId },
      data: { organizationId },
      include: { organization: true },
    })

    return {
      success: true,
      data: updated,
      message: organizationId
        ? `Conexao atribuida a organizacao ${updated.organization?.name}`
        : 'Atribuicao de organizacao removida',
    }
  } catch (error: any) {
    console.error('[assignOrganizationToInstanceAction] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Server Action para importar instancia do UAZapi para o banco Quayer (admin only)
 */
export async function importInstanceFromUazapiAction(params: {
  uazInstanceId: string
  uazInstanceName: string
  uazToken: string
  uazPhoneNumber?: string
  organizationId?: string
}) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado. Apenas administradores podem importar instancias.' }
    }

    const { uazInstanceId, uazInstanceName, uazToken, uazPhoneNumber, organizationId } = params

    // Verificar se ja existe uma conexao com este uazInstanceId
    const existing = await db.connection.findFirst({
      where: { uazapiInstanceId: uazInstanceId },
    })

    if (existing) {
      return { success: false, error: 'Esta instancia ja foi importada para o Quayer' }
    }

    // Verificar se a organizacao existe (se fornecida)
    if (organizationId) {
      const organization = await db.organization.findUnique({
        where: { id: organizationId },
      })

      if (!organization) {
        return { success: false, error: 'Organizacao nao encontrada' }
      }
    }

    // Criar a conexao
    const connection = await db.connection.create({
      data: {
        name: uazInstanceName,
        provider: 'WHATSAPP_WEB',
        uazapiInstanceId: uazInstanceId,
        uazapiToken: uazToken,
        phoneNumber: uazPhoneNumber || null,
        organizationId: organizationId || null,
        status: 'DISCONNECTED',
      },
      include: { organization: true },
    })

    return {
      success: true,
      data: connection,
      message: `Instancia "${uazInstanceName}" importada com sucesso`,
    }
  } catch (error: any) {
    console.error('[importInstanceFromUazapiAction] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Server Action para buscar atividade recente (ultimos logs) - Dashboard
 * ✅ CACHE: TTL de 60s para reduzir carga
 */
export async function getRecentActivityAction(limit: number = 5) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: [] }
    }

    const data = await getOrFetch(
      CACHE_KEYS.RECENT_ACTIVITY(limit),
      async () => {
        console.log('[getRecentActivityAction] Cache miss, fetching from DB...')
        const logs = await db.auditLog.findMany({
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        })

        return logs.map((log) => ({
          id: log.id,
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId,
          userName: log.user?.name || log.user?.email || 'Sistema',
          createdAt: log.createdAt,
          message: formatLogMessage(log.action, log.resource, log.resourceId),
        }))
      },
      { ttl: CACHE_TTL }
    )

    return { success: true, data }
  } catch (error: any) {
    console.error('[getRecentActivityAction] Error:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Server Action para buscar organizacoes recentes - Dashboard
 * Inclui: status (isActive), última atividade (updatedAt), métricas
 * ✅ CACHE: TTL de 60s para reduzir carga
 */
export async function getRecentOrganizationsAction(limit: number = 5) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: [] }
    }

    const data = await getOrFetch(
      CACHE_KEYS.RECENT_ORGS(limit),
      async () => {
        console.log('[getRecentOrganizationsAction] Cache miss, fetching from DB...')
        const organizations = await db.organization.findMany({
          take: limit,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            name: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                users: true,
                connections: true,
              },
            },
          },
        })

        return organizations.map((org) => ({
          id: org.id,
          name: org.name,
          isActive: org.isActive,
          createdAt: org.createdAt,
          lastActivity: org.updatedAt,
          usersCount: org._count.users,
          connectionsCount: org._count.connections,
        }))
      },
      { ttl: CACHE_TTL }
    )

    return { success: true, data }
  } catch (error: any) {
    console.error('[getRecentOrganizationsAction] Error:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Server Action para buscar estatisticas de permissoes - Pagina Permissoes
 */
export async function getPermissionsStatsAction() {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: null }
    }

    // Contar usuarios por role do sistema
    const [totalUsers, adminUsers, regularUsers] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { role: 'admin' } }),
      db.user.count({ where: { role: 'user' } }),
    ])

    // Contar membros por role de organizacao
    const [masterMembers, managerMembers, agentMembers, viewerMembers] = await Promise.all([
      db.userOrganization.count({ where: { role: 'master' } }),
      db.userOrganization.count({ where: { role: 'manager' } }),
      db.userOrganization.count({ where: { role: 'agent' } }),
      db.userOrganization.count({ where: { role: 'viewer' } }),
    ])

    // Contar usuarios ativos e inativos
    const [activeUsers, inactiveUsers] = await Promise.all([
      db.user.count({ where: { isActive: true } }),
      db.user.count({ where: { isActive: false } }),
    ])

    return {
      success: true,
      data: {
        systemRoles: {
          total: totalUsers,
          admin: adminUsers,
          user: regularUsers,
        },
        organizationRoles: {
          master: masterMembers,
          manager: managerMembers,
          agent: agentMembers,
          viewer: viewerMembers,
        },
        userStatus: {
          active: activeUsers,
          inactive: inactiveUsers,
        },
      },
    }
  } catch (error: any) {
    console.error('[getPermissionsStatsAction] Error:', error)
    return { success: false, error: error.message, data: null }
  }
}

/**
 * Server Action para listar usuarios com seus roles - Pagina Permissoes
 */
export async function getUsersWithRolesAction(params?: {
  page?: number
  limit?: number
  roleFilter?: string
}) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: null }
    }

    const page = params?.page || 1
    const limit = params?.limit || 20
    const skip = (page - 1) * limit

    const where: any = {}
    if (params?.roleFilter && params.roleFilter !== 'all') {
      where.role = params.roleFilter
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          organizations: {
            select: {
              role: true,
              organization: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
      db.user.count({ where }),
    ])

    return {
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    }
  } catch (error: any) {
    console.error('[getUsersWithRolesAction] Error:', error)
    return { success: false, error: error.message, data: null }
  }
}

/**
 * Server Action para atualizar role de usuario do sistema - Pagina Permissoes
 */
export async function updateUserSystemRoleAction(params: {
  userId: string
  role: 'admin' | 'user'
}) {
  try {
    const currentUser = await getAuthenticatedUser()

    if (currentUser.role !== 'admin') {
      return { success: false, error: 'Acesso negado. Apenas administradores podem alterar roles.' }
    }

    const { userId, role } = params

    // Nao permitir que admin remova seu proprio acesso admin
    if (userId === currentUser.userId && role !== 'admin') {
      return { success: false, error: 'Voce nao pode remover seu proprio acesso de administrador.' }
    }

    const updated = await db.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    })

    return {
      success: true,
      data: updated,
      message: `Role de ${updated.name || updated.email} atualizado para ${role}`,
    }
  } catch (error: any) {
    console.error('[updateUserSystemRoleAction] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Server Action para listar membros de uma organizacao (admin only)
 */
export async function listOrganizationMembersAction(organizationId: string) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: [] }
    }

    const members = await db.userOrganization.findMany({
      where: { organizationId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return { success: true, data: members }
  } catch (error: any) {
    console.error('[listOrganizationMembersAction] Error:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Server Action para adicionar membro a uma organizacao (admin only)
 */
export async function addMemberToOrganizationAction(params: {
  organizationId: string
  userId: string
  role: 'master' | 'manager' | 'user'
}) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado. Apenas administradores podem adicionar membros.' }
    }

    const { organizationId, userId, role } = params

    // Verificar se organizacao existe
    const organization = await db.organization.findUnique({
      where: { id: organizationId },
    })

    if (!organization) {
      return { success: false, error: 'Organizacao nao encontrada' }
    }

    // Verificar se usuario existe
    const targetUser = await db.user.findUnique({
      where: { id: userId },
    })

    if (!targetUser) {
      return { success: false, error: 'Usuario nao encontrado' }
    }

    // Verificar se ja e membro
    const existingMember = await db.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    })

    if (existingMember) {
      if (existingMember.isActive) {
        return { success: false, error: 'Usuario ja e membro desta organizacao' }
      }
      // Reativar membro
      await db.userOrganization.update({
        where: {
          userId_organizationId: {
            userId,
            organizationId,
          },
        },
        data: { isActive: true, role },
      })
    } else {
      // Criar novo membro
      await db.userOrganization.create({
        data: {
          userId,
          organizationId,
          role,
          isActive: true,
        },
      })
    }

    // Atualizar currentOrgId do usuario se nao tiver
    if (!targetUser.currentOrgId) {
      await db.user.update({
        where: { id: userId },
        data: { currentOrgId: organizationId },
      })
    }

    return {
      success: true,
      message: `${targetUser.name || targetUser.email} adicionado como ${role}`,
    }
  } catch (error: any) {
    console.error('[addMemberToOrganizationAction] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Server Action para remover membro de uma organizacao (admin only)
 */
export async function removeMemberFromOrganizationAction(params: {
  organizationId: string
  userId: string
}) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado. Apenas administradores podem remover membros.' }
    }

    const { organizationId, userId } = params

    // Verificar se e membro
    const member = await db.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
    })

    if (!member || !member.isActive) {
      return { success: false, error: 'Membro nao encontrado' }
    }

    // Verificar se e o ultimo master
    if (member.role === 'master') {
      const masterCount = await db.userOrganization.count({
        where: {
          organizationId,
          role: 'master',
          isActive: true,
        },
      })

      if (masterCount <= 1) {
        return { success: false, error: 'Nao e possivel remover o ultimo master da organizacao' }
      }
    }

    // Soft delete
    await db.userOrganization.update({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      data: { isActive: false },
    })

    // Se o usuario tinha esta org como current, limpar
    const targetUser = await db.user.findUnique({
      where: { id: userId },
    })

    if (targetUser && targetUser.currentOrgId === organizationId) {
      await db.user.update({
        where: { id: userId },
        data: { currentOrgId: null },
      })
    }

    return { success: true, message: 'Membro removido com sucesso' }
  } catch (error: any) {
    console.error('[removeMemberFromOrganizationAction] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Server Action para atualizar role de um usuario em uma organizacao (admin only)
 */
export async function updateUserOrganizationRoleAction(params: {
  userId: string
  organizationId: string
  role: 'master' | 'manager' | 'agent' | 'viewer'
}) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado. Apenas administradores podem alterar roles.' }
    }

    const { userId, organizationId, role } = params

    // Verificar se o membro existe
    const member = await db.userOrganization.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      include: {
        user: { select: { name: true, email: true } },
        organization: { select: { name: true } },
      },
    })

    if (!member || !member.isActive) {
      return { success: false, error: 'Membro nao encontrado' }
    }

    // Verificar se esta removendo o ultimo master
    if (member.role === 'master' && role !== 'master') {
      const masterCount = await db.userOrganization.count({
        where: {
          organizationId,
          role: 'master',
          isActive: true,
        },
      })

      if (masterCount <= 1) {
        return { success: false, error: 'Nao e possivel remover o ultimo master da organizacao' }
      }
    }

    // Atualizar o role
    await db.userOrganization.update({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        },
      },
      data: { role },
    })

    return {
      success: true,
      message: `Role de ${member.user?.name || member.user?.email} atualizado para ${role} em ${member.organization?.name}`,
    }
  } catch (error: any) {
    console.error('[updateUserOrganizationRoleAction] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Server Action para listar usuarios disponiveis para adicionar a uma organizacao
 */
export async function listAvailableUsersForOrganizationAction(organizationId: string) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: [] }
    }

    // Buscar usuarios que NAO sao membros ativos desta organizacao
    const users = await db.user.findMany({
      where: {
        isActive: true,
        NOT: {
          organizations: {
            some: {
              organizationId,
              isActive: true,
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: 'asc' },
    })

    return { success: true, data: users }
  } catch (error: any) {
    console.error('[listAvailableUsersForOrganizationAction] Error:', error)
    return { success: false, error: error.message, data: [] }
  }
}

/**
 * Server Action para analisar logs com IA
 * Usa OpenAI GPT-4 para identificar padrões, sugerir correções e insights
 */
export async function analyzeLogsWithAIAction(params?: {
  logIds?: string[]
  level?: 'error' | 'warn' | 'info'
  resource?: string
  action?: string
  dateRange?: { start: Date; end: Date }
  limit?: number
}) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado. Apenas administradores podem analisar logs com IA.' }
    }

    // Import dinamico para evitar problemas de build
    const { logAnalyzer } = await import('@/lib/log-analyzer')

    const analysis = await logAnalyzer.analyzeLogs({
      logIds: params?.logIds,
      level: params?.level,
      resource: params?.resource,
      action: params?.action,
      dateRange: params?.dateRange,
      limit: params?.limit || 50,
    })

    return { success: true, data: analysis }
  } catch (error: any) {
    console.error('[analyzeLogsWithAIAction] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Server Action para obter resumo de erros recentes
 */
export async function getErrorSummaryAction(hours: number = 24) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado' }
    }

    const { logAnalyzer } = await import('@/lib/log-analyzer')
    const summary = await logAnalyzer.getErrorSummary(hours)

    return { success: true, data: summary }
  } catch (error: any) {
    console.error('[getErrorSummaryAction] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Server Action para analisar um erro específico em detalhe
 */
export async function analyzeErrorDetailAction(errorMessage: string, errorStack?: string) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado' }
    }

    const { logAnalyzer } = await import('@/lib/log-analyzer')
    const analysis = await logAnalyzer.analyzeError(errorMessage, errorStack)

    return { success: true, data: analysis }
  } catch (error: any) {
    console.error('[analyzeErrorDetailAction] Error:', error)
    return { success: false, error: error.message }
  }
}

// ============================================================================
// DYNAMIC PERMISSIONS SYSTEM
// ============================================================================

/**
 * Server Action para carregar matriz de permissões dinâmicas do banco
 */
export async function getPermissionMatrixAction() {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: null }
    }

    const { permissionsService } = await import('@/features/permissions')
    const matrix = await permissionsService.getPermissionMatrix()

    return { success: true, data: matrix }
  } catch (error: any) {
    console.error('[getPermissionMatrixAction] Error:', error)
    return { success: false, error: error.message, data: null }
  }
}

/**
 * Server Action para atualizar permissões de uma role para um recurso
 */
export async function updateRolePermissionAction(params: {
  resource: string
  role: string
  actions: string[]
}) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado. Apenas administradores podem alterar permissões.' }
    }

    const { permissionsService } = await import('@/features/permissions')
    const updated = await permissionsService.updateRolePermission(
      params.resource,
      params.role as any,
      params.actions as any[]
    )

    return {
      success: true,
      data: updated,
      message: `Permissões de ${params.role} para ${params.resource} atualizadas`,
    }
  } catch (error: any) {
    console.error('[updateRolePermissionAction] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Server Action para inicializar permissões padrão no banco
 */
export async function initializeDefaultPermissionsAction() {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado. Apenas administradores podem inicializar permissões.' }
    }

    const { permissionsService } = await import('@/features/permissions')
    await permissionsService.initializeDefaultPermissions()

    return {
      success: true,
      message: 'Permissões padrão inicializadas com sucesso',
    }
  } catch (error: any) {
    console.error('[initializeDefaultPermissionsAction] Error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Server Action para verificar se uma role tem permissão para uma ação
 */
export async function checkPermissionAction(params: {
  role: string
  resource: string
  action: string
}) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: false }
    }

    const { permissionsService } = await import('@/features/permissions')
    const hasPermission = await permissionsService.hasPermission(
      params.role as any,
      params.resource,
      params.action as any
    )

    return { success: true, data: hasPermission }
  } catch (error: any) {
    console.error('[checkPermissionAction] Error:', error)
    return { success: false, error: error.message, data: false }
  }
}

/**
 * Server Action para listar mensagens de todas as instâncias UAZapi (admin only)
 * Busca mensagens diretamente do UAZapi, independente do banco local
 */
export async function listMessagesFromUazapiAction(params?: {
  page?: number
  limit?: number
  instanceId?: string
}) {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: null }
    }

    const { UAZClient } = await import('@/lib/providers/adapters/uazapi/uazapi.client')

    const uazBaseUrl = process.env.UAZAPI_URL || process.env.UAZ_API_URL || 'https://quayer.uazapi.com'
    const adminToken = process.env.UAZAPI_ADMIN_TOKEN || process.env.UAZ_ADMIN_TOKEN || ''

    if (!adminToken) {
      return { success: false, error: 'UAZapi admin token não configurado', data: null }
    }

    console.log('[listMessagesFromUazapi] Starting with:', { baseUrl: uazBaseUrl, hasToken: !!adminToken, tokenLength: adminToken.length })

    const uazClient = new UAZClient({
      baseUrl: uazBaseUrl,
      adminToken,
    })

    // Buscar todas as instâncias
    // NOTA: A API do UAZapi retorna o array diretamente, não {data: [...]}
    console.log('[listMessagesFromUazapi] Calling listAllInstances...')
    let instancesResult: any
    try {
      instancesResult = await uazClient.listAllInstances()
      console.log('[listMessagesFromUazapi] Raw response:', JSON.stringify(instancesResult).substring(0, 500))
    } catch (fetchError: any) {
      console.error('[listMessagesFromUazapi] Error calling listAllInstances:', fetchError.message)
      return { success: false, error: `Erro ao buscar instâncias: ${fetchError.message}`, data: null }
    }

    // O resultado pode ser um array diretamente ou um objeto {data: [...]} ou {success, data}
    const instances = Array.isArray(instancesResult)
      ? instancesResult
      : (instancesResult?.data || instancesResult || [])

    console.log('[listMessagesFromUazapi] Total instances from UAZapi:', instances.length)
    console.log('[listMessagesFromUazapi] Raw result type:', typeof instancesResult, Array.isArray(instancesResult))
    console.log('[listMessagesFromUazapi] Instance statuses:', instances.map((i: any) => ({
      name: i.name,
      status: i.status,
      hasToken: !!i.token
    })))

    // Filtrar instâncias conectadas - também aceitar 'open' e status em maiúsculas
    const connectedInstances = instances.filter((inst: any) => {
      const status = (inst.status || '').toString().toLowerCase()
      return status === 'connected' || status === 'open'
    })

    console.log('[listMessagesFromUazapi] Connected instances:', connectedInstances.length)

    // Se um instanceId específico foi passado, filtrar
    const targetInstances = params?.instanceId
      ? connectedInstances.filter((inst: any) => inst.id === params.instanceId)
      : connectedInstances

    if (targetInstances.length === 0) {
      console.log('[listMessagesFromUazapi] No connected instances found, returning empty')
      return {
        success: true,
        data: {
          data: [],
          pagination: { page: 1, limit: params?.limit || 20, total: 0, totalPages: 0 },
        },
      }
    }

    console.log('[listMessagesFromUazapi] Target instances for messages:', targetInstances.map((i: any) => i.name))

    // Buscar mensagens de cada instância conectada
    const allMessages: any[] = []
    const messagesPerInstance = Math.ceil((params?.limit || 50) / targetInstances.length)

    for (const instance of targetInstances) {
      if (!instance.token) {
        console.log(`[listMessagesFromUazapi] Instance ${instance.name} has no token, skipping`)
        continue
      }

      try {
        console.log(`[listMessagesFromUazapi] Fetching messages from instance ${instance.name}...`)
        const messagesResult = await uazClient.findMessages(instance.token, {
          limit: messagesPerInstance,
          offset: 0,
        })

        // Debug: mostrar estrutura completa da resposta
        console.log(`[listMessagesFromUazapi] Raw result from ${instance.name}:`, JSON.stringify(messagesResult).substring(0, 1000))

        // A resposta pode vir em vários formatos:
        // 1. { data: { messages: [...] } } - UAZResponse padrão
        // 2. { messages: [...] } - resposta direta
        // 3. { success: true, data: { messages: [...] } }
        let messages: any[] = []
        const result = messagesResult as any
        if (result?.data?.messages) {
          messages = result.data.messages
        } else if (result?.messages) {
          messages = result.messages
        } else if (Array.isArray(result?.data)) {
          messages = result.data
        } else if (Array.isArray(result)) {
          messages = result
        }

        console.log(`[listMessagesFromUazapi] Parsed ${messages.length} messages from ${instance.name}`)

        if (messages.length > 0) {
          // Adicionar info da instância às mensagens
          // NOTA: Campos UAZapi conforme documentação do cliente:
          // - type (tipo da mensagem)
          // - timestamp (em segundos UNIX - precisa multiplicar por 1000)
          // - pushName (nome do contato)
          // - text ou caption (para conteúdo)
          const messagesWithInstance = messages.map((msg: any) => {
            // timestamp está em segundos, converter para milissegundos
            const timestampMs = msg.timestamp ? msg.timestamp * 1000 : Date.now()

            return {
              id: msg.id || msg.messageid || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              content: msg.text || msg.caption || msg.content?.text || `[${msg.type || msg.mediaType || 'unknown'}]`,
              direction: msg.fromMe ? 'OUTBOUND' : 'INBOUND',
              status: msg.status || 'delivered',
              type: msg.type || msg.mediaType || 'text',
              author: msg.pushName || msg.from || 'Desconhecido',
              createdAt: new Date(timestampMs),
              contact: {
                id: msg.chatid || '',
                phoneNumber: (msg.chatid || '').replace('@s.whatsapp.net', '').replace('@g.us', ''),
                name: msg.pushName || null,
              },
              instance: {
                id: instance.id || instance.name,
                name: instance.name,
                token: instance.token,
              },
              session: {
                id: instance.id || instance.name,
                organizationId: null,
                organization: null,
              },
              source: 'uazapi' as const,
            }
          })
          allMessages.push(...messagesWithInstance)
        }
      } catch (err: any) {
        console.warn(`[listMessagesFromUazapi] Error fetching from instance ${instance.name}:`, err.message)
        // Continuar com as outras instâncias
      }
    }

    // Ordenar por data (mais recentes primeiro)
    allMessages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    // Aplicar paginação
    const page = params?.page || 1
    const limit = params?.limit || 20
    const startIndex = (page - 1) * limit
    const paginatedMessages = allMessages.slice(startIndex, startIndex + limit)

    return {
      success: true,
      data: {
        data: paginatedMessages,
        pagination: {
          page,
          limit,
          total: allMessages.length,
          totalPages: Math.ceil(allMessages.length / limit),
        },
      },
    }
  } catch (error: any) {
    console.error('[listMessagesFromUazapiAction] Error:', error)
    return { success: false, error: error.message, data: null }
  }
}

/**
 * Server Action para obter estatísticas de mensagens do UAZapi (admin only)
 */
export async function getMessagesStatsFromUazapiAction() {
  try {
    const user = await getAuthenticatedUser()

    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: null }
    }

    const { UAZClient } = await import('@/lib/providers/adapters/uazapi/uazapi.client')

    const uazBaseUrl = process.env.UAZAPI_URL || process.env.UAZ_API_URL || 'https://quayer.uazapi.com'
    const adminToken = process.env.UAZAPI_ADMIN_TOKEN || process.env.UAZ_ADMIN_TOKEN || ''

    if (!adminToken) {
      return { success: false, error: 'UAZapi admin token não configurado', data: null }
    }

    const uazClient = new UAZClient({
      baseUrl: uazBaseUrl,
      adminToken,
    })

    // Buscar todas as instâncias
    // NOTA: A API do UAZapi retorna o array diretamente, não {data: [...]}
    const instancesResult = await uazClient.listAllInstances()
    const instances = Array.isArray(instancesResult)
      ? instancesResult
      : (instancesResult?.data || instancesResult || [])

    // Filtrar instâncias conectadas
    const connectedInstances = instances.filter((inst: any) =>
      inst.status?.toLowerCase() === 'connected' || inst.status?.toLowerCase() === 'open'
    )

    // Buscar mensagens de cada instância para contagem
    let totalMessages = 0
    let totalOutbound = 0
    let totalInbound = 0
    let messagesLast24h = 0
    const yesterday = Date.now() - 24 * 60 * 60 * 1000

    for (const instance of connectedInstances) {
      if (!instance.token) continue

      try {
        const messagesResult = await uazClient.findMessages(instance.token, {
          limit: 500, // Buscar mais para estatísticas
          offset: 0,
        })

        // A resposta pode vir em vários formatos (mesmo padrão de listMessagesFromUazapi)
        let messages: any[] = []
        const result = messagesResult as any
        if (result?.data?.messages) {
          messages = result.data.messages
        } else if (result?.messages) {
          messages = result.messages
        } else if (Array.isArray(result?.data)) {
          messages = result.data
        } else if (Array.isArray(result)) {
          messages = result
        }

        if (messages.length > 0) {
          totalMessages += messages.length

          for (const msg of messages) {
            if (msg.fromMe) {
              totalOutbound++
            } else {
              totalInbound++
            }

            // timestamp está em segundos, converter para milissegundos
            const msgTimestamp = msg.timestamp ? msg.timestamp * 1000 : 0
            if (msgTimestamp >= yesterday) {
              messagesLast24h++
            }
          }
        }
      } catch (err: any) {
        console.warn(`[getMessagesStatsFromUazapi] Error fetching from instance ${instance.name}:`, err.message)
      }
    }

    return {
      success: true,
      data: {
        totalMessages,
        totalDelivered: totalOutbound,
        totalRead: 0, // UAZapi não retorna esse status diretamente
        totalFailed: 0,
        messagesLast24h,
        totalOutbound,
        totalInbound,
        connectedInstances: connectedInstances.length,
        deliveryRate: '100.0',
        readRate: '0.0',
        failedRate: '0.0',
      },
    }
  } catch (error: any) {
    console.error('[getMessagesStatsFromUazapiAction] Error:', error)
    return { success: false, error: error.message, data: null }
  }
}

/**
 * Server Action para carregar permissões do usuário logado
 * Retorna um mapa resource -> actions[] baseado na role efetiva do usuário
 */
export async function getUserPermissionsAction(): Promise<{
  success: boolean
  data: {
    effectiveRole: string
    permissions: Record<string, string[]>
    isAdmin: boolean
  } | null
  error?: string
}> {
  try {
    const user = await getAuthenticatedUser()

    // Determina a role efetiva
    const isAdmin = user.role === 'admin'
    const effectiveRole = isAdmin ? 'admin' : ((user as any).organizationRole || 'viewer')

    const { permissionsService } = await import('@/features/permissions')
    const permissions = await permissionsService.getPermissionsForRole(effectiveRole)

    return {
      success: true,
      data: {
        effectiveRole,
        permissions,
        isAdmin,
      },
    }
  } catch (error: any) {
    console.error('[getUserPermissionsAction] Error:', error)
    // Retorna permissões vazias em caso de erro
    return {
      success: false,
      data: null,
      error: error.message,
    }
  }
}

/**
 * Server Action para retornar valores de configuracao do .env
 * Usada para preencher defaults nas telas de configuracao
 */
export async function getEnvDefaultsAction() {
  try {
    const user = await getAuthenticatedUser()

    // Apenas admins podem ver configuracoes do env
    if (user.role !== 'admin') {
      return { success: false, error: 'Acesso negado', data: null }
    }

    // Mascarar tokens sensíveis - mostrar apenas primeiros e últimos caracteres
    const maskToken = (token: string | undefined) => {
      if (!token) return ''
      if (token.length <= 8) return '****'
      return `${token.slice(0, 4)}...${token.slice(-4)}`
    }

    return {
      success: true,
      data: {
        uazapi: {
          baseUrl: process.env.UAZAPI_URL || 'https://api.uazapi.app',
          adminToken: process.env.UAZAPI_ADMIN_TOKEN || '',
          adminTokenMasked: maskToken(process.env.UAZAPI_ADMIN_TOKEN),
          webhookUrl: process.env.UAZAPI_WEBHOOK_URL || '',
        },
        email: {
          provider: process.env.EMAIL_PROVIDER || 'smtp',
          from: process.env.EMAIL_FROM || 'noreply@quayer.com',
          fromName: process.env.EMAIL_FROM_NAME || 'Quayer',
          smtpHost: process.env.SMTP_HOST || '',
          smtpPort: parseInt(process.env.SMTP_PORT || '587'),
          smtpUser: process.env.SMTP_USER || '',
          smtpPasswordMasked: maskToken(process.env.SMTP_PASSWORD),
        },
        ai: {
          openaiApiKey: process.env.OPENAI_API_KEY || '',
          openaiApiKeyMasked: maskToken(process.env.OPENAI_API_KEY),
          defaultModel: 'gpt-4o-mini',
        },
        oauth: {
          googleClientId: process.env.GOOGLE_CLIENT_ID || '',
          googleClientIdMasked: maskToken(process.env.GOOGLE_CLIENT_ID),
          googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || '',
        },
        concatenation: {
          timeout: parseInt(process.env.MESSAGE_CONCAT_TIMEOUT || '8000'),
          maxMessages: parseInt(process.env.MESSAGE_CONCAT_MAX || '10'),
        },
        security: {
          accessTokenExpiresIn: '15m',
          refreshTokenExpiresIn: '7d',
          logLevel: process.env.IGNITER_LOG_LEVEL || 'info',
        },
      },
    }
  } catch (error: any) {
    console.error('[getEnvDefaultsAction] Error:', error)
    return { success: false, error: error.message, data: null }
  }
}

