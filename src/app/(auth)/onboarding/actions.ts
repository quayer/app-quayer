'use server'

import { cookies } from 'next/headers'

export async function createOrganizationAction(formData: FormData) {
  try {
    const name = formData.get('name') as string
    const document = formData.get('document') as string
    const type = formData.get('type') as 'pf' | 'pj'

    // ✅ CORREÇÃO BRUTAL: Obter token dos cookies
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('accessToken')?.value

    if (!accessToken) {
      return {
        success: false,
        error: 'Não autenticado'
      }
    }

    // ✅ CORREÇÃO BRUTAL: Fazer fetch HTTP para a API (mesmo padrão do loginAction)
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

    if (!response.ok) {
      return {
        success: false,
        error: result.error || result.data?.error || 'Erro ao criar organização'
      }
    }

    const orgData = result.data

    if (orgData?.organization) {
      // ✅ CORREÇÃO BRUTAL: Marcar onboarding como completo e obter novo token
      const completeResponse = await fetch(`${process.env.NEXT_PUBLIC_IGNITER_API_URL || 'http://localhost:3000'}/api/v1/auth/onboarding/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      })

      if (completeResponse.ok) {
        const completeData = await completeResponse.json()
        console.log('✅ Onboarding complete response:', completeData)

        // ✅ CORREÇÃO BRUTAL: Atualizar cookie com novo accessToken que contém currentOrgId
        if (completeData.data?.accessToken) {
          const cookieStore = await cookies()
          cookieStore.set('accessToken', completeData.data.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24, // 24 hours
            path: '/',
          })
          console.log('✅ Access token updated with currentOrgId')
        }
      } else {
        console.error('❌ Erro ao completar onboarding:', await completeResponse.text())
      }
    }

    return { success: true, organization: orgData?.organization }
  } catch (error: any) {
    console.error('❌ Server Action Error:', error)
    return {
      success: false,
      error: error.message || 'Erro ao criar organização'
    }
  }
}

