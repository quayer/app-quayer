'use server'

import { cookies } from 'next/headers'
import { PrismaClient } from '@prisma/client'
import jwt from 'jsonwebtoken'

/**
 * Server Actions para páginas admin
 * ✅ CORREÇÃO BRUTAL: Acessar banco diretamente no servidor (sem API HTTP)
 */

const db = new PrismaClient()

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
    await getAuthenticatedUser()

    await db.organization.delete({
      where: { id },
    })

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
    await getAuthenticatedUser()

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

    // ✅ CORREÇÃO: Remover db.instance.count() - tabela não existe
    // Contar connections em vez de instances
    const [totalOrganizations, totalUsers, totalConnections, totalWebhooks] = await Promise.all([
      db.organization.count(),
      db.user.count(),
      db.connection.count(), // Corrigido: connection existe no schema
      db.webhook.count(),
    ])

    return {
      success: true,
      data: {
        totalOrganizations,
        totalUsers,
        totalInstances: totalConnections, // Compatibilidade com interface
        totalWebhooks,
      }
    }
  } catch (error: any) {
    console.error('[getDashboardStatsAction] Error:', error);
    return { success: false, error: error.message }
  }
}

