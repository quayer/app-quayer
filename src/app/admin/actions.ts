'use server'

import { api } from '@/igniter.client'
import { database } from '@/services/database'

/**
 * Server Actions para páginas admin
 * Segurança: rotas /admin/* protegidas pelo middleware (src/middleware.ts)
 * Actions Prisma diretas confiam no middleware — mesmo padrão das outras actions do arquivo
 */

export async function listOrganizationsAction(params?: { page?: number; limit?: number; search?: string }) {
  try {
    const result = await api.organizations.list.query({
      query: {
        page: params?.page || 1,
        limit: params?.limit || 20,
        search: params?.search,
      },
    })

    // Enriquecer com contagem de usuários via Prisma
    if (!(result as any).error && (result as any).data?.data) {
      const orgs: any[] = (result as any).data.data
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

      ;(result as any).data.data = orgs.map((o) => ({
        ...o,
        userCount: countMap[o.id] || 0,
      }))
    }

    return result
  } catch (error: any) {
    console.error('[Server Action] Error listing organizations:', error)
    return { success: false, error: error.message }
  }
}

export async function getOrganizationAction(id: string) {
  try {
    return await api.organizations.get.query({ params: { id } })
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteOrganizationAction(id: string) {
  try {
    return await api.organizations.delete.mutate({ params: { id } })
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function listInstancesAction(params?: { page?: number; limit?: number }) {
  try {
    return await api.instances.list.query({
      query: {
        page: params?.page || 1,
        limit: params?.limit || 20,
      },
    })
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function listWebhooksAction(params?: { page?: number; limit?: number }) {
  try {
    return await api.webhooks.list.query({
      query: {
        page: params?.page || 1,
        limit: params?.limit || 20,
      },
    })
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function listUsersAction() {
  try {
    // Usar endpoint auth.listUsers para buscar todos os usuários
    const result = await api.auth.listUsers.query()
    return { success: true, data: result.data || [] }
  } catch (error: any) {
    console.error('[Server Action] Error listing users:', error)
    return { success: false, error: error.message, data: [] }
  }
}

export async function getDashboardStatsAction() {
  try {
    const [orgs, instances, webhooks, users] = await Promise.all([
      api.organizations.list.query({ query: { page: 1, limit: 1 } }),
      api.instances.list.query({ query: { page: 1, limit: 1 } }),
      api.webhooks.list.query({ query: { page: 1, limit: 1 } }),
      api.auth.listUsers.query(),
    ])

    return {
      success: true,
      data: {
        totalOrganizations: orgs.data?.pagination?.total || 0,
        totalUsers: Array.isArray(users.data) ? users.data.length : 0,
        totalInstances: instances.data?.pagination?.total || 0,
        totalWebhooks: webhooks.data?.pagination?.total || 0,
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
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
  try {
    const members = await database.userOrganization.findMany({
      where: { organizationId },
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
    return { success: false, error: error.message, data: [] }
  }
}

export async function listUserOrgsAction(userId: string): Promise<{ success: boolean; data: UserOrgMembership[]; error?: string }> {
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
    return { success: false, error: error.message, data: [] }
  }
}

export async function updateUserSystemRoleAction(
  userId: string,
  role: 'user' | 'admin',
): Promise<{ success: boolean; error?: string }> {
  try {
    await database.user.update({ where: { id: userId }, data: { role } })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateUserOrgRoleAction(
  userId: string,
  organizationId: string,
  role: 'master' | 'manager' | 'user',
): Promise<{ success: boolean; error?: string }> {
  try {
    await database.userOrganization.update({
      where: { userId_organizationId: { userId, organizationId } },
      data: { role },
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function addUserToOrgAction(
  userId: string,
  organizationId: string,
  role: 'master' | 'manager' | 'user',
): Promise<{ success: boolean; error?: string }> {
  try {
    await database.userOrganization.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      create: { userId, organizationId, role },
      update: { role, isActive: true },
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function removeUserFromOrgAction(
  userId: string,
  organizationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await database.userOrganization.delete({
      where: { userId_organizationId: { userId, organizationId } },
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
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
  try {
    const instances = await database.instance.findMany({
      where: { organizationId },
      select: { id: true, name: true, phoneNumber: true, status: true, brokerType: true, createdAt: true },
      orderBy: { name: 'asc' },
    })
    return {
      success: true,
      data: instances.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
    }
  } catch (error: any) {
    return { success: false, error: error.message, data: [] }
  }
}

export async function listAllInstancesAdminAction(): Promise<{
  success: boolean
  data: AdminInstance[]
  error?: string
}> {
  try {
    const instances = await database.instance.findMany({
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return {
      success: true,
      data: instances.map((i) => ({
        id: i.id,
        name: i.name,
        phoneNumber: i.phoneNumber,
        status: i.status,
        brokerType: i.brokerType,
        createdAt: i.createdAt.toISOString(),
        organization: i.organization ?? null,
      })),
    }
  } catch (error: any) {
    return { success: false, error: error.message, data: [] }
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
  try {
    const webhooks = await database.webhook.findMany({
      where: { organizationId },
      include: { instance: { select: { name: true } } },
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
        instanceId: w.instanceId ?? null,
        instanceName: w.instance?.name ?? null,
        createdAt: w.createdAt.toISOString(),
      })),
    }
  } catch (error: any) {
    return { success: false, error: error.message, data: [] }
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
      googleClientId: string
      googleClientIdMasked: string
      googleRedirectUri: string
    }
    uazapi: {
      baseUrl: string
      adminToken: string
      adminTokenMasked: string
      webhookUrl: string
    }
  }
  error?: string
}> {
  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID ?? ''
    const uazapiAdminToken = process.env.UAZAPI_ADMIN_TOKEN ?? ''
    return {
      success: true,
      data: {
        oauth: {
          googleClientId,
          googleClientIdMasked: maskToken(googleClientId),
          googleRedirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
        },
        uazapi: {
          baseUrl: process.env.UAZAPI_BASE_URL ?? '',
          adminToken: uazapiAdminToken,
          adminTokenMasked: maskToken(uazapiAdminToken),
          webhookUrl: process.env.UAZAPI_WEBHOOK_URL ?? '',
        },
      },
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
