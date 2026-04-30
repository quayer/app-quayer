'use server'

import { z } from 'zod'
import { api } from '@/igniter.client'
import { database } from '@/server/services/database'
import { apiRateLimiter } from '@/lib/rate-limit/rate-limiter'
import { requireAdmin, sanitizeError, getActionIdentifier } from './utils'

// Reuse apiRateLimiter (100 req/min) for admin mutations — sufficient for admin panel
const adminMutationLimiter = apiRateLimiter

// ============================================================
// ZOD SCHEMAS
// ============================================================

const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  type: z.enum(['pf', 'pj']),
  document: z.string().optional(),
  billingType: z.enum(['free', 'basic', 'pro', 'enterprise']).default('free'),
  maxInstances: z.number().int().min(1).default(5),
  maxUsers: z.number().int().min(1).default(10),
})

const updateOrganizationSchema = z.object({
  name: z.string().min(2).optional(),
  document: z.union([z.string().min(11).max(18), z.literal(''), z.null()]).optional(),
  type: z.enum(['pf', 'pj']).optional(),
  billingType: z.enum(['free', 'basic', 'pro', 'enterprise']).optional(),
  maxInstances: z.number().int().min(1).optional(),
  maxUsers: z.number().int().min(1).optional(),
  isActive: z.boolean().optional(),
})

const listOrganizationsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
})

// ============================================================
// EXPORTED TYPES — usados pelos Client Components para type safety
// ============================================================

export type OrganizationWithCount = {
  id: string
  name: string
  document: string | null
  type: string
  billingType: string
  maxInstances: number
  maxUsers: number
  isActive: boolean
  createdAt: Date | string
  userCount: number
}

export type PaginationMeta = {
  page: number
  limit: number
  total: number
  totalPages: number
}

/**
 * Server Actions para páginas admin
 * Segurança: rotas /admin/* protegidas pelo middleware (src/middleware.ts)
 * Actions também verificam role admin via headers injetados pelo middleware
 */

// requireAdmin imported from ./utils — single source of truth

export async function createOrganizationAction(data: {
  name: string
  type: 'pf' | 'pj'
  document?: string
  billingType?: string
  maxInstances?: number
  maxUsers?: number
}): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    await requireAdmin()
    const identifier = await getActionIdentifier()
    const rl = await adminMutationLimiter.check(identifier)
    if (!rl.success) {
      return { success: false, error: 'Muitas requisições. Tente novamente em alguns segundos.' }
    }
    const validated = createOrganizationSchema.parse(data)
    const result = await api.organizations.create.mutate({
      body: validated,
    })
    return { success: true, data: result }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors.map((e) => e.message).join(', ') }
    }
    console.error('[Server Action] Error creating organization:', error)
    return { success: false, error: sanitizeError(error) }
  }
}

export async function updateOrganizationAction(id: string, data: {
  name?: string
  document?: string | null
  type?: 'pf' | 'pj'
  billingType?: string
  maxInstances?: number
  maxUsers?: number
  isActive?: boolean
}): Promise<{ success: boolean; error?: string; data?: any }> {
  try {
    await requireAdmin()
    const validated = updateOrganizationSchema.parse(data)
    const result = await (api.organizations.update as any).mutate({
      params: { id },
      body: validated,
    })
    return { success: true, data: result }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors.map((e) => e.message).join(', ') }
    }
    console.error('[Server Action] Error updating organization:', error)
    return { success: false, error: sanitizeError(error) }
  }
}

export async function listOrganizationsAction(params?: { page?: number; limit?: number; search?: string }) {
  try {
    await requireAdmin()
    const validated = listOrganizationsSchema.parse(params || {})
    const { page, limit, search } = validated
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { isActive: true }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' as const } },
        { document: { contains: search, mode: 'insensitive' as const } },
      ]
    }

    const [orgs, total] = await Promise.all([
      database.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      database.organization.count({ where }),
    ])

    // Enriquecer com contagem de usuários
    const orgIds = orgs.map((o) => o.id)
    const counts = await database.userOrganization.groupBy({
      by: ['organizationId'],
      where: { organizationId: { in: orgIds } },
      _count: { userId: true },
    })

    const countMap: Record<string, number> = {}
    for (const c of counts) {
      countMap[c.organizationId] = c._count.userId
    }

    const enrichedOrgs = orgs.map((o) => ({
      ...o,
      userCount: countMap[o.id] || 0,
    }))

    return {
      success: true as const,
      data: {
        data: enrichedOrgs,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors.map((e) => e.message).join(', ') }
    }
    console.error('[Server Action] Error listing organizations:', error)
    return { success: false, error: sanitizeError(error) }
  }
}

