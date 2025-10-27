'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export async function loginAction(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // Fazer chamada para a API
  const response = await fetch(`${process.env.NEXT_PUBLIC_IGNITER_API_URL || 'http://localhost:3000'}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })

  const result = await response.json()

  if (!response.ok) {
    return {
      error: result.error || result.data?.error || 'Erro ao fazer login',
    }
  }

  const loginData = result.data

  if (loginData && loginData.accessToken) {
    // Definir cookie no server-side
    const cookieStore = await cookies()

    // Access token (15 minutos)
    cookieStore.set('accessToken', loginData.accessToken, {
      httpOnly: false, // Precisa ser acessível pelo client para chamadas API
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutos
      path: '/',
    })

    // Refresh token (7 dias)
    if (loginData.refreshToken) {
      cookieStore.set('refreshToken', loginData.refreshToken, {
        httpOnly: true, // Mais seguro, só server-side
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 dias
        path: '/',
      })
    }

    // Check if user needs onboarding
    if (loginData.needsOnboarding === true) {
      redirect('/onboarding')
    }

    // Redirecionar baseado no role
    const userRole = loginData.user?.role
    if (userRole === 'admin') {
      redirect('/admin')
    } else {
      redirect('/integracoes')
    }
  }

  return {
    error: 'Resposta inválida do servidor',
  }
}
