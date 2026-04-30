'use server'

import { cookies } from 'next/headers'
import { database } from '@/server/services/database'
import { requireAdmin, sanitizeError } from '../utils'

/** Extract a plain string from Igniter API error responses (error can be string or {message, code, details}) */
function extractApiError(data: Record<string, unknown>, status: number): string {
  if (typeof data.message === 'string') return data.message
  if (typeof data.error === 'string') return data.error
  if (typeof data.detail === 'string') return data.detail
  if (data.error && typeof data.error === 'object' && 'message' in (data.error as object)) {
    return String((data.error as { message: unknown }).message)
  }
  return `Erro HTTP ${status}`
}

export async function getInvitationsAction(params?: {
  page?: number
  limit?: number
  search?: string
  status?: string
}) {
  try {
    await requireAdmin()
    const page = params?.page || 1
    const limit = params?.limit || 20
    const skip = (page - 1) * limit
    const search = params?.search
    const status = params?.status

    // Build where clause
    const where: Record<string, unknown> = {}
    if (search) {
      where.email = { contains: search, mode: 'insensitive' }
    }
    if (status && status !== 'all') {
      const now = new Date()
      if (status === 'accepted') {
        where.usedAt = { not: null }
      } else if (status === 'pending') {
        where.usedAt = null
        where.expiresAt = { gt: now }
      } else if (status === 'expired') {
        where.usedAt = null
        where.expiresAt = { lte: now }
      }
    }

    const now = new Date()
    const [invitations, total, totalPending, totalAccepted, totalExpired] = await Promise.all([
      database.invitation.findMany({
        where,
        select: {
          id: true,
          email: true,
          // token is explicitly excluded
          role: true,
          organizationId: true,
          invitedById: true,
          usedAt: true,
          expiresAt: true,
          createdAt: true,
          invitedBy: {
            select: { id: true, name: true, email: true },
          },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      database.invitation.count({ where }),
      // Stats reais — independentes do filtro de status atual
      database.invitation.count({ where: { usedAt: null, expiresAt: { gt: now } } }),
      database.invitation.count({ where: { usedAt: { not: null } } }),
      database.invitation.count({ where: { usedAt: null, expiresAt: { lte: now } } }),
    ])

    // Fetch organization names for all unique organizationIds
    const orgIds = [...new Set(invitations.map((i) => i.organizationId))]
    const orgs = orgIds.length > 0
      ? await database.organization.findMany({
          where: { id: { in: orgIds } },
          select: { id: true, name: true },
        })
      : []
    const orgMap: Record<string, { id: string; name: string }> = {}
    for (const org of orgs) {
      orgMap[org.id] = org
    }

    const data = invitations.map((inv) => ({
      ...inv,
      organization: orgMap[inv.organizationId] || { id: inv.organizationId, name: 'N/A' },
    }))

    return {
      success: true,
      error: null,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      stats: {
        total: totalPending + totalAccepted + totalExpired,
        pending: totalPending,
        accepted: totalAccepted,
        expired: totalExpired,
      },
    }
  } catch (error: unknown) {
    console.error('[getInvitationsAction] Error:', error)
    return { success: false, error: sanitizeError(error), data: null, pagination: null }
  }
}

export async function createInvitationAction(formData: {
  email: string
  role: string
  organizationId: string
  expiresInDays: number
}) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('accessToken')?.value

    if (!token) {
      return { success: false, error: 'Token não encontrado. Faça login novamente.', data: null }
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/invitations/create`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: extractApiError(errorData, response.status), data: null }
    }

    const data = await response.json()
    return { success: true, error: null, data: data.invitation }
  } catch (error: unknown) {
    console.error('[createInvitationAction] Error:', error)
    return { success: false, error: sanitizeError(error), data: null }
  }
}

export async function resendInvitationAction(invitationId: string) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('accessToken')?.value

    if (!token) {
      return { success: false, error: 'Token não encontrado. Faça login novamente.' }
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/invitations/${invitationId}/resend`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresInDays: 7 }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: extractApiError(errorData, response.status) }
    }

    return { success: true, error: null }
  } catch (error: unknown) {
    console.error('[resendInvitationAction] Error:', error)
    return { success: false, error: sanitizeError(error) }
  }
}

export interface OrgInvitation {
  id: string
  email: string
  role: string
  status: 'pending' | 'accepted' | 'expired'
  expiresAt: string
  createdAt: string
}

export async function listOrgInvitationsAction(
  organizationId: string,
): Promise<{ success: boolean; data: OrgInvitation[]; error?: string }> {
  try {
    await requireAdmin()
    const now = new Date()
    const invitations = await database.invitation.findMany({
      where: { organizationId },
      select: { id: true, email: true, role: true, usedAt: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    return {
      success: true,
      data: invitations.map((inv) => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.usedAt ? 'accepted' as const : inv.expiresAt < now ? 'expired' as const : 'pending' as const,
        expiresAt: inv.expiresAt.toISOString(),
        createdAt: inv.createdAt.toISOString(),
      })),
    }
  } catch (error: unknown) {
    return { success: false, data: [], error: sanitizeError(error) }
  }
}

export async function deleteInvitationAction(invitationId: string) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('accessToken')?.value

    if (!token) {
      return { success: false, error: 'Token não encontrado. Faça login novamente.' }
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/invitations/${invitationId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return { success: false, error: extractApiError(errorData, response.status) }
    }

    return { success: true, error: null }
  } catch (error: unknown) {
    console.error('[deleteInvitationAction] Error:', error)
    return { success: false, error: sanitizeError(error) }
  }
}