export async function getOrganizationAction(id: string) {
  try {
    await requireAdmin()
    return await api.organizations.get.query({ params: { id } })
  } catch (error: any) {
    return { success: false, error: sanitizeError(error) }
  }
}

export async function deleteOrganizationAction(id: string) {
  try {
    await requireAdmin()
    const identifier = await getActionIdentifier()
    const rl = await adminMutationLimiter.check(identifier)
    if (!rl.success) {
      return { success: false, error: 'Muitas requisições. Tente novamente em alguns segundos.' }
    }
    return await (api.organizations.delete as any).mutate({ params: { id } })
  } catch (error: any) {
    return { success: false, error: sanitizeError(error) }
  }
}

export async function listInstancesAction(params?: { page?: number; limit?: number }) {
  try {
    await requireAdmin()
    return await api.instances.list.query({
      query: {
        page: params?.page || 1,
        limit: params?.limit || 20,
      },
    })
  } catch (error: any) {
    return { success: false, error: sanitizeError(error) }
  }
}

export async function listWebhooksAction(params?: { page?: number; limit?: number }) {
  try {
    await requireAdmin()
    return await api.webhooks.list.query({
      query: {
        page: params?.page || 1,
        limit: params?.limit || 20,
      },
    })
  } catch (error: any) {
    return { success: false, error: sanitizeError(error) }
  }
}

export async function listUsersAction() {
  try {
    await requireAdmin()
    // Usar endpoint auth.listUsers para buscar todos os usuários
    const result = await api.auth.listUsers.query()
    return { success: true, data: result.data || [] }
  } catch (error: any) {
    console.error('[Server Action] Error listing users:', error)
    return { success: false, error: sanitizeError(error), data: [] }
  }
}

export async function getDashboardStatsAction() {
  try {
    await requireAdmin()
    const [totalOrganizations, totalUsers, totalInstances, totalWebhooks] = await Promise.all([
      database.organization.count({ where: { isActive: true } }),
      database.user.count({ where: { isActive: true } }),
      database.connection.count(),
      database.webhook.count({ where: { isActive: true } }),
    ])

    return {
      success: true,
      data: {
        totalOrganizations,
        totalUsers,
        totalInstances,
        totalWebhooks,
      }
    }
  } catch (error: any) {
    return { success: false, error: sanitizeError(error) }
  }
}

export async function listAllOrgNamesAction(): Promise<{ success: boolean; data: { id: string; name: string }[]; error?: string }> {
  try {
    await requireAdmin()
    const orgs = await database.organization.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    return { success: true, data: orgs }
  } catch (error: unknown) {
    return { success: false, data: [], error: 'Erro ao carregar organizações' }
  }
}

// ============================================================
// USER MANAGEMENT ACTIONS (admin only)
// ============================================================

export interface OrgMember {
  id: string
  organizationId: string
  role: string
  isActive: boolean
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    role: string
    isActive: boolean
  }
}

export interface UserOrgMembership {
  organizationId: string
  organizationName: string
  role: string
}

export async function listOrgMembersAction(organizationId: string): Promise<{ success: boolean; data: OrgMember[]; error?: string }> {
  await requireAdmin()
  try {
    const members = await database.userOrganization.findMany({
      where: { organizationId, isActive: true },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, isActive: true },
        },
      },
      orderBy: { user: { name: 'asc' } },
    })

    return {
      success: true,
      data: members.map((m) => ({
        id: m.id,
        organizationId: m.organizationId,
        role: m.role,
        isActive: m.isActive,
        createdAt: m.createdAt.toISOString(),
        user: m.user,
      })),
    }
  } catch (error: any) {
    return { success: false, error: sanitizeError(error), data: [] }
  }
}

