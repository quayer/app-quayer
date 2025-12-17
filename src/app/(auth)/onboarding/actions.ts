'use server'

import { cookies } from 'next/headers'

export async function createOrganizationAction(formData: FormData) {
  try {
    const name = formData.get('name') as string
    const document = formData.get('document') as string
    const type = formData.get('type') as 'pf' | 'pj'

    // Obter token dos cookies
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('accessToken')?.value

    if (!accessToken) {
      return {
        success: false,
        error: 'Não autenticado'
      }
    }

    // Fazer fetch HTTP para a API
    const response = await fetch(`${process.env.NEXT_PUBLIC_IGNITER_API_URL || 'http://localhost:3000'}/api/v1/organizations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name,
        document: document.replace(/\D/g, ''),
        type,
        maxInstances: 5,
        maxUsers: 10,
        billingType: 'free',
      }),
    })

    const result = await response.json()
    console.log('📦 Organization API Response:', JSON.stringify(result, null, 2))

    if (!response.ok) {
      // Extrair erro de diferentes formatos de resposta
      const errorMessage = result.error || result.message || result.data?.error || 'Erro ao criar organização'
      console.error('❌ Organization creation failed:', errorMessage)
      return {
        success: false,
        error: errorMessage
      }
    }

    // O endpoint retorna: { message, organization, accessToken } dentro de data
    const orgData = result.data || result

    if (orgData?.organization && orgData?.accessToken) {
      // O endpoint já retorna o novo accessToken com currentOrgId e needsOnboarding: false
      // Atualizar cookie diretamente com o token retornado
      const newCookieStore = await cookies()
      newCookieStore.set('accessToken', orgData.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/',
      })
      console.log('✅ Access token updated with currentOrgId from organization creation')

      return { success: true, organization: orgData.organization }
    }

    // Fallback: se não veio accessToken, tentar endpoint de complete
    if (orgData?.organization) {
      console.log('⚠️ No accessToken in response, calling onboarding/complete...')

      const completeResponse = await fetch(`${process.env.NEXT_PUBLIC_IGNITER_API_URL || 'http://localhost:3000'}/api/v1/auth/onboarding/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      if (completeResponse.ok) {
        const completeData = await completeResponse.json()
        console.log('✅ Onboarding complete response:', completeData)

        if (completeData.data?.accessToken) {
          const newCookieStore = await cookies()
          newCookieStore.set('accessToken', completeData.data.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24,
            path: '/',
          })
        }
      }

      return { success: true, organization: orgData.organization }
    }

    // Se chegou aqui, algo deu errado
    console.error('❌ Unexpected response format:', result)
    return {
      success: false,
      error: 'Resposta inesperada do servidor'
    }
  } catch (error: any) {
    console.error('❌ Server Action Error:', error)
    return {
      success: false,
      error: error.message || 'Erro ao criar organização'
    }
  }
}
