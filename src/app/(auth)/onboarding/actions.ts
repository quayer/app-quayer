'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { signAccessToken, verifyAccessToken } from '@/lib/auth/jwt'
import type { UserRole } from '@/lib/auth/roles'

const nameSchema = z.string().min(2, 'Nome muito curto').max(100)

const isProduction = process.env.NODE_ENV === 'production'

export async function createOrganizationAction(formData: FormData) {
  try {
    const name = nameSchema.parse(formData.get('name'))
    const document = formData.get('document') as string | null
    const type = (formData.get('type') as 'pf' | 'pj') || 'pj'

    const cookieStore = await cookies()
    const accessToken = cookieStore.get('accessToken')?.value
    const csrfToken = cookieStore.get('csrf_token')?.value

    if (!accessToken) {
      return { success: false, error: 'Não autenticado' }
    }

    // Montar headers com auth + CSRF (server action precisa repassar cookies)
    const apiHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    }
    if (csrfToken) {
      apiHeaders['x-csrf-token'] = csrfToken
      apiHeaders['Cookie'] = `csrf_token=${csrfToken}`
    }

    // Montar body — document é opcional no onboarding simplificado
    const body: Record<string, unknown> = {
      name,
      type,
      maxInstances: 5,
      maxUsers: 10,
      billingType: 'free',
    }
    if (document?.trim()) {
      body.document = document.replace(/\D/g, '')
    }

    // Criar organização
    const response = await fetch(`${process.env.NEXT_PUBLIC_IGNITER_API_URL || 'http://localhost:3000'}/api/v1/organizations`, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify(body),
    })

    const result = await response.json()

    if (!response.ok) {
      // Igniter returns errors in: result.message, result.error, result.data?.error, or details[0].message
      const details = result.details?.[0]?.message || result.data?.details?.[0]?.message
      const errorMsg = details || result.message || result.error || result.data?.error || result.data?.message || 'Erro ao criar organização'
      return { success: false, error: errorMsg }
    }

    const orgData = result.data

    if (orgData?.organization) {
      // Marcar onboarding como completo (repassar CSRF)
      const completeHeaders: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
      }
      if (csrfToken) {
        completeHeaders['x-csrf-token'] = csrfToken
        completeHeaders['Cookie'] = `csrf_token=${csrfToken}`
      }
      const completeResponse = await fetch(`${process.env.NEXT_PUBLIC_IGNITER_API_URL || 'http://localhost:3000'}/api/v1/auth/onboarding/complete`, {
        method: 'POST',
        headers: completeHeaders,
      })

      if (!completeResponse.ok) {
        return { success: false, error: 'Erro ao finalizar onboarding' }
      }

      // Emitir novo JWT com needsOnboarding: false diretamente no Server Action
      // (o Set-Cookie da resposta interna não chega ao browser)
      // SEGURANÇA: verificar assinatura antes de re-assinar para evitar escalada de privilégio
      const verified = verifyAccessToken(accessToken)
      if (verified) {
        const newToken = signAccessToken({
          userId: verified.userId,
          email: verified.email,
          role: verified.role as UserRole,
          currentOrgId: verified.currentOrgId || orgData.organization.id,
          organizationRole: verified.organizationRole,
          needsOnboarding: false,
        })
        cookieStore.set('accessToken', newToken, {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 900,
          secure: isProduction,
        })
      }
    }

    return { success: true, organization: orgData?.organization }
  } catch (error: unknown) {
    console.error('❌ Server Action Error:', error)
    const message = error instanceof Error ? error.message : 'Erro ao criar organização'
    return {
      success: false,
      error: message,
    }
  }
}

export async function logoutAndRedirectAction() {
  const cookieStore = await cookies()
  cookieStore.delete('accessToken')
  cookieStore.delete('refreshToken')
  redirect('/login')
}