export async function listUserOrgsAction(userId: string): Promise<{ success: boolean; data: UserOrgMembership[]; error?: string }> {
  await requireAdmin()
  try {
    const memberships = await database.userOrganization.findMany({
      where: { userId },
      include: {
        organization: { select: { id: true, name: true } },
      },
      orderBy: { organization: { name: 'asc' } },
    })

    return {
      success: true,
      data: memberships.map((m) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        role: m.role,
      })),
    }
  } catch (error: any) {
    return { success: false, error: sanitizeError(error), data: [] }
  }
}

export async function updateUserSystemRoleAction(
  userId: string,
  role: 'user' | 'admin',
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()
    const identifier = await getActionIdentifier()
    const rl = await adminMutationLimiter.check(identifier)
    if (!rl.success) {
      return { success: false, error: 'Muitas requisições. Tente novamente em alguns segundos.' }
    }
    if (role === 'user') {
      const adminCount = await database.user.count({ where: { role: 'admin' } })
      if (adminCount <= 1) {
        return { success: false, error: 'Não é possível remover o último administrador do sistema.' }
      }
    }
    await database.user.update({ where: { id: userId }, data: { role } })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: sanitizeError(error) }
  }
}

export async function updateUserOrgRoleAction(
  userId: string,
  organizationId: string,
  role: 'master' | 'manager' | 'user',
): Promise<{ success: boolean; error?: string }> {
  try {
    await requireAdmin()
    if (role !== 'master') {
      const currentMembership = await database.userOrganization.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: { role: true },
      })
      if (currentMembership?.role === 'master') {
        const masterCount = await database.userOrganization.count({
          where: { organizationId, role: 'master', isActive: true },
        })
        if (masterCount <= 1) {
          return { success: false, error: 'Não é possível remover o último master da organização.' }
        }
      }
    }
    await database.userOrganization.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: { role },
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: sanitizeError(error) }
  }
}

export async function addUserToOrgAction(
  userId: string,
  organizationId: string,
  role: 'master' | 'manager' | 'user',
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    await database.userOrganization.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      create: { userId, organizationId, role },
      update: { role, isActive: true },
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: sanitizeError(error) }
  }
}

export async function removeUserFromOrgAction(
  userId: string,
  organizationId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  try {
    const membership = await database.userOrganization.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { role: true },
    })
    if (membership?.role === 'master') {
      const masterCount = await database.userOrganization.count({
        where: { organizationId, role: 'master', isActive: true },
      })
      if (masterCount <= 1) {
        return { success: false, error: 'Não é possível remover o último master da organização.' }
      }
    }
    await database.userOrganization.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: { isActive: false },
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: sanitizeError(error) }
  }
}

// ============================================================
// INSTANCE MANAGEMENT ACTIONS (admin only)
// ============================================================

export interface OrgInstance {
  id: string
  name: string
  phoneNumber: string | null
  status: string
  brokerType: string
  createdAt: string
}

export interface AdminInstance {
  id: string
  name: string
  phoneNumber: string | null
  status: string
  brokerType: string
  createdAt: string
  organization: { id: string; name: string } | null
}

export async function listOrgInstancesAction(
  organizationId: string,
): Promise<{ success: boolean; data: OrgInstance[]; error?: string }> {
  await requireAdmin()
  try {
    const connections = await database.connection.findMany({
      where: { organizationId },
      select: { id: true, name: true, phoneNumber: true, status: true, provider: true, createdAt: true },
      orderBy: { name: 'asc' },
    })
    return {
      success: true,
      data: connections.map((c) => ({
        id: c.id,
        name: c.name,
        phoneNumber: c.phoneNumber,
        status: c.status.toLowerCase(),
        brokerType: c.provider,
        createdAt: c.createdAt.toISOString(),
      })),
    }
  } catch (error: any) {
    return { success: false, error: sanitizeError(error), data: [] }
  }
}

