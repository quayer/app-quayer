'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { api } from '@/igniter.client'

export default function GoogleCallbackPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState<string>('')

  useEffect(() => {
    const code = searchParams.get('code')
    const errorParam = searchParams.get('error')

    if (errorParam) {
      setError('Erro na autenticação com Google')
      setTimeout(() => router.push('/login'), 3000)
      return
    }

    if (code) {
      handleGoogleCallback(code)
    }
  }, [searchParams])

  const handleGoogleCallback = async (code: string) => {
    try {
      console.log('[GOOGLE CALLBACK] Starting authentication with code:', code.substring(0, 20) + '...')

      const { data, error: apiError } = await api.auth.googleCallback.mutate({
        body: { code }
      })

      console.log('[GOOGLE CALLBACK] API Response:', {
        hasData: !!data,
        hasError: !!apiError,
        hasAccessToken: !!(data as any)?.accessToken,
        hasRefreshToken: !!(data as any)?.refreshToken,
        userRole: (data as any)?.user?.role,
        userId: (data as any)?.user?.id
      })

      if (apiError) {
        console.error('[GOOGLE CALLBACK] API Error:', apiError)
        setError('Código de autorização expirado ou inválido')
        setTimeout(() => router.push('/login'), 3000)
        return
      }

      if ((data as any)?.accessToken && (data as any)?.refreshToken) {
        console.log('[GOOGLE CALLBACK] Tokens received successfully')
        console.log('[GOOGLE CALLBACK] Saving tokens to localStorage and cookies...')

        // Salvar tokens no localStorage
        localStorage.setItem('accessToken', (data as any).accessToken)
        localStorage.setItem('refreshToken', (data as any).refreshToken)

        // Salvar accessToken em cookie também para o middleware Next.js
        const cookieValue = encodeURIComponent((data as any).accessToken)
        document.cookie = 'accessToken=' + cookieValue + '; path=/; max-age=86400; SameSite=Lax'

        console.log('[GOOGLE CALLBACK] Tokens saved')
        console.log('[GOOGLE CALLBACK] User role:', (data as any).user?.role)

        // Redirecionar para dashboard baseado no role
        const redirectPath = (data as any).user?.role === 'admin' ? '/admin' : '/integracoes'
        console.log('[GOOGLE CALLBACK] Redirecting to:', redirectPath)

        // Usar window.location para forçar reload completo e carregar auth state
        window.location.href = redirectPath
      } else {
        console.error('[GOOGLE CALLBACK] Missing tokens in response:', {
          hasAccessToken: !!(data as any)?.accessToken,
          hasRefreshToken: !!(data as any)?.refreshToken
        })
        setError('Erro ao processar autenticação')
        setTimeout(() => router.push('/login'), 3000)
      }
    } catch (err: any) {
      console.error('[GOOGLE CALLBACK] Exception caught:', err)
      console.error('[GOOGLE CALLBACK] Error details:', {
        message: err?.message,
        response: err?.response?.data,
        stack: err?.stack
      })

      // Melhor tratamento de erro
      const errorMessage = err?.response?.data?.message
        || err?.message
        || 'Código de autorização expirado. Tente fazer login novamente.'
      setError(errorMessage)
      setTimeout(() => router.push('/login'), 3000)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col gap-6 text-center">
          {error ? (
            <>
              <div className="flex justify-center">
                <AlertCircle className="h-12 w-12 text-red-400" />
              </div>
              <Alert variant="destructive" className="border-red-500/50 bg-red-500/10">
                <AlertDescription className="text-red-200">{error}</AlertDescription>
              </Alert>
              <p className="text-sm text-muted-foreground">Redirecionando para o login...</p>
            </>
          ) : (
            <>
              <div className="flex justify-center">
                <Loader2 className="h-12 w-12 animate-spin" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium">Processando autenticação...</p>
                <p className="text-sm text-muted-foreground">Aguarde um momento</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
