'use server'

import { cookies } from 'next/headers'

/**
 * Server Action para buscar convites
 * Usado na página /admin/invitations para listar convites com token SSR
 */
export async function getInvitationsAction(tokenFromClient?: string) {
  try {
    const cookieStore = await cookies()
    let token = cookieStore.get('access_token')?.value

    // ✅ FALLBACK: Se não tem token em cookies, usar o token passado pelo cliente
    // Isso permite compatibilidade com o fluxo atual de auth que usa localStorage
    if (!token && tokenFromClient) {
      token = tokenFromClient
    }

    if (!token) {
      return {
        success: false,
        error: 'Token não encontrado. Faça login novamente.',
        data: null,
      }
    }

    // Buscar convites da API
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/invitations/list`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}`,
        data: null,
      }
    }

    const data = await response.json()

    return {
      success: true,
      error: null,
      data: data.data || [],
    }
  } catch (error: any) {
    console.error('[getInvitationsAction] Error:', error)
    return {
      success: false,
      error: error.message || 'Erro ao buscar convites',
      data: null,
    }
  }
}

/**
 * Server Action para criar convite
 */
export async function createInvitationAction(formData: {
  email: string
  role: string
  organizationId: string
  expiresInDays: number
}) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return {
        success: false,
        error: 'Token não encontrado',
        data: null,
      }
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/invitations/create`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}`,
        data: null,
      }
    }

    const data = await response.json()

    return {
      success: true,
      error: null,
      data: data.invitation,
    }
  } catch (error: any) {
    console.error('[createInvitationAction] Error:', error)
    return {
      success: false,
      error: error.message || 'Erro ao criar convite',
      data: null,
    }
  }
}

/**
 * Server Action para reenviar convite
 */
export async function resendInvitationAction(invitationId: string) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return {
        success: false,
        error: 'Token não encontrado',
      }
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/invitations/${invitationId}/resend`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresInDays: 7 }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}`,
      }
    }

    return {
      success: true,
      error: null,
    }
  } catch (error: any) {
    console.error('[resendInvitationAction] Error:', error)
    return {
      success: false,
      error: error.message || 'Erro ao reenviar convite',
    }
  }
}

/**
 * Server Action para cancelar convite
 */
export async function deleteInvitationAction(invitationId: string) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    if (!token) {
      return {
        success: false,
        error: 'Token não encontrado',
      }
    }

    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/v1/invitations/${invitationId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido' }))
      return {
        success: false,
        error: errorData.message || `HTTP ${response.status}`,
      }
    }

    return {
      success: true,
      error: null,
    }
  } catch (error: any) {
    console.error('[deleteInvitationAction] Error:', error)
    return {
      success: false,
      error: error.message || 'Erro ao cancelar convite',
    }
  }
}