export async function listAllInstancesAdminAction(params?: {
  page?: number
  limit?: number
  search?: string
  status?: 'connected' | 'disconnected' | 'all'
}): Promise<{
  success: boolean
  data: AdminInstance[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
  stats: { total: number; connected: number; disconnected: number; noOrg: number }
  error?: string
}> {
  await requireAdmin()
  const page = params?.page ?? 1
  const limit = Math.min(params?.limit ?? 50, 100)
  const search = params?.search?.trim() ?? ''
  const status = params?.status ?? 'all'

  try {
    const where: Record<string, unknown> = {}

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } },
        { organization: { name: { contains: search, mode: 'insensitive' } } },
      ]
    }

    if (status === 'connected') {
      where.status = 'CONNECTED'
    } else if (status === 'disconnected') {
      where.NOT = { status: 'CONNECTED' }
    }

    const [connections, total, connectedCount, noOrgCount] = await Promise.all([
      database.connection.findMany({
        where,
        include: { organization: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      database.connection.count({ where }),
      database.connection.count({ where: { ...where, status: 'CONNECTED' } }),
      database.connection.count({ where: { ...where, organizationId: null } }),
    ])

    return {
      success: true,
      data: connections.map((c) => ({
        id: c.id,
        name: c.name,
        phoneNumber: c.phoneNumber,
        status: c.status.toLowerCase(),
        brokerType: c.provider,
        createdAt: c.createdAt.toISOString(),
        organization: c.organization ?? null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total,
        connected: connectedCount,
        disconnected: total - connectedCount,
        noOrg: noOrgCount,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      error: sanitizeError(error),
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
      stats: { total: 0, connected: 0, disconnected: 0, noOrg: 0 },
    }
  }
}

// ============================================================
// UAZAPI DISCOVERY — cross-reference UAZapi vs banco local
// ============================================================

export interface UazapiDiscoveryInstance {
  /** Nome da instancia na UAZapi */
  name: string
  /** Token da instancia na UAZapi */
  token: string
  /** Status reportado pela UAZapi */
  status: string
  /** Telefone conectado (se disponivel) */
  phoneNumber: string | null
  /** Se ja existe no banco local */
  existsInDb: boolean
  /** ID no banco local (se existir) */
  dbConnectionId: string | null
  /** Org vinculada no banco (se existir) */
  organization: { id: string; name: string } | null
}

export interface UazapiDiscoveryResult {
  success: boolean
  data: {
    instances: UazapiDiscoveryInstance[]
    stats: {
      totalUazapi: number
      totalInDb: number
      orphaned: number
      synced: number
    }
  }
  error?: string
}

export async function discoverUazapiInstancesAction(): Promise<UazapiDiscoveryResult> {
  await requireAdmin()
  try {
    // 1. Buscar todas instancias da UAZapi
    const { uazapiService } = await import('@/lib/api/uazapi.service')
    const uazapiResult = await uazapiService.listAllInstances()

    if (!uazapiResult.success || !uazapiResult.data) {
      return {
        success: false,
        data: { instances: [], stats: { totalUazapi: 0, totalInDb: 0, orphaned: 0, synced: 0 } },
        error: uazapiResult.error || 'Falha ao conectar com UAZapi',
      }
    }

    // UAZapi retorna array de instancias (formato pode variar)
    const uazapiInstances: any[] = Array.isArray(uazapiResult.data)
      ? uazapiResult.data
      : uazapiResult.data.instances || uazapiResult.data.data || []

    // 2. Buscar todas connections do banco local
    const dbConnections = await database.connection.findMany({
      select: {
        id: true,
        name: true,
        uazapiToken: true,
        uazapiInstanceId: true,
        organizationId: true,
        organization: { select: { id: true, name: true } },
      },
    })

    // 3. Criar mapas para lookup rapido (token, uazapiInstanceId, nome)
    const tokenMap = new Map<string, typeof dbConnections[number]>()
    const idMap = new Map<string, typeof dbConnections[number]>()
    const nameMap = new Map<string, typeof dbConnections[number]>()
    for (const conn of dbConnections) {
      if (conn.uazapiToken) tokenMap.set(conn.uazapiToken, conn)
      if (conn.uazapiInstanceId) idMap.set(conn.uazapiInstanceId, conn)
      nameMap.set(conn.name.toLowerCase(), conn)
    }

    // 4. Cruzar dados — UAZapi retorna: id, token, name, status, owner (phone), profileName
    let synced = 0
    let orphaned = 0
    const instances: UazapiDiscoveryInstance[] = uazapiInstances.map((uaz: any) => {
      const uazToken = uaz.token || ''
      const uazName = uaz.name || 'sem-nome'
      const uazId = uaz.id || ''

      // Match por token, depois por uazapiInstanceId, depois por nome
      const dbMatch =
        tokenMap.get(uazToken) ||
        (uazId ? idMap.get(uazId) : null) ||
        nameMap.get(uazName.toLowerCase()) ||
        null

      if (dbMatch) {
        synced++
      } else {
        orphaned++
      }

      return {
        name: uazName,
        token: uazToken,
        status: uaz.status || 'unknown',
        phoneNumber: uaz.owner || null,
        existsInDb: !!dbMatch,
        dbConnectionId: dbMatch?.id || null,
        organization: dbMatch?.organization || null,
      }
    })

    return {
      success: true,
      data: {
        instances,
        stats: {
          totalUazapi: uazapiInstances.length,
          totalInDb: dbConnections.length,
          orphaned,
          synced,
        },
      },
    }
  } catch (error: any) {
    return {
      success: false,
      data: { instances: [], stats: { totalUazapi: 0, totalInDb: 0, orphaned: 0, synced: 0 } },
      error: sanitizeError(error),
    }
  }
}

export async function importUazapiInstanceAction(params: {
  name: string
  token: string
  phoneNumber?: string
  organizationId?: string
}): Promise<{ success: boolean; connectionId?: string; error?: string }> {
  await requireAdmin()
  const identifier = await getActionIdentifier()
  const rl = await adminMutationLimiter.check(identifier)
  if (!rl.success) {
    return { success: false, error: 'Muitas requisicoes. Tente novamente em alguns segundos.' }
  }
  try {
    // Verificar se ja existe com mesmo token
    const existing = await database.connection.findFirst({
      where: { uazapiToken: params.token },
      select: { id: true },
    })
    if (existing) {
      return { success: false, error: 'Esta instancia ja esta importada no banco.' }
    }

    const connection = await database.connection.create({
      data: {
        name: params.name,
        uazapiToken: params.token,
        phoneNumber: params.phoneNumber || null,
        status: 'DISCONNECTED',
        provider: 'WHATSAPP_WEB',
        channel: 'WHATSAPP',
        organizationId: params.organizationId || null,
      },
    })

    return { success: true, connectionId: connection.id }
  } catch (error: any) {
    return { success: false, error: sanitizeError(error) }
  }
}

// ============================================================
// WEBHOOK MANAGEMENT ACTIONS (admin only)
// ============================================================

export interface OrgWebhook {
  id: string
  url: string
  events: string[]
  description: string | null
  isActive: boolean
  instanceId: string | null
  instanceName: string | null
  createdAt: string
}

export async function listOrgWebhooksAction(
  organizationId: string,
): Promise<{ success: boolean; data: OrgWebhook[]; error?: string }> {
  await requireAdmin()
  try {
    const webhooks = await database.webhook.findMany({
      where: { organizationId },
      include: { connection: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return {
      success: true,
      data: webhooks.map((w) => ({
        id: w.id,
        url: w.url,
        events: w.events,
        description: w.description ?? null,
        isActive: w.isActive,
        instanceId: w.connectionId ?? null,
        instanceName: w.connection?.name ?? null,
        createdAt: w.createdAt.toISOString(),
      })),
    }
  } catch (error: any) {
    return { success: false, error: sanitizeError(error), data: [] }
  }
}

function maskToken(value: string | undefined): string {
  if (!value || value.length < 8) return value ? '***' : ''
  return value.slice(0, 4) + '*'.repeat(value.length - 8) + value.slice(-4)
}

export async function getEnvDefaultsAction(): Promise<{
  success: boolean
  data?: {
    oauth: {
      googleClientIdMasked: string
      googleRedirectUri: string
    }
    uazapi: {
      baseUrl: string
      adminTokenMasked: string
      webhookUrl: string
    }
    ai: {
      openaiApiKeyMasked: string
      defaultModel: string
    }
    email: {
      provider: string
      from: string
      fromName: string
      smtpHost: string
      smtpPort: number
      smtpUser: string
      smtpPasswordMasked: string
    }
  }
  error?: string
}> {
  await requireAdmin()
  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID ?? ''
    const uazapiAdminToken = process.env.UAZAPI_ADMIN_TOKEN ?? ''
    const openaiApiKey = process.env.OPENAI_API_KEY ?? ''
    const smtpPass = process.env.SMTP_PASS ?? ''
    return {
      success: true,
      data: {
        oauth: {
          googleClientIdMasked: maskToken(googleClientId),
          googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
        },
        uazapi: {
          baseUrl: process.env.UAZAPI_BASE_URL ?? '',
          adminTokenMasked: maskToken(uazapiAdminToken),
          webhookUrl: process.env.UAZAPI_WEBHOOK_URL ?? '',
        },
        ai: {
          openaiApiKeyMasked: maskToken(openaiApiKey),
          defaultModel: process.env.OPENAI_DEFAULT_MODEL ?? 'gpt-4o-mini',
        },
        email: {
          provider: process.env.EMAIL_PROVIDER ?? 'smtp',
          from: process.env.EMAIL_FROM ?? '',
          fromName: process.env.EMAIL_FROM_NAME ?? '',
          smtpHost: process.env.SMTP_HOST ?? '',
          smtpPort: parseInt(process.env.SMTP_PORT ?? '587', 10),
          smtpUser: process.env.SMTP_USER ?? '',
          smtpPasswordMasked: maskToken(smtpPass),
        },
      },
    }
  } catch (error: any) {
    return { success: false, error: sanitizeError(error) }
  }
}

// ============================================================
// DELETE INSTANCE (admin only)
// ============================================================

export async function deleteInstanceAdminAction(
  connectionId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  const identifier = await getActionIdentifier()
  const rl = await adminMutationLimiter.check(identifier)
  if (!rl.success) {
    return { success: false, error: 'Muitas requisicoes. Tente novamente em alguns segundos.' }
  }
  try {
    const conn = await database.connection.findUnique({
      where: { id: connectionId },
      select: { id: true, uazapiToken: true },
    })
    if (!conn) {
      return { success: false, error: 'Instancia nao encontrada.' }
    }

    if (conn.uazapiToken) {
      try {
        const { uazapiService } = await import('@/lib/api/uazapi.service')
        await uazapiService.disconnectInstance(conn.uazapiToken)
      } catch {
        // Ignora erro UAZapi — deleta localmente mesmo assim
      }
    }

    await database.connection.delete({ where: { id: connectionId } })
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: sanitizeError(error) }
  }
}

// ============================================================
// CHANGE INSTANCE ORG — mover instancia para outra organizacao
// ============================================================

export async function changeInstanceOrgAction(
  connectionId: string,
  organizationId: string,
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin()
  const identifier = await getActionIdentifier()
  const rl = await adminMutationLimiter.check(identifier)
  if (!rl.success) {
    return { success: false, error: 'Muitas requisicoes. Tente novamente em alguns segundos.' }
  }
  try {
    const org = await database.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    })
    if (!org) {
      return { success: false, error: 'Organizacao nao encontrada.' }
    }

    await database.connection.update({
      where: { id: connectionId },
      data: { organizationId },
    })
    return { success: true }
  } catch (error: unknown) {
    return { success: false, error: sanitizeError(error) }
  }
}

// ============================================================
// SYNC STATUS — atualiza status no banco a partir da UAZapi
// ============================================================

export async function syncUazapiStatusAction(): Promise<{
  success: boolean
  updated: number
  error?: string
}> {
  await requireAdmin()
  try {
    const { uazapiService } = await import('@/lib/api/uazapi.service')

    const connections = await database.connection.findMany({
      where: { uazapiToken: { not: null } },
      select: { id: true, uazapiToken: true, status: true },
    })

    let updated = 0
    for (const conn of connections) {
      if (!conn.uazapiToken) continue
      try {
        const result = await uazapiService.getInstanceStatus(conn.uazapiToken)
        if (result.success && result.data) {
          const newStatus = (result.data.status as string) === 'connected' ? 'CONNECTED'
            : (result.data.status as string) === 'connecting' ? 'CONNECTING'
            : 'DISCONNECTED'

          if (newStatus !== conn.status) {
            await database.connection.update({
              where: { id: conn.id },
              data: {
                status: newStatus as any,
                phoneNumber: result.data.phoneNumber || undefined,
              },
            })
            updated++
          }
        }
      } catch {
        // Skip individual failures
      }
    }

    return { success: true, updated }
  } catch (error: unknown) {
    return { success: false, updated: 0, error: sanitizeError(error) }
  }
}
